#!/usr/bin/env node
/**
 * Persist SMS scheduler on/off into sms.config.json.
 * Used by the sms-reminder GitHub Actions workflow_dispatch input.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_PATH = join(ROOT, 'sms.config.json');

export function normalizeSchedulerAction(action) {
  if (action === 'on' || action === 'true') return 'on';
  if (action === 'off' || action === 'false') return 'off';
  throw new Error(`invalid scheduler action: ${action}`);
}

export function applySchedulerState(config, action) {
  const normalized = normalizeSchedulerAction(action);
  return { ...config, enabled: normalized === 'on' };
}

export function formatConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
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
  let threw = false;
  try {
    applySchedulerState({}, 'run');
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error('self-test failed: expected invalid action to throw');
  }
  const workflow = readFileSync(join(ROOT, '.github/workflows/sms-reminder.yml'), 'utf8');
  if (!workflow.includes("- 'on'") && !workflow.includes('- "on"')) {
    throw new Error('self-test failed: sms-reminder.yml must quote on/off so YAML does not coerce them to booleans');
  }
  if (!workflow.includes("- 'off'") && !workflow.includes('- "off"')) {
    throw new Error('self-test failed: sms-reminder.yml must quote on/off so YAML does not coerce them to booleans');
  }
  console.log('sms-scheduler-toggle self-test ok');
}

function main() {
  const action = process.argv[2];
  if (action === '--self-test') {
    runSelfTest();
    return;
  }
  if (action === '--status') {
    const config = loadConfig();
    const enabled = config.enabled !== false;
    console.log(`SMS scheduler ${enabled ? 'on' : 'off'} (enabled=${enabled})`);
    return;
  }
  const config = loadConfig();
  const next = applySchedulerState(config, action);
  writeFileSync(CONFIG_PATH, formatConfig(next));
  const normalized = normalizeSchedulerAction(action);
  const changed = config.enabled !== next.enabled;
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
