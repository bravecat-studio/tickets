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
2. 솔라피 API Key는 **허용 IP를 "모든 IP 허용"** 으로 발급해야 합니다. GitHub 호스팅 러너는 실행마다 IP가 바뀌어서 특정 IP만 허용하면 발송이 차단됩니다.
3. `sms.config.json`에서 `kinds`(기본 `general`)와 필요하면 `watchIds`를 지정합니다.
4. 워크플로는 **기본 브랜치(`main`)** 에서만 스케줄 실행됩니다. Actions에서 `sms-reminder`를 수동 실행하면 테스트할 수 있습니다.

### 발송이 실패하면

발송 경로가 막혀도 알림 자체를 놓치지 않도록 이렇게 동작합니다.

- 매 실행 전에 솔라피 잔액 조회로 발송 경로를 미리 점검합니다. 막혀 있으면 발송 대상이 없는 시각에도 원인을 미리 알려 줍니다.
- 일시적 오류(429·5xx, 서명 시각 오차)는 두 번까지 재시도합니다.
- 설정 문제(허용 IP 차단, 키 불일치 등)는 재시도해도 소용없으므로 곧바로 원인과 해결 방법을 로그·실행 요약에 남깁니다.
- 문자가 어느 채널로도 나가지 않으면 **같은 내용을 GitHub 이슈로 남깁니다.** 이슈 알림(메일·앱 푸시)으로 예매 오픈 정보를 그대로 받습니다. 같은 경기·예매 구분에는 이슈를 하나만 만들고, 발송 경로가 복구되면 원인 알림 이슈는 자동으로 닫힙니다.
- 이슈 대체 알림까지 실패하면 워크플로가 실패(빨간 X)로 끝납니다. 대체 알림을 쓰고 싶지 않으면 `sms.config.json`의 `issueFallback`을 `false`로 둡니다(이 경우 발송 실패는 곧 워크플로 실패입니다).

### 자주 보는 실패 원인

| 로그 | 원인 | 해결 |
| --- | --- | --- |
| `solapi 403 ... 허용되지 않은 IP(...)로 접근하고 있습니다` | 솔라피 API Key에 허용 IP가 지정되어 있음 | 솔라피 콘솔 → API Key 관리에서 해당 키를 **모든 IP 허용**으로 변경(또는 키 재발급). 제한을 유지해야 하면 고정 IP 서버에 게이트를 두고 `SMS_WEBHOOK_URL`로 연결 |
| `solapi 403 InvalidAPIKey` / `SignatureDoesNotMatch` | 키·시크릿이 짝이 맞지 않거나 폐기됨 | 콘솔에서 재발급 후 `SOLAPI_API_KEY`·`SOLAPI_API_SECRET` 시크릿 갱신 |
| `문자 발송 수단이 설정되지 않았습니다` | 시크릿 미등록 | 위 설정 항목대로 시크릿 등록 |

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
| `npm run test` | 예매 오픈 시각 단위 테스트 + 문자 발송·재시도·대체 알림 통합 테스트 |
| `npm run build` | 서버+클라이언트 빌드 |
| `npm run sms:reminder:dry` | 지금 시각 기준 문자 대상 로그 (미발송) |

일정 데이터가 바뀌면 `client/src/data/games.ts` 를 수정하세요.
