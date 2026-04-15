import { useState, useEffect, useCallback } from "react";

// ── Light Theme Colors ─────────────────────────────────────────
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
  if (v >= 7) return (
    <span style={{ background: TH.redBg, color: TH.red, border: `1px solid ${TH.redBorder}`, fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 700, whiteSpace: "nowrap" }}>
      핫 7%↑
    </span>
  );
  if (v >= 3) return (
    <span style={{ background: TH.yellowBg, color: TH.yellow, border: `1px solid ${TH.yellowBorder}`, fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 700, whiteSpace: "nowrap" }}>
      상승
    </span>
  );
  if (v >= 0) return (
    <span style={{ background: TH.blueBg, color: TH.blue, border: `1px solid ${TH.blueBorder}`, fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 600, whiteSpace: "nowrap" }}>
      보합
    </span>
  );
  return (
    <span style={{ background: "#f9fafb", color: "#9ca3af", border: "1px solid #e5e7eb", fontSize: 10, padding: "2px 8px", borderRadius: 99, fontWeight: 600, whiteSpace: "nowrap" }}>
      약세
    </span>
  );
}

function StockTag({ stock }) {
  const pct = parseRate(stock.pct);
  const color = pct > 0 ? TH.green : pct < 0 ? TH.red : TH.textDim;
  return (
    <span style={{
      fontSize: 11, padding: "2px 7px", background: TH.surfaceHigh,
      border: `1px solid ${TH.border}`, borderRadius: 4, color: TH.textDim,
      whiteSpace: "nowrap", display: "inline-flex", gap: 4, alignItems: "center",
    }}>
      <span style={{ color: TH.text, fontWeight: 500 }}>{stock.name}</span>
      <span style={{ color, fontWeight: 700 }}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>
    </span>
  );
}

