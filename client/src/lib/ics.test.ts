import { describe, expect, it } from 'vitest';
import { salesToIcs } from './ics';
import { GAMES_2026 } from '../data/games';
import { HOSTS } from '../data/hosts';
import { nextSales } from './saleWindows';
import { kstDateTime } from './kst';

describe('salesToIcs', () => {
  it('emits a calendar with the next Seoul-away general sale', () => {
    const items = nextSales(GAMES_2026, kstDateTime('2026-08-15', '10:00'), ['general']).slice(0, 1);
    const ics = salesToIcs(items);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:일반예매 오픈 · 서울 원정 vs 키움');
    expect(ics).toContain('DTSTART:20260815T050000Z');
    expect(ics).toContain('TRIGGER:-PT1H');
    expect(ics).toContain(HOSTS.kiwoom.ticketUrl);
  });
});
