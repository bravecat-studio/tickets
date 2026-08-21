import { describe, expect, it } from 'vitest';
import { GAMES_2026 } from '../data/games';
import { kstDateTime } from './kst';
import { nextSales } from './saleWindows';
import { dueSmsSales, isSmsDue, reminderAt, smsMessage } from './smsReminder';

describe('sms reminder timing', () => {
  const open = kstDateTime('2026-08-22', '11:00');

  it('sets the reminder exactly 60 minutes before open', () => {
    expect(reminderAt(open).toISOString()).toBe(kstDateTime('2026-08-22', '10:00').toISOString());
  });

  it('is due inside the 50–60 minute window used by the 10-minute cron', () => {
    expect(isSmsDue(open, kstDateTime('2026-08-22', '10:00'))).toBe(true);
    expect(isSmsDue(open, kstDateTime('2026-08-22', '10:05'))).toBe(true);
    expect(isSmsDue(open, kstDateTime('2026-08-22', '10:10'))).toBe(false);
    expect(isSmsDue(open, kstDateTime('2026-08-22', '09:59'))).toBe(false);
    expect(isSmsDue(open, kstDateTime('2026-08-22', '11:00'))).toBe(false);
  });

  it('selects the SSG 8/29 general sale at 10:05 on 8/22', () => {
    const sales = nextSales(GAMES_2026, kstDateTime('2026-08-22', '10:00'), ['general']);
    const due = dueSmsSales(sales, kstDateTime('2026-08-22', '10:05'));
    expect(due).toHaveLength(1);
    expect(due[0].game.id).toBe('2026-08-29-ssg');
    expect(smsMessage(due[0])).toContain('오픈 1시간 전');
    expect(smsMessage(due[0])).toContain('vs SSG');
    expect(smsMessage(due[0])).toContain('https://www.ticketlink.co.kr/sports/137/58');
    expect(smsMessage(due[0])).toContain(
      'https://play.google.com/store/apps/details?id=kr.co.ticketlink.cne'
    );
  });
});
