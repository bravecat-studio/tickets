import games from './games.json';

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
export const GAMES_2026: Game[] = games as Game[];

export const TBD_HOME_SERIES = [
  { opponent: 'LG 트윈스', reason: '3연전 미편성 + 5/20 우천취소' },
  { opponent: '키움 히어로즈', reason: '3연전 미편성' },
  { opponent: '한화 이글스', reason: '3연전 미편성' },
  { opponent: 'NC 다이노스', reason: '3연전 미편성 + 7/5 그라운드 사정 취소' },
] as const;
