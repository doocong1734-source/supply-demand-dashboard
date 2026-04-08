import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useMarketData } from "./hooks/useMarketData.js";
import { useFavorites } from "./hooks/useFavorites.js";

const C = {
  bg: "#1a1a1a", surface: "#2d3748", surfaceAlt: "#2a2a2a", border: "#444", borderLight: "#333",
  text: "#e0e0e0", textDim: "#9ca3af", textBright: "#fff",
  green: "#10b981", greenBright: "#4ade80", red: "#ef4444", redBright: "#f87171",
  blue: "#3b82f6", blueLight: "#a5b4fc", purple: "#9c27b0", yellow: "#f59e0b",
  orange: "#ff5722", cyan: "#00bcd4", pink: "#e91e63", teal: "#009688",
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
    <td style={{ ...tdStyle, color: isPos ? C.green : C.red, fontWeight: 700, fontSize: 12 }}>
      <div style={{ position: "relative", display: "inline-block", padding: "2px 4px", borderRadius: 3, minWidth: 50, textAlign: "right" }}>
        <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 3, opacity: 0.2, zIndex: 0, maxWidth: "100%", width: `${pct}%`, backgroundColor: isPos ? C.green : C.red, ...(isPos ? { left: 0 } : { right: 0 }) }} />
        <span style={{ position: "relative", zIndex: 1 }}>{isPos ? "+" : ""}{value.toFixed(2)}%</span>
      </div>
    </td>
  );
}

function ABCBadge({ grade }) {
  const colors = { A: C.blue, B: C.green, C: C.yellow };
  if (!grade) return <span>-</span>;
  return <span style={{ display: "inline-block", width: 22, height: 22, borderRadius: "50%", textAlign: "center", lineHeight: "22px", fontWeight: 800, fontSize: 11, color: "#fff", backgroundColor: colors[grade] || "#666" }}>{grade}</span>;
}

function SignalBadge({ signal, compact }) {
  const conf = {
    "강력매수": { bg: "#10b98122", border: "#10b981", color: "#10b981" },
    "매수": { bg: "#10b98115", border: "#10b98188", color: "#10b981cc" },
    "관망↑": { bg: "#3b82f615", border: "#3b82f688", color: "#3b82f6" },
    "중립": { bg: "#64748b15", border: "#64748b66", color: "#94a3b8" },
    "관망↓": { bg: "#f59e0b15", border: "#f59e0b88", color: "#f59e0b" },
    "매도": { bg: "#ef444415", border: "#ef444488", color: "#ef4444cc" },
    "강력매도": { bg: "#ef444422", border: "#ef4444", color: "#ef4444" },
  };
  const c = conf[signal] || conf["중립"];
  return <span style={{ padding: compact ? "1px 6px" : "2px 8px", borderRadius: 4, fontSize: compact ? 10 : 11, fontWeight: 700, background: c.bg, border: `1px solid ${c.border}`, color: c.color, whiteSpace: "nowrap", letterSpacing: 0.3 }}>{signal}</span>;
}

function ScoreCell({ score }) {
  const pct = (score + 100) / 2;
  const color = score >= 30 ? C.green : score >= -10 ? C.blue : score >= -30 ? C.yellow : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 50, height: 5, background: "#333", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28 }}>{score > 0 ? "+" : ""}{score}</span>
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
    const color = i === maxIdx ? C.greenBright : "#888";
    return `<rect x="${i * (width / data.length)}" y="${height - h}" width="${(width / data.length) - 1}" height="${h}" fill="${color}" rx="1"/>`;
  }).join("");
  return <svg width={width} height={height} dangerouslySetInnerHTML={{ __html: bars }} style={{ display: "block" }} />;
}

const thStyle = { textAlign: "left", padding: "6px 6px", backgroundColor: C.surface, cursor: "pointer", userSelect: "none", fontWeight: 700, borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 11, whiteSpace: "nowrap" };
const tdStyle = { padding: "5px 6px", borderBottom: `1px solid ${C.borderLight}`, verticalAlign: "middle", color: C.text, fontSize: 12 };

