import express from "express";
import cors from "cors";
import NodeCache from "node-cache";
import axios from "axios";
import { WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

// ─── Finnhub 설정 ─────────────────────────────────────────────
// finnhub.io 에서 무료 발급: https://finnhub.io/register
const FINNHUB_TOKEN = process.env.FINNHUB_TOKEN || "d3ulcohr01qil4aqlmagd3ulcohr01qil4aqlmb0";

// ─── 캐시 ─────────────────────────────────────────────────────
const cache = new NodeCache({ stdTTL: 300 });   // 기본 5분
const dayCache = new NodeCache({ stdTTL: 86400 }); // 일간 (open/prevClose)

// ─── Yahoo Finance 헤더 (breadth, options, COT 용) ────────────
const YF_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://finance.yahoo.com",
};

// ─── Yahoo Finance crumb (options용) ──────────────────────────
let yfAuth = { cookie: "", crumb: "", ts: 0 };
async function getYFAuth() {
    if (yfAuth.crumb && Date.now() - yfAuth.ts < 3600000) return yfAuth;
    try {
        const r1 = await axios.get("https://finance.yahoo.com", {
            headers: { "User-Agent": YF_HEADERS["User-Agent"], "Accept-Language": "en-US,en;q=0.9" },
            timeout: 10000, maxRedirects: 5,
        });
        const cookies = (r1.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ");
        const r2 = await axios.get("https://query1.finance.yahoo.com/v1/finance/getCrumb", {
            headers: { ...YF_HEADERS, Cookie: cookies }, timeout: 8000,
        });
        yfAuth = { cookie: cookies, crumb: r2.data, ts: Date.now() };
        console.log("✅ YF crumb 갱신:", yfAuth.crumb);
    } catch (e) {
        console.error("YF crumb 갱신 실패:", e.message);
    }
    return yfAuth;
}

// ─── Finnhub WebSocket: 실시간 체결가 수신 ───────────────────
const liveQuotes = new Map(); // symbol → { price, volume, ts }
const wsSubscribed = new Set();
let fws = null;

function finnhubSubscribe(symbols) {
    if (!fws || fws.readyState !== WebSocket.OPEN) return;
    for (const s of symbols) {
        if (!wsSubscribed.has(s)) {
            fws.send(JSON.stringify({ type: "subscribe", symbol: s }));
            wsSubscribed.add(s);
        }
    }
}

function connectFinnhubWS() {
    if (!FINNHUB_TOKEN) {
        console.warn("⚠ FINNHUB_TOKEN 미설정 — WebSocket 비활성. index.js에 토큰을 입력하세요.");
        return;
    }
    fws = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_TOKEN}`);

    fws.on("open", () => {
        console.log("✅ Finnhub WebSocket 연결됨");
        // 이미 구독 요청된 종목 재구독 (재연결 시)
        if (wsSubscribed.size > 0) {
            for (const s of wsSubscribed) {
                fws.send(JSON.stringify({ type: "subscribe", symbol: s }));
            }
        }
    });

    fws.on("message", (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === "trade" && msg.data) {
                for (const t of msg.data) {
                    const prev = liveQuotes.get(t.s) || {};
                    liveQuotes.set(t.s, {
                        price: t.p,
                        volume: (prev.volume || 0) + (t.v || 0),
                        ts: t.t,
                    });
                }
            }
        } catch { /* ignore parse errors */ }
    });

    fws.on("close", () => {
        console.log("Finnhub WS 종료 → 5초 후 재연결");
        setTimeout(connectFinnhubWS, 5000);
    });

    fws.on("error", (e) => console.error("Finnhub WS 오류:", e.message));
}

// 서버 시작 시 WebSocket 연결
connectFinnhubWS();

// ─── Finnhub 직렬 큐 레이트 리미터 (60req/min) ───────────────
// Node.js는 단일 스레드지만 await 경합으로 동시 호출 가능 → 큐로 직렬화
let lastFHCall = 0;
let fhRunning = false;
const fhQueue = [];

function fhRateLimit() {
    return new Promise(resolve => {
        fhQueue.push(resolve);
        if (!fhRunning) drainFHQueue();
    });
}
async function drainFHQueue() {
    fhRunning = true;
    while (fhQueue.length > 0) {
        const resolve = fhQueue.shift();
        const wait = Math.max(0, 1100 - (Date.now() - lastFHCall));
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        lastFHCall = Date.now();
        resolve();
    }
    fhRunning = false;
}

// ─── Finnhub REST: 단일 종목 기준시세 (open, prevClose) ───────
async function finnhubQuoteREST(symbol) {
    const cKey = `fq_${symbol}`;
    const cached = dayCache.get(cKey);
    if (cached) return cached;

    await fhRateLimit();
    const r = await axios.get("https://finnhub.io/api/v1/quote", {
        params: { symbol, token: FINNHUB_TOKEN },
        timeout: 8000,
    });
    const q = r.data;
    const result = {
        price: q.c || 0,
        open: q.o || 0,
        prevClose: q.pc || 0,
        changePercent: q.dp || 0,
        high: q.h || 0,
        low: q.l || 0,
    };
    dayCache.set(cKey, result);
    return result;
}


// ─── Yahoo Finance 배치 시세 (Finnhub 토큰 없을 때 fallback) ──
async function fetchYFQuotesBatch(tickers) {
    const fields = ["regularMarketPrice", "regularMarketChangePercent", "regularMarketOpen", "regularMarketVolume", "averageDailyVolume3Month"].join(",");
    const r = await axios.get("https://query1.finance.yahoo.com/v7/finance/quote", {
        headers: YF_HEADERS,
        params: { symbols: tickers.join(","), fields },
        timeout: 12000,
    });
    const out = {};
    for (const q of (r.data?.quoteResponse?.result || [])) {
        const price = q.regularMarketPrice || 0;
        const open = q.regularMarketOpen || price;
        const vol = q.regularMarketVolume || 0;
        const avgV = q.averageDailyVolume3Month || 1;
        out[q.symbol] = {
            price: Math.round(price * 100) / 100,
            daily: Math.round((q.regularMarketChangePercent || 0) * 100) / 100,
            intra: open > 0 ? Math.round(((price - open) / open) * 10000) / 100 : 0,
            volume: vol,
            darkpool: Math.round(Math.min(100, Math.max(0, (vol / Math.max(avgV, 1)) * 20)) * 10) / 10,
            shortInt: null,
            open, prevClose: 0,
        };
    }
    return out;
}

// ─── Yahoo Finance v8 chart: full OHLCV + meta ───────────────
async function fetchYFChart(ticker, days = 90) {
    const cKey = `yfc_${ticker}_${days}`;
    const cached = cache.get(cKey);
    if (cached) return cached;

    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - days * 86400;
    const res = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`, {
        headers: YF_HEADERS, params: { period1, period2, interval: "1d" }, timeout: 12000,
    });
    const result = res.data?.chart?.result?.[0];
    if (!result) throw new Error(`No YF data: ${ticker}`);
    const meta = result.meta || {};
    const q = result.indicators?.quote?.[0] || {};
    const ts = result.timestamp || [];
    const ohlcv = ts.map((t, i) => ({
        date: new Date(t * 1000),
        open: q.open?.[i] || q.close?.[i] || 0,
        high: q.high?.[i] || q.close?.[i] || 0,
        low: q.low?.[i] || q.close?.[i] || 0,
        close: q.close?.[i] || 0,
        volume: q.volume?.[i] || 0,
    })).filter(d => d.close > 0);
    const data = { meta, ohlcv };
    cache.set(cKey, data);
    return data;
}

// ─── 지표 계산 ────────────────────────────────────────────────
function calcEMA(data, period) {
    const p = Math.min(period, data.length);
    if (p < 2) return data[data.length - 1];
    const k = 2 / (p + 1);
    let ema = data.slice(0, p).reduce((a, b) => a + b, 0) / p;
    for (let i = p; i < data.length; i++) ema = data[i] * k + ema * (1 - k);
    return ema;
}

function calcATR(ohlcv, period = 14) {
    const trs = [];
    for (let i = 1; i < ohlcv.length; i++) {
        const pc = ohlcv[i - 1].close;
        trs.push(Math.max(ohlcv[i].high - ohlcv[i].low, Math.abs(ohlcv[i].high - pc), Math.abs(ohlcv[i].low - pc)));
    }
    const p = Math.min(period, trs.length);
    return trs.slice(-p).reduce((a, b) => a + b, 0) / p;
}

function calcOBV(ohlcv) {
    let obv = 0;
    const arr = [];
    for (let i = 1; i < ohlcv.length; i++) {
        if (ohlcv[i].close > ohlcv[i - 1].close) obv += ohlcv[i].volume;
        else if (ohlcv[i].close < ohlcv[i - 1].close) obv -= ohlcv[i].volume;
        arr.push(obv);
    }
    if (arr.length < 10) return 0;
    const recent = arr.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const prev = arr.slice(-15, -10).reduce((a, b) => a + b, 0) / 5;
    const totalVol = ohlcv.slice(-20).reduce((a, d) => a + (d.volume || 0), 0) || 1;
    return Math.max(-100, Math.min(100, Math.round(((recent - prev) / totalVol) * 1000)));
}

function calcMFI(ohlcv, period = 14) {
    const slice = ohlcv.slice(-(period + 1));
    let pos = 0, neg = 0;
    for (let i = 1; i < slice.length; i++) {
        const tp = (slice[i].high + slice[i].low + slice[i].close) / 3;
        const ptp = (slice[i - 1].high + slice[i - 1].low + slice[i - 1].close) / 3;
        const mf = tp * (slice[i].volume || 1);
        if (tp > ptp) pos += mf; else neg += mf;
    }
    if (neg === 0) return 100;
    return Math.round(100 - 100 / (1 + pos / neg));
}

function calcVWAPDev(ohlcv) {
    const sl = ohlcv.slice(-20);
    let sumPV = 0, sumV = 0;
    for (const d of sl) {
        const tp = (d.high + d.low + d.close) / 3;
        sumPV += tp * (d.volume || 1);
        sumV += (d.volume || 1);
    }
    if (!sumV) return 0;
    const last = ohlcv[ohlcv.length - 1].close;
    return Math.round(((last - sumPV / sumV) / (sumPV / sumV)) * 1000) / 10;
}

function calcADL(ohlcv) {
    let adl = 0;
    for (const d of ohlcv.slice(-20)) {
        const r = d.high - d.low;
        if (!r) continue;
        adl += ((d.close - d.low) - (d.high - d.close)) / r * (d.volume || 1);
    }
    return adl > 0 ? "매집" : "분산";
}

