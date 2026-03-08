import { useState, useEffect } from "react";

const STORAGE_KEY = "sd_watchlists_v2";

export function useFavorites() {
    const [state, setState] = useState(() => {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (stored?.lists?.length) return stored;
        } catch {}
        // 구버전 sd_favorites 마이그레이션
        try {
            const old = JSON.parse(localStorage.getItem("sd_favorites") || "[]");
            return { lists: [{ name: "기본 관심목록", tickers: old }], activeIdx: 0 };
        } catch {}
        return { lists: [{ name: "기본 관심목록", tickers: [] }], activeIdx: 0 };
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [state]);

    // 현재 활성 목록의 티커 배열
    const favorites = state.lists[state.activeIdx]?.tickers ?? [];

    const setActiveIdx = (idx) =>
        setState(p => ({ ...p, activeIdx: Math.max(0, Math.min(idx, p.lists.length - 1)) }));

    const addList = (name = "새 관심목록") =>
        setState(p => ({
            lists: [...p.lists, { name, tickers: [] }],
            activeIdx: p.lists.length,
        }));

    const removeList = (idx) =>
        setState(p => {
            if (p.lists.length <= 1) return p;
            const lists = p.lists.filter((_, i) => i !== idx);
            return { lists, activeIdx: Math.min(p.activeIdx, lists.length - 1) };
        });

    const renameList = (idx, name) =>
        setState(p => ({
            ...p,
            lists: p.lists.map((l, i) => i === idx ? { ...l, name } : l),
        }));

    // 현재 활성 목록에서 토글
    const toggleFavorite = (ticker) =>
        setState(p => ({
            ...p,
            lists: p.lists.map((l, i) => i === p.activeIdx ? {
                ...l,
                tickers: l.tickers.includes(ticker)
                    ? l.tickers.filter(t => t !== ticker)
                    : [...l.tickers, ticker],
            } : l),
        }));

    // 특정 목록에 추가 (이미 있으면 무시)
    const addToList = (ticker, listIdx) =>
        setState(p => ({
            ...p,
            lists: p.lists.map((l, i) => i === listIdx && !l.tickers.includes(ticker)
                ? { ...l, tickers: [...l.tickers, ticker] }
                : l),
        }));

    // 특정 목록에서 제거
    const removeFromList = (ticker, listIdx) =>
        setState(p => ({
            ...p,
            lists: p.lists.map((l, i) => i === listIdx
                ? { ...l, tickers: l.tickers.filter(t => t !== ticker) }
                : l),
        }));

    // 특정 목록 내 여부 (listIdx 생략 시 활성 목록)
    const isFavorite = (ticker, listIdx) => {
        const idx = listIdx ?? state.activeIdx;
        return state.lists[idx]?.tickers.includes(ticker) ?? false;
    };

    // 어느 목록에라도 있으면 true (★ 표시용)
    const isInAnyList = (ticker) => state.lists.some(l => l.tickers.includes(ticker));

    // 전체 고유 즐겨찾기 수 (탭 배지용)
    const totalCount = new Set(state.lists.flatMap(l => l.tickers)).size;

    return {
        lists: state.lists,
        activeIdx: state.activeIdx,
        favorites,
        totalCount,
        setActiveIdx,
        addList,
        removeList,
        renameList,
        toggleFavorite,
        addToList,
        removeFromList,
        isFavorite,
        isInAnyList,
    };
}
