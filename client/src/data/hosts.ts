import hosts from './hosts.json';
import type { SalePolicy } from './policy';

export type HostId = 'kiwoom' | 'lg' | 'doosan';

export interface OnlineClose {
  mode: 'hoursBeforeStart' | 'hoursAfterStart';
  hours: number;
}

export interface HostClub {
  id: HostId;
  name: string;
  short: string;
  stadium: string;
  vendor: string;
  ticketUrl: string;
  clubTicketUrl: string;
  clubScheduleUrl: string;
  appUrl: string;
  loginUrl: string;
  awayCheering: string;
  onlineClose: OnlineClose;
  policies: SalePolicy[];
  rules: string[];
}

export const HOSTS: Record<HostId, HostClub> = hosts as Record<HostId, HostClub>;

const SEOUL_STADIUMS = ['고척스카이돔', '잠실야구장', '서울종합운동장 야구장'] as const;

export function isSeoulStadium(stadium: string): boolean {
  return SEOUL_STADIUMS.some((name) => stadium === name || stadium.includes(name.replace('야구장', '')));
}

export type HostableGame = {
  venue: 'home' | 'away';
  stadium: string;
  opponentShort: string;
  host?: HostId;
  reserveUrl?: string;
};

export function hostIdFor(game: HostableGame): HostId | null {
  if (game.venue !== 'away') return null;
  if (game.host) return game.host;
  if (game.stadium === '고척스카이돔' || game.opponentShort === '키움') return 'kiwoom';
  if (!isSeoulStadium(game.stadium)) return null;
  if (game.opponentShort === 'LG') return 'lg';
  if (game.opponentShort === '두산') return 'doosan';
  return null;
}

export function isSeoulAway(game: HostableGame): boolean {
  return hostIdFor(game) !== null;
}

export function hostFor(game: HostableGame): HostClub | null {
  const id = hostIdFor(game);
  return id ? HOSTS[id] : null;
}

export function policiesFor(game: HostableGame): SalePolicy[] {
  return hostFor(game)?.policies ?? [];
}

export function ticketUrlFor(game: HostableGame): string {
  return game.reserveUrl || hostFor(game)?.ticketUrl || '';
}

export const SEOUL_HOST_SUMMARY = (Object.values(HOSTS) as HostClub[]).map((host) => {
  const general = host.policies.find((p) => p.kind === 'general');
  return {
    id: host.id,
    name: host.short,
    stadium: host.stadium,
    vendor: host.vendor,
    generalOpen: general ? `${general.when} ${general.openClock}` : '',
    ticketUrl: host.ticketUrl,
  };
});
