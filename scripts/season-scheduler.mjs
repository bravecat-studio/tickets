#!/usr/bin/env node
/**
 * Start/stop every scheduled GitHub Actions workflow with the KBO season.
 *
 * - Season end: no remaining KIA games and
 *   - KIA is out of the postseason (schedule-meta.json `postseason.kia` is `out`:
 *     eliminated in the standings built from Naver results, or five other clubs fill the bracket)
 *     → ends right away, or
 *   - KIA's postseason run is over (it appeared in the bracket): no remaining
 *     KIA games for END_GRACE_DAYS (rainouts, gaps between rounds), or
 *   - KIA has not appeared in the bracket yet (`unknown`, or clinched but its
 *     first series is not listed — a top seed waits ~3 weeks for the Korean
 *     Series): wait for the league's last game, then END_GRACE_DAYS.
 *   → season.json `ended`,
 *   `sms-reminder` and `update-schedule` are disabled. Only `season-scheduler`
 *   stays enabled, and its cron fires on a few fixed dates only.
 * - Off-season: no schedule lookups. Two keepalive runs (11/15, 1/10) re-enable
 *   the watcher so GitHub's 60-day inactivity rule cannot disable it.
 * - Season start: from 3/1 (KBO publishes the schedule mid-Dec–early Jan and
 *   opens late March) the watcher syncs the schedule; once KIA games are listed
 *   season.json becomes `active`, the season workflows are re-enabled and the
 *   watcher disables itself.
 *
 * Manual `end` holds until a later season's schedule is published; manual
 * `start` re-enables the schedules now (auto end still applies once no games remain).
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SEASON_PATH = join(ROOT, 'client/src/data/season.json');
const GAMES_PATH = join(ROOT, 'client/src/data/games.json');
const META_PATH = join(ROOT, 'client/src/data/schedule-meta.json');
const GITHUB_API = 'https://api.github.com';

/** Workflows that run only during the season. */
export const SEASON_WORKFLOWS = ['sms-reminder.yml', 'update-schedule.yml'];
/** Off-season watcher that restarts the season workflows. */
export const WATCH_WORKFLOW = 'season-scheduler.yml';
/** season-scheduler.yml crons: daily from 3/1 until the season starts, plus off-season keepalives. */
export const START_CRON = '50 0 * 3,4 *';
export const KEEPALIVE_CRONS = ['50 0 15 11 *', '50 0 10 1 *'];
/** Days without any remaining KIA game before the season is declared over. */
export const END_GRACE_DAYS = 7;

export function daysBetween(fromYmd, toYmd) {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000);
}

export function kstYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function remainingKiaDates(games, today) {
  return games
    .map((game) => game.date)
    .filter((date) => date >= today)
    .sort();
}

/**
 * Reconcile season state with the remaining KIA schedule.
 * Returns the next state and an action label; `state` is never mutated.
 */
export function decideSeason(state, { remainingDates, today, leagueLastDate = null, postseason = null, now = new Date() }) {
  const nextYear = remainingDates.length > 0 ? Number(remainingDates[0].slice(0, 4)) : null;
  const stamp = now.toISOString();

  if (nextYear !== null) {
    if (state.status === 'active' && state.noGamesSince) {
      const next = { ...state, updatedAt: stamp };
      delete next.noGamesSince;
      return { state: next, action: 'end-cancelled' };
    }
    if (state.status === 'active') return { state, action: 'unchanged' };
    if (state.manual === true && nextYear <= state.season) {
      return { state, action: 'keep-manual-end' };
    }
    return {
      state: { status: 'active', season: nextYear, manual: false, updatedAt: stamp },
      action: 'auto-start',
    };
  }

  if (state.status === 'ended') return { state, action: 'already-ended' };
  const season = state.season ?? Number(today.slice(0, 4));
  const kiaEntry = postseason?.kia ?? 'unknown';
  if (kiaEntry === 'out') {
    return {
      state: { status: 'ended', season, manual: false, reason: 'no-postseason', updatedAt: stamp },
      action: 'auto-end-no-postseason',
    };
  }
  if (!postseason?.listed && leagueLastDate && leagueLastDate >= today) {
    // Postseason still running: KIA may yet be drawn in (e.g. a top seed waits ~3 weeks for the Korean Series).
    if (!state.noGamesSince) return { state, action: 'postseason-wait' };
    const next = { ...state, updatedAt: stamp };
    delete next.noGamesSince;
    return { state: next, action: 'postseason-wait' };
  }
  if (!state.noGamesSince) {
    return { state: { ...state, noGamesSince: today, updatedAt: stamp }, action: 'end-pending' };
  }
  if (daysBetween(state.noGamesSince, today) < END_GRACE_DAYS) return { state, action: 'end-pending' };
  return {
    state: { status: 'ended', season, manual: false, reason: 'season-over', updatedAt: stamp },
    action: 'auto-end',
  };
}

