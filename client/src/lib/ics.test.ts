import { describe, expect, it } from 'vitest';
import { salesToIcs } from './ics';
import { GAMES_2026 } from '../data/games';
import { nextSales } from './saleWindows';
import { kstDateTime } from './kst';

describe('salesToIcs', () => {
  it('emits a calendar with the next general sale', () => {
    const items = nextSales(GAMES_2026, kstDateTime('2026-08-21', '09:00'), ['general']).slice(0, 1);
    const ics = salesToIcs(items);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:일반예매 오픈 · KIA vs SSG');
    expect(ics).toContain('DTSTART:20260821T020000Z');
  });
});
