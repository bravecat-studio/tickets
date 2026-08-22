import games from './games.json';
import tbd from './tbd.json';
import scheduleMeta from './schedule-meta.json';
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

export interface SeoulAwayTbd {
  opponent: string;
  stadium: string;
  reason: string;
}

export interface ScheduleMeta {
  source: string;
  sourceLabel: string;
  updatedAt: string;
  fromDate: string;
  toDate: string;
  gameCount: number;
  tbdCount: number;
}

/**
 * 잔여 KIA 일정. GitHub Actions `update-schedule`이 네이버 스포츠 KBO 일정으로 갱신합니다.
 * 예매 오픈·알람은 서울 원정(잠실·고척)만 계산합니다.
 * 우천·재편성 시 구단/KBO 공지가 우선입니다.
 */
export const GAMES_2026: Game[] = games as Game[];

/** 잔여 서울 원정이 없는 상대. 재편성 일정이 들어오면 games.json으로 옮겨집니다. */
export const TBD_SEOUL_AWAY: readonly SeoulAwayTbd[] = tbd as SeoulAwayTbd[];

export const SCHEDULE_META: ScheduleMeta = scheduleMeta as ScheduleMeta;
