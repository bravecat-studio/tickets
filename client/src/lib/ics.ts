import { ticketUrlFor } from '../data/hosts';
import type { NextSale } from './saleWindows';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toUtcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
  );
}

export function salesToIcs(items: NextSale[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KIA Tigers Seoul away ticket helper//KO',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:KIA 타이거즈 서울 원정 예매 오픈',
  ];
  for (const item of items) {
    const start = item.window.at;
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const uid = `${item.game.id}-${item.window.kind}@tigers-helper`;
    const summary = `${item.window.label} 오픈 · 서울 원정 vs ${item.game.opponentShort}`;
    const desc = `${item.game.date} ${item.game.startTime} ${item.game.stadium}\\n공식 예매: ${ticketUrlFor(item.game)}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${toUtcStamp(new Date())}`,
      `DTSTART:${toUtcStamp(start)}`,
      `DTEND:${toUtcStamp(end)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:예매 오픈 1시간 전',
      'TRIGGER:-PT1H',
      'END:VALARM',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
