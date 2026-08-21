const KST = 'Asia/Seoul';

const kstDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: KST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const kstWeekday = new Intl.DateTimeFormat('en-US', {
  timeZone: KST,
  weekday: 'short',
});

const kstClock = new Intl.DateTimeFormat('ko-KR', {
  timeZone: KST,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const kstFull = new Intl.DateTimeFormat('ko-KR', {
  timeZone: KST,
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function kstDateTime(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+09:00`);
}

export function formatKstDate(date: string): string {
  const d = kstDateTime(date, '12:00');
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  }).format(d);
}

export function formatKstDateTime(iso: Date): string {
  return kstFull.format(iso);
}

export function nowKstClock(now = new Date()): string {
  return kstClock.format(now);
}

export function kstYmd(now = new Date()): string {
  return kstDay.format(now);
}

export function shiftKstDate(date: string, days: number): string {
  const noon = kstDateTime(date, '12:00');
  return kstDay.format(new Date(noon.getTime() + days * 86_400_000));
}

export function isWeekendPrice(date: string): boolean {
  const wd = kstWeekday.format(kstDateTime(date, '12:00'));
  return wd === 'Fri' || wd === 'Sat' || wd === 'Sun';
}

export function msUntil(target: Date, now = new Date()): number {
  return target.getTime() - now.getTime();
}

export function splitDuration(ms: number): { d: number; h: number; m: number; s: number } {
  const clamped = Math.max(0, ms);
  const s = Math.floor(clamped / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}
