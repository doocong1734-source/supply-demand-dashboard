import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useMarketData } from "./hooks/useMarketData.js";
import { useFavorites } from "./hooks/useFavorites.js";
import UnifiedTable from "./components/UnifiedTable.jsx";

// Design System - US.MARKET Terminal (Stitch 2026-04)
const TH = {
  bg: "#0b1326", surface: "#171f33", surfaceAlt: "#131b2e", border: "#45474c", borderLight: "#2d3449",
  surfaceHigh: "#222a3d", surfaceHighest: "#2d3449", surfaceLowest: "#060e20",
  text: "#dae2fd", textDim: "#c5c6cd", textBright: "#f2f2f2",
  green: "#4ae176", greenBright: "#6bff8f", red: "#ffb3ad", redBright: "#ffdad7",
  blue: "#7bd0ff", blueLight: "#c4e7ff", purple: "#9c27b0", yellow: "#f59e0b",
  orange: "#ff5722", cyan: "#7bd0ff", pink: "#e91e63", teal: "#009688",
  primary: "#4ae176", secondary: "#ffb3ad", tertiary: "#7bd0ff",
  outline: "#8f9097", outlineVar: "#45474c",
  navBg: "rgba(15,23,42,0.9)", sidebarBg: "#020617",
};

const SECTOR_COLORS = {
  "Information Technology": "#3f51b5", "Industrials": "#555", "Emerging Markets": "#00bcd4",
  "Consumer Discretionary": "#4caf50", "Health Care": "#e91e63", "Financials": "#ff5722",
  "Energy": "#795548", "Communication Services": "#9c27b0", "Real Estate": "#673ab7",
  "Commodities": "#8b6914", "Materials": "#ff9800", "Utilities": "#009688",
  "Consumer Staples": "#8bc34a", "Broad Market": "#9e9e9e",
};

function ValueBar({ value, min, max }) {
  if (value == null) return <td style={tdStyle}>N/A</td>;
  const isPos = value >= 0;
  let pct = 0;
  if (isPos && max > 0) pct = Math.min(100, (value / max) * 100);
  else if (!isPos && min < 0) pct = Math.min(100, (Math.abs(value) / Math.abs(min)) * 100);
  return (
    <td style={{ ...tdStyle, color: isPos ? TH.green : TH.red, fontWeight: 700, fontSize: 12 }}>
      <div style={{ position: "relative", display: "inline-block", padding: "2px 4px", borderRadius: 3, minWidth: 50, textAlign: "right" }}>
        <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 3, opacity: 0.2, zIndex: 0, maxWidth: "100%", width: `${pct}%`, backgroundColor: isPos ? TH.green : TH.red, ...(isPos ? { left: 0 } : { right: 0 }) }} />
        <span style={{ position: "relative", zIndex: 1 }}>{isPos ? "+" : ""}{value.toFixed(2)}%</span>
      </div>
    </td>
  );
}

function ABCBadge({ grade }) {
  const colors = { "A": TH.primary, "B": TH.tertiary, "C": TH.secondary };
  if (!grade) return <span style={{ color: TH.textDim }}>-</span>;
  const c = colors[grade] || TH.textDim;
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", border: `2px solid ${c}`, fontWeight: 800, fontSize: 10, color: c, background: `${c}15`, letterSpacing: "0.05em" }}>{grade}</span>;
}

function SignalBadge({ signal, compact }) {
  const conf = {
    "강력매수": { bg: TH.primary, color: "#002109", glow: true },
    "매수": { bg: `${TH.primary}cc`, color: "#002109" },
    "관망↑": { bg: `${TH.tertiary}30`, color: TH.tertiary, border: `${TH.tertiary}50` },
    "중립": { bg: TH.surfaceHighest, color: TH.textDim, border: TH.outlineVar },
    "관망↓": { bg: `${TH.yellow}30`, color: TH.yellow, border: `${TH.yellow}50` },
    "매도": { bg: `${TH.secondary}30`, color: TH.secondary, border: `${TH.secondary}50` },
    "강력매도": { bg: TH.secondary, color: "#410004" },
  };
  const c = conf[signal] || conf["중립"];
  return <span style={{ padding: compact ? "2px 6px" : "2px 8px", borderRadius: 2, fontSize: compact ? 9 : 10, fontWeight: 900, background: c.bg, border: c.border ? `1px solid ${c.border}` : "none", color: c.color, whiteSpace: "nowrap", letterSpacing: "0.05em", textTransform: "uppercase", boxShadow: c.glow ? `0 0 12px ${TH.primary}4d` : "none" }}>{signal}</span>;
}

function ScoreCell({ score }) {
  const pct = (score + 100) / 2;
  const color = score >= 30 ? TH.primary : score >= -10 ? TH.tertiary : score >= -30 ? TH.yellow : TH.secondary;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 50, height: 4, background: TH.surfaceHighest, borderRadius: 9999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 9999, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 800, color, minWidth: 28, fontFamily: "'Inter', sans-serif" }}>{score > 0 ? "+" : ""}{score}</span>
    </div>
  );
}

function VARSChart({ data, width = 80, height = 24 }) {
  if (!data || data.length === 0) return <span style={{ color: "#555" }}>N/A</span>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 0.01;
  const maxIdx = data.indexOf(Math.max(...data));
  const bars = data.map((v, i) => {
    const h = ((v - min) / range) * height;
    const color = i === maxIdx ? TH.greenBright : "#888";
    return `<rect x="${i * (width / data.length)}" y="${height - h}" width="${(width / data.length) - 1}" height="${h}" fill="${color}" rx="1"/>`;
  }).join("");
  return <svg width={width} height={height} dangerouslySetInnerHTML={{ __html: bars }} style={{ display: "block" }} />;
}

const thStyle = { fontFamily: "'Inter', sans-serif", textAlign: "left", padding: "12px 8px", backgroundColor: TH.surfaceLowest, cursor: "pointer", userSelect: "none", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: `1px solid ${TH.border}`, color: TH.textDim, fontSize: 11, whiteSpace: "nowrap" };
const tdStyle = { fontFamily: "'Inter', sans-serif", padding: "10px 8px", borderBottom: `1px solid ${TH.borderLight}`, verticalAlign: "middle", color: TH.text, fontSize: 12 };

// Sticky column styles for ★ and Ticker
const stickyStarTh = { position: "sticky", left: 0, zIndex: 3, backgroundColor: TH.surface };
const stickyTickerTh = { position: "sticky", left: 24, zIndex: 3, backgroundColor: TH.surface, borderRight: `2px solid ${TH.border}` };
const stickyStarTd = (bg) => ({ position: "sticky", left: 0, zIndex: 1, backgroundColor: bg });
const stickyTickerTd = (bg) => ({ position: "sticky", left: 24, zIndex: 1, backgroundColor: bg, borderRight: `2px solid ${TH.border}` });

// Metric tooltips
const METRIC_TOOLTIPS = {
  ticker: "종목 코드",
  price: "현재가",
  tpr: "추세 강도 등급 (Trend Power Ranking) - A+/A/B/C/D",
  rpr: "상대 성과 순위 (Relative Performance Ranking) 0-100",
  rsVsSpy: "S&P500(SPY) 대비 상대강도",
  rs12m: "12개월 상대강도 변화율 (%)",
  vcpScore: "변동성 수축 패턴 점수 (Volatility Contraction Pattern) 0-100",
  passCount: "12개 스크리닝 기준 중 통과한 수",
  epsThisY: "올해 EPS 예상 성장률 (%)",
  salesQQ: "분기 매출 성장률 (전분기 대비 %)",
  instTrans: "기관 보유 비율 변화 (%, +매수/-매도)",
  pe: "주가수익비율 (Price/Earnings, 낮을수록 저평가)",
  fpe: "미래 기준 주가수익비율 (Forward P/E)",
  epsNextY: "내년 EPS 예상 성장률 (%)",
  eps5Y: "5년 EPS 연평균 성장률 (%)",
  roe: "자기자본이익률 (Return on Equity, %)",
};

// TradingView 임베드 위젯
function TradingViewChart({ ticker }) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);

  const loadWidget = useCallback(() => {
    if (!containerRef.current || !wrapperRef.current) return;
    containerRef.current.innerHTML = "";
    const w = wrapperRef.current.offsetWidth;
    const h = wrapperRef.current.offsetHeight;
    if (w < 10 || h < 10) return;
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: false,
      width: w,
      height: h,
      symbol: ticker.endsWith(".KS") || ticker.endsWith(".KQ") ? `KRX:${ticker.split(".")[0]}` : ticker,
      interval: "D",
      timezone: "Asia/Seoul",
      theme: "dark",
      style: "1",
      locale: "kr",
      backgroundColor: "#0b1326",
      gridColor: "rgba(68,68,68,0.3)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
    });
    containerRef.current.appendChild(script);
  }, [ticker]);

  useEffect(() => {
    // 컨테이너 크기 확정 후 로드 (fixed/flex 레이아웃 안정화 대기)
    const t = setTimeout(loadWidget, 80);
    return () => { clearTimeout(t); if (containerRef.current) containerRef.current.innerHTML = ""; };
  }, [loadWidget]);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver(() => loadWidget());
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [loadWidget]);

  return (
    <div ref={wrapperRef} style={{ width: "100%", height: "100%", flex: 1, overflow: "hidden", background: TH.bg }}>
      <div className="tradingview-widget-container" ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 100, gap: 16 }}>
      <div style={{ width: 48, height: 48, border: `4px solid ${TH.border}`, borderTopColor: TH.green, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: TH.textDim, fontSize: 14 }}>Yahoo Finance에서 실시간 데이터 로딩 중...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function IndCard({ ind, bullish, bearish }) {
  const [tip, setTip] = useState(null);
  const statusColor = bullish ? TH.green : bearish ? TH.red : TH.textDim;
  return (
    <div
      style={{ padding: 8, background: TH.surface, borderRadius: 6, border: `1px solid ${TH.borderLight}`, borderLeft: `3px solid ${statusColor}`, cursor: "help", position: "relative" }}
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTip({ x: r.left, y: r.top, bottom: r.bottom });
      }}
      onMouseLeave={() => setTip(null)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <span style={{ fontSize: 10, color: TH.textDim }}>{ind.name}</span>
        <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: TH.surfaceHigh, color: TH.textDim }}>{ind.cat}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: TH.text }}>{ind.val}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: statusColor }}>{ind.status} {bullish ? "▲" : bearish ? "▼" : "─"}</div>
      {tip && (
        <div style={{
          position: "fixed",
          left: Math.min(tip.x, window.innerWidth - 284),
          top: tip.y > 130 ? tip.y - 118 : tip.bottom + 6,
          zIndex: 9999,
          background: "#0f172a",
          border: "1px solid #475569",
          borderRadius: 8,
          padding: "10px 12px",
          width: 272,
          pointerEvents: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,0.8)",
        }}>
          <div style={{ fontSize: 9, color: "#64748b", marginBottom: 3, fontWeight: 700, letterSpacing: 0.6 }}>계산식</div>
          <div style={{ fontSize: 10, color: "#cbd5e1", marginBottom: 8, lineHeight: 1.55, whiteSpace: "pre-line" }}>{ind.calc}</div>
          <div style={{ fontSize: 9, color: "#64748b", marginBottom: 3, fontWeight: 700, letterSpacing: 0.6 }}>해석</div>
          <div style={{ fontSize: 10, color: "#cbd5e1", lineHeight: 1.55, whiteSpace: "pre-line" }}>{ind.meaning}</div>
        </div>
      )}
    </div>
  );
}

const LOW_AUM_TICKERS = new Set(["AIQ", "WCLD", "BLOK", "SOCL", "CIBR", "TUR"]);

function fmtVol(v) {
  if (!v) return "-";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

function RankRow({ rank, row, valueKey, isVol }) {
  const val = row[valueKey] ?? 0;
  const color = isVol ? TH.cyan : val >= 0 ? TH.green : TH.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: `1px solid ${TH.borderLight}` }}>
      <span style={{ width: 18, fontSize: 10, color: rank <= 3 ? TH.yellow : TH.textDim, textAlign: "right", fontWeight: 800 }}>{rank}</span>
      <span style={{ padding: "1px 6px", borderRadius: 10, background: TH.surfaceHighest, color: "#fff", fontSize: 11, fontWeight: 700, minWidth: 46, textAlign: "center" }}>{row.ticker}</span>
      <span style={{ fontSize: 10, color: TH.textDim, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{row.group}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color, minWidth: 62, textAlign: "right" }}>
        {isVol ? fmtVol(val) : `${val >= 0 ? "+" : ""}${val?.toFixed(2)}%`}
      </span>
      <SignalBadge signal={row.signal} compact />
    </div>
  );
}

