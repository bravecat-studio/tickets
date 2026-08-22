import type { NextSale } from './saleWindows';
import { APP_STORES, OFFICIAL_LINKS } from '../data/links';
import smsConfig from '@sms-config';

export const SMS_LEAD_MS = 60 * 60 * 1000;
export const SMS_CRON_INTERVAL_MS = 60 * 60 * 1000;

export type SmsSchedulerConfig = {
  enabled: boolean;
  kinds: string[];
  watchIds: string[];
  leadMinutes: number;
  cronIntervalMinutes: number;
};

export const SMS_SCHEDULER: SmsSchedulerConfig = {
  enabled: smsConfig.enabled !== false,
  kinds: smsConfig.kinds ?? ['general'],
  watchIds: smsConfig.watchIds ?? [],
  leadMinutes: smsConfig.leadMinutes ?? 60,
  cronIntervalMinutes: smsConfig.cronIntervalMinutes ?? 60,
};

export function reminderAt(saleAt: Date, leadMs = SMS_LEAD_MS): Date {
  return new Date(saleAt.getTime() - leadMs);
}

/** True when `now` is inside the hourly cron slot that covers "1 hour before open". */
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
    `공식 예매: ${OFFICIAL_LINKS.ticketlinkKia}`,
    `앱: ${APP_STORES.ticketlinkAndroid}`,
  ].join('\n');
}
