#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { monthRange, monthsBetween, naverUrl, fetchMonth, fetchSeason, runSelfTest } from './sync-games.mjs';

function assert(ok, message) {
  if (!ok) throw new Error(`sync-games.test failed: ${message}`);
}

function jsonResponse(body) {
  return {
    ok: true,
    async json() {
      return body;
    },
  };
}

async function main() {
  runSelfTest();

  assert(monthRange(2026, 8).fromDate === '2026-08-01', 'August starts on the 1st');
  assert(monthRange(2026, 8).toDate === '2026-08-31', 'August ends on the 31st');
  assert(monthRange(2026, 2).toDate === '2026-02-28', '2026 is not a leap year');
  assert(
    monthsBetween('2026-10-01', '2026-11-30')
      .map((m) => m.fromDate)
      .join(',') === '2026-10-01,2026-11-01',
    'season tail walks month by month',
  );
  assert(naverUrl('2026-08-01', '2026-08-31').includes('fromDate=2026-08-01'), 'Naver URL carries the month window');

  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes('fromDate=2026-08-01') && url.includes('toDate=2026-08-31')) {
      return jsonResponse({
        result: {
          gameTotalCount: 3,
          games: [{ gameId: 'a', gameDate: '2026-08-01' }, { gameId: 'b', gameDate: '2026-08-15' }],
        },
      });
    }
    if (url.includes('fromDate=2026-08-01') && url.includes('toDate=2026-08-16')) {
      return jsonResponse({ result: { gameTotalCount: 1, games: [{ gameId: 'a', gameDate: '2026-08-01' }] } });
    }
    if (url.includes('fromDate=2026-08-17')) {
      return jsonResponse({ result: { gameTotalCount: 1, games: [{ gameId: 'c', gameDate: '2026-08-20' }] } });
    }
    throw new Error(`unexpected url ${url}`);
  };

  const split = await fetchMonth('2026-08-01', '2026-08-31', { fetchImpl, size: 2 });
  assert(split.map((g) => g.gameId).join(',') === 'a,c', 'oversized months are split and de-duplicated by half');
  assert(urls.length === 3, `split fetch should recurse once, got ${urls.length}`);

  const seasonUrls = [];
  const seasonFetch = async (url) => {
    seasonUrls.push(url);
    return jsonResponse({
      result: { gameTotalCount: 1, games: [{ gameId: url.slice(-20), gameDate: '2026-08-01' }] },
    });
  };
  const season = await fetchSeason('2026-08-01', '2026-09-30', { fetchImpl: seasonFetch });
  assert(seasonUrls.length === 2, 'season fetch walks August then September');
  assert(season.length === 2, 'season fetch keeps one row per month');

  const workflow = readFileSync(new URL('../.github/workflows/update-schedule.yml', import.meta.url), 'utf8');
  assert(workflow.includes("cron: '20 1,13 * * *'"), 'workflow must run twice daily in KST');
  assert(workflow.includes('node scripts/sync-games.mjs'), 'workflow must run the sync script');
  assert(workflow.includes('client/src/data/games.json'), 'workflow must commit games.json');
  assert(workflow.includes('--auto-remaining'), 'workflow must auto-stop the SMS scheduler when no Seoul-away games remain');
  assert(workflow.includes('actions/deploy-pages@v4'), 'workflow must deploy Pages after a schedule change');

  console.log('sync-games integration test ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
