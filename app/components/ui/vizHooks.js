'use client';
// 共有ビズ・フック（NdbView から抽出・挙動不変）。
// 他ビュー(Map/Muni/Area 等)が同じ運動文法(400ms easeOutCubic カウントアップ / FLIP行アニメ)を
// 再利用するための単一ソース。prefers-reduced-motion を全フックで尊重。
import { useState, useEffect, useRef, useLayoutEffect } from 'react';

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
