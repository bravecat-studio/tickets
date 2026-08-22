# KIA 타이거즈 예매 일정 도우미

비상업·개인 구매용 GitHub Pages 사이트입니다. 기아 타이거즈 홈경기 **예매 오픈 시각**을 계산하고, 오픈 시각에 **공식 티켓링크**로 안내합니다.

실제 좌석 점유·결제·매크로는 포함하지 않습니다. 구매는 항상 아래 공식 채널에서 완료하세요.

- 구단 입장권: https://tigers.co.kr/ticket/reservation
- 티켓링크 KIA: https://www.ticketlink.co.kr/sports/137/58
- 티켓링크 좌석 예매(로그인): https://www.ticketlink.co.kr/reserve/plan/schedule/387652530?menuIndex=reserve

배포 주소(GitHub Pages 활성화 후): https://bravecat-studio.github.io/tickets/

## 무엇을 하나요

- 2026 잔여 홈경기 기준으로 선선예매(D-8 10:00), 선예매(D-8 10:30), 일반예매(D-7 11:00, KST) 카운트다운
- 대기 모드: 오픈 시각에 알림·효과음 후 공식 예매 탭 열기
- 관심 경기, 좌석 1·2순위, 준비 체크리스트 (브라우저 localStorage)
- 예매 오픈 **1시간 전 문자 알림** (GitHub Actions + 솔라피/웹훅)
- 오픈 일정 ICS 다운로드 (1시간 전 캘린더 알림 포함)
- 좌석·요금 참고표 (구단 안내 기준, 예매 시점 표시가 최종)

원정 경기는 상대 구단 예매처를 이용해야 하므로 홈경기만 오픈 계산 대상입니다.

## GitHub Pages

1. 저장소 Settings → Pages → **GitHub Actions** 를 소스로 선택합니다.
2. `main`에 푸시하거나 Actions에서 `github-pages` 워크플로를 실행합니다.
3. 사이트는 `/tickets/` 경로로 빌드됩니다 (`BASE_PATH=/tickets/`).

로컬 미리보기:

```bash
npm install
npm run dev:client
```

http://localhost:5173 을 엽니다. 선택 API(`npm run dev:server`)는 예전 메모 트래커용이며 Pages 사이트에는 필요 없습니다.

## 오픈 1시간 전 문자

정적 GitHub Pages는 문자를 직접 보내지 못합니다. `sms-reminder` 워크플로가 **매시 정각**에 일정을 확인하고, 오픈 1시간 전부터 오픈 직전 사이에 발송합니다.

### 스케줄러 on/off

문자 발송은 기본이 켜짐입니다. **GitHub Actions 워크플로에서 켜고 끕니다.**

1. Actions → `sms-reminder` → **Run workflow**
2. `scheduler`에서 `on`(켜기) 또는 `off`(끄기)를 고른 뒤 실행
3. 기본값 `run`은 설정을 바꾸지 않고 지금 한 번만 검사/발송합니다

이 선택은 `sms.config.json`의 `enabled`에 저장되어 이후 매시 정각 실행에 적용됩니다. 홈페이지의 ON/OFF 표시는 다음 Pages 배포 때 맞춰집니다.

커밋 없이 긴급히 끄려면 Settings → Secrets and variables → Actions → Variables에 `SMS_REMINDER_ENABLED=false`를 넣습니다. 다시 켜려면 변수를 `true`로 바꾸거나 삭제합니다.

수동 실행에서 `force`를 켜면 스케줄러가 꺼져 있어도 이번만 보낼 수 있습니다.

### 설정

1. 저장소 Settings → Secrets에 다음을 넣습니다.
   - `SMS_TO`: 수신 번호 (예: `01012345678`)
   - 솔라피: `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER` (사전등록 발신번호)
   - 또는 직접 문자 게이트: `SMS_WEBHOOK_URL` (JSON `{ to, text, events }` POST)
2. `sms.config.json`에서 `kinds`(기본 `general`)와 필요하면 `watchIds`를 지정합니다.
3. 워크플로는 **기본 브랜치(`main`)** 에서만 스케줄 실행됩니다. Actions에서 `sms-reminder`를 수동 실행하면 테스트할 수 있습니다.

탭을 열어 두면 같은 시각에 브라우저 알림도 뜹니다. 로컬 점검:

```bash
npm test
NOW=2026-08-22T10:05:00+09:00 DRY_RUN=1 npm run sms:reminder
```

## 정책 요약 (2026)

| 구분 | 오픈 | 최대 매수 | 채널 |
| --- | --- | --- | --- |
| 선선예매 (시즌권) | 경기일 D-8 10:00 | 2 | 타이거즈 앱 |
| 선예매 (얼리패스) | 경기일 D-8 10:30 | 2 | 타이거즈 앱 |
| 일반예매 | 경기일 D-7 11:00 | 8 | 티켓링크 웹·앱 / 타이거즈 앱 |

온라인 예매는 구단 FAQ 기준 경기 시작 2시간 전까지, 취소는 시작 4시간 전까지입니다. 우천·재편성 시 구단/KBO 공지가 우선입니다.

## 개발 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev:client` | Vite 개발 서버 (5173) |
| `npm run test` | 예매 오픈 시각 단위 테스트 |
| `npm run build` | 서버+클라이언트 빌드 |
| `npm run sms:reminder:dry` | 지금 시각 기준 문자 대상 로그 (미발송) |

일정 데이터가 바뀌면 `client/src/data/games.ts` 를 수정하세요.
