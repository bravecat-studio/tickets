import games from './games.json';
import type { HostId } from './hosts';

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
  /** Ticketlink/NOL 좌석 예매 진입 URL. 로그인 필요. */
  reserveUrl?: string;
  /** 서울 원정 홈 구단. 있으면 예매·알람 대상입니다. */
  host?: HostId;
}

/**
 * 2026 잔여 일정 (2026-08-21 기준).
 * 출처: KIA 공식 일정, 야구나라, 나무위키 9월 편성.
 * 예매 오픈·알람은 서울 원정(잠실·고척)만 계산합니다.
 * 우천·재편성 시 구단/KBO 공지가 우선입니다.
 */
export const GAMES_2026: Game[] = games as Game[];

/** 우천·미편성으로 날짜가 나오면 서울 원정만 다시 넣습니다. */
export const TBD_SEOUL_AWAY = [
  { opponent: 'LG 트윈스', stadium: '잠실야구장', reason: '정규 잠실 원정은 8/7–9 3연전으로 종료. 재편성 시만 대상' },
  { opponent: '두산 베어스', stadium: '잠실야구장', reason: '정규 잠실 원정은 6/26–28 3연전으로 종료. 재편성 시만 대상' },
  { opponent: '키움 히어로즈', stadium: '고척스카이돔', reason: '정규 고척 원정은 8/21–23 3연전. 이후 재편성 시만 대상' },
] as const;
