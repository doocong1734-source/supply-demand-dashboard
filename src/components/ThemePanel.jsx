import { useState, useEffect, useCallback } from "react";

const TH = {
  bg: "#0b1326", surface: "#171f33", surfaceAlt: "#131b2e", border: "#45474c",
  surfaceHigh: "#222a3d", surfaceHighest: "#2d3449",
  text: "#dae2fd", textDim: "#c5c6cd", textBright: "#f2f2f2",
  green: "#4ae176", red: "#ffb3ad", blue: "#7bd0ff", yellow: "#f59e0b",
};

function parseRate(v) { return typeof v === "number" ? v : parseFloat(v) || 0; }

function RateSpan({ value, size = 13 }) {
  const v = parseRate(value);
  const color = v > 0 ? TH.green : v < 0 ? TH.red : TH.textDim;
  return (
    <span style={{ color, fontWeight: 700, fontSize: size, fontFamily: "'Inter', monospace" }}>
      {v > 0 ? "+" : ""}{v.toFixed(2)}%
    </span>
  );
}

function HeatBadge({ rate }) {
  const v = parseRate(rate);
  if (v >= 7) return <span style={badgeStyle("#3d1010", "#ff8a80", "1px solid #ff5252")}>핫</span>;
  if (v >= 3) return <span style={badgeStyle("#2d2200", TH.yellow, "1px solid #f59e0b88")}>상승</span>;
  if (v >= 0) return <span style={badgeStyle("#0d1e33", TH.blue, "1px solid #7bd0ff44")}>보합</span>;
  return <span style={badgeStyle("#1a1a1a", "#666", "1px solid #444")}>약세</span>;
}

function badgeStyle(bg, color, border) {
  return { background: bg, color, border, fontSize: 10, padding: "2px 7px", borderRadius: 3, fontWeight: 700, whiteSpace: "nowrap", letterSpacing: "0.04em" };
}

function StockTag({ stock }) {
  const pct = parseRate(stock.pct);
  const color = pct > 0 ? TH.green : pct < 0 ? TH.red : TH.textDim;
  return (
    <span style={{
      fontSize: 10, padding: "2px 6px", background: TH.surfaceHigh,
      border: `1px solid ${TH.border}`, borderRadius: 3, color: TH.textDim,
      whiteSpace: "nowrap", display: "inline-flex", gap: 3, alignItems: "center",
    }}>
      {stock.name}
      <span style={{ color, fontWeight: 700 }}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>
    </span>
  );
}

