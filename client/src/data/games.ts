import games from './games.json';
import tbd from './tbd.json';
import scheduleMeta from './schedule-meta.json';
import season from './season.json';
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
  /** 서울 원정 홈 구단(포스트시즌은 KBO). 있으면 예매·알람 대상입니다. */
  host?: HostId;
  /** 와일드카드~한국시리즈. */
  stage?: 'postseason';
  /** 포스트시즌 시리즈 1차전 날짜. 예매 오픈 추정 기준일입니다. */
  saleBaseDate?: string;
}

export interface SeoulAwayTbd {
  opponent: string;
  stadium: string;
  reason: string;
}

/** 시즌 상태. `season-scheduler`가 시즌 종료/시작 시 GitHub Actions 스케줄과 함께 갱신합니다. */
export interface SeasonState {
  status: 'active' | 'ended';
  season: number;
  manual: boolean;
  /** 종료 사유: 포스트시즌 미진출 / 시즌(포스트시즌 포함) 종료 / 수동. */
  reason?: 'no-postseason' | 'season-over' | 'manual';
  updatedAt: string;
}

export interface ScheduleMeta {
  source: string;
  sourceLabel: string;
  updatedAt: string;
  fromDate: string;
  toDate: string;
  gameCount: number;
  tbdCount: number;
  /** 리그 전체 마지막 잔여 경기일(포스트시즌 포함). 시즌 종료 판단에 씁니다. */
  leagueLastDate?: string | null;
  /** 포스트시즌 경기 명단 기준 KIA 진출 여부. */
  postseason?: { kia: 'in' | 'out' | 'unknown'; teams: string[] };
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

export const SEASON: SeasonState = season as SeasonState;
