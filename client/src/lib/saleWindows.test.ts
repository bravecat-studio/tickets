import { describe, expect, it } from 'vitest';
import { GAMES_2026 } from '../data/games';
import { kstDateTime, shiftKstDate, splitDuration } from './kst';
import { bookingStatus, nextSales, saleWindowsFor } from './saleWindows';

describe('saleWindowsFor', () => {
  it('computes D-8 10:00 / 10:30 and D-7 11:00 KST for SSG 8/28', () => {
    const windows = saleWindowsFor('2026-08-28');
    expect(shiftKstDate('2026-08-28', -8)).toBe('2026-08-20');
    expect(shiftKstDate('2026-08-28', -7)).toBe('2026-08-21');
    expect(windows.find((w) => w.kind === 'season')?.at.toISOString()).toBe(
      kstDateTime('2026-08-20', '10:00').toISOString()
    );
    expect(windows.find((w) => w.kind === 'early')?.at.toISOString()).toBe(
      kstDateTime('2026-08-20', '10:30').toISOString()
    );
    expect(windows.find((w) => w.kind === 'general')?.at.toISOString()).toBe(
      kstDateTime('2026-08-21', '11:00').toISOString()
    );
  });

  it('computes general sale for Sunday 9/6 as 8/30 11:00', () => {
    const general = saleWindowsFor('2026-09-06').find((w) => w.kind === 'general');
    expect(general?.at.toISOString()).toBe(kstDateTime('2026-08-30', '11:00').toISOString());
  });
});

describe('bookingStatus', () => {
  const ssg = GAMES_2026.find((g) => g.id === '2026-08-28-ssg')!;
  const kiwoom = GAMES_2026.find((g) => g.id === '2026-08-21-kiwoom')!;

  it('marks away games as away', () => {
    expect(bookingStatus(kiwoom, kstDateTime('2026-08-21', '10:00'))).toBe('away');
  });

  it('is upcoming before general open', () => {
    expect(bookingStatus(ssg, kstDateTime('2026-08-21', '10:59'))).toBe('upcoming');
  });

  it('is on sale after general open', () => {
    expect(bookingStatus(ssg, kstDateTime('2026-08-21', '11:00'))).toBe('on_sale');
  });

  it('closes two hours before first pitch', () => {
    expect(bookingStatus(ssg, kstDateTime('2026-08-28', '16:30'))).toBe('closed');
    expect(bookingStatus(ssg, kstDateTime('2026-08-28', '16:29'))).toBe('closing_soon');
  });
});

describe('nextSales', () => {
  it('returns the earliest future general sale', () => {
    const now = kstDateTime('2026-08-21', '09:00');
    const next = nextSales(GAMES_2026, now, ['general'])[0];
    expect(next.game.id).toBe('2026-08-28-ssg');
    expect(next.window.kind).toBe('general');
  });
});

describe('splitDuration', () => {
  it('splits milliseconds into clock parts', () => {
    expect(splitDuration(90_610_000)).toEqual({ d: 1, h: 1, m: 10, s: 10 });
  });
});
