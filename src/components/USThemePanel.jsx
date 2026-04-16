import { useState, useEffect } from "react";

// ── ThemePanel과 동일한 라이트 테마 ────────────────────────────────────
const TH = {
  bg: "#f5f6fa",
  surface: "#ffffff",
  surfaceAlt: "#f8f9fc",
  surfaceHigh: "#eef0f7",
  border: "#e2e5ef",
  borderLight: "#eceef6",
  text: "#1a1d2e",
  textDim: "#6b7280",
  textBright: "#0f1120",
  green: "#059669",
  greenBg: "#ecfdf5",
  greenBorder: "#a7f3d0",
  red: "#dc2626",
  redBg: "#fef2f2",
  redBorder: "#fca5a5",
  blue: "#2563eb",
  blueBg: "#eff6ff",
  blueBorder: "#bfdbfe",
  yellow: "#d97706",
  yellowBg: "#fffbeb",
  yellowBorder: "#fde68a",
  shadow: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  shadowMd: "0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)",
};

// ─── US 테마 그룹 정의 (10개 카테고리, 82개 테마) ─────────────────────────
const US_THEME_GROUPS = [
  // ① 반도체
  { cat: "반도체", name: "GPU", tickers: ["NVDA","AMD","INTC","AVGO","MRVL"] },
  { cat: "반도체", name: "AI가속기", tickers: ["NVDA","AMD","AVGO","MRVL","SMCI"] },
  { cat: "반도체", name: "CPU", tickers: ["INTC","AMD","QCOM","ARM"] },
  { cat: "반도체", name: "모바일SoC", tickers: ["QCOM","AVGO","MRVL","ARM"] },
  { cat: "반도체", name: "자동차반도체", tickers: ["ON","NXPI","STM","ADI","TXN"] },
  { cat: "반도체", name: "전력반도체", tickers: ["ON","STM","WOLF","MCHP"] },
  { cat: "반도체", name: "아날로그반도체", tickers: ["ADI","TXN","MCHP"] },
  { cat: "반도체", name: "RF반도체", tickers: ["QCOM","SWKS","QRVO"] },
  { cat: "반도체", name: "메모리DRAM", tickers: ["MU","WDC","STX"] },
  { cat: "반도체", name: "NAND/스토리지", tickers: ["WDC","STX","NTAP"] },
  { cat: "반도체", name: "FPGA", tickers: ["AMD","INTC","MCHP"] },
  { cat: "반도체", name: "장비증착", tickers: ["AMAT","LRCX"] },
  { cat: "반도체", name: "장비검사", tickers: ["KLAC","CAMT"] },
  { cat: "반도체", name: "반도체소재", tickers: ["ENTG"] },
  { cat: "반도체", name: "파운드리", tickers: ["TSM","GFS"] },
  // ② AI/데이터
  { cat: "AI/데이터", name: "생성형AI", tickers: ["MSFT","GOOGL","META","AMZN"] },
  { cat: "AI/데이터", name: "AI SaaS", tickers: ["NOW","CRM","SNOW","DDOG"] },
  { cat: "AI/데이터", name: "AI데이터분석", tickers: ["PLTR","MDB"] },
  { cat: "AI/데이터", name: "AI모델인프라", tickers: ["NVDA","AMD","SMCI","VRT"] },
  { cat: "AI/데이터", name: "AI음성", tickers: ["SOUN","MSFT","GOOGL"] },
  { cat: "AI/데이터", name: "AI검색", tickers: ["GOOGL","MSFT","AMZN"] },
  { cat: "AI/데이터", name: "AI광고", tickers: ["TTD","SNAP","PINS"] },
  { cat: "AI/데이터", name: "AI로보틱스", tickers: ["ISRG","PATH"] },
  { cat: "AI/데이터", name: "산업용AI", tickers: ["NOW","PLTR","IBM"] },
  { cat: "AI/데이터", name: "AI데이터센터", tickers: ["EQIX","DLR","SMCI","VRT"] },
  { cat: "AI/데이터", name: "AI칩설계", tickers: ["NVDA","AMD","AVGO"] },
  { cat: "AI/데이터", name: "AI보안", tickers: ["CRWD","PANW","ZS","S","FTNT"] },
  // ③ 클라우드/SaaS
  { cat: "클라우드/SaaS", name: "Hyperscaler", tickers: ["MSFT","AMZN","GOOGL"] },
  { cat: "클라우드/SaaS", name: "AI클라우드", tickers: ["MSFT","AMZN","GOOGL","NET"] },
  { cat: "클라우드/SaaS", name: "SaaS CRM", tickers: ["CRM","HUBS"] },
  { cat: "클라우드/SaaS", name: "SaaS협업툴", tickers: ["TEAM","ZM","BOX","DOCU"] },
  { cat: "클라우드/SaaS", name: "SaaS재무", tickers: ["INTU","ADBE","BILL"] },
  { cat: "클라우드/SaaS", name: "DevOps", tickers: ["DDOG","GTLB","MDB"] },
  { cat: "클라우드/SaaS", name: "API플랫폼", tickers: ["TWLO","OKTA","SHOP"] },
  { cat: "클라우드/SaaS", name: "CDN/엣지", tickers: ["NET","AKAM","FSLY"] },
  { cat: "클라우드/SaaS", name: "클라우드DW", tickers: ["SNOW","MDB"] },
  { cat: "클라우드/SaaS", name: "클라우드스토리지", tickers: ["WDC","STX","NTAP","DELL"] },
  // ④ 사이버보안
  { cat: "사이버보안", name: "네트워크보안", tickers: ["PANW","FTNT","CSCO"] },
  { cat: "사이버보안", name: "클라우드보안", tickers: ["ZS","NET","CRWD"] },
  { cat: "사이버보안", name: "엔드포인트보안", tickers: ["CRWD","S"] },
  { cat: "사이버보안", name: "IAM", tickers: ["OKTA","CYBR"] },
  { cat: "사이버보안", name: "보안SI", tickers: ["ACN","IBM","DXC","SAIC"] },
  // ⑤ 차세대기술
  { cat: "차세대기술", name: "양자컴퓨터", tickers: ["IONQ","RGTI","QUBT","QBTS"] },
  { cat: "차세대기술", name: "블록체인", tickers: ["COIN","MARA","RIOT","SQ"] },
  { cat: "차세대기술", name: "디지털결제", tickers: ["SQ","PYPL","V","MA","AXP"] },
  { cat: "차세대기술", name: "BNPL", tickers: ["AFRM","UPST"] },
  { cat: "차세대기술", name: "AR/VR", tickers: ["META","AAPL","SNAP"] },
  { cat: "차세대기술", name: "자율주행", tickers: ["TSLA","MBLY"] },
  { cat: "차세대기술", name: "전기차", tickers: ["TSLA","RIVN","LCID","GM","F"] },
  { cat: "차세대기술", name: "드론", tickers: ["AVAV","KTOS"] },
  { cat: "차세대기술", name: "로봇자동화", tickers: ["ROK","TER","ISRG"] },
  // ⑥ 통신/네트워크
  { cat: "통신/네트워크", name: "5G칩", tickers: ["QCOM","SWKS","QRVO"] },
  { cat: "통신/네트워크", name: "통신장비", tickers: ["CSCO","JNPR","ANET"] },
  { cat: "통신/네트워크", name: "광통신", tickers: ["LITE","AAOI","CIEN","FN","COMM"] },
  { cat: "통신/네트워크", name: "네트워크스위칭", tickers: ["ANET","CSCO"] },
  { cat: "통신/네트워크", name: "DC네트워크", tickers: ["ANET","CSCO","NET"] },
  { cat: "통신/네트워크", name: "위성통신", tickers: ["IRDM","GSAT","RKLB"] },
  { cat: "통신/네트워크", name: "통신서비스", tickers: ["VZ","T","TMUS","CMCSA"] },
  { cat: "통신/네트워크", name: "CDN", tickers: ["NET","AKAM"] },
  // ⑦ 우주/방산
  { cat: "우주/방산", name: "우주발사체", tickers: ["RKLB","BA","LMT","KTOS"] },
  { cat: "우주/방산", name: "위성", tickers: ["IRDM","GSAT","LHX"] },
  { cat: "우주/방산", name: "우주데이터", tickers: ["PLTR","BWXT"] },
  { cat: "우주/방산", name: "방산플랫폼", tickers: ["LMT","NOC","RTX","GD","LHX"] },
  { cat: "우주/방산", name: "무인전투", tickers: ["AVAV","KTOS","AXON"] },
  { cat: "우주/방산", name: "미사일/방공", tickers: ["RTX","LMT","NOC","GD","BA"] },
  // ⑧ 헬스케어
  { cat: "헬스케어", name: "빅파마", tickers: ["JNJ","PFE","MRK","ABBV","BMY"] },
  { cat: "헬스케어", name: "바이오", tickers: ["AMGN","GILD","REGN","BIIB","VRTX"] },
  { cat: "헬스케어", name: "유전자치료", tickers: ["VRTX","CRSP","NTLA","BEAM","EDIT"] },
  { cat: "헬스케어", name: "면역항암", tickers: ["MRK","BMY","REGN","GILD"] },
  { cat: "헬스케어", name: "의료기기", tickers: ["ISRG","MDT","SYK","BSX","EW"] },
  { cat: "헬스케어", name: "진단", tickers: ["DHR","TMO","ILMN","LH","DGX"] },
  { cat: "헬스케어", name: "디지털헬스", tickers: ["TDOC","VEEV","UNH","CVS"] },
  { cat: "헬스케어", name: "헬스보험", tickers: ["UNH","HUM","CI","ELV"] },
  // ⑨ 소비/플랫폼
  { cat: "소비/플랫폼", name: "빅테크", tickers: ["AAPL","MSFT","GOOGL","AMZN","META"] },
  { cat: "소비/플랫폼", name: "스마트폰", tickers: ["AAPL","QCOM","NVDA","AMD"] },
  { cat: "소비/플랫폼", name: "이커머스", tickers: ["AMZN","SHOP","EBAY","ETSY","WMT"] },
  { cat: "소비/플랫폼", name: "온라인광고", tickers: ["GOOGL","META","TTD","SNAP","PINS"] },
  { cat: "소비/플랫폼", name: "스트리밍", tickers: ["NFLX","DIS","WBD","PARA","ROKU"] },
  { cat: "소비/플랫폼", name: "게임", tickers: ["MSFT","EA","TTWO"] },
  { cat: "소비/플랫폼", name: "소비재", tickers: ["PG","KO","PEP","CL"] },
  { cat: "소비/플랫폼", name: "럭셔리", tickers: ["LVMUY","RACE","EL","TPR","RL"] },
  // ⑩ 산업/에너지
  { cat: "산업/에너지", name: "태양광", tickers: ["ENPH","FSLR","RUN","SEDG","CSIQ"] },
  { cat: "산업/에너지", name: "풍력", tickers: ["GE","NEE","BEP"] },
  { cat: "산업/에너지", name: "배터리", tickers: ["TSLA","ALB","SQM","QS"] },
  { cat: "산업/에너지", name: "전기차부품", tickers: ["APTV","MBLY","TE"] },
  { cat: "산업/에너지", name: "원자력", tickers: ["CEG","CCJ","VST","NRG"] },
  { cat: "산업/에너지", name: "에너지저장", tickers: ["STEM","FLNC","PLUG"] },
  { cat: "산업/에너지", name: "수소", tickers: ["PLUG","FCEL","BE"] },
  { cat: "산업/에너지", name: "전통에너지", tickers: ["XOM","CVX","COP","OXY"] },
  { cat: "산업/에너지", name: "건설/부동산", tickers: ["CAT","DE","VMC","MLM"] },
  { cat: "산업/에너지", name: "금융", tickers: ["JPM","BAC","GS","MS"] },
];

