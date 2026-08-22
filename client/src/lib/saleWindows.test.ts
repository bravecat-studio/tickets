import { describe, expect, it } from 'vitest';
import { GAMES_2026 } from '../data/games';
import { isSeoulAway } from '../data/hosts';
import { kstDateTime, shiftKstDate, splitDuration } from './kst';
import { bookingStatus, bookableSales, nextSales, saleWindowsFor } from './saleWindows';

const kiwoom = GAMES_2026.find((g) => g.id === '2026-08-22-kiwoom')!;
const sunday = GAMES_2026.find((g) => g.id === '2026-08-23-kiwoom')!;
const ssg = GAMES_2026.find((g) => g.id === '2026-08-28-ssg')!;
const nc = GAMES_2026.find((g) => g.id === '2026-09-01-nc')!;

describe('saleWindowsFor', () => {
  it('uses Kiwoom Gocheok policy: D-7 11:00 / 12:00 / 14:00', () => {
    const windows = saleWindowsFor(kiwoom);
    expect(shiftKstDate('2026-08-22', -7)).toBe('2026-08-15');
    expect(windows.find((w) => w.kind === 'season')?.at.toISOString()).toBe(
      kstDateTime('2026-08-15', '11:00').toISOString()
    );
    expect(windows.find((w) => w.kind === 'early')?.at.toISOString()).toBe(
      kstDateTime('2026-08-15', '12:00').toISOString()
    );
    expect(windows.find((w) => w.kind === 'general')?.at.toISOString()).toBe(
      kstDateTime('2026-08-15', '14:00').toISOString()
    );
  });

  it('computes Sunday 8/23 general sale as Saturday 8/16 14:00', () => {
    const general = saleWindowsFor(sunday).find((w) => w.kind === 'general');
    expect(general?.at.toISOString()).toBe(kstDateTime('2026-08-16', '14:00').toISOString());
  });
});

describe('bookingStatus', () => {
  it('ignores home games and non-Seoul away games', () => {
    expect(isSeoulAway(ssg)).toBe(false);
    expect(isSeoulAway(nc)).toBe(false);
    expect(isSeoulAway(kiwoom)).toBe(true);
    expect(bookingStatus(ssg, kstDateTime('2026-08-21', '10:00'))).toBe('out_of_scope');
    expect(bookingStatus(nc, kstDateTime('2026-08-25', '10:00'))).toBe('out_of_scope');
  });

  it('is upcoming before Kiwoom general open', () => {
    expect(bookingStatus(kiwoom, kstDateTime('2026-08-15', '13:59'))).toBe('upcoming');
  });

  it('is on sale after Kiwoom general open', () => {
    expect(bookingStatus(kiwoom, kstDateTime('2026-08-15', '14:00'))).toBe('on_sale');
  });

  it('closes two hours before first pitch at Gocheok', () => {
    expect(bookingStatus(kiwoom, kstDateTime('2026-08-22', '16:00'))).toBe('closed');
    expect(bookingStatus(kiwoom, kstDateTime('2026-08-22', '15:59'))).toBe('closing_soon');
  });
});

describe('nextSales', () => {
  it('returns the earliest future Seoul-away general sale and skips home games', () => {
    const now = kstDateTime('2026-08-15', '10:00');
    const next = nextSales(GAMES_2026, now, ['general']);
    expect(next.every((item) => isSeoulAway(item.game))).toBe(true);
    expect(next[0].game.id).toBe('2026-08-22-kiwoom');
    expect(next[0].window.kind).toBe('general');
    expect(next.some((item) => item.game.venue === 'home')).toBe(false);
  });

  it('returns no sales for home-only kinds once Seoul-away opens have passed', () => {
    const afterLastOpen = kstDateTime('2026-08-16', '14:01');
    expect(nextSales(GAMES_2026, afterLastOpen, ['general'])).toEqual([]);
  });

  it('uses LG Ticketlink D-7 11:00 for a Jamsil away game', () => {
    const lgGame = {
      id: '2026-08-09-lg',
      date: '2026-08-09',
      startTime: '14:00',
      opponent: 'LG 트윈스',
      opponentShort: 'LG',
      venue: 'away' as const,
      stadium: '잠실야구장',
      series: '서울 원정',
      host: 'lg' as const,
    };
    const general = saleWindowsFor(lgGame).find((w) => w.kind === 'general');
    expect(general?.at.toISOString()).toBe(kstDateTime('2026-08-02', '11:00').toISOString());
    const next = nextSales([lgGame, ssg], kstDateTime('2026-08-01', '09:00'), ['general']);
    expect(next).toHaveLength(1);
    expect(next[0].game.id).toBe('2026-08-09-lg');
  });
});

describe('bookableSales', () => {
  it('keeps a Seoul-away game that is already on sale', () => {
    const now = kstDateTime('2026-08-22', '12:00');
    const items = bookableSales(GAMES_2026, now, ['general']);
    expect(items.map((item) => item.game.id)).toContain('2026-08-22-kiwoom');
    expect(items.map((item) => item.game.id)).toContain('2026-08-23-kiwoom');
    expect(items.every((item) => isSeoulAway(item.game))).toBe(true);
  });
});

describe('splitDuration', () => {
  it('splits milliseconds into clock parts', () => {
    expect(splitDuration(90_610_000)).toEqual({ d: 1, h: 1, m: 10, s: 10 });
  });
});
