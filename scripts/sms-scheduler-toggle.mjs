#!/usr/bin/env node
/**
 * Persist SMS scheduler on/off into sms.config.json.
 * Used by the sms-reminder GitHub Actions workflow_dispatch input.
 * `--auto-remaining` turns the scheduler off when no Seoul-away games remain,
 * and back on only if this script auto-disabled it (manual off stays off).
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { kstYmd, remainingSeoulAway } from './sms-reminder.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'sms.config.json');
const GAMES_PATH = join(ROOT, 'client/src/data/games.json');

export function normalizeSchedulerAction(action) {
  if (action === 'on' || action === 'true') return 'on';
  if (action === 'off' || action === 'false') return 'off';
  throw new Error(`invalid scheduler action: ${action}`);
}

export function applySchedulerState(config, action) {
  const normalized = normalizeSchedulerAction(action);
  const next = { ...config, enabled: normalized === 'on' };
  delete next.autoDisabled;
  return next;
}

/**
 * Reconcile scheduler enabled with remaining Seoul-away games.
 * Manual off (enabled=false without autoDisabled) is never overridden.
 */
export function applyRemainingGamesScheduler(config, remainingCount) {
  const remaining = remainingCount > 0;
  const autoDisabled = config.autoDisabled === true;

  if (!remaining) {
    if (config.enabled === false && autoDisabled) {
      return { config, action: 'already-off', remainingCount };
    }
    if (config.enabled === false) {
      return { config, action: 'keep-manual-off', remainingCount };
    }
    return {
      config: { ...config, enabled: false, autoDisabled: true },
      action: 'auto-off',
      remainingCount,
    };
  }

  if (autoDisabled) {
    const next = { ...config, enabled: true };
    delete next.autoDisabled;
    return { config: next, action: 'auto-on', remainingCount };
  }
  return { config, action: 'unchanged', remainingCount };
}

export function formatConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function isDryRun(env = process.env) {
  return env.DRY_RUN === '1' || env.DRY_RUN === 'true';
}