function calcOrderDelta(ohlcv) {
    let delta = 0;
    for (const d of ohlcv.slice(-5)) delta += (d.close - d.open) * (d.volume || 1);
    const maxVol = Math.max(...ohlcv.map(d => d.volume || 1));
    return Math.max(-1000, Math.min(1000, Math.round((delta / maxVol) * 100)));
}

function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = closes.length - period; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses += Math.abs(diff);
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return Math.round(100 - 100 / (1 + avgGain / avgLoss));
}

function calcBBPos(closes, period = 20) {
    const sl = closes.slice(-period);
    if (sl.length < 5) return 50;
    const mean = sl.reduce((a, b) => a + b, 0) / sl.length;
    const std = Math.sqrt(sl.reduce((a, b) => a + (b - mean) ** 2, 0) / sl.length);
    if (std === 0) return 50;
    const last = closes[closes.length - 1];
    return Math.round(Math.max(0, Math.min(100, ((last - (mean - 2 * std)) / (4 * std)) * 100)));
}

function calcVolRatio(ohlcv) {
    if (ohlcv.length < 2) return 100;
    const recentVol = ohlcv[ohlcv.length - 1].volume;
    const sl = ohlcv.slice(-21, -1);
    const avgVol = sl.length ? sl.reduce((a, d) => a + (d.volume || 0), 0) / sl.length : 0;
    if (!avgVol) return 100;
    return Math.round(Math.min(300, (recentVol / avgVol) * 100));
}

function calcSMA200Dev(closes) {
    if (closes.length < 10) return 0;
    const period = Math.min(200, closes.length);
    const sma = closes.slice(-period).reduce((a, b) => a + b, 0) / period;
    const last = closes[closes.length - 1];
    return Math.round(((last - sma) / sma) * 1000) / 10;
}

function calcMACDHist(closes) {
    if (closes.length < 26) return 0;
    // Build EMA12 and EMA26 efficiently (O(n))
    let ema12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    let ema26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
    const k12 = 2 / 13, k26 = 2 / 27;
    for (let i = 12; i < 26; i++) ema12 = closes[i] * k12 + ema12 * (1 - k12);
    const macdArr = [ema12 - ema26];
    for (let i = 26; i < closes.length; i++) {
        ema12 = closes[i] * k12 + ema12 * (1 - k12);
        ema26 = closes[i] * k26 + ema26 * (1 - k26);
        macdArr.push(ema12 - ema26);
    }
    if (macdArr.length < 9) return Math.round(macdArr[macdArr.length - 1] * 10000) / 10000;
    let signal = macdArr.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    const k9 = 2 / 10;
    for (let i = 9; i < macdArr.length; i++) signal = macdArr[i] * k9 + signal * (1 - k9);
    return Math.round((macdArr[macdArr.length - 1] - signal) * 10000) / 10000;
}

// ─── Minervini 스크리너 ────────────────────────────────────────
const screenerCache = new NodeCache({ stdTTL: 300 });

const NASDAQ100 = [
    "AAPL", "ABNB", "ADBE", "ADI", "ADP", "ADSK", "AEP", "AMAT", "AMD", "AMGN",
    "AMZN", "ANSS", "APP", "ARM", "ASML", "AVGO", "AXON", "AZN", "BIIB", "BKNG",
    "BKR", "CDNS", "CDW", "CEG", "CHTR", "CMCSA", "COST", "CPRT", "CRWD", "CSCO",
    "CSX", "CTAS", "CTSH", "DASH", "DDOG", "DLTR", "DXCM", "EA", "EXC", "FANG",
    "FAST", "FTNT", "GFS", "GEHC", "GILD", "GOOG", "GOOGL", "HON", "IDXX", "ILMN",
    "INTC", "INTU", "ISRG", "KDP", "KHC", "KLAC", "LRCX", "LULU", "MAR", "MCHP",
    "MDLZ", "META", "MELI", "MNST", "MRK", "MRNA", "MRVL", "MSFT", "MU", "NFLX",
    "NVDA", "NXPI", "ODFL", "ON", "ORLY", "PANW", "PAYX", "PCAR", "PDD", "PEP",
    "PLTR", "PYPL", "QCOM", "REGN", "ROP", "ROST", "SBUX", "SMCI", "SNPS", "TEAM",
    "TMUS", "TSLA", "TTD", "TXN", "VRSK", "VRTX", "WBD", "WDC", "WDAY", "XEL", "ZS",
];

const SP100 = [
    "AAPL", "ABBV", "ABT", "ACN", "AIG", "ALL", "AMGN", "AMT", "AMZN", "AXP",
    "BA", "BAC", "BK", "BLK", "BMY", "BRK-B", "C", "CAT", "CL", "CMCSA",
    "COF", "COP", "COST", "CRM", "CSCO", "CVS", "CVX", "D", "DE", "DIS",
    "DOW", "DUK", "EMR", "EXC", "F", "FDX", "GD", "GE", "GILD", "GM",
    "GOOG", "GS", "HD", "HON", "HUM", "IBM", "JNJ", "JPM", "KO", "LMT",
    "LOW", "MA", "MCD", "MDT", "MET", "MMM", "MO", "MRK", "MS", "MSFT",
    "NEE", "NKE", "NSC", "ORCL", "OXY", "PEP", "PFE", "PG", "PM", "PYPL",
    "QCOM", "RTX", "SBUX", "SLB", "SO", "SPG", "T", "TGT", "TJX", "TMO",
    "TXN", "UNH", "UNP", "UPS", "USB", "V", "VZ", "WFC", "WM", "WMT", "XOM",
];

const SP500 = [
    "MMM","AOS","ABT","ABBV","ACN","ADBE","AMD","AES","AFL","A","APD","ABNB","AKAM","ALB","ARE","ALGN","ALLE","LNT","ALL","GOOGL","GOOG","MO","AMZN","AMCR","AEE","AAL","AEP","AXP","AIG","AMT","AWK","AMP","AME","AMGN","APH","ADI","ANSS","AON","APA","AAPL","AMAT","APTV","ACGL","ADM","ANET","AJG","AIZ","T","ATO","ADSK","ADP","AZO","AVB","AVY","AXON",
    "BKR","BALL","BAC","BK","BBWI","BAX","BDX","BRK-B","BBY","BIO","TECH","BIIB","BLK","BX","BA","BCH","BMY","AVGO","BR","BRO","BF-B","BLDR","BG","CDNS","CZR","CPT","CPB","COF","CAH","KMX","CCL","CARR","CTLT","CAT","CBOE","CBRE","CDW","CE","COR","CNC","CNP","CF","CHRW","CRL","SCHW","CHTR","CVX","CMG","CB","CHD","CI","CINF","CTAS","CSCO","C","CFG","CLX","CME","CMS","KO","CTSH","CL","CMCSA","CAG","COP","ED","STZ","CEG","COO","CPRT","GLW","CPAY","CTVA","CSGP","COST","CTRA","CRWD","CCI","CSX","CMI","CVS","DHI","DHR","DRI","DVA","DAY","DE","DAL","XRAY","DVN","DXCM","FANG","DLR","DFS","DG","DLTR","D","DPZ","DOV","DOW","DHX","DTE","DUK","DD","EMN","ETN","EBAY","ECL","EIX","EW","EA","ELV","EMR","ENPH","ETR","EOG","EPAM","EQT","EFX","EQIX","EQR","ESS","EL","ETSY","EG","EVRST","ES","EXC","EXPE","EXPD","EXR",
    "FFIV","FDS","FICO","FAST","FRT","FDX","FIS","FITB","FSLR","FE","FI","FMC","F","FTNT","FTV","FOXA","FOX","BEN","FCX","GRMN","IT","GE","GEHC","GEV","GEN","GNRC","GD","GIS","GM","GPC","GILD","GS","HAL","HIG","HAS","HCA","DOC","HSIC","HSY","HES","HPE","HLT","HOLX","HD","HON","HRL","HST","HWM","HPQ","HUBB","HUM","HBAN","HII",
    "IBM","IEX","IDXX","ITW","INCY","IR","PODD","INTC","ICE","IFF","IP","IPG","INTU","ISRG","IVZ","INVH","IQV","IRM",
    "JBHT","JBL","JKHY","J","JNJ","JCI","JPM","JNPR","K","KVUE","KDP","KEY","KEYS","KMB","KIM","KMI","KLAC","KHC","KR",
    "LHX","LH","LRCX","LW","LVS","LDOS","LEN","LLY","LIN","LYV","LKQ","LMT","L","LOW","LULU","LYB",
    "MTB","MRO","MPC","MKTX","MAR","MMC","MLM","MAS","MA","MTCH","MKC","MCD","MCK","MDT","MRK","META","MET","MTD","MGM","MCHP","MU","MSFT","MAA","MRNA","MHK","MOH","TAP","MDLZ","MPWR","MNST","MCO","MS","MOS","MSI","MSCI","NDAQ","NTAP","NFLX","NEM","NWSA","NWS","NEE","NKE","NI","NDSN","NSC","NTRS","NOC","NCLH","NRG","NUE","NVDA","NVR","NXPI",
    "ORLY","OXY","ODFL","OMC","ON","OKE","ORCL","OTIS","PCAR","PKG","PLTR","PH","PAYX","PAYC","PYPL","PNR","PEP","PFE","PCG","PM","PSX","PNW","PXD","PNC","POOL","PPG","PPL","PFG","PG","PGR","PLD","PRU","PEG","PTVE","PTC","PSA","PHM","QRVO","PWR","QCOM","DGX","RL","RJF","RTX","O","REG","REGN","RF","RSG","RMD","RVTY","ROK","ROL","ROP","ROST","RCL",
    "SPGI","CRM","SBAC","SLB","STX","SRE","NOW","SHW","SPG","SWKS","SJM","SW","SNA","SOLV","SO","LUV","SWK","SBUX","STT","STLD","STE","SYK","SMCI","SYF","SNPS","SYY",
    "TMUS","TROW","TTWO","TPR","TRGP","TGT","TEL","TDY","TFX","TER","TSLA","TXN","TXT","TMO","TJX","TSCO","TT","TDG","TRV","TRMB","TFC","TYL",
    "USB","UDR","ULTA","UNP","UAL","UPS","URI","UNH","UHS","VLO","VTR","VRSN","VRSK","VZ","VRTX","VTRS","VICI","V","VST","VFC","VLTO","VWO",
    "WRB","GWW","WAB","WBA","WMT","WBD","WM","WAT","WEC","WFC","WELL","WST","WDC","WY","WHR","WMB","WTW","WYNN",
    "XEL","XYL","YUM","ZBRA","ZBH","ZTS",
];

