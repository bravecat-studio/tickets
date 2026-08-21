export type Venue = 'home' | 'away';

export interface Game {
  id: string;
  date: string;
  startTime: string;
  opponent: string;
  opponentShort: string;
  venue: Venue;
  stadium: string;
  series: string;
  note?: string;
  /** Ticketlink 좌석 예매 진입 URL. 로그인 필요. */
  reserveUrl?: string;
}

/**
 * 2026 잔여 일정 (2026-08-21 기준).
 * 출처: KIA 공식 일정, 야구나라, 나무위키 9월 편성.
 * 우천·재편성 시 구단/KBO 공지가 우선입니다.
 */
export const GAMES_2026: Game[] = [
  {
    id: '2026-08-21-kiwoom',
    date: '2026-08-21',
    startTime: '19:00',
    opponent: '키움 히어로즈',
    opponentShort: '키움',
    venue: 'away',
    stadium: '고척스카이돔',
    series: '원정 3연전',
  },
  {
    id: '2026-08-22-kiwoom',
    date: '2026-08-22',
    startTime: '18:00',
    opponent: '키움 히어로즈',
    opponentShort: '키움',
    venue: 'away',
    stadium: '고척스카이돔',
    series: '원정 3연전',
  },
  {
    id: '2026-08-23-kiwoom',
    date: '2026-08-23',
    startTime: '14:00',
    opponent: '키움 히어로즈',
    opponentShort: '키움',
    venue: 'away',
    stadium: '고척스카이돔',
    series: '원정 3연전',
  },
  {
    id: '2026-08-25-lotte',
    date: '2026-08-25',
    startTime: '18:30',
    opponent: '롯데 자이언츠',
    opponentShort: '롯데',
    venue: 'home',
    stadium: '광주-기아 챔피언스필드',
    series: '홈 3연전',
  },
  {
    id: '2026-08-26-lotte',
    date: '2026-08-26',
    startTime: '18:30',
    opponent: '롯데 자이언츠',
    opponentShort: '롯데',
    venue: 'home',
    stadium: '광주-기아 챔피언스필드',
    series: '홈 3연전',
  },
  {
    id: '2026-08-27-lotte',
    date: '2026-08-27',
    startTime: '18:30',
    opponent: '롯데 자이언츠',
    opponentShort: '롯데',
    venue: 'home',
    stadium: '광주-기아 챔피언스필드',
    series: '홈 3연전',
  },
  {
    id: '2026-08-28-ssg',
    date: '2026-08-28',
    startTime: '18:30',
    opponent: 'SSG 랜더스',
    opponentShort: 'SSG',
    venue: 'home',
    stadium: '광주-기아 챔피언스필드',
    series: '홈 3연전 · 시즌 마지막 주말 18시권',
  },
  {
    id: '2026-08-29-ssg',
    date: '2026-08-29',
    startTime: '18:00',
    opponent: 'SSG 랜더스',
    opponentShort: 'SSG',
    venue: 'home',
    stadium: '광주-기아 챔피언스필드',
    series: '홈 3연전',
  },
  {
    id: '2026-08-30-ssg',
    date: '2026-08-30',
    startTime: '18:00',
    opponent: 'SSG 랜더스',
    opponentShort: 'SSG',
    venue: 'home',
    stadium: '광주-기아 챔피언스필드',
    series: '홈 3연전',
  },
  {
    id: '2026-09-01-nc',
    date: '2026-09-01',
    startTime: '18:30',
    opponent: 'NC 다이노스',
    opponentShort: 'NC',
    venue: 'away',
    stadium: '창원NC파크',
    series: '원정 3연전',
  },
  {
    id: '2026-09-02-nc',
    date: '2026-09-02',
    startTime: '18:30',
    opponent: 'NC 다이노스',
    opponentShort: 'NC',
    venue: 'away',
    stadium: '창원NC파크',
    series: '원정 3연전',
  },
  {
    id: '2026-09-03-nc',
    date: '2026-09-03',
    startTime: '18:30',
    opponent: 'NC 다이노스',
    opponentShort: 'NC',
    venue: 'away',
    stadium: '창원NC파크',
    series: '원정 3연전',
  },
  {
    id: '2026-09-04-kt',
    date: '2026-09-04',
    startTime: '18:30',
    opponent: 'kt wiz',
    opponentShort: 'KT',
    venue: 'home',
    stadium: '광주-기아 챔피언스필드',
    series: '홈 3연전 · 정규 3연전 마지막 홈',
  },
  {
    id: '2026-09-05-kt',
    date: '2026-09-05',
    startTime: '17:00',
    opponent: 'kt wiz',
    opponentShort: 'KT',
    venue: 'home',
    stadium: '광주-기아 챔피언스필드',
    series: '홈 3연전',
  },
  {
    id: '2026-09-06-kt',
    date: '2026-09-06',
    startTime: '14:00',
    opponent: 'kt wiz',
    opponentShort: 'KT',
    venue: 'home',
    stadium: '광주-기아 챔피언스필드',
    series: '홈 3연전',
  },
];

export const TBD_HOME_SERIES = [
  { opponent: 'LG 트윈스', reason: '3연전 미편성 + 5/20 우천취소' },
  { opponent: '키움 히어로즈', reason: '3연전 미편성' },
  { opponent: '한화 이글스', reason: '3연전 미편성' },
  { opponent: 'NC 다이노스', reason: '3연전 미편성 + 7/5 그라운드 사정 취소' },
] as const;