const CATEGORY_COLORS = {
  "반도체":       "#7c3aed",
  "AI/데이터":    "#2563eb",
  "클라우드/SaaS":"#0891b2",
  "사이버보안":   "#dc2626",
  "차세대기술":   "#d97706",
  "통신/네트워크":"#059669",
  "우주/방산":    "#1e40af",
  "헬스케어":     "#db2777",
  "소비/플랫폼":  "#ea580c",
  "산업/에너지":  "#65a30d",
};

function calcGroupAvg(group, quotes) {
  const vals = group.tickers.map(t => quotes[t]?.daily).filter(v => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function RateSpan({ value, size = 13 }) {
  const v = value ?? 0;
  const color = v > 0 ? TH.green : v < 0 ? TH.red : TH.textDim;
  return (
    <span style={{ color, fontWeight: 700, fontSize: size, fontFamily: "'Inter', monospace" }}>
      {v > 0 ? "+" : ""}{v.toFixed(2)}%
    </span>
  );
}

// KR테마와 동일한 다크 전광판 (대비 효과)
function TickerTape({ quotes }) {
  const items = US_THEME_GROUPS
    .map(g => ({ ...g, avg: calcGroupAvg(g, quotes) }))
    .filter(g => g.avg != null);
  if (!items.length) return null;
  const repeated = [...items, ...items, ...items];
  return (
    <div style={{ background: "#1a1d2e", overflow: "hidden", height: 36, display: "flex", alignItems: "center", borderBottom: `1px solid ${TH.border}`, marginBottom: 20, borderRadius: 8 }}>
      <style>{`@keyframes usTickerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-33.333%); } }`}</style>
      <div style={{ display: "flex", animation: "usTickerScroll 120s linear infinite", whiteSpace: "nowrap" }}>
        {repeated.map((g, i) => {
          const color = g.avg > 0 ? "#4ade80" : g.avg < 0 ? "#f87171" : "#9ca3af";
          const catColor = CATEGORY_COLORS[g.cat] || "#9ca3af";
          return (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 16px", borderRight: "1px solid #2d3149", height: 36 }}>
              <span style={{ fontSize: 9, fontWeight: 600, color: catColor, opacity: 0.85 }}>{g.cat.split("/")[0]}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{g.name}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "monospace" }}>
                {g.avg > 0 ? "+" : ""}{g.avg.toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function GroupCard({ group, quotes }) {
  const avg = calcGroupAvg(group, quotes);
  const up  = avg != null && avg > 0;
  const dn  = avg != null && avg < 0;
  return (
    <div style={{
      background: TH.surface,
      border: `1px solid ${up ? TH.greenBorder : dn ? TH.redBorder : TH.border}`,
      borderRadius: 10, padding: "12px 14px",
      boxShadow: TH.shadow,
    }}>
      {/* 그룹 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${TH.borderLight}` }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: TH.textBright }}>{group.name}</span>
        {avg != null && <RateSpan value={avg} size={13} />}
      </div>
      {/* 개별 종목 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {group.tickers.map(ticker => {
          const q = quotes[ticker];
          const d = q?.daily;
          const tc = d == null ? TH.textDim : d > 0 ? TH.green : d < 0 ? TH.red : TH.textDim;
          return (
            <div key={ticker} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: TH.textDim, fontFamily: "monospace" }}>{ticker}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {q?.price != null && (
                  <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace" }}>${q.price.toLocaleString()}</span>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, color: tc, fontFamily: "monospace", minWidth: 54, textAlign: "right" }}>
                  {d == null ? "—" : `${d > 0 ? "+" : ""}${d.toFixed(2)}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategorySection({ cat, groups, quotes, expanded, onToggle }) {
  const catColor = CATEGORY_COLORS[cat] || TH.blue;
  const allDailies = groups.flatMap(g => g.tickers.map(t => quotes[t]?.daily).filter(v => v != null));
  const catAvg = allDailies.length ? allDailies.reduce((a, b) => a + b, 0) / allDailies.length : null;
  const up = catAvg != null && catAvg > 0;
  const dn = catAvg != null && catAvg < 0;

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 14px",
          background: TH.surface,
          border: `1px solid ${TH.border}`,
          borderRadius: expanded ? "8px 8px 0 0" : 8,
          cursor: "pointer", userSelect: "none",
          boxShadow: TH.shadow,
        }}
      >
        <span style={{ width: 3, height: 16, background: catColor, borderRadius: 2, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: catColor, minWidth: 110 }}>{cat}</span>
        <span style={{ fontSize: 11, color: TH.textDim }}>{groups.length}개 테마</span>
        {catAvg != null && (
          <span style={{
            marginLeft: "auto", marginRight: 6,
            fontSize: 13, fontWeight: 800,
            color: up ? TH.green : dn ? TH.red : TH.textDim,
            fontFamily: "monospace",
          }}>
            {catAvg > 0 ? "+" : ""}{catAvg.toFixed(2)}%
          </span>
        )}
        <span style={{ color: TH.textDim, fontSize: 11 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))",
          gap: 8, padding: 10,
          background: TH.surfaceAlt,
          border: `1px solid ${TH.border}`,
          borderTop: "none",
          borderRadius: "0 0 8px 8px",
        }}>
          {groups.map(g => <GroupCard key={g.name} group={g} quotes={quotes} />)}
        </div>
      )}
    </div>
  );
}

const BASE_URL = window.location.hostname === "localhost" ? "http://localhost:3001" : "";

const US_PERIODS = [
  { label: "1D",  range: "2d"  },
  { label: "5D",  range: "5d"  },
  { label: "1M",  range: "1mo" },
  { label: "3M",  range: "3mo" },
];

export default function USThemePanel() {
  const [quotes, setQuotes]       = useState({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [range, setRange]         = useState("2d");
  const [expandedCats, setExpandedCats] = useState(() => {
    const init = {};
    US_THEME_GROUPS.forEach(g => { init[g.cat] = true; });
    return init;
  });

  const fetchQuotes = async (r = range) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/us-theme-quotes?range=${r}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuotes(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRangeChange = (r) => {
    setRange(r);
    fetchQuotes(r);
  };

  useEffect(() => {
    fetchQuotes("2d");
    const iv = setInterval(() => fetchQuotes(range), 60000);
    return () => clearInterval(iv);
  }, []);

  const categories = [...new Set(US_THEME_GROUPS.map(g => g.cat))];
  const toggleCat  = cat => setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  const allExpanded = categories.every(c => expandedCats[c] !== false);

  return (
    <div style={{ background: TH.bg, minHeight: "100%", fontFamily: "'Inter', 'Noto Sans KR', sans-serif", padding: "20px 20px 40px" }}>
      {/* 전광판 (KR테마와 동일 스타일) */}
      <TickerTape quotes={quotes} />

      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 800, color: TH.textBright }}>US 테마 스캐너</span>
          <span style={{ fontSize: 11, color: TH.textDim, marginLeft: 10 }}>
            {US_THEME_GROUPS.length}개 테마 · {Object.keys(quotes).length}종목
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* 기간 선택 */}
          <div style={{ display: "flex", background: TH.surfaceAlt, borderRadius: 8, border: `1px solid ${TH.border}`, padding: 3, gap: 2 }}>
            {US_PERIODS.map(p => (
              <button key={p.range} onClick={() => handleRangeChange(p.range)} style={{
                padding: "4px 12px", borderRadius: 6, border: "none",
                background: range === p.range ? TH.blue : "transparent",
                color: range === p.range ? "#fff" : TH.textDim,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                transition: "all 0.12s",
              }}>{p.label}</button>
            ))}
          </div>
          {loading && <span style={{ fontSize: 11, color: TH.textDim }}>로딩 중...</span>}
          {error && (
            <span style={{ fontSize: 10, color: TH.red, background: TH.redBg, border: `1px solid ${TH.redBorder}`, padding: "2px 8px", borderRadius: 4 }}>
              오류: {error}
            </span>
          )}
          {lastUpdated && !loading && (
            <span style={{ fontSize: 10, color: TH.textDim }}>{lastUpdated.toLocaleTimeString("ko-KR")}</span>
          )}
          <button
            onClick={() => fetchQuotes(range)}
            style={{ fontSize: 11, padding: "4px 12px", background: TH.surface, border: `1px solid ${TH.border}`, borderRadius: 6, color: TH.textDim, cursor: "pointer", boxShadow: TH.shadow }}
          >
            새로고침
          </button>
          <button
            onClick={() => setExpandedCats(() => {
              const next = {};
              categories.forEach(c => { next[c] = !allExpanded; });
              return next;
            })}
            style={{ fontSize: 11, padding: "4px 12px", background: TH.surface, border: `1px solid ${TH.border}`, borderRadius: 6, color: TH.textDim, cursor: "pointer", boxShadow: TH.shadow }}
          >
            {allExpanded ? "전체 접기" : "전체 펼치기"}
          </button>
        </div>
      </div>

      {/* 카테고리별 섹션 */}
      {categories.map(cat => (
        <CategorySection
          key={cat}
          cat={cat}
          groups={US_THEME_GROUPS.filter(g => g.cat === cat)}
          quotes={quotes}
          expanded={expandedCats[cat] !== false}
          onToggle={() => toggleCat(cat)}
        />
      ))}
    </div>
  );
}