// TradingView 임베드 위젯
function TradingViewChart({ ticker }) {
  const containerRef = useRef(null);
  const scriptRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // 기존 콘텐츠 제거
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: ticker,
      interval: "D",
      timezone: "Asia/Seoul",
      theme: "dark",
      style: "1",
      locale: "kr",
      backgroundColor: "#1a1a1a",
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
    scriptRef.current = script;

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [ticker]);

  return (
    <div style={{ width: "100%", height: 1000, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}`, marginBottom: 12, background: "#1a1a1a" }}>
      <div className="tradingview-widget-container" ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 100, gap: 16 }}>
      <div style={{ width: 48, height: 48, border: `4px solid ${C.border}`, borderTopColor: C.green, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ color: C.textDim, fontSize: 14 }}>Yahoo Finance에서 실시간 데이터 로딩 중...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function IndCard({ ind, bullish, bearish }) {
  const [tip, setTip] = useState(null);
  const statusColor = bullish ? C.green : bearish ? C.red : C.textDim;
  return (
    <div
      style={{ padding: 8, background: "#1f2937", borderRadius: 6, border: `1px solid ${C.borderLight}`, borderLeft: `3px solid ${statusColor}`, cursor: "help", position: "relative" }}
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setTip({ x: r.left, y: r.top, bottom: r.bottom });
      }}
      onMouseLeave={() => setTip(null)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <span style={{ fontSize: 10, color: C.textDim }}>{ind.name}</span>
        <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "#374151", color: C.textDim }}>{ind.cat}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{ind.val}</div>
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
  const color = isVol ? C.cyan : val >= 0 ? C.green : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: `1px solid ${C.borderLight}` }}>
      <span style={{ width: 18, fontSize: 10, color: rank <= 3 ? C.yellow : C.textDim, textAlign: "right", fontWeight: 800 }}>{rank}</span>
      <span style={{ padding: "1px 6px", borderRadius: 10, background: "#4a5568", color: "#fff", fontSize: 11, fontWeight: 700, minWidth: 46, textAlign: "center" }}>{row.ticker}</span>
      <span style={{ fontSize: 10, color: C.textDim, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{row.group}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color, minWidth: 62, textAlign: "right" }}>
        {isVol ? fmtVol(val) : `${val >= 0 ? "+" : ""}${val?.toFixed(2)}%`}
      </span>
      <SignalBadge signal={row.signal} compact />
    </div>
  );
}

function RankColumn({ title, rows, valueKey, color, isVol }) {
  return (
    <div style={{ flex: 1, background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden", minWidth: 0 }}>
      <div style={{ padding: "8px 10px", background: "#374151", borderBottom: `1px solid ${C.border}`, fontWeight: 700, fontSize: 12, color }}>{title}</div>
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

  if (loading) return <div style={{ padding: 30, color: C.textDim, textAlign: "center" }}>M-Score 로딩 중...</div>;
  if (!data || data.error) return <div style={{ padding: 30, color: C.red, textAlign: "center" }}>데이터 로드 실패</div>;

  const { score, status, label, color, details, spy, qqq, updatedAt } = data;
  const bgColor = `${color}10`;
  const timePart = updatedAt ? new Date(updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "--:--";

  const DetailBar = ({ lbl, value, max }) => {
    const pct = max > 0 ? Math.min(100, Math.max(0, (Math.abs(value) / max) * 100)) : 0;
    const isNeg = value < 0;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 36px", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: C.textDim }}>{lbl}</span>
        <div style={{ height: 6, background: "#333", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: isNeg ? C.red : color, borderRadius: 3 }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: isNeg ? C.red : color, textAlign: "right" }}>{value > 0 ? "+" : ""}{value}</span>
      </div>
    );
  };

  return (
    <div style={{ padding: 16, maxWidth: 620, margin: "0 auto" }}>
      <div style={{ padding: "14px 18px", borderRadius: 8, background: bgColor, border: `1px solid ${color}44`, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>🎯 M-Score</span>
          <span style={{ fontSize: 36, fontWeight: 900, color, lineHeight: 1 }}>{score}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color }}>{status}</div>
            <div style={{ fontSize: 12, color: C.textDim }}>{label}</div>
          </div>
          <button onClick={fetchData} style={{ marginLeft: "auto", padding: "3px 10px", fontSize: 10, background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, cursor: "pointer" }}>↻</button>
        </div>
        <div style={{ height: 8, background: "#333", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
          <div style={{ width: `${Math.min(100, Math.max(0, (score + 100) / 2))}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textDim }}>
          <span>-100 (BEAR)</span><span>{score}</span><span>+100 (BULL)</span>
        </div>
      </div>

      <div style={{ padding: "12px 14px", borderRadius: 6, background: C.surface, border: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, marginBottom: 8 }}>세부 점수</div>
        <DetailBar lbl="MA 포지션" value={details.maPosition} max={25} />
        <DetailBar lbl="MA200 기울기" value={details.ma200Slope} max={10} />
        <DetailBar lbl="광폭지수" value={details.breadth} max={15} />
        <DetailBar lbl="52주 고점비" value={details.vs52wHigh} max={10} />
        <DetailBar lbl="QQQ vs SPY" value={details.qqqVsSpy} max={5} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        {[{ lbl: "SPY", d: spy }, { lbl: "QQQ", d: qqq }].map(({ lbl, d }) => (
          <div key={lbl} style={{ padding: "10px 12px", borderRadius: 6, background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.textBright, marginBottom: 4 }}>
              {lbl} <span style={{ color: C.textDim, fontWeight: 400 }}>${d?.price}</span>
              {" "}<span style={{ color: (d?.change1d ?? 0) >= 0 ? C.green : C.red, fontSize: 11 }}>{(d?.change1d ?? 0) > 0 ? "+" : ""}{d?.change1d}%</span>
            </div>
            <div style={{ fontSize: 10, color: C.textDim }}>SMA50: {d?.sma50?.toFixed(0)} · SMA150: {d?.sma150?.toFixed(0)} · SMA200: {d?.sma200?.toFixed(0)}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "8px 12px", borderRadius: 6, background: C.surface, border: `1px solid ${C.border}`, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: C.textDim }}>광폭지수</span>
        <span style={{ fontSize: 12 }}>SPXA200R <b style={{ color: C.text }}>{details.breadthRaw?.spxa200r}%</b></span>
        <span style={{ fontSize: 12 }}>SPXA50R <b style={{ color: C.text }}>{details.breadthRaw?.spxa50r}%</b></span>
        <span style={{ fontSize: 10, color: C.textDim, marginLeft: "auto" }}>갱신: {timePart}</span>
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
      <div style={{ marginBottom: 10, borderRadius: 6, border: `1px solid ${C.border}`, overflow: "hidden" }}>
        <div style={{ padding: "7px 12px", background: C.surface, fontSize: 12, fontWeight: 700, color: C.textBright }}>
          {icon} {title} <span style={{ color: C.textDim, fontWeight: 400 }}>({items.length})</span>
        </div>
        {items.map((item, i) => (
          <div key={i} style={{ borderTop: `1px solid ${C.borderLight}`, background: chartTicker === item.ticker ? "#374151" : "#1e2530" }}>
            <div
              onClick={() => setChartTicker(item.ticker)}
              onMouseEnter={e => e.currentTarget.style.background = "#263040"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              style={{ padding: "7px 12px", display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}>
              <b style={{ color: C.yellow, fontSize: 12, minWidth: 52 }}>{item.ticker}</b>
              {renderRow(item)}
              <AICommentBubble ticker={item.ticker} />
              <a href={`https://finviz.com/chart.ashx?t=${item.ticker}&ty=c&ta=1&p=d`} target="_blank" rel="noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ marginLeft: "auto", fontSize: 10, color: C.textDim, textDecoration: "none", padding: "1px 6px", border: `1px solid ${C.border}`, borderRadius: 3 }}>
                Finviz ↗
              </a>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return <div style={{ padding: 30, color: C.textDim, textAlign: "center" }}>트리거 로딩 중...</div>;

  const timePart = data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const empty = !data || data.totalCount === 0;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* 왼쪽: 트리거 목록 */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, borderRight: chartTicker ? `1px solid ${C.border}` : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>⚡ 진입 트리거</span>
            <span style={{ fontSize: 11, color: C.textDim }}>오늘 조건 충족 종목</span>
            {data && <span style={{ background: (data.totalCount ?? 0) > 0 ? C.orange : "#555", color: "#fff", borderRadius: 8, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>{data.totalCount ?? 0}</span>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {data?.cacheStats && <span style={{ fontSize: 10, color: C.textDim }}>캐시 {data.cacheStats.cached}/{data.cacheStats.total}</span>}
            <span style={{ fontSize: 10, color: C.textDim }}>{timePart}</span>
            <button onClick={fetchData} style={{ padding: "3px 10px", fontSize: 11, background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, cursor: "pointer" }}>↻</button>
          </div>
        </div>

        {data?.cacheStats?.cached === 0 && (
          <div style={{ padding: "8px 12px", borderRadius: 6, background: "#1f2937", border: `1px solid ${C.border}`, marginBottom: 10, fontSize: 11, color: C.yellow }}>
            💡 스크리너를 먼저 실행하면 캐시된 데이터로 트리거를 확인할 수 있습니다.
          </div>
        )}

        {empty ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textDim, fontSize: 13 }}>오늘 조건 충족 종목 없음</div>
        ) : (
          <>
            <Section icon="🚀" title="52주 신고가 돌파" items={data.breakout52w} renderRow={item => <>
              <span style={{ fontSize: 11, color: C.text }}>${item.price?.toFixed(2)}</span>
              <span style={{ fontSize: 10, color: C.textDim }}>TPR {item.tpr}</span>
              <span style={{ fontSize: 10, color: C.green }}>RS12m {item.rs12m?.toFixed(0)}</span>
            </>} />
            <Section icon="📐" title="VCP 완성" items={data.vcpComplete} renderRow={item => <>
              <span style={{ fontSize: 11, color: C.text }}>${item.price?.toFixed(2)}</span>
              <span style={{ fontSize: 10, color: C.cyan }}>VCP점수 {item.vcpScore}</span>
              <span style={{ fontSize: 10, color: C.green }}>RS12m {item.rs12m?.toFixed(0)}</span>
            </>} />
            <Section icon="📈" title="RS 신고가" items={data.rsMakingHigh} renderRow={item => <>
              <span style={{ fontSize: 11, color: C.text }}>${item.price?.toFixed(2)}</span>
              <span style={{ fontSize: 10, color: C.blue }}>RS/SPY {item.rsVsSpy}</span>
              <span style={{ fontSize: 10, color: C.green }}>RS12m {item.rs12m?.toFixed(0)}</span>
            </>} />
            <Section icon="🎯" title="포켓피봇" items={data.pocketPivot} renderRow={item => <>
              <span style={{ fontSize: 11, color: C.text }}>${item.price?.toFixed(2)}</span>
              <span style={{ fontSize: 10, color: C.green }}>RS12m {item.rs12m?.toFixed(0)}</span>
            </>} />
          </>
        )}
      </div>

      {/* 오른쪽: TradingView 차트 */}
      {chartTicker && (
        <div style={{ width: 1040, flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 12px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{chartTicker}</span>
            <button onClick={() => setChartTicker(null)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 16 }}>✕</button>
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
  const mkBtn = (active, color = C.green) => ({
    padding: "4px 10px", fontSize: 11, fontWeight: 600,
    border: `1px solid ${active ? color : C.border}`, borderRadius: 4,
    background: active ? `${color}18` : "transparent",
    color: active ? color : C.textDim, cursor: "pointer",
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
        <div style={{ width: 1, height: 20, background: C.border }} />
        <button style={mkBtn(filterAUM, C.yellow)} onClick={() => setFilterAUM(p => !p)}>
          {filterAUM ? "✓ 시총 $1B+" : "전체 종목"}
        </button>
        <span style={{ fontSize: 10, color: C.textDim }}>({allRows.length}개 종목)</span>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <RankColumn title={`▲ 상승 TOP10 (${periodLabel[period]})`} rows={topGain} valueKey={pKey} color={C.green} isVol={false} />
        <RankColumn title={`▼ 하락 TOP10 (${periodLabel[period]})`} rows={topLose} valueKey={pKey} color={C.red} isVol={false} />
        <RankColumn title={`📊 거래량 TOP10 (${volLabel[period]})`} rows={topVol} valueKey={vKey} color={C.cyan} isVol={true} />
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
    Bull:    { bg: "#10b98122", border: "#10b981", color: "#10b981", icon: "🟢" },
    Caution: { bg: "#f59e0b22", border: "#f59e0b", color: "#f59e0b", icon: "🟡" },
    Bear:    { bg: "#ef444422", border: "#ef4444", color: "#ef4444", icon: "🔴" },
    Unknown: { bg: "#44444422", border: "#666",    color: "#999",    icon: "⚪" },
  };
  const s = conf[model.status] || conf.Unknown;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 6, background: s.bg, border: `1px solid ${s.border}`, fontSize: 10 }}>
      <span>{s.icon} SPY 타이밍</span>
      <span style={{ fontWeight: 800, color: s.color }}>{model.status}</span>
      {model.spyPrice && (
        <span style={{ color: C.textDim }}>
          ${model.spyPrice} | MA50 ${model.spyMa50} | MA200 ${model.spyMa200}
        </span>
      )}
    </div>
  );
}

function VcpBar({ score }) {
  const color = score >= 80 ? C.green : score >= 60 ? C.yellow : score >= 40 ? C.orange : "#555";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <div style={{ width: 30, height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
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
  const [spyModel, setSpyModel] = useState(null);
  const [mscore, setMscore] = useState(null);
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
          new Notification(`💡 포켓피봇: ${row.ticker}`, { body: `TPR:${row.tpr} RS/SPY:${row.rsVsSpy}`, icon: "/vite.svg" });
        if (notifySignals.has("fundGrade") && row.fundGrade && row.stage2Loose)
          new Notification(`💰 펀더멘탈우수+상승추세: ${row.ticker}`, { body: `EPS:${row.epsThisY?.toFixed(0)}% 매출:${row.salesQQ?.toFixed(0)}%`, icon: "/vite.svg" });
      }
    });
    es.addEventListener("done", e => {
      setRunning(false); es.close();
      if (notifyEnabled) { const d = JSON.parse(e.data); new Notification("스크리닝 완료", { body: `${d.passing}개 통과 / ${d.total}개 분석`, icon: "/vite.svg" }); }
    });
    es.onerror = () => { setRunning(false); es.close(); };
  }

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
  const mkBtn = (active, color = C.cyan) => ({
    padding: "5px 12px", fontSize: 15, fontWeight: 600,
    border: `1px solid ${active ? color : C.border}`, borderRadius: 4,
    background: active ? `${color}22` : "transparent",
    color: active ? color : C.textDim, cursor: "pointer",
  });
  const pct = progress.total > 0 ? (progress.i / progress.total) * 100 : 0;
  // ⑤ 시장 타이밍 경고 (M-Score 연동)
  const mscoreBear = mscore && mscore.score <= -20;
  const mscoreCaution = mscore && mscore.score < 20 && mscore.score > -20;
  const spyWarning = mscoreBear || mscoreCaution || (spyModel && (spyModel.status === "Caution" || spyModel.status === "Bear"));

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", borderRight: chartTicker ? `1px solid ${C.border}` : "none" }}>
        {/* ── Controls ── */}
        <div style={{ padding: "8px 12px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>

          {/* M-Score 미니 배지 */}
          {mscore && (
            <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
              <span
                onClick={onGoMScore}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 10px", borderRadius: 12, background: `${mscore.color}20`, border: `1px solid ${mscore.color}66`, color: mscore.color, fontSize: 11, fontWeight: 700, cursor: onGoMScore ? "pointer" : "default" }}>
                🎯 {mscore.status} {mscore.score}
              </span>
              <span style={{ fontSize: 10, color: C.textDim }}>{mscore.label}</span>
            </div>
          )}

          {/* ⑤ 시장 타이밍 경고 배너 (M-Score 연동) */}
          {spyWarning && (
            <div style={{ marginBottom: 6, padding: "5px 10px", borderRadius: 4, background: mscoreBear ? "#ef444422" : "#f59e0b22", border: `1px solid ${mscoreBear ? C.red : C.yellow}`, fontSize: 10, color: mscoreBear ? C.red : C.yellow, display: "flex", gap: 8, alignItems: "center" }}>
              <span>{mscoreBear ? "🔴 BEAR 구간" : "🟡 주의구간"}: M-Score {mscore ? mscore.score : ""} {mscoreBear ? "(현금 비중 확대 권장)" : "(선별적 매수)"}</span>
              <span style={{ color: C.textDim }}>→ TPR A+ 필터 + 엄격 모드 권장</span>
              <button onClick={() => { setActiveScreens(new Set(["bnb", "stage2", "tprA", "fundGrade"])); setFilterMode("group-and"); }}
                style={{ padding: "1px 7px", fontSize: 9, border: `1px solid ${C.yellow}`, borderRadius: 3, background: "transparent", color: C.yellow, cursor: "pointer" }}>
                자동 적용
              </button>
            </div>
          )}

          {/* Row 1: universe / price / limit / run / CSV / 프리셋 */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            <select value={universe} onChange={e => setUniverse(e.target.value)} style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: "5px 8px", fontSize: 15 }}>
              <option value="nasdaq100">NASDAQ 100</option>
              <option value="sp500">S&amp;P 500</option>
              <option value="sp100">S&amp;P 100</option>
              <option value="both">NASDAQ+SP100</option>
              <option value="russell2000">Russell 2000 (IWM)</option>
              <option value="custom">직접 입력</option>
            </select>
            {universe === "custom" && (
              <input value={customInput} onChange={e => setCustomInput(e.target.value)} placeholder="AAPL,MSFT,NVDA" style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: "5px 8px", fontSize: 15, width: 160 }} />
            )}
            <span style={{ fontSize: 14, color: C.textDim }}>$</span>
            <input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)} style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: "5px 6px", fontSize: 15, width: 58 }} />
            <span style={{ fontSize: 14, color: C.textDim }}>~</span>
            <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: "5px 6px", fontSize: 15, width: 70 }} />
            <span style={{ fontSize: 14, color: C.textDim }}>최대</span>
            <input type="number" value={limit} onChange={e => setLimit(e.target.value)} style={{ background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 4, padding: "5px 6px", fontSize: 15, width: 56 }} />
            <button onClick={handleRun} style={{ padding: "6px 18px", fontSize: 15, fontWeight: 700, border: "none", borderRadius: 4, background: running ? C.red : C.green, color: "#000", cursor: "pointer" }}>
              {running ? "■ 중지" : "▶ 실행"}
            </button>
            <span style={{ fontSize: 14, color: C.textDim, minWidth: 52 }}>{filtered.length}/{results.length}개</span>
            {spyModel && <SpyBadge model={spyModel} />}

            {/* ⑦ CSV */}
            {sorted.length > 0 && (
              <button onClick={exportCSV} style={{ padding: "5px 12px", fontSize: 15, border: `1px solid ${C.blue}`, borderRadius: 4, background: "transparent", color: C.blue, cursor: "pointer" }}>
                ⬇ CSV
              </button>
            )}

            {/* ④ 프리셋 */}
            <div style={{ position: "relative" }}>
              <button onClick={() => setPresetDropdown(p => !p)} style={{ padding: "5px 12px", fontSize: 15, border: `1px solid ${C.purple}`, borderRadius: 4, background: "transparent", color: C.purple, cursor: "pointer" }}>
                📋 프리셋
              </button>
              {presetDropdown && (
                <div style={{ position: "absolute", top: "100%", left: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, zIndex: 999, minWidth: 200, boxShadow: "0 4px 16px #000a", marginTop: 2 }}>
                  <div onClick={savePreset} style={{ padding: "7px 14px", fontSize: 11, cursor: "pointer", color: C.purple, borderBottom: `1px solid #333`, fontWeight: 700 }}
                    onMouseEnter={e => e.currentTarget.style.background = "#374151"} onMouseLeave={e => e.currentTarget.style.background = ""}>
                    + 현재 설정 저장
                  </div>
                  {presets.length === 0 && <div style={{ padding: "7px 14px", fontSize: 10, color: C.textDim }}>저장된 프리셋 없음</div>}
                  {presets.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 14px", borderBottom: `1px solid #333` }}>
                      <span onClick={() => loadPreset(p)} style={{ flex: 1, fontSize: 11, cursor: "pointer", color: C.text }}
                        onMouseEnter={e => e.currentTarget.style.color = C.purple} onMouseLeave={e => e.currentTarget.style.color = C.text}>
                        {p.name}
                      </span>
                      <button onClick={() => deletePreset(i)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 11, padding: "0 2px" }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ⑧ 알림 */}
            {"Notification" in window && (
              <div style={{ position: "relative" }}>
                <button onClick={toggleNotify} style={{ padding: "5px 12px", fontSize: 15, border: `1px solid ${notifyEnabled ? C.green : C.border}`, borderRadius: 4, background: notifyEnabled ? `${C.green}22` : "transparent", color: notifyEnabled ? C.green : C.textDim, cursor: "pointer" }}>
                  🔔 {notifyEnabled ? "ON" : "OFF"}
                </button>
                {notifyEnabled && (
                  <button onClick={() => setShowNotifyPanel(p => !p)} style={{ marginLeft: 2, padding: "5px 8px", fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 4, background: "transparent", color: C.textDim, cursor: "pointer" }}>⚙</button>
                )}
                {showNotifyPanel && notifyEnabled && (
                  <div style={{ position: "absolute", top: "100%", right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, zIndex: 999, minWidth: 200, boxShadow: "0 4px 16px #000a", marginTop: 2, padding: "8px 12px" }}>
                    <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, fontWeight: 700 }}>신호별 알림 설정</div>
                    {[
                      { key: "vcp_break", label: "🔥 VCP + 돌파임박" },
                      { key: "rsMakingHigh", label: "📈 RS 신고가" },
                      { key: "pocketPivot", label: "💡 포켓피봇" },
                      { key: "fundGrade", label: "💰 펀더멘탈 우수 + 상승추세" },
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
                <button onClick={() => setAddDropdown(p => !p)} style={{ padding: "3px 8px", fontSize: 10, border: `1px solid ${C.yellow}`, borderRadius: 4, background: "transparent", color: C.yellow, cursor: "pointer", fontWeight: 700 }}>
                  ★ 관심추가 ({filtered.length})
                </button>
                {addDropdown && (
                  <div style={{ position: "absolute", top: "100%", left: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, zIndex: 999, minWidth: 160, boxShadow: "0 4px 16px #000a", marginTop: 2 }}>
                    {lists.map((list, i) => (
                      <div key={i} onClick={() => { filtered.forEach(r => addToList(r.ticker, i)); setAddDropdown(false); }}
                        style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer", color: C.text, borderBottom: `1px solid #333` }}
                        onMouseEnter={e => e.currentTarget.style.background = "#374151"} onMouseLeave={e => e.currentTarget.style.background = ""}>
                        {i === activeIdx ? "★" : "☆"} {list.name}
                      </div>
                    ))}
                    <div onClick={() => { const n = prompt("새 목록 이름", "스크리너 결과"); if (n?.trim()) addList(n.trim()); setAddDropdown(false); }}
                      style={{ padding: "7px 14px", fontSize: 11, cursor: "pointer", color: C.textDim }}
                      onMouseEnter={e => e.currentTarget.style.background = "#374151"} onMouseLeave={e => e.currentTarget.style.background = ""}>
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
            <div style={{ display: "flex", gap: 2, border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px", flexShrink: 0 }}>
              {[["any","OR (하나이상)"], ["group-and","그룹AND"], ["all","전체AND (엄격)"]].map(([val, label]) => (
                <button key={val} onClick={() => setFilterMode(val)}
                  style={{ padding: "2px 7px", fontSize: 9, fontWeight: 700, border: "none", borderRadius: 3, cursor: "pointer",
                    background: filterMode === val ? (val === "all" ? C.red : val === "group-and" ? C.orange : C.blue) : "transparent",
                    color: filterMode === val ? "#fff" : C.textDim }}>
                  {label}
                </button>
              ))}
            </div>
            {Object.entries(SCREEN_GROUPS).map(([group, keys]) => (
              <div key={group} style={{ display: "flex", gap: 2, alignItems: "center" }}>
                <span style={{ fontSize: 9, color: C.textDim }}>{group}:</span>
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
              style={{ padding: "2px 8px", fontSize: 9, border: `1px solid ${showNumFilter || minRpr > 0 || minRsSpy > 0 || minEpsThisY !== "" || minSalesQQ !== "" ? C.cyan : C.border}`, borderRadius: 4, background: "transparent", color: showNumFilter ? C.cyan : C.textDim, cursor: "pointer" }}>
              ⚙ 수치 필터 {(minRpr > 0 || minRsSpy > 0 || minEpsThisY !== "" || minSalesQQ !== "") ? "●" : ""}
            </button>
            {showNumFilter && (
              <>
                <span style={{ fontSize: 9, color: C.textDim }}>RPR≥</span>
                <input type="number" value={minRpr} onChange={e => setMinRpr(Number(e.target.value))} min={0} max={100}
                  style={{ width: 38, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 4px", fontSize: 10 }} />
                <span style={{ fontSize: 9, color: C.textDim }}>RS/SPY≥</span>
                <input type="number" value={minRsSpy} onChange={e => setMinRsSpy(Number(e.target.value))} min={0} max={100}
                  style={{ width: 38, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 4px", fontSize: 10 }} />
                <span style={{ fontSize: 9, color: C.textDim }}>EPS올해≥</span>
                <input type="number" value={minEpsThisY} onChange={e => setMinEpsThisY(e.target.value)} placeholder="%"
                  style={{ width: 42, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 4px", fontSize: 10 }} />
                <span style={{ fontSize: 9, color: C.textDim }}>매출Q≥</span>
                <input type="number" value={minSalesQQ} onChange={e => setMinSalesQQ(e.target.value)} placeholder="%"
                  style={{ width: 42, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 4px", fontSize: 10 }} />
                <button onClick={() => { setMinRpr(0); setMinRsSpy(0); setMinEpsThisY(""); setMinSalesQQ(""); }}
                  style={{ padding: "2px 6px", fontSize: 9, border: `1px solid ${C.border}`, borderRadius: 3, background: "transparent", color: C.red, cursor: "pointer" }}>초기화</button>
              </>
            )}
          </div>

          {/* 프로그레스 바 */}
          {(running || progress.total > 0) && (
            <div style={{ marginTop: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.textDim, marginBottom: 2 }}>
                <span>{progress.ticker}</span>
                <span>{progress.i}/{progress.total} 분석 · 통과 {progress.passing}</span>
              </div>
              <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: C.green, transition: "width 0.2s", borderRadius: 2 }} />
              </div>
            </div>
          )}
        </div>

        {/* ── Results table ── */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 11 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2, background: C.surface }}>
              <tr>
                <th style={{ ...thS, width: 24 }}>★</th>
                <th style={{ ...thS, width: 65 }} onClick={() => toggleSort("ticker")}>Ticker</th>
                <th style={{ ...thS, width: 58 }} onClick={() => toggleSort("price")}>Price</th>
                <th style={{ ...thS, width: 38 }} onClick={() => toggleSort("tpr")}>TPR</th>
                <th style={{ ...thS, width: 40 }} onClick={() => toggleSort("rpr")} title="Relative Performance Ranking">RPR</th>
                <th style={{ ...thS, width: 52 }} onClick={() => toggleSort("rsVsSpy")} title="RS vs SPY">RS/SPY</th>
                <th style={{ ...thS, width: 52 }} onClick={() => toggleSort("rs12m")}>RS12m%</th>
                <th style={{ ...thS, width: 48 }} onClick={() => toggleSort("vcpScore")}>VCP점수</th>
                {/* ② 종합 패스 수 */}
                <th style={{ ...thS, width: 38, color: C.cyan }} onClick={() => toggleSort("passCount")} title="통과 신호 수 (12개 중)">
                  패스{sortKey === "passCount" ? (sortDir === "desc" ? "▼" : "▲") : ""}
                </th>
                <th style={{ ...thS, width: 50 }} onClick={() => toggleSort("epsThisY")}>EPS올해</th>
                <th style={{ ...thS, width: 48 }} onClick={() => toggleSort("salesQQ")}>매출Q</th>
                <th style={{ ...thS, width: 46 }} onClick={() => toggleSort("instTrans")}>기관↑↓</th>
                <th style={{ ...thS, width: 40 }} onClick={() => toggleSort("pe")}>P/E</th>
                <th style={{ ...thS, width: 40 }} onClick={() => toggleSort("fpe")}>F/PE</th>
                <th style={{ ...thS, width: 50 }} onClick={() => toggleSort("epsNextY")}>EPS(1Y)</th>
                <th style={{ ...thS, width: 50 }} onClick={() => toggleSort("eps5Y")}>EPS(5Y)</th>
                <th style={{ ...thS, width: 40 }} onClick={() => toggleSort("roe")}>ROE</th>
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
                  style={{ cursor: "pointer", background: chartTicker === row.ticker ? "#374151" : i % 2 === 0 ? C.bg : "transparent" }}>
                  <td style={{ ...tdStyle, textAlign: "center", padding: "2px 2px" }}>
                    <button onClick={e => { e.stopPropagation(); toggleFavorite(row.ticker); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: isInAnyList(row.ticker) ? C.yellow : "#444", fontSize: 13, padding: 0, lineHeight: 1 }}>★</button>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ padding: "1px 5px", borderRadius: 10, background: "#4a5568", color: "#fff", fontWeight: 700, fontSize: 11 }}>{row.ticker}</span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>${row.price?.toFixed(2)}</td>
                  <td style={tdStyle}>
                    <span style={{ padding: "1px 5px", borderRadius: 4, background: `${TPR_COLOR[row.tpr] ?? "#666"}33`, color: TPR_COLOR[row.tpr] ?? C.textDim, fontWeight: 700, fontSize: 10 }}>{row.tpr}</span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: (row.rpr ?? 0) >= 70 ? C.green : C.text }}>{row.rpr?.toFixed(0)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: (row.rsVsSpy ?? 50) >= 60 ? C.green : (row.rsVsSpy ?? 50) <= 40 ? C.red : C.textDim }}>
                    {row.rsVsSpy ?? "-"}{row.rsMakingHigh && <span style={{ marginLeft: 2, fontSize: 9, color: C.green }}>▲</span>}
                  </td>
                  <td style={{ ...tdStyle, color: (row.rs12m ?? 0) >= 0 ? C.green : C.red, fontWeight: 600 }}>
                    {row.rs12m != null ? `${row.rs12m >= 0 ? "+" : ""}${row.rs12m.toFixed(1)}%` : "-"}
                  </td>
                  <td style={tdStyle}><VcpBar score={row.vcpScore ?? 0} /></td>
                  {/* ② 패스 수 */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <span style={{
                      display: "inline-block", width: 22, height: 22, lineHeight: "22px", textAlign: "center",
                      borderRadius: "50%", fontSize: 10, fontWeight: 800,
                      background: row.passCount >= 7 ? C.green : row.passCount >= 4 ? C.yellow : row.passCount >= 2 ? C.orange : "#333",
                      color: row.passCount >= 2 ? "#000" : C.textDim,
                    }}>{row.passCount}</span>
                  </td>
                  <td style={{ ...tdStyle, color: (row.epsThisY ?? 0) >= 20 ? C.green : (row.epsThisY ?? 0) < 0 ? C.red : C.text, fontWeight: 700, fontSize: 10 }}>
                    {row.epsThisY != null ? `${row.epsThisY >= 0 ? "+" : ""}${row.epsThisY.toFixed(0)}%` : "-"}
                  </td>
                  <td style={{ ...tdStyle, color: (row.salesQQ ?? 0) >= 10 ? C.green : (row.salesQQ ?? 0) < 0 ? C.red : C.text, fontWeight: 600, fontSize: 10 }}>
                    {row.salesQQ != null ? `${row.salesQQ >= 0 ? "+" : ""}${row.salesQQ.toFixed(0)}%` : "-"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center", fontSize: 11, fontWeight: 700 }}>
                    {row.instTrans != null
                      ? <span style={{ color: row.instTrans > 0 ? C.green : row.instTrans < 0 ? C.red : C.textDim }}>
                          {row.instTrans > 0 ? "▲" : row.instTrans < 0 ? "▼" : "─"}{Math.abs(row.instTrans).toFixed(1)}%
                        </span>
                      : <span style={{ color: "#444" }}>-</span>}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 10, color: row.pe != null && row.pe < 20 ? C.green : C.textDim }}>{row.pe != null ? row.pe.toFixed(1) : "-"}</td>
                  <td style={{ ...tdStyle, fontSize: 10, color: row.fpe != null && row.fpe < 20 ? C.green : C.textDim }}>{row.fpe != null ? row.fpe.toFixed(1) : "-"}</td>
                  <td style={{ ...tdStyle, color: (row.epsNextY ?? 0) >= 10 ? C.green : (row.epsNextY ?? 0) < 0 ? C.red : C.text, fontWeight: 600, fontSize: 10 }}>
                    {row.epsNextY != null ? `${row.epsNextY >= 0 ? "+" : ""}${row.epsNextY.toFixed(0)}%` : "-"}
                  </td>
                  <td style={{ ...tdStyle, color: (row.eps5Y ?? 0) >= 10 ? C.green : (row.eps5Y ?? 0) < 0 ? C.red : C.text, fontWeight: 600, fontSize: 10 }}>
                    {row.eps5Y != null ? `${row.eps5Y >= 0 ? "+" : ""}${row.eps5Y.toFixed(0)}%` : "-"}
                  </td>
                  <td style={{ ...tdStyle, color: (row.roe ?? 0) >= 15 ? C.green : C.textDim, fontWeight: 600, fontSize: 10 }}>
                    {row.roe != null ? `${row.roe.toFixed(0)}%` : "-"}
                  </td>
                  {ALL_SCREEN_KEYS.map(k => (
                    <td key={k} style={{ ...tdStyle, textAlign: "center", fontSize: 13 }}>
                      {row[k] ? <span style={{ color: C.green, fontWeight: 800 }}>✓</span> : <span style={{ color: "#2a2a2a" }}>·</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {results.length === 0 && !running && (
            <div style={{ padding: 40, textAlign: "center", color: C.textDim, fontSize: 13 }}>
              ▶ 실행 버튼을 눌러 스크리닝을 시작하세요
              <div style={{ marginTop: 8, fontSize: 10, color: "#555" }}>
                Trend Template · VCP · RS vs SPY · 포켓피봇 · 돌파임박 · 펀더멘탈
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: TradingView chart ── */}
      {chartTicker && (
        <div style={{ width: 1040, flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 12px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{chartTicker}</span>
            <button onClick={() => setChartTicker(null)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 16 }}>✕</button>
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
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [sortStates, setSortStates] = useState({});
  const [viewMode, setViewMode] = useState("combined");
  const [flowFilter, setFlowFilter] = useState("all");
  const [watchlistSearch, setWatchlistSearch] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [customFavData, setCustomFavData] = useState({}); // 비목록 종목 검색 결과 캐시
  const [contextMenu, setContextMenu] = useState(null); // { x, y, ticker }
  const rowRefs = useRef({});
  const autoFetchingRef = useRef(new Set()); // 중복 자동조회 방지

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
            "5d": ind.fiveD ?? 0, "20d": ind.twentyD ?? 0,
            atrPct: ind.atrPct ?? 0, distSma50Atr: ind.distSma50Atr ?? 0,
            rs: ind.rs ?? 50, abc: ind.abc ?? "B",
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

  const btnStyle = (active, color = C.green) => ({
    padding: "7px 18px", fontSize: 16, fontWeight: 600,
    border: `1px solid ${active ? color : C.border}`, borderRadius: 4,
    background: active ? `${color}18` : "transparent",
    color: active ? color : C.textDim, cursor: "pointer",
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
        "5d": ind.fiveD ?? 0, "20d": ind.twentyD ?? 0,
        atrPct: ind.atrPct ?? 0, distSma50Atr: ind.distSma50Atr ?? 0,
        rs: ind.rs ?? 50, abc: ind.abc ?? "B",
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
    <div style={{ fontFamily: "Arial, sans-serif", background: C.bg, color: C.text, display: "flex", height: "100vh", margin: 0, overflow: "hidden" }}>
      {loading && data && (
        <div style={{ position: "fixed", top: 8, right: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 10px", fontSize: 11, color: C.textDim, zIndex: 50 }}>
          🔄 갱신 중...
        </div>
      )}
      {error && (
        <div style={{ position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)", background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 6, padding: "6px 14px", fontSize: 12, color: "#fca5a5", zIndex: 50 }}>
          ⚠ 서버 연결 오류: {error} — 백엔드 서버(port 3001)가 실행 중인지 확인하세요.
        </div>
      )}

      {/* ═══ LEFT PANEL ═══ */}
      <div style={{ width: (viewMode === "rankings" || viewMode === "screener" || viewMode === "mijoomo" || viewMode === "mscore" || viewMode === "trigger") ? undefined : viewMode === "combined" ? 920 : 780, flex: (viewMode === "rankings" || viewMode === "screener" || viewMode === "mijoomo" || viewMode === "mscore" || viewMode === "trigger") ? 1 : undefined, borderRight: (viewMode === "rankings" || viewMode === "screener" || viewMode === "mijoomo" || viewMode === "mscore" || viewMode === "trigger") ? "none" : `1px solid ${C.borderLight}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "8px 10px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button style={btnStyle(viewMode === "combined")} onClick={() => setViewMode("combined")}>통합뷰</button>
              <button style={btnStyle(viewMode === "original", C.blue)} onClick={() => setViewMode("original")}>시세뷰</button>
              <button style={btnStyle(viewMode === "flow", C.purple)} onClick={() => setViewMode("flow")}>수급뷰</button>
              <button style={btnStyle(viewMode === "watchlist", C.yellow)} onClick={() => setViewMode("watchlist")}>
                ★ 관심종목 {totalCount > 0 && <span style={{ marginLeft: 3, background: C.yellow, color: "#000", borderRadius: 8, padding: "0 5px", fontSize: 9, fontWeight: 800 }}>{totalCount}</span>}
              </button>
              <button style={btnStyle(viewMode === "rankings", C.cyan)} onClick={() => setViewMode("rankings")}>📊 랭킹</button>
              <button style={btnStyle(viewMode === "mscore", C.green)} onClick={() => setViewMode("mscore")}>🎯 M-Score</button>
              <button style={btnStyle(viewMode === "trigger", C.orange)} onClick={() => setViewMode("trigger")}>⚡ 트리거</button>
              <button style={btnStyle(viewMode === "screener", C.orange)} onClick={() => setViewMode("screener")}>🔍 스크리너</button>
              <button style={btnStyle(viewMode === "mijoomo", C.teal)} onClick={() => setViewMode("mijoomo")}>🌐 미주모</button>
              {lastUpdated && (
                <span style={{ fontSize: 10, color: C.textDim, marginLeft: 8 }}>
                  🕐 {lastUpdated.toLocaleTimeString("ko-KR")} 갱신
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
              <span>TOTAL <b style={{ color: C.text }}>{stats.total}</b></span>
              <span>BUY <b style={{ color: C.green }}>{stats.buy}</b></span>
              <span>SELL <b style={{ color: C.red }}>{stats.sell}</b></span>
              <span>A <b style={{ color: C.blue }}>{stats.gradeA}</b></span>
              <span>C <b style={{ color: C.yellow }}>{stats.gradeC}</b></span>
            </div>
          </div>
          {(viewMode === "combined" || viewMode === "flow") && (
            <div style={{ display: "flex", gap: 4 }}>
              <button style={btnStyle(flowFilter === "all", "#888")} onClick={() => setFlowFilter("all")}>전체</button>
              <button style={btnStyle(flowFilter === "buy", C.green)} onClick={() => setFlowFilter("buy")}>매수시그널</button>
              <button style={btnStyle(flowFilter === "sell", C.red)} onClick={() => setFlowFilter("sell")}>매도시그널</button>
              <button style={btnStyle(flowFilter === "accum", C.blue)} onClick={() => setFlowFilter("accum")}>매집중</button>
              <button style={btnStyle(flowFilter === "turnover", C.yellow)} onClick={() => setFlowFilter("turnover")}>손바뀜</button>
            </div>
          )}
          {viewMode === "watchlist" && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={watchlistSearch}
                onChange={e => setWatchlistSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch(watchlistSearch)}
                placeholder="티커 검색 (예: AAPL, TSLA, 005930.KS)"
                style={{ flex: 1, padding: "4px 10px", background: "#1f2937", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 12, outline: "none" }}
              />
              <button
                onClick={() => handleSearch(watchlistSearch)}
                disabled={searchLoading}
                style={{ ...btnStyle(true, C.blue), padding: "4px 12px" }}
              >
                {searchLoading ? "검색 중..." : "검색"}
              </button>
            </div>
          )}
        </div>

        {/* Table / Watchlist */}
        <div style={{ flex: 1, overflowY: viewMode === "mijoomo" ? "hidden" : "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>

          {/* ── 관심종목 뷰 ── */}
          {viewMode === "watchlist" && (
            <div>
              {/* 목록 탭 바 */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", background: "#111", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                {lists.map((list, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center" }}>
                    <button
                      onClick={() => setActiveIdx(i)}
                      onDoubleClick={() => { const n = prompt("목록 이름 변경", list.name); if (n?.trim()) renameList(i, n.trim()); }}
                      title="더블클릭으로 이름 변경"
                      style={{ padding: "3px 10px", fontSize: 11, border: "none", borderRadius: 4, background: activeIdx === i ? C.yellow : "#2d3748", color: activeIdx === i ? "#000" : C.textDim, cursor: "pointer", fontWeight: activeIdx === i ? 700 : 400 }}
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
                  style={{ padding: "3px 8px", fontSize: 11, border: `1px dashed ${C.border}`, borderRadius: 4, background: "none", color: C.textDim, cursor: "pointer" }}
                >+ 새 목록</button>
              </div>

              {searchResult?.error && (
                <div style={{ margin: 12, padding: 10, background: "#7f1d1d", borderRadius: 6, color: "#fca5a5", fontSize: 12 }}>
                  ⚠ {searchResult.error}
                </div>
              )}
              {favorites.length === 0 && !searchResult && (
                <div style={{ padding: 40, textAlign: "center", color: C.textDim, fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>★</div>
                  <div>"{lists[activeIdx]?.name}" 목록이 비어 있습니다.</div>
                  <div style={{ fontSize: 11, marginTop: 6 }}>메인 목록에서 우클릭 또는 ★ 버튼으로 추가하세요.</div>
                </div>
              )}
              {favorites.length > 0 && (
                <div>
                  <div style={{ padding: "6px 10px", background: C.surface, fontWeight: 700, fontSize: 12, borderBottom: `1px solid ${C.border}`, color: C.yellow }}>★ {lists[activeIdx]?.name} ({favorites.length})</div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                      <tr>
                        <th style={thStyle}>Ticker</th>
                        <th style={thStyle}>Grd</th>
                        <th style={thStyle}>Daily</th>
                        <th style={thStyle}>5D</th>
                        <th style={thStyle}>20D</th>
                        <th style={thStyle}>ATRx</th>
                        <th style={thStyle}>VARS</th>
                        <th style={thStyle}>수급</th>
                        <th style={thStyle}>시그널</th>
                        <th style={thStyle}>★</th>
                      </tr>
                    </thead>
                    <tbody>
                      {favorites.map((fav, i) => {
                        // 메인 데이터 → 검색 캐시 순으로 row 찾기
                        const row = (data ? Object.values(data).flat().find(r => r.ticker === fav) : null)
                          || customFavData[fav];
                        if (!row) return (
                          <tr key={fav} style={{ backgroundColor: i % 2 === 0 ? C.bg : "transparent" }}>
                            <td style={tdStyle}><span style={{ padding: "2px 8px", borderRadius: 12, background: "#4a5568", color: "#fff", fontSize: 11, fontWeight: 700 }}>{fav}</span></td>
                            <td style={{ ...tdStyle, color: C.textDim, fontSize: 11 }} colSpan={7}>⏳ 데이터 로딩 중...</td>
                            <td style={tdStyle}><button onClick={() => toggleFavorite(fav)} style={{ background: "none", border: "none", cursor: "pointer", color: C.yellow, fontSize: 16 }}>★</button></td>
                          </tr>
                        );
                        const isActive = selected?.ticker === fav;
                        return (
                          <tr key={fav} onClick={() => handleSelectRow(row)} style={{ cursor: "pointer", backgroundColor: isActive ? "#374151" : i % 2 === 0 ? C.bg : "transparent" }}>
                            <td style={tdStyle}><span style={{ padding: "2px 8px", borderRadius: 12, background: "#4a5568", color: "#fff", fontSize: 11, fontWeight: 700 }}>{fav}</span></td>
                            <td style={tdStyle}><ABCBadge grade={row.abc} /></td>
                            <ValueBar value={row.daily} min={-5} max={5} />
                            <ValueBar value={row["5d"]} min={-10} max={10} />
                            <ValueBar value={row["20d"]} min={-15} max={15} />
                            <td style={{ ...tdStyle, fontSize: 11 }}>{row.distSma50Atr?.toFixed(2)}</td>
                            <td style={{ ...tdStyle, fontSize: 11 }}>{row.rs}%</td>
                            <td style={tdStyle}><ScoreCell score={row.score} /></td>
                            <td style={tdStyle}><SignalBadge signal={row.signal} compact /></td>
                            <td style={tdStyle}>
                              <button onClick={e => { e.stopPropagation(); toggleFavorite(fav); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.yellow, fontSize: 16 }}>★</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
              <div style={{ padding: "6px 12px", background: C.surface, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: C.textDim }}>🌐 미주모 (mijoomo.com)</span>
                <a href="http://www.mijoomo.com/" target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: C.teal, textDecoration: "none", padding: "2px 8px", border: `1px solid ${C.teal}`, borderRadius: 4 }}>
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

          {/* ── 메인 테이블 뷰 ── */}
          {viewMode !== "watchlist" && viewMode !== "rankings" && viewMode !== "screener" && viewMode !== "mijoomo" && data && Object.entries(data).map(([group, rows]) => {
            const isCollapsed = collapsed[group];
            const filteredRows = filterRows(rows);
            const sortedRows = getSortedRows(group, filteredRows);
            const range = ranges[group] || {};

            return (
              <div key={group}>
                <div onClick={() => setCollapsed(p => ({ ...p, [group]: !p[group] }))} style={{ padding: "6px 10px", backgroundColor: C.surface, fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 3, cursor: "pointer", borderBottom: `1px solid ${C.border}`, color: C.text }}>
                  <span>{isCollapsed ? "▶" : "▼"} {group} <span style={{ fontSize: 11, color: C.textDim, fontWeight: 400 }}>({sortedRows.length})</span></span>
                  {group === "Industries" && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {Object.entries(SECTOR_COLORS).slice(0, 8).map(([sec, col]) => (
                        <span key={sec} style={{ padding: "1px 5px", borderRadius: 6, fontSize: 9, color: "#fff", backgroundColor: col }}>{sec.slice(0, 4)}</span>
                      ))}
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <thead style={{ position: "sticky", top: 35, zIndex: 2 }}>
                      <tr>
                        <th style={{ ...thStyle, width: 75 }} onClick={() => handleSort(group, "ticker")}>Ticker{getSortIndicator(group, "ticker")}</th>
                        <th style={{ ...thStyle, width: 36 }} onClick={() => handleSort(group, "abc")}>Grd{getSortIndicator(group, "abc")}</th>
                        {viewMode !== "flow" && <>
                          <th style={{ ...thStyle, width: 72 }} onClick={() => handleSort(group, "daily")}>Daily{getSortIndicator(group, "daily")}</th>
                          <th style={{ ...thStyle, width: 72 }} onClick={() => handleSort(group, "intra")}>Intra{getSortIndicator(group, "intra")}</th>
                          <th style={{ ...thStyle, width: 72 }} onClick={() => handleSort(group, "5d")}>5D{getSortIndicator(group, "5d")}</th>
                          <th style={{ ...thStyle, width: 72 }} onClick={() => handleSort(group, "20d")}>20D{getSortIndicator(group, "20d")}</th>
                        </>}
                        {viewMode !== "flow" && <th style={{ ...thStyle, width: 45 }} onClick={() => handleSort(group, "distSma50Atr")}>ATRx{getSortIndicator(group, "distSma50Atr")}</th>}
                        {viewMode !== "flow" && <th style={{ ...thStyle, width: 42 }} onClick={() => handleSort(group, "rs")}>VARS{getSortIndicator(group, "rs")}</th>}
                        {viewMode !== "flow" && <th style={{ ...thStyle, width: 70 }}>Chart</th>}
                        {viewMode !== "original" && <th style={{ ...thStyle, width: 62 }} onClick={() => handleSort(group, "score")}>수급{getSortIndicator(group, "score")}</th>}
                        {viewMode !== "original" && <th style={{ ...thStyle, width: 62 }}>시그널</th>}
                        {viewMode !== "original" && <th style={{ ...thStyle, width: 50 }}>단계</th>}
                        {viewMode !== "flow" && <th style={{ ...thStyle, width: 85 }}>LETF</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row, i) => {
                        const isActive = selected?.ticker === row.ticker && selected?.group === row.group;
                        const sectorColor = SECTOR_COLORS[row.sector] || "#666";
                        return (
                          <tr key={`${row.group}-${row.ticker}`} ref={el => rowRefs.current[`${row.group}-${row.ticker}`] = el} onClick={() => handleSelectRow(row)} onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, ticker: row.ticker }); }} style={{ cursor: "pointer", transition: "background 0.15s", backgroundColor: isActive ? "#374151" : i % 2 === 0 ? C.bg : "transparent" }}>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <button
                                  onClick={e => { e.stopPropagation(); toggleFavorite(row.ticker); }}
                                  title={isFavorite(row.ticker) ? "현재 목록에서 해제" : "현재 목록에 추가 (우클릭으로 목록 선택)"}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: isInAnyList(row.ticker) ? C.yellow : "#444", fontSize: 12, padding: 0, lineHeight: 1, flexShrink: 0 }}
                                >★</button>
                                <span style={{ display: "inline-block", padding: "2px 6px", borderRadius: 12, backgroundColor: group === "Industries" ? sectorColor : "#4a5568", color: "#fff", fontSize: 11, fontWeight: 700 }}>{row.ticker}</span>
                              </div>
                            </td>
                            <td style={tdStyle}><ABCBadge grade={row.abc} /></td>
                            {viewMode !== "flow" && <>
                              <ValueBar value={row.daily} min={range.daily?.[0]} max={range.daily?.[1]} />
                              <ValueBar value={row.intra} min={range.intra?.[0]} max={range.intra?.[1]} />
                              <ValueBar value={row["5d"]} min={range["5d"]?.[0]} max={range["5d"]?.[1]} />
                              <ValueBar value={row["20d"]} min={range["20d"]?.[0]} max={range["20d"]?.[1]} />
                            </>}
                            {viewMode !== "flow" && <td style={{ ...tdStyle, fontSize: 11, fontWeight: 600 }}>{row.distSma50Atr?.toFixed(2)}</td>}
                            {viewMode !== "flow" && <td style={{ ...tdStyle, fontSize: 11, fontWeight: 600 }}>{row.rs}%</td>}
                            {viewMode !== "flow" && <td style={tdStyle}><VARSChart data={row.varsChart} /></td>}
                            {viewMode !== "original" && <td style={tdStyle}><ScoreCell score={row.score} /></td>}
                            {viewMode !== "original" && <td style={tdStyle}><SignalBadge signal={row.signal} compact /></td>}
                            {viewMode !== "original" && <td style={{ ...tdStyle, fontSize: 10, color: row.phase.includes("매집") ? C.green : row.phase.includes("분산") || row.phase === "투매" ? C.red : C.textDim, fontWeight: 600 }}>{row.phase}</td>}
                            {viewMode !== "flow" && (
                              <td style={{ ...tdStyle, fontSize: 10, whiteSpace: "nowrap" }}>
                                {row.longETF?.map(e => <span key={e} style={{ color: C.greenBright, cursor: "pointer", textDecoration: "underline", marginRight: 3 }}>{e}</span>)}
                                {row.shortETF?.map(e => <span key={e} style={{ color: C.redBright, cursor: "pointer", textDecoration: "underline", marginRight: 3 }}>{e}</span>)}
                                {!row.longETF?.length && !row.shortETF?.length && <span style={{ color: "#555" }}>-</span>}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
          {viewMode !== "watchlist" && viewMode !== "rankings" && viewMode !== "screener" && viewMode !== "mijoomo" && (
            <div style={{ fontSize: 11, color: C.textDim, padding: 8, background: C.surface, position: "sticky", bottom: 0, borderTop: `1px solid ${C.border}` }}>
              ↑ ↓ 방향키로 이동 · 실시간 데이터: Yahoo Finance API · 5분 캐시
            </div>
          )}
        </div>
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      {viewMode !== "rankings" && viewMode !== "screener" && viewMode !== "mijoomo" && <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: 12, minHeight: 0, overflow: "auto" }}>
        {!selected ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.textDim, fontSize: 14 }}>
            종목을 선택하면 수급 상세 분석이 표시됩니다
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{selected.ticker}</div>
                  <button
                    onClick={() => toggleFavorite(selected.ticker)}
                    title={isFavorite(selected.ticker) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                    style={{
                      background: isFavorite(selected.ticker) ? "#f59e0b22" : "transparent",
                      border: `1px solid ${isFavorite(selected.ticker) ? C.yellow : C.border}`,
                      borderRadius: 6, cursor: "pointer",
                      color: isFavorite(selected.ticker) ? C.yellow : C.textDim,
                      fontSize: 14, padding: "3px 8px", fontWeight: 700,
                      transition: "all 0.15s",
                    }}
                  >
                    {isFavorite(selected.ticker) ? "★ 즐겨찾기됨" : "☆ 즐겨찾기"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: C.textDim }}>
                  {selected.group} · {selected.sector}
                  {selected.price > 0 && <span style={{ marginLeft: 8, color: C.textBright, fontWeight: 700 }}>${selected.price.toFixed(2)}</span>}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <SignalBadge signal={selected.signal} />
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>{selected.phase} · Score {selected.score > 0 ? "+" : ""}{selected.score}</div>
              </div>
            </div>

            {/* TradingView 차트 */}
            <TradingViewChart ticker={selected.ticker} />

            {/* Quick Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 12 }}>
              {[
                { label: "Grade", value: selected.abc, color: { A: C.blue, B: C.green, C: C.yellow }[selected.abc] },
                { label: "Daily", value: `${selected.daily > 0 ? "+" : ""}${selected.daily}%`, color: selected.daily >= 0 ? C.green : C.red },
                { label: "5D", value: `${selected["5d"] > 0 ? "+" : ""}${selected["5d"]}%`, color: selected["5d"] >= 0 ? C.green : C.red },
                { label: "20D", value: `${selected["20d"] > 0 ? "+" : ""}${selected["20d"]}%`, color: selected["20d"] >= 0 ? C.green : C.red },
                { label: "ATRx", value: selected.distSma50Atr?.toFixed(2), color: C.text },
                { label: "VARS", value: `${selected.rs}%`, color: selected.rs >= 50 ? C.green : C.red },
              ].map(({ label, value, color }, i) => (
                <div key={i} style={{ padding: 8, background: C.surfaceAlt, borderRadius: 6, border: `1px solid ${C.borderLight}` }}>
                  <div style={{ fontSize: 9, color: C.textDim, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* 12지표 */}
            <div style={{ fontSize: 12, fontWeight: 700, color: C.blueLight, marginBottom: 6, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 8 }}>
              수급 선행 12지표 분석
              {detailLoading && <span style={{ fontSize: 10, color: C.textDim }}>⏳ 공매도 데이터 로딩...</span>}
            </div>
            {/* 9개 지표: 추세(4) + 수급(4) + 시장(1) — VWAP·A/D·주문흐름 제거 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
              {selectedIndicators && [
                { key: "sma200", name: "SMA200 이탈",      cat: "추세",     val: `${(selectedIndicators.sma200Dev ?? 0) > 0 ? "+" : ""}${selectedIndicators.sma200Dev ?? 0}%`,
                  status: (selectedIndicators.sma200Dev ?? 0) < -10 ? "하방이탈" : (selectedIndicators.sma200Dev ?? 0) > 20 ? "과열" : "중립",
                  calc: "(현재가 - 200일 단순이동평균) / SMA200 × 100%",
                  meaning: "<-10% 하방: 역사적 저점권, 반등 기회\n>+20% 상방: 장기 과열, 평균회귀 경계\n0% 근처 = 장기 추세와 일치" },
                { key: "macd",   name: "MACD 히스토그램", cat: "추세",     val: selectedIndicators.macdHist ?? 0,
                  status: (selectedIndicators.macdHist ?? 0) > 0 ? "강세" : (selectedIndicators.macdHist ?? 0) < 0 ? "약세" : "중립",
                  calc: "EMA(12) - EMA(26) = MACD선 / Signal = EMA9[MACD] / 히스토그램 = MACD - Signal",
                  meaning: ">0 강세: 단기 모멘텀 상승 (MACD가 Signal 위)\n<0 약세: 단기 모멘텀 하락\n0 교차 = 추세 전환 신호" },
                { key: "rsi",    name: "RSI(14)",          cat: "추세",     val: selectedIndicators.rsi,
                  status: selectedIndicators.rsi < 30 ? "과매도" : selectedIndicators.rsi > 70 ? "과매수" : "중립",
                  calc: "14일 평균상승 / (평균상승 + 평균하락) × 100",
                  meaning: "<30 강한 과매도: 반등 기회 ↑\n<40 과매도권: 매수 검토\n>70 과매수: 매도 경계\n>75 강한 과매수: 단기 조정 주의" },
                { key: "bbPos",  name: "BB 포지션",        cat: "추세",     val: `${selectedIndicators.bbPos}%`,
                  status: selectedIndicators.bbPos < 20 ? "하단돌파" : selectedIndicators.bbPos > 80 ? "상단돌파" : "중립",
                  calc: "(현재가 - 하단밴드) / (상단 - 하단밴드) × 100 / 밴드 = 20일 SMA ± 2σ",
                  meaning: "<20% 하단: 평균회귀 매수 구간\n>80% 상단: 단기 과열, 조정 가능성\n50%=중간선 (20일 SMA)" },
                { key: "obv",    name: "OBV 다이버전스",  cat: "수급",     val: selectedIndicators.obv,
                  status: selectedIndicators.obv > 30 ? "매집" : selectedIndicators.obv < -30 ? "분산" : "중립",
                  calc: "상승일 +거래량, 하락일 -거래량 누적 → 최근 5일 평균 vs 이전 5일 평균 차이",
                  meaning: ">30 매집: 거래량이 상승을 뒷받침 (스마트머니 유입)\n<-30 분산: 거래량 하락 동반 (자금 이탈 신호)" },
                { key: "mfi",    name: "MFI",             cat: "수급",     val: selectedIndicators.mfi,
                  status: selectedIndicators.mfi < 20 ? "과매도" : selectedIndicators.mfi > 80 ? "과매수" : "중립",
                  calc: "TP=(H+L+C)/3, 자금흐름=TP×Vol → 14일 양/음 자금비율 (거래량 가중 RSI)",
                  meaning: "<20 과매도: 저점 반등 기회 ↑\n>80 과매수: 단기 조정 가능성 경고" },
                { key: "vol",    name: "거래량 비율",      cat: "수급",     val: `${selectedIndicators.volRatio}%`,
                  status: selectedIndicators.volRatio > 200 ? "급증" : selectedIndicators.volRatio < 40 ? "급감" : "보통",
                  calc: "당일 거래량 / 최근 20일 평균 거래량 × 100%",
                  meaning: ">200% 급증: 강한 추세 확인 신호\n<40% 급감: 관심 저하, 유동성 주의\n100% = 평균 수준" },
                { key: "short",  name: "공매도 비율",      cat: "수급",     val: selectedIndicators.shortInt != null ? `${selectedIndicators.shortInt}%` : "N/A",
                  status: selectedIndicators.shortInt == null ? "N/A" : selectedIndicators.shortInt > 15 ? "숏커버" : "보통",
                  calc: "공매도 잔량 / 유통주식수 × 100 / 출처: Yahoo Finance defaultKeyStatistics",
                  meaning: ">15% 숏커버: 숏스퀴즈 가능성 ↑ (강제 매수 잠재력)\n낮을수록: 매도 압력 적음\nN/A: ETF 등 데이터 미제공" },
                { key: "breadth",name: "시장 광폭",        cat: "시장",     val: `${selectedIndicators.breadth}%`,
                  status: selectedIndicators.breadth < 25 ? "과매도" : selectedIndicators.breadth > 75 ? "과매수" : "중립",
                  calc: "S&P500 종목 중 50일 이동평균선 위에 있는 비율 / 출처: Yahoo Finance ^SPXA50R",
                  meaning: "<25% 과매도: 시장 바닥권, 개별 반등 기회\n>75% 과매수: 시장 과열 경계\n50% 기준: 강세/약세 분기점" },
              ].map((ind) => {
                const bullish = ["매집", "과매도", "하방이탈", "하단돌파", "강세", "급증", "숏커버"].includes(ind.status);
                const bearish = ["분산", "과매수", "상방이탈", "상단돌파", "약세", "급감", "과열"].includes(ind.status);
                return <IndCard key={ind.key} ind={ind} bullish={bullish} bearish={bearish} />;
              })}
            </div>

            {/* 매매 판단 요약 */}
            <div style={{ padding: 12, background: selected.score >= 30 ? "#10b98112" : selected.score <= -30 ? "#ef444412" : "#374151", borderRadius: 8, border: `1px solid ${selected.score >= 30 ? C.green + "44" : selected.score <= -30 ? C.red + "44" : C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: selected.score >= 30 ? C.green : selected.score <= -30 ? C.red : C.blueLight, marginBottom: 6 }}>매매 판단 요약</div>
              <div style={{ fontSize: 11, lineHeight: 1.7, color: C.text }}>
                {selected.score >= 30 && selected.daily < 0 && <div>⚡ <b style={{ color: C.green }}>선행 매수 기회:</b> 수급 점수 +{selected.score}로 매수 시그널이지만 가격은 아직 {selected.daily}% 미반영 상태. 수급이 가격에 선행하고 있어 저가 매수 구간으로 판단.</div>}
                {selected.score >= 30 && selected.daily >= 0 && <div>📈 <b style={{ color: C.green }}>수급 확인 매수:</b> 수급 점수 +{selected.score}과 가격 상승이 동행. 추세 확인 후 진입 적합.</div>}
                {selected.score <= -30 && selected.daily > 0 && <div>⚠️ <b style={{ color: C.red }}>분산 경고:</b> 가격은 +{selected.daily}% 상승 중이나 수급 점수 {selected.score}로 스마트머니 이탈 감지. 차익실현 고려.</div>}
                {selected.score <= -30 && selected.daily <= 0 && <div>🔻 <b style={{ color: C.red }}>매도 확인:</b> 수급과 가격 모두 하락 동행. 손절 또는 관망.</div>}
                {selected.score > -30 && selected.score < 30 && <div>⏸️ <b>중립 구간:</b> 수급 점수 {selected.score}로 뚜렷한 방향성 부재. Grade {selected.abc}, ATRx {selected.distSma50Atr?.toFixed(2)} 기준으로 추세 전환 모니터링.</div>}
                <div style={{ marginTop: 6, fontSize: 10, color: C.textDim }}>
                  Grade {selected.abc} · VARS {selected.rs}% (SPY 대비 상대강도) · ATRx {selected.distSma50Atr?.toFixed(2)} · 실시간 Yahoo Finance 데이터
                </div>
              </div>
            </div>

            {/* LETF */}
            {(selected.longETF?.length > 0 || selected.shortETF?.length > 0) && (
              <div style={{ marginTop: 10, padding: 10, background: "#1f2937", borderRadius: 6, border: `1px solid ${C.borderLight}` }}>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>LEVERAGED ETF</div>
                <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                  {selected.longETF?.length > 0 && <span>LONG: {selected.longETF.map(e => <b key={e} style={{ color: C.greenBright, marginRight: 6 }}>{e}</b>)}</span>}
                  {selected.shortETF?.length > 0 && <span>SHORT: {selected.shortETF.map(e => <b key={e} style={{ color: C.redBright, marginRight: 6 }}>{e}</b>)}</span>}
                </div>
              </div>
            )}
          </>
        )}
      </div>}
    </div>

    {/* ── 우클릭 컨텍스트 메뉴 ── */}
    {contextMenu && (
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, zIndex: 9999, minWidth: 170, boxShadow: "0 6px 24px #000c", overflow: "hidden" }}
      >
        <div style={{ padding: "6px 12px", fontSize: 12, fontWeight: 700, color: C.yellow, borderBottom: `1px solid ${C.border}`, background: "#1f2937" }}>
          {contextMenu.ticker}
        </div>
        {lists.map((list, i) => {
          const inList = isFavorite(contextMenu.ticker, i);
          return (
            <div
              key={i}
              onClick={() => { inList ? removeFromList(contextMenu.ticker, i) : addToList(contextMenu.ticker, i); setContextMenu(null); }}
              style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer", color: inList ? C.yellow : C.text, display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid #333` }}
              onMouseEnter={e => e.currentTarget.style.background = "#374151"}
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
          style={{ padding: "7px 14px", fontSize: 11, cursor: "pointer", color: C.textDim, borderTop: `1px solid ${C.border}` }}
          onMouseEnter={e => e.currentTarget.style.background = "#374151"}
          onMouseLeave={e => e.currentTarget.style.background = ""}
        >
          + 새 목록에 추가
        </div>
      </div>
    )}
    </>
  );
}
