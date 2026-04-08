import React from "react";

function StitchScreenerPanel({
  running,
  progress,
  results,
  filtered,
  sorted,
  activeScreens,
  toggleScreen,
  filterMode,
  setFilterMode,
  universe,
  setUniverse,
  handleRun,
  chartTicker,
  setChartTicker,
  showChart,
  setShowChart,
  spyModel,
  exportCSV,
  C
}) {
  const [selectedRow, setSelectedRow] = React.useState(null);
  const [exchange, setExchange] = React.useState('NYSE + NASDAQ');
  const [marketCap, setMarketCap] = React.useState('> $10B (Large+)');
  const [sector, setSector] = React.useState('All Technology');
  const [volTag, setVolTag] = React.useState('High');
  const [peRange, setPeRange] = React.useState([0, 25]);
  const [dividendYield, setDividendYield] = React.useState('Any');
  const [rsiFilter, setRsiFilter] = React.useState('Oversold < 30');
  const [smaCross, setSmaCross] = React.useState('50 Cross Above 200');
  const [candlePattern, setCandlePattern] = React.useState('Bullish Engulfing');

  const safeNumber = (val, fallback = 0) => {
    if (val === null || val === undefined || isNaN(val)) return fallback;
    return val;
  };

  const safeString = (val, fallback = '') => {
    if (val === null || val === undefined) return fallback;
    return val;
  };

  const formatNumber = (num, decimals = 2) => {
    const n = safeNumber(num);
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(decimals);
  };

  const formatPrice = (price) => {
    return '$' + safeNumber(price, 0).toFixed(2);
  };

  const formatChange = (change) => {
    const c = safeNumber(change, 0);
    const sign = c >= 0 ? '+' : '';
    return sign + c.toFixed(2) + '%';
  };

  const getRsiColor = (rsi) => {
    const r = safeNumber(rsi, 50);
    if (r > 70) return C.secondary;
    if (r < 30) return C.secondary;
    return C.tertiary;
  };

  const getRsiLabel = (rsi) => {
    const r = safeNumber(rsi, 50);
    if (r > 70) return 'OB';
    if (r < 30) return 'OS';
    return null;
  };

  const renderTrendBars = (trend) => {
    const bars = safeNumber(trend, [0.3, 0.5, 0.7, 0.6, 0.8]);
    if (!Array.isArray(bars) || bars.length < 5) {
      return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '20px' }}>
          {[0.3, 0.5, 0.7, 0.6, 0.8].map((h, i) => (
            <div
              key={i}
              style={{
                width: '4px',
                height: `${h * 20}px`,
                backgroundColor: i < 3 ? C.primary : C.secondary,
                borderRadius: '1px'
              }}
            />
          ))}
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '20px' }}>
        {bars.slice(0, 5).map((h, i) => (
          <div
            key={i}
            style={{
              width: '4px',
              height: `${Math.max(0.1, h) * 20}px`,
              backgroundColor: i < 3 ? C.primary : C.secondary,
              borderRadius: '1px'
            }}
          />
        ))}
      </div>
    );
  };

  const renderRsiBar = (rsi) => {
    const r = safeNumber(rsi, 50);
    const clampedRsi = Math.min(100, Math.max(0, r));
    const label = getRsiLabel(rsi);
    const color = getRsiColor(rsi);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <div
          style={{
            width: '64px',
            height: '6px',
            backgroundColor: C.surfaceHighest,
            borderRadius: '9999px',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${clampedRsi}%`,
              height: '100%',
              backgroundColor: color,
              borderRadius: '9999px',
              transition: 'width 0.3s ease'
            }}
          />
        </div>
        <span style={{ fontSize: '11px', color: color, fontWeight: '600' }}>
          {label || r.toFixed(0)}
        </span>
      </div>
    );
  };

  const renderSparkline = () => {
    const points = [];
    let y = 80;
    for (let i = 0; i < 50; i++) {
      y += (Math.random() - 0.45) * 10;
      y = Math.max(20, Math.min(140, y));
      points.push(`${i * 8},${y}`);
    }
    return points.join(' ');
  };

  const chartData = React.useMemo(() => {
    const points = [];
    let y = 100;
    for (let i = 0; i < 100; i++) {
      y += (Math.random() - 0.48) * 8;
      y = Math.max(30, Math.min(170, y));
      points.push({ x: i, y });
    }
    return points;
  }, []);

  const chartPath = React.useMemo(() => {
    if (!chartData || chartData.length === 0) return '';
    const width = 340;
    const height = 120;
    const padding = 10;
    const maxY = Math.max(...chartData.map(d => d.y));
    const minY = Math.min(...chartData.map(d => d.y));
    const rangeY = maxY - minY || 1;
    
    return chartData.map((d, i) => {
      const x = padding + (i / (chartData.length - 1)) * (width - padding * 2);
      const y = padding + ((maxY - d.y) / rangeY) * (height - padding * 2);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');
  }, [chartData]);

  const chartAreaPath = React.useMemo(() => {
    if (!chartData || chartData.length === 0) return '';
    const width = 340;
    const height = 120;
    const padding = 10;
    const maxY = Math.max(...chartData.map(d => d.y));
    const minY = Math.min(...chartData.map(d => d.y));
    const rangeY = maxY - minY || 1;
    
    let path = chartData.map((d, i) => {
      const x = padding + (i / (chartData.length - 1)) * (width - padding * 2);
      const y = padding + ((maxY - d.y) / rangeY) * (height - padding * 2);
      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');
    
    const lastX = padding + (width - padding * 2);
    const firstX = padding;
    path += ` L ${lastX} ${height - padding} L ${firstX} ${height - padding} Z`;
    return path;
  }, [chartData]);

  const safeResults = Array.isArray(results) ? results : [];
  const safeFiltered = Array.isArray(filtered) ? filtered : safeResults;

  const snapshotData = chartTicker ? safeResults.find(r => r.ticker === chartTicker) : safeResults[0];

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: C.bg,
        color: C.text,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        overflow: 'hidden'
      }}
    >
      {/* Main Content Area */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Top Section */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: C.surface,
            borderBottom: `1px solid ${C.border}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: C.text, margin: 0 }}>
                Screener (스克里너)
              </h1>
              {running && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: C.primary,
                      animation: 'pulse 2s infinite'
                    }}
                  />
                  <span
                    style={{
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: C.primary,
                      fontWeight: '600'
                    }}
                  >
                    LIVE SCANNING: {safeNumber(universe, 8421).toLocaleString()} ASSETS
                  </span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <span style={{ fontSize: '12px', color: C.textDim }}>
                MARKET VOLUME <span style={{ color: C.text, fontWeight: '600' }}>12.4B USD</span>
              </span>
              <span style={{ fontSize: '12px', color: C.textDim }}>
                VOLATILITY INDEX <span style={{ color: C.text, fontWeight: '600' }}>18.42</span>{' '}
                <span style={{ color: C.secondary }}>(-1.2%)</span>
              </span>
            </div>
          </div>
          <div
            style={{
              width: '100%',
              height: '4px',
              backgroundColor: C.surfaceHighest,
              borderRadius: '2px',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: running ? `${safeNumber(progress, 0)}%` : '75%',
                height: '100%',
                background: `linear-gradient(90deg, ${C.primary}, ${C.primary}99)`,
                borderRadius: '2px',
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>

        {/* Filter Bar */}
        <div
          style={{
            backgroundColor: C.surface,
            borderBottom: `1px solid ${C.border}`,
            padding: '12px 20px'
          }}
        >
          {/* Row 1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <select
              value={exchange}
              onChange={(e) => setExchange(e.target.value)}
              style={{
                backgroundColor: C.surfaceHigh,
                color: C.text,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option>NYSE + NASDAQ</option>
              <option>NYSE</option>
              <option>NASDAQ</option>
              <option>AMEX</option>
            </select>
            <select
              value={marketCap}
              onChange={(e) => setMarketCap(e.target.value)}
              style={{
                backgroundColor: C.surfaceHigh,
                color: C.text,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option>{">"} $10B (Large+)</option>
              <option>$1B - $10B (Mid Cap)</option>
              <option>$100M - $1B (Small)</option>
              <option>{"<"} $100M (Micro)</option>
            </select>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              style={{
                backgroundColor: C.surfaceHigh,
                color: C.text,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option>All Technology</option>
              <option>Technology</option>
              <option>Healthcare</option>
              <option>Finance</option>
              <option>Energy</option>
              <option>Consumer</option>
            </select>
            <div style={{ flex: 1 }} />
            <button
              style={{
                backgroundColor: 'transparent',
                color: C.textDim,
                border: `1px solid ${C.border}`,
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.target.style.borderColor = C.primary;
                e.target.style.color = C.primary;
              }}
              onMouseOut={(e) => {
                e.target.style.borderColor = C.border;
                e.target.style.color = C.textDim;
              }}
            >
              Clear All
            </button>
            <button
              style={{
                backgroundColor: C.primary,
                color: C.bg,
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.target.style.opacity = '0.9';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseOut={(e) => {
                e.target.style.opacity = '1';
                e.target.style.transform = 'translateY(0)';
              }}
              onClick={handleRun}
            >
              Apply Filters
            </button>
          </div>

          {/* Row 2 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', color: C.textDim, marginRight: '4px' }}>RELATIVE VOL:</span>
            {['High', 'Med', 'Low'].map((tag) => (
              <button
                key={tag}
                onClick={() => setVolTag(tag)}
                style={{
                  backgroundColor: volTag === tag ? C.primary : 'transparent',
                  color: volTag === tag ? C.bg : C.textDim,
                  border: `1px solid ${volTag === tag ? C.primary : C.border}`,
                  borderRadius: '4px',
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {tag}
              </button>
            ))}
            <div style={{ width: '1px', height: '20px', backgroundColor: C.border, margin: '0 8px' }} />
            <span style={{ fontSize: '11px', color: C.textDim, marginRight: '8px' }}>P/E RATIO:</span>
            <input
              type="range"
              min="0"
              max="50"
              value={peRange[1]}
              onChange={(e) => setPeRange([peRange[0], parseInt(e.target.value)])}
              style={{
                width: '100px',
                accentColor: C.primary,
                cursor: 'pointer'
              }}
            />
            <span style={{ fontSize: '11px', color: C.text, fontWeight: '600', minWidth: '60px' }}>
              0 - {peRange[1]}
            </span>
            <div style={{ width: '1px', height: '20px', backgroundColor: C.border, margin: '0 8px' }} />
            <span style={{ fontSize: '11px', color: C.textDim, marginRight: '8px' }}>DIVIDEND YIELD:</span>
            <select
              value={dividendYield}
              onChange={(e) => setDividendYield(e.target.value)}
              style={{
                backgroundColor: C.surfaceHigh,
                color: C.text,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option>Any</option>
              <option>{">"} 2%</option>
              <option>{">"} 4%</option>
              <option>{">"} 6%</option>
            </select>
          </div>

          {/* Row 3 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <select
              value={rsiFilter}
              onChange={(e) => setRsiFilter(e.target.value)}
              style={{
                backgroundColor: C.surfaceHigh,
                color: C.text,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '11px',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option>RSI(14) Oversold {("<"} 30)</option>
              <option>RSI(14) Overbought {(">")} 70</option>
              <option>RSI(14) Neutral</option>
            </select>
            <select
              value={smaCross}
              onChange={(e) => setSmaCross(e.target.value)}
              style={{
                backgroundColor: C.surfaceHigh,
                color: C.text,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '11px',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option>50 Cross Above 200</option>
              <option>50 Cross Below 200</option>
              <option>Any Cross</option>
            </select>
            <select
              value={candlePattern}
              onChange={(e) => setCandlePattern(e.target.value)}
              style={{
                backgroundColor: C.surfaceHigh,
                color: C.text,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '11px',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option>Bullish Engulfing</option>
              <option>Bearish Engulfing</option>
              <option>Doji</option>
              <option>Hammer</option>
              <option>Any</option>
            </select>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: '11px', color: C.primary, fontWeight: '600' }}>
              Active Predicates: 14
            </span>
            <button
              style={{
                backgroundColor: C.surfaceHigh,
                color: C.text,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>save</span>
              Save View
            </button>
          </div>
        </div>

        {/* Data Table */}
        <div style={{ flex: 1, overflow: 'auto', backgroundColor: C.bg }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: C.surfaceAlt, position: 'sticky', top: 0, zIndex: 10 }}>
                {['TICKER', 'PRICE', 'CHANGE', 'VOLUME', 'MKT CAP', 'P/E', 'RSI', 'TREND'].map((header, i) => (
                  <th
                    key={header}
                    style={{
                      padding: '12px 16px',
                      textAlign: i === 0 ? 'left' : 'right',
                      fontWeight: '600',
                      fontSize: '10px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: C.textDim,
                      borderBottom: `1px solid ${C.border}`,
                      position: i === 0 ? 'sticky' : 'static',
                      left: i === 0 ? 0 : 'auto',
                      backgroundColor: C.surfaceAlt,
                      zIndex: i === 0 ? 11 : 1,
                      minWidth: i === 0 ? '150px' : 'auto'
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {safeFiltered.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: C.textDim }}>
                    No results found. Adjust your filters.
                  </td>
                </tr>
              ) : (
                safeFiltered.map((row, index) => {
                  const ticker = safeString(row.ticker);
                  const price = safeNumber(row.price);
                  const change = safeNumber(row.change);
                  const volume = safeNumber(row.volume);
                  const mktcap = safeNumber(row.mktcap);
                  const pe = safeNumber(row.pe);
                  const rsi = safeNumber(row.rsi, 50);
                  const trend = row.trend || [0.3, 0.5, 0.7, 0.6, 0.8];
                  const isPositive = change >= 0;
                  const isSelected = selectedRow === ticker;

                  return (
                    <tr
                      key={ticker + index}
                      onClick={() => {
                        setSelectedRow(ticker);
                        setChartTicker(ticker);
                      }}
                      style={{
                        backgroundColor: isSelected ? C.surfaceHigh : index % 2 === 0 ? 'transparent' : C.surfaceAlt,
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseOver={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = C.surfaceHigh;
                      }}
                      onMouseOut={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'transparent' : C.surfaceAlt;
                      }}
                    >
                      {/* Ticker */}
                      <td
                        style={{
                          padding: '12px 16px',
                          borderBottom: `1px solid ${C.borderLight}`,
                          position: 'sticky',
                          left: 0,
                          backgroundColor: isSelected ? C.surfaceHigh : index % 2 === 0 ? 'transparent' : C.surfaceAlt,
                          zIndex: 5,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}
                      >
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            backgroundColor: C.surfaceHighest,
                            borderRadius: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            color: C.primary
                          }}
                        >
                          {ticker.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 'bold', color: C.textBright }}>{ticker}</div>
                          <div style={{ fontSize: '10px', color: C.textDim, textTransform: 'uppercase' }}>
                            {safeString(row.name, ticker)}
                          </div>
                        </div>
                      </td>
                      {/* Price */}
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontWeight: 'bold',
                          fontVariantNumeric: 'tabular-nums',
                          color: C.textBright,
                          borderBottom: `1px solid ${C.borderLight}`
                        }}
                      >
                        {formatPrice(price)}
                      </td>
                      {/* Change */}
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontWeight: '600',
                          fontVariantNumeric: 'tabular-nums',
                          color: isPositive ? C.primary : C.secondary,
                          borderBottom: `1px solid ${C.borderLight}`
                        }}
                      >
                        {formatChange(change)}
                      </td>
                      {/* Volume */}
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontWeight: '500',
                          fontVariantNumeric: 'tabular-nums',
                          color: C.textDim,
                          borderBottom: `1px solid ${C.borderLight}`
                        }}
                      >
                        {formatNumber(volume)}
                      </td>
                      {/* Mkt Cap */}
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontWeight: '500',
                          fontVariantNumeric: 'tabular-nums',
                          color: C.textDim,
                          borderBottom: `1px solid ${C.borderLight}`
                        }}
                      >
                        ${formatNumber(mktcap)}
                      </td>
                      {/* P/E */}
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: C.text,
                          borderBottom: `1px solid ${C.borderLight}`
                        }}
                      >
                        {pe > 0 ? pe.toFixed(2) : '-'}
                      </td>
                      {/* RSI */}
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          borderBottom: `1px solid ${C.borderLight}`
                        }}
                      >
                        {renderRsiBar(rsi)}
                      </td>
                      {/* Trend */}
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          borderBottom: `1px solid ${C.borderLight}`
                        }}
                      >
                        {renderTrendBars(trend)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right Snapshot Panel */}
      <div
        style={{
          width: '380px',
          backgroundColor: C.surfaceLowest,
          borderLeft: `1px solid ${C.border}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                color: C.primary
              }}
            >
              {safeString(chartTicker, 'NVDA')} SNAPSHOT
            </span>
          </div>
          <button
            onClick={() => setShowChart(false)}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: C.textDim,
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = C.surfaceHigh;
              e.target.style.color = C.text;
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = C.textDim;
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
          </button>
        </div>

        {/* Chart */}
        <div style={{ padding: '16px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              PRICE ACTION (1D)
            </span>
            <span style={{ fontSize: '10px', color: C.textDim }}>VOL: 42.1M</span>
          </div>
          <svg width="100%" height="120" viewBox="0 0 340 120" style={{ overflow: 'visible' }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.primary} stopOpacity="0.3" />
                <stop offset="100%" stopColor={C.primary} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={chartAreaPath} fill="url(#chartGradient)" />
            <path d={chartPath} fill="none" stroke={C.primary} strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div
            style={{
              position: 'absolute',
              top: '40px',
              left: '20px',
              fontSize: '18px',
              fontWeight: '900',
              color: C.textBright
            }}
          >
            {formatPrice(snapshotData?.price || 912.45)}
          </div>
        </div>

        {/* Stats Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            padding: '0 16px 16px'
          }}
        >
          {[
            { label: '52W HIGH', value: '$974.00' },
            { label: '52W LOW', value: '$258.50' },
            { label: 'EPS (TTM)', value: '11.93' },
            { label: 'Beta', value: '1.74' }
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                backgroundColor: C.surface,
                border: `1px solid ${C.borderLight}`,
                borderRadius: '8px',
                padding: '12px'
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: C.textDim,
                  marginBottom: '4px'
                }}
              >
                {stat.label}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: C.textBright }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Analyst Sentiment */}
        <div
          style={{
            margin: '0 16px 16px',
            padding: '16px',
            backgroundColor: 'rgba(74, 225, 118, 0.05)',
            backdropFilter: 'blur(10px)',
            borderRadius: '10px',
            border: `1px solid ${C.primary}20`
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: '600',
              color: C.text,
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            Analyst Sentiment
          </div>
          {[
            { label: 'BUY', value: 84, color: C.primary },
            { label: 'HOLD', value: 12, color: C.textDim },
            { label: 'SELL', value: 4, color: C.secondary }
          ].map((item) => (
            <div key={item.label} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', color: C.textDim }}>{item.label}</span>
                <span style={{ fontSize: '10px', fontWeight: '600', color: item.color }}>{item.value}%</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: C.surfaceHighest,
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    width: `${item.value}%`,
                    height: '100%',
                    backgroundColor: item.color,
                    borderRadius: '2px',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Technical Rating */}
        <div style={{ padding: '0 16px 16px' }}>
          <div
            style={{
              backgroundColor: C.surface,
              border: `1px solid ${C.borderLight}`,
              borderRadius: '10px',
              padding: '16px'
            }}
          >
            <div
              style={{
                fontSize: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: C.textDim,
                marginBottom: '8px'
              }}
            >
              Technical Rating
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              {[1, 2, 3, 4].map((star) => (
                <span
                  key={star}
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '20px',
                    color: C.primary
                  }}
                >
                  star
                </span>
              ))}
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: '20px',
                  color: C.surfaceHighest
                }}
              >
                star
              </span>
            </div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: '900',
                color: C.primary,
                textTransform: 'uppercase'
              }}
            >
              STRONG BULLISH
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* Bottom Button */}
        <div style={{ padding: '16px' }}>
          <button
            style={{
              width: '100%',
              backgroundColor: C.primary,
              color: C.bg,
              border: 'none',
              borderRadius: '8px',
              padding: '14px 20px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => {
              e.target.style.opacity = '0.9';
              e.target.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.target.style.opacity = '1';
              e.target.style.transform = 'translateY(0)';
            }}
            onClick={() => {
              if (spyModel) {
                spyModel.setView('terminal');
              }
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>open_in_new</span>
            OPEN FULL TERMINAL
          </button>
        </div>
      </div>

      {/* Animation Keyframes */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </div>
  );
}


export default StitchScreenerPanel;
