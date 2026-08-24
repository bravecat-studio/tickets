import { useEffect, useMemo, useRef, useState } from 'react';
import { GAMES_2026, SCHEDULE_META, TBD_SEOUL_AWAY, type Game } from './data/games';
import { HOSTS, SEOUL_HOST_SUMMARY, hostFor, isSeoulAway, ticketUrlFor } from './data/hosts';
import { APP_STORES, OFFICIAL_LINKS } from './data/links';
import type { SaleKind } from './data/policy';
import { HOST_SEATS, SEAT_TIPS } from './data/seats';
import { downloadIcs, salesToIcs } from './lib/ics';
import {
  formatKstDate,
  formatKstDateTime,
  isWeekendPrice,
  kstDateTime,
  msUntil,
  nowKstClock,
  splitDuration,
} from './lib/kst';
import {
  STATUS_LABEL,
  bookingStatus,
  bookableSales,
  nextSales,
  saleWindowsFor,
  type NextSale,
} from './lib/saleWindows';
import { isSmsDue, reminderAt, smsEventKey, smsMessage, SMS_SCHEDULER } from './lib/smsReminder';
import { loadPrefs, savePrefs, type StoredPrefs } from './lib/storage';

const CHECKLIST = [
  { id: 'login', label: '상대 구단 예매처(NOL·티켓링크) 로그인 유지' },
  { id: 'pay', label: '간편결제 카드 등록' },
  { id: 'seat', label: '원정 응원석 1·2순위 결정' },
  { id: 'qty', label: '예매 매수 확정 (일반 최대 8)' },
  { id: 'time', label: '오픈 10분 전 페이지 대기' },
] as const;

function playCue() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = 880;
  gain.gain.value = 0.08;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.35);
}

