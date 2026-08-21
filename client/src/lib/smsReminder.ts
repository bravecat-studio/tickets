import type { NextSale } from './saleWindows';

export const SMS_LEAD_MS = 60 * 60 * 1000;
export const SMS_CRON_INTERVAL_MS = 10 * 60 * 1000;

export function reminderAt(saleAt: Date, leadMs = SMS_LEAD_MS): Date {
  return new Date(saleAt.getTime() - leadMs);
}

/** True when `now` is inside the 10-minute cron slot that covers "1 hour before open". */
export function isSmsDue(
  saleAt: Date,
  now: Date,
  leadMs = SMS_LEAD_MS,
  intervalMs = SMS_CRON_INTERVAL_MS
): boolean {
  const remain = saleAt.getTime() - now.getTime();
  return remain > leadMs - intervalMs && remain <= leadMs;
}

export function dueSmsSales(
  sales: NextSale[],
  now: Date,
  leadMs = SMS_LEAD_MS,
  intervalMs = SMS_CRON_INTERVAL_MS
): NextSale[] {
  return sales.filter((item) => isSmsDue(item.window.at, now, leadMs, intervalMs));
}

export function smsEventKey(item: NextSale): string {
  return `${item.game.id}:${item.window.kind}:${item.window.at.toISOString()}`;
}

export function smsMessage(item: NextSale): string {
  const open = item.window.at.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return [
    `[KIA] ${item.window.label} 오픈 1시간 전`,
    `vs ${item.game.opponentShort} ${item.game.date} ${item.game.startTime}`,
    `오픈 ${open}`,
    '공식 예매: https://www.ticketlink.co.kr/sports/137/58',
  ].join('\n');
}
