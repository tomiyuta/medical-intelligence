'use client';
// 共有ビズ・フック（NdbView から抽出・挙動不変）。
// 他ビュー(Map/Muni/Area 等)が同じ運動文法(400ms easeOutCubic カウントアップ / FLIP行アニメ)を
// 再利用するための単一ソース。prefers-reduced-motion を全フックで尊重。
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useSelection } from '../SelectionContext';

// ── useStripCommon: PrefStrip47/PrefChoropleth 共通 props の単一ソース ──
// Area/Ndb/RegionalBedFunction の同形 stripCommon を一本化。pinned/hover は
// SelectionContext を内部で参照＝◆比較ピンがビュー横断で持ち回りされる。
// selected(表示中の県) と onJump(県クリック時遷移) はビューごとに異なるため引数で受ける。
export function useStripCommon({ selected, onJump } = {}) {
  const s = useSelection();
  return {
    selected,
    pinned: s.pinnedPref,
    hoverPref: s.hoverPref,
    onHover: s.setHoverPref,
    onPin: (p) => s.setPinnedPref((prev) => (prev === p ? null : p)),
    onJump,
  };
}

// ── useYearSweep: 将来推計スイープ(再生/1ステップ)の共通ロジック ──
// NdbView タイムレンズ と MapView 逼迫スイープ の重複再生ロジックを抽出。
// years=年配列 / current=現在年 / setYear=セッター(=SelectionContext.setFutureYear)。
// 数値年/文字列年は呼び出し側で正規化してから渡す(indexOf は厳密比較のため)。
export function useYearSweep({ years, current, setYear, interval = 700, respectReduced = false } = {}) {
  const [playing, setPlaying] = useState(false);
  const idx = years ? years.indexOf(current) : -1;
  const last = years ? years.length - 1 : -1;
  useEffect(() => {
    if (!playing) return;
    if (respectReduced && prefersReducedMotion()) { setPlaying(false); return; }
    if (idx < 0 || idx >= last) { setPlaying(false); return; }
    const id = setTimeout(() => setYear(years[idx + 1]), interval);
    return () => clearTimeout(id);
  }, [playing, idx, last, interval, respectReduced]); // eslint-disable-line react-hooks/exhaustive-deps
  // 再生トグル: 末尾なら先頭へ巻き戻してから再生開始（既存 play ボタンの挙動を踏襲）
  const toggle = () => {
    if (idx >= last && last >= 0) setYear(years[0]);
    setPlaying((p) => !p);
  };
  return { playing, setPlaying, idx, toggle };
}

// SSR警告回避: サーバでは useEffect にフォールバック（FLIP用）
export const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// prefers-reduced-motion 尊重（FLIP/カウントアップ共通）
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// カウントアップ(400ms rAF・easeOutCubic)。初回マウントはアニメなし・reduced-motionは瞬時。
export const useCountUp = (target, dur = 400) => {
  const [val, setVal] = useState(target);
  const firstRef = useRef(true);
  const prevRef = useRef(target);
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; prevRef.current = target; return; }
    const from = prevRef.current;
    prevRef.current = target;
    if (target == null || from == null || !isFinite(from) || !isFinite(target) || prefersReducedMotion()) {
      setVal(target); return;
    }
    if (from === target) { setVal(target); return; }
    let raf; const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [target, dur]);
  return val;
};

// 数値カウントアップ表示（乖離チップ・KPI全国比用。→2050傾き=推計には使わない: 実測と推計を同じ運動文法で混ぜない）
export const CountUpNum = ({ value, decimals = 0, signed = false, suffix = '' }) => {
  const v = useCountUp(value);
  if (v == null || !isFinite(v)) return null;
  return <>{signed && v > 0 ? '+' : ''}{v.toFixed(decimals)}{suffix}</>;
};

// FLIP行アニメ共通ヘルパ(psRowRefs方式の一般化・挙動不変)。
// refsMap=useRefの{key→行DOM}。deps変更時に行がtranslateYのみで滑走(reflowゼロ)。
// 初回マウントはアニメなし・prefers-reduced-motionは無効。毎レンダ後に現在位置を記録(次のFirst)。
export const useFlipRows = (refsMap, deps, mob = false) => {
  const posRef = useRef({});   // key→前レンダの getBoundingClientRect().top（First）
  const armed = useRef(false); // 初回マウントはアニメなし
  useIsoLayoutEffect(() => {
    if (armed.current && !prefersReducedMotion()) {
      Object.entries(refsMap.current).forEach(([key, el]) => {
        if (!el || typeof el.animate !== 'function') return;
        const oldTop = posRef.current[key];
        if (oldTop == null) return;
        const dy = oldTop - el.getBoundingClientRect().top; // Invert
        if (Math.abs(dy) < 1) return;
        el.animate(                                          // Play: transformのみ
          [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
          { duration: mob ? 280 : 350, easing: 'cubic-bezier(0.22,1,0.36,1)' }
        );
      });
    }
    armed.current = true;
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useIsoLayoutEffect(() => {   // 毎レンダ後に現在位置を記録（次のFLIPのFirst）
    const snap = {};
    Object.entries(refsMap.current).forEach(([key, el]) => { if (el) snap[key] = el.getBoundingClientRect().top; });
    posRef.current = snap;
  });
};
