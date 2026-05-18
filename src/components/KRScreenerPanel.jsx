import { useState, useCallback } from "react";

const TH = {
  bg: "#0b1326", surface: "#171f33", surfaceAlt: "#131b2e", border: "#45474c",
  borderLight: "#2d3449", surfaceHigh: "#222a3d", surfaceHighest: "#2d3449",
  text: "#dae2fd", textDim: "#c5c6cd", textBright: "#f2f2f2",
  green: "#4ae176", red: "#ffb3ad", blue: "#7bd0ff", yellow: "#f59e0b",
  primary: "#4ae176", secondary: "#ffb3ad", tertiary: "#7bd0ff",
};

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

const MODES = [
  { id: "minervini", label: "미너비니 SEPA", desc: "Stage2 + RS강도 + ATH 근처 + 거래량 수축" },
  { id: "momentum", label: "RS 모멘텀", desc: "RSI>60 + ADX>25 + 3개월 수익률 상위" },
  { id: "fundamental", label: "실적 기반", desc: "ROE>10% + 매출성장>10% + Piotroski≥7" },
];

const SECTOR_KR = {
  "Electronic Technology": "전자·반도체",
  "Producer Manufacturing": "제조업",
  "Health Technology": "헬스케어",
  "Technology Services": "IT서비스",
  "Finance": "금융",
  "Consumer Durables": "소비재",
  "Consumer Non-Durables": "필수소비재",
  "Process Industries": "소재·화학",
  "Non-Energy Minerals": "광물",
  "Distribution Services": "유통",
  "Commercial Services": "서비스",
  "Transportation": "운송",
};

