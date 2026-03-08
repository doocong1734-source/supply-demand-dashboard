import axios from "axios";

const r = await axios.get("https://finviz.com/quote.ashx?t=NVDA", {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": "https://finviz.com/",
        "Accept": "text/html,application/xhtml+xml",
    },
    timeout: 8000,
});

const html = r.data;

// 서버 코드와 동일한 get() 함수
const get = (label) => {
    const esc = label.replace(/[/()]/g, "\\$&");
    const m = html.match(new RegExp(
        `>${esc}<(?:\\/a><)?\\/td><td[^>]*>(?:<a[^>]*>)?<b>(?:<span[^>]*>)?([\\-+\\d\\.%NA]+)(?:<\\/span>)?<\\/b>`
    ));
    return m?.[1] ?? null;
};

console.log("=== Finviz 파싱 테스트 (NVDA) ===");
console.log("P/E:", get("P/E"));
console.log("ROE:", get("ROE"));
console.log("EPS this Y:", get("EPS this Y"));
console.log("EPS next Y:", get("EPS next Y"));
console.log("EPS next 5Y:", get("EPS next 5Y"));
console.log("Sales Q/Q:", get("Sales Q/Q"));
console.log("Inst Trans:", get("Inst Trans"));
console.log("Short Float:", get("Short Float"));

// 실패한 필드 디버깅
for (const label of ["ROE", "Sales Q/Q", "Inst Trans", "Short Float"]) {
    const esc = label.replace(/[/()]/g, "\\$&");
    const pattern = `>${esc}<(?:\\/a><)?\\/td><td[^>]*>(?:<a[^>]*>)?<b>(?:<span[^>]*>)?([\\-+\\d\\.%NA]+)(?:<\\/span>)?<\\/b>`;
    const idx = html.indexOf(label);
    if (idx >= 0) {
        const ctx = html.slice(idx - 1, idx + 180);
        console.log(`\n[${label}] HTML:`, JSON.stringify(ctx.slice(0, 180)));
        console.log(`[${label}] Pattern:`, pattern);
        const m = html.match(new RegExp(pattern));
        console.log(`[${label}] Match:`, m?.[1] ?? "NULL");
    }
}