function RankColumn({ title, rows, valueKey, color, isVol }) {
  return (
    <div style={{ flex: 1, background: TH.surface, borderRadius: 8, border: `1px solid ${TH.border}`, overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: "8px 10px", background: TH.surfaceHigh, borderBottom: `1px solid ${TH.border}`, fontWeight: 700, fontSize: 12, color }}>{title}</div>
      {rows.map((row, i) => (
        <RankRow key={row.ticker} rank={i + 1} row={row} valueKey={valueKey} isVol={isVol} />
      ))}
    </div>
  );
}

// ─── AI 코멘트 버블 (MiniMax M2.7) ───────────────────────────
function AICommentBubble({ ticker }) {
  const [comment, setComment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchComment = async (e) => {
    e.stopPropagation();
    if (loading || loaded) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/ai/comment/${ticker}`);
      const d = await r.json();
      setComment(d.comment || "분석 실패");
      setLoaded(true);
    } catch { setComment("오류 발생"); setLoaded(true); }
    finally { setLoading(false); }
  };

  if (loaded && comment) {
    return <div style={{ fontSize: 10, color: "#94a3b8", fontStyle: "italic", marginTop: 2, padding: "3px 6px", background: "#1e293b", borderRadius: 4, border: "1px solid #334155" }}>{comment}</div>;
  }
  return (
    <button onClick={fetchComment} disabled={loading} style={{ fontSize: 9, padding: "1px 6px", background: "transparent", border: "1px solid #334155", color: "#64748b", borderRadius: 3, cursor: "pointer", marginLeft: 4, whiteSpace: "nowrap" }}>
      {loading ? "AI..." : "AI분석"}
    </button>
  );
}

function MScoreAISummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetch = async () => {
    if (loading || loaded) return;
    setLoading(true);
    try {
      const r = await window.fetch("/api/ai/mscore-summary");
      const d = await r.json();
      setSummary(d.summary || "요약 실패");
      setLoaded(true);
    } catch { setSummary("오류 발생"); setLoaded(true); }
    finally { setLoading(false); }
  };

  if (loaded && summary) {
    return <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 6, background: "#0f172a", border: "1px solid #1e3a5f", fontSize: 12, color: "#93c5fd", fontStyle: "italic" }}>AI: {summary}</div>;
  }
  return (
    <button onClick={fetch} disabled={loading} style={{ marginTop: 8, width: "100%", padding: "6px 0", background: "transparent", border: "1px solid #1e3a5f", color: "#64748b", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>
      {loading ? "AI 시황 분석 중..." : "AI 시황 요약"}
    </button>
  );
}

function MScorePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/mscore");
      setData(await r.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); const t = setInterval(fetchData, 300000); return () => clearInterval(t); }, [fetchData]);

  if (loading) return <div style={{ padding: 30, color: TH.textDim, textAlign: "center" }}>M-Score 로딩 중...</div>;
  if (!data || data.error) return <div style={{ padding: 30, color: TH.red, textAlign: "center" }}>데이터 로드 실패</div>;

  const { score, status, label, color, details, spy, qqq, updatedAt } = data;
  const bgColor = `${color}10`;
  const timePart = updatedAt ? new Date(updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "--:--";

  const DetailBar = ({ lbl, value, max }) => {
    const pct = max > 0 ? Math.min(100, Math.max(0, (Math.abs(value) / max) * 100)) : 0;
    const isNeg = value < 0;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 36px", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: TH.textDim }}>{lbl}</span>
        <div style={{ height: 6, background: "#333", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: isNeg ? TH.red : color, borderRadius: 3 }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: isNeg ? TH.red : color, textAlign: "right" }}>{value > 0 ? "+" : ""}{value}</span>
      </div>
    );
  };

  return (
    <div style={{ padding: 16, maxWidth: 620, margin: "0 auto" }}>
      <div style={{ padding: "14px 18px", borderRadius: 8, background: bgColor, border: `1px solid ${color}44`, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>M-Score</span>
          <span style={{ fontSize: 36, fontWeight: 900, color, lineHeight: 1 }}>{score}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color }}>{status}</div>
            <div style={{ fontSize: 12, color: TH.textDim }}>{label}</div>
          </div>
          <button onClick={fetchData} style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 10, background: "transparent", border: `1px solid ${TH.border}`, color: TH.textDim, borderRadius: 4, cursor: "pointer" }}>↻</button>
        </div>
        <div style={{ height: 8, background: "#333", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
          <div style={{ width: `${Math.min(100, Math.max(0, (score + 100) / 2))}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: TH.textDim }}>
          <span>-100 (BEAR)</span><span>{score}</span><span>+100 (BULL)</span>
        </div>
      </div>

      <div style={{ padding: "12px 14px", borderRadius: 6, background: TH.surface, border: `1px solid ${TH.border}`, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TH.textDim, marginBottom: 8 }}>세부 점수</div>
        <DetailBar lbl="MA 포지션" value={details.maPosition} max={25} />
        <DetailBar lbl="MA200 기울기" value={details.ma200Slope} max={10} />
        <DetailBar lbl="광폭지수" value={details.breadth} max={15} />
        <DetailBar lbl="52주 고점비" value={details.vs52wHigh} max={10} />
        <DetailBar lbl="QQQ vs SPY" value={details.qqqVsSpy} max={5} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[{ lbl: "SPY", d: spy }, { lbl: "QQQ", d: qqq }].map(({ lbl, d }) => (
          <div key={lbl} style={{ padding: "10px 12px", borderRadius: 6, background: TH.surface, border: `1px solid ${TH.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TH.textBright, marginBottom: 4 }}>
              {lbl} <span style={{ color: TH.textDim, fontWeight: 400 }}>${d?.price}</span>
              {" "}<span style={{ color: (d?.change1d ?? 0) >= 0 ? TH.green : TH.red, fontSize: 11 }}>{(d?.change1d ?? 0) > 0 ? "+" : ""}{d?.change1d}%</span>
            </div>
            <div style={{ fontSize: 10, color: TH.textDim }}>SMA50: {d?.sma50?.toFixed(0)} · SMA150: {d?.sma150?.toFixed(0)} · SMA200: {d?.sma200?.toFixed(0)}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "8px 12px", borderRadius: 6, background: TH.surface, border: `1px solid ${TH.border}`, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: TH.textDim }}>광폭지수</span>
        <span style={{ fontSize: 12 }}>SPXA200R <b style={{ color: TH.text }}>{details.breadthRaw?.spxa200r}%</b></span>
        <span style={{ fontSize: 12 }}>SPXA50R <b style={{ color: TH.text }}>{details.breadthRaw?.spxa50r}%</b></span>
        <span style={{ fontSize: 10, color: TH.textDim, marginLeft: "auto" }}>갱신: {timePart}</span>
      </div>
      <MScoreAISummary />
    </div>
  );
}

function TriggerPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartTicker, setChartTicker] = useState(null);
  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/triggers");
      setData(await r.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); const t = setInterval(fetchData, 300000); return () => clearInterval(t); }, [fetchData]);

  const Section = ({ icon, title, items, renderRow }) => {
    if (!items || items.length === 0) return null;
    return (
      <div style={{ marginBottom: 10, borderRadius: 6, border: `1px solid ${TH.border}`, overflow: "hidden" }}>
        <div style={{ padding: "7px 12px", background: TH.surface, fontSize: 12, fontWeight: 700, color: TH.textBright }}>
          {icon} {title} <span style={{ color: TH.textDim, fontWeight: 400 }}>({items.length})</span>
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ borderTop: `1px solid ${TH.borderLight}`, background: chartTicker === item.ticker ? TH.surfaceHigh : TH.surfaceAlt }}>
            <div
              onClick={() => setChartTicker(item.ticker)}
              onMouseEnter={e => e.currentTarget.style.background = "#263040"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              style={{ padding: "7px 12px", display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}>
              <b style={{ color: TH.yellow, fontSize: 12, minWidth: 52 }}>{item.ticker}</b>
              {renderRow(item)}
              <AICommentBubble ticker={item.ticker} />
              <a href={`https://finviz.com/chart.ashx?t=${item.ticker}&ty=c&ta=1&p=d`} target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ marginLeft: "auto", fontSize: 10, color: TH.textDim, textDecoration: "none", padding: "1px 6px", border: `1px solid ${TH.border}`, borderRadius: 3 }}>
                Finviz ↗
              </a>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <div style={{ padding: 30, color: TH.textDim, textAlign: "center" }}>트리거 로딩 중...</div>;

  const timePart = data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const empty = !data || data.totalCount === 0;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* 왼쪽: 트리거 목록 */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, borderRight: chartTicker ? `1px solid ${TH.border}` : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>⚡ 진입 트리거</span>
            <span style={{ fontSize: 11, color: TH.textDim }}>오늘 조건 충족 종목</span>
            {data && <span style={{ background: (data.totalCount ?? 0) > 0 ? TH.orange : "#555", color: "#fff", borderRadius: 8, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>{data.totalCount ?? 0}</span>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {data?.cacheStats && <span style={{ fontSize: 10, color: TH.textDim }}>캐시 {data.cacheStats.cached}/{data.cacheStats.total}</span>}
            <span style={{ fontSize: 10, color: TH.textDim }}>{timePart}</span>
            <button onClick={fetchData} style={{ padding: "3px 10px", fontSize: 11, background: "transparent", border: `1px solid ${TH.border}`, color: TH.textDim, borderRadius: 4, cursor: "pointer" }}>↻</button>
          </div>
        </div>

        {data?.cacheStats?.cached === 0 && (
          <div style={{ padding: "8px 12px", borderRadius: 6, background: TH.surface, border: `1px solid ${TH.border}`, marginBottom: 10, fontSize: 11, color: TH.yellow }}>
            💡 스크리너를 먼저 실행하면 캐시된 데이터로 트리거를 확인할 수 있습니다.
          </div>
        )}

        {empty ? (
          <div style={{ padding: 40, textAlign: "center", color: TH.textDim, fontSize: 13 }}>오늘 조건 충족 종목 없음</div>
        ) : (
          <>
            <Section icon="🚀" title="52주 신고가 돌파" items={data.breakout52w} renderRow={item => <>
              <span style={{ fontSize: 11, color: TH.text }}>${item.price?.toFixed(2)}</span>
              <span style={{ fontSize: 10, color: TH.textDim }}>TPR {item.tpr}</span>
              <span style={{ fontSize: 10, color: TH.green }}>RS12m {item.rs12m?.toFixed(0)}</span>
            </>} />
            <Section icon="📐" title="VCP 완성" items={data.vcpComplete} renderRow={item => <>
              <span style={{ fontSize: 11, color: TH.text }}>${item.price?.toFixed(2)}</span>
              <span style={{ fontSize: 10, color: TH.cyan }}>VCP점수 {item.vcpScore}</span>
              <span style={{ fontSize: 10, color: TH.green }}>RS12m {item.rs12m?.toFixed(0)}</span>
            </>} />
            <Section icon="📈" title="RS 신고가" items={data.rsMakingHigh} renderRow={item => <>
              <span style={{ fontSize: 11, color: TH.text }}>${item.price?.toFixed(2)}</span>
              <span style={{ fontSize: 10, color: TH.blue }}>RS/SPY {item.rsVsSpy}</span>
              <span style={{ fontSize: 10, color: TH.green }}>RS12m {item.rs12m?.toFixed(0)}</span>
            </>} />
            <Section icon="🎯" title="포켓피봇" items={data.pocketPivot} renderRow={item => <>
              <span style={{ fontSize: 11, color: TH.text }}>${item.price?.toFixed(2)}</span>
              <span style={{ fontSize: 10, color: TH.green }}>RS12m {item.rs12m?.toFixed(0)}</span>
            </>} />
          </>
        )}
      </div>

      {/* 오른쪽: TradingView 차트 */}
      {chartTicker && (
        <div style={{ width: 1040, flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 12px", background: TH.surface, borderBottom: `1px solid ${TH.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{chartTicker}</span>
            <button onClick={() => setChartTicker(null)} style={{ background: "none", border: "none", color: TH.textDim, cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
          <TradingViewChart ticker={chartTicker} />
        </div>
      )}
    </div>
  );
}

function RankingsPanel({ data }) {
  const [period, setPeriod] = useState("daily");
  const [filterAUM, setFilterAUM] = useState(true);
  const PRICE_KEY = { daily: "daily", weekly: "5d", monthly: "20d" };
  const VOL_KEY = { daily: "dailyVol", weekly: "weeklyVol", monthly: "monthlyVol" };
  const periodLabel = { daily: "1일", weekly: "5일", monthly: "20일" };
  const volLabel = { daily: "일간", weekly: "주간", monthly: "월간" };
  const mkBtn = (active, color = TH.green) => ({
    padding: "4px 10px", fontSize: 11, fontWeight: 600,
    border: `1px solid ${active ? color : TH.border}`, borderRadius: 4,
    background: active ? `${color}18` : "transparent",
    color: active ? color : TH.textDim, cursor: "pointer",
  });
  const allRows = useMemo(() => {
    if (!data) return [];
    return Object.values(data).flat().filter(r => !filterAUM || !LOW_AUM_TICKERS.has(r.ticker));
  }, [data, filterAUM]);
  const pKey = PRICE_KEY[period];
  const vKey = VOL_KEY[period];
  const topGain = useMemo(() => [...allRows].sort((a, b) => (b[pKey] ?? 0) - (a[pKey] ?? 0)).slice(0, 10), [allRows, pKey]);
  const topLose = useMemo(() => [...allRows].sort((a, b) => (a[pKey] ?? 0) - (b[pKey] ?? 0)).slice(0, 10), [allRows, pKey]);
  const topVol = useMemo(() => [...allRows].sort((a, b) => (b[vKey] ?? 0) - (a[vKey] ?? 0)).slice(0, 10), [allRows, vKey]);
  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[["daily", "일간"], ["weekly", "주간"], ["monthly", "월간"]].map(([p, label]) => (
            <button key={p} style={mkBtn(period === p)} onClick={() => setPeriod(p)}>{label}</button>
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: TH.border }} />
        <button style={mkBtn(filterAUM, TH.yellow)} onClick={() => setFilterAUM(p => !p)}>
          {filterAUM ? "✓ 시총 $1B+" : "전체 종목"}
        </button>
        <span style={{ fontSize: 10, color: TH.textDim }}>({allRows.length}개 종목)</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <RankColumn title={`▲ 상승 TOP10 (${periodLabel[period]})`} rows={topGain} valueKey={pKey} color={TH.green} isVol={false} />
        <RankColumn title={`▼ 하락 TOP10 (${periodLabel[period]})`} rows={topLose} valueKey={pKey} color={TH.red} isVol={false} />
        <RankColumn title={`📊 거래량 TOP10 (${volLabel[period]})`} rows={topVol} valueKey={vKey} color={TH.cyan} isVol={true} />
      </div>
    </div>
  );
}

const SCREEN_LABELS = {
  bnb:          "Bread & Butter",
  stage2:       "Stage 2",
  stage2Loose:  "Stage 2 Loose",
  tprA:         "TPR A+/A",
  momentum:     "Momentum",
  qualifier:    "Qualifier",
  top5Rpr:      "Top 5% RPR",
  vcp:          "VCP",
  rsMakingHigh: "RS 신고가",
  pocketPivot:  "포켓피봇",
  nearBreakout: "돌파임박",
  fundGrade:    "펀더멘탈",
};

const SCREEN_GROUPS = {
  "트렌드 템플릿": ["bnb", "stage2", "stage2Loose", "tprA", "momentum", "qualifier", "top5Rpr"],
  "패턴/시그널":   ["vcp", "rsMakingHigh", "pocketPivot", "nearBreakout"],
  "펀더멘탈":      ["fundGrade"],
};

const TPR_COLOR = { "A+": "#00c853", A: "#69f0ae", B: "#fff176", C: "#ffb74d", D: "#ef5350" };

function SpyBadge({ model }) {
  if (!model) return null;
  const conf = {
    Bull:    { bg: `${TH.primary}22`, border: TH.primary, color: TH.primary },
    Caution: { bg: `${TH.yellow}22`, border: TH.yellow, color: TH.yellow },
    Bear:    { bg: `${TH.secondary}22`, border: TH.secondary, color: TH.secondary },
    Unknown: { bg: `${TH.outline}22`, border: TH.outline, color: TH.textDim },
  };
  const s = conf[model.status] || conf.Unknown;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 6, background: s.bg, border: `1px solid ${s.border}`, fontSize: 10 }}>
      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: s.color }} /><span> SPY</span>
      <span style={{ fontWeight: 800, color: s.color }}>{model.status}</span>
      {model.spyPrice && (
        <span style={{ color: TH.textDim }}>
          ${model.spyPrice} | MA50 ${model.spyMa50} | MA200 ${model.spyMa200}
        </span>
      )}
    </div>
  );
}

function VcpBar({ score }) {
  const color = score >= 80 ? TH.green : score >= 60 ? TH.yellow : score >= 40 ? TH.orange : "#555";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <div style={{ width: 30, height: 6, background: TH.border, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 9, color }}>{score}</span>
    </div>
  );
}

function ScreenerPanel({ lists, activeIdx, addToList, addList, isFavorite, isInAnyList, toggleFavorite, onGoMScore }) {
  const [universe, setUniverse] = useState("nasdaq100");
  const [customInput, setCustomInput] = useState("AAPL,MSFT,NVDA,TSLA");
  const [minPrice, setMinPrice] = useState(5);
  const [maxPrice, setMaxPrice] = useState(99999);
  const [limit, setLimit] = useState(150);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ ticker: "", i: 0, total: 0, passing: 0 });
  const [results, setResults] = useState([]);
  const [activeScreens, setActiveScreens] = useState(new Set(["bnb", "stage2"]));
  const [sortKey, setSortKey] = useState("passCount");
  const [sortDir, setSortDir] = useState("desc");
  const [chartTicker, setChartTicker] = useState(null);
  const [showChart, setShowChart] = useState(true);
  const [spyModel, setSpyModel] = useState(null);
  const [mscore, setMscore] = useState(null);
  // 자동 갱신
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5);
  const [lastRunTime, setLastRunTime] = useState(null);
  useEffect(() => {
    fetch("/api/mscore").then(r => r.json()).then(d => {
      setMscore(d);
      // M-Score BULL 시 stage2+vcp 자동 활성화
      if (d.score >= 50) setActiveScreens(prev => { const n = new Set(prev); n.add("stage2"); n.add("vcp"); return n; });
    }).catch(() => {});
  }, []);
  const [addDropdown, setAddDropdown] = useState(false);
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  // ① 필터 로직: "any"=OR, "all"=AND전체, "group-and"=그룹내OR+그룹간AND
  const [filterMode, setFilterMode] = useState("any");
  // ③ 수치 필터
  const [minRpr, setMinRpr] = useState(0);
  const [minRsSpy, setMinRsSpy] = useState(0);
  const [minEpsThisY, setMinEpsThisY] = useState("");
  const [minSalesQQ, setMinSalesQQ] = useState("");
  const [showNumFilter, setShowNumFilter] = useState(false);
  // ④ 프리셋
  const PRESET_KEY = "screener_presets_v1";
  const [presets, setPresets] = useState(() => { try { return JSON.parse(localStorage.getItem(PRESET_KEY) || "[]"); } catch { return []; } });
  const [presetDropdown, setPresetDropdown] = useState(false);
  // ⑧ 신호별 알림 설정
  const [notifySignals, setNotifySignals] = useState(new Set(["vcp_break", "rsMakingHigh", "pocketPivot"]));
  const [showNotifyPanel, setShowNotifyPanel] = useState(false);
  const esRef = useRef(null);

  const TPR_ORDER = { "A+": 5, A: 4, B: 3, C: 2, D: 1 };
  const ALL_SCREEN_KEYS = Object.keys(SCREEN_LABELS);

  // ① 알림 권한
  const toggleNotify = async () => {
    if (notifyEnabled) { setNotifyEnabled(false); return; }
    if (!("Notification" in window)) return;
    const perm = await Notification.requestPermission();
    if (perm === "granted") setNotifyEnabled(true);
  };

  function handleRun() {
    if (running) { esRef.current?.close(); setRunning(false); return; }
    setResults([]);
    setSpyModel(null);
    setProgress({ ticker: "", i: 0, total: 0, passing: 0 });
    setRunning(true);
    const params = new URLSearchParams({ universe, minPrice, maxPrice, limit });
    if (universe === "custom") params.set("custom", customInput);
    const es = new EventSource(`/api/screener/run?${params}`);
    esRef.current = es;
    es.addEventListener("marketStatus", e => setSpyModel(JSON.parse(e.data)));
    es.addEventListener("progress", e => setProgress(JSON.parse(e.data)));
    es.addEventListener("result", e => {
      const row = JSON.parse(e.data);
      setResults(prev => [...prev, row]);
      // ⑧ 신호별 알림
      if (notifyEnabled) {
        if (notifySignals.has("vcp_break") && row.vcp && row.nearBreakout)
          new Notification(`🔥 VCP+돌파임박: ${row.ticker}`, { body: `TPR:${row.tpr} RS:${row.rsVsSpy} VCP:${row.vcpScore}${row.fundGrade ? " 펀더멘탈✓" : ""}`, icon: "/vite.svg" });
        if (notifySignals.has("rsMakingHigh") && row.rsMakingHigh && !row.vcp)
          new Notification(`📈 RS신고가: ${row.ticker}`, { body: `TPR:${row.tpr} RPR:${row.rpr?.toFixed(0)} RS/SPY:${row.rsVsSpy}`, icon: "/vite.svg" });
        if (notifySignals.has("pocketPivot") && row.pocketPivot)
          new Notification(`Pocket Pivot: ${row.ticker}`, { body: `TPR:${row.tpr} RS/SPY:${row.rsVsSpy}`, icon: "/vite.svg" });
        if (notifySignals.has("fundGrade") && row.fundGrade && row.stage2Loose)
          new Notification(`💰 펀더멘탈우수+상승추세: ${row.ticker}`, { body: `EPS:${row.epsThisY?.toFixed(0)}% 매출:${row.salesQQ?.toFixed(0)}%`, icon: "/vite.svg" });
      }
    });
    es.addEventListener("done", e => {
      setRunning(false); es.close();
      if (notifyEnabled) { const d = JSON.parse(e.data); new Notification("스크리닝 완료", { body: `${d.passing}개 통과 / ${d.total}개 분석`, icon: "/vite.svg" }); }
    });
    es.onerror = () => { setRunning(false); es.close(); };
    setLastRunTime(new Date());
  }

  // 자동 갱신
  useEffect(() => {
    if (!autoRefresh || running) return;
    const id = setInterval(() => { handleRun(); }, refreshInterval * 60 * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshInterval, running, universe, minPrice, maxPrice, limit, customInput]);

  // ① 필터 로직 (AND/OR/그룹AND) + ③ 수치 필터 + ② passCount
  const filtered = useMemo(() => {
    let rows = results.map(r => ({
      ...r,
      passCount: ALL_SCREEN_KEYS.filter(k => r[k]).length,
    }));
    // 수치 필터
    if (minRpr > 0) rows = rows.filter(r => (r.rpr ?? 0) >= minRpr);
    if (minRsSpy > 0) rows = rows.filter(r => (r.rsVsSpy ?? 0) >= minRsSpy);
    if (minEpsThisY !== "") rows = rows.filter(r => r.epsThisY != null && r.epsThisY >= Number(minEpsThisY));
    if (minSalesQQ !== "") rows = rows.filter(r => r.salesQQ != null && r.salesQQ >= Number(minSalesQQ));
    // 시그널 필터
    if (activeScreens.size === 0) return rows;
    if (filterMode === "all")
      return rows.filter(r => [...activeScreens].every(s => r[s]));
    if (filterMode === "group-and")
      return rows.filter(r => Object.entries(SCREEN_GROUPS).every(([, keys]) => {
        const sel = keys.filter(k => activeScreens.has(k));
        return sel.length === 0 || sel.some(k => r[k]);
      }));
    return rows.filter(r => [...activeScreens].some(s => r[s])); // "any" OR
  }, [results, activeScreens, filterMode, minRpr, minRsSpy, minEpsThisY, minSalesQQ]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === "tpr") { va = TPR_ORDER[va] ?? 0; vb = TPR_ORDER[vb] ?? 0; }
    if (va == null) va = -Infinity; if (vb == null) vb = -Infinity;
    return sortDir === "asc" ? va - vb : vb - va;
  }), [filtered, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }
  function toggleScreen(key) {
    setActiveScreens(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  // ④ 프리셋 저장/불러오기
  function savePreset() {
    const name = prompt("프리셋 이름을 입력하세요");
    if (!name?.trim()) return;
    const p = { name: name.trim(), universe, activeScreens: [...activeScreens], filterMode, minRpr, minRsSpy, minEpsThisY, minSalesQQ };
    const next = [...presets, p];
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
  }
  function loadPreset(p) {
    setUniverse(p.universe || "nasdaq100");
    setActiveScreens(new Set(p.activeScreens || []));
    setFilterMode(p.filterMode || "any");
    setMinRpr(p.minRpr || 0);
    setMinRsSpy(p.minRsSpy || 0);
    setMinEpsThisY(p.minEpsThisY ?? "");
    setMinSalesQQ(p.minSalesQQ ?? "");
    setPresetDropdown(false);
  }
  function deletePreset(i) {
    const next = presets.filter((_, idx) => idx !== i);
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
  }

  // ⑦ CSV 내보내기
  function exportCSV() {
    const headers = ["Ticker","Price","TPR","RPR","RS/SPY","RS12m%","VCP점수","EPS올해%","매출Q%","기관%","P/E","F/PE","EPS1Y%","EPS5Y%","ROE%","패스수",...ALL_SCREEN_KEYS];
    const rows = sorted.map(r => [
      r.ticker, r.price?.toFixed(2), r.tpr, r.rpr?.toFixed(0), r.rsVsSpy, r.rs12m?.toFixed(1), r.vcpScore,
      r.epsThisY?.toFixed(1) ?? "", r.salesQQ?.toFixed(1) ?? "", r.instTrans?.toFixed(1) ?? "",
      r.pe?.toFixed(1) ?? "", r.fpe?.toFixed(1) ?? "", r.epsNextY?.toFixed(1) ?? "", r.eps5Y?.toFixed(1) ?? "", r.roe?.toFixed(1) ?? "",
      r.passCount,
      ...ALL_SCREEN_KEYS.map(k => r[k] ? 1 : 0),
    ]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `screener_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const thS = { ...thStyle, fontSize: 10, cursor: "pointer" };
  const mkBtn = (active, color = TH.cyan) => ({
    padding: "3px 8px", fontSize: 11, fontWeight: 600,
    border: `1px solid ${active ? color : TH.border}`, borderRadius: 3,
    background: active ? `${color}22` : "transparent",
    color: active ? color : TH.textDim, cursor: "pointer", whiteSpace: "nowrap",
  });
  const pct = progress.total > 0 ? (progress.i / progress.total) * 100 : 0;
  // ⑤ 시장 타이밍 경고 (M-Score 연동)
  const mscoreBear = mscore && mscore.score <= -20;
  const mscoreCaution = mscore && mscore.score < 20 && mscore.score > -20;
  const spyWarning = mscoreBear || mscoreCaution || (spyModel && (spyModel.status === "Caution" || spyModel.status === "Bear"));

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: chartTicker && showChart ? `1px solid ${TH.border}` : "none" }}>
        {/* ── Controls ── */}
        <div style={{ padding: "8px 12px", background: TH.surface, borderBottom: `1px solid ${TH.border}`, flexShrink: 0 }}>

          {/* M-Score 미니 배지 */}
          {mscore && (
            <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span
                onClick={onGoMScore}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 10px", borderRadius: 12, background: `${mscore.color}20`, border: `1px solid ${mscore.color}66`, color: mscore.color, fontSize: 11, fontWeight: 700, cursor: onGoMScore ? "pointer" : "default" }}>
                {mscore.status} {mscore.score}
              </span>
              <span style={{ fontSize: 10, color: TH.textDim }}>{mscore.label}</span>
            </div>
          )}

          {/* ⑤ 시장 타이밍 경고 배너 (M-Score 연동) */}
          {spyWarning && (
            <div style={{ marginBottom: 6, padding: "5px 10px", borderRadius: 4, background: mscoreBear ? "#ef444422" : "#f59e0b22", border: `1px solid ${mscoreBear ? TH.red : TH.yellow}`, fontSize: 10, color: mscoreBear ? TH.red : TH.yellow, display: "flex", gap: 8, alignItems: "center" }}>
              <span>{mscoreBear ? "BEAR 구간" : "CAUTION"}: M-Score {mscore ? mscore.score : ""} {mscoreBear ? "(현금 비중 확대 권장)" : "(선별적 매수)"}</span>
              <span style={{ color: TH.textDim }}>→ TPR A+ 필터 + 엄격 모드 권장</span>
              <button onClick={() => { setActiveScreens(new Set(["bnb", "stage2", "tprA", "fundGrade"])); setFilterMode("group-and"); }}
                style={{ padding: "1px 7px", fontSize: 9, border: `1px solid ${TH.outlineVar}`, borderRadius: 3, background: "transparent", color: TH.yellow, cursor: "pointer" }}>
                자동 적용
              </button>
            </div>
          )}

          {/* Row 1: universe / price / limit / run / CSV / 프리셋 */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <select value={universe} onChange={e => setUniverse(e.target.value)} style={{ background: TH.bg, color: TH.text, border: `1px solid ${TH.border}`, borderRadius: 4, padding: "3px 6px", fontSize: 11 }}>
              <option value="nasdaq100">NASDAQ 100</option>
              <option value="sp500">S&amp;P 500</option>
              <option value="sp100">S&amp;P 100</option>
              <option value="both">NASDAQ+SP100</option>
              <option value="russell2000">Russell 2000 (IWM)</option>
              <option value="kospi200">KOSPI 200</option>
              <option value="kosdaq150">KOSDAQ 150</option>
              <option value="krx">KRX (KOSPI+KOSDAQ)</option>
              <option value="custom">직접 입력</option>
            </select>
            {universe === "custom" && (
              <input value={customInput} onChange={e => setCustomInput(e.target.value)} placeholder="AAPL,MSFT,NVDA" style={{ background: TH.bg, color: TH.text, border: `1px solid ${TH.border}`, borderRadius: 4, padding: "3px 6px", fontSize: 11, width: 160 }} />
            )}
            <span style={{ fontSize: 10, color: TH.textDim }}>$</span>
            <input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)} style={{ background: TH.bg, color: TH.text, border: `1px solid ${TH.border}`, borderRadius: 4, padding: "3px 5px", fontSize: 11, width: 58 }} />
            <span style={{ fontSize: 10, color: TH.textDim }}>~</span>
            <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} style={{ background: TH.bg, color: TH.text, border: `1px solid ${TH.border}`, borderRadius: 4, padding: "3px 5px", fontSize: 11, width: 70 }} />
            <span style={{ fontSize: 10, color: TH.textDim }}>최대</span>
            <input type="number" value={limit} onChange={e => setLimit(e.target.value)} style={{ background: TH.bg, color: TH.text, border: `1px solid ${TH.border}`, borderRadius: 4, padding: "3px 5px", fontSize: 11, width: 56 }} />
            <button onClick={handleRun} style={{ padding: "4px 12px", fontSize: 11, fontWeight: 700, border: "none", borderRadius: 4, background: running ? TH.red : TH.green, color: "#000", cursor: "pointer" }}>
              {running ? "■ 중지" : "▶ 실행"}
            </button>
            <span style={{ fontSize: 10, color: TH.textDim, minWidth: 52 }}>{filtered.length}/{results.length}개</span>
            {spyModel && <SpyBadge model={spyModel} />}

            {/* 자동 갱신 */}
            <div style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: 4 }}>
              {lastRunTime && <span style={{ fontSize: 9, color: TH.textDim }}>{lastRunTime.toLocaleTimeString()} 갱신</span>}
              <label style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: autoRefresh ? TH.green : TH.textDim, cursor: "pointer" }}>
                <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ width: 12, height: 12 }} />
                자동
              </label>
              {autoRefresh && (
                <select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))}
                  style={{ background: TH.bg, color: TH.text, border: `1px solid ${TH.border}`, borderRadius: 3, padding: "1px 3px", fontSize: 9 }}>
                  <option value={1}>1분</option>
                  <option value={5}>5분</option>
                  <option value={10}>10분</option>
                </select>
              )}
            </div>

            {/* 차트 토글 */}
            {chartTicker && (
              <button onClick={() => setShowChart(p => !p)}
                style={{ padding: "3px 6px", fontSize: 11, border: `1px solid ${showChart ? TH.cyan : TH.border}`, borderRadius: 4, background: showChart ? `${TH.cyan}15` : "transparent", color: showChart ? TH.cyan : TH.textDim, cursor: "pointer" }}>
                {showChart ? "Chart ◀" : "▶ Chart"}
              </button>
            )}

            {/* ⑦ CSV */}
            {sorted.length > 0 && (
              <button onClick={exportCSV} style={{ padding: "3px 8px", fontSize: 11, border: `1px solid ${TH.outlineVar}`, borderRadius: 4, background: "transparent", color: TH.primary, cursor: "pointer" }}>
                CSV
              </button>
            )}

            {/* ④ 프리셋 */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setPresetDropdown(p => !p)} style={{ padding: "3px 8px", fontSize: 11, border: `1px solid ${TH.outlineVar}`, borderRadius: 4, background: "transparent", color: TH.primary, cursor: "pointer" }}>
                Preset
              </button>
              {presetDropdown && (
                <div style={{ position: "absolute", top: "100%", left: 0, background: TH.surface, border: `1px solid ${TH.border}`, borderRadius: 6, zIndex: 999, minWidth: 200, boxShadow: "0 4px 16px #000a", marginTop: 2 }}>
                  <div onClick={savePreset} style={{ padding: "7px 14px", fontSize: 11, cursor: "pointer", color: TH.purple, borderBottom: `1px solid #333`, fontWeight: 700 }}
                    onMouseEnter={e => e.currentTarget.style.background = TH.surfaceHigh} onMouseLeave={e => e.currentTarget.style.background = ""}>
                    + 현재 설정 저장
                  </div>
                  {presets.length === 0 && <div style={{ padding: "7px 14px", fontSize: 10, color: TH.textDim }}>저장된 프리셋 없음</div>}
                  {presets.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 14px", borderBottom: `1px solid #333` }}>
                      <span onClick={() => loadPreset(p)} style={{ flex: 1, fontSize: 11, cursor: "pointer", color: TH.text }}
                        onMouseEnter={e => e.currentTarget.style.color = TH.purple} onMouseLeave={e => e.currentTarget.style.color = TH.text}>
                        {p.name}
                      </span>
                      <button onClick={() => deletePreset(i)} style={{ background: "none", border: "none", color: TH.red, cursor: "pointer", fontSize: 11, padding: "0 2px" }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ⑧ 알림 */}
            {"Notification" in window && (
              <div style={{ position: "relative" }}>
                <button onClick={toggleNotify} style={{ padding: "3px 8px", fontSize: 11, border: `1px solid ${notifyEnabled ? TH.green : TH.border}`, borderRadius: 4, background: notifyEnabled ? `${TH.green}22` : "transparent", color: notifyEnabled ? TH.green : TH.textDim, cursor: "pointer" }}>
                  {notifyEnabled ? "ON" : "OFF"}
                </button>
                {notifyEnabled && (
                  <button onClick={() => setShowNotifyPanel(p => !p)} style={{ marginLeft: 2, padding: "3px 6px", fontSize: 11, border: `1px solid ${TH.border}`, borderRadius: 4, background: "transparent", color: TH.textDim, cursor: "pointer" }}>⚙</button>
                )}
                {showNotifyPanel && notifyEnabled && (
                  <div style={{ position: "absolute", top: "100%", right: 0, background: TH.surface, border: `1px solid ${TH.border}`, borderRadius: 6, zIndex: 999, minWidth: 200, boxShadow: "0 4px 16px #000a", marginTop: 2, padding: "8px 12px" }}>
                    <div style={{ fontSize: 10, color: TH.textDim, marginBottom: 6, fontWeight: 700 }}>신호별 알림 설정</div>
                    {[
                      { key: "vcp_break", label: "VCP + Break" },
                      { key: "rsMakingHigh", label: "RS High" },
                      { key: "pocketPivot", label: "Pocket Pivot" },
                      { key: "fundGrade", label: "Fund + Trend" },
                    ].map(({ key, label }) => (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginBottom: 5, fontSize: 11 }}>
                        <input type="checkbox" checked={notifySignals.has(key)}
                          onChange={() => setNotifySignals(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })} />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 관심목록 일괄 추가 */}
            {filtered.length > 0 && (
              <div style={{ position: "relative" }}>
                <button onClick={() => setAddDropdown(p => !p)} style={{ padding: "3px 8px", fontSize: 10, border: `1px solid ${TH.outlineVar}`, borderRadius: 4, background: "transparent", color: TH.yellow, cursor: "pointer", fontWeight: 700 }}>
                  Add Watch ({filtered.length})
                </button>
                {addDropdown && (
                  <div style={{ position: "absolute", top: "100%", left: 0, background: TH.surface, border: `1px solid ${TH.border}`, borderRadius: 6, zIndex: 999, minWidth: 160, boxShadow: "0 4px 16px #000a", marginTop: 2 }}>
                    {lists.map((list, i) => (
                      <div key={i} onClick={() => { filtered.forEach(r => addToList(r.ticker, i)); setAddDropdown(false); }}
                        style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer", color: TH.text, borderBottom: `1px solid #333` }}
                        onMouseEnter={e => e.currentTarget.style.background = TH.surfaceHigh} onMouseLeave={e => e.currentTarget.style.background = ""}>
                        {i === activeIdx ? "★" : "☆"} {list.name}
                      </div>
                    ))}
                    <div onClick={() => { const n = prompt("새 목록 이름", "스크리너 결과"); if (n?.trim()) addList(n.trim()); setAddDropdown(false); }}
                      style={{ padding: "7px 14px", fontSize: 11, cursor: "pointer", color: TH.textDim }}
                      onMouseEnter={e => e.currentTarget.style.background = TH.surfaceHigh} onMouseLeave={e => e.currentTarget.style.background = ""}>
                      + 새 목록 만들기
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Row 2: ① 필터 모드 + 시그널 필터 버튼 */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
            {/* 필터 로직 모드 */}
            <div style={{ display: "flex", gap: 2, border: `1px solid ${TH.border}`, borderRadius: 4, padding: "1px", flexShrink: 0 }}>
              {[["any","OR (하나이상)"], ["group-and","그룹AND"], ["all","전체AND (엄격)"]].map(([val, label]) => (
                <button key={val} onClick={() => setFilterMode(val)}
                  style={{ padding: "2px 7px", fontSize: 9, fontWeight: 700, border: "none", borderRadius: 3, cursor: "pointer",
                    background: filterMode === val ? (val === "all" ? TH.red : val === "group-and" ? TH.orange : TH.blue) : "transparent",
                    color: filterMode === val ? "#fff" : TH.textDim }}>
                  {label}
                </button>
              ))}
            </div>
            {Object.entries(SCREEN_GROUPS).map(([group, keys]) => (
              <div key={group} style={{ display: "flex", gap: 2, alignItems: "center" }}>
                <span style={{ fontSize: 9, color: TH.textDim }}>{group}:</span>
                {keys.map(key => (
                  <button key={key} style={mkBtn(activeScreens.has(key))} onClick={() => toggleScreen(key)} title={SCREEN_LABELS[key]}>
                    {SCREEN_LABELS[key]}
                  </button>
                ))}
              </div>
            ))}
            <button style={mkBtn(activeScreens.size === 0, "#888")} onClick={() => setActiveScreens(new Set())}>전체</button>
          </div>

          {/* Row 3: ③ 수치 필터 */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => setShowNumFilter(p => !p)}
              style={{ padding: "2px 8px", fontSize: 9, border: `1px solid ${showNumFilter || minRpr > 0 || minRsSpy > 0 || minEpsThisY !== "" || minSalesQQ !== "" ? TH.cyan : TH.border}`, borderRadius: 4, background: "transparent", color: showNumFilter ? TH.cyan : TH.textDim, cursor: "pointer" }}>
              ⚙ 수치 필터 {(minRpr > 0 || minRsSpy > 0 || minEpsThisY !== "" || minSalesQQ !== "") ? "●" : ""}
            </button>
            {showNumFilter && (
              <>
                <span style={{ fontSize: 9, color: TH.textDim }}>RPR≥</span>
                <input type="number" value={minRpr} onChange={e => setMinRpr(Number(e.target.value))} min={0} max={100}
                  style={{ width: 38, background: TH.bg, color: TH.text, border: `1px solid ${TH.border}`, borderRadius: 3, padding: "2px 4px", fontSize: 10 }} />
                <span style={{ fontSize: 9, color: TH.textDim }}>RS/SPY≥</span>
                <input type="number" value={minRsSpy} onChange={e => setMinRsSpy(Number(e.target.value))} min={0} max={100}
                  style={{ width: 38, background: TH.bg, color: TH.text, border: `1px solid ${TH.border}`, borderRadius: 3, padding: "2px 4px", fontSize: 10 }} />
                <span style={{ fontSize: 9, color: TH.textDim }}>EPS올해≥</span>
                <input type="number" value={minEpsThisY} onChange={e => setMinEpsThisY(e.target.value)} placeholder="%"
                  style={{ width: 42, background: TH.bg, color: TH.text, border: `1px solid ${TH.border}`, borderRadius: 3, padding: "2px 4px", fontSize: 10 }} />
                <span style={{ fontSize: 9, color: TH.textDim }}>매출Q≥</span>
                <input type="number" value={minSalesQQ} onChange={e => setMinSalesQQ(e.target.value)} placeholder="%"
                  style={{ width: 42, background: TH.bg, color: TH.text, border: `1px solid ${TH.border}`, borderRadius: 3, padding: "2px 4px", fontSize: 10 }} />
                <button onClick={() => { setMinRpr(0); setMinRsSpy(0); setMinEpsThisY(""); setMinSalesQQ(""); }}
                  style={{ padding: "2px 6px", fontSize: 9, border: `1px solid ${TH.border}`, borderRadius: 3, background: "transparent", color: TH.red, cursor: "pointer" }}>초기화</button>
              </>
            )}
          </div>

          {/* 프로그레스 바 */}
          {(running || progress.total > 0) && (
            <div style={{ marginTop: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: TH.textDim, marginBottom: 2 }}>
                <span>{progress.ticker}</span>
                <span>{progress.i}/{progress.total} 분석 · 통과 {progress.passing}</span>
              </div>
              <div style={{ height: 3, background: TH.border, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: TH.green, transition: "width 0.2s", borderRadius: 2 }} />
              </div>
            </div>
          )}
        </div>

        {/* ── Results table ── */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 11 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2, background: TH.surface }}>
              <tr>
                <th style={{ ...thS, width: 24, ...stickyStarTh }}>★</th>
                <th style={{ ...thS, width: 65, ...stickyTickerTh }} onClick={() => toggleSort("ticker")} title={METRIC_TOOLTIPS.ticker}>Ticker</th>
                <th style={{ ...thS, width: 58 }} onClick={() => toggleSort("price")} title={METRIC_TOOLTIPS.price}>Price</th>
                <th style={{ ...thS, width: 38, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("tpr")} title={METRIC_TOOLTIPS.tpr}>TPR</th>
                <th style={{ ...thS, width: 40, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("rpr")} title={METRIC_TOOLTIPS.rpr}>RPR</th>
                <th style={{ ...thS, width: 52, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("rsVsSpy")} title={METRIC_TOOLTIPS.rsVsSpy}>RS/SPY</th>
                <th style={{ ...thS, width: 52, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("rs12m")} title={METRIC_TOOLTIPS.rs12m}>RS12m%</th>
                <th style={{ ...thS, width: 48, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("vcpScore")} title={METRIC_TOOLTIPS.vcpScore}>VCP점수</th>
                {/* ② 종합 패스 수 */}
                <th style={{ ...thS, width: 38, color: TH.cyan, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("passCount")} title={METRIC_TOOLTIPS.passCount}>
                  패스{sortKey === "passCount" ? (sortDir === "desc" ? "▼" : "▲") : ""}
                </th>
                <th style={{ ...thS, width: 50, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("epsThisY")} title={METRIC_TOOLTIPS.epsThisY}>EPS올해</th>
                <th style={{ ...thS, width: 48, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("salesQQ")} title={METRIC_TOOLTIPS.salesQQ}>매출Q</th>
                <th style={{ ...thS, width: 46, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("instTrans")} title={METRIC_TOOLTIPS.instTrans}>기관↑↓</th>
                <th style={{ ...thS, width: 40, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("pe")} title={METRIC_TOOLTIPS.pe}>P/E</th>
                <th style={{ ...thS, width: 40, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("fpe")} title={METRIC_TOOLTIPS.fpe}>F/PE</th>
                <th style={{ ...thS, width: 50, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("epsNextY")} title={METRIC_TOOLTIPS.epsNextY}>EPS(1Y)</th>
                <th style={{ ...thS, width: 50, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("eps5Y")} title={METRIC_TOOLTIPS.eps5Y}>EPS(5Y)</th>
                <th style={{ ...thS, width: 40, borderBottom: "1px dotted #666", cursor: "help" }} onClick={() => toggleSort("roe")} title={METRIC_TOOLTIPS.roe}>ROE</th>
                {Object.entries(SCREEN_LABELS).map(([k, label]) => (
                  <th key={k} style={{ ...thS, width: 28, fontSize: 9, textAlign: "center", padding: "4px 2px" }} title={label}>
                    {label.length <= 4 ? label : label.split(/[ &\/]/)[0].slice(0, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr key={row.ticker} onClick={() => setChartTicker(t => t === row.ticker ? null : row.ticker)}
                  style={{ cursor: "pointer", background: chartTicker === row.ticker ? TH.surfaceHigh : i % 2 === 0 ? TH.bg : "transparent" }}>
                  {(() => { const rowBg = chartTicker === row.ticker ? TH.surfaceHigh : i % 2 === 0 ? TH.bg : TH.bg; return (<>
                  <td style={{ ...tdStyle, textAlign: "center", padding: "2px 2px", ...stickyStarTd(rowBg) }}>
                    <button onClick={e => { e.stopPropagation(); toggleFavorite(row.ticker); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: isInAnyList(row.ticker) ? TH.yellow : "#444", fontSize: 13, padding: 0, lineHeight: 1 }}>★</button>
                  </td>
                  <td style={{ ...tdStyle, ...stickyTickerTd(rowBg) }}>
                    <span style={{ padding: "1px 5px", borderRadius: 10, background: TH.surfaceHighest, color: "#fff", fontWeight: 700, fontSize: 11 }}>{row.ticker}</span>
                  </td>
                  </>); })()}
                  <td style={{ ...tdStyle, fontWeight: 600 }}>${row.price?.toFixed(2)}</td>
                  <td style={tdStyle}>
                    <span style={{ padding: "1px 5px", borderRadius: 4, background: `${TPR_COLOR[row.tpr] ?? "#666"}33`, color: TPR_COLOR[row.tpr] ?? TH.textDim, fontWeight: 700, fontSize: 10 }}>{row.tpr}</span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: (row.rpr ?? 0) >= 70 ? TH.green : TH.text }}>{row.rpr?.toFixed(0)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: (row.rsVsSpy ?? 50) >= 60 ? TH.green : (row.rsVsSpy ?? 50) <= 40 ? TH.red : TH.textDim }}>
                    {row.rsVsSpy ?? "-"}{row.rsMakingHigh && <span style={{ marginLeft: 2, fontSize: 9, color: TH.green }}>▲</span>}
                  </td>
                  <td style={{ ...tdStyle, color: (row.rs12m ?? 0) >= 0 ? TH.green : TH.red, fontWeight: 600 }}>
                    {row.rs12m != null ? `${row.rs12m >= 0 ? "+" : ""}${row.rs12m.toFixed(1)}%` : "-"}
                  </td>
                  <td style={tdStyle}><VcpBar score={row.vcpScore ?? 0} /></td>
                  {/* ② 패스 수 */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <span style={{
                      display: "inline-block", width: 22, height: 22, lineHeight: "22px", textAlign: "center",
                      borderRadius: "50%", fontSize: 10, fontWeight: 800,
                      background: row.passCount >= 7 ? TH.green : row.passCount >= 4 ? TH.yellow : row.passCount >= 2 ? TH.orange : "#333",
                      color: row.passCount >= 2 ? "#000" : TH.textDim,
                    }}>{row.passCount}</span>
                  </td>
                  <td style={{ ...tdStyle, color: (row.epsThisY ?? 0) >= 20 ? TH.green : (row.epsThisY ?? 0) < 0 ? TH.red : TH.text, fontWeight: 700, fontSize: 10 }}>
                    {row.epsThisY != null ? `${row.epsThisY >= 0 ? "+" : ""}${row.epsThisY.toFixed(0)}%` : "-"}
                  </td>
                  <td style={{ ...tdStyle, color: (row.salesQQ ?? 0) >= 10 ? TH.green : (row.salesQQ ?? 0) < 0 ? TH.red : TH.text, fontWeight: 600, fontSize: 10 }}>
                    {row.salesQQ != null ? `${row.salesQQ >= 0 ? "+" : ""}${row.salesQQ.toFixed(0)}%` : "-"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center", fontSize: 11, fontWeight: 700 }}>
                    {row.instTrans != null
                      ? <span style={{ color: row.instTrans > 0 ? TH.green : row.instTrans < 0 ? TH.red : TH.textDim }}>
                          {row.instTrans > 0 ? "▲" : row.instTrans < 0 ? "▼" : "─"}{Math.abs(row.instTrans).toFixed(1)}%
                        </span>
                      : <span style={{ color: "#444" }}>-</span>}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 10, color: row.pe != null && row.pe < 20 ? TH.green : TH.textDim }}>{row.pe != null ? row.pe.toFixed(1) : "-"}</td>
                  <td style={{ ...tdStyle, fontSize: 10, color: row.fpe != null && row.fpe < 20 ? TH.green : TH.textDim }}>{row.fpe != null ? row.fpe.toFixed(1) : "-"}</td>
                  <td style={{ ...tdStyle, color: (row.epsNextY ?? 0) >= 10 ? TH.green : (row.epsNextY ?? 0) < 0 ? TH.red : TH.text, fontWeight: 600, fontSize: 10 }}>
                    {row.epsNextY != null ? `${row.epsNextY >= 0 ? "+" : ""}${row.epsNextY.toFixed(0)}%` : "-"}
                  </td>
                  <td style={{ ...tdStyle, color: (row.eps5Y ?? 0) >= 10 ? TH.green : (row.eps5Y ?? 0) < 0 ? TH.red : TH.text, fontWeight: 600, fontSize: 10 }}>
                    {row.eps5Y != null ? `${row.eps5Y >= 0 ? "+" : ""}${row.eps5Y.toFixed(0)}%` : "-"}
                  </td>
                  <td style={{ ...tdStyle, color: (row.roe ?? 0) >= 15 ? TH.green : TH.textDim, fontWeight: 600, fontSize: 10 }}>
                    {row.roe != null ? `${row.roe.toFixed(0)}%` : "-"}
                  </td>
                  {ALL_SCREEN_KEYS.map(k => (
                    <td key={k} style={{ ...tdStyle, textAlign: "center", fontSize: 13 }}>
                      {row[k] ? <span style={{ color: TH.green, fontWeight: 800 }}>✓</span> : <span style={{ color: "#2a2a2a" }}>·</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {results.length === 0 && !running && (
            <div style={{ padding: 40, textAlign: "center", color: TH.textDim, fontSize: 13 }}>
              ▶ 실행 버튼을 눌러 스크리닝을 시작하세요
              <div style={{ marginTop: 8, fontSize: 10, color: "#555" }}>
                Trend Template · VCP · RS vs SPY · 포켓피봇 · 돌파임박 · 펀더멘탈
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: TradingView chart ── */}
      {chartTicker && showChart && (
        <div style={{ flex: '0 0 52%', minWidth: 640, display: "flex", flexDirection: "column", borderLeft: `1px solid ${TH.outlineVar}` }}>
          <div style={{ padding: "8px 12px", background: TH.surface, borderBottom: `1px solid ${TH.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{chartTicker}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setShowChart(false)} style={{ background: "none", border: "none", color: TH.textDim, cursor: "pointer", fontSize: 14 }} title="차트 접기">◀</button>
              <button onClick={() => setChartTicker(null)} style={{ background: "none", border: "none", color: TH.textDim, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
          </div>
          <TradingViewChart ticker={chartTicker} />
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data, loading, error, lastUpdated, fetchCOT } = useMarketData();
  const { lists, activeIdx, favorites, totalCount, setActiveIdx, addList, removeList, renameList, toggleFavorite, addToList, removeFromList, isFavorite, isInAnyList } = useFavorites();
  const [selected, setSelected] = useState(null);
  const [detailFullscreen, setDetailFullscreen] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [sortStates, setSortStates] = useState({});
  const [viewMode, setViewMode] = useState("combined");

  // ESC key closes fullscreen chart
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && detailFullscreen) setDetailFullscreen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [detailFullscreen]);

  // Close fullscreen when switching pages
  useEffect(() => { setDetailFullscreen(false); }, [viewMode]);
  const [flowFilter, setFlowFilter] = useState("all");
  const [watchlistSearch, setWatchlistSearch] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [customFavData, setCustomFavData] = useState({}); // 비목록 종목 검색 결과 캐시
  const [contextMenu, setContextMenu] = useState(null); // { x, y, ticker }
  const rowRefs = useRef({});
  const autoFetchingRef = useRef(new Set()); // 중복 자동조회 방지
  const [wlFilter, setWlFilter] = useState({ minEps: "", minSales: "", maxPe: "", minRoe: "" });
  const [wlSort, setWlSort] = useState({ key: null, dir: 1 });

  // 관심종목 탭 진입 시 데이터 없는 즐겨찾기 자동 fetch
  useEffect(() => {
    if (viewMode !== "watchlist" || !favorites.length) return;
    const mainTickers = data ? new Set(Object.values(data).flat().map(r => r.ticker)) : new Set();
    const missing = favorites.filter(t => !mainTickers.has(t) && !customFavData[t] && !autoFetchingRef.current.has(t));
    if (!missing.length) return;
    missing.forEach(t => autoFetchingRef.current.add(t));
    (async () => {
      for (const t of missing) {
        try {
          const [quoteRes, indRes] = await Promise.all([
            fetch(`/api/quotes?tickers=${t}`).then(r => r.json()),
            fetch(`/api/indicators/${t}`).then(r => r.json()),
          ]);
          const q = quoteRes[t] || {};
          const ind = indRes || {};
          if (!q.price && !ind.abc) continue;
          const row = {
            ticker: t, sector: "관심종목", group: "관심종목",
            daily: q.daily ?? 0, intra: q.intra ?? 0,
            fiveD: ind.fiveD ?? 0, twentyD: ind.twentyD ?? 0,
            "5d": ind.fiveD ?? 0, "20d": ind.twentyD ?? 0,
            atrPct: ind.atrPct ?? 0, distSma50Atr: ind.distSma50Atr ?? 0,
            rs: ind.rs ?? 50, abc: ind.abc ?? "B",
            pe: ind.pe ?? null, fpe: ind.fpe ?? null,
            epsThisY: ind.epsThisY ?? null, epsNextY: ind.epsNextY ?? null, eps5Y: ind.eps5Y ?? null,
            salesQQ: ind.salesQQ ?? null, instTrans: ind.instTrans ?? null, roe: ind.roe ?? null,
            varsChart: ind.varsChart ?? [],
            longETF: [], shortETF: [],
            score: 0, signal: "중립", phase: "모니터링",
            indicators: { obv: ind.obv ?? 0, mfi: ind.mfi ?? 50, vwapDev: ind.vwapDev ?? 0, adlTrend: ind.adlTrend ?? "중립", rsi: ind.rsi ?? 50, bbPos: ind.bbPos ?? 50, volRatio: ind.volRatio ?? 100, sma200Dev: ind.sma200Dev ?? 0, macdHist: ind.macdHist ?? 0, shortInt: null, breadth: 50, orderDelta: ind.orderDelta ?? 0 },
            price: q.price ?? 0,
          };
          setCustomFavData(prev => ({ ...prev, [t]: row }));
        } catch (_) { /* 실패 시 무시 */ }
      }
    })();
  }, [viewMode, favorites, data]);

  // 컨텍스트 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("contextmenu", close); };
  }, [!!contextMenu]);

  const ranges = useMemo(() => {
    if (!data) return {};
    const r = {};
    Object.entries(data).forEach(([group, rows]) => {
      const vals = (key) => rows.map(r => r[key]).filter(v => v != null);
      r[group] = {
        daily: [Math.min(...vals("daily"), -1), Math.max(...vals("daily"), 1)],
        intra: [Math.min(...vals("intra"), -1), Math.max(...vals("intra"), 1)],
        "5d": [Math.min(...vals("5d"), -2), Math.max(...vals("5d"), 2)],
        "20d": [Math.min(...vals("20d"), -3), Math.max(...vals("20d"), 3)],
      };
    });
    return r;
  }, [data]);

  const getSortedRows = useCallback((group, rows) => {
    const st = sortStates[group];
    if (!st) return rows;
    const { key, dir } = st;
    return [...rows].sort((a, b) => {
      if (key === "ticker") return a.ticker.localeCompare(b.ticker) * dir;
      if (key === "abc") return (a.abc || "Z").localeCompare(b.abc || "Z") * dir;
      if (key === "signal") return (a.score - b.score) * dir;
      return ((a[key] ?? 0) - (b[key] ?? 0)) * dir;
    });
  }, [sortStates]);

  const handleSort = (group, key) => {
    setSortStates(prev => {
      const cur = prev[group];
      if (cur?.key === key) {
        if (cur.clicks >= 2) { const n = { ...prev }; delete n[group]; return n; }
        return { ...prev, [group]: { key, dir: -cur.dir, clicks: cur.clicks + 1 } };
      }
      return { ...prev, [group]: { key, dir: 1, clicks: 1 } };
    });
  };

  const getSortIndicator = (group, key) => {
    const st = sortStates[group];
    if (!st || st.key !== key) return "";
    return st.dir === 1 ? " ↑" : " ↓";
  };

  const filterRows = (rows) => {
    if (flowFilter === "all") return rows;
    if (flowFilter === "buy") return rows.filter(r => r.score >= 30);
    if (flowFilter === "sell") return rows.filter(r => r.score <= -30);
    if (flowFilter === "accum") return rows.filter(r => r.phase.includes("매집"));
    if (flowFilter === "turnover") return rows.filter(r => r.phase === "손바뀜");
    return rows;
  };

  const stats = useMemo(() => {
    if (!data) return { total: 0, buy: 0, sell: 0, gradeA: 0, gradeC: 0 };
    const all = Object.values(data).flat();
    return {
      total: all.length,
      buy: all.filter(r => r.score >= 30).length,
      sell: all.filter(r => r.score <= -30).length,
      gradeA: all.filter(r => r.abc === "A").length,
      gradeC: all.filter(r => r.abc === "C").length,
    };
  }, [data]);

  // 종목 선택 시 COT (공매도 비율) 추가 fetch
  const handleSelectRow = useCallback(async (row) => {
    setSelected(row);
    setDetailData(null);
    setDetailLoading(true);
    try {
      const cot = await fetchCOT(row.ticker);
      setDetailData({ cot });
    } catch (e) {
      console.error("detail fetch error:", e);
    } finally {
      setDetailLoading(false);
    }
  }, [fetchCOT]);

  // 선택 종목의 지표 병합 (COT 실시간 반영)
  const selectedIndicators = useMemo(() => {
    if (!selected) return null;
    const base = selected.indicators;
    if (!detailData) return base;
    return {
      ...base,
      shortInt: detailData.cot?.shortInt ?? base.shortInt,
    };
  }, [selected, detailData]);

  useEffect(() => {
    if (!data) return;
    const allRows = Object.values(data).flat();
    const handler = (e) => {
      if (!selected) return;
      const idx = allRows.findIndex(r => r.ticker === selected.ticker && r.group === selected.group);
      let next;
      if (e.key === "ArrowDown" && idx < allRows.length - 1) { e.preventDefault(); next = allRows[idx + 1]; }
      if (e.key === "ArrowUp" && idx > 0) { e.preventDefault(); next = allRows[idx - 1]; }
      if (next) handleSelectRow(next);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selected, data, handleSelectRow]);

  useEffect(() => {
    if (selected) {
      const ref = rowRefs.current[`${selected.group}-${selected.ticker}`];
      if (ref) ref.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selected]);

  const btnStyle = (active, color = TH.primary) => ({
    fontFamily: "'Inter', sans-serif", padding: "6px 14px", fontSize: 11, fontWeight: 700,
    letterSpacing: "0.05em", textTransform: "uppercase",
    border: `1px solid ${active ? color : TH.outlineVar}`, borderRadius: 4,
    background: active ? `${color}18` : "transparent",
    color: active ? color : TH.textDim, cursor: "pointer", transition: "all 0.15s",
  });

  // 티커 검색 (관심종목 탭에서)
  const handleSearch = useCallback(async (ticker) => {
    if (!ticker.trim()) return;
    const t = ticker.trim().toUpperCase();
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const [quoteRes, indRes] = await Promise.all([
        fetch(`/api/quotes?tickers=${t}`).then(r => r.json()),
        fetch(`/api/indicators/${t}`).then(r => r.json()),
      ]);
      const q = quoteRes[t] || {};
      const ind = indRes || {};
      if (!q.price && !ind.abc) { setSearchResult({ error: `"${t}" 티커를 찾을 수 없습니다.` }); return; }
      setSearchResult({ ticker: t, q, ind });
      // 즉시 우측 패널에 표시
      const row = {
        ticker: t, sector: "검색결과", group: "검색",
        daily: q.daily ?? 0, intra: q.intra ?? 0,
        fiveD: ind.fiveD ?? 0, twentyD: ind.twentyD ?? 0,
        "5d": ind.fiveD ?? 0, "20d": ind.twentyD ?? 0,
        atrPct: ind.atrPct ?? 0, distSma50Atr: ind.distSma50Atr ?? 0,
        rs: ind.rs ?? 50, abc: ind.abc ?? "B",
        pe: ind.pe ?? null, fpe: ind.fpe ?? null,
        epsThisY: ind.epsThisY ?? null, epsNextY: ind.epsNextY ?? null, eps5Y: ind.eps5Y ?? null,
        salesQQ: ind.salesQQ ?? null, instTrans: ind.instTrans ?? null, roe: ind.roe ?? null,
        varsChart: ind.varsChart ?? [],
        longETF: [], shortETF: [],
        score: 0, signal: "중립", phase: "모니터링",
        indicators: { obv: ind.obv ?? 0, mfi: ind.mfi ?? 50, vwapDev: ind.vwapDev ?? 0, adlTrend: ind.adlTrend ?? "중립", rsi: ind.rsi ?? 50, bbPos: ind.bbPos ?? 50, volRatio: ind.volRatio ?? 100, sma200Dev: ind.sma200Dev ?? 0, macdHist: ind.macdHist ?? 0, shortInt: null, breadth: 50, orderDelta: ind.orderDelta ?? 0 },
        price: q.price ?? 0,
      };
      // 관심종목 탭에서도 쓸 수 있도록 캐싱
      setCustomFavData(prev => ({ ...prev, [t]: row }));
      handleSelectRow(row);
    } catch (e) {
      setSearchResult({ error: e.message });
    } finally {
      setSearchLoading(false);
    }
  }, []);

  if (!data && loading) return <LoadingOverlay />;

  return (
    <>
    <div style={{ fontFamily: "'Inter', Arial, sans-serif", background: TH.bg, color: TH.text, height: "100vh", margin: 0, overflow: "hidden" }}>
      {/* ═══ TOP NAV BAR ═══ */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, height: 52, background: TH.navBg, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: `1px solid ${TH.borderLight}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", zIndex: 1000 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: "-0.05em", color: TH.primary }}>US.MARKET</span>
          <div style={{ display: "flex", alignItems: "center", height: 52 }}>
            {[
              ["combined", "Unified"], ["original", "Price"], ["flow", "Flow"], ["watchlist", "Watchlist"],
              ["rankings", "Rankings"], ["mscore", "M-Score"], ["trigger", "Trigger"], ["screener", "Screener"], ["mijoomo", "Mijoomo"],
            ].map(([id, label]) => (
              <button key={id} onClick={() => setViewMode(id)}
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: 17, height: 52, padding: "0 16px", background: "transparent", border: "none", borderBottom: viewMode === id ? `2px solid ${TH.primary}` : "2px solid transparent", color: viewMode === id ? TH.primary : TH.textDim, cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center" }}>
                {label}{id === "watchlist" && totalCount > 0 && <span style={{ marginLeft: 4, background: TH.primary, color: "#000", borderRadius: 8, padding: "0 5px", fontSize: 9, fontWeight: 800 }}>{totalCount}</span>}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {[
            ["TOTAL", stats.total, TH.textBright], ["BUY", stats.buy, TH.primary], ["SELL", stats.sell, TH.secondary], ["A", stats.gradeA, TH.primary], ["C", stats.gradeC, TH.tertiary],
          ].map(([label, val, color]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "3px 10px", borderRadius: 6, background: TH.surface }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: TH.textDim, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color }}>{val}</span>
            </div>
          ))}
          {lastUpdated && <span style={{ fontSize: 10, color: TH.textDim, marginLeft: 4 }}>{lastUpdated.toLocaleTimeString("ko-KR")}</span>}
        </div>
      </nav>

      {/* ═══ MAIN CONTENT (no sidebar - removed per user feedback) ═══ */}
    <div style={{ paddingTop: 52, display: "flex", height: "100vh", overflow: "hidden" }}>
      {loading && data && (
        <div style={{ position: "fixed", top: 8, right: 8, background: TH.surface, border: `1px solid ${TH.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 11, color: TH.textDim, zIndex: 50 }}>
          🔄 갱신 중...
        </div>
      )}
      {error && (
        <div style={{ position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)", background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 6, padding: "6px 14px", fontSize: 12, color: "#fca5a5", zIndex: 50 }}>
          ⚠ 서버 연결 오류: {error}
        </div>
      )}

      {/* ═══ LEFT PANEL ═══ */}
      <div style={{ width: (viewMode === "rankings" || viewMode === "screener" || viewMode === "mijoomo" || viewMode === "mscore" || viewMode === "trigger" || viewMode === "watchlist") ? undefined : viewMode === "combined" ? 920 : 780, flex: (viewMode === "rankings" || viewMode === "screener" || viewMode === "mijoomo" || viewMode === "mscore" || viewMode === "trigger" || viewMode === "watchlist") ? 1 : undefined, borderRight: (viewMode === "rankings" || viewMode === "screener" || viewMode === "mijoomo" || viewMode === "mscore" || viewMode === "trigger" || viewMode === "watchlist") ? "none" : `1px solid ${TH.borderLight}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header - Sub controls */}
        <div style={{ padding: "8px 10px", background: TH.surfaceAlt, borderBottom: `1px solid ${TH.outlineVar}`, flexShrink: 0 }}>
          {(viewMode === "combined" || viewMode === "flow") && (
            <div style={{ display: "flex", gap: 4 }}>
              <button style={btnStyle(flowFilter === "all", "#888")} onClick={() => setFlowFilter("all")}>전체</button>
              <button style={btnStyle(flowFilter === "buy", TH.green)} onClick={() => setFlowFilter("buy")}>매수시그널</button>
              <button style={btnStyle(flowFilter === "sell", TH.red)} onClick={() => setFlowFilter("sell")}>매도시그널</button>
              <button style={btnStyle(flowFilter === "accum", TH.blue)} onClick={() => setFlowFilter("accum")}>매집중</button>
              <button style={btnStyle(flowFilter === "turnover", TH.yellow)} onClick={() => setFlowFilter("turnover")}>손바뀜</button>
            </div>
          )}
          {viewMode === "watchlist" && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={watchlistSearch}
                onChange={e => setWatchlistSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch(watchlistSearch)}
                placeholder="티커 검색 (예: AAPL, TSLA, 005930.KS)"
                style={{ flex: 1, padding: "4px 10px", background: TH.surface, border: `1px solid ${TH.border}`, borderRadius: 4, color: TH.text, fontSize: 12, outline: "none" }}
              />
              <button
                onClick={() => handleSearch(watchlistSearch)}
                disabled={searchLoading}
                style={{ ...btnStyle(true, TH.blue), padding: "4px 12px" }}
              >
                {searchLoading ? "검색 중..." : "검색"}
              </button>
            </div>
          )}
        </div>

        {/* Table / Watchlist */}
        <div style={{ flex: 1, overflowY: viewMode === "mijoomo" ? "hidden" : "auto", overflowX: viewMode === "watchlist" ? "auto" : "hidden", display: "flex", flexDirection: "column", minWidth: viewMode === "watchlist" ? 0 : undefined }}>

          {/* ── 관심종목 뷰 ── */}
          {viewMode === "watchlist" && (
            <div>
              {/* 목록 탭 바 */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", background: "#111", borderBottom: `1px solid ${TH.border}`, flexWrap: "wrap" }}>
                {lists.map((list, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center" }}>
                    <button
                      onClick={() => setActiveIdx(i)}
                      onDoubleClick={() => { const n = prompt("목록 이름 변경", list.name); if (n?.trim()) renameList(i, n.trim()); }}
                      title="더블클릭으로 이름 변경"
                      style={{ padding: "3px 10px", fontSize: 11, border: "none", borderRadius: 4, background: activeIdx === i ? TH.yellow : "#2d3748", color: activeIdx === i ? "#000" : TH.textDim, cursor: "pointer", fontWeight: activeIdx === i ? 700 : 400 }}
                    >
                      {list.name} <span style={{ fontSize: 10, opacity: 0.8 }}>({list.tickers.length})</span>
                    </button>
                    {lists.length > 1 && (
                      <button
                        onClick={() => { if (window.confirm(`"${list.name}" 목록을 삭제할까요?`)) removeList(i); }}
                        style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 12, padding: "0 3px", lineHeight: 1 }}
                        title="목록 삭제"
                      >×</button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => { const n = prompt("새 목록 이름", "새 관심목록"); if (n?.trim()) addList(n.trim()); }}
                  style={{ padding: "3px 8px", fontSize: 11, border: `1px dashed ${TH.border}`, borderRadius: 4, background: "none", color: TH.textDim, cursor: "pointer" }}
                >+ 새 목록</button>
              </div>

              {searchResult?.error && (
                <div style={{ margin: 12, padding: 10, background: "#7f1d1d", borderRadius: 6, color: "#fca5a5", fontSize: 12 }}>
                  ⚠ {searchResult.error}
                </div>
              )}
              {favorites.length === 0 && !searchResult && (
                <div style={{ padding: 40, textAlign: "center", color: TH.textDim, fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>★</div>
                  <div>"{lists[activeIdx]?.name}" 목록이 비어 있습니다.</div>
                  <div style={{ fontSize: 11, marginTop: 6 }}>메인 목록에서 우클릭 또는 ★ 버튼으로 추가하세요.</div>
                </div>
              )}
              {favorites.length > 0 && (
                <div style={{ minWidth: 0 }}>
                  {/* 목록 헤더 */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 10px", background: TH.surface, borderBottom: `1px solid ${TH.border}` }}>
                    <span style={{ fontSize: 11, color: TH.yellow, fontWeight: 700 }}>★ {lists[activeIdx]?.name} ({favorites.length})</span>
                    <span style={{ fontSize: 10, color: TH.textDim }}>헤더 클릭으로 정렬</span>
                  </div>
                  <div style={{ overflowX: "auto", minWidth: 0 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                      <tr>
                        {[
                          { label: "Ticker", key: "ticker" },
                          { label: "Grd", key: "abc" },
                          { label: "Daily", key: "daily" },
                          { label: "5D", key: "fiveD" },
                          { label: "20D", key: "twentyD" },
                          { label: "ATRx", key: "distSma50Atr" },
                          { label: "수급", key: "score" },
                          { label: "EPS올해", key: "epsThisY" },
                          { label: "EPS(1Y)", key: "epsNextY" },
                          { label: "EPS(5Y)", key: "eps5Y" },
                          { label: "매출Q", key: "salesQQ" },
                          { label: "기관↑↓", key: "instTrans" },
                          { label: "P/E", key: "pe" },
                          { label: "ROE", key: "roe" },
                          { label: "시그널", key: "signal" },
                          { label: "★", key: null },
                        ].map(({ label, key }) => (
                          <th key={label} style={{ ...thStyle, cursor: key ? "pointer" : "default", userSelect: "none",
                            color: wlSort.key === key ? TH.yellow : undefined }}
                            onClick={() => key && setWlSort(s => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
                            {label}{wlSort.key === key ? (wlSort.dir > 0 ? " ▲" : " ▼") : ""}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let rows = favorites.map(fav => ({
                          fav,
                          row: (data ? Object.values(data).flat().find(r => r.ticker === fav) : null) || (customFavData[fav] ? { ...customFavData[fav], ticker: fav } : null)
                        }));
                        // 필터
                        if (wlFilter.minEps !== "") rows = rows.filter(({ row }) => row?.epsThisY != null && row.epsThisY >= Number(wlFilter.minEps));
                        if (wlFilter.minSales !== "") rows = rows.filter(({ row }) => row?.salesQQ != null && row.salesQQ >= Number(wlFilter.minSales));
                        if (wlFilter.maxPe !== "") rows = rows.filter(({ row }) => row?.pe != null && row.pe <= Number(wlFilter.maxPe));
                        if (wlFilter.minRoe !== "") rows = rows.filter(({ row }) => row?.roe != null && row.roe >= Number(wlFilter.minRoe));
                        // 정렬
                        if (wlSort.key) rows = [...rows].sort((a, b) => {
                          const getSortValue = (row) => {
                            if (!row) return null;
                            if (wlSort.key === "fiveD") return row.fiveD ?? row["5d"] ?? null;
                            if (wlSort.key === "twentyD") return row.twentyD ?? row["20d"] ?? null;
                            return row[wlSort.key] ?? null;
                          };
                          const av = getSortValue(a.row);
                          const bv = getSortValue(b.row);
                          if (av == null && bv == null) return 0;
                          if (av == null) return 1;
                          if (bv == null) return -1;
                          if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * wlSort.dir;
                          return (av - bv) * wlSort.dir;
                        });
                        return rows.map(({ fav, row }, i) => {
                          if (!row) return (
                            <tr key={fav} style={{ backgroundColor: i % 2 === 0 ? TH.bg : "transparent" }}>
                              <td style={tdStyle}><span style={{ padding: "2px 8px", borderRadius: 12, background: TH.surfaceHighest, color: "#fff", fontSize: 11, fontWeight: 700 }}>{fav}</span></td>
                              <td style={{ ...tdStyle, color: TH.textDim, fontSize: 11 }} colSpan={12}>⏳ 로딩 중...</td>
                              <td style={tdStyle}><button onClick={() => toggleFavorite(fav)} style={{ background: "none", border: "none", cursor: "pointer", color: TH.yellow, fontSize: 16 }}>★</button></td>
                            </tr>
                          );
                          const isActive = selected?.ticker === fav;
                          const pctCell = (val, good, bad) => (
                            <td style={{ ...tdStyle, fontSize: 10, fontWeight: 700,
                              color: val == null ? TH.textDim : val >= good ? TH.green : val < bad ? TH.red : TH.text }}>
                              {val != null ? `${val >= 0 ? "+" : ""}${val.toFixed(0)}%` : "-"}
                            </td>
                          );
                          return (
                            <tr key={fav} onClick={() => handleSelectRow(row)} style={{ cursor: "pointer", backgroundColor: isActive ? TH.surfaceHigh : i % 2 === 0 ? TH.bg : "transparent" }}>
                              <td style={tdStyle}><span style={{ padding: "2px 8px", borderRadius: 12, background: TH.surfaceHighest, color: "#fff", fontSize: 11, fontWeight: 700 }}>{fav}</span></td>
                              <td style={tdStyle}><ABCBadge grade={row.abc} /></td>
                              <ValueBar value={row.daily} min={-5} max={5} />
                              <ValueBar value={row.fiveD ?? row["5d"]} min={-10} max={10} />
                              <ValueBar value={row.twentyD ?? row["20d"]} min={-15} max={15} />
                              <td style={{ ...tdStyle, fontSize: 11 }}>{row.distSma50Atr?.toFixed(2) ?? "-"}</td>
                              <td style={tdStyle}><ScoreCell score={row.score} /></td>
                              {pctCell(row.epsThisY, 20, 0)}
                              {pctCell(row.epsNextY, 10, 0)}
                              {pctCell(row.eps5Y, 10, 0)}
                              {pctCell(row.salesQQ, 10, 0)}
                              <td style={{ ...tdStyle, fontSize: 10, color: row.instTrans == null ? TH.textDim : row.instTrans > 0 ? TH.green : TH.red }}>
                                {row.instTrans != null ? `${row.instTrans > 0 ? "▲" : "▼"}${Math.abs(row.instTrans).toFixed(1)}%` : "-"}
                              </td>
                              <td style={{ ...tdStyle, fontSize: 10, color: row.pe != null && row.pe < 20 ? TH.green : TH.textDim }}>{row.pe != null ? row.pe.toFixed(1) : "-"}</td>
                              <td style={{ ...tdStyle, fontSize: 10, color: row.roe != null && row.roe >= 15 ? TH.green : TH.textDim }}>{row.roe != null ? `${row.roe.toFixed(0)}%` : "-"}</td>
                              <td style={tdStyle}><SignalBadge signal={row.signal} compact /></td>
                              <td style={tdStyle}>
                                <button onClick={e => { e.stopPropagation(); toggleFavorite(fav); }} style={{ background: "none", border: "none", cursor: "pointer", color: TH.yellow, fontSize: 16 }}>★</button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 랭킹 뷰 ── */}
          {viewMode === "rankings" && data && <RankingsPanel data={data} />}

          {/* ── M-Score 뷰 ── */}
          {viewMode === "mscore" && <MScorePanel />}

          {/* ── 트리거 뷰 ── */}
          {viewMode === "trigger" && <TriggerPanel />}

          {/* ── 스크리너 뷰 (항상 마운트, 탭 전환 시 상태 유지) ── */}
          <div style={{ display: viewMode === "screener" ? "flex" : "none", flex: 1, height: "100%", overflow: "hidden" }}>
            <ScreenerPanel lists={lists} activeIdx={activeIdx} addToList={addToList} addList={addList} isFavorite={isFavorite} isInAnyList={isInAnyList} toggleFavorite={toggleFavorite} onGoMScore={() => setViewMode("mscore")} />
          </div>

          {/* ── 미주모 뷰 ── */}
          {viewMode === "mijoomo" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#111", minHeight: 0 }}>
              <div style={{ padding: "6px 12px", background: TH.surface, borderBottom: `1px solid ${TH.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: TH.textDim }}>🌐 미주모 (mijoomo.com)</span>
                <a href="http://www.mijoomo.com/" target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: TH.teal, textDecoration: "none", padding: "2px 8px", border: `1px solid ${TH.teal}`, borderRadius: 4 }}>
                  새 탭으로 열기 ↗
                </a>
                <a href="https://www.patreon.com/mijoomo" target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: "#f96854", textDecoration: "none", padding: "2px 8px", border: "1px solid #f96854", borderRadius: 4 }}>
                  Patreon ↗
                </a>
              </div>
              <iframe
                src="http://www.mijoomo.com/"
                style={{ flex: 1, border: "none", width: "100%", minHeight: 0 }}
                title="미주모"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                onError={() => {}}
              />
            </div>
          )}

          {/* ── 메인 테이블 뷰 (Stitch Design) ── */}
          {viewMode !== "watchlist" && viewMode !== "rankings" && viewMode !== "screener" && viewMode !== "mijoomo" && data && (
            <UnifiedTable C={TH} data={data} viewMode={viewMode} collapsed={collapsed} setCollapsed={setCollapsed}
              sortStates={sortStates} handleSort={handleSort} getSortIndicator={getSortIndicator}
              filterRows={filterRows} getSortedRows={getSortedRows} selected={selected} handleSelectRow={handleSelectRow}
              toggleFavorite={toggleFavorite} isInAnyList={isInAnyList} isFavorite={isFavorite}
              setContextMenu={setContextMenu} rowRefs={rowRefs} ranges={ranges} SECTOR_COLORS={SECTOR_COLORS}
              VARSChart={VARSChart} ValueBar={ValueBar} ABCBadge={ABCBadge} ScoreCell={ScoreCell} SignalBadge={SignalBadge} />
          )}
          {viewMode !== "watchlist" && viewMode !== "rankings" && viewMode !== "screener" && viewMode !== "mijoomo" && (
            <div style={{ fontSize: 10, color: TH.textDim, padding: "8px 16px", background: TH.surfaceAlt, position: "sticky", bottom: 0, borderTop: `1px solid ${TH.outlineVar}`, fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}>
              ↑ ↓ Navigate · Real-time Data: Yahoo Finance API · 5min Cache
            </div>
          )}
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      {/* Watchlist fixed overlay chart */}
      {viewMode === "watchlist" && selected && (
        <div style={{ position: "fixed", top: 52, right: 0, width: "52%", bottom: 0, zIndex: 50, display: "flex", flexDirection: "column", borderLeft: `2px solid ${TH.border}`, background: TH.surfaceAlt, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", background: TH.surface, borderBottom: `1px solid ${TH.outlineVar}`, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: TH.textBright }}>{selected.ticker}</span>
            <span onClick={() => setSelected(null)} style={{ cursor: "pointer", color: TH.textDim, fontSize: 18 }}>✕</span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <TradingViewChart ticker={selected.ticker} />
          </div>
        </div>
      )}

      {viewMode !== "rankings" && viewMode !== "screener" && viewMode !== "mijoomo" && viewMode !== "watchlist" && selected && <div style={{
        ...(detailFullscreen
          ? { position: "fixed", top: 52, left: 0, right: 0, bottom: 0, zIndex: 100 }
          : { flex: 1, minWidth: 400 }
        ),
        display: "flex", flexDirection: "column", borderLeft: `1px solid ${TH.outlineVar}`, background: TH.surfaceAlt, overflow: "hidden"
      }}>
          <>
            {/* Header with close + fullscreen */}
            <div style={{ padding: "12px 16px", background: TH.surface, borderBottom: `1px solid ${TH.outlineVar}`, flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: TH.textBright, letterSpacing: "-0.02em" }}>{selected.ticker}</div>
                    <span className="material-symbols-outlined"
                      onClick={() => toggleFavorite(selected.ticker)}
                      style={{ fontSize: 20, color: isFavorite(selected.ticker) ? "#f59e0b" : TH.outline, cursor: "pointer", fontVariationSettings: isFavorite(selected.ticker) ? "'FILL' 1" : "'FILL' 0" }}>star</span>
                  </div>
                  <div style={{ fontSize: 10, color: TH.textDim, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>
                    {selected.sector}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span className="material-symbols-outlined" onClick={() => setDetailFullscreen(f => !f)} style={{ fontSize: 18, color: detailFullscreen ? TH.primary : TH.textDim, cursor: "pointer" }} title={detailFullscreen ? "축소" : "전체보기"}>{detailFullscreen ? "fullscreen_exit" : "fullscreen"}</span>
                    <span className="material-symbols-outlined" onClick={() => { setSelected(null); setDetailFullscreen(false); }} style={{ fontSize: 18, color: TH.textDim, cursor: "pointer" }} title="닫기">close</span>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: TH.primary, fontFamily: "monospace" }}>${selected.price?.toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: selected.daily >= 0 ? TH.primary : TH.secondary, fontWeight: 700 }}>
                    {selected.daily >= 0 ? "+" : ""}{selected.daily?.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>

            {/* TradingView 차트 - fills all remaining space */}
            <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
              <TradingViewChart ticker={selected.ticker} />
            </div>

            {/* Indicators - single horizontal row below chart */}
            {selectedIndicators && (
            <div style={{ display: "flex", gap: 3, padding: "6px 8px", background: TH.surface, borderTop: `1px solid ${TH.outlineVar}`, flexShrink: 0, overflowX: "auto", flexWrap: "wrap" }}>
              {[
                { label: "RSI", value: selectedIndicators.rsi?.toFixed(0) ?? "-", color: (selectedIndicators.rsi ?? 50) > 70 ? TH.secondary : (selectedIndicators.rsi ?? 50) < 30 ? TH.primary : TH.tertiary },
                { label: "MFI", value: selectedIndicators.mfi?.toFixed(0) ?? "-", color: TH.text },
                { label: "OBV", value: (selectedIndicators.obv ?? 0) > 0 ? "+" : "-", color: (selectedIndicators.obv ?? 0) > 0 ? TH.primary : TH.secondary },
                { label: "VOL", value: `${((selectedIndicators.volRatio ?? 100) / 100).toFixed(1)}x`, color: TH.text },
                { label: "MACD", value: (selectedIndicators.macdHist ?? 0) > 0 ? "+" : "-", color: (selectedIndicators.macdHist ?? 0) > 0 ? TH.primary : TH.secondary },
                { label: "BB", value: `${selectedIndicators.bbPos ?? 50}%`, color: TH.tertiary },
                { label: "SMA", value: `${(selectedIndicators.sma200Dev ?? 0).toFixed(0)}%`, color: (selectedIndicators.sma200Dev ?? 0) > 0 ? TH.primary : TH.secondary },
                { label: "GRD", value: selected.abc || "-", color: { "A": TH.primary, "B": TH.tertiary, "C": TH.secondary }[selected.abc] || TH.textDim },
                { label: "FLOW", value: selected.score > 0 ? `+${selected.score}` : `${selected.score}`, color: selected.score > 30 ? TH.primary : selected.score < -30 ? TH.secondary : TH.tertiary },
              ].map(({ label, value, color }, i) => (
                <div key={i} style={{ padding: "4px 8px", background: TH.surfaceHigh, border: `1px solid ${TH.outlineVar}`, borderRadius: 3, textAlign: "center", minWidth: 40, flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: TH.textDim, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color }}>{value}</div>
                </div>
              ))}
            </div>
            )}
          </>
      </div>}
    </div>

    {/* ── 우클릭 컨텍스트 메뉴 ── */}
    {contextMenu && (
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, background: TH.surface, border: `1px solid ${TH.border}`, borderRadius: 6, zIndex: 9999, minWidth: 170, boxShadow: "0 6px 24px #000c", overflow: "hidden" }}
      >
        <div style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, color: TH.yellow, borderBottom: `1px solid ${TH.border}`, background: TH.surface }}>
          {contextMenu.ticker}
        </div>
        {lists.map((list, i) => {
          const inList = isFavorite(contextMenu.ticker, i);
          return (
            <div
              key={i}
              onClick={() => { inList ? removeFromList(contextMenu.ticker, i) : addToList(contextMenu.ticker, i); setContextMenu(null); }}
              style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer", color: inList ? TH.yellow : TH.text, display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid #333` }}
              onMouseEnter={e => e.currentTarget.style.background = TH.surfaceHigh}
              onMouseLeave={e => e.currentTarget.style.background = ""}
            >
              <span style={{ fontSize: 14 }}>{inList ? "★" : "☆"}</span>
              <span>{list.name}</span>
              {inList && <span style={{ marginLeft: "auto", fontSize: 10, color: "#888" }}>제거</span>}
            </div>
          );
        })}
        <div
          onClick={() => { const n = prompt("새 목록 이름", "새 관심목록"); if (n) { addList(n); } setContextMenu(null); }}
          style={{ padding: "7px 14px", fontSize: 11, cursor: "pointer", color: TH.textDim, borderTop: `1px solid ${TH.border}` }}
          onMouseEnter={e => e.currentTarget.style.background = TH.surfaceHigh}
          onMouseLeave={e => e.currentTarget.style.background = ""}
        >
          + 새 목록에 추가
        </div>
      </div>
    )}
    </div>
    </>
  );
}
