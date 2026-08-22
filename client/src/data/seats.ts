import type { HostId } from './hosts';

export interface SeatGrade {
  name: string;
  weekday: number;
  weekend: number;
  note: string;
  appOnly?: boolean;
}

/** 고척 하절기(5/19~9/6) 일반 요금. 잔여 서울 원정이 이 구간에 있습니다. */
export const GOCHEOK_SEATS: SeatGrade[] = [
  { name: '요기요 R.d-club석', weekday: 70000, weekend: 115000, note: '프리미엄 테이블' },
  { name: 'LEXUS 1층 테이블석', weekday: 65000, weekend: 100000, note: '1층 테이블' },
  { name: 'NAVER 2층 테이블석', weekday: 52000, weekend: 83000, note: '2층 테이블' },
  { name: '내야커플석', weekday: 40000, weekend: 60000, note: '미니테이블 스탠딩' },
  { name: '다크버건디석', weekday: 22500, weekend: 32000, note: '내야 상급' },
  { name: '버건디석', weekday: 20000, weekend: 29000, note: '내야 · 원정 응원 3루' },
  { name: '3층 지정석', weekday: 17000, weekend: 24000, note: '내야 상단' },
  { name: '4층 지정석', weekday: 10000, weekend: 15000, note: '내야 최상단' },
  { name: '외야 지정석', weekday: 10000, weekend: 15000, note: '외야' },
  { name: '외야커플석', weekday: 25000, weekend: 40000, note: '미니테이블 스탠딩' },
];

/** 잠실 LG 홈 일반 요금. */
export const JAMSIL_LG_SEATS: SeatGrade[] = [
  { name: '프리미엄석', weekday: 100000, weekend: 100000, note: '최상급' },
  { name: '테이블석', weekday: 56000, weekend: 62000, note: '테이블' },
  { name: '익사이팅존', weekday: 30000, weekend: 35000, note: '초등 이하 입장 불가' },
  { name: '블루석', weekday: 24000, weekend: 26000, note: '내야 상급' },
  { name: '오렌지석', weekday: 22000, weekend: 24000, note: 'LG 홈 응원' },
  { name: '레드석', weekday: 19000, weekend: 21000, note: '내야' },
  { name: '네이비석', weekday: 16000, weekend: 18000, note: '내야 상단' },
  { name: '그린응원석(외야)', weekday: 11000, weekend: 12000, note: '외야 응원' },
  { name: '그린석(외야)', weekday: 10000, weekend: 11000, note: '외야' },
];

export const HOST_SEATS: Record<HostId, SeatGrade[]> = {
  kiwoom: GOCHEOK_SEATS,
  lg: JAMSIL_LG_SEATS,
  doosan: JAMSIL_LG_SEATS.map((seat) => ({
    ...seat,
    note: seat.name.includes('오렌지') ? '잠실 내야 · 두산전은 3루가 홈 응원' : seat.note,
  })),
};

export const SEAT_TIPS: Record<HostId, readonly string[]> = {
  kiwoom: [
    '고척 원정 응원은 3루, 키움 홈 응원은 1루입니다.',
    '표시 요금은 하절기(5/19~9/6) 일반가입니다. 화·수·목은 주중, 금·토·일·공휴일은 주말입니다.',
    '예매처는 NOL 인터파크입니다. 가격·할인·잔여석은 예매 시점 표시가 최종입니다.',
  ],
  lg: [
    '잠실 LG전 원정 응원은 3루입니다. 오렌지석은 LG 홈 응원 구역입니다.',
    '주말 요금은 금·토·일 및 공휴일에 적용됩니다.',
    '예매처는 티켓링크입니다. 가격·할인·잔여석은 예매 시점 표시가 최종입니다.',
  ],
  doosan: [
    '잠실 두산전 원정 응원은 1루입니다. 3루는 두산 홈 응원 구역입니다.',
    '주말 요금은 금·토·일 및 공휴일에 적용됩니다. 잠실 좌석명은 홈 구단에 따라 다릅니다.',
    '예매처는 NOL 인터파크입니다. 가격·할인·잔여석은 예매 시점 표시가 최종입니다.',
  ],
};
