#!/usr/bin/env node
/**
 * Start/stop the GitHub Actions schedules with the KBO season.
 *
 * - Season end: no remaining KIA games → season.json `ended`, `sms-reminder` and
 *   `update-schedule` are disabled and `season-scheduler` watches for next season.
 * - Season start: the watcher finds remaining KIA games again → season.json
 *   `active`, the two schedules are re-enabled and the watcher disables itself.
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
const GITHUB_API = 'https://api.github.com';

/** Workflows that run only during the season. */
export const SEASON_WORKFLOWS = ['sms-reminder.yml', 'update-schedule.yml'];
/** Off-season watcher that restarts the season workflows. */
export const WATCH_WORKFLOW = 'season-scheduler.yml';

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
export function decideSeason(state, { remainingDates, today, now = new Date() }) {
  const nextYear = remainingDates.length > 0 ? Number(remainingDates[0].slice(0, 4)) : null;
  const stamp = now.toISOString();

  if (nextYear !== null) {
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
  return {
    state: { status: 'ended', season: state.season ?? Number(today.slice(0, 4)), manual: false, updatedAt: stamp },
    action: 'auto-end',
  };
}

export function applyManualSeason(state, action, { today, now = new Date() }) {
  const stamp = now.toISOString();
  if (action === 'start') {
    return { status: 'active', season: Number(today.slice(0, 4)), manual: false, updatedAt: stamp };
  }
  if (action === 'end') {
    return { status: 'ended', season: state.season ?? Number(today.slice(0, 4)), manual: true, updatedAt: stamp };
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
  const remainingDates = remainingKiaDates(games, today);
  const result = decideSeason(state, { remainingDates, today, now });
  const saved = saveState(state, result.state, env);
  console.log(
    `season ${result.action} (status=${result.state.status}, season=${result.state.season}, remainingKia=${remainingDates.length}${changeNote(saved, env)})`,
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

  const end = decideSeason(active, { remainingDates: [], today: '2026-10-20', now });
  assert(end.action === 'auto-end' && end.state.status === 'ended', 'no remaining KIA games ends the season');
  assert(end.state.season === 2026 && end.state.manual === false, 'auto end keeps the season year');

  const again = decideSeason(end.state, { remainingDates: [], today: '2026-12-01', now });
  assert(again.action === 'already-ended' && again.state === end.state, 'repeated off-season check is a no-op');

  const postseason = decideSeason(end.state, { remainingDates: ['2026-10-28'], today: '2026-10-25', now });
  assert(postseason.action === 'auto-start' && postseason.state.season === 2026, 'postseason games restart the season');

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
  assert(watcher.includes('actions: write'), `${WATCH_WORKFLOW} needs actions: write to toggle workflows`);
  assert(watcher.includes('--apply-workflows'), `${WATCH_WORKFLOW} must apply the workflow plan`);
  assert(watcher.includes('SYNC_ALLOW_EMPTY'), `${WATCH_WORKFLOW} must tolerate an unpublished next-season schedule`);
  assert(watcher.includes("- 'start'") && watcher.includes("- 'end'"), `${WATCH_WORKFLOW} offers manual start/end`);
  const update = readFileSync(join(ROOT, '.github/workflows/update-schedule.yml'), 'utf8');
  assert(update.includes('actions: write'), 'update-schedule needs actions: write to end the season');
  assert(update.includes('season-scheduler.mjs --auto'), 'update-schedule must detect the season end');
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
