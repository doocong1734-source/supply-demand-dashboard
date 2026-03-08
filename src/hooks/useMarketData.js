import { useState, useEffect, useCallback, useRef } from "react";
import { calcScore, scoreToSignal } from "../utils/indicators.js";

const API = "http://localhost:3001";
const REFRESH_INTERVAL = 30000;

const STOCK_GROUPS = {
    "Indices": [
        { t: "QQQE", s: "Broad Market" }, { t: "MGK", s: "Broad Market" }, { t: "QQQ", s: "Information Technology" },
        { t: "IBIT", s: "Commodities" }, { t: "RSP", s: "Broad Market" }, { t: "MDY", s: "Broad Market" },
        { t: "IWM", s: "Broad Market" }, { t: "TLT", s: "Broad Market" }, { t: "SPY", s: "Broad Market" },
        { t: "DIA", s: "Broad Market" },
    ],
    "S&P Style ETFs": [
        { t: "IJS", s: "Broad Market" }, { t: "IJR", s: "Broad Market" }, { t: "IJT", s: "Broad Market" },
        { t: "IJJ", s: "Broad Market" }, { t: "IJH", s: "Broad Market" }, { t: "IJK", s: "Broad Market" },
        { t: "IVE", s: "Broad Market" }, { t: "IVV", s: "Broad Market" }, { t: "IVW", s: "Broad Market" },
    ],
    "Sel Sectors": [
        { t: "XLK", s: "Information Technology" }, { t: "XLI", s: "Industrials" }, { t: "XLC", s: "Communication Services" },
        { t: "XLF", s: "Financials" }, { t: "XLU", s: "Utilities" }, { t: "XLY", s: "Consumer Discretionary" },
        { t: "XLRE", s: "Real Estate" }, { t: "XLP", s: "Consumer Staples" }, { t: "XLB", s: "Materials" },
        { t: "XLE", s: "Energy" }, { t: "XLV", s: "Health Care" },
    ],
    "Industries": [
        { t: "SMH", s: "Information Technology" }, { t: "ARKK", s: "Information Technology" }, { t: "XBI", s: "Health Care" },
        { t: "KWEB", s: "Emerging Markets" }, { t: "XRT", s: "Consumer Discretionary" }, { t: "KRE", s: "Financials" },
        { t: "ROBO", s: "Industrials" }, { t: "AIQ", s: "Information Technology" }, { t: "IGV", s: "Information Technology" },
        { t: "WCLD", s: "Information Technology" }, { t: "PAVE", s: "Industrials" }, { t: "BLOK", s: "Information Technology" },
        { t: "XOP", s: "Energy" }, { t: "FDN", s: "Consumer Discretionary" }, { t: "IBB", s: "Health Care" },
        { t: "GLD", s: "Commodities" }, { t: "GDX", s: "Materials" }, { t: "USO", s: "Commodities" },
        { t: "XHB", s: "Consumer Discretionary" }, { t: "FNGS", s: "Broad Market" }, { t: "VNQ", s: "Real Estate" },
        { t: "TAN", s: "Energy" }, { t: "URA", s: "Energy" }, { t: "LIT", s: "Materials" },
        { t: "JETS", s: "Consumer Discretionary" }, { t: "KBE", s: "Financials" }, { t: "OIH", s: "Energy" },
        { t: "SLV", s: "Commodities" }, { t: "SOCL", s: "Communication Services" }, { t: "CIBR", s: "Information Technology" },
    ],
    "Countries": [
        { t: "EWY", s: "Emerging Markets" }, { t: "EWJ", s: "Emerging Markets" }, { t: "MCHI", s: "Emerging Markets" },
        { t: "FXI", s: "Emerging Markets" }, { t: "INDA", s: "Emerging Markets" }, { t: "EWZ", s: "Emerging Markets" },
        { t: "EWG", s: "Broad Market" }, { t: "EFA", s: "Broad Market" }, { t: "IEUR", s: "Broad Market" },
        { t: "EEM", s: "Emerging Markets" }, { t: "EWT", s: "Emerging Markets" }, { t: "ASHR", s: "Emerging Markets" },
        { t: "TUR", s: "Emerging Markets" }, { t: "EWH", s: "Emerging Markets" }, { t: "ACWI", s: "Broad Market" },
    ],
};

const LEVERAGED = {
    QQQ: { l: ["TQQQ"], s: ["SQQQ"] }, SPY: { l: ["SPXL"], s: ["SPXS"] }, IWM: { l: ["TNA"], s: ["TZA"] },
    TLT: { l: ["TMF"], s: ["TMV"] }, XLK: { l: ["TECL"], s: ["TECS"] }, XLF: { l: ["FAS"], s: ["FAZ"] },
    SMH: { l: ["SOXL"], s: ["SOXS"] }, ARKK: { l: ["TARK"], s: ["SARK"] }, XBI: { l: ["LABU"], s: ["LABD"] },
    XLE: { l: ["ERX"], s: ["ERY"] }, GLD: { l: ["UGL"], s: ["GLL"] }, GDX: { l: ["NUGT"], s: ["JDST"] },
    XOP: { l: ["GUSH"], s: ["DRIP"] }, FXI: { l: ["YINN"], s: ["YANG"] }, USO: { l: ["UCO"], s: ["SCO"] },
    SLV: { l: ["AGQ"], s: ["ZSL"] }, IBIT: { l: ["BITX"], s: ["SBIT"] }, EEM: { l: ["EDC"], s: ["EDZ"] },
    EWY: { l: ["KORU"], s: [] }, KWEB: { l: ["CWEB"], s: [] },
};

