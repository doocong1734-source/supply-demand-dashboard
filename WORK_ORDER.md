# Supply-Demand Dashboard 업그레이드 작업지시서

## 프로젝트 위치
`/Users/kimdoohwan/supply-demand-dashboard/`

## 실행 방법
```bash
cd server && node index.js        # 포트 3001
npm run dev -- --host             # 포트 5173
```

## 현재 구조 요약
- **백엔드**: `server/index.js` — Express, Finnhub WebSocket + Yahoo Finance + Finviz 스크래핑
- **프론트**: `src/App.jsx` — React + Vite, 인라인 스타일 (다크 테마, 색상 상수 `C`)
- **현재 탭**: 통합뷰 / 시세뷰 / 수급뷰 / 관심종목 / 📊랭킹 / 🔍스크리너 / 🌐미주모

---

## 추가할 기능 3가지

---

### 기능 1 — 🎯 M-Score (시장 타이밍 패널)

**목적**: 매일 시장이 매수 가능한 상태인지 자동으로 점수화

**위치**: 새 탭 `🎯 M-Score` 추가 (스크리너 탭 왼쪽)

#### 백엔드: `GET /api/mscore`

`server/index.js`에 추가. 캐시 5분.

계산 로직:
```javascript
// SPY, QQQ 각각 Yahoo Finance /v8/finance/chart?interval=1d&range=1y 로 OHLCV 수집
// 1. MA 포지션 (SPY 기준)
//    - price > SMA50 > SMA150 > SMA200: +25점
//    - price > SMA50 > SMA150: +15점
//    - price > SMA200: +5점
//    - price < SMA200: -20점

// 2. MA200 기울기 (최근 21일 기울기 양수면 +10점)

// 3. 광폭지수 /api/breadth 재사용
//    - ^SPXA200R > 60%: +15점
//    - ^SPXA200R > 40%: +5점
//    - ^SPXA200R < 30%: -15점

// 4. 52주 고점 대비
//    - price > 52주고점 * 0.95: +10점 (고점 근처)
//    - price < 52주고점 * 0.75: -10점 (고점 대비 25% 이상 하락)

// 5. QQQ vs SPY 상대강도
//    - QQQ 최근 20일 수익률 > SPY: +5점 (기술주 강세 = 리스크온)

// 최종 점수: -100 ~ +100
// 상태 판정:
//   >= 50: BULL (🟢 공격적 매수 가능)
//   20~49: CAUTION (🟡 선별적 매수)
//   -19~19: NEUTRAL (⚪ 관망)
//   <= -20: BEAR (🔴 현금 비중 확대)

// 응답 예시:
{
  score: 65,
  status: "BULL",
  label: "공격적 매수 가능",
  color: "#10b981",
  details: {
    maPosition: 25,
    ma200Slope: 10,
    breadth: 15,
    vs52wHigh: 10,
    qqvsSpy: 5,
    breadthRaw: { spxa200r: 72.3, spxa50r: 58.1 }
  },
  spy: { price: 512.3, sma50: 508.1, sma150: 495.2, sma200: 480.5, change1d: 0.8 },
  qqq: { price: 430.2, sma50: 425.0, sma150: 410.3, sma200: 398.1, change1d: 1.1 },
  updatedAt: "2026-03-25T09:00:00Z"
}
```

#### 프론트: MScorePanel 컴포넌트

`src/App.jsx`에 `MScorePanel` 함수 컴포넌트 추가.

UI 구성:
```
┌─────────────────────────────────────────────────────┐
│  🎯 M-Score   [  65  ]  🟢 BULL — 공격적 매수 가능  │
│                                                     │
│  ████████████████████░░░░░  65/100                  │
│                                                     │
│  세부 점수                                           │
│  MA 포지션      ████████  +25                       │
│  MA200 기울기   ████     +10                        │
│  광폭지수       ████████████ +15                    │
│  52주 고점비    ████████  +10                       │
│  QQQ vs SPY    ████     +5                         │
│                                                     │
│  SPY  512.3  SMA50: 508  SMA200: 480  +0.8%        │
│  QQQ  430.2  SMA50: 425  SMA200: 398  +1.1%        │
│                                                     │
│  광폭지수: SPXA200R 72.3%  SPXA50R 58.1%           │
│                                 마지막 갱신: 09:00   │
└─────────────────────────────────────────────────────┘
```

- 배경색은 상태에 따라 변경: BULL=`#10b98110`, CAUTION=`#f59e0b10`, BEAR=`#ef444410`
- 점수 바는 기존 `ScoreCell` 패턴 참고
- 5분마다 자동 갱신

---

### 기능 2 — ⚡ 진입 트리거 탭

**목적**: 오늘 진입 가능한 종목 자동 감지 (스크리너보다 빠른 알림)

**위치**: 새 탭 `⚡ 트리거` 추가

#### 백엔드: `GET /api/triggers`

캐시 5분. 스크리너 유니버스 `nasdaq100` 기준으로 실행.

