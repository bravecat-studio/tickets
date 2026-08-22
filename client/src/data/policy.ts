export type SaleKind = 'season' | 'early' | 'general';

export interface SalePolicy {
  kind: SaleKind;
  label: string;
  when: string;
  openClock: string;
  daysBefore: number;
  maxTickets: number;
  channel: string;
  eligible: string;
}