export function applyManualSeason(state, action, { today, now = new Date() }) {
  const stamp = now.toISOString();
  if (action === 'start') {
    return { status: 'active', season: Number(today.slice(0, 4)), manual: false, updatedAt: stamp };
  }
  if (action === 'end') {
    return { status: 'ended', season: state.season ?? Number(today.slice(0, 4)), manual: true, reason: 'manual', updatedAt: stamp };
  }
  throw new Error(`invalid season action: ${action}`);
}

/** Which workflows should be enabled for a season status. */
export function workflowPlan(status) {
  const active = status !== 'ended';
  return [
    ...SEASON_WORKFLOWS.map((file) => ({ file, enable: active })),
    { file: WATCH_WORKFLOW, enable: !active },
  ];
}

export function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function loadJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function isDryRun(env = process.env) {
  return env.DRY_RUN === '1' || env.DRY_RUN === 'true';
}

function writeGithubOutput(fields, env = process.env) {
  if (!env.GITHUB_OUTPUT) return;
  appendFileSync(env.GITHUB_OUTPUT, `${Object.entries(fields).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
}

function nowFrom(env = process.env) {
  return env.NOW ? new Date(env.NOW) : new Date();
}

async function setWorkflowEnabled(env, file, enable) {
  const base = env.GITHUB_API_URL || GITHUB_API;
  const res = await fetch(
    `${base}/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${file}/${enable ? 'enable' : 'disable'}`,
    {
      method: 'PUT',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'x-github-api-version': '2022-11-28',
      },
    },
  );
  if (!res.ok) {
    throw new Error(`github ${enable ? 'enable' : 'disable'} ${file} ${res.status}: ${await res.text()}`);
  }
}

/**
 * Enable/disable workflows for the current season.json. Idempotent, so every
 * run re-applies it; re-enabling the watcher also keeps its cron from being
 * auto-disabled after 60 days without repository activity.
 */
export async function applyWorkflows({ env = process.env, log = console.log } = {}) {
  const state = loadJson(SEASON_PATH, { status: 'active' });
  const plan = workflowPlan(state.status);
  if (isDryRun(env) || !env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) {
    for (const step of plan) log(`skip ${step.enable ? 'enable' : 'disable'} ${step.file} (dry-run or no GITHUB_TOKEN)`);
    return plan;
  }
  for (const step of plan) {
    await setWorkflowEnabled(env, step.file, step.enable);
    log(`${step.enable ? 'enabled' : 'disabled'} ${step.file}`);
  }
  return plan;
}

/** Writes season.json when it changed; `written` is false on dry-run. */
function saveState(prev, next, env) {
  const changed = formatJson(prev) !== formatJson(next);
  const written = changed && !isDryRun(env);
  if (written) writeFileSync(SEASON_PATH, formatJson(next));
  return { changed, written };
}

function changeNote({ changed }, env) {
  return [changed ? '' : ', unchanged', isDryRun(env) ? ', dry-run' : ''].join('');
}

function autoSeason(env = process.env) {
  const now = nowFrom(env);
  const today = kstYmd(now);
  const state = loadJson(SEASON_PATH, { status: 'active' });
  const games = loadJson(GAMES_PATH, []);
  const meta = loadJson(META_PATH, {});
  const remainingDates = remainingKiaDates(games, today);
  const result = decideSeason(state, {
    remainingDates,
    today,
    leagueLastDate: meta.leagueLastDate ?? null,
    postseason: meta.postseason ?? null,
    now,
  });
  const saved = saveState(state, result.state, env);
  console.log(
    `season ${result.action} (status=${result.state.status}, season=${result.state.season}, remainingKia=${remainingDates.length}, kiaPostseason=${meta.postseason?.kia ?? 'unknown'}${changeNote(saved, env)})`,
  );
  writeGithubOutput(
    { action: result.action, changed: String(saved.written), status: result.state.status, remaining: String(remainingDates.length) },
    env,
  );
}

function manualSeason(action, env = process.env) {
  const now = nowFrom(env);
  const state = loadJson(SEASON_PATH, { status: 'active' });
  const next = applyManualSeason(state, action, { today: kstYmd(now), now });
  const saved = saveState({ ...state, updatedAt: next.updatedAt }, next, env);
  console.log(`season manual ${action} (status=${next.status}, season=${next.season}${changeNote(saved, env)})`);
  writeGithubOutput({ action: `manual-${action}`, changed: String(saved.written), status: next.status }, env);
}

export function runSelfTest() {
  const assert = (ok, message) => {
    if (!ok) throw new Error(`season-scheduler self-test failed: ${message}`);
  };
  const now = new Date('2026-10-20T01:00:00Z');
  const active = { status: 'active', season: 2026, manual: false };

  const keep = decideSeason(active, { remainingDates: ['2026-10-21'], today: '2026-10-20', now });
  assert(keep.action === 'unchanged' && keep.state === active, 'active season with games stays active');

  const waitKs = decideSeason(active, { remainingDates: [], today: '2026-10-05', leagueLastDate: '2026-10-31', now });
  assert(waitKs.action === 'postseason-wait' && waitKs.state === active, 'season stays on while the league postseason runs');
  const waitClears = decideSeason(
    { ...active, noGamesSince: '2026-10-01' },
    { remainingDates: [], today: '2026-10-05', leagueLastDate: '2026-10-31', now },
  );
  assert(waitClears.state.noGamesSince === undefined, 'listed postseason games reset the end grace period');
  const out = decideSeason(
    { ...active, noGamesSince: '2026-10-04' },
    { remainingDates: [], today: '2026-10-05', leagueLastDate: '2026-10-31', postseason: { kia: 'out' }, now },
  );
  assert(out.action === 'auto-end-no-postseason' && out.state.status === 'ended', 'missing the postseason ends the season right away');
  assert(out.state.reason === 'no-postseason' && out.state.noGamesSince === undefined, 'early end records why');
  const stillPlaying = decideSeason(active, {
    remainingDates: ['2026-10-30'],
    today: '2026-10-05',
    postseason: { kia: 'out' },
    now,
  });
  assert(stillPlaying.action === 'unchanged', 'remaining KIA games always keep the season on');
  const knockedOut = decideSeason(active, {
    remainingDates: [],
    today: '2026-10-12',
    leagueLastDate: '2026-10-31',
    postseason: { kia: 'in', listed: true },
    now,
  });
  const clinched = decideSeason(active, {
    remainingDates: [],
    today: '2026-10-05',
    leagueLastDate: '2026-10-08',
    postseason: { kia: 'in', listed: false },
    now,
  });
  assert(clinched.action === 'postseason-wait', 'a clinched top seed waits for its series to be listed');
  assert(knockedOut.action === 'end-pending', 'after KIA is knocked out the grace period runs without waiting for the Korean Series');
  const pending = decideSeason(active, { remainingDates: [], today: '2026-10-20', leagueLastDate: '2026-10-19', now });
  assert(pending.action === 'end-pending' && pending.state.status === 'active', 'first empty day only starts the grace period');
  assert(pending.state.noGamesSince === '2026-10-20', 'grace period start is recorded');
  const waiting = decideSeason(pending.state, { remainingDates: [], today: '2026-10-26', now });
  assert(waiting.action === 'end-pending' && waiting.state === pending.state, 'season stays active inside the grace period');
  const makeup = decideSeason(pending.state, { remainingDates: ['2026-10-23'], today: '2026-10-21', now });
  assert(makeup.action === 'end-cancelled' && makeup.state.noGamesSince === undefined, 'a makeup game cancels the pending end');
  const end = decideSeason(pending.state, { remainingDates: [], today: '2026-10-27', now });
  assert(end.action === 'auto-end' && end.state.status === 'ended', `no remaining KIA games for ${END_GRACE_DAYS} days ends the season`);
  assert(end.state.season === 2026 && end.state.manual === false, 'auto end keeps the season year');
  assert(end.state.reason === 'season-over', 'normal end records season-over');
  assert(end.state.noGamesSince === undefined, 'ended state drops the grace marker');

  const again = decideSeason(end.state, { remainingDates: [], today: '2026-12-01', now });
  assert(again.action === 'already-ended' && again.state === end.state, 'repeated off-season check is a no-op');

  const start = decideSeason(end.state, { remainingDates: ['2027-03-28', '2027-03-29'], today: '2027-02-10', now });
  assert(start.action === 'auto-start' && start.state.status === 'active', 'published next season starts the schedules');
  assert(start.state.season === 2027, 'auto start moves to the new season year');

  const manualEnd = applyManualSeason(active, 'end', { today: '2026-09-01', now });
  assert(manualEnd.status === 'ended' && manualEnd.manual === true, 'manual end is flagged');
  const held = decideSeason(manualEnd, { remainingDates: ['2026-09-02'], today: '2026-09-01', now });
  assert(held.action === 'keep-manual-end', 'manual end is not undone by this season games');
  const nextSeason = decideSeason(manualEnd, { remainingDates: ['2027-03-28'], today: '2027-02-10', now });
  assert(nextSeason.action === 'auto-start', 'manual end still auto-starts the next season');

  const manualStart = applyManualSeason(manualEnd, 'start', { today: '2026-09-01', now });
  assert(manualStart.status === 'active' && manualStart.manual === false, 'manual start re-activates');

  let threw = false;
  try {
    applyManualSeason(active, 'pause', { today: '2026-09-01', now });
  } catch {
    threw = true;
  }
  assert(threw, 'invalid manual action throws');

  const onPlan = workflowPlan('active');
  assert(
    onPlan.every((step) => (step.file === WATCH_WORKFLOW ? !step.enable : step.enable)),
    'active season enables sms-reminder/update-schedule and disables the watcher',
  );
  const offPlan = workflowPlan('ended');
  assert(
    offPlan.every((step) => (step.file === WATCH_WORKFLOW ? step.enable : !step.enable)),
    'ended season disables sms-reminder/update-schedule and enables the watcher',
  );
  assert(
    remainingKiaDates([{ date: '2026-10-01' }, { date: '2026-09-30' }, { date: '2026-10-03' }], '2026-10-01').join(',') ===
      '2026-10-01,2026-10-03',
    'remaining dates include today and are sorted',
  );

  const watcher = readFileSync(join(ROOT, '.github/workflows', WATCH_WORKFLOW), 'utf8');
  const crons = [...watcher.matchAll(/cron: '([^']+)'/g)].map((m) => m[1]);
  assert(
    crons.join(' | ') === `${START_CRON} | ${KEEPALIVE_CRONS.join(' | ')}`,
    `${WATCH_WORKFLOW} must only fire in the season-start window and on keepalive dates, got ${crons.join(' | ')}`,
  );
  for (const cron of KEEPALIVE_CRONS) {
    assert(watcher.includes(`github.event.schedule == '${cron}'`), `${WATCH_WORKFLOW} must route ${cron} to keepalive`);
  }
  assert(watcher.includes('actions: write'), `${WATCH_WORKFLOW} needs actions: write to toggle workflows`);
  assert(watcher.includes('--apply-workflows'), `${WATCH_WORKFLOW} must apply the workflow plan`);
  assert(watcher.includes('SYNC_ALLOW_EMPTY'), `${WATCH_WORKFLOW} must tolerate an unpublished next-season schedule`);
  assert(watcher.includes("- 'start'"), `${WATCH_WORKFLOW} offers manual start`);
  const update = readFileSync(join(ROOT, '.github/workflows/update-schedule.yml'), 'utf8');
  assert(update.includes('actions: write'), 'update-schedule needs actions: write to end the season');
  assert(update.includes('season-scheduler.mjs --auto'), 'update-schedule must detect the season end');
  assert(update.includes("- 'end'"), 'update-schedule offers manual season end');
  assert(update.includes('client/src/data/season.json'), 'update-schedule must commit season.json');
  console.log('season-scheduler self-test ok');
}

async function main() {
  const action = process.argv[2];
  if (action === '--self-test') return runSelfTest();
  if (action === '--auto') return autoSeason();
  if (action === '--apply-workflows') return applyWorkflows();
  if (action === '--status') {
    const state = loadJson(SEASON_PATH, { status: 'active' });
    console.log(`season ${state.status} (season=${state.season}${state.manual ? ', manual' : ''})`);
    return;
  }
  return manualSeason(action);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
