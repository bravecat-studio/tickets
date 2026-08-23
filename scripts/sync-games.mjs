#!/usr/bin/env node
/**
 * Sync remaining KIA games into client/src/data/games.json from Naver Sports (KBO).
 * Cancelled games are omitted so makeup dates appear when KBO lists them.
 * Seoul-away TBD rows and a sync timestamp are written beside the schedule.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const GAMES_PATH = join(ROOT, 'client/src/data/games.json');
export const TBD_PATH = join(ROOT, 'client/src/data/tbd.json');
export const META_PATH = join(ROOT, 'client/src/data/schedule-meta.json');

export const NAVER_SCHEDULE_URL = 'https://api-gw.sports.naver.com/schedule/games';
export const SOURCE_LABEL = '네이버 스포츠 (KBO)';
const KIA = 'HT';
const UA = 'tickets-schedule-sync/1.0 (+https://github.com/bravecat-studio/tickets)';

export const TEAMS = {
  HT: { slug: 'kia', name: 'KIA 타이거즈', short: 'KIA' },
  LG: { slug: 'lg', name: 'LG 트윈스', short: 'LG', host: 'lg' },
  OB: { slug: 'doosan', name: '두산 베어스', short: '두산', host: 'doosan' },
  WO: { slug: 'kiwoom', name: '키움 히어로즈', short: '키움', host: 'kiwoom' },
  LT: { slug: 'lotte', name: '롯데 자이언츠', short: '롯데' },
  SK: { slug: 'ssg', name: 'SSG 랜더스', short: 'SSG' },
  NC: { slug: 'nc', name: 'NC 다이노스', short: 'NC' },
  KT: { slug: 'kt', name: 'kt wiz', short: 'KT' },
  SS: { slug: 'samsung', name: '삼성 라이온즈', short: '삼성' },
  HH: { slug: 'hanwha', name: '한화 이글스', short: '한화' },
};

export const SEOUL_HOSTS = [
  { code: 'LG', opponent: 'LG 트윈스', stadium: '잠실야구장' },
  { code: 'OB', opponent: '두산 베어스', stadium: '잠실야구장' },
  { code: 'WO', opponent: '키움 히어로즈', stadium: '고척스카이돔' },
];

export const STADIUMS = {
  고척: '고척스카이돔',
  잠실: '잠실야구장',
  광주: '광주-기아 챔피언스필드',
  창원: '창원NC파크',
  마산: '창원NC파크',
  대전: '대전한화생명볼파크',
  수원: '수원KT위즈파크',
  사직: '사직야구장',
  대구: '대구삼성라이온즈파크',
  문학: '인천SSG랜더스필드',
  울산: '울산문수야구장',
  포항: '포항야구장',
  청주: '청주야구장',
  '이천(두산)': '이천두산베어스파크',
};

const SEOUL_STADIUMS = new Set(['고척스카이돔', '잠실야구장', '서울종합운동장 야구장']);

export function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function kstYmd(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function kstYear(date = new Date()) {
  return Number(kstYmd(date).slice(0, 4));
}

export function addDays(ymd, days) {
  const noon = new Date(`${ymd}T12:00:00+09:00`);
  return kstYmd(new Date(noon.getTime() + days * 86_400_000));
}

export function monthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = addDays(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`, -1);
  return { fromDate: start, toDate: end };
}

export function monthsBetween(fromYmd, toYmd) {
  const months = [];
  let year = Number(fromYmd.slice(0, 4));
  let month = Number(fromYmd.slice(5, 7));
  const endYear = Number(toYmd.slice(0, 4));
  const endMonth = Number(toYmd.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(monthRange(year, month));
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function seasonWindow(now = new Date()) {
  const year = kstYear(now);
  return { fromDate: `${year}-03-01`, toDate: `${year}-11-30` };
}

export function expandStadium(name) {
  if (!name) return '';
  return STADIUMS[name] || name;
}

export function isSeoulStadium(stadium) {
  return SEOUL_STADIUMS.has(stadium) || stadium.includes('잠실') || stadium.includes('고척');
}

export function startTimeFrom(gameDateTime, timeTbd) {
  if (timeTbd || !gameDateTime) return '';
  const match = String(gameDateTime).match(/T(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

export function isKiaGame(raw) {
  return raw.homeTeamCode === KIA || raw.awayTeamCode === KIA;
}

export function isCancelled(raw) {
  return raw.cancel === true || raw.statusInfo === '경기취소';
}

export function isExhibition(raw) {
  return raw.roundCode === 'kbo_e';
}

export function opponentOf(raw) {
  const code = raw.homeTeamCode === KIA ? raw.awayTeamCode : raw.homeTeamCode;
  const team = TEAMS[code];
  if (team) return { code, ...team };
  const name = raw.homeTeamCode === KIA ? raw.awayTeamName : raw.homeTeamName;
  return { code, slug: String(code || name || 'opp').toLowerCase(), name: name || code, short: name || code };
}

export function mapNaverGame(raw) {
  const opponent = opponentOf(raw);
  const venue = raw.homeTeamCode === KIA ? 'home' : 'away';
  const stadium = expandStadium(raw.stadium);
  const game = {
    id: `${raw.gameDate}-${opponent.slug}`,
    date: raw.gameDate,
    startTime: startTimeFrom(raw.gameDateTime, raw.timeTbd),
    opponent: opponent.name,
    opponentShort: opponent.short,
    opponentSlug: opponent.slug,
    venue,
    stadium,
    series: '',
  };
  if (raw.timeTbd) game.note = '시작 시각 미정';
  if (venue === 'away' && opponent.host && isSeoulStadium(stadium)) game.host = opponent.host;
  return game;
}

function dayGap(a, b) {
  const ms = new Date(`${b}T12:00:00+09:00`) - new Date(`${a}T12:00:00+09:00`);
  return Math.round(ms / 86_400_000);
}

export function assignSeries(games) {
  const labeled = games.map((game) => ({ ...game }));
  let i = 0;
  while (i < labeled.length) {
    let j = i + 1;
    while (
      j < labeled.length &&
      labeled[j].opponentShort === labeled[i].opponentShort &&
      labeled[j].venue === labeled[i].venue &&
      labeled[j].stadium === labeled[i].stadium &&
      dayGap(labeled[j - 1].date, labeled[j].date) <= 2
    ) {
      j += 1;
    }
    const count = j - i;
    const seoulAway = labeled[i].venue === 'away' && isSeoulStadium(labeled[i].stadium);
    const prefix = seoulAway ? '서울 원정' : labeled[i].venue === 'home' ? '홈' : '원정';
    const series = count > 1 ? `${prefix} ${count}연전` : seoulAway ? '서울 원정 · 재편성' : prefix;
    for (let k = i; k < j; k += 1) labeled[k].series = series;
    i = j;
  }
  return labeled;
}

export function assignIds(games) {
  const seen = new Map();
  return games.map((game) => {
    const slug =
      game.opponentSlug ||
      Object.values(TEAMS).find((team) => team.short === game.opponentShort)?.slug ||
      game.opponentShort.toLowerCase();
    const idBase = `${game.date}-${slug}`;
    const n = (seen.get(idBase) || 0) + 1;
    seen.set(idBase, n);
    return { ...game, id: n === 1 ? idBase : `${idBase}-${n}` };
  });
}

export function mergePrevious(nextGames, previousGames = []) {
  const prev = new Map(previousGames.map((game) => [game.id, game]));
  return nextGames.map((game) => {
    const old = prev.get(game.id);
    if (!old) return game;
    const merged = { ...game };
    if (!merged.startTime && old.startTime) merged.startTime = old.startTime;
    if (old.reserveUrl && !merged.reserveUrl) merged.reserveUrl = old.reserveUrl;
    if (!merged.note && old.note) merged.note = old.note;
    return merged;
  });
}

function formatMd(ymd) {
  const [, month, day] = ymd.split('-');
  return `${Number(month)}/${Number(day)}`;
}

function formatSpan(dates) {
  if (dates.length === 0) return '';
  if (dates.length === 1) return formatMd(dates[0]);
  return `${formatMd(dates[0])}–${formatMd(dates[dates.length - 1])}`;
}

export function isSeoulAwayGame(game) {
  return game.venue === 'away' && isSeoulStadium(game.stadium) && Boolean(game.host);
}

export function buildTbd(allMapped, remaining, today) {
  return SEOUL_HOSTS.flatMap((host) => {
    const remainingHere = remaining.filter((game) => game.host === TEAMS[host.code].host && isSeoulAwayGame(game));
    if (remainingHere.length > 0) return [];
    const related = allMapped.filter((game) => game.host === TEAMS[host.code].host && isSeoulAwayGame(game));
    const cancelled = related.filter((game) => game.cancelled && game.date >= addDays(today, -90));
    const played = related.filter((game) => !game.cancelled && game.date < today);
    let reason;
    if (cancelled.length > 0) {
      reason = `우천 취소 ${formatSpan(cancelled.map((game) => game.date))}. 재편성되면 예매 오픈·알람 대상`;
    } else if (played.length > 0) {
      const last = played.slice(-3);
      reason = `정규 원정은 ${formatSpan(last.map((game) => game.date))}로 종료. 재편성 시만 대상`;
    } else {
      reason = '잔여 원정 없음. 재편성 시만 대상';
    }
    return [{ opponent: host.opponent, stadium: host.stadium, reason }];
  });
}

export function toStoredGame(game) {
  const stored = {
    id: game.id,
    date: game.date,
    startTime: game.startTime || '18:30',
    opponent: game.opponent,
    opponentShort: game.opponentShort,
    venue: game.venue,
    stadium: game.stadium,
    series: game.series,
  };
  if (game.note) stored.note = game.note;
  if (game.reserveUrl) stored.reserveUrl = game.reserveUrl;
  if (game.host) stored.host = game.host;
  return stored;
}

export function buildSchedule(rawGames, { today, previous = [] } = {}) {
  const kia = rawGames.filter(isKiaGame);
  const mapped = kia
    .filter((raw) => !isExhibition(raw))
    .map((raw) => ({ ...mapNaverGame(raw), cancelled: isCancelled(raw) }))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const active = assignSeries(assignIds(mapped.filter((game) => !game.cancelled)));
  const remaining = active.filter((game) => game.date >= today);
  const merged = mergePrevious(remaining, previous).map(toStoredGame);
  const tbd = buildTbd(mapped, remaining, today);
  return { games: merged, tbd, kiaCount: kia.length };
}

export function naverUrl(fromDate, toDate, size = 500) {
  const params = new URLSearchParams({
    fields: 'basic,schedule,baseball',
    upperCategoryId: 'kbaseball',
    categoryId: 'kbo',
    fromDate,
    toDate,
    size: String(size),
  });
  return `${NAVER_SCHEDULE_URL}?${params}`;
}

export async function fetchJson(url, { fetchImpl = fetch, timeoutMs = 20_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`schedule fetch ${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMonth(fromDate, toDate, opts = {}) {
  const size = opts.size ?? 500;
  const data = await fetchJson(naverUrl(fromDate, toDate, size), opts);
  const games = data?.result?.games;
  if (!Array.isArray(games)) throw new Error(`unexpected schedule payload for ${fromDate}`);
  const total = data.result.gameTotalCount ?? games.length;
  if (total > games.length && fromDate !== toDate) {
    const mid = addDays(fromDate, Math.floor(dayGap(fromDate, toDate) / 2));
    const leftTo = mid;
    const rightFrom = addDays(mid, 1);
    const [left, right] = await Promise.all([
      fetchMonth(fromDate, leftTo, opts),
      fetchMonth(rightFrom, toDate, opts),
    ]);
    return [...left, ...right];
  }
  return games;
}

export async function fetchSeason(fromDate, toDate, opts = {}) {
  const chunks = [];
  for (const month of monthsBetween(fromDate, toDate)) {
    chunks.push(await fetchMonth(month.fromDate, month.toDate, opts));
  }
  const byId = new Map();
  for (const game of chunks.flat()) {
    if (game?.gameId) byId.set(game.gameId, game);
    else byId.set(`${game.gameDate}-${game.homeTeamCode}-${game.awayTeamCode}-${game.gameDateTime}`, game);
  }
  return [...byId.values()];
}

function loadJson(path, fallback = []) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeSchedule({ games, tbd, meta, dryRun = false }) {
  const files = {
    [GAMES_PATH]: formatJson(games),
    [TBD_PATH]: formatJson(tbd),
    [META_PATH]: formatJson(meta),
  };
  if (!dryRun) {
    for (const [path, body] of Object.entries(files)) writeFileSync(path, body);
  }
  return files;
}

export async function syncGames({ now = new Date(), dryRun = false, fetchImpl, previous } = {}) {
  const today = kstYmd(now);
  const window = seasonWindow(now);
  const raw = await fetchSeason(window.fromDate, window.toDate, { fetchImpl });
  const prev = previous ?? loadJson(GAMES_PATH);
  const prevTbd = loadJson(TBD_PATH);
  const { games, tbd, kiaCount } = buildSchedule(raw, { today, previous: prev });
  if (kiaCount === 0) {
    throw new Error('네이버 스포츠에서 KIA 일정을 하나도 받지 못했습니다. games.json을 덮어쓰지 않습니다.');
  }
  const unchanged = formatJson(games) === formatJson(prev) && formatJson(tbd) === formatJson(prevTbd);
  const meta = unchanged
    ? loadJson(META_PATH, {})
    : {
        source: NAVER_SCHEDULE_URL,
        sourceLabel: SOURCE_LABEL,
        updatedAt: now.toISOString(),
        fromDate: today,
        toDate: window.toDate,
        gameCount: games.length,
        tbdCount: tbd.length,
      };
  if (!unchanged) writeSchedule({ games, tbd, meta, dryRun });
  return { games, tbd, meta, kiaCount, today, window, unchanged };
}

export function runSelfTest() {
  const today = '2026-08-22';
  const raw = [
    {
      gameId: 'ex',
      gameDate: '2026-03-21',
      gameDateTime: '2026-03-21T14:00:00',
      stadium: '잠실',
      homeTeamCode: 'OB',
      awayTeamCode: 'HT',
      roundCode: 'kbo_e',
      cancel: false,
    },
    {
      gameId: 'lg-rain',
      gameDate: '2026-08-07',
      gameDateTime: '2026-08-07T18:30:00',
      stadium: '잠실',
      homeTeamCode: 'LG',
      awayTeamCode: 'HT',
      roundCode: 'kbo_r',
      cancel: true,
      statusInfo: '경기취소',
    },
    {
      gameId: 'doosan-last',
      gameDate: '2026-06-28',
      gameDateTime: '2026-06-28T17:00:00',
      stadium: '잠실',
      homeTeamCode: 'OB',
      awayTeamCode: 'HT',
      roundCode: 'kbo_r',
      cancel: false,
    },
    {
      gameId: 'kiwoom-1',
      gameDate: '2026-08-21',
      gameDateTime: '2026-08-21T19:00:00',
      stadium: '고척',
      homeTeamCode: 'WO',
      awayTeamCode: 'HT',
      roundCode: 'kbo_r',
      cancel: false,
    },
    {
      gameId: 'kiwoom-2',
      gameDate: '2026-08-22',
      gameDateTime: '2026-08-22T18:00:00',
      stadium: '고척',
      homeTeamCode: 'WO',
      awayTeamCode: 'HT',
      roundCode: 'kbo_r',
      cancel: false,
    },
    {
      gameId: 'kiwoom-3',
      gameDate: '2026-08-23',
      gameDateTime: '2026-08-23T14:00:00',
      stadium: '고척',
      homeTeamCode: 'WO',
      awayTeamCode: 'HT',
      roundCode: 'kbo_r',
      cancel: false,
    },
    {
      gameId: 'lotte-home',
      gameDate: '2026-08-25',
      gameDateTime: '2026-08-25T18:30:00',
      stadium: '광주',
      homeTeamCode: 'HT',
      awayTeamCode: 'LT',
      roundCode: 'kbo_r',
      cancel: false,
    },
    {
      gameId: 'nc-away',
      gameDate: '2026-09-01',
      gameDateTime: '2026-09-01T18:30:00',
      stadium: '창원',
      homeTeamCode: 'NC',
      awayTeamCode: 'HT',
      roundCode: 'kbo_r',
      cancel: false,
    },
    {
      gameId: 'kt-sun',
      gameDate: '2026-09-06',
      gameDateTime: '2026-09-06T17:00:00',
      stadium: '광주',
      homeTeamCode: 'HT',
      awayTeamCode: 'KT',
      roundCode: 'kbo_r',
      cancel: false,
    },
  ];
  const { games, tbd, kiaCount } = buildSchedule(raw, {
    today,
    previous: [{ id: '2026-08-25-lotte', date: '2026-08-25', note: 'keep-me', reserveUrl: 'https://example.test' }],
  });
  const byId = Object.fromEntries(games.map((game) => [game.id, game]));
  const assert = (ok, message) => {
    if (!ok) throw new Error(`self-test failed: ${message}`);
  };
  assert(kiaCount === raw.length, 'all fixture rows are KIA games');
  assert(!games.some((game) => game.id.includes('lg')), 'cancelled games are omitted');
  assert(!games.some((game) => game.date === '2026-03-21'), 'exhibition games are omitted');
  assert(!games.some((game) => game.date === '2026-08-21'), 'past remaining cutoff is today');
  assert(byId['2026-08-22-kiwoom']?.host === 'kiwoom', 'Gocheok away gets kiwoom host');
  assert(byId['2026-08-22-kiwoom']?.series === '서울 원정 3연전', 'series label keeps the full Gocheok set even after 8/21 drops');
  assert(byId['2026-08-23-kiwoom']?.startTime === '14:00', 'Sunday Gocheok keeps 14:00');
  assert(byId['2026-08-25-lotte']?.venue === 'home', 'Gwangju is home');
  assert(byId['2026-08-25-lotte']?.note === 'keep-me', 'previous note is preserved');
  assert(byId['2026-08-25-lotte']?.reserveUrl === 'https://example.test', 'previous reserveUrl is preserved');
  assert(byId['2026-09-01-nc']?.stadium === '창원NC파크', 'Changwon stadium is expanded');
  assert(byId['2026-09-01-nc']?.host === undefined, 'non-Seoul away has no host');
  assert(byId['2026-09-06-kt']?.startTime === '17:00', 'live start time wins over stale 14:00');
  assert(
    tbd.some((row) => row.opponent.startsWith('LG') && row.reason.includes('8/7')),
    'LG TBD mentions the rained-out Jamsil series',
  );
  assert(
    tbd.some((row) => row.opponent.startsWith('두산') && row.reason.includes('6/28')),
    'Doosan TBD mentions the last Jamsil series',
  );
  assert(!tbd.some((row) => row.opponent.startsWith('키움')), 'Kiwoom is omitted from TBD while remaining games exist');

  const makeup = buildSchedule(
    [
      {
        gameId: 'lg-makeup',
        gameDate: '2026-09-14',
        gameDateTime: '2026-09-14T18:30:00',
        stadium: '잠실',
        homeTeamCode: 'LG',
        awayTeamCode: 'HT',
        roundCode: 'kbo_r',
        cancel: false,
      },
    ],
    { today: '2026-09-01' },
  );
  assert(makeup.games[0].id === '2026-09-14-lg', 'makeup keeps date-slug id');
  assert(makeup.games[0].series === '서울 원정 · 재편성', 'an isolated Jamsil game is labeled as a makeup');
  assert(makeup.games[0].host === 'lg', 'Jamsil LG away gets lg host');
  assert(!makeup.tbd.some((row) => row.opponent.startsWith('LG')), 'LG TBD drops once a makeup is listed');

  const doubleheader = buildSchedule(
    [
      {
        gameId: 'dh-late',
        gameDate: '2026-09-14',
        gameDateTime: '2026-09-14T18:00:00',
        stadium: '잠실',
        homeTeamCode: 'LG',
        awayTeamCode: 'HT',
        roundCode: 'kbo_r',
        cancel: false,
      },
      {
        gameId: 'dh-early',
        gameDate: '2026-09-14',
        gameDateTime: '2026-09-14T14:00:00',
        stadium: '잠실',
        homeTeamCode: 'LG',
        awayTeamCode: 'HT',
        roundCode: 'kbo_r',
        cancel: false,
      },
    ],
    { today: '2026-09-01' },
  );
  assert(
    doubleheader.games.map((game) => game.id).join(',') === '2026-09-14-lg,2026-09-14-lg-2',
    'same-day games get a numeric suffix',
  );
  assert(doubleheader.games[0].startTime === '14:00', 'doubleheader is ordered by first pitch');

  assert(formatJson([{ a: 1 }]) === '[\n  {\n    "a": 1\n  }\n]\n', 'JSON formatting stays stable');
  console.log('sync-games self-test ok');
}

async function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTest();
    return 0;
  }
  const dryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';
  const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
  const result = await syncGames({ now, dryRun });
  const seoul = result.games.filter((game) => game.host);
  console.log(
    `${dryRun ? 'dry-run ' : ''}${result.unchanged ? 'unchanged' : 'synced'} ${result.games.length} remaining games (${seoul.length} Seoul away), TBD ${result.tbd.length}, KIA rows ${result.kiaCount} [${result.today} → ${result.window.toDate}]`,
  );
  for (const game of seoul) {
    console.log(`  ${game.date} ${game.startTime} vs ${game.opponentShort} ${game.stadium} ${game.series}`);
  }
  return 0;
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