// KOSPI 200 구성종목 (네이버금융 크롤링, Yahoo Finance .KS)
const KOSPI200 = [
  "005930.KS","000660.KS","005380.KS","373220.KS","012450.KS","402340.KS","207940.KS","034020.KS",
  "000270.KS","105560.KS","329180.KS","028260.KS","032830.KS","068270.KS","055550.KS","042660.KS",
  "009150.KS","006400.KS","006800.KS","012330.KS","267260.KS","010130.KS","086790.KS","035420.KS",
  "005490.KS","015760.KS","009540.KS","298040.KS","042700.KS","010140.KS","034730.KS","272210.KS",
  "316140.KS","051910.KS","010120.KS","064350.KS","000810.KS","035720.KS","000720.KS","096770.KS",
  "138040.KS","267250.KS","000150.KS","011200.KS","003670.KS","017670.KS","066570.KS","047810.KS",
  "079550.KS","033780.KS","024110.KS","086280.KS","030200.KS","003550.KS","071050.KS","0126Z0.KS",
  "047050.KS","010950.KS","278470.KS","005940.KS","039490.KS","018260.KS","323410.KS","005830.KS",
  "307950.KS","352820.KS","259960.KS","028050.KS","047040.KS","016360.KS","000880.KS","003490.KS",
  "006260.KS","003230.KS","007660.KS","011070.KS","443060.KS","326030.KS","180640.KS","090430.KS",
  "161390.KS","000100.KS","066970.KS","377300.KS","032640.KS","009830.KS","052690.KS","078930.KS",
  "241560.KS","128940.KS","029780.KS","034220.KS","064400.KS","001440.KS","175330.KS","454910.KS",
  "001040.KS","021240.KS","138930.KS","450080.KS","271560.KS","004020.KS","022100.KS","036570.KS",
  "002380.KS","062040.KS","088350.KS","251270.KS","018880.KS","011170.KS","082740.KS","051900.KS",
  "375500.KS","010060.KS","111770.KS","011790.KS","035250.KS","017800.KS","097950.KS","012750.KS",
  "011780.KS","036460.KS","302440.KS","006360.KS","004170.KS","014680.KS","023530.KS","457190.KS",
  "004990.KS","009970.KS","103140.KS","028670.KS","026960.KS","139130.KS","005850.KS","112610.KS",
  "001450.KS","071970.KS","008930.KS","051600.KS","139480.KS","001430.KS","009420.KS","383220.KS",
  "204320.KS","000120.KS","282330.KS","120110.KS","017960.KS","000240.KS","004370.KS","030000.KS",
  "081660.KS","011210.KS","007340.KS","002790.KS","192820.KS","008770.KS","361610.KS","161890.KS",
  "007070.KS","073240.KS","069960.KS","298020.KS","069620.KS","006040.KS","006280.KS","001800.KS",
  "007310.KS","000210.KS","034230.KS","003240.KS","003090.KS","004000.KS","300720.KS","185750.KS",
  "000080.KS","000670.KS","005300.KS","093370.KS","280360.KS","192080.KS","006650.KS","003030.KS",
  "298050.KS","009240.KS","285130.KS","137310.KS","071320.KS","004490.KS","014820.KS","069260.KS",
  "114090.KS","001680.KS","005250.KS","008730.KS","002840.KS","005420.KS","268280.KS","002030.KS",
];

// KOSDAQ 150 구성종목 (네이버금융 크롤링, Yahoo Finance .KQ)
const KOSDAQ150 = [
  "005930.KQ","000660.KQ","005380.KQ","373220.KQ","012450.KQ","402340.KQ","207940.KQ","034020.KQ",
  "000270.KQ","105560.KQ","329180.KQ","028260.KQ","032830.KQ","068270.KQ","055550.KQ","042660.KQ",
  "009150.KQ","006400.KQ","006800.KQ","012330.KQ","267260.KQ","010130.KQ","086790.KQ","035420.KQ",
  "005490.KQ","015760.KQ","009540.KQ","298040.KQ","042700.KQ","010140.KQ","034730.KQ","272210.KQ",
  "316140.KQ","051910.KQ","010120.KQ","064350.KQ","000810.KQ","035720.KQ","000720.KQ","096770.KQ",
  "138040.KQ","267250.KQ","000150.KQ","011200.KQ","003670.KQ","017670.KQ","066570.KQ","047810.KQ",
  "079550.KQ","033780.KQ","024110.KQ","086280.KQ","030200.KQ","003550.KQ","071050.KQ","0126Z0.KQ",
  "047050.KQ","010950.KQ","278470.KQ","005940.KQ","039490.KQ","018260.KQ","323410.KQ","005830.KQ",
  "307950.KQ","352820.KQ","259960.KQ","028050.KQ","047040.KQ","016360.KQ","000880.KQ","003490.KQ",
  "006260.KQ","003230.KQ","007660.KQ","011070.KQ","443060.KQ","326030.KQ","180640.KQ","090430.KQ",
  "161390.KQ","000100.KQ","066970.KQ","377300.KQ","032640.KQ","009830.KQ","052690.KQ","078930.KQ",
  "241560.KQ","128940.KQ","029780.KQ","034220.KQ","064400.KQ","001440.KQ","175330.KQ","454910.KQ",
  "001040.KQ","021240.KQ","138930.KQ","450080.KQ","271560.KQ","004020.KQ","022100.KQ","036570.KQ",
  "002380.KQ","062040.KQ","088350.KQ","251270.KQ","018880.KQ","011170.KQ","082740.KQ","051900.KQ",
  "375500.KQ","010060.KQ","111770.KQ","011790.KQ","035250.KQ","017800.KQ","097950.KQ","012750.KQ",
  "011780.KQ","036460.KQ","302440.KQ","006360.KQ","004170.KQ","014680.KQ","023530.KQ","457190.KQ",
  "004990.KQ","009970.KQ","103140.KQ","028670.KQ","026960.KQ","139130.KQ","005850.KQ","112610.KQ",
  "001450.KQ","071970.KQ","008930.KQ","051600.KQ","139480.KQ","001430.KQ","009420.KQ","383220.KQ",
  "204320.KQ","000120.KQ","282330.KQ","120110.KQ","017960.KQ","000240.KQ","004370.KQ","030000.KQ",
  "081660.KQ","011210.KQ","007340.KQ","002790.KQ","192820.KQ","008770.KQ","361610.KQ","161890.KQ",
  "007070.KQ","073240.KQ","069960.KQ","298020.KQ","069620.KQ","006040.KQ","006280.KQ","001800.KQ",
  "007310.KQ","000210.KQ","034230.KQ","003240.KQ","003090.KQ","004000.KQ","300720.KQ","185750.KQ",
  "000080.KQ","000670.KQ","005300.KQ","093370.KQ","280360.KQ","192080.KQ","006650.KQ","003030.KQ",
  "298050.KQ","009240.KQ","285130.KQ","137310.KQ","071320.KQ","004490.KQ","014820.KQ","069260.KQ",
  "114090.KQ","001680.KQ","005250.KQ","008730.KQ","002840.KQ","005420.KQ","268280.KQ","002030.KQ",
];

function scrGetTickers(universe, custom) {
    if (universe === "nasdaq100") return [...NASDAQ100];
    if (universe === "sp100") return [...SP100];
    if (universe === "sp500") return [...SP500];
    if (universe === "both") return [...new Set([...NASDAQ100, ...SP100])];
    if (universe === "kospi200") return [...KOSPI200];
    if (universe === "kosdaq150") return [...KOSDAQ150];
    if (universe === "krx") return [...new Set([...KOSPI200, ...KOSDAQ150])];
    return custom.split(",").map(t => t.trim().toUpperCase()).filter(Boolean);
}