function DetailPanel({ theme, onClose }) {
  if (!theme) return null;
  const stocks = theme.stocks || [];
  return (
    <div style={{
      background: TH.surface, border: `1px solid ${TH.border}`, borderRadius: 8,
      padding: "16px 18px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <span style={{ fontSize: 16, fontWeight: 700, color: TH.textBright }}>{theme.name}</span>
          <a href={`https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${theme.no}`}
             target="_blank" rel="noreferrer"
             style={{ marginLeft: 8, fontSize: 11, color: TH.blue, textDecoration: "none" }}>
            네이버↗
          </a>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: TH.textDim, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
        {[
          { label: "전일 등락률", value: <RateSpan value={theme.rate_d1} size={22} />, sub: "어제 대비" },
          { label: "3일 등락률",  value: <RateSpan value={theme.rate_3d} size={22} />, sub: "3일 누적" },
          { label: "상승/보합/하락", value: (
            <span style={{ fontSize: 15, fontWeight: 700 }}>
              <span style={{ color: TH.green }}>{theme.up || "—"}</span>
              <span style={{ color: TH.textDim }}> / {theme.flat || "—"} / </span>
              <span style={{ color: TH.red }}>{theme.down || "—"}</span>
            </span>
          ), sub: "구성종목" },
        ].map(m => (
          <div key={m.label} style={{ background: TH.surfaceAlt, borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: TH.textDim, marginBottom: 4 }}>{m.label}</div>
            <div>{m.value}</div>
            <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {stocks.length > 0 && (
        <>
          <div style={{ fontSize: 10, color: "#666", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>구성 종목</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6 }}>
            {stocks.map(s => (
              <div key={s.code} style={{ background: TH.surfaceAlt, borderRadius: 6, padding: "8px 10px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: TH.textBright, marginBottom: 2 }}>{s.name}</div>
                <div style={{ fontSize: 10, color: TH.textDim }}>{s.price ? s.price.toLocaleString() + "원" : "—"}</div>
                <RateSpan value={s.pct} size={13} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ThemePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/naver-themes");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const themes = data?.themes || [];
  const filtered = themes.filter(t => {
    const v = parseRate(t.rate_d1);
    if (filter === "hot"      && v < 7) return false;
    if (filter === "warm"     && (v < 3 || v >= 7)) return false;
    if (filter === "emerging" && !t.emerging) return false;
    if (search && !t.name?.includes(search)) return false;
    return true;
  });

  const updatedAt = data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString("ko-KR") : "";

  return (
    <div style={{ padding: "16px 0" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700, color: TH.textBright }}>국내 테마 스캐너</span>
          {data && (
            <span style={{ fontSize: 11, color: "#555", marginLeft: 10 }}>
              네이버증권 {data.total}개 테마 · {updatedAt} 기준
            </span>
          )}
        </div>
        <button onClick={load} disabled={loading} style={{
          padding: "5px 12px", borderRadius: 5, border: `1px solid ${TH.border}`,
          background: TH.surfaceHigh, color: TH.textDim, fontSize: 11, cursor: "pointer",
        }}>
          {loading ? "수집 중..." : "새로고침"}
        </button>
      </div>

      {error && (
        <div style={{ color: TH.red, fontSize: 12, padding: "8px 12px", background: "#1a0a0a", borderRadius: 6, marginBottom: 10 }}>
          오류: {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ color: TH.textDim, fontSize: 12, textAlign: "center", padding: "40px 0" }}>
          네이버증권에서 테마 수집 중... (약 20-30초 소요)
        </div>
      )}

      {data && (
        <>
          {/* 급부상 테마 */}
          {(data.emerging || []).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: TH.red, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                ★ 급부상 테마 — 전일 5%↑ &amp; 3일 3%↑
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
                {(data.emerging || []).map(t => (
                  <div key={t.no} onClick={() => setSelected(selected?.no === t.no ? null : t)}
                       style={{ background: "#1a0a0a", border: "1px solid #ff525244", borderRadius: 8, padding: "12px 14px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TH.textBright }}>{t.name}</span>
                      <span style={badgeStyle("#3d1010", "#ff8a80", "1px solid #ff5252")}>급부상</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                      <RateSpan value={t.rate_d1} size={20} />
                      <span style={{ fontSize: 11, color: TH.textDim }}>3일 <RateSpan value={t.rate_3d} size={11} /></span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                      {(t.stocks || []).slice(0, 4).map(s => <StockTag key={s.code} stock={s} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 필터/검색 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="테마명 검색 (반도체, AI, 전기차...)"
              style={{ flex: 1, minWidth: 160, padding: "6px 10px", border: `1px solid ${TH.border}`, borderRadius: 5, background: TH.surfaceAlt, color: TH.text, fontSize: 12, outline: "none" }}
            />
            {[["all","전체"], ["hot","핫 7%↑"], ["warm","상승 3%↑"], ["emerging","★ 급부상"]].map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "5px 11px", borderRadius: 99, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
                border: filter === f ? `1px solid ${TH.blue}88` : `1px solid ${TH.border}`,
                background: filter === f ? `${TH.blue}18` : TH.surfaceHigh,
                color: filter === f ? TH.blue : TH.textDim, fontWeight: filter === f ? 600 : 400,
              }}>{label}</button>
            ))}
            <span style={{ fontSize: 11, color: "#555", marginLeft: "auto" }}>{filtered.length}개</span>
          </div>

          {/* 상세 패널 */}
          {selected && <DetailPanel theme={selected} onClose={() => setSelected(null)} />}

          {/* 테마 목록 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {filtered.map((t, i) => (
              <div key={t.no} onClick={() => setSelected(selected?.no === t.no ? null : t)}
                   style={{
                     display: "grid", gridTemplateColumns: "28px 1fr 90px 56px",
                     alignItems: "start", gap: 8, padding: "9px 11px",
                     background: selected?.no === t.no ? TH.surfaceHigh : TH.surface,
                     border: `1px solid ${selected?.no === t.no ? TH.blue + "44" : TH.border + "66"}`,
                     borderRadius: 6, cursor: "pointer", transition: "background 0.12s",
                   }}>
                <div style={{ fontSize: 11, color: "#444", textAlign: "center", paddingTop: 2 }}>{i + 1}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TH.textBright, marginBottom: 3 }}>
                    {t.emerging && <span style={{ color: TH.yellow, marginRight: 3 }}>★</span>}
                    {t.name}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {(t.stocks || []).slice(0, 4).map(s => <StockTag key={s.code || s.name} stock={s} />)}
                    {!(t.stocks || []).length && (
                      <span style={{ fontSize: 10, color: "#444" }}>클릭하여 상세 보기</span>
                    )}
                  </div>
                  {t.up && (
                    <div style={{ fontSize: 10, marginTop: 3 }}>
                      <span style={{ color: TH.green }}>↑{t.up}</span>
                      <span style={{ color: "#555" }}> {t.flat}</span>
                      <span style={{ color: TH.red }}> ↓{t.down}</span>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <RateSpan value={t.rate_d1} size={15} />
                  <div style={{ fontSize: 10, color: TH.textDim, marginTop: 2 }}>3일 <RateSpan value={t.rate_3d} size={10} /></div>
                </div>
                <div style={{ textAlign: "right", paddingTop: 1 }}>
                  <HeatBadge rate={t.rate_d1} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