function writeGithubOutput(fields, env = process.env) {
  if (!env.GITHUB_OUTPUT) return;
  appendFileSync(env.GITHUB_OUTPUT, `${Object.entries(fields).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);
}

function logReconcile(result, changed, dryRun) {
  const enabled = result.config.enabled !== false;
  const extra = [changed ? '' : ', unchanged', dryRun ? ', dry-run' : ''].join('');
  console.log(
    `SMS scheduler ${result.action} (enabled=${enabled}, remainingSeoulAway=${result.remainingCount}${extra})`,
  );
}

export function runSelfTest() {
  const off = applySchedulerState({ enabled: true, kinds: ['general'] }, 'off');
  if (off.enabled !== false || off.kinds[0] !== 'general') {
    throw new Error('self-test failed: off should set enabled=false and keep other fields');
  }
  const on = applySchedulerState(off, 'on');
  if (on.enabled !== true) {
    throw new Error('self-test failed: on should set enabled=true');
  }
  if (applySchedulerState(on, 'false').enabled !== false) {
    throw new Error('self-test failed: false should alias to off');
  }
  if (applySchedulerState(off, 'true').enabled !== true) {
    throw new Error('self-test failed: true should alias to on');
  }
  const cleared = applySchedulerState({ enabled: false, autoDisabled: true, kinds: ['general'] }, 'off');
  if (cleared.autoDisabled !== undefined || cleared.enabled !== false) {
    throw new Error('self-test failed: manual off should clear autoDisabled');
  }
  let threw = false;
  try {
    applySchedulerState({}, 'run');
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error('self-test failed: expected invalid action to throw');
  }

  const base = { enabled: true, kinds: ['general'] };
  const autoOff = applyRemainingGamesScheduler(base, 0);
  if (autoOff.action !== 'auto-off' || autoOff.config.enabled !== false || autoOff.config.autoDisabled !== true) {
    throw new Error('self-test failed: zero remaining Seoul-away games should auto-off the scheduler');
  }
  const already = applyRemainingGamesScheduler(autoOff.config, 0);
  if (already.action !== 'already-off' || already.config !== autoOff.config) {
    throw new Error('self-test failed: repeated auto-off should be a no-op');
  }
  const resumed = applyRemainingGamesScheduler(autoOff.config, 1);
  if (resumed.action !== 'auto-on' || resumed.config.enabled !== true || resumed.config.autoDisabled !== undefined) {
    throw new Error('self-test failed: remaining Seoul-away games should auto-on after auto-off');
  }
  const manualOff = applyRemainingGamesScheduler({ enabled: false, kinds: ['general'] }, 0);
  if (manualOff.action !== 'keep-manual-off' || manualOff.config.autoDisabled === true) {
    throw new Error('self-test failed: manual off must not be tagged autoDisabled');
  }
  const stayOff = applyRemainingGamesScheduler({ enabled: false, kinds: ['general'] }, 2);
  if (stayOff.action !== 'unchanged' || stayOff.config.enabled !== false) {
    throw new Error('self-test failed: manual off must stay off when games return');
  }
  const keepOn = applyRemainingGamesScheduler(base, 3);
  if (keepOn.action !== 'unchanged' || keepOn.config.enabled !== true) {
    throw new Error('self-test failed: scheduler should stay on while Seoul-away games remain');
  }

  const workflow = readFileSync(join(ROOT, '.github/workflows/sms-reminder.yml'), 'utf8');
  if (!workflow.includes("- 'on'") && !workflow.includes('- "on"')) {
    throw new Error('self-test failed: sms-reminder.yml must quote on/off so YAML does not coerce them to booleans');
  }
  if (!workflow.includes("- 'off'") && !workflow.includes('- "off"')) {
    throw new Error('self-test failed: sms-reminder.yml must quote on/off so YAML does not coerce them to booleans');
  }
  if (!workflow.includes('--auto-remaining')) {
    throw new Error('self-test failed: sms-reminder.yml must auto-stop the scheduler when no Seoul-away games remain');
  }
  const scheduleWorkflow = readFileSync(join(ROOT, '.github/workflows/update-schedule.yml'), 'utf8');
  if (!scheduleWorkflow.includes('--auto-remaining')) {
    throw new Error('self-test failed: update-schedule.yml must auto-stop the scheduler when no Seoul-away games remain');
  }
  console.log('sms-scheduler-toggle self-test ok');
}

function autoRemaining() {
  const config = loadConfig();
  const games = JSON.parse(readFileSync(GAMES_PATH, 'utf8'));
  const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
  const remaining = remainingSeoulAway(games, kstYmd(now));
  const result = applyRemainingGamesScheduler(config, remaining.length);
  const changed = JSON.stringify(result.config) !== JSON.stringify(config);
  const dryRun = isDryRun();
  if (changed && !dryRun) {
    writeFileSync(CONFIG_PATH, formatConfig(result.config));
  }
  logReconcile(result, changed, dryRun);
  writeGithubOutput({
    action: result.action,
    changed: changed && !dryRun ? 'true' : 'false',
    remaining: String(remaining.length),
    enabled: String(result.config.enabled !== false),
  });
}

function main() {
  const action = process.argv[2];
  if (action === '--self-test') {
    runSelfTest();
    return;
  }
  if (action === '--auto-remaining') {
    autoRemaining();
    return;
  }
  if (action === '--status') {
    const config = loadConfig();
    const enabled = config.enabled !== false;
    const games = JSON.parse(readFileSync(GAMES_PATH, 'utf8'));
    const remaining = remainingSeoulAway(games, kstYmd());
    console.log(
      `SMS scheduler ${enabled ? 'on' : 'off'} (enabled=${enabled}, remainingSeoulAway=${remaining.length}${config.autoDisabled ? ', autoDisabled' : ''})`,
    );
    return;
  }
  const config = loadConfig();
  const next = applySchedulerState(config, action);
  writeFileSync(CONFIG_PATH, formatConfig(next));
  const normalized = normalizeSchedulerAction(action);
  const changed = JSON.stringify(next) !== JSON.stringify(config);
  console.log(`SMS scheduler ${normalized} (enabled=${next.enabled}${changed ? '' : ', unchanged'})`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
