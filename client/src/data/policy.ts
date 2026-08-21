export type SaleKind = 'season' | 'early' | 'general';

export interface SalePolicy {
  kind: SaleKind;
  label: string;
  when: string;
  openClock: string;
  maxTickets: number;
  channel: string;
  eligible: string;
}

/** 2026 시즌 KIA 홈경기 예매 정책. 구단 FAQ·티켓링크 안내 기준. */
export const SALE_POLICIES: SalePolicy[] = [
  {
    kind: 'season',
    label: '선선예매',
    when: '경기일 D-8',
    openClock: '10:00',
    maxTickets: 2,
    channel: 'KIA 타이거즈 공식 앱',
    eligible: '시즌권 보유자',
  },
  {
    kind: 'early',
    label: '선예매',
    when: '경기일 D-8',
    openClock: '10:30',
    maxTickets: 2,
    channel: 'KIA 타이거즈 공식 앱',
    eligible: '얼리패스 보유자',
  },
  {
    kind: 'general',
    label: '일반예매',
    when: '경기일 D-7',
    openClock: '11:00',
    maxTickets: 8,
    channel: '티켓링크 웹·앱 / 타이거즈 앱',
    eligible: '회원 누구나',
  },
];

export const BOOKING_RULES = [
  '온라인 예매: 경기 7일 전 11:00 ~ 경기 시작 2시간 전 (구단 FAQ).',
  '예매 취소: 경기 시작 4시간 전까지.',
  '현장 매표·스마트티켓: 경기 시작 2시간 전부터.',
  '예매수수료: 온라인·앱·전화 1,000원 / 현장 무료.',
  'PC 웹은 일반석 위주, 응원특별석·테이블석·스카이박스·파티석·가족석은 앱 전용.',
  '외야석만 자동배정 가능. 그 외 구역은 직접 좌석 선택.',
  '챔피언스필드는 예매확인증만으로 입장 불가. 스마트티켓 또는 무인발권기 발권 필요.',
  '선예매 대상 일반석: K9, K8, K5, EV석, 외야석.',
] as const;
