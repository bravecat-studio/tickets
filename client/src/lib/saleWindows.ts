import type { Game } from '../data/games';
import { hostFor, isSeoulAway, policiesFor } from '../data/hosts';
import type { SaleKind } from '../data/policy';
import { kstDateTime, shiftKstDate } from './kst';

export interface SaleWindow {
  kind: SaleKind;
  label: string;
  at: Date;
  maxTickets: number;
  channel: string;
}

export function saleWindowsFor(game: Game): SaleWindow[] {
  return policiesFor(game).map((policy) => ({
    kind: policy.kind,
    label: policy.label,
    at: kstDateTime(shiftKstDate(game.date, -policy.daysBefore), policy.openClock),
    maxTickets: policy.maxTickets,
    channel: policy.channel,
  }));
}

export type BookingStatus = 'upcoming' | 'on_sale' | 'closing_soon' | 'closed' | 'out_of_scope';

export function gameStartAt(game: Game): Date {
  return kstDateTime(game.date, game.startTime);
}

export function onlineCloseAt(game: Game): Date {
  const start = gameStartAt(game);
  const close = hostFor(game)?.onlineClose;
  if (!close) return new Date(start.getTime() - 2 * 60 * 60 * 1000);
  const ms = close.hours * 60 * 60 * 1000;
  return close.mode === 'hoursAfterStart' ? new Date(start.getTime() + ms) : new Date(start.getTime() - ms);
}

export function bookingStatus(game: Game, now = new Date()): BookingStatus {
  if (!isSeoulAway(game)) return 'out_of_scope';
  const general = saleWindowsFor(game).find((w) => w.kind === 'general');
  const close = onlineCloseAt(game);
  if (!general) return 'out_of_scope';
  if (now >= close) return 'closed';
  if (now >= general.at) {
    const hour = 60 * 60 * 1000;
    return close.getTime() - now.getTime() <= 6 * hour ? 'closing_soon' : 'on_sale';
  }
  return 'upcoming';
}

export interface NextSale {
  game: Game;
  window: SaleWindow;
}

function wantedKinds(kinds?: SaleKind[]): Set<SaleKind> {
  return new Set(kinds ?? (['season', 'early', 'general'] as SaleKind[]));
}

/** Future ticket-sale opens for Seoul away games only. */
export function nextSales(games: Game[], now = new Date(), kinds?: SaleKind[]): NextSale[] {
  const wanted = wantedKinds(kinds);
  const items: NextSale[] = [];
  for (const game of games) {
    if (!isSeoulAway(game)) continue;
    for (const window of saleWindowsFor(game)) {
      if (!wanted.has(window.kind)) continue;
      if (window.at.getTime() > now.getTime()) items.push({ game, window });
    }
  }
  items.sort((a, b) => a.window.at.getTime() - b.window.at.getTime());
  return items;
}

/** Seoul away games whose general sale has opened and online booking is still open. */
export function bookableSales(games: Game[], now = new Date(), kinds?: SaleKind[]): NextSale[] {
  const wanted = wantedKinds(kinds);
  const items: NextSale[] = [];
  for (const game of games) {
    if (!isSeoulAway(game)) continue;
    if (now >= onlineCloseAt(game)) continue;
    for (const window of saleWindowsFor(game)) {
      if (!wanted.has(window.kind)) continue;
      if (window.at.getTime() <= now.getTime()) items.push({ game, window });
    }
  }
  items.sort((a, b) => gameStartAt(a.game).getTime() - gameStartAt(b.game).getTime());
  return items;
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  upcoming: '오픈 대기',
  on_sale: '예매 가능',
  closing_soon: '마감 임박',
  closed: '온라인 마감',
  out_of_scope: '서울 원정 아님',
};
