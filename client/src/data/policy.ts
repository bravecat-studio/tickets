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
  /** 고정 정책이 아니라 과거 공지로 추정한 시각 (포스트시즌). */
  estimated?: boolean;
}