4가지 트리거 감지:
```javascript
// 1. 52주 신고가 돌파 (Near Breakout)
//    - 기존 /api/indicators/:ticker 의 nearBreakout 필드 활용
//    - 조건: price >= 52주고점 * 0.98 AND 오늘 거래량 > 20일평균거래량 * 1.3

// 2. VCP 완성 (Volatility Contraction Pattern)
//    - 기존 vcpScore >= 3 AND nearBreakout = true

// 3. RS 신고가 (RS Making High)
//    - 기존 rsMakingHigh = true AND stage2 = true

// 4. 포켓피봇 (Pocket Pivot)
//    - 기존 pocketPivot = true AND stage2 = true

// 응답:
{
  breakout52w: [{ ticker, price, high52w, volRatio, rs12m, tpr }],
  vcpComplete: [{ ticker, price, vcpScore, nearBreakout, rs12m }],
  rsMakingHigh: [{ ticker, price, rs12m, rsVsSpy, stage2 }],
  pocketPivot: [{ ticker, price, pocketPivot, stage2, rs12m }],
  updatedAt: "...",
  totalCount: 12
}
```

**최적화**: 전체 유니버스를 한 번에 돌리지 말고, 이미 캐시된 스크리너 결과(`scr4_*`)를 먼저 활용. 없으면 nasdaq100만 실행.

#### 프론트: TriggerPanel 컴포넌트

4개 섹션으로 구분:
```
⚡ 진입 트리거  —  오늘 조건 충족 종목  (총 12개)  [갱신]

┌── 🚀 52주 신고가 돌파 (3) ────────────────────────────┐
│  NVDA  $875  고점대비 99%  거래량 +180%  RS 92         │
│  AAPL  $210  고점대비 98%  거래량 +145%  RS 78         │
└─────────────────────────────────────────────────────┘

┌── 📐 VCP 완성 (2) ────────────────────────────────────┐
│  META  $520  VCP스코어 4/5  RS 88                      │
└─────────────────────────────────────────────────────┘

┌── 📈 RS 신고가 (5) ────────────────────────────────────┐
│  ...                                                   │
└─────────────────────────────────────────────────────┘

┌── 🎯 포켓피봇 (2) ────────────────────────────────────┐
│  ...                                                   │
└─────────────────────────────────────────────────────┘
```

- 각 종목 클릭 시 Finviz 차트로 이동: `https://finviz.com/chart.ashx?t={ticker}&ty=c&ta=1&p=d`
- 결과 없으면 "오늘 조건 충족 종목 없음" 표시
- 5분마다 자동 갱신

---

### 기능 3 — 📊 스크리너 개선 (M-Score 연동)

**목적**: 현재 시장 상태에 따라 스크리너 UI 자동 조정

**기존 파일**: `src/App.jsx`의 `ScreenerPanel` 컴포넌트

추가할 내용:
1. 상단에 M-Score 미니 배지 표시
   - `[🟢 BULL 65]` 형태, 클릭 시 M-Score 탭으로 이동
2. BEAR 상태일 때 스크리너 상단에 경고 배너 (이미 SPY Bear 배너 있음 — M-Score 연동으로 교체)
   - 기존 `spyBear` 조건 → M-Score <= -20 으로 변경
3. M-Score BULL일 때 기본 필터를 공격적으로 (Stage2, VCP 필터 자동 활성화)
   - M-Score >= 50이면 스크리너 첫 로드 시 `stage2: true, vcp: true` 자동 체크

---

## 구현 순서

1. `server/index.js` — `/api/mscore` 엔드포인트 추가
2. `server/index.js` — `/api/triggers` 엔드포인트 추가
3. `src/App.jsx` — `MScorePanel` 컴포넌트 추가 + 탭 등록
4. `src/App.jsx` — `TriggerPanel` 컴포넌트 추가 + 탭 등록
5. `src/App.jsx` — `ScreenerPanel` M-Score 연동 (미니배지 + 조건 변경)

---

## 디자인 규칙 (기존 코드 스타일 유지)

```javascript
const C = {
  bg: "#1a1a1a", surface: "#2d3748", surfaceAlt: "#2a2a2a", border: "#444",
  text: "#e0e0e0", textDim: "#9ca3af", textBright: "#fff",
  green: "#10b981", red: "#ef4444", blue: "#3b82f6", yellow: "#f59e0b",
  // ...
};
```

- 인라인 스타일 사용 (CSS 파일 없음)
- `C.xxx` 색상 상수 활용
- 기존 컴포넌트(`ScoreCell`, `SignalBadge`, `ABCBadge`) 재사용

---

## 주의사항

- `server/index.js` 수정 후 서버 재시작 필수
- Finnhub 무료 티어 레이트 리밋 주의 — 새 엔드포인트는 Yahoo Finance만 사용 (Finnhub 추가 구독 불필요)
- `/api/triggers`는 이미 캐시된 `scr4_*` 데이터 우선 활용하여 API 호출 최소화
- Render 배포: `git push` 후 자동 배포됨
