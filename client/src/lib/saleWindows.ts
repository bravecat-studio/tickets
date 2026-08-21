import type { Game } from '../data/games';
import { SALE_POLICIES, type SaleKind } from '../data/policy';
import { kstDateTime, shiftKstDate } from './kst';

export interface SaleWindow {
  kind: SaleKind;
  label: string;
  at: Date;
  maxTickets: number;
  channel: string;
}

export function saleWindowsFor(gameDate: string): SaleWindow[] {
  const d8 = shiftKstDate(gameDate, -8);
  const d7 = shiftKstDate(gameDate, -7);
  return SALE_POLICIES.map((policy) => ({
    kind: policy.kind,
    label: policy.label,
    at: kstDateTime(policy.kind === 'general' ? d7 : d8, policy.openClock),
    maxTickets: policy.maxTickets,
    channel: policy.channel,
  }));
}

export type BookingStatus = 'upcoming' | 'on_sale' | 'closing_soon' | 'closed' | 'away';

export function gameStartAt(game: Game): Date {
  return kstDateTime(game.date, game.startTime);
}

export function onlineCloseAt(game: Game): Date {
  return new Date(gameStartAt(game).getTime() - 2 * 60 * 60 * 1000);
}

export function bookingStatus(game: Game, now = new Date()): BookingStatus {
  if (game.venue !== 'home') return 'away';
  const general = saleWindowsFor(game.date).find((w) => w.kind === 'general')!;
  const close = onlineCloseAt(game);
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

export function nextSales(games: Game[], now = new Date(), kinds?: SaleKind[]): NextSale[] {
  const wanted = new Set(kinds ?? (['season', 'early', 'general'] as SaleKind[]));
  const items: NextSale[] = [];
  for (const game of games) {
    if (game.venue !== 'home') continue;
    for (const window of saleWindowsFor(game.date)) {
      if (!wanted.has(window.kind)) continue;
      if (window.at.getTime() > now.getTime()) items.push({ game, window });
    }
  }
  items.sort((a, b) => a.window.at.getTime() - b.window.at.getTime());
  return items;
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  upcoming: '오픈 대기',
  on_sale: '예매 가능',
  closing_soon: '마감 임박',
  closed: '온라인 마감',
  away: '원정 · 상대팀 예매처',
};
