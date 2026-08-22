#!/usr/bin/env node
/**
 * Sends a personal SMS 1 hour before a KIA Seoul-away ticket sale (Jamsil / Gocheok).
 * Home games and non-Seoul away games never produce a reminder. Does not occupy seats or pay.
 * Requires GitHub secrets or a webhook. When no SMS channel delivers, the reminder
 * is filed as a GitHub issue instead.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOSTS = loadHosts();
const SOLAPI_BASE = 'https://api.solapi.com';
const GITHUB_API = 'https://api.github.com';
const SOLAPI_CONSOLE = 'https://console.solapi.com/api-keys';
export const ALERT_MARKER = 'sms-reminder:alert:solapi-access';

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

function loadHosts() {
  return JSON.parse(readFileSync(join(ROOT, 'client/src/data/hosts.json'), 'utf8'));
}

function isSeoulStadium(stadium) {
  return stadium === '고척스카이돔' || stadium.includes('잠실') || stadium.includes('서울종합운동장');
}

export function hostIdFor(game) {
  if (game.venue !== 'away') return null;
  if (game.host && HOSTS[game.host]) return game.host;
  if (game.stadium === '고척스카이돔' || game.opponentShort === '키움') return 'kiwoom';
  if (!isSeoulStadium(game.stadium)) return null;
  if (game.opponentShort === 'LG') return 'lg';
  if (game.opponentShort === '두산') return 'doosan';
  return null;
}

export function isSeoulAway(game) {
  return hostIdFor(game) !== null;
}

function hostFor(game) {
  const id = hostIdFor(game);
  return id ? HOSTS[id] : null;
}

function isTruthy(value) {
  return value === '1' || value === 'true';
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

function saleWindowsFor(game) {
  const host = hostFor(game);
  if (!host) return [];
  return host.policies.map((policy) => ({
    kind: policy.kind,
    label: policy.label,
    at: kstDateTime(shiftKstDate(game.date, -policy.daysBefore), policy.openClock),
    ticketUrl: game.reserveUrl || host.ticketUrl,
    appUrl: host.appUrl,
  }));
}

export function isSmsDue(saleAt, now, leadMs, intervalMs) {
  const remain = saleAt.getTime() - now.getTime();
  return remain > leadMs - intervalMs && remain <= leadMs;
}

/** GitHub variable SMS_REMINDER_ENABLED=false or sms.config.json enabled=false turns the scheduler off. FORCE=1 overrides. */
export function isSchedulerEnabled(config, env = process.env) {
  if (env.FORCE === '1' || env.FORCE === 'true') return true;
  if (String(env.SMS_REMINDER_ENABLED ?? '').toLowerCase() === 'false') return false;
  return config.enabled !== false;
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
    `[KIA] 서울 원정 ${item.label} 오픈 1시간 전`,
    `vs ${item.game.opponentShort} ${item.game.date} ${item.game.startTime} ${item.game.stadium}`,
    `오픈 ${formatOpen(item.at)}`,
    `공식 예매: ${item.ticketUrl}`,
    `앱: ${item.appUrl}`,
  ].join('\n');
}

export function dueSales(games, config, now) {
  const leadMs = (config.leadMinutes ?? 60) * 60 * 1000;
  const intervalMs = (config.cronIntervalMinutes ?? 60) * 60 * 1000;
  const kinds = new Set(config.kinds?.length ? config.kinds : ['general']);
  const watch = new Set(config.watchIds ?? []);
  const items = [];
  for (const game of games) {
    if (!isSeoulAway(game)) continue;
    if (watch.size > 0 && !watch.has(game.id)) continue;
    for (const window of saleWindowsFor(game)) {
      if (!kinds.has(window.kind)) continue;
      if (isSmsDue(window.at, now, leadMs, intervalMs)) {
        items.push({ game, ...window });
      }
    }
  }
  return items;
}

function parseBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/**
 * Splits provider rejections into "retrying can help" and "a human must change a setting".
 * Solapi answers an IP-allowlist block with 403 Forbidden, which is never worth retrying:
 * GitHub-hosted runners get a fresh Azure IP on every run, so no allowlist entry can match.
 */