async function scrFetchRussell2000() {
    const cKey = "r2000_tickers";
    const cached = dayCache.get(cKey);
    if (cached) return cached;
    try {
        const r = await axios.get(
            "https://www.ishares.com/us/products/239710/ISHARES-RUSSELL-2000-ETF/1467271812596.ajax",
            {
                params: { fileType: "csv", fileName: "IWM_holdings", dataType: "fund" },
                headers: {
                    ...YF_HEADERS,
                    "Referer": "https://www.ishares.com/us/products/239710/ISHARES-RUSSELL-2000-ETF",
                },
                timeout: 30000,
                responseType: "text",
            }
        );
        const lines = r.data.split(/\r?\n/);
        const tickers = [];
        let headerFound = false;
        for (const line of lines) {
            const cols = line.split(",").map(c => c.replace(/"/g, "").trim());
            if (!headerFound) {
                if (cols[0] === "Ticker") { headerFound = true; }
                continue;
            }
            const ticker = cols[0];
            const assetClass = cols[3] || "";
            if (ticker && /^[A-Z]{1,5}$/.test(ticker) && assetClass === "Equity") {
                tickers.push(ticker);
            }
        }
        if (tickers.length > 100) dayCache.set(cKey, tickers, 86400);
        console.log(`✅ Russell 2000 tickers loaded: ${tickers.length}`);
        return tickers;
    } catch (e) {
        console.error("Russell 2000 fetch error:", e.message);
        return [];
    }
}

function scrSMA(closes, n) {
    if (closes.length < n) return null;
    return closes.slice(-n).reduce((a, b) => a + b, 0) / n;
}

function scrMA200Slope(closes) {
    if (closes.length < 220) return null;
    const now = scrSMA(closes, 200);
    const past = scrSMA(closes.slice(0, -20), 200);
    return now - past;
}

function scrRS12m(closes) {
    if (closes.length < 253) return null;
    const cur = closes[closes.length - 1];
    const past = closes[closes.length - 253];
    if (!past) return null;
    return ((cur - past) / past) * 100;
}

function scrTPR(closes) {
    let score = 0;
    const c = closes[closes.length - 1];
    const ma50 = scrSMA(closes, 50);
    const ma150 = scrSMA(closes, 150);
    const ma200 = scrSMA(closes, 200);
    const rs = scrRS12m(closes);
    const window52 = closes.slice(-252);
    const h52 = Math.max(...window52);
    if (ma50 != null && c > ma50) score += 20;
    if (ma150 != null && c > ma150) score += 20;
    if (ma200 != null && c > ma200) score += 20;
    if (ma50 != null && ma150 != null && ma200 != null && ma50 > ma150 && ma150 > ma200) score += 15;
    if (rs != null) {
        if (rs > 50) score += 15;
        else if (rs > 20) score += 8;
        else if (rs > 0) score += 3;
    }
    if (h52 > 0) {
        const prox = c / h52;
        if (prox >= 0.90) score += 10;
        else if (prox >= 0.80) score += 5;
    }
    if (score >= 85) return "A+";
    if (score >= 70) return "A";
    if (score >= 55) return "B";
    if (score >= 35) return "C";
    return "D";
}

function scrRPR(closes) {
    if (closes.length < 253) return 0;
    const cur = closes[closes.length - 1];
    const past = closes[closes.length - 253];
    if (!past) return 0;
    return Math.min(100, Math.max(0, Math.round(((cur - past) / past + 1) * 50 * 10) / 10));
}

function scrIsStage2(closes) {
    const ma50 = scrSMA(closes, 50);
    const ma150 = scrSMA(closes, 150);
    const ma200 = scrSMA(closes, 200);
    const slope = scrMA200Slope(closes);
    if (!ma50 || !ma150 || !ma200 || slope === null) return false;
    const c = closes[closes.length - 1];
    const w = closes.slice(-252);
    const h52 = Math.max(...w);
    const l52 = Math.min(...w);
    return c > ma150 && ma150 > ma200 && slope > 0 &&
        ma50 > ma150 && ma150 > ma200 && c > ma50 &&
        c >= l52 * 1.30 && c >= h52 * 0.75;
}

function scrIsStage2Loose(closes) {
    const ma150 = scrSMA(closes, 150);
    const ma200 = scrSMA(closes, 200);
    if (!ma150 || !ma200) return false;
    const c = closes[closes.length - 1];
    const w = closes.slice(-252);
    const h52 = Math.max(...w);
    const l52 = Math.min(...w);
    return c > ma200 && ma150 > ma200 && c >= l52 * 1.25 && c >= h52 * 0.70;
}

function scrIsStage2VeryLoose(closes) {
    const ma200 = scrSMA(closes, 200);
    if (!ma200) return false;
    const c = closes[closes.length - 1];
    const l52 = Math.min(...closes.slice(-252));
    return c > ma200 && c >= l52 * 1.15;
}

// VCP (Volatility Contraction Pattern) — 변동성 수축 패턴
function scrVCP(closes, ohlcv) {
    if (ohlcv.length < 30) return { vcp: false, vcpScore: 0 };
    const recent = ohlcv.slice(-60);
    const n = recent.length;
    if (n < 20) return { vcp: false, vcpScore: 0 };

    // 5일 롤링 가격 범위 (변동성)
    const ranges = [];
    for (let i = 4; i < n; i++) {
        const s = recent.slice(i - 4, i + 1);
        const h = Math.max(...s.map(d => d.high));
        const l = Math.min(...s.map(d => d.low));
        const avg = s.reduce((a, d) => a + d.close, 0) / 5;
        if (avg > 0) ranges.push((h - l) / avg);
    }
    const r = ranges.length;
    if (r < 12) return { vcp: false, vcpScore: 0 };

    // 3구간 분할 — 변동성 수축 확인
    const t = Math.floor(r / 3);
    const early = ranges.slice(0, t).reduce((a, b) => a + b, 0) / t;
    const mid = ranges.slice(t, 2 * t).reduce((a, b) => a + b, 0) / t;
    const late = ranges.slice(2 * t).reduce((a, b) => a + b, 0) / (r - 2 * t);
    const contracting = early > mid && mid > late;

    // 거래량 수축
    const earlyVol = recent.slice(0, 20).reduce((a, d) => a + d.volume, 0) / 20;
    const lateVol = recent.slice(-20).reduce((a, d) => a + d.volume, 0) / 20;
    const volDecline = earlyVol > 0 && lateVol < earlyVol * 0.85;

    // 가격 > MA50
    const ma50 = scrSMA(closes, 50);
    const price = closes[closes.length - 1];
    const aboveMa50 = ma50 !== null && price > ma50;

    // 현재 변동폭이 타이트 (< 4%)
    const tightNow = late < 0.04;

    let score = 0;
    if (contracting) score += 40;
    if (volDecline) score += 30;
    if (aboveMa50) score += 20;
    if (tightNow) score += 10;

    return { vcp: contracting && volDecline && aboveMa50, vcpScore: score };
}

// RS Line vs SPY — 상대강도선
function scrRsVsSpy(closes, spyCloses) {
    if (!spyCloses || spyCloses.length < 20 || closes.length < 20) {
        return { rsMakingHigh: false, rsVsSpy: 50 };
    }
    const len = Math.min(closes.length, spyCloses.length, 60);
    const sc = closes.slice(-len);
    const spy = spyCloses.slice(-len);

    // RS 라인 (주식/SPY 상대 수익률)
    const rsLine = sc.map((c, i) => spy[i] > 0 ? (c / sc[0]) / (spy[i] / spy[0]) : 1);
    const curRs = rsLine[rsLine.length - 1];
    const rsMakingHigh = curRs >= Math.max(...rsLine.slice(-20));

    // RS vs SPY 0~100 점수 (12개월 기준)
    const len12 = Math.min(closes.length, spyCloses.length, 253);
    const stockRet = closes[closes.length - len12] > 0
        ? (closes[closes.length - 1] / closes[closes.length - len12]) - 1 : 0;
    const spyRet = spyCloses[spyCloses.length - len12] > 0
        ? (spyCloses[spyCloses.length - 1] / spyCloses[spyCloses.length - len12]) - 1 : 0;
    const rsVsSpy = Math.min(100, Math.max(0, Math.round(50 + (stockRet - spyRet) * 100)));

    return { rsMakingHigh, rsVsSpy };
}

// Pocket Pivot — 10일 하락일 최대 거래량 돌파
function scrPocketPivot(ohlcv) {
    if (ohlcv.length < 15) return false;
    const last = ohlcv[ohlcv.length - 1];
    const prev10 = ohlcv.slice(-11, -1);
    const downVols = prev10.filter(d => d.close < d.open).map(d => d.volume);
    if (downVols.length === 0) return false;
    const maxDownVol = Math.max(...downVols);
    const ma10Close = prev10.reduce((a, d) => a + d.close, 0) / prev10.length;
    return last.volume > maxDownVol && last.close > ma10Close && last.close >= last.open;
}

// 돌파 임박 — 52주 고점 3% 이내 + 거래량 40% 이상 증가
function scrNearBreakout(closes, ohlcv) {
    if (ohlcv.length < 51) return false;
    const price = closes[closes.length - 1];
    const h52 = Math.max(...closes.slice(-252));
    if (h52 <= 0) return false;
    const nearHigh = price >= h52 * 0.97;
    const lastVol = ohlcv[ohlcv.length - 1].volume;
    const avgVol50 = ohlcv.slice(-51, -1).reduce((a, d) => a + d.volume, 0) / 50;
    return nearHigh && avgVol50 > 0 && lastVol > avgVol50 * 1.4;
}

// 펀더멘탈 조회 (Finviz 스크래핑, 티커별 dayCache 24h)
async function scrFetchFinviz(ticker) {
    const cKey = `fviz2_${ticker}`;
    const cached = dayCache.get(cKey);
    if (cached) return cached;
    try {
        const r = await axios.get(`https://finviz.com/quote.ashx?t=${ticker}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "Referer": "https://finviz.com/",
                "Accept": "text/html,application/xhtml+xml",
            },
            timeout: 8000,
        });
        const html = r.data;
        // 3가지 HTML 패턴 처리:
        //   1) <b>value</b>
        //   2) <b><span class="...">value</span></b>
        //   3) <a href="..."><b>value</b></a>  (Short Float 등)
        // 라벨 셀도 <a> 안에 있을 수 있음: Short Float</a></td>
        const get = (label) => {
            const esc = label.replace(/[/()]/g, "\\$&");
            // Finviz HTML 구조 (2025~):
            // >LABEL(</a>)?</div></td><td...><div class="snapshot-td-content">(<a...>)?<b>(<span...>)?VALUE
            const m = html.match(new RegExp(
                `>${esc}(?:<\\/a>)?<\\/div><\\/td><td[^>]*><div class="snapshot-td-content">(?:<a[^>]*>)?<b>(?:<span[^>]*>)?([\\-+\\d\\.%NA]+)`
            ));
            return m?.[1] ?? null;
        };
        const pn = (s) => s ? (parseFloat(s) || null) : null;
        const result = {
            pe:         pn(get("P/E")),
            fpe:        pn(get("Forward P/E")),
            epsThisY:   pn(get("EPS this Y")),   // 올해 연간 EPS 성장률 %
            epsNextY:   pn(get("EPS next Y")),   // 내년 EPS 성장률 %
            eps5Y:      pn(get("EPS next 5Y")),  // 향후 5년 연평균 %
            salesQQ:    pn(get("Sales Q/Q")),    // 최근 분기 매출 성장 yoy %
            instTrans:  pn(get("Inst Trans")),   // 기관 순매수/매도 분기 변화 %
            shortFloat: pn(get("Short Float")),  // 공매도 비율 %
            roe:        pn(get("ROE")),
        };
        dayCache.set(cKey, result, 86400);
        return result;
    } catch(e) {
        console.error(`Finviz ${ticker}:`, e.message);
        return { pe: null, fpe: null, epsThisY: null, epsNextY: null, eps5Y: null, salesQQ: null, instTrans: null, shortFloat: null, roe: null };
    }
}

// SPY 타이밍 모델
async function scrSpyModel() {
    const cKey = "spy_timing_v2";
    const cached = screenerCache.get(cKey);
    if (cached) return cached;
    try {
        const { ohlcv } = await fetchYFChart("SPY", 300);
        const spyCloses = ohlcv.map(d => d.close);
        const spyPrice = spyCloses[spyCloses.length - 1];
        const spyMa50 = scrSMA(spyCloses, 50) || 0;
        const spyMa150 = scrSMA(spyCloses, 150) || 0;
        const spyMa200 = scrSMA(spyCloses, 200) || 0;
        const spySlope = scrMA200Slope(spyCloses) || 0;
        let status = "Bear";
        if (spyPrice > spyMa200 && spySlope > 0 && spyPrice > spyMa50) status = "Bull";
        else if (spyPrice > spyMa200) status = "Caution";
        const result = {
            status,
            spyPrice: Math.round(spyPrice * 100) / 100,
            spyMa50: Math.round(spyMa50 * 100) / 100,
            spyMa150: Math.round(spyMa150 * 100) / 100,
            spyMa200: Math.round(spyMa200 * 100) / 100,
            spySlope: Math.round(spySlope * 100) / 100,
            spyCloses,
        };
        screenerCache.set(cKey, result, 3600);
        return result;
    } catch (e) {
        console.error("SPY timing model:", e.message);
        return { status: "Unknown", spyCloses: [] };
    }
}

// SSE 스크리너 엔드포인트
app.get("/api/screener/run", async (req, res) => {
    const universe = req.query.universe || "nasdaq100";
    const minPrice = parseFloat(req.query.minPrice || "0");
    const maxPrice = parseFloat(req.query.maxPrice || "99999");
    const limit = Math.min(parseInt(req.query.limit || "200"), 500);
    const custom = req.query.custom || "";
    let tickers;
    if (universe === "russell2000") {
        tickers = (await scrFetchRussell2000()).slice(0, limit);
    } else {
        tickers = scrGetTickers(universe, custom).slice(0, limit);
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (event, data) => {
        if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // SPY 타이밍 사전 조회 (펀더멘탈은 티커 루프 안에서 per-ticker 조회)
    let spyModel = { status: "Unknown", spyCloses: [] };
    try {
        spyModel = await scrSpyModel();
    } catch (e) {
        console.error("Pre-fetch:", e.message);
    }

    // 마켓 타이밍 먼저 전송
    send("marketStatus", {
        status: spyModel.status,
        spyPrice: spyModel.spyPrice,
        spyMa50: spyModel.spyMa50,
        spyMa200: spyModel.spyMa200,
        spySlope: spyModel.spySlope,
    });

    const spyCloses = spyModel.spyCloses || [];
    const total = tickers.length;
    let passing = 0;

    for (let i = 0; i < tickers.length; i++) {
        if (res.destroyed) break;
        const ticker = tickers[i];
        send("progress", { ticker, i, total, passing });
        try {
            const cKey = `scr4_${ticker}`;
            let row = screenerCache.get(cKey);
            if (!row) {
                const { ohlcv } = await fetchYFChart(ticker, 560);
                if (!ohlcv || ohlcv.length < 50) continue;
                const closes = ohlcv.map(d => d.close);
                const price = closes[closes.length - 1];

                // 1단계: 가격 필터 (네트워크 호출 전에 조기 탈락)
                if (price < minPrice || price > maxPrice) continue;

                // 2단계: 기술적 분석 (로컬 계산)
                const tpr = scrTPR(closes);
                const rpr = scrRPR(closes);
                const rs12m = scrRS12m(closes);
                const stage2 = scrIsStage2(closes);
                const stage2Loose = scrIsStage2Loose(closes);
                const stage2VeryLoose = scrIsStage2VeryLoose(closes);

                const { vcp, vcpScore } = scrVCP(closes, ohlcv);
                const { rsMakingHigh, rsVsSpy } = scrRsVsSpy(closes, spyCloses);
                const pocketPivot = scrPocketPivot(ohlcv);
                const nearBreakout = scrNearBreakout(closes, ohlcv);

                // 3단계: Finviz 펀더멘탈
                // Russell 2000은 기술적 필터 후에만 호출 (1900종목 rate limit 방지)
                // 그 외 소규모 유니버스(100~200종목)는 항상 호출
                const techQualified = universe !== "russell2000" ||
                    stage2Loose || rpr >= 60 || vcp || nearBreakout;
                let f = { pe: null, fpe: null, epsThisY: null, epsNextY: null, eps5Y: null, salesQQ: null, instTrans: null, shortFloat: null, roe: null };
                if (techQualified) {
                    f = await scrFetchFinviz(ticker);
                    await new Promise(r => setTimeout(r, 120 + Math.random() * 80));
                }

                // 펀더멘탈 등급: 올해 EPS 20%↑ + 매출 10%↑ + ROE 15%↑
                const fundGrade = (
                    f.epsThisY !== null && f.epsThisY >= 20 &&
                    f.salesQQ  !== null && f.salesQQ  >= 10 &&
                    f.roe      !== null && f.roe      >= 15
                );

                row = {
                    ticker,
                    price: Math.round(price * 100) / 100,
                    tpr, rpr,
                    rs12m: rs12m !== null ? Math.round(rs12m * 10) / 10 : null,
                    rsVsSpy, vcpScore,
                    stage2, stage2Loose, stage2VeryLoose,
                    bnb: price >= 10 && stage2 && ["A+", "A", "B"].includes(tpr),
                    tprA: ["A+", "A"].includes(tpr),
                    momentum: price >= 10 && stage2 && rpr >= 70,
                    qualifier: price >= 2 && stage2Loose,
                    top5Rpr: rpr >= 80,
                    vcp, rsMakingHigh,
                    pocketPivot, nearBreakout,
                    fundGrade,
                    pe: f.pe, fpe: f.fpe,
                    epsThisY: f.epsThisY, epsNextY: f.epsNextY, eps5Y: f.eps5Y,
                    salesQQ: f.salesQQ, instTrans: f.instTrans, shortFloat: f.shortFloat,
                    roe: f.roe,
                };
                screenerCache.set(cKey, row);
            }
            if (row.price < minPrice || row.price > maxPrice) continue;
            passing++;
            send("result", row);
        } catch (_e) {
            // skip failed tickers silently
        }
        await new Promise(r => setTimeout(r, 60 + Math.random() * 40));
    }

    send("done", { total, passing });
    res.end();
});

// ─── 라우트 ──────────────────────────────────────────────────

// 전체 시세 (실시간)
app.get("/api/quotes", async (req, res) => {
    try {
        const tickers = (req.query.tickers || "").split(",").filter(Boolean);
        if (tickers.length === 0) return res.status(400).json({ error: "tickers 파라미터가 없습니다" });
        if (tickers.length > 200) return res.status(400).json({ error: "ticker는 최대 200개까지 요청 가능합니다" });

        // Finnhub 토큰 없으면 Yahoo Finance fallback
        if (!FINNHUB_TOKEN) {
            const cKey = `quotes_yf_${tickers.join(",")}`;
            const cached = cache.get(cKey);
            if (cached) return res.json(cached);
            const result = await fetchYFQuotesBatch(tickers);
            cache.set(cKey, result, 60);
            return res.json(result);
        }

        // Finnhub WebSocket 구독 등록
        finnhubSubscribe(tickers);

        // Finnhub dayCache + WS live price 조합 반환
        // (dayCache 웜업 중인 티커는 WS price만, daily=0으로 반환)
        const results = {};
        for (const t of tickers) {
            const live = liveQuotes.get(t);
            const liveValid = live && (Date.now() - live.ts) < 60000;
            const base = dayCache.get(`fq_${t}`); // REST 없이 캐시만 확인

            const price = liveValid ? live.price : (base?.price || 0);
            const prevClose = base?.prevClose || 0;
            const open = base?.open || 0;

            results[t] = {
                price: Math.round(price * 100) / 100,
                daily: prevClose > 0 ? Math.round(((price - prevClose) / prevClose) * 10000) / 100
                    : (base?.changePercent || 0),
                intra: open > 0 ? Math.round(((price - open) / open) * 10000) / 100 : 0,
                volume: live?.volume || 0,
            };
        }

        cache.set(`quotes_fh_${tickers.join(",")}`, results, 60);
        res.json(results);
    } catch (e) {
        console.error("/api/quotes:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// OHLCV 지표 계산 (Finnhub candles)
app.get("/api/indicators/:ticker", async (req, res) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const cacheKey = `ind_${ticker}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        // Yahoo Finance v8 chart (Finnhub 무료는 candle 미지원)
        const { ohlcv } = await fetchYFChart(ticker, 90);

        if (!ohlcv || ohlcv.length < 10) return res.status(404).json({ error: "Not enough data" });

        const closes = ohlcv.map(d => d.close);
        const last = ohlcv[ohlcv.length - 1];

        const ema20 = calcEMA(closes, 20);
        const ema50 = calcEMA(closes, 50);
        let abc = "B";
        if (last.close > ema20 && ema20 > ema50) abc = "A";
        else if (last.close < ema20 && ema20 < ema50) abc = "C";

        const atr = calcATR(ohlcv);
        const sma50 = closes.slice(-Math.min(50, closes.length)).reduce((a, b) => a + b, 0) / Math.min(50, closes.length);
        const distSma50Atr = atr ? Math.round(((last.close - sma50) / atr) * 100) / 100 : 0;
        const atrPct = atr ? Math.round((atr / last.close) * 1000) / 10 : 0;

        const rs20 = closes[Math.max(0, closes.length - 21)];
        const rs = Math.max(0, Math.min(100, Math.round(50 + ((last.close - rs20) / rs20) * 100 * 1.5)));

        const obv = calcOBV(ohlcv);
        const mfi = calcMFI(ohlcv);
        const vwapDev = calcVWAPDev(ohlcv);
        const adlTrend = calcADL(ohlcv);
        const orderDelta = calcOrderDelta(ohlcv);

        const close5d = closes[Math.max(0, closes.length - 6)];
        const close20d = closes[Math.max(0, closes.length - 21)];
        const fiveD = Math.round(((last.close - close5d) / close5d) * 10000) / 100;
        const twentyD = Math.round(((last.close - close20d) / close20d) * 10000) / 100;

        const varsChart = closes.slice(-20).map((c, i, arr) => i === 0 ? 0 : (c - arr[i - 1]) / arr[i - 1]);

        const rsi = calcRSI(closes);
        const bbPos = calcBBPos(closes);
        const volRatio = calcVolRatio(ohlcv);
        const sma200Dev = calcSMA200Dev(closes);
        const macdHist = calcMACDHist(closes);
        const dailyVol = ohlcv[ohlcv.length - 1].volume;
        const weeklyVol = ohlcv.slice(-5).reduce((a, d) => a + (d.volume || 0), 0);
        const monthlyVol = ohlcv.slice(-20).reduce((a, d) => a + (d.volume || 0), 0);

        // Finviz 펀더멘탈 (dayCache 24h)
        const fv = await scrFetchFinviz(ticker);

        const result = { abc, distSma50Atr, atrPct, rs, obv, mfi, vwapDev, adlTrend, orderDelta, fiveD, twentyD, varsChart, rsi, bbPos, volRatio, sma200Dev, macdHist, dailyVol, weeklyVol, monthlyVol,
            pe: fv.pe, fpe: fv.fpe, epsThisY: fv.epsThisY, epsNextY: fv.epsNextY, eps5Y: fv.eps5Y,
            salesQQ: fv.salesQQ, instTrans: fv.instTrans, shortFloat: fv.shortFloat, roe: fv.roe };
        cache.set(cacheKey, result);
        res.json(result);
    } catch (e) {
        console.error(`/api/indicators/${req.params.ticker}:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

// 옵션 체인 (Yahoo Finance - Finnhub 무료는 옵션 미지원)
app.get("/api/options/:ticker", async (req, res) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const cacheKey = `opt_${ticker}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        const auth = await getYFAuth();
        const r = await axios.get(`https://query1.finance.yahoo.com/v7/finance/options/${ticker}`, {
            headers: auth.cookie ? { ...YF_HEADERS, Cookie: auth.cookie } : YF_HEADERS,
            params: auth.crumb ? { crumb: auth.crumb } : {},
            timeout: 10000,
        });
        const chain = r.data?.optionChain?.result?.[0]?.options?.[0];
        let putVol = 0, callVol = 0, gamma = 0;
        if (chain) {
            for (const c of (chain.calls || [])) { callVol += c.volume || 0; gamma += (c.impliedVolatility || 0) * (c.volume || 0) * 0.0001; }
            for (const p of (chain.puts || [])) { putVol += p.volume || 0; gamma -= (p.impliedVolatility || 0) * (p.volume || 0) * 0.0001; }
        }
        const pcr = callVol > 0 ? Math.round((putVol / callVol) * 100) / 100 : 1.0;
        const result = { pcr, gamma: Math.max(-2, Math.min(2, Math.round(gamma * 100) / 100)), putVol, callVol };
        cache.set(cacheKey, result);
        res.json(result);
    } catch (e) {
        console.error(`/api/options/${req.params.ticker}:`, e.message);
        res.json({ pcr: 1.0, gamma: 0, putVol: 0, callVol: 0 });
    }
});

// 시장 광폭 (Yahoo Finance - Finnhub에 지수 브레드스 없음)
app.get("/api/breadth", async (req, res) => {
    try {
        const cacheKey = "breadth";
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        const [r50, r200] = await Promise.allSettled([fetchYFChart("^SPXA50R", 5), fetchYFChart("^SPXA200R", 5)]);
        const getLastClose = (r, fallback) => {
            if (r.status !== "fulfilled") return fallback;
            const { ohlcv, meta } = r.value;
            return ohlcv.length > 0
                ? Math.round(ohlcv[ohlcv.length - 1].close)
                : Math.round(meta.regularMarketPrice || fallback);
        };
        const result = { breadth50: getLastClose(r50, 50), breadth200: getLastClose(r200, 50) };
        cache.set(cacheKey, result);
        res.json(result);
    } catch (e) {
        res.json({ breadth50: 50, breadth200: 50 });
    }
});

// COT 근사 + 공매도 비율 (Yahoo Finance quoteSummary)
app.get("/api/cot/:ticker", async (req, res) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const cacheKey = `cot_${ticker}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json(cached);

        const r = await axios.get(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`, {
            headers: YF_HEADERS,
            params: { modules: "defaultKeyStatistics" },
            timeout: 10000,
        });
        const ks = r.data?.quoteSummary?.result?.[0]?.defaultKeyStatistics || {};
        const instPct = ks.heldPercentInstitutions?.raw || 0.7;
        const shortRaw = ks.shortPercentOfFloat?.raw;
        const result = {
            cotNet: Math.round((instPct - 0.7) * 200000),
            fundFlow: Math.round((instPct - 0.65) * 1000),
            shortInt: shortRaw != null ? Math.round(shortRaw * 1000) / 10 : null,
        };
        cache.set(cacheKey, result, 3600);
        res.json(result);
    } catch (e) {
        res.json({ cotNet: 0, fundFlow: 0, shortInt: null });
    }
});

