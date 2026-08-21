#!/usr/bin/env node
/**
 * Sends a personal SMS 1 hour before a KIA home-game ticket sale.
 * Does not occupy seats or pay. Requires GitHub secrets or a webhook.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TICKETLINK = 'https://www.ticketlink.co.kr/sports/137/58';
const POLICIES = [
  { kind: 'season', label: '선선예매', daysBefore: 8, clock: '10:00' },
  { kind: 'early', label: '선예매', daysBefore: 8, clock: '10:30' },
  { kind: 'general', label: '일반예매', daysBefore: 7, clock: '11:00' },
];

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

function kstDateTime(date, hhmm) {
  return new Date(`${date}T${hhmm}:00+09:00`);
}

function shiftKstDate(date, days) {
  const noon = kstDateTime(date, '12:00');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(noon.getTime() + days * 86_400_000));
}

function saleWindowsFor(gameDate) {
  return POLICIES.map((policy) => ({
    ...policy,
    at: kstDateTime(shiftKstDate(gameDate, -policy.daysBefore), policy.clock),
  }));
}

function isSmsDue(saleAt, now, leadMs, intervalMs) {
  const remain = saleAt.getTime() - now.getTime();
  return remain > leadMs - intervalMs && remain <= leadMs;
}

function formatOpen(at) {
  return at.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function buildMessage(item) {
  return [
    `[KIA] ${item.label} 오픈 1시간 전`,
    `vs ${item.game.opponentShort} ${item.game.date} ${item.game.startTime}`,
    `오픈 ${formatOpen(item.at)}`,
    `공식 예매: ${TICKETLINK}`,
  ].join('\n');
}

function dueSales(games, config, now) {
  const leadMs = (config.leadMinutes ?? 60) * 60 * 1000;
  const intervalMs = 10 * 60 * 1000;
  const kinds = new Set(config.kinds?.length ? config.kinds : ['general']);
  const watch = new Set(config.watchIds ?? []);
  const items = [];
  for (const game of games) {
    if (game.venue !== 'home') continue;
    if (watch.size > 0 && !watch.has(game.id)) continue;
    for (const window of saleWindowsFor(game.date)) {
      if (!kinds.has(window.kind)) continue;
      if (isSmsDue(window.at, now, leadMs, intervalMs)) {
        items.push({ game, ...window });
      }
    }
  }
  return items;
}

async function sendWebhook(url, to, text, events) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, text, events }),
  });
  if (!res.ok) {
    throw new Error(`webhook ${res.status}: ${await res.text()}`);
  }
}

async function sendSolapi(to, from, text, apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString('hex');
  const signature = createHmac('sha256', apiSecret).update(date + salt).digest('hex');
  const res = await fetch('https://api.solapi.com/messages/v4/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({ message: { to, from, text } }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`solapi ${res.status}: ${body}`);
  }
}

export function runSelfTest() {
  const games = loadJson('client/src/data/games.json');
  const config = { enabled: true, kinds: ['general'], watchIds: [], leadMinutes: 60 };
  const now = kstDateTime('2026-08-22', '10:05');
  const due = dueSales(games, config, now);
  if (due.length !== 1 || due[0].game.id !== '2026-08-29-ssg') {
    throw new Error(`self-test failed: ${JSON.stringify(due.map((d) => d.game.id))}`);
  }
  const tooEarly = dueSales(games, config, kstDateTime('2026-08-22', '09:50'));
  if (tooEarly.length !== 0) {
    throw new Error('self-test failed: expected no SMS before the 1-hour window');
  }
  console.log('sms-reminder self-test ok');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
    return;
  }

  const config = loadJson('sms.config.json');
  const games = loadJson('client/src/data/games.json');
  const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
  const dryRun =
    process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true' || !config.enabled;

  if (!config.enabled && process.env.FORCE !== '1') {
    console.log('sms.config.json enabled=false; skip');
    return;
  }

  const due = dueSales(games, config, now);
  if (due.length === 0) {
    console.log(`no SMS due at ${now.toISOString()}`);
    return;
  }

  const text = due.map(buildMessage).join('\n\n');
  const events = due.map((item) => ({
    gameId: item.game.id,
    kind: item.kind,
    openAt: item.at.toISOString(),
  }));
  console.log(`due ${due.length} reminder(s):\n${text}`);

  if (dryRun) {
    console.log('dry-run: not sending');
    return;
  }

  const to = process.env.SMS_TO;
  const webhook = process.env.SMS_WEBHOOK_URL;
  const solapiKey = process.env.SOLAPI_API_KEY;
  const solapiSecret = process.env.SOLAPI_API_SECRET;
  const solapiFrom = process.env.SOLAPI_SENDER;
  const hasSolapi = Boolean(solapiKey && solapiSecret && solapiFrom && to);
  if (!webhook && !hasSolapi) {
    console.log('no SMS provider secrets; skip send');
    return;
  }
  if (webhook) {
    await sendWebhook(webhook, to ?? '', text, events);
    console.log('webhook sent');
  }
  if (hasSolapi) {
    await sendSolapi(to, solapiFrom, text, solapiKey, solapiSecret);
    console.log('solapi sent');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
