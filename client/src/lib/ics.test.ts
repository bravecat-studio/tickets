import { describe, expect, it } from 'vitest';
import { salesToIcs } from './ics';
import type { Game } from '../data/games';
import fixtureGames from '../data/games.fixture.json';
import { HOSTS } from '../data/hosts';
import { nextSales } from './saleWindows';
import { kstDateTime } from './kst';

const GAMES = fixtureGames as Game[];

describe('salesToIcs', () => {
  it('emits a calendar with the next Seoul-away general sale', () => {
    const items = nextSales(GAMES, kstDateTime('2026-08-15', '10:00'), ['general']).slice(0, 1);
    const ics = salesToIcs(items);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:일반예매 오픈 · 서울 원정 vs 키움');
    expect(ics).toContain('DTSTART:20260815T050000Z');
    expect(ics).toContain('TRIGGER:-PT1H');
    expect(ics).toContain(HOSTS.kiwoom.ticketUrl);
  });
});
