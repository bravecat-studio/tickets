#!/usr/bin/env node
/**
 * Drives scripts/sms-reminder.mjs against a stub Solapi + GitHub API so the send, retry and
 * fallback paths can be exercised offline. Reproduces the Solapi allowlist rejection that made
 * the scheduled run fail (403 Forbidden, "허용되지 않은 IP(...)로 접근하고 있습니다").
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALERT_MARKER, runReminder } from './sms-reminder.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKED_IP = '20.118.29.116';
const GAMES = JSON.parse(readFileSync(join(ROOT, 'client/src/data/games.fixture.json'), 'utf8'));
const CONFIG = { enabled: true, kinds: ['general'], leadMinutes: 60, cronIntervalMinutes: 60 };

function kst(date, hhmm) {
  return new Date(`${date}T${hhmm}:00+09:00`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`sms-reminder.test failed: ${message}`);
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function startStubServer(state) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const body = await readJsonBody(req);
    const reply = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (url.pathname === '/cash/v1/balance') {
      state.probes += 1;
      if (state.solapiBlocked) {
        reply(403, {
          errorCode: 'Forbidden',
          errorMessage: `허용되지 않은 IP(${BLOCKED_IP})로 접근하고 있습니다.`,
        });
      } else {
        reply(200, { balance: 1000, point: 0 });
      }
      return;
    }
    if (url.pathname === '/messages/v4/send') {
      state.sent.push(body);
      if (state.sendFailuresLeft > 0) {
        state.sendFailuresLeft -= 1;
        reply(500, { errorCode: 'InternalError', errorMessage: 'temporary' });
      } else {
        reply(200, { statusCode: '2000' });
      }
      return;
    }
    if (url.pathname.endsWith('/issues') && req.method === 'GET') {
      reply(200, state.issues.filter((issue) => issue.state === 'open'));
      return;
    }
    if (url.pathname.endsWith('/issues') && req.method === 'POST') {
      const issue = { number: state.issues.length + 1, state: 'open', ...body };
      state.issues.push(issue);
      reply(201, issue);
      return;
    }
    if (url.pathname.endsWith('/comments') && req.method === 'POST') {
      state.comments.push(body.body);
      reply(201, { id: state.comments.length });
      return;
    }
    if (req.method === 'PATCH') {
      const issue = state.issues.find((candidate) => candidate.number === Number(url.pathname.split('/').pop()));
      if (issue) issue.state = body.state ?? issue.state;
      reply(200, issue ?? {});
      return;
    }
    reply(404, { message: `unexpected ${req.method} ${url.pathname}` });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const state = { issues: [], sent: [], comments: [], probes: 0, solapiBlocked: true, sendFailuresLeft: 0 };
  const { server, port } = await startStubServer(state);
  const summaryPath = join(mkdtempSync(join(tmpdir(), 'sms-reminder-')), 'summary.md');
  const env = {
    SMS_TO: '01000000000',
    SOLAPI_API_KEY: 'key',
    SOLAPI_API_SECRET: 'secret',
    SOLAPI_SENDER: '01000000000',
    SOLAPI_BASE_URL: `http://127.0.0.1:${port}`,
    GITHUB_API_URL: `http://127.0.0.1:${port}`,
    GITHUB_REPOSITORY: 'bravecat-studio/tickets',
    GITHUB_TOKEN: 'token',
    GITHUB_STEP_SUMMARY: summaryPath,
    SMS_RETRY_DELAY_MS: '0',
  };
  const now = kst('2026-08-16', '13:29');

  try {
    const logs = [];
    const blocked = await runReminder({ config: CONFIG, games: GAMES, now, env, log: (line) => logs.push(line) });
    assert(blocked.due === 1, `blocked run should find 1 due reminder, got ${blocked.due}`);
    assert(blocked.status === 'fallback', `blocked run should fall back, got ${blocked.status}`);
    assert(state.sent.length === 0, 'a blocked key must not attempt a send');
    assert(
      blocked.failures[0].info.kind === 'ip-not-allowed' && blocked.failures[0].info.blockedIp === BLOCKED_IP,
      'blocked run should report the rejected runner IP',
    );
    assert(state.issues.length === 2, `blocked run should file an alert and a reminder issue, got ${state.issues.length}`);
    assert(
      logs.some((line) => line.startsWith('::warning') && line.includes('러너 IP')),
      'blocked run should annotate the allowlist cause',
    );
    const summary = readFileSync(summaryPath, 'utf8');
    assert(summary.includes('대체 알림으로 이슈'), 'summary should record the fallback issue');
    assert(summary.includes('모든 IP 허용'), 'summary should spell out the console fix');

    const repeat = await runReminder({ config: CONFIG, games: GAMES, now, env, log: () => {} });
    assert(repeat.status === 'fallback', `repeat run should stay in fallback, got ${repeat.status}`);
    assert(state.issues.length === 2, 'repeat run must reuse the open issues instead of duplicating them');
    assert(
      repeat.issues[0].action === 'exists' && repeat.alert.action === 'exists',
      'repeat run should match the existing issues by marker',
    );

    state.solapiBlocked = false;
    state.sendFailuresLeft = 1;
    const recovered = await runReminder({ config: CONFIG, games: GAMES, now, env, log: () => {} });
    assert(recovered.status === 'sent', `recovered run should send, got ${recovered.status}`);
    assert(state.sent.length === 2, `a transient 500 should be retried once, got ${state.sent.length} attempts`);
    assert(
      state.sent[1].message.text.includes('일반예매 오픈 1시간 전'),
      'the sent body should carry the reminder text',
    );
    assert(
      state.issues.find((issue) => issue.body.includes(ALERT_MARKER)).state === 'closed',
      'a healthy probe should close the alert issue',
    );

    const idle = await runReminder({ config: CONFIG, games: GAMES, now: kst('2026-08-16', '12:50'), env, log: () => {} });
    assert(idle.status === 'idle' && idle.due === 0, 'a run outside the window should stay idle');

    const probesBeforeEmpty = state.probes;
    const empty = await runReminder({
      config: CONFIG,
      games: GAMES.filter((game) => !game.host),
      now,
      env,
      log: () => {},
    });
    assert(empty.status === 'no-remaining' && empty.due === 0, 'no remaining Seoul-away games should stop the scheduler');
    assert(state.probes === probesBeforeEmpty, 'no remaining Seoul-away games must not probe Solapi');

    const noFallback = { ...CONFIG, issueFallback: false };
    state.solapiBlocked = true;
    const bare = await runReminder({ config: noFallback, games: GAMES, now, env, log: () => {} });
    assert(bare.status === 'failed', `without a fallback the run should fail, got ${bare.status}`);
    assert(state.issues.length === 2, 'issueFallback=false must not open issues');

    const unreachable = await runReminder({
      config: CONFIG,
      games: GAMES,
      now,
      env: { ...env, SOLAPI_BASE_URL: 'http://127.0.0.1:9' },
      log: () => {},
    });
    assert(unreachable.status === 'fallback', `an unreachable provider should fall back, got ${unreachable.status}`);
    assert(
      unreachable.failures[0].info.kind === 'network',
      `an unreachable provider should be reported as a network failure, got ${unreachable.failures[0].info.kind}`,
    );

    const dry = await runReminder({
      config: CONFIG,
      games: GAMES,
      now,
      env: { ...env, DRY_RUN: '1' },
      log: () => {},
    });
    assert(dry.status === 'dry-run', `dry run should not send, got ${dry.status}`);

    console.log('sms-reminder integration test ok');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
