#!/usr/bin/env python3
"""Track returns of previously screened stocks after N days
Reads from Obsidian Vault/주식/스크리너백테스트/ CSV files
"""

import requests
import json
import csv
import os
import glob
from datetime import datetime, timedelta

BASE = os.environ.get("DASHBOARD_URL", "https://supply-demand-dashboard.onrender.com")
DATA_DIR = os.path.expanduser("~/Documents/Obsidian Vault/주식/스크리너백테스트")

def get_current_price(ticker):
    try:
        r = requests.get(f"{BASE}/api/quotes?tickers={ticker}", timeout=10)
        data = r.json()
        return data.get(ticker, {}).get('price', 0)
    except:
        return 0

def track_returns():
    today = datetime.now()
    periods = [7, 14, 30]

    all_returns = []

    for csv_file in sorted(glob.glob(f"{DATA_DIR}/*_nasdaq100.csv") + glob.glob(f"{DATA_DIR}/*_sp500.csv")):
        basename = os.path.basename(csv_file)
        screen_date_str = basename.split('_')[0]
        try:
            screen_date = datetime.strptime(screen_date_str, "%Y-%m-%d")
        except:
            continue

        days_diff = (today - screen_date).days
        if days_diff not in periods:
            continue

        with open(csv_file, 'r') as rf:
            reader = csv.DictReader(rf)
            for row in reader:
                if int(row.get('rank', 999)) > 20:
                    continue
                ticker = row['ticker']
                screen_price = float(row.get('price', 0))
                if screen_price <= 0:
                    continue
                current_price = get_current_price(ticker)
                if current_price <= 0:
                    continue
                return_pct = ((current_price - screen_price) / screen_price) * 100
                all_returns.append({
                    'screen_date': screen_date_str,
                    'ticker': ticker,
                    'screen_price': screen_price,
                    'score': row.get('score', 0),
                    'rank': row.get('rank', 0),
                    'current_price': current_price,
                    'days': days_diff,
                    'return_pct': round(return_pct, 2),
                })

    if not all_returns:
        print("No tracking data yet.")
        return

    # Save returns CSV
    returns_file = f"{DATA_DIR}/{today.strftime('%Y-%m-%d')}_returns.csv"
    with open(returns_file, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['screen_date','ticker','screen_price','score','rank','current_price','days','return_pct'])
        w.writeheader()
        for r in all_returns:
            w.writerow(r)

    # Save returns markdown
    md_file = f"{DATA_DIR}/{today.strftime('%Y-%m-%d')}_수익률추적.md"
    lines = [
        f"# 수익률 추적 {today.strftime('%Y-%m-%d')}",
        "",
    ]

    for period in periods:
        period_returns = [r for r in all_returns if r['days'] == period]
        if not period_returns:
            continue
        avg = sum(r['return_pct'] for r in period_returns) / len(period_returns)
        winners = len([r for r in period_returns if r['return_pct'] > 0])
        lines.extend([
            f"## {period}일 후 수익률",
            f"- 평균: **{avg:+.2f}%**",
            f"- 승률: {winners}/{len(period_returns)} ({winners/len(period_returns)*100:.0f}%)",
            "",
            "| Ticker | 스크리닝가 | 현재가 | 수익률 | 점수 |",
            "|--------|-----------|--------|--------|------|",
        ])
        for r in sorted(period_returns, key=lambda x: x['return_pct'], reverse=True):
            lines.append(f"| {r['ticker']} | ${r['screen_price']:.2f} | ${r['current_price']:.2f} | **{r['return_pct']:+.2f}%** | {r['score']} |")
        lines.append("")

    with open(md_file, 'w') as f:
        f.write('\n'.join(lines))

    print(f"Saved: {returns_file}")
    print(f"Saved: {md_file}")

if __name__ == "__main__":
    track_returns()