function fmt(v, suffix = "", digits = 1) {
  if (v == null || isNaN(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}${suffix}`;
}

function fmtMcap(v) {
  if (!v) return "—";
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}조`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(0)}억`;
  return `${(v / 1e6).toFixed(0)}M`;
}

function PerfCell({ value }) {
  if (value == null) return <td style={td}>—</td>;
  const color = value >= 0 ? TH.green : TH.red;
  return (
    <td style={{ ...td, color, fontWeight: 700 }}>
      {value > 0 ? "+" : ""}{value.toFixed(1)}%
    </td>
  );
}

function ScoreBar({ value, max = 9 }) {
  if (value == null) return <span style={{ color: TH.textDim }}>—</span>;
  const pct = (value / max) * 100;
  const color = value >= 7 ? TH.green : value >= 5 ? TH.yellow : TH.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 36, height: 4, background: "#1e2a3a", borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function RSIBadge({ value }) {
  if (value == null) return <span style={{ color: TH.textDim }}>—</span>;
  const color = value >= 70 ? TH.red : value >= 55 ? TH.green : TH.textDim;
  return <span style={{ fontWeight: 700, color }}>{value.toFixed(0)}</span>;
}

function ATHBadge({ value }) {
  if (value == null) return <span style={{ color: TH.textDim }}>—</span>;
  const abs = Math.abs(value);
  const color = abs <= 10 ? TH.green : abs <= 25 ? TH.yellow : TH.textDim;
  return <span style={{ fontWeight: 700, color }}>{value.toFixed(1)}%</span>;
}

function RecommendBadge({ value }) {
  if (value == null) return <span style={{ color: TH.textDim }}>—</span>;
  const label = value >= 0.5 ? "강매수" : value >= 0.1 ? "매수" : value >= -0.1 ? "중립" : value >= -0.5 ? "매도" : "강매도";
  const color = value >= 0.1 ? TH.green : value >= -0.1 ? TH.textDim : TH.red;
  return <span style={{ fontSize: 10, fontWeight: 700, color }}>{label}</span>;
}

const td = { padding: "7px 8px", borderBottom: `1px solid ${TH.borderLight}`, fontSize: 11, whiteSpace: "nowrap" };
const th = { padding: "8px 8px", fontSize: 10, fontWeight: 700, color: TH.textDim, borderBottom: `1px solid ${TH.border}`, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap", textAlign: "left", position: "sticky", top: 0, background: TH.surfaceAlt, zIndex: 1 };

export default function KRScreenerPanel() {
  const [mode, setMode] = useState("minervini");
  const [stocks, setStocks] = useState([]);
  const [total, setTotal] = useState(0);
  const [ts, setTs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");
  const [search, setSearch] = useState("");

  const run = useCallback(async (m = mode) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/kr-screener`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: m, limit: 50 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStocks(data.stocks || []);
      setTotal(data.total || 0);
      setTs(data.ts);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  const handleMode = (m) => {
    setMode(m);
    setStocks([]);
    setSortKey(null);
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = [...stocks]
    .filter(s => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (s.description || "").toLowerCase().includes(q) || (s.name || "").includes(q);
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortDir === "desc" ? bv - av : av - bv;
    });

  const SortTh = ({ label, k }) => (
    <th style={{ ...th, cursor: "pointer" }} onClick={() => handleSort(k)}>
      {label}{sortKey === k ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
    </th>
  );

  const currentMode = MODES.find(m => m.id === mode);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: TH.bg, overflow: "hidden" }}>

      {/* 헤더 */}
      <div style={{ padding: "10px 16px", background: TH.surfaceAlt, borderBottom: `1px solid ${TH.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 900, fontSize: 14, color: TH.primary, letterSpacing: "-0.03em" }}>
            🇰🇷 KR SCREENER
          </span>

          {/* 모드 탭 */}
          <div style={{ display: "flex", gap: 4 }}>
            {MODES.map(m => (
              <button key={m.id} onClick={() => handleMode(m.id)}
                style={{
                  padding: "4px 12px", fontSize: 11, fontWeight: 600, border: "none", borderRadius: 4, cursor: "pointer",
                  background: mode === m.id ? TH.primary : TH.surfaceHigh,
                  color: mode === m.id ? "#001a08" : TH.textDim,
                  transition: "all 0.15s",
                }}>
                {m.label}
              </button>
            ))}
          </div>

          {/* 실행 버튼 */}
          <button onClick={() => run(mode)} disabled={loading}
            style={{
              padding: "4px 16px", fontSize: 11, fontWeight: 700, border: `1px solid ${TH.primary}`,
              borderRadius: 4, cursor: loading ? "wait" : "pointer",
              background: loading ? TH.surfaceHigh : `${TH.primary}20`,
              color: loading ? TH.textDim : TH.primary,
            }}>
            {loading ? "⏳ 검색 중..." : "▶ 스크리닝 실행"}
          </button>

          {/* 검색 */}
          {stocks.length > 0 && (
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="종목명 검색..."
              style={{ padding: "4px 10px", fontSize: 11, background: TH.surfaceHigh, border: `1px solid ${TH.border}`, borderRadius: 4, color: TH.text, outline: "none", width: 140 }}
            />
          )}

          {/* 결과 수 / 시간 */}
          {ts && (
            <span style={{ fontSize: 10, color: TH.textDim, marginLeft: "auto" }}>
              총 {total}개 중 {sorted.length}개 표시 &nbsp;|&nbsp; {new Date(ts).toLocaleTimeString("ko-KR")} 기준
            </span>
          )}
        </div>

        {/* 모드 설명 */}
        <div style={{ marginTop: 6, fontSize: 11, color: TH.textDim }}>
          {currentMode?.desc}
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div style={{ padding: "8px 16px", background: "#3a0d0d", borderBottom: `1px solid ${TH.red}`, fontSize: 12, color: TH.red }}>
          ⚠ 오류: {error}
        </div>
      )}

      {/* 빈 상태 */}
      {!loading && stocks.length === 0 && !error && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: TH.textDim }}>
          <div style={{ fontSize: 40 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>모드를 선택하고 스크리닝을 실행하세요</div>
          <div style={{ fontSize: 12, color: "#555", textAlign: "center", lineHeight: 1.6 }}>
            미너비니 SEPA: Stage2 정배열 + ATH 돌파 직전 종목<br />
            RS 모멘텀: RSI/ADX 기반 강한 추세 종목<br />
            실적 기반: ROE·매출성장·Piotroski 우수 종목
          </div>
          <button onClick={() => run(mode)}
            style={{ padding: "8px 24px", fontSize: 12, fontWeight: 700, border: `1px solid ${TH.primary}`, borderRadius: 6, cursor: "pointer", background: `${TH.primary}20`, color: TH.primary }}>
            ▶ 지금 실행
          </button>
        </div>
      )}

      {/* 테이블 */}
      {sorted.length > 0 && (
        <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 32 }}>#</th>
                <SortTh label="종목" k="description" />
                <th style={th}>섹터</th>
                <SortTh label="현재가" k="close" />
                <SortTh label="시총" k="market_cap_basic" />
                <SortTh label="RSI" k="RSI" />
                <SortTh label="ADX" k="ADX" />
                <SortTh label="1주" k="Perf.W" />
                <SortTh label="1개월" k="Perf.1M" />
                <SortTh label="3개월" k="Perf.3M" />
                <SortTh label="1년" k="Perf.Y" />
                <SortTh label="ATH대비" k="fromATH" />
                <SortTh label="ROE" k="return_on_equity" />
                <SortTh label="매출성장" k="total_revenue_yoy_growth_ttm" />
                <SortTh label="EPS성장" k="earnings_per_share_diluted_yoy_growth_ttm" />
                <SortTh label="순이익률" k="net_margin_ttm" />
                <SortTh label="P/E" k="price_earnings_ttm" />
                <th style={th}>Piotroski</th>
                <th style={th}>추천</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const isEven = i % 2 === 0;
                const rowBg = isEven ? TH.surface : TH.surfaceAlt;
                return (
                  <tr key={s.symbol} style={{ background: rowBg }}
                    onMouseEnter={e => e.currentTarget.style.background = TH.surfaceHigh}
                    onMouseLeave={e => e.currentTarget.style.background = rowBg}>
                    <td style={{ ...td, color: TH.textDim, textAlign: "center" }}>{i + 1}</td>
                    <td style={{ ...td, minWidth: 140 }}>
                      <div style={{ fontWeight: 700, color: TH.textBright }}>{s.description || s.name}</div>
                      <div style={{ fontSize: 10, color: TH.textDim, marginTop: 1 }}>{s.name}</div>
                    </td>
                    <td style={{ ...td, fontSize: 10, color: TH.blue }}>
                      {SECTOR_KR[s.sector] || s.sector || "—"}
                    </td>
                    <td style={{ ...td, fontWeight: 700, color: TH.textBright }}>
                      ₩{s.close?.toLocaleString()}
                    </td>
                    <td style={{ ...td, color: TH.textDim }}>{fmtMcap(s.market_cap_basic)}</td>
                    <td style={td}><RSIBadge value={s.RSI} /></td>
                    <td style={{ ...td, color: TH.textDim }}>{s.ADX?.toFixed(0) || "—"}</td>
                    <PerfCell value={s["Perf.W"]} />
                    <PerfCell value={s["Perf.1M"]} />
                    <PerfCell value={s["Perf.3M"]} />
                    <PerfCell value={s["Perf.Y"]} />
                    <td style={td}><ATHBadge value={s.fromATH} /></td>
                    <PerfCell value={s.return_on_equity} />
                    <PerfCell value={s.total_revenue_yoy_growth_ttm} />
                    <PerfCell value={s.earnings_per_share_diluted_yoy_growth_ttm} />
                    <PerfCell value={s.net_margin_ttm} />
                    <td style={{ ...td, color: TH.textDim }}>
                      {s.price_earnings_ttm ? s.price_earnings_ttm.toFixed(1) : "—"}
                    </td>
                    <td style={td}><ScoreBar value={s.piotroski_f_score_ttm} /></td>
                    <td style={td}><RecommendBadge value={s["Recommend.All"]} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 면책 */}
      <div style={{ padding: "4px 16px", background: TH.surfaceAlt, borderTop: `1px solid ${TH.borderLight}`, fontSize: 10, color: "#444", flexShrink: 0 }}>
        ⚠ TradingView 데이터 기반 참고용 분석 · 투자 권유 아님
      </div>
    </div>
  );
}
