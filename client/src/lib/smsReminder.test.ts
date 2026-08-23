import { describe, expect, it } from 'vitest';
import type { Game } from '../data/games';
import fixtureGames from '../data/games.fixture.json';
import { HOSTS } from '../data/hosts';
import { kstDateTime } from './kst';
import { nextSales } from './saleWindows';
import { dueSmsSales, isSmsDue, reminderAt, SMS_SCHEDULER, smsMessage } from './smsReminder';

const GAMES = fixtureGames as Game[];

describe('sms reminder timing', () => {
  const open = kstDateTime('2026-08-16', '14:00');

  it('sets the reminder exactly 60 minutes before open', () => {
    expect(reminderAt(open).toISOString()).toBe(kstDateTime('2026-08-16', '13:00').toISOString());
  });

  it('is due inside the 0–60 minute window used by the hourly cron', () => {
    expect(isSmsDue(open, kstDateTime('2026-08-16', '13:00'))).toBe(true);
    expect(isSmsDue(open, kstDateTime('2026-08-16', '13:30'))).toBe(true);
    expect(isSmsDue(open, kstDateTime('2026-08-16', '13:59'))).toBe(true);
    expect(isSmsDue(open, kstDateTime('2026-08-16', '12:59'))).toBe(false);
    expect(isSmsDue(open, kstDateTime('2026-08-16', '12:00'))).toBe(false);
    expect(isSmsDue(open, kstDateTime('2026-08-16', '14:00'))).toBe(false);
  });

  it('selects the Gocheok 8/23 general sale at 13:05 on 8/16', () => {
    const sales = nextSales(GAMES, kstDateTime('2026-08-16', '13:00'), ['general']);
    const due = dueSmsSales(sales, kstDateTime('2026-08-16', '13:05'));
    expect(due).toHaveLength(1);
    expect(due[0].game.id).toBe('2026-08-23-kiwoom');
    expect(smsMessage(due[0])).toContain('서울 원정');
    expect(smsMessage(due[0])).toContain('오픈 1시간 전');
    expect(smsMessage(due[0])).toContain('vs 키움');
    expect(smsMessage(due[0])).toContain('고척스카이돔');
    expect(smsMessage(due[0])).toContain(HOSTS.kiwoom.ticketUrl);
  });

  it('does not select Gwangju home sales even in their 1-hour window', () => {
    const sales = nextSales(GAMES, kstDateTime('2026-08-22', '10:00'), ['general']);
    const due = dueSmsSales(sales, kstDateTime('2026-08-22', '10:05'));
    expect(sales.some((item) => item.game.id.includes('ssg'))).toBe(false);
    expect(due).toHaveLength(0);
  });

  it('mirrors sms.config.json scheduler on/off and hourly interval', () => {
    expect(SMS_SCHEDULER.cronIntervalMinutes).toBe(60);
    expect(typeof SMS_SCHEDULER.enabled).toBe('boolean');
  });
});
