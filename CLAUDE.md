# Supply-Demand Dashboard — CLAUDE.md

## 프로젝트 개요

미국 주식 수급 분석 대시보드. ETF/섹터 시세 + 기술지표 수급점수 + Minervini 스크리너.

## 실행 방법

```bash
# 서버 (포트 3001)
cd server && node index.js

# 프론트 (포트 5173)
npm run dev -- --host
```

## 파일 구조

```
supply-demand-dashboard/
├── server/
│   └── index.js          # Express API 서버 (전체 백엔드 로직)
├── src/
│   ├── App.jsx           # 메인 컴포넌트 (전체 UI)
│   ├── hooks/
│   │   ├── useMarketData.js   # 시세+지표 30초 자동 갱신
│   │   └── useFavorites.js    # 관심목록 (localStorage sd_watchlists_v2)
│   └── utils/
│       └── indicators.js      # calcScore / scoreToSignal
├── package.json          # 프론트 의존성 (React, Vite)
└── server/package.json   # 서버 의존성 (Express, axios, node-cache, ws)
```

## API 엔드포인트 (서버)

| 엔드포인트 | 설명 | 캐시 |
|-----------|------|------|
| `GET /api/quotes` | 전체 시세 (Finnhub 실시간 + Yahoo) | 60초 |
| `GET /api/indicators/:ticker` | OHLCV 기술지표 (90일 일봉) | 5분 |
| `GET /api/options/:ticker` | 옵션 PC비율/감마 | 5분 |
| `GET /api/breadth` | 시장 광폭 ^SPXA50R/^SPXA200R | 5분 |
| `GET /api/cot/:ticker` | COT 근사 + 공매도 비율 | 1시간 |
| `GET /api/screener/run` | Minervini 스크리너 (SSE 스트림) | - |
| `GET /api/health` | 헬스 체크 | - |

## 데이터 소스

- **Finnhub**: WebSocket 실시간 체결가 + REST (OHLC, prevClose)
  - `wss://ws.finnhub.io?token={FINNHUB_TOKEN}`
  - 레이트 리미트: 직렬 큐로 관리
- **Yahoo Finance**: OHLCV 차트, 옵션체인, 광폭 지수
  - `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}`
- **Finviz**: 펀더멘탈 스크래핑 (P/E, EPS, 매출, 기관, ROE)
  - `https://finviz.com/quote.ashx?t={ticker}`
  - 캐시 키: `fviz2_{ticker}` (24시간)

## 캐시 전략

```javascript
cache    = NodeCache({ stdTTL: 300 })    // 5분 (시세, 지표)
dayCache = NodeCache({ stdTTL: 86400 })  // 24시간 (OHLCV, 펀더멘탈)
```

주요 캐시 키:
- 시세: `quotes_fh_{tickers}`, `quotes_yf_{tickers}`
- 지표: `ind_{ticker}`
- 스크리너 결과: `scr4_{ticker}` (60초)
- Finviz: `fviz2_{ticker}` (24시간)

## 스크리너 (`/api/screener/run`)

**쿼리 파라미터**: `universe`, `minPrice`, `maxPrice`, `limit`, `custom`

**universe 옵션**: `nasdaq100` | `sp500` | `sp100` | `both` | `russell2000` | `custom`

**SSE 이벤트 순서**: `marketStatus` → `progress` × N → `result` × N → `done`

**필터 단계**:
1. 가격 범위
2. 기술 분석 (Stage2, VCP, Pocket Pivot, Near Breakout, RS vs SPY)
3. Finviz 펀더멘탈 (fundGrade = EPS≥20% + SalesQQ≥10% + ROE≥15%)

**Russell 2000 최적화**: 기술 필터 통과 종목만 Finviz 호출. 그 외 소규모 유니버스는 항상 호출.

## 스크리너 출력 필드

```javascript
{
  ticker, price, tpr, rpr, rs12m, rsVsSpy, vcpScore,
  stage2, stage2Loose, stage2VeryLoose,
  bnb, tprA, momentum, qualifier, top5Rpr,
  vcp, rsMakingHigh, pocketPivot, nearBreakout, fundGrade,
  pe, fpe, epsThisY, epsNextY, eps5Y, salesQQ, instTrans, shortFloat, roe,
}
```

## 수급 점수 계산 (`calcScore`)

```
입력: obv, mfi, rsi, bbPos, volRatio, sma200Dev, macdHist, shortInt, breadth
출력: -100 ~ +100

추세 (±45): SMA200편차 + MACD히스토 + RSI + BB위치
수급 (±40): OBV + MFI + 거래량비율 + 공매도비율
시장 (±8):  광폭지수
```

신호 변환 (`scoreToSignal`):
- ≥60: 강력매수 / 매집완료
- 30~59: 매수 / 초기매집
- 10~29: 관망↑ / 손바뀜
- -10~9: 중립 / 균형
- -30~-11: 관망↓ / 분산초기
- -60~-31: 매도 / 분산중
- <-60: 강력매도 / 투매

## 관심목록 (`useFavorites`)

- localStorage 키: `sd_watchlists_v2`
- 여러 목록 지원 (다중 watchlist)
- Dashboard에서 한 번 호출 후 ScreenerPanel에 props로 전달 (상태 공유)

## 주요 뷰 (App.jsx)

- **통합뷰**: 시세 + 수급점수
- **시세뷰**: 가격/변동률만
- **수급뷰**: 수급점수/시그널만
- **관심종목**: 즐겨찾기 목록
- **📊 랭킹**: RankingsPanel
- **🔍 스크리너**: ScreenerPanel (Minervini)
- **🌐 미주모**: iframe 임베드 (mijoomo.com)

## 스크리너 UI 기능

- 필터 모드: OR(하나이상) / 그룹AND / 전체AND(엄격)
- 수치 필터: RPR≥, RS/SPY≥, EPS올해≥, 매출Q≥
- 프리셋 저장/불러오기 (localStorage `screener_presets_v1`)
- CSV 내보내기 (BOM UTF-8, Excel 호환)
- 신호별 알림: VCP+돌파임박, RS신고가, 포켓피봇, 펀더멘탈우수
- 종합 패스 수(passCount) 컬럼 — 기본 정렬 기준
- SPY Caution/Bear 시 경고 배너 + 자동 필터 적용

## 종목 유니버스

```javascript
NASDAQ100  // 101개
SP100      // 91개
SP500      // 496개
```

Russell 2000은 iShares ETF API에서 실시간 로드.

## 알려진 주의사항

- Finviz HTML 구조 3가지: `<b>값</b>` / `<b><span>값</span></b>` / `<a><b>값</b></a>`
- "EPS this Q"는 Finviz 개별 페이지에 없음 → "EPS this Y" 사용
- 서버 코드 변경 후 반드시 재시작 필요 (`taskkill /F /PID` 후 `node index.js`)
- SP500 스크리닝은 시간이 오래 걸림 — limit 파라미터로 조절