function openOfficial(game: Game) {
  const url = ticketUrlFor(game);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export default function App() {
  const [now, setNow] = useState(() => new Date());
  const [prefs, setPrefs] = useState<StoredPrefs>(() => loadPrefs());
  const [armed, setArmed] = useState(false);
  const [practiceUntil, setPracticeUntil] = useState<Date | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const fired = useRef<Set<string>>(new Set());
  const smsFired = useRef<Set<string>>(new Set());
  const persistTimer = useRef<number | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => savePrefs(prefs), 200);
  }, [prefs]);

  const seoulGames = useMemo(() => GAMES_2026.filter(isSeoulAway), []);
  const upcoming = useMemo(() => nextSales(GAMES_2026, now, prefs.kinds), [now, prefs.kinds]);
  const onSale = useMemo(() => bookableSales(GAMES_2026, now, prefs.kinds), [now, prefs.kinds]);
  const watchedUpcoming = useMemo(() => {
    if (prefs.watchIds.length === 0) return upcoming;
    return upcoming.filter((item) => prefs.watchIds.includes(item.game.id));
  }, [upcoming, prefs.watchIds]);
  const watchedOnSale = useMemo(() => {
    if (prefs.watchIds.length === 0) return onSale;
    return onSale.filter((item) => prefs.watchIds.includes(item.game.id));
  }, [onSale, prefs.watchIds]);

  const target: NextSale | null = useMemo(() => {
    if (practiceUntil) {
      const game = seoulGames.find((g) => g.id === '2026-08-23-kiwoom') ?? seoulGames[0];
      const host = hostFor(game);
      return {
        game,
        window: {
          kind: 'general',
          label: '연습 오픈',
          at: practiceUntil,
          maxTickets: 8,
          channel: host ? `${host.vendor} (연습)` : '공식 예매처 (연습)',
        },
      };
    }
    return watchedUpcoming[0] ?? upcoming[0] ?? watchedOnSale[0] ?? onSale[0] ?? null;
  }, [practiceUntil, watchedUpcoming, upcoming, watchedOnSale, onSale, seoulGames]);

  const host = target ? hostFor(target.game) : HOSTS.kiwoom;
  const activePolicies = host?.policies ?? HOSTS.kiwoom.policies;
  const remain = target ? msUntil(target.window.at, now) : 0;
  const parts = splitDuration(remain);
  const opened = Boolean(target && remain <= 0);
  const ticketUrl = target ? ticketUrlFor(target.game) : HOSTS.kiwoom.ticketUrl;
  const seats = HOST_SEATS[host?.id ?? 'kiwoom'];
  const seatTips = SEAT_TIPS[host?.id ?? 'kiwoom'];

  useEffect(() => {
    if (!armed || !target || remain > 0) return;
    const key = `${target.game.id}-${target.window.kind}-${target.window.at.toISOString()}`;
    if (fired.current.has(key)) return;
    fired.current.add(key);
    setLog((prev) => [`${formatKstDateTime(new Date())} 오픈 · ${target.game.opponentShort} ${target.window.label}`, ...prev].slice(0, 6));
    playCue();
    if (prefs.notify && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(`서울 원정 vs ${target.game.opponentShort} ${target.window.label} 오픈`, {
        body: '상대 구단 공식 예매처에서 직접 예매하세요. 이 페이지는 예매를 대신하지 않습니다.',
      });
    }
    if (prefs.autoOpen) openOfficial(target.game);
    setArmed(false);
    setPracticeUntil(null);
  }, [armed, target, remain, prefs.notify, prefs.autoOpen]);

  const smsCandidates = prefs.watchIds.length ? watchedUpcoming : upcoming;
  const nextSmsAt = target && remain > 0 ? reminderAt(target.window.at) : null;
  const smsRemain = nextSmsAt ? msUntil(nextSmsAt, now) : 0;

  useEffect(() => {
    if (!prefs.smsHourBefore) return;
    for (const item of smsCandidates) {
      if (!isSmsDue(item.window.at, now)) continue;
      const key = smsEventKey(item);
      if (smsFired.current.has(key)) continue;
      smsFired.current.add(key);
      playCue();
      setLog((prev) =>
        [`${formatKstDateTime(new Date())} 문자/알림 · ${item.game.opponentShort} ${item.window.label} 1시간 전`, ...prev].slice(0, 6)
      );
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`서울 원정 ${item.window.label} 1시간 전`, { body: smsMessage(item) });
      }
    }
  }, [now, prefs.smsHourBefore, smsCandidates]);

  function toggleWatch(id: string) {
    setPrefs((p) => ({
      ...p,
      watchIds: p.watchIds.includes(id) ? p.watchIds.filter((x) => x !== id) : [...p.watchIds, id],
    }));
  }

  function toggleKind(kind: SaleKind) {
    setPrefs((p) => {
      const next = p.kinds.includes(kind) ? p.kinds.filter((k) => k !== kind) : [...p.kinds, kind];
      return { ...p, kinds: next.length ? next : ['general'] };
    });
  }

  async function arm() {
    if (prefs.notify && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    setArmed(true);
    setLog((prev) => [`${formatKstDateTime(new Date())} 대기 모드 시작`, ...prev].slice(0, 6));
  }

  function startPractice() {
    fired.current.clear();
    setPracticeUntil(new Date(Date.now() + 12_000));
    setArmed(true);
  }

  async function practiceSmsAlert() {
    if (prefs.smsHourBefore && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (!target) return;
    playCue();
    setLog((prev) => [`${formatKstDateTime(new Date())} 1시간 전 알림 연습 · ${target.game.opponentShort}`, ...prev].slice(0, 6));
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('서울 원정 예매 오픈 1시간 전 (연습)', { body: smsMessage(target) });
    }
  }

  return (
    <div className="page">
      <div className="stripe" aria-hidden />
      <header className="top">
        <div>
          <p className="kicker">비상업 · 개인 구매 전용 GitHub Pages</p>
          <h1>KIA 타이거즈 서울 원정 예매 도우미</h1>
          <p className="lede">
            잠실(LG·두산)·고척(키움) 원정만 다룹니다. 상대 구단 예매 오픈 시각을 계산하고, 그 경우에만 알림을 보냅니다.
            광주 홈경기와 서울 밖 원정은 일정·알람 대상이 아닙니다.
          </p>
        </div>
        <div className="clock" aria-live="polite">
          <span>KST</span>
          <strong>{nowKstClock(now)}</strong>
        </div>
      </header>

      <aside className="notice">
        <strong>이 사이트는 예매를 대신하지 않습니다.</strong>
        좌석 점유·결제·매크로·암표 기능은 없습니다. 실제 구매는 상대 구단 공식 예매처(NOL 인터파크 또는 티켓링크)에서만
        완료하세요. 일정은 우천·재편성으로 바뀔 수 있으며 홈 구단·KBO 공지가 우선입니다.
      </aside>

      <section className="hero">
        {target ? (
          <>
            <p className="hero__label">{opened ? '오픈됨' : '다음 오픈'}</p>
            <h2>
              {target.window.label} · 서울 원정 vs {target.game.opponentShort}
            </h2>
            <p className="hero__meta">
              경기 {formatKstDate(target.game.date)} {target.game.startTime} · {target.game.stadium}
              <br />
              오픈 {formatKstDateTime(target.window.at)} · {target.window.channel} · 최대 {target.window.maxTickets}매
              {host && (
                <>
                  <br />
                  예매처 {host.vendor} · 원정 응원 {host.awayCheering}
                </>
              )}
              {nextSmsAt && (
                <>
                  <br />
                  문자 알림 {formatKstDateTime(nextSmsAt)}
                  {smsRemain > 0
                    ? ` · ${splitDuration(smsRemain).d}일 ${splitDuration(smsRemain).h}시간 ${splitDuration(smsRemain).m}분 후`
                    : ' · 발송 구간'}
                </>
              )}
            </p>
            <div className="digits" aria-label="남은 시간">
              {[
                ['일', parts.d],
                ['시', parts.h],
                ['분', parts.m],
                ['초', parts.s],
              ].map(([label, value]) => (
                <div key={label} className="digit">
                  <b>{pad(Number(value))}</b>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="hero__actions">
              <a className="btn btn--primary" href={ticketUrl} target="_blank" rel="noreferrer">
                {host ? `${host.vendor} 예매` : '공식 예매'}
              </a>
              {host && (
                <a className="btn" href={host.clubTicketUrl} target="_blank" rel="noreferrer">
                  {host.short} 구단 티켓 안내
                </a>
              )}
              <button
                className="btn"
                type="button"
                onClick={() => downloadIcs('kia-seoul-away-sales.ics', salesToIcs(upcoming.slice(0, 12)))}
              >
                오픈 일정 ICS
              </button>
            </div>
          </>
        ) : (
          <p>표시할 서울 원정 예매 일정이 없습니다. 우천 재편성은 홈 구단·KBO 공지를 확인하세요.</p>
        )}
      </section>

      <section className="panel">
        <h3>대기 모드</h3>
        <p className="hint">
          서울 원정 예매 오픈 시각이 되면 알림·효과음 후 상대 구단 공식 예매 탭을 엽니다. 예매처 로그인은 미리 해 두세요.
          브라우저가 백그라운드면 팝업이 막힐 수 있습니다. 홈경기·서울 밖 원정에는 대기하지 않습니다.
        </p>
        <div className="chips">
          {activePolicies.map((p) => (
            <label key={p.kind} className={prefs.kinds.includes(p.kind) ? 'chip chip--on' : 'chip'}>
              <input type="checkbox" checked={prefs.kinds.includes(p.kind)} onChange={() => toggleKind(p.kind)} />
              {p.label}
            </label>
          ))}
        </div>
        <div className="toggles">
          <label>
            <input
              type="checkbox"
              checked={prefs.autoOpen}
              onChange={(e) => setPrefs((p) => ({ ...p, autoOpen: e.target.checked }))}
            />
            오픈 시 공식 예매창 자동 열기
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.notify}
              onChange={(e) => setPrefs((p) => ({ ...p, notify: e.target.checked }))}
            />
            브라우저 알림
          </label>
        </div>
        <div className="hero__actions">
          <button className="btn btn--primary" type="button" onClick={arm} disabled={armed || !target || opened}>
            {armed ? '대기 중… 이 탭을 유지하세요' : opened ? '이미 오픈됨' : '대기 모드 시작'}
          </button>
          <button className="btn" type="button" onClick={startPractice}>
            12초 연습
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setArmed(false);
              setPracticeUntil(null);
            }}
          >
            해제
          </button>
        </div>
        {log.length > 0 && (
          <ul className="log">
            {log.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3>오픈 1시간 전 문자 알림</h3>
        <p className="hint">
          GitHub Actions가 매시 정각에 일정을 보고, <strong>서울 원정 예매 오픈</strong> 1시간 전부터 오픈 직전 사이에만
          문자를 보냅니다. 광주 홈경기와 창원 등 서울 밖 원정에는 보내지 않습니다. 이 탭이 열려 있으면 같은 시각에
          브라우저 알림으로도 알려 드립니다. 전화번호는 저장소 Secrets에만 두고, 이 페이지에는 넣지 마세요.
        </p>
        <div className="scheduler-row">
          <span
            className={SMS_SCHEDULER.enabled ? 'status-pill status-pill--on' : 'status-pill status-pill--off'}
            title="sms.config.json enabled"
          >
            문자 스케줄러 {SMS_SCHEDULER.enabled ? 'ON' : 'OFF'}
          </span>
          <span className="mini">매시 정각 · 서울 원정만 · 오픈 1시간 전</span>
        </div>
        <div className="toggles">
          <label>
            <input
              type="checkbox"
              checked={prefs.smsHourBefore}
              onChange={(e) => setPrefs((p) => ({ ...p, smsHourBefore: e.target.checked }))}
            />
            이 탭에서 1시간 전 브라우저 알림
          </label>
        </div>
        {nextSmsAt && target && (
          <p className="hero__meta">
            다음 문자 예정: {formatKstDateTime(nextSmsAt)} ({target.window.label} · 서울 원정 vs {target.game.opponentShort})
          </p>
        )}
        <ul className="rules">
          <li>
            문자 스케줄러 on/off: GitHub Actions → <code>sms-reminder</code> → Run workflow에서 <code>scheduler</code>를{' '}
            <code>on</code> 또는 <code>off</code>로 실행합니다. 잔여 서울 원정이 없으면 자동으로 꺼지고, 재편성으로 다시
            생기면 자동으로 켜집니다(수동으로 끈 경우는 그대로 꺼짐). 커밋 없이 긴급히 끄려면 Variables에{' '}
            <code>SMS_REMINDER_ENABLED=false</code>
          </li>
          <li>
            저장소 Secrets: <code>SMS_TO</code>, 그리고 <code>SOLAPI_API_KEY</code> / <code>SOLAPI_API_SECRET</code> /{' '}
            <code>SOLAPI_SENDER</code> 또는 <code>SMS_WEBHOOK_URL</code>
          </li>
          <li>
            대상은 서울 원정뿐이며, 권종은 <code>sms.config.json</code>의 <code>kinds</code> (기본 일반예매).{' '}
            <code>watchIds</code>가 있으면 그 서울 원정만 발송
          </li>
          <li>
            스케줄 워크플로는 <code>main</code>에 머지된 뒤에만 매시 정각에 실행됩니다
          </li>
        </ul>
        <div className="hero__actions">
          <button className="btn" type="button" onClick={practiceSmsAlert} disabled={!target}>
            1시간 전 알림 연습
          </button>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h3>서울 원정 예매 일정</h3>
          <p>잠실·고척 원정만 표시합니다. 관심 경기를 고르면 카운트다운·알림 대상이 됩니다.</p>
        </div>
        <div className="games">
          {seoulGames
            .filter((g) => kstDateTime(g.date, '23:59') >= now || bookingStatus(g, now) !== 'closed')
            .map((game) => {
              const status = bookingStatus(game, now);
              const windows = saleWindowsFor(game);
              const watched = prefs.watchIds.includes(game.id);
              const gameHost = hostFor(game);
              return (
                <article key={game.id} className={`game game--${status} ${watched ? 'game--watched' : ''}`}>
                  <div className="game__when">
                    <strong>{formatKstDate(game.date)}</strong>
                    <span>
                      {game.startTime} · 서울 원정
                    </span>
                  </div>
                  <div className="game__body">
                    <h4>
                      vs {game.opponent}
                      <em>{STATUS_LABEL[status]}</em>
                    </h4>
                    <p>
                      {game.stadium} · {game.series}
                      {gameHost ? ` · ${gameHost.vendor}` : ''}
                      {isWeekendPrice(game.date) ? ' · 주말 요금' : ' · 주중 요금'}
                    </p>
                    <ul className="windows">
                      {windows.map((w) => (
                        <li key={w.kind}>
                          {w.label} {formatKstDateTime(w.at)}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="game__cta">
                    <button className={watched ? 'btn btn--tiny btn--on' : 'btn btn--tiny'} type="button" onClick={() => toggleWatch(game.id)}>
                      {watched ? '관심 해제' : '관심'}
                    </button>
                    <a className="btn btn--tiny btn--primary" href={ticketUrlFor(game)} target="_blank" rel="noreferrer">
                      공식 예매
                    </a>
                  </div>
                </article>
              );
            })}
        </div>
      </section>

      {TBD_SEOUL_AWAY.length > 0 && (
        <section className="panel">
          <h3>이후 서울 원정 (일정 미정)</h3>
          <p className="hint">
            잔여 잠실·고척 원정이 아직 없으면 아래에 둡니다. 우천 재편성이 나오면 GitHub Actions가 네이버 스포츠 KBO
            일정을 가져와 예매 오픈과 알람을 다시 넣습니다.
          </p>
          <ul className="tbd">
            {TBD_SEOUL_AWAY.map((row) => (
              <li key={row.opponent}>
                <b>
                  {row.opponent} · {row.stadium}
                </b>
                <span>{row.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid-2">
        <div className="panel">
          <h3>서울 원정 예매 정책</h3>
          <table>
            <thead>
              <tr>
                <th>구장</th>
                <th>상대</th>
                <th>예매처</th>
                <th>일반예매</th>
              </tr>
            </thead>
            <tbody>
              {SEOUL_HOST_SUMMARY.map((row) => (
                <tr key={row.id}>
                  <td>{row.stadium}</td>
                  <td>{row.name}</td>
                  <td>
                    <a href={row.ticketUrl} target="_blank" rel="noreferrer">
                      {row.vendor}
                    </a>
                  </td>
                  <td>{row.generalOpen}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <thead>
              <tr>
                <th>구분</th>
                <th>오픈</th>
                <th>매수</th>
                <th>채널</th>
              </tr>
            </thead>
            <tbody>
              {activePolicies.map((p) => (
                <tr key={p.kind}>
                  <td>
                    {p.label}
                    <div className="mini">{p.eligible}</div>
                  </td>
                  <td>
                    {p.when} {p.openClock}
                  </td>
                  <td>{p.maxTickets}매</td>
                  <td>{p.channel}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="rules">
            {(host?.rules ?? HOSTS.kiwoom.rules).map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h3>개인 준비 체크</h3>
          <div className="prefs">
            <label>
              1순위 좌석
              <input value={prefs.seatFirst} onChange={(e) => setPrefs((p) => ({ ...p, seatFirst: e.target.value }))} />
            </label>
            <label>
              2순위 좌석
              <input value={prefs.seatSecond} onChange={(e) => setPrefs((p) => ({ ...p, seatSecond: e.target.value }))} />
            </label>
            <label>
              매수
              <input
                type="number"
                min={1}
                max={8}
                value={prefs.qty}
                onChange={(e) => setPrefs((p) => ({ ...p, qty: Number(e.target.value) || 1 }))}
              />
            </label>
          </div>
          <ul className="checks">
            {CHECKLIST.map((item) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(prefs.checklist[item.id])}
                    onChange={(e) =>
                      setPrefs((p) => ({ ...p, checklist: { ...p.checklist, [item.id]: e.target.checked } }))
                    }
                  />
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <h3>{host?.stadium ?? '고척스카이돔'} 좌석·요금 참고</h3>
        <p className="hint">{seatTips.join(' ')}</p>
        <div className="seats">
          {seats.map((seat) => (
            <div key={seat.name} className="seat">
              <div>
                <b>{seat.name}</b>
                {seat.appOnly && <span className="tag">앱</span>}
              </div>
              <p>
                주중 {seat.weekday.toLocaleString('ko-KR')}원 · 주말 {seat.weekend.toLocaleString('ko-KR')}원
              </p>
              <small>{seat.note}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>공식 채널</h3>
        <div className="links">
          <a href={OFFICIAL_LINKS.kiwoomInterpark} target="_blank" rel="noreferrer">
            키움 NOL 예매
          </a>
          <a href={OFFICIAL_LINKS.lgTicketlink} target="_blank" rel="noreferrer">
            LG 티켓링크 예매
          </a>
          <a href={OFFICIAL_LINKS.interparkSports} target="_blank" rel="noreferrer">
            NOL 스포츠
          </a>
          <a href={APP_STORES.interparkAndroid} target="_blank" rel="noreferrer">
            NOL 앱 (Play)
          </a>
          <a href={APP_STORES.ticketlinkAndroid} target="_blank" rel="noreferrer">
            티켓링크 앱 (Play)
          </a>
          <a href={OFFICIAL_LINKS.tigersSchedule} target="_blank" rel="noreferrer">
            KIA 경기 일정
          </a>
        </div>
      </section>

      <footer className="foot">
        KIA 타이거즈·키움·LG·두산·NOL·티켓링크와 무관한 개인용 서울 원정 일정 도우미입니다. 상표·일정·요금의 권리는
        각 구단과 예매처에 있습니다. 잔여 일정은 {SCHEDULE_META.sourceLabel} 기준으로{' '}
        {formatKstDateTime(new Date(SCHEDULE_META.updatedAt))}에 자동 갱신했습니다.
      </footer>
    </div>
  );
}