const ALL_TICKERS = Object.values(STOCK_GROUPS).flat().map(x => x.t);

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
}

async function fetchIndicatorsBatch(tickers) {
    const results = {};
    const BATCH = 8; // 서버 병렬 요청 조절
    for (let i = 0; i < tickers.length; i += BATCH) {
        const batch = tickers.slice(i, i + BATCH);
        const settled = await Promise.allSettled(
            batch.map(t => fetchJSON(`${API}/api/indicators/${t}`))
        );
        batch.forEach((t, idx) => {
            if (settled[idx].status === "fulfilled") results[t] = settled[idx].value;
        });
    }
    return results;
}

function buildRows(quotes, indicators, breadthData, cotCache) {
    const result = {};
    for (const [group, tickers] of Object.entries(STOCK_GROUPS)) {
        result[group] = tickers.map(item => {
            const q = quotes[item.t] || {};
            const ind = indicators[item.t] || {};
            const cot = cotCache[item.t] || {};
            const lev = LEVERAGED[item.t] || { l: [], s: [] };

            const indObj = {
                obv: ind.obv ?? 0,
                mfi: ind.mfi ?? 50,
                vwapDev: ind.vwapDev ?? 0,
                adlTrend: ind.adlTrend ?? "중립",
                rsi: ind.rsi ?? 50,
                bbPos: ind.bbPos ?? 50,
                volRatio: ind.volRatio ?? 100,
                sma200Dev: ind.sma200Dev ?? 0,
                macdHist: ind.macdHist ?? 0,
                shortInt: cot.shortInt ?? null,
                breadth: breadthData?.breadth50 ?? 50,
                orderDelta: ind.orderDelta ?? 0,
            };

            const score = calcScore(indObj);
            const { signal, phase } = scoreToSignal(score);
            const varsChart = ind.varsChart ?? Array.from({ length: 20 }, (_, i) => Math.sin(i * 0.5) * 0.02);

            return {
                ticker: item.t, sector: item.s, group,
                daily: q.daily ?? 0,
                intra: q.intra ?? 0,
                "5d": ind.fiveD ?? 0,
                "20d": ind.twentyD ?? 0,
                atrPct: ind.atrPct ?? 0,
                distSma50Atr: ind.distSma50Atr ?? 0,
                rs: ind.rs ?? 50,
                abc: ind.abc ?? "B",
                varsChart,
                longETF: lev.l, shortETF: lev.s,
                score, signal, phase,
                indicators: indObj,
                price: q.price ?? 0,
                dailyVol: ind.dailyVol ?? 0,
                weeklyVol: ind.weeklyVol ?? 0,
                monthlyVol: ind.monthlyVol ?? 0,
            };
        });
    }
    return result;
}

export function useMarketData() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [breadth, setBreadth] = useState({ breadth50: 50, breadth200: 50 });
    const [cotCache, setCotCache] = useState({});

    // 내부 캐시 (훅 생명주기 내)
    const quotesRef = useRef({});
    const indicatorsRef = useRef({});

    const fetchAll = useCallback(async (isFirstLoad = false) => {
        try {
            const quotesStr = ALL_TICKERS.join(",");

            // 1. 시세 + 광폭 병렬 fetch (빠름)
            const [quotes, breadthData] = await Promise.all([
                fetchJSON(`${API}/api/quotes?tickers=${quotesStr}`),
                fetchJSON(`${API}/api/breadth`),
            ]);

            quotesRef.current = quotes;
            setBreadth(breadthData);

            // 2. 현재 indicators가 있으면 즉시 렌더링 (시세만 갱신)
            if (!isFirstLoad && Object.keys(indicatorsRef.current).length > 0) {
                setData(buildRows(quotes, indicatorsRef.current, breadthData, cotCache));
                setLastUpdated(new Date());
                setLoading(false);
            }

            // 3. indicators 항상 fetch (서버 캐시 5분이므로 실제 네트워크 비용은 적음)
            const indicators = await fetchIndicatorsBatch(ALL_TICKERS);
            indicatorsRef.current = { ...indicatorsRef.current, ...indicators };

            // 4. 최종 데이터 세트 (지표 포함)
            setData(buildRows(quotes, indicatorsRef.current, breadthData, cotCache));
            setLastUpdated(new Date());
            setError(null);
        } catch (e) {
            setError(e.message);
            console.error("fetchAll error:", e);
        } finally {
            setLoading(false);
        }
    }, [cotCache]);

    const fetchCOT = useCallback(async (ticker) => {
        if (cotCache[ticker]) return cotCache[ticker];
        try {
            const cot = await fetchJSON(`${API}/api/cot/${ticker}`);
            setCotCache(prev => ({ ...prev, [ticker]: cot }));
            return cot;
        } catch { return { shortInt: null }; }
    }, [cotCache]);

    useEffect(() => {
        fetchAll(true); // 첫 로드
        const interval = setInterval(() => fetchAll(false), REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, []); // eslint-disable-line

    return { data, loading, error, lastUpdated, breadth, fetchCOT };
}