export function classifySolapiError(status, body) {
  const parsed = parseBody(body);
  const code = parsed?.errorCode ?? '';
  const message = parsed?.errorMessage ?? String(body ?? '');
  const blockedIp = /IP\(([^)]+)\)/.exec(message)?.[1] ?? null;

  if (status === 403 && /IP/.test(message) && /허용/.test(message)) {
    return {
      kind: 'ip-not-allowed',
      code: code || 'Forbidden',
      retryable: false,
      blockedIp,
      title: '솔라피가 GitHub Actions 러너 IP를 차단했습니다',
      detail: `솔라피 API Key에 허용 IP가 지정되어 있어 러너 IP(${blockedIp ?? '확인 불가'})가 거부되었습니다. GitHub 호스팅 러너는 실행마다 IP가 바뀌므로 IP를 등록하는 방식으로는 해결되지 않습니다.`,
      actions: [
        `솔라피 콘솔 → API Key 관리(${SOLAPI_CONSOLE})에서 이 키의 허용 IP를 "모든 IP 허용"으로 바꿉니다.`,
        '허용 IP 제한을 유지하려면 고정 IP 서버에 문자 게이트를 두고 SMS_WEBHOOK_URL 시크릿으로 연결합니다.',
      ],
    };
  }
  if (code === 'RequestTimeTooSkewed' || code === 'DuplicatedSignature') {
    return {
      kind: 'transient',
      code,
      retryable: true,
      title: `솔라피 일시 오류 (${code})`,
      detail: `솔라피가 ${status} ${code}로 응답했습니다. 서명 시각/salt 문제로 재시도하면 대개 통과합니다.`,
      actions: [],
    };
  }
  if (status === 401 || status === 403) {
    return {
      kind: 'auth',
      code: code || String(status),
      retryable: false,
      title: '솔라피 인증이 거부되었습니다',
      detail: `솔라피가 ${status} ${code || 'Forbidden'}로 응답했습니다: ${message}`,
      actions: [
        'SOLAPI_API_KEY와 SOLAPI_API_SECRET 시크릿이 같은 키의 쌍인지 확인합니다.',
        '키가 만료·삭제되었으면 솔라피 콘솔에서 재발급한 뒤 시크릿을 갱신합니다.',
      ],
    };
  }
  if (status === 429 || status >= 500) {
    return {
      kind: 'transient',
      code: code || String(status),
      retryable: true,
      title: '솔라피 일시 오류',
      detail: `솔라피가 ${status}로 응답했습니다: ${message}`,
      actions: [],
    };
  }
  return {
    kind: 'rejected',
    code: code || String(status),
    retryable: false,
    title: '솔라피가 발송을 거부했습니다',
    detail: `솔라피가 ${status} ${code}로 응답했습니다: ${message}`,
    actions: [
      'SOLAPI_SENDER가 솔라피에 사전등록된 발신번호인지, SMS_TO 형식이 올바른지 확인합니다.',
      '잔액과 일일 발송 한도를 확인합니다.',
    ],
  };
}

export function classifyWebhookError(status, body) {
  const retryable = status === 429 || status >= 500;
  return {
    kind: retryable ? 'transient' : 'rejected',
    code: String(status),
    retryable,
    title: retryable ? '문자 웹훅 일시 오류' : '문자 웹훅이 요청을 거부했습니다',
    detail: `웹훅이 ${status}로 응답했습니다: ${String(body ?? '').slice(0, 300)}`,
    actions: retryable ? [] : ['SMS_WEBHOOK_URL 시크릿과 게이트 서버 로그를 확인합니다.'],
  };
}

export function classifyNetworkError(channel, err) {
  return {
    kind: 'network',
    code: err.code ?? 'NETWORK',
    retryable: true,
    title: `${channel} 연결 실패`,
    detail: `요청이 네트워크 오류로 끊겼습니다: ${err.message}`,
    actions: [],
  };
}

class SendError extends Error {
  constructor(info) {
    super(`${info.title}: ${info.detail}`);
    this.name = 'SendError';
    this.info = info;
  }
}

function retryDelays(env) {
  const base = Number(env.SMS_RETRY_DELAY_MS ?? 1000);
  return [base, base * 3];
}