function DetailPanel({ theme, onClose }) {
  if (!theme) return null;
  const stocks = theme.stocks || [];
  return (
    <div style={{
      background: TH.surface, border: `1px solid ${TH.border}`, borderRadius: 12,
      padding: "20px 22px", marginBottom: 14, boxShadow: TH.shadowMd,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: TH.textBright }}>{theme.name}</span>
          <a href={`https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${theme.no}`}
             target="_blank" rel="noreferrer"
             style={{ fontSize: 11, color: TH.blue, textDecoration: "none", padding: "2px 8px", background: TH.blueBg, border: `1px solid ${TH.blueBorder}`, borderRadius: 4 }}>
            네이버 ↗
          </a>
        </div>
        <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", color: TH.textDim, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
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
          <div key={m.label} style={{ background: TH.surfaceAlt, borderRadius: 8, padding: "12px 14px", border: `1px solid ${TH.border}` }}>
            <div style={{ fontSize: 10, color: TH.textDim, marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</div>
            <div>{m.value}</div>
            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 3 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {stocks.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: TH.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>구성 종목</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            {stocks.map(s => {
              const pct = parseRate(s.pct);
              const up = pct > 0;
              const dn = pct < 0;
              return (
                <div key={s.code} style={{
                  background: up ? TH.greenBg : dn ? TH.redBg : TH.surfaceAlt,
                  border: `1px solid ${up ? TH.greenBorder : dn ? TH.redBorder : TH.border}`,
                  borderRadius: 8, padding: "10px 12px"
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TH.textBright, marginBottom: 3 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: TH.textDim, marginBottom: 2 }}>{s.price ? s.price.toLocaleString() + "원" : "—"}</div>
                  <RateSpan value={s.pct} size={13} />
                </div>
              );
            })}
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
    <div style={{ padding: "20px 0", fontFamily: "'Inter', -apple-system, sans-serif", background: TH.bg, minHeight: "100%" }}>

      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: TH.textBright, margin: 0 }}>국내 테마 스캐너</h2>
          {data && (
            <p style={{ fontSize: 12, color: TH.textDim, margin: "3px 0 0", fontWeight: 400 }}>
              네이버증권 {data.total}개 테마 · {updatedAt} 기준
            </p>
          )}
        </div>
        <button onClick={load} disabled={loading} style={{
          padding: "7px 16px", borderRadius: 8, border: `1px solid ${TH.border}`,
          background: TH.surface, color: TH.textDim, fontSize: 12,
          cursor: loading ? "not-allowed" : "pointer",
          boxShadow: TH.shadow, fontWeight: 500,
        }}>
          {loading ? "수집 중..." : "새로고침"}
        </button>
      </div>

      {error && (
        <div style={{ color: TH.red, fontSize: 12, padding: "10px 14px", background: TH.redBg, border: `1px solid ${TH.redBorder}`, borderRadius: 8, marginBottom: 14 }}>
          오류: {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ color: TH.textDim, fontSize: 13, textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontWeight: 600, color: TH.text, marginBottom: 4 }}>네이버증권에서 테마 수집 중...</div>
          <div style={{ fontSize: 12 }}>약 20-30초 소요됩니다</div>
        </div>
      )}

      {data && (
        <>
          {/* 급부상 테마 */}
          {(data.emerging || []).length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: TH.red, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>급부상 테마</span>
                <span style={{ fontSize: 10, color: TH.textDim }}>전일 5%↑ &amp; 3일 3%↑</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
                {(data.emerging || []).map(t => (
                  <div key={t.no} onClick={() => setSelected(selected?.no === t.no ? null : t)}
                       style={{
                         background: TH.surface,
                         border: `1px solid ${selected?.no === t.no ? TH.red : TH.redBorder}`,
                         borderRadius: 12, padding: "14px 16px", cursor: "pointer",
                         boxShadow: selected?.no === t.no ? `0 0 0 3px ${TH.red}22` : TH.shadow,
                         transition: "all 0.15s",
                       }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TH.textBright }}>{t.name}</span>
                      <span style={{ background: TH.redBg, color: TH.red, border: `1px solid ${TH.redBorder}`, fontSize: 9, padding: "2px 7px", borderRadius: 99, fontWeight: 700 }}>급부상</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                      <RateSpan value={t.rate_d1} size={20} />
                      <span style={{ fontSize: 11, color: TH.textDim }}>3일 <RateSpan value={t.rate_3d} size={11} /></span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {(t.stocks || []).slice(0, 4).map(s => <StockTag key={s.code} stock={s} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 구분선 */}
          {(data.emerging || []).length > 0 && (
            <div style={{ borderTop: `1px solid ${TH.border}`, marginBottom: 20 }} />
          )}

          {/* 필터/검색 */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="테마명 검색 (반도체, AI, 전기차...)"
              style={{ flex: 1, minWidth: 180, padding: "7px 12px", border: `1px solid ${TH.border}`, borderRadius: 8, background: TH.surface, color: TH.text, fontSize: 12, outline: "none", boxShadow: TH.shadow }}
            />
            {[["all","전체"], ["hot","핫 7%↑"], ["warm","상승 3%↑"], ["emerging","급부상"]].map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: "6px 14px", borderRadius: 99, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                border: filter === f ? `1px solid ${TH.blue}` : `1px solid ${TH.border}`,
                background: filter === f ? TH.blue : TH.surface,
                color: filter === f ? "#fff" : TH.textDim,
                fontWeight: filter === f ? 600 : 400,
                boxShadow: TH.shadow,
                transition: "all 0.12s",
              }}>{label}</button>
            ))}
            <span style={{ fontSize: 12, color: TH.textDim, marginLeft: "auto", fontWeight: 500 }}>{filtered.length}개</span>
          </div>

          {/* 상세 패널 */}
          {selected && <DetailPanel theme={selected} onClose={() => setSelected(null)} />}

          {/* 테마 목록 */}
          <div style={{ background: TH.surface, border: `1px solid ${TH.border}`, borderRadius: 12, overflow: "hidden", boxShadow: TH.shadow }}>
            {/* 컬럼 헤더 */}
            <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 100px 70px", alignItems: "center", gap: 8, padding: "10px 14px", background: TH.surfaceAlt, borderBottom: `1px solid ${TH.border}` }}>
              <div style={{ fontSize: 10, color: TH.textDim, fontWeight: 600 }}>#</div>
              <div style={{ fontSize: 10, color: TH.textDim, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>테마 / 구성종목</div>
              <div style={{ fontSize: 10, color: TH.textDim, fontWeight: 600, textAlign: "right", textTransform: "uppercase", letterSpacing: "0.05em" }}>등락률</div>
              <div style={{ fontSize: 10, color: TH.textDim, fontWeight: 600, textAlign: "right", textTransform: "uppercase", letterSpacing: "0.05em" }}>구분</div>
            </div>

            {filtered.map((t, i) => (
              <div key={t.no} onClick={() => setSelected(selected?.no === t.no ? null : t)}
                   style={{
                     display: "grid", gridTemplateColumns: "36px 1fr 100px 70px",
                     alignItems: "start", gap: 8, padding: "11px 14px",
                     background: selected?.no === t.no ? TH.blueBg : i % 2 === 0 ? TH.surface : TH.surfaceAlt,
                     borderBottom: `1px solid ${TH.borderLight}`,
                     cursor: "pointer",
                     borderLeft: selected?.no === t.no ? `3px solid ${TH.blue}` : "3px solid transparent",
                     transition: "background 0.1s",
                   }}>
                <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", paddingTop: 2, fontWeight: 500 }}>{i + 1}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TH.textBright, marginBottom: 4 }}>
                    {t.emerging && (
                      <span style={{ fontSize: 9, background: TH.redBg, color: TH.red, border: `1px solid ${TH.redBorder}`, padding: "1px 5px", borderRadius: 3, marginRight: 5, fontWeight: 700, verticalAlign: "middle" }}>
                        급부상
                      </span>
                    )}
                    {t.name}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {(t.stocks || []).slice(0, 4).map(s => <StockTag key={s.code || s.name} stock={s} />)}
                    {!(t.stocks || []).length && (
                      <span style={{ fontSize: 11, color: TH.textDim }}>클릭하여 상세 보기</span>
                    )}
                  </div>
                  {t.up != null && (
                    <div style={{ fontSize: 10, marginTop: 4 }}>
                      <span style={{ color: TH.green, fontWeight: 600 }}>↑{t.up}</span>
                      <span style={{ color: TH.textDim }}> — {t.flat}</span>
                      <span style={{ color: TH.red, fontWeight: 600 }}> ↓{t.down}</span>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", paddingTop: 2 }}>
                  <RateSpan value={t.rate_d1} size={14} />
                  <div style={{ fontSize: 10, color: TH.textDim, marginTop: 3 }}>3일 <RateSpan value={t.rate_3d} size={10} /></div>
                </div>
                <div style={{ textAlign: "right", paddingTop: 2 }}>
                  <HeatBadge rate={t.rate_d1} />
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px", color: TH.textDim, fontSize: 13 }}>
                검색 결과가 없어요
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