// WebSocket 연결 상태 확인 포함한 헬스체크
app.get("/api/health", (_, res) => res.json({
    ok: true,
    version: "v20260415",
    time: new Date().toISOString(),
    finnhub: {
        token: !!FINNHUB_TOKEN,
        ws: fws ? ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][fws.readyState] : "NONE",
        liveSymbols: liveQuotes.size,
        subscribed: wsSubscribed.size,
    },
}));

// ─── M-Score: 시장 타이밍 점수 ───────────────────────────────
app.get("/api/mscore", async (req, res) => {
    try {
        const cKey = "mscore_v1";
        const cached = cache.get(cKey);
        if (cached) return res.json(cached);

        // SPY data via scrSpyModel (reuse cached)
        const spyModel = await scrSpyModel();
        const spyCloses = spyModel.spyCloses || [];
        const spyPrice = spyModel.spyPrice || 0;
        const spyMa50 = spyModel.spyMa50 || 0;
        const spyMa150 = spyModel.spyMa150 || 0;
        const spyMa200 = spyModel.spyMa200 || 0;
        const spySlope = spyModel.spySlope || 0;

        // QQQ data
        let qqqPrice = 0, qqqMa50 = 0, qqqMa150 = 0, qqqMa200 = 0, qqqChange1d = 0;
        let qqqCloses = [];
        try {
            const qData = await fetchYFChart("QQQ", 300);
            qqqCloses = qData.ohlcv.map(d => d.close);
            qqqPrice = qqqCloses[qqqCloses.length - 1];
            qqqMa50 = scrSMA(qqqCloses, 50) || 0;
            qqqMa150 = scrSMA(qqqCloses, 150) || 0;
            qqqMa200 = scrSMA(qqqCloses, 200) || 0;
            if (qqqCloses.length >= 2)
                qqqChange1d = Math.round(((qqqPrice - qqqCloses[qqqCloses.length - 2]) / qqqCloses[qqqCloses.length - 2]) * 10000) / 100;
        } catch (e) { console.error("QQQ fetch:", e.message); }

        // SPY 1d change
        let spyChange1d = 0;
        if (spyCloses.length >= 2)
            spyChange1d = Math.round(((spyPrice - spyCloses[spyCloses.length - 2]) / spyCloses[spyCloses.length - 2]) * 10000) / 100;

        // 1. MA Position (SPY): price > SMA50 > SMA150 > SMA200
        let maPosition = -20;
        if (spyMa50 > 0 && spyMa150 > 0 && spyMa200 > 0) {
            if (spyPrice > spyMa50 && spyMa50 > spyMa150 && spyMa150 > spyMa200) maPosition = 25;
            else if (spyPrice > spyMa50 && spyMa50 > spyMa150) maPosition = 15;
            else if (spyPrice > spyMa200) maPosition = 5;
        }

        // 2. MA200 기울기 (최근 21일 기울기 양수면 +10)
        const ma200Slope = spySlope > 0 ? 10 : 0;

        // 3. 광폭지수
        let breadthScore = 0;
        let spxa200r = 50, spxa50r = 50;
        try {
            const bCached = cache.get("breadth");
            if (bCached) {
                spxa200r = bCached.breadth200 || 50;
                spxa50r = bCached.breadth50 || 50;
            } else {
                const [r50, r200] = await Promise.allSettled([fetchYFChart("^SPXA50R", 5), fetchYFChart("^SPXA200R", 5)]);
                if (r200.status === "fulfilled" && r200.value.ohlcv.length > 0)
                    spxa200r = r200.value.ohlcv[r200.value.ohlcv.length - 1].close;
                if (r50.status === "fulfilled" && r50.value.ohlcv.length > 0)
                    spxa50r = r50.value.ohlcv[r50.value.ohlcv.length - 1].close;
            }
        } catch (e) { /* fallback 50 */ }
        if (spxa200r > 60) breadthScore = 15;
        else if (spxa200r > 40) breadthScore = 5;
        else if (spxa200r < 30) breadthScore = -15;

        // 4. 52주 고점 대비
        let vs52wHigh = 0;
        if (spyCloses.length >= 252) {
            const h52 = Math.max(...spyCloses.slice(-252));
            if (h52 > 0) {
                const ratio = spyPrice / h52;
                if (ratio >= 0.95) vs52wHigh = 10;
                else if (ratio < 0.75) vs52wHigh = -10;
            }
        }

        // 5. QQQ vs SPY 상대강도 (최근 20일 수익률)
        let qqqVsSpy = 0;
        if (qqqCloses.length >= 21 && spyCloses.length >= 21) {
            const qRet = (qqqPrice - qqqCloses[qqqCloses.length - 21]) / qqqCloses[qqqCloses.length - 21];
            const sRet = (spyPrice - spyCloses[spyCloses.length - 21]) / spyCloses[spyCloses.length - 21];
            if (qRet > sRet) qqqVsSpy = 5;
        }

        const score = maPosition + ma200Slope + breadthScore + vs52wHigh + qqqVsSpy;
        let status, label, color;
        if (score >= 50)       { status = "BULL";    label = "공격적 매수 가능";  color = "#10b981"; }
        else if (score >= 20)  { status = "CAUTION"; label = "선별적 매수";       color = "#f59e0b"; }
        else if (score >= -19) { status = "NEUTRAL"; label = "관망";              color = "#9ca3af"; }
        else                   { status = "BEAR";    label = "현금 비중 확대";    color = "#ef4444"; }

        const result = {
            score,
            status,
            label,
            color,
            details: {
                maPosition,
                ma200Slope,
                breadth: breadthScore,
                vs52wHigh,
                qqqVsSpy,
                breadthRaw: { spxa200r: Math.round(spxa200r * 10) / 10, spxa50r: Math.round(spxa50r * 10) / 10 },
            },
            spy: { price: spyPrice, sma50: spyMa50, sma150: spyMa150, sma200: spyMa200, change1d: spyChange1d },
            qqq: { price: Math.round(qqqPrice * 100) / 100, sma50: Math.round(qqqMa50 * 100) / 100, sma150: Math.round(qqqMa150 * 100) / 100, sma200: Math.round(qqqMa200 * 100) / 100, change1d: qqqChange1d },
            updatedAt: new Date().toISOString(),
        };
        cache.set(cKey, result, 300);
        res.json(result);
    } catch (e) {
        console.error("/api/mscore:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── Triggers: 진입 트리거 감지 ───────────────────────────────
app.get("/api/triggers", async (req, res) => {
    try {
        const cKey = "triggers_v1";
        const cached = cache.get(cKey);
        if (cached) return res.json(cached);

        const tickers = scrGetTickers("nasdaq100", "");
        const cachedCount = tickers.filter(t => screenerCache.get(`scr4_${t}`)).length;

        // 스크리너 캐시가 없으면 기술 분석만 직접 실행 (Finviz 제외, 빠른 폴백)
        if (cachedCount === 0) {
            console.log("[triggers] 캐시 없음 — nasdaq100 기술 분석 폴백 실행");
            let spyCloses = null;
            try {
                const spyModel = await scrSpyModel();
                if (spyModel?.spyCloses?.length) spyCloses = spyModel.spyCloses;
            } catch (_) {}

            for (const ticker of tickers) {
                try {
                    const { ohlcv } = await fetchYFChart(ticker, 400);
                    if (!ohlcv || ohlcv.length < 50) continue;
                    const closes = ohlcv.map(d => d.close);
                    const price = closes[closes.length - 1];
                    if (price < 5) continue;

                    const tpr = scrTPR(closes);
                    const rpr = scrRPR(closes);
                    const rs12m = scrRS12m(closes);
                    const stage2 = scrIsStage2(closes);
                    const stage2Loose = scrIsStage2Loose(closes);
                    const stage2VeryLoose = scrIsStage2VeryLoose(closes);
                    const { vcp, vcpScore } = scrVCP(closes, ohlcv);
                    const { rsMakingHigh, rsVsSpy } = scrRsVsSpy(closes, spyCloses);
                    const pocketPivot = scrPocketPivot(ohlcv);
                    const nearBreakout = scrNearBreakout(closes, ohlcv);

                    screenerCache.set(`scr4_${ticker}`, {
                        ticker, price: Math.round(price * 100) / 100,
                        tpr, rpr,
                        rs12m: rs12m !== null ? Math.round(rs12m * 10) / 10 : null,
                        rsVsSpy, vcpScore,
                        stage2, stage2Loose, stage2VeryLoose,
                        bnb: price >= 10 && stage2 && ["A+", "A", "B"].includes(tpr),
                        tprA: ["A+", "A"].includes(tpr),
                        momentum: price >= 10 && stage2 && rpr >= 70,
                        qualifier: price >= 2 && stage2Loose,
                        top5Rpr: rpr >= 80,
                        vcp, rsMakingHigh, pocketPivot, nearBreakout,
                        fundGrade: false,
                        pe: null, fpe: null, epsThisY: null, epsNextY: null,
                        eps5Y: null, salesQQ: null, instTrans: null, shortFloat: null, roe: null,
                    });
                    await new Promise(r => setTimeout(r, 80 + Math.random() * 40));
                } catch (_) {}
            }
            console.log("[triggers] 폴백 분석 완료");
        }

        const breakout52w = [], vcpComplete = [], rsMakingHighArr = [], pocketPivotArr = [];

        for (const ticker of tickers) {
            const row = screenerCache.get(`scr4_${ticker}`);
            if (!row) continue;
            const { price, vcpScore, vcp, nearBreakout, rsMakingHigh, pocketPivot, stage2, rs12m, rsVsSpy, tpr } = row;

            if (nearBreakout)
                breakout52w.push({ ticker, price: price || 0, rs12m: rs12m || 0, tpr: tpr || "D" });
            if ((vcp || vcpScore >= 60) && nearBreakout)
                vcpComplete.push({ ticker, price: price || 0, vcpScore: vcpScore || 0, nearBreakout, rs12m: rs12m || 0 });
            if (rsMakingHigh && stage2)
                rsMakingHighArr.push({ ticker, price: price || 0, rs12m: rs12m || 0, rsVsSpy: rsVsSpy || 50, stage2 });
            if (pocketPivot && stage2)
                pocketPivotArr.push({ ticker, price: price || 0, stage2, rs12m: rs12m || 0 });
        }

        const finalCached = tickers.filter(t => screenerCache.get(`scr4_${t}`)).length;
        const result = {
            breakout52w,
            vcpComplete,
            rsMakingHigh: rsMakingHighArr,
            pocketPivot: pocketPivotArr,
            updatedAt: new Date().toISOString(),
            totalCount: new Set([...breakout52w, ...vcpComplete, ...rsMakingHighArr, ...pocketPivotArr].map(i => i.ticker)).size,
            cacheStats: { cached: finalCached, total: tickers.length },
        };
        cache.set(cKey, result, 300);
        res.json(result);
    } catch (e) {
        console.error("/api/triggers:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── MiniMax AI 코멘트 (네이티브 API) ───────────────────────────
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "sk-cp-Et6WwIwpNDLoamxFDELs67MlNEvm-P0HXQb7qY6SJ2vRbtpADesfrW9SfRnkJmBpPJ90-8s1KYenXq_OkFejcSp0KNuxy4KBJOwwdrTts-Fr3hS1xRHBJQU";
const MINIMAX_NATIVE = "https://api.minimax.io/v1/text/chatcompletion_v2";

async function callMiniMax(instruction, userPrompt, maxTokens = 500) {
    const res = await axios.post(
        MINIMAX_NATIVE,
        {
            model: "MiniMax-M2.7",
            max_tokens: maxTokens,
            messages: [
                { role: "system", content: "반드시 한국어로만 답변하세요. 한자(중국어 간체/번체) 절대 사용 금지. " + instruction },
                { role: "user", content: userPrompt },
            ],
        },
        {
            headers: {
                "Authorization": `Bearer ${MINIMAX_API_KEY}`,
                "content-type": "application/json",
            },
            timeout: 30000,
        }
    );
    const text = res.data.choices?.[0]?.message?.content || "";
    // 혹시 남아있는 CJK 한자 제거
    return text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, "").trim();
}

// GET /api/ai/comment/:ticker — 종목 개별 분석 (24h 캐시)
app.get("/api/ai/comment/:ticker", async (req, res) => {
    try {
        const ticker = req.params.ticker.toUpperCase();
        const cKey = `ai_comment_${ticker}`;
        const cached = dayCache.get(cKey);
        if (cached) return res.json(cached);

        // 기존 스크리너 캐시 활용
        let scrData = null;
        for (const u of ["nasdaq100", "sp500", "sp100", "russell2000"]) {
            const d = cache.get(`scr4_${u}`);
            if (d?.results) {
                scrData = d.results.find(r => r.ticker === ticker);
                if (scrData) break;
            }
        }

        // 지표 데이터 보조 fetch
        let indData = cache.get(`ind_${ticker}`);

        const context = scrData
            ? `종목: ${ticker}, 현재가: $${scrData.price}, RS: ${scrData.rs12m}, Stage2: ${scrData.stage2}, VCP: ${scrData.vcpScore >= 3}, 포켓피봇: ${scrData.pocketPivot}, 52주고점대비: ${scrData.from52wHigh ? (scrData.from52wHigh * 100).toFixed(1) + "%" : "N/A"}, 거래량비율: ${scrData.volRatio ? scrData.volRatio.toFixed(2) : "N/A"}x`
            : indData
            ? `종목: ${ticker}, RSI: ${indData.rsi?.toFixed(1)}, OBV추세: ${indData.obv}, RS(20일): ${indData.rs}, 5일수익률: ${indData.fiveD}%, 20일수익률: ${indData.twentyD}%`
            : `종목: ${ticker}`;

        const instruction = "다음 종목의 기술적 분석 코멘트를 80자 이내 한국어로 작성하세요. 핵심 신호 위주로 간결하게.";
        const comment = await callMiniMax(instruction, context, 300);
        const result = { ticker, comment, updatedAt: new Date().toISOString() };
        dayCache.set(cKey, result);
        res.json(result);
    } catch (e) {
        console.error("/api/ai/comment:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/ai/mscore-summary — M-Score 시황 요약 (5분 캐시)
app.get("/api/ai/mscore-summary", async (req, res) => {
    try {
        const cKey = "ai_mscore_summary";
        const cached = cache.get(cKey);
        if (cached) return res.json(cached);

        const mscore = cache.get("mscore_v1");
        if (!mscore) return res.status(503).json({ error: "M-Score 데이터 없음. /api/mscore 먼저 호출하세요." });

        const context = `M-Score: ${mscore.score}점 (${mscore.label}), SPY: $${mscore.spy?.price} (SMA200 ${mscore.spy?.sma200}), QQQ: $${mscore.qqq?.price}, 광폭지수(SPXA200R): ${mscore.details?.breadthRaw?.spxa200r?.toFixed(1)}%, MA포지션: ${mscore.details?.maPosition}점, 52주고점대비: ${mscore.details?.vs52wHigh}점`;

        const instruction = "현재 시장 상황을 150자 이내 한국어로 요약하세요. 투자자에게 실용적인 한 줄 조언을 포함하세요.";
        const summary = await callMiniMax(instruction, context, 400);
        const result = { summary, score: mscore.score, status: mscore.status, updatedAt: new Date().toISOString() };
        cache.set(cKey, result, 300);
        res.json(result);
    } catch (e) {
        console.error("/api/ai/mscore-summary:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/ai/portfolio-review — 포트폴리오 진단 (캐시 없음)
app.post("/api/ai/portfolio-review", async (req, res) => {
    try {
        const { holdings, mScore } = req.body;
        if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
            return res.status(400).json({ error: "holdings 배열 필요" });
        }

        const holdingsSummary = holdings.map(h =>
            `${h.ticker}: ${h.shares}주 @ $${h.avgCost} → 현재 $${h.currentPrice || "N/A"} (손익 ${h.pnlPct?.toFixed(1) || "N/A"}%, 손절 $${h.stopLoss || "미설정"})`
        ).join("\n");

        const context = `시장상태: ${mScore ? `M-Score ${mScore.score}점 (${mScore.label})` : "정보없음"}\n보유종목:\n${holdingsSummary}`;

        const instruction = "포트폴리오를 진단하고 300자 이내 한국어로 리포트하세요. 종목별 1줄 코멘트 + 전체 위험도(0-100점) + 핵심 조언을 포함하세요.";
        const review = await callMiniMax(instruction, context, 800);
        res.json({ review, updatedAt: new Date().toISOString() });
    } catch (e) {
        console.error("/api/ai/portfolio-review:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── 네이버증권 테마 스크래핑 ─────────────────────────────────
import * as cheerio from "cheerio";
import iconv from "iconv-lite";

const themeCache = new NodeCache({ stdTTL: 300 }); // 5분 캐시

async function fetchNaverPage(url) {
    const r = await axios.get(url, {
        responseType: "arraybuffer",
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
        timeout: 10000,
    });
    return iconv.decode(Buffer.from(r.data), "euc-kr");
}

function parseRate(text) {
    const s = (text || "").replace(/,/g, "").replace(/%/g, "").replace(/\s/g, "");
    return parseFloat(s) || 0;
}

async function scrapeNaverThemes() {
    const seen = new Set();
    const themes = [];
    for (let page = 1; page <= 8; page++) {
        try {
            const html = await fetchNaverPage(`https://finance.naver.com/sise/theme.naver?&page=${page}`);
            const $ = cheerio.load(html);
            let newCount = 0;
            $("table.type_1 tr").each((_, row) => {
                const tds = $(row).find("td");
                if (!tds.length) return;
                const a = $(tds[0]).find("a");
                if (!a.length) return;
                const name = a.text().trim();
                if (!name || seen.has(name)) return;
                seen.add(name);
                const href = a.attr("href") || "";
                const no = href.split("no=")[1] || "";
                const rateD1 = parseRate($(tds[1]).text());
                const rate3d = parseRate($(tds[2]).text());
                const up   = $(tds[4]).text().trim();
                const flat = $(tds[5]).text().trim();
                const down = $(tds[6]).text().trim();
                themes.push({ name, no, href, rate_d1: rateD1, rate_3d: rate3d, up, flat, down });
                newCount++;
            });
            if (newCount === 0) break;
            await new Promise(r => setTimeout(r, 100));
        } catch (e) {
            console.error(`naver theme page ${page}:`, e.message);
            break;
        }
    }
    themes.sort((a, b) => b.rate_d1 - a.rate_d1);
    return themes;
}

async function scrapeThemeStocks(no, limit = 8) {
    try {
        const html = await fetchNaverPage(
            `https://finance.naver.com/sise/sise_group_detail.naver?type=theme&no=${no}`
        );
        const $ = cheerio.load(html);
        const stocks = [];
        $("table.type_5 tr").each((_, row) => {
            if (stocks.length >= limit) return false;
            const tds = $(row).find("td");
            if (!tds.length) return;
            const a = $(tds[0]).find("a");
            if (!a.length) return;
            const name = a.text().trim().replace(/\*/g, "");
            const href2 = a.attr("href") || "";
            const code = href2.split("code=")[1] || "";
            const price = parseInt(($(tds[2]).text().replace(/,/g, "") || "0")) || 0;
            const pct = parseRate($(tds[4]).text());
            stocks.push({ name, code, price, pct });
        });
        return stocks;
    } catch (e) {
        return [];
    }
}

// GET /api/naver-themes
app.get("/api/naver-themes", async (req, res) => {
    try {
        const cached = themeCache.get("themes");
        if (cached) return res.json(cached);

        const themes = await scrapeNaverThemes();

        // 상위 30개 구성종목 상세 수집
        const top30 = themes.slice(0, 30);
        for (const t of top30) {
            t.stocks = await scrapeThemeStocks(t.no, 8);
            await new Promise(r => setTimeout(r, 120));
        }
        // 나머지는 빈 배열
        themes.slice(30).forEach(t => { t.stocks = []; });

        const emerging = themes.filter(t => t.rate_d1 >= 5 && t.rate_3d >= 3);
        emerging.forEach(t => { t.emerging = true; });

        const result = {
            updatedAt: new Date().toISOString(),
            total: themes.length,
            emerging,
            themes: themes.slice(0, 50),
        };
        themeCache.set("themes", result);
        res.json(result);
    } catch (e) {
        console.error("/api/naver-themes:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/naver-themes/refresh  (강제 재수집)
app.get("/api/naver-themes/refresh", async (req, res) => {
    themeCache.del("themes");
    res.json({ status: "cache cleared", message: "다음 /api/naver-themes 요청 시 재수집됩니다" });
});

// GET /api/us-theme-quotes  (미국 테마 전광판용 야후파이낸스 시세 - 82그룹 전체)
const usThemeQuoteCache = new NodeCache({ stdTTL: 300 });

// crumb 인증을 사용하는 배치 조회 (일반 fetchYFQuotesBatch와 달리 cookie+crumb 포함)
async function fetchYFQuotesBatchAuth(tickers) {
    const auth = await getYFAuth();
    const fields = ["regularMarketPrice","regularMarketChangePercent","regularMarketOpen","regularMarketVolume","averageDailyVolume3Month"].join(",");
    const headers = { ...YF_HEADERS };
    if (auth.cookie) headers["Cookie"] = auth.cookie;
    const params = { symbols: tickers.join(","), fields };
    if (auth.crumb) params.crumb = auth.crumb;
    const r = await axios.get("https://query1.finance.yahoo.com/v7/finance/quote", {
        headers, params, timeout: 15000,
    });
    const out = {};
    for (const q of (r.data?.quoteResponse?.result || [])) {
        const price = q.regularMarketPrice || 0;
        const open  = q.regularMarketOpen  || price;
        const vol   = q.regularMarketVolume || 0;
        const avgV  = q.averageDailyVolume3Month || 1;
        out[q.symbol] = {
            price: Math.round(price * 100) / 100,
            daily: Math.round((q.regularMarketChangePercent || 0) * 100) / 100,
            intra: open > 0 ? Math.round(((price - open) / open) * 10000) / 100 : 0,
            volume: vol,
            darkpool: Math.round(Math.min(100, Math.max(0, (vol / Math.max(avgV, 1)) * 20)) * 10) / 10,
            shortInt: null, open, prevClose: 0,
        };
    }
    return out;
}

app.get("/api/us-theme-quotes", async (req, res) => {
    try {
        const cached = usThemeQuoteCache.get("quotes");
        if (cached) return res.json(cached);

        const tickers = [...new Set([
            // 반도체
            "NVDA","AMD","INTC","AVGO","MRVL","SMCI",
            "QCOM","ARM","ON","NXPI","STM","ADI","TXN",
            "WOLF","MCHP","SWKS","QRVO","MU","WDC","STX",
            "NTAP","AMAT","LRCX","KLAC","CAMT","ENTG","TSM","GFS",
            // AI/데이터
            "MSFT","GOOGL","META","AMZN","NOW","CRM","SNOW","DDOG",
            "PLTR","MDB","SOUN","TTD","SNAP","PINS","ISRG","PATH",
            "EQIX","DLR","VRT","CRWD","PANW","ZS","S","FTNT","IBM",
            // 클라우드/SaaS
            "HUBS","TEAM","ZM","BOX","DOCU","INTU","ADBE","BILL",
            "GTLB","TWLO","OKTA","SHOP","NET","AKAM","FSLY","DELL","CYBR",
            // 차세대기술
            "IONQ","RGTI","QUBT","QBTS","COIN","MARA","RIOT","SQ","PYPL",
            "V","MA","AXP","AFRM","UPST","AAPL","TSLA","MBLY",
            "RIVN","LCID","GM","F","AVAV","KTOS","ROK","TER",
            // 통신/네트워크
            "JNPR","ANET","CSCO","LITE","AAOI","CIEN","FN","COMM",
            "IRDM","GSAT","RKLB","VZ","T","TMUS","CMCSA",
            // 우주/방산
            "BA","LMT","LHX","NOC","RTX","GD","AXON","BWXT",
            // 헬스케어
            "JNJ","PFE","MRK","ABBV","BMY","AMGN","GILD","REGN","BIIB","VRTX",
            "CRSP","NTLA","BEAM","EDIT","MDT","SYK","BSX","EW",
            "DHR","TMO","ILMN","LH","DGX","TDOC","VEEV","UNH","CVS","HUM","CI","ELV",
            // 소비/플랫폼
            "EBAY","ETSY","WMT","NFLX","DIS","WBD","PARA","ROKU",
            "EA","TTWO","PG","KO","PEP","CL","LVMUY","RACE","EL","TPR","RL",
            // 산업/에너지
            "ENPH","FSLR","RUN","SEDG","CSIQ","GE","NEE","BEP",
            "ALB","SQM","QS","APTV","TE","CEG","CCJ","VST","NRG",
            "STEM","FLNC","PLUG","FCEL","BE","XOM","CVX","COP","OXY",
            "CAT","DE","VMC","MLM","JPM","BAC","GS","MS",
            "ACN","DXC","SAIC",
        ])];

        // 25개씩 순차 처리 (rate-limit 방지, crumb 인증 포함)
        const CHUNK = 25;
        const merged = {};
        for (let i = 0; i < tickers.length; i += CHUNK) {
            const chunk = tickers.slice(i, i + CHUNK);
            try {
                const result = await fetchYFQuotesBatchAuth(chunk);
                Object.assign(merged, result);
            } catch (e) {
                console.warn(`us-theme chunk[${i}] 실패:`, e.message);
            }
            if (i + CHUNK < tickers.length) await new Promise(r => setTimeout(r, 300));
        }
        usThemeQuoteCache.set("quotes", merged);
        res.json(merged);
    } catch (e) {
        console.error("/api/us-theme-quotes:", e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── 프로덕션: React 빌드 정적 파일 서빙 ───────────────────────
const clientDist = path.join(__dirname, "..", "dist");
app.use(express.static(clientDist));
app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
});

// ─── 전체 티커 (프런트와 동기화) ─────────────────────────────
const ALL_TICKERS = [
    "QQQE", "MGK", "QQQ", "IBIT", "RSP", "MDY", "IWM", "TLT", "SPY", "DIA",
    "IJS", "IJR", "IJT", "IJJ", "IJH", "IJK", "IVE", "IVV", "IVW",
    "XLK", "XLI", "XLC", "XLF", "XLU", "XLY", "XLRE", "XLP", "XLB", "XLE", "XLV",
    "SMH", "ARKK", "XBI", "KWEB", "XRT", "KRE", "ROBO", "AIQ", "IGV", "WCLD", "PAVE", "BLOK",
    "XOP", "FDN", "IBB", "GLD", "GDX", "USO", "XHB", "FNGS", "VNQ", "TAN", "URA", "LIT",
    "JETS", "KBE", "OIH", "SLV", "SOCL", "CIBR",
    "EWY", "EWJ", "MCHI", "FXI", "INDA", "EWZ", "EWG", "EFA", "IEUR", "EEM", "EWT", "ASHR", "TUR", "EWH", "ACWI",
];

app.listen(PORT, () => {
    console.log(`✅ Supply-Demand API Server → http://localhost:${PORT}`);
    if (FINNHUB_TOKEN) {
        console.log(`   Finnhub WebSocket 활성 | 실시간 체결가 수신 중`);
        // WebSocket 구독 (connectFinnhubWS 완료 후 구독 시도)
        setTimeout(() => finnhubSubscribe(ALL_TICKERS), 2000);
        // dayCache 백그라운드 웜업 (순차 1.1초 간격, 75 × 1.1s ≒ 82s)
        setImmediate(async () => {
            console.log(`   dayCache 웜업 시작 (${ALL_TICKERS.length}개 종목)`);
            for (const t of ALL_TICKERS) {
                try { await finnhubQuoteREST(t); } catch (e) {
                    console.error(`웜업 ${t}:`, e.message);
                }
            }
            console.log("   dayCache 웜업 완료");
        });
    } else {
        console.log(`   ⚠ FINNHUB_TOKEN 없음 → Yahoo Finance fallback 사용 중`);
        console.log(`   토큰 발급: https://finnhub.io/register → index.js 상단에 입력`);
    }
    console.log(`   Yahoo Finance: breadth, options, COT`);
});