function sleep(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

async function withRetry(env, log, channel, attempt) {
  const delays = retryDelays(env);
  for (let i = 0; ; i += 1) {
    let info;
    try {
      info = await attempt();
    } catch (err) {
      info = classifyNetworkError(channel, err);
    }
    if (!info) return;
    if (!info.retryable || i >= delays.length) throw new SendError(info);
    log(`${channel} 재시도 ${i + 1}/${delays.length}: ${info.detail}`);
    await sleep(delays[i]);
  }
}

function solapiAuthHeader(apiKey, apiSecret) {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString('hex');
  const signature = createHmac('sha256', apiSecret).update(date + salt).digest('hex');
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function sendWebhook(env, log, url, to, text, events) {
  await withRetry(env, log, 'webhook', async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to, text, events }),
    });
    if (res.ok) return null;
    return classifyWebhookError(res.status, await res.text());
  });
}

async function sendSolapi(env, log, to, from, text, apiKey, apiSecret) {
  const base = env.SOLAPI_BASE_URL || SOLAPI_BASE;
  await withRetry(env, log, 'solapi', async () => {
    const res = await fetch(`${base}/messages/v4/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: solapiAuthHeader(apiKey, apiSecret),
      },
      body: JSON.stringify({ message: { to, from, text } }),
    });
    if (res.ok) return null;
    return classifySolapiError(res.status, await res.text());
  });
}

/**
 * Probes Solapi before a reminder is due so an allowlist or credential problem shows up on an
 * idle hourly run instead of at the one minute that matters. Anything we cannot classify with
 * confidence stays inconclusive so a probe never invents an alert.
 */
async function checkSolapiAccess(env, apiKey, apiSecret) {
  const base = env.SOLAPI_BASE_URL || SOLAPI_BASE;
  try {
    const res = await fetch(`${base}/cash/v1/balance`, {
      headers: { Authorization: solapiAuthHeader(apiKey, apiSecret) },
    });
    if (res.ok) return { ok: true };
    const info = classifySolapiError(res.status, await res.text());
    if (info.kind === 'ip-not-allowed' || info.kind === 'auth') return { ok: false, info };
    return { ok: null };
  } catch {
    return { ok: null };
  }
}

export function issueMarker(item) {
  return `sms-reminder:reminder:${item.game.id}:${item.kind}`;
}

export function buildIssue({ title, marker, bodyLines }) {
  return { title, body: `${bodyLines.join('\n')}\n\n<!-- ${marker} -->\n` };
}

export function findIssueByMarker(issues, marker) {
  return issues.find((issue) => String(issue.body ?? '').includes(`<!-- ${marker} -->`)) ?? null;
}

async function githubRequest(env, path, init = {}) {
  const base = env.GITHUB_API_URL || GITHUB_API;
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`github ${init.method ?? 'GET'} ${path} ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? null : await res.json();
}

function canUseIssues(config, env) {
  if (config.issueFallback === false) return false;
  return Boolean(env.GITHUB_TOKEN && env.GITHUB_REPOSITORY);
}

async function listOpenIssues(env) {
  const issues = await githubRequest(env, `/repos/${env.GITHUB_REPOSITORY}/issues?state=open&per_page=100`);
  return (issues ?? []).filter((issue) => !issue.pull_request);
}

async function ensureIssue(env, { marker, title, bodyLines }) {
  const existing = findIssueByMarker(await listOpenIssues(env), marker);
  if (existing) return { action: 'exists', number: existing.number };
  const created = await githubRequest(env, `/repos/${env.GITHUB_REPOSITORY}/issues`, {
    method: 'POST',
    body: JSON.stringify(buildIssue({ title, marker, bodyLines })),
  });
  return { action: 'created', number: created.number };
}

async function closeIssueByMarker(env, marker, comment) {
  const existing = findIssueByMarker(await listOpenIssues(env), marker);
  if (!existing) return { action: 'none' };
  const path = `/repos/${env.GITHUB_REPOSITORY}/issues/${existing.number}`;
  await githubRequest(env, `${path}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: comment }),
  });
  await githubRequest(env, path, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
  return { action: 'closed', number: existing.number };
}

function annotation(level, title, message) {
  const oneLine = message.replace(/\n/g, ' ');
  return `::${level} title=${title}::${oneLine}`;
}

function writeSummary(env, lines) {
  if (!env.GITHUB_STEP_SUMMARY || lines.length === 0) return;
  appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

function failureLines(failures) {
  const lines = [];
  for (const failure of failures) {
    lines.push(`- **${failure.channel}**: ${failure.info.detail}`);
    for (const action of failure.info.actions ?? []) lines.push(`  - ${action}`);
  }
  return lines;
}

function reminderIssueBody(item, failures) {
  return [
    '문자가 전달되지 않아 대체 알림으로 남겼습니다.',
    '',
    `- 경기: vs ${item.game.opponentShort} ${item.game.date} ${item.game.startTime}`,
    `- 오픈: ${formatOpen(item.at)} (${item.label})`,
    `- 공식 예매: ${item.ticketUrl}`,
    `- 앱: ${item.appUrl}`,
    '',
    '#### 문자 실패 원인',
    ...failureLines(failures),
  ];
}

/**
 * One reminder pass. Returns the outcome instead of exiting so the self-test can drive it.
 * status: off | idle | dry-run | sent | fallback | failed
 */
export async function runReminder({ config, games, now, env, log = console.log }) {
  const dryRun = isTruthy(env.DRY_RUN);
  const enabled = isSchedulerEnabled(config, env);
  const summary = ['### 문자 알림'];
  const result = { status: 'idle', due: 0, delivered: [], failures: [], issues: [], alert: null };

  if (!enabled && !dryRun) {
    log('SMS scheduler off (sms.config.json enabled=false or SMS_REMINDER_ENABLED=false); skip');
    return { ...result, status: 'off' };
  }

  const due = dueSales(games, config, now);
  result.due = due.length;

  const to = env.SMS_TO;
  const webhook = env.SMS_WEBHOOK_URL;
  const solapiKey = env.SOLAPI_API_KEY;
  const solapiSecret = env.SOLAPI_API_SECRET;
  const solapiFrom = env.SOLAPI_SENDER;
  const hasSolapi = Boolean(solapiKey && solapiSecret && solapiFrom && to);
  const useIssues = canUseIssues(config, env);

  let access = { ok: null };
  if (hasSolapi && !dryRun) {
    access = await checkSolapiAccess(env, solapiKey, solapiSecret);
    if (access.ok === false) {
      log(annotation('warning', access.info.title, access.info.detail));
      for (const action of access.info.actions) log(`해결: ${action}`);
      if (useIssues) {
        try {
          result.alert = await ensureIssue(env, {
            marker: ALERT_MARKER,
            title: `[문자] ${access.info.title}`,
            bodyLines: [
              access.info.detail,
              '',
              '#### 해결 방법',
              ...access.info.actions.map((action) => `- ${action}`),
              '',
              '이 문제가 풀리면 다음 실행에서 자동으로 닫힙니다.',
            ],
          });
          log(`솔라피 차단 알림 이슈 #${result.alert.number} (${result.alert.action})`);
        } catch (err) {
          log(`알림 이슈 생성 실패: ${err.message}`);
        }
      }
    } else if (access.ok === true && useIssues) {
      try {
        const closed = await closeIssueByMarker(env, ALERT_MARKER, '솔라피 발송 경로가 정상으로 확인되어 닫습니다.');
        if (closed.action === 'closed') log(`솔라피 차단 알림 이슈 #${closed.number} 닫음`);
      } catch (err) {
        log(`알림 이슈 정리 실패: ${err.message}`);
      }
    }
  }

  if (due.length === 0) {
    log(`no SMS due at ${now.toISOString()}`);
    summary.push(`발송 대상 없음 (${now.toISOString()})`);
    if (access.ok === false) summary.push('', `> ${access.info.title} — ${access.info.detail}`);
    writeSummary(env, summary);
    return result;
  }

  const text = due.map(buildMessage).join('\n\n');
  const events = due.map((item) => ({
    gameId: item.game.id,
    kind: item.kind,
    openAt: item.at.toISOString(),
  }));
  log(`due ${due.length} reminder(s):\n${text}`);
  summary.push(
    `발송 대상 ${due.length}건`,
    '',
    ...due.map(
      (item) => `- ${item.label} · vs ${item.game.opponentShort} ${item.game.date} · 오픈 ${formatOpen(item.at)}`,
    ),
  );

  if (dryRun || !enabled) {
    log(dryRun ? 'dry-run: not sending' : 'scheduler off: not sending');
    summary.push('', dryRun ? '드라이런이라 발송하지 않았습니다.' : '스케줄러가 꺼져 있어 발송하지 않았습니다.');
    writeSummary(env, summary);
    return { ...result, status: 'dry-run' };
  }

  if (webhook) {
    try {
      await sendWebhook(env, log, webhook, to ?? '', text, events);
      result.delivered.push('webhook');
      log('webhook sent');
    } catch (err) {
      result.failures.push({ channel: 'webhook', info: err.info });
      log(annotation('warning', err.info.title, err.info.detail));
    }
  }
  if (hasSolapi) {
    if (access.ok === false) {
      result.failures.push({ channel: 'solapi', info: access.info });
      log('solapi 사전 점검이 실패해 발송을 건너뜁니다');
    } else {
      try {
        await sendSolapi(env, log, to, solapiFrom, text, solapiKey, solapiSecret);
        result.delivered.push('solapi');
        log('solapi sent');
      } catch (err) {
        result.failures.push({ channel: 'solapi', info: err.info });
        log(annotation('warning', err.info.title, err.info.detail));
      }
    }
  }
  if (!webhook && !hasSolapi) {
    result.failures.push({
      channel: 'none',
      info: {
        kind: 'not-configured',
        retryable: false,
        title: '문자 발송 수단이 설정되지 않았습니다',
        detail: 'SMS_WEBHOOK_URL 또는 SOLAPI_* / SMS_TO 시크릿이 없어 문자를 보낼 수 없습니다.',
        actions: ['저장소 Settings → Secrets에 문자 발송 시크릿을 등록합니다.'],
      },
    });
    log('no SMS provider secrets; skip send');
  }

  if (result.delivered.length > 0) {
    summary.push('', `발송 완료: ${result.delivered.join(', ')}`);
    if (result.failures.length > 0) summary.push('', '#### 실패한 채널', ...failureLines(result.failures));
    writeSummary(env, summary);
    return { ...result, status: 'sent' };
  }

  summary.push('', '#### 문자 발송 실패', ...failureLines(result.failures));

  if (!useIssues) {
    log(annotation('error', '문자 알림 전달 실패', result.failures.map((f) => f.info.detail).join(' / ')));
    summary.push('', '대체 알림(GitHub 이슈)을 쓸 수 없어 이번 알림은 전달되지 않았습니다.');
    writeSummary(env, summary);
    return { ...result, status: 'failed' };
  }

  let fallbackFailed = false;
  for (const item of due) {
    try {
      const issue = await ensureIssue(env, {
        marker: issueMarker(item),
        title: `[KIA] ${item.label} 오픈 1시간 전 · vs ${item.game.opponentShort} ${item.game.date}`,
        bodyLines: reminderIssueBody(item, result.failures),
      });
      result.issues.push(issue);
      log(`대체 알림 이슈 #${issue.number} (${issue.action})`);
    } catch (err) {
      fallbackFailed = true;
      log(`대체 알림 이슈 생성 실패: ${err.message}`);
    }
  }

  if (fallbackFailed) {
    log(annotation('error', '문자 알림 전달 실패', '문자와 대체 알림이 모두 실패했습니다.'));
    summary.push('', '대체 알림(GitHub 이슈)까지 실패했습니다.');
    writeSummary(env, summary);
    return { ...result, status: 'failed' };
  }

  log(annotation('warning', '문자 대신 GitHub 이슈로 알렸습니다', result.failures.map((f) => f.info.title).join(' / ')));
  summary.push('', `대체 알림으로 이슈 ${result.issues.map((issue) => `#${issue.number}`).join(', ')} 를 남겼습니다.`);
  writeSummary(env, summary);
  return { ...result, status: 'fallback' };
}

function assert(condition, message) {
  if (!condition) throw new Error(`self-test failed: ${message}`);
}

export function runSelfTest() {
  const games = loadJson('client/src/data/games.json');
  const config = {
    enabled: true,
    kinds: ['general'],
    watchIds: [],
    leadMinutes: 60,
    cronIntervalMinutes: 60,
  };
  const now = kstDateTime('2026-08-16', '13:05');
  const due = dueSales(games, config, now);
  if (due.length !== 1 || due[0].game.id !== '2026-08-23-kiwoom') {
    throw new Error(`self-test failed: ${JSON.stringify(due.map((d) => d.game.id))}`);
  }
  const laterInHour = dueSales(games, config, kstDateTime('2026-08-16', '13:45'));
  if (laterInHour.length !== 1 || laterInHour[0].game.id !== '2026-08-23-kiwoom') {
    throw new Error('self-test failed: hourly window should still match at :45');
  }
  const tooEarly = dueSales(games, config, kstDateTime('2026-08-16', '12:50'));
  if (tooEarly.length !== 0) {
    throw new Error('self-test failed: expected no SMS before the 1-hour window');
  }
  const homeGameHour = dueSales(games, config, kstDateTime('2026-08-22', '10:05'));
  if (homeGameHour.length !== 0) {
    throw new Error('self-test failed: home games must not produce Seoul-away SMS');
  }
  const changwonHour = dueSales(games, config, kstDateTime('2026-08-25', '13:05'));
  if (changwonHour.length !== 0) {
    throw new Error('self-test failed: non-Seoul away games must not produce SMS');
  }
  if (isSchedulerEnabled({ enabled: false }, {}) !== false) {
    throw new Error('self-test failed: enabled=false should turn the scheduler off');
  }
  if (isSchedulerEnabled({ enabled: true }, { SMS_REMINDER_ENABLED: 'false' }) !== false) {
    throw new Error('self-test failed: SMS_REMINDER_ENABLED=false should turn the scheduler off');
  }
  if (isSchedulerEnabled({ enabled: false }, { FORCE: '1' }) !== true) {
    throw new Error('self-test failed: FORCE=1 should override a disabled scheduler');
  }

  const ipBlock = classifySolapiError(
    403,
    '{"errorCode":"Forbidden","errorMessage":"허용되지 않은 IP(20.118.29.116)로 접근하고 있습니다."}',
  );
  assert(ipBlock.kind === 'ip-not-allowed', 'allowlist rejection should be classified as ip-not-allowed');
  assert(ipBlock.retryable === false, 'allowlist rejection must not be retried');
  assert(ipBlock.blockedIp === '20.118.29.116', 'allowlist rejection should expose the blocked IP');
  assert(
    classifySolapiError(403, '{"errorCode":"InvalidAPIKey","errorMessage":"invalid"}').kind === 'auth',
    'InvalidAPIKey should be classified as auth',
  );
  assert(
    classifySolapiError(503, 'gateway down').retryable === true,
    '5xx should be retryable',
  );
  assert(
    classifySolapiError(403, '{"errorCode":"RequestTimeTooSkewed","errorMessage":"skew"}').retryable === true,
    'clock skew should be retryable',
  );
  assert(
    findIssueByMarker([{ number: 3, body: 'x\n<!-- sms-reminder:alert:solapi-access -->' }], ALERT_MARKER)?.number === 3,
    'marker lookup should find the matching issue',
  );
  assert(findIssueByMarker([{ number: 3, body: 'x' }], ALERT_MARKER) === null, 'marker lookup should not match unrelated issues');

  const workflow = readFileSync(join(ROOT, '.github/workflows/sms-reminder.yml'), 'utf8');
  assert(/issues:\s*write/.test(workflow), 'sms-reminder.yml must grant issues: write for the fallback');
  assert(workflow.includes('GITHUB_TOKEN'), 'sms-reminder.yml must pass GITHUB_TOKEN to the reminder step');

  console.log('sms-reminder self-test ok');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
    return 0;
  }

  const config = loadJson('sms.config.json');
  const games = loadJson('client/src/data/games.json');
  const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
  const result = await runReminder({ config, games, now, env: process.env });
  return result.status === 'failed' ? 1 : 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
