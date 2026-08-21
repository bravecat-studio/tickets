export interface SeatGrade {
  name: string;
  weekday: number;
  weekend: number;
  note: string;
  appOnly?: boolean;
}

export const SEAT_GRADES: SeatGrade[] = [
  { name: 'K9', weekday: 16000, weekend: 20000, note: '내야 최상급 · 1루 112-113 / 3루 116-117' },
  { name: 'K8', weekday: 14000, weekend: 18000, note: '내야 상급 · 1루 107-111 / 3루 118-119, 123' },
  { name: 'K5', weekday: 12000, weekend: 16000, note: '내야 · 1루 101-106 / 3루 124-127 · 단체 대상' },
  { name: '응원특별석', weekday: 15000, weekend: 19000, note: '3루 120-122 · 응원단상 앞', appOnly: true },
  { name: 'EV석', weekday: 10000, weekend: 13000, note: '5층 일반석 · 단체 대상' },
  { name: '외야석', weekday: 10000, weekend: 13000, note: '자동배정 가능' },
  { name: '타이거즈 가족석', weekday: 22000, weekend: 27000, note: '4·6인석', appOnly: true },
  { name: '외야 가족석', weekday: 20000, weekend: 25000, note: '6인석', appOnly: true },
  { name: '파티석', weekday: 25000, weekend: 30000, note: '4층 4인 테이블', appOnly: true },
  { name: '메디힐 테이블석', weekday: 30000, weekend: 35000, note: '5층 2·3인', appOnly: true },
  { name: '서프라이즈석', weekday: 25000, weekend: 30000, note: '초등 이하 입장 불가', appOnly: true },
  { name: '중앙테이블석', weekday: 45000, weekend: 55000, note: '2·3인석', appOnly: true },
  { name: '챔피언석', weekday: 50000, weekend: 60000, note: '프리미엄', appOnly: true },
  { name: '스카이박스', weekday: 75000, weekend: 85000, note: '10·14·18인실', appOnly: true },
];

export const SEAT_TIPS = [
  '챔피언스필드 홈 응원은 3루, 원정 응원은 1루입니다.',
  '주말 요금은 금·토·일 및 공휴일에 적용됩니다.',
  '인기 경기 일반예매에서는 응원특별석 등 앱 전용 구역을 1순위로 두는 전략이 흔합니다.',
  '가격·할인·잔여석은 예매 시점의 티켓링크·구단 앱 표시가 최종입니다.',
] as const;
