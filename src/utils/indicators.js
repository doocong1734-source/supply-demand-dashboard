// ─── 수급 점수 계산 ─────────────────────────────────────────
// 제거된 지표: VWAP이탈(단기노이즈), A/D라인(OBV중복), 주문흐름델타(노이즈)
// 9개 지표 → 추세(4) + 수급(4) + 시장(1)
export function calcScore(indicators) {
    const { obv, mfi, rsi, bbPos, volRatio, sma200Dev, macdHist, shortInt, breadth } = indicators;
    let score = 0;

    // ── 추세 (최대 ±45) ──────────────────────────────────────
    // SMA200: 장기 추세 방향 (가장 중요한 필터)
    if (sma200Dev < -15) score += 12;       // 장기 과매도, 반등 기회
    else if (sma200Dev < -5) score += 6;
    else if (sma200Dev > 25) score -= 12;   // 장기 과열
    else if (sma200Dev > 10) score -= 5;

    // MACD 히스토그램: 단기 모멘텀 방향
    if (macdHist > 0) score += 10; else if (macdHist < 0) score -= 10;

    // RSI(14): 과매도/과매수 (반전 신호)
    if (rsi < 30) score += 20;             // 강한 과매도
    else if (rsi < 40) score += 8;
    else if (rsi > 75) score -= 18;         // 강한 과매수
    else if (rsi > 65) score -= 8;

    // BB 포지션: 밴드 내 위치 (평균회귀)
    if (bbPos < 15) score += 13;           // 하단밴드 이탈
    else if (bbPos < 30) score += 5;
    else if (bbPos > 85) score -= 12;       // 상단밴드 이탈
    else if (bbPos > 70) score -= 4;

    // ── 수급 (최대 ±40) ──────────────────────────────────────
    // OBV 다이버전스: 거래량 기반 매집/분산
    if (obv > 30) score += 15; else if (obv < -30) score -= 15;

    // MFI: 거래량 가중 자금흐름
    if (mfi < 20) score += 15; else if (mfi > 80) score -= 15;

    // 거래량 비율: 수급 이상 신호
    if (volRatio > 200) score += 8;        // 거래량 급증 = 추세 확인
    else if (volRatio < 40) score -= 5;    // 거래량 급감 = 관심 저하

    // 공매도 비율: 숏커버 잠재력
    if (shortInt != null && shortInt > 15) score += 8;  // 숏스퀴즈 가능성

    // ── 시장 환경 (최대 ±8) ──────────────────────────────────
    // 시장 광폭: 전체 시장 분위기
    if (breadth < 25) score += 8;          // 과매도 = 반등 환경
    else if (breadth > 75) score -= 5;     // 과매수 = 조정 주의

    return Math.max(-100, Math.min(100, score));
}

export function scoreToSignal(score) {
    if (score >= 60) return { signal: "강력매수", phase: "매집완료" };
    if (score >= 30) return { signal: "매수",   phase: "초기매집" };
    if (score >= 10) return { signal: "관망↑",  phase: "손바뀜" };
    if (score >= -10) return { signal: "중립",  phase: "균형" };
    if (score >= -30) return { signal: "관망↓", phase: "분산초기" };
    if (score >= -60) return { signal: "매도",  phase: "분산중" };
    return { signal: "강력매도", phase: "투매" };
}
