'use client';
import { useState, useEffect, useRef, useMemo, useId } from 'react';

// ── Layer2 分布ドロワー: 臨床閾値ヒストグラム（純カスタムSVG・Recharts不使用） ──
// NDB特定健診 検査値階層別分布(R4)の県分布を、全国ゴースト輪郭と臨床閾値ゾーンで読む。
//
// 規約踏襲（PrefStrip47 → 新部品の規約共有・コード共有でなく規約共有）:
//   ・yearBadge {label,color} 必須。無ければ console.warn + 非描画
//   ・マスクビン（count=0 — NDB10未満マスクで行自体が欠落）は 0高+斜線ハッチで表示し
//     値を捏造しない。ツールチップにも「集計値なし」と明示
//   ・ツールチップは常に実値（構成%小数1桁 + 生count件数）
//   ・全国基準=灰ゴースト輪郭 / ◆ピン県=橙#f97316（PrefStrip47 のピン語彙）
//
// 色意味論（二層色制 — colorDecision準拠）:
//   分布本体（閾値未満）= slate#94a3b8 の中立色。閾値以上のバー= Bカード既存リスク色を
//   一段濃くした fill + ゾーン全域に rgba リスク色 10-14% 網掛け。
//   BMI≥25 / HbA1c≥6.5 / SBP≥140 / LDL≥140 / 尿蛋白1+ は臨床的に確立した
//   「高=悪い」の一方向断面なのでリスク色が正当（rose-indigo中立発散は誤り）。
//   全国ゴースト=価値中立灰#cbd5e1。

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── 臨床閾値マップ（RISK_CARDSにrisk_binsフィールドは無いため新設） ──
// ビン判定は /api/ndb/checkup-bins/route.js の lowerBound ロジックのクライアント複製。
export const BINS_URINE_ORDER = { '－': 0, '±': 1, '＋': 2, '＋＋': 3, '＋＋＋': 4 };
export const binsLowerBound = (metric, label) => {
  if (metric === '尿蛋白') return label in BINS_URINE_ORDER ? BINS_URINE_ORDER[label] : 999;
  const m = label.match(/([0-9]+(?:\.[0-9]+)?)以上/);
  if (m) return parseFloat(m[1]);
  return -Infinity; // 「X未満」のみの最下位ビン
};
export const RISK_BIN_THRESHOLD = {
  bmi_ge_25:              { metric: 'BMI',        min: 25,      thLabel: '25以上',      unit: '' },
  hba1c_ge_6_5:           { metric: 'HbA1c',      min: 6.5,     thLabel: '6.5以上',     unit: '%' },
  sbp_ge_140:             { metric: '収縮期血圧',  min: 140,     thLabel: '140以上',     unit: 'mmHg' },
  ldl_ge_140:             { metric: 'LDL',        min: 140,     thLabel: '140以上',     unit: 'mg/dL' },
  urine_protein_ge_1plus: { metric: '尿蛋白',     urineMin: 2,  thLabel: '＋(1+)以上',  unit: '' },
};
export const METRIC_TO_RISK_KEY = Object.fromEntries(
  Object.entries(RISK_BIN_THRESHOLD).map(([k, v]) => [v.metric, k])
);
// ビンが臨床閾値以上か（route.js の lowerBound 複製で判定）
export const binExceedsThreshold = (metric, label) => {
  const th = RISK_BIN_THRESHOLD[METRIC_TO_RISK_KEY[metric]];
  if (!th) return false;
  const lb = binsLowerBound(metric, label);
  if (th.urineMin != null) return lb !== 999 && lb >= th.urineMin;
  return isFinite(lb) && lb >= th.min;
};

// ビンラベル短縮（軸表示用。実値レンジはツールチップに原文で出す）
const shortBin = (metric, label) => {
  if (metric === '尿蛋白') return label;
  let m = label.match(/^([0-9.]+)以上([0-9.]+)未満$/);
  if (m) return `${m[1]}–${m[2]}`;
  m = label.match(/^([0-9.]+)以上$/);
  if (m) return `${m[1]}+`;
  m = label.match(/^([0-9.]+)未満$/);
  if (m) return `<${m[1]}`;
  return label;
};

const hexA = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(220,38,38,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// useCountUp と同一運動文法（400ms easeOutCubic）の配列版 — 年齢帯/性別切替のバー高モーフ。
// 長さが変わる切替（指標切替）はモーフせず瞬時。prefers-reduced-motion も瞬時。
// 初回マウントはアニメなし（useCountUp と同規約）。
const useAnimatedArray = (target, dur = 400) => {
  const key = target.join(',');
  const [vals, setVals] = useState(target);
  const valsRef = useRef(target);   // 現在表示中の値（アニメ途中の切替でも滑らかに）
  const firstRef = useRef(true);
  useEffect(() => {
    const jump = () => { valsRef.current = target; setVals(target); };
    if (firstRef.current) { firstRef.current = false; return jump(); }
    const from = valsRef.current;
    if (prefersReducedMotion() || !from || from.length !== target.length ||
        from.every((v, i) => v === target[i])) return jump();
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      const next = target.map((v, i) => from[i] + (v - from[i]) * e);
      valsRef.current = next;
      setVals(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // 指標切替直後の1レンダ（state未反映）は長さ不一致になり得るため target を返す
  return vals.length === target.length ? vals : target;
};

const cumsum = (arr) => { let s = 0; return arr.map((v) => (s += v)); };

export default function CheckupBinsHistogram({
  rows,            // API rows（選択県。metric絞り込み済・male/female両行）
  pinRows = null,  // ◆ピン県のAPI rows（pref_count=ピン県）
  binLabels,       // binOrder[metric]（臨床値昇順）
  metric,          // 'BMI' | 'HbA1c' | '収縮期血圧' | 'LDL' | '尿蛋白'
  sex = 'all',     // 'all'（男女クライアント合算） | 'male' | 'female'
  age = 'all',     // 'all' | '40-44' … '70-74'
  mirror = false,  // 男女ミラーモード（男左・女右鏡像 / mobは縦積み）
  cdf = false,     // 累積%表示
  color = '#dc2626',      // Bカード既存色
  colorDeep = '#b91c1c',  // 閾値超えバー用の一段濃い色
  prefName,
  pinnedName = null,
  yearBadge,       // {label,color} 必須（無ければ console.warn + 非描画）
  mob = false,
  pulse = false,   // Bカードclick時の閾値ゾーンパルス
  onZoneHover,     // (bool) — 閾値超えビンhover ↔ Bカード相互ハイライト
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [hover, setHover] = useState(null); // {panel, idx}

  const n = binLabels?.length || 0;

  // ── 集計（sex/age クライアントフィルタ + 男女合算・ビン別 count → 構成%） ──
  const panels = useMemo(() => {
    const make = (sexF, title, titleColor) => {
      const idx = new Map((binLabels || []).map((b, i) => [b, i]));
      const pref = new Array(n).fill(0), nat = new Array(n).fill(0), pin = new Array(n).fill(0);
      for (const r of rows || []) {
        if (r.metric !== metric) continue;
        if (sexF !== 'all' && r.sex !== sexF) continue;
        if (age !== 'all' && r.age_group !== age) continue;
        const i = idx.get(r.bin_label);
        if (i == null) continue;
        pref[i] += r.pref_count || 0;
        nat[i] += r.national_count || 0;
      }
      for (const r of pinRows || []) {
        if (r.metric !== metric) continue;
        if (sexF !== 'all' && r.sex !== sexF) continue;
        if (age !== 'all' && r.age_group !== age) continue;
        const i = idx.get(r.bin_label);
        if (i == null) continue;
        pin[i] += r.pref_count || 0;
      }
      const pT = pref.reduce((s, v) => s + v, 0);
      const nT = nat.reduce((s, v) => s + v, 0);
      const piT = pin.reduce((s, v) => s + v, 0);
      return {
        title, titleColor,
        prefCount: pref, prefTot: pT,
        prefShare: pref.map((v) => (pT > 0 ? (v / pT) * 100 : 0)),
        natShare: nat.map((v) => (nT > 0 ? (v / nT) * 100 : 0)),
        pinShare: piT > 0 ? pin.map((v) => (v / piT) * 100) : null,
        masked: pref.map((v) => v === 0), // NDB<10マスクで行欠落 → 0（値ゼロと断定しない）
      };
    };
    return mirror
      ? [make('male', '男', '#2563EB'), make('female', '女', '#dc2626')]
      : [make(sex, null, null)];
  }, [rows, pinRows, binLabels, metric, sex, age, mirror, n]);

  // ── 閾値インデックス（臨床昇順なので閾値以上は連続テール） ──
  const tIdx = useMemo(
    () => (binLabels || []).findIndex((b) => binExceedsThreshold(metric, b)),
    [binLabels, metric]
  );
  const th = RISK_BIN_THRESHOLD[METRIC_TO_RISK_KEY[metric]] || null;

  // ── 表示系列（CDF切替） + アニメ（hooks数固定: 常に2パネル×3系列を呼ぶ） ──
  const disp = (arr) => (cdf ? cumsum(arr) : arr);
  const pA = panels[0], pB = panels[1] || panels[0];
  const zeros = useMemo(() => new Array(n).fill(0), [n]);
  const animPrefA = useAnimatedArray(disp(pA.prefShare));
  const animNatA = useAnimatedArray(disp(pA.natShare));
  const animPinA = useAnimatedArray(disp(pA.pinShare || zeros));
  const animPrefB = useAnimatedArray(disp(pB.prefShare));
  const animNatB = useAnimatedArray(disp(pB.natShare));
  const animPinB = useAnimatedArray(disp(pB.pinShare || zeros));
  const animOf = (pi) => (pi === 0
    ? { pref: animPrefA, nat: animNatA, pin: pA.pinShare ? animPinA : null }
    : { pref: animPrefB, nat: animNatB, pin: pB.pinShare ? animPinB : null });

  // ── 閾値超えhover → Bカード相互ハイライト ──
  const hoverExceed = hover != null && tIdx >= 0 && hover.idx >= tIdx;
  useEffect(() => { if (onZoneHover) onZoneHover(hoverExceed); }, [hoverExceed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (onZoneHover) onZoneHover(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── yearBadge ガード（PrefStrip47規約 — 全hook宣言後） ──
  if (!yearBadge || !yearBadge.label) {
    if (typeof console !== 'undefined') console.warn('CheckupBinsHistogram: yearBadge（必須 {label,color}）が無いため描画しません。', { metric });
    return null;
  }
  if (!n) return null;

  // ── ジオメトリ ──
  const stacked = mirror && mob; // mobミラー=縦積み
  const W = mob ? 340 : 680;
  const padL = 30, padR = 8;
  const chartH = stacked ? 78 : (mob ? 96 : 130);
  const padTop = 26, padBottom = 26;
  const blockH = padTop + chartH + padBottom;
  const H = stacked ? blockH * 2 : blockH;
  // yMax: 全表示系列の最大（CDFは100固定）
  let yMax = 100;
  if (!cdf) {
    let m = 5;
    panels.forEach((p) => {
      [p.prefShare, p.natShare, p.pinShare].forEach((arr) => {
        if (arr) arr.forEach((v) => { if (v > m) m = v; });
      });
    });
    yMax = Math.ceil((m * 1.15) / 5) * 5;
  }

  // パネル領域: [{x0,w,reversed,yTop}]
  const geoms = (() => {
    if (!mirror) return [{ x0: padL, w: W - padL - padR, reversed: false, yTop: padTop }];
    if (stacked) return [
      { x0: padL, w: W - padL - padR, reversed: false, yTop: padTop },
      { x0: padL, w: W - padL - padR, reversed: false, yTop: blockH + padTop },
    ];
    const mid = (W + padL - padR) / 2;
    return [
      { x0: padL, w: mid - 9 - padL, reversed: true, yTop: padTop },   // 男=左・鏡像
      { x0: mid + 9, w: W - padR - (mid + 9), reversed: false, yTop: padTop }, // 女=右
    ];
  })();

  const fmt1 = (v) => (v != null && isFinite(v) ? v.toFixed(1) : '—');
  const hoverInfo = hover != null && panels[hover.panel] ? (() => {
    const p = panels[hover.panel];
    const i = hover.idx;
    const dv = p.prefShare[i] - p.natShare[i];
    return {
      label: binLabels[i], masked: p.masked[i],
      pref: p.prefShare[i], nat: p.natShare[i], delta: dv,
      count: p.prefCount[i], pin: p.pinShare ? p.pinShare[i] : null,
      title: p.title,
      cx: (() => { const g = geoms[hover.panel]; const slot = g.w / n;
        return g.reversed ? g.x0 + g.w - (i + 0.5) * slot : g.x0 + (i + 0.5) * slot; })(),
    };
  })() : null;

  const reduced = prefersReducedMotion();

  return (
    <div style={{ position: 'relative' }}>
      {/* 年度バッジ（部品側にも常設 — PrefStrip47規約） */}
      <span style={{ position: 'absolute', top: -2, right: 0, fontSize: 8.5, fontWeight: 700, padding: '1px 5px',
        borderRadius: 3, background: '#fff', border: `1px solid ${yearBadge.color || '#94a3b8'}`,
        color: yearBadge.color || '#64748b', zIndex: 2 }}>{yearBadge.label}</span>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: '100%', touchAction: 'manipulation' }}
        role="img" aria-label={`${prefName || ''} ${metric} の階級分布ヒストグラム（全国比較・臨床閾値${th ? th.thLabel : ''}）`}
        onMouseLeave={() => setHover(null)}>
        <defs>
          {/* 閾値ゾーン網掛け（リスク色の斜線） */}
          <pattern id={`${uid}zone`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke={hexA(color, 0.22)} strokeWidth="1.4" />
          </pattern>
          {/* マスクビン斜線ハッチ（灰） */}
          <pattern id={`${uid}mask`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#94a3b8" strokeWidth="1" />
          </pattern>
        </defs>
        {geoms.map((g, pi) => {
          const p = panels[pi];
          const anim = animOf(pi);
          const slot = g.w / n;
          const barW = Math.min(slot * 0.68, 54);
          const baseline = g.yTop + chartH;
          const hOf = (v) => Math.max(0, Math.min(1, v / yMax)) * chartH;
          const xLeftOf = (i) => (g.reversed ? g.x0 + g.w - (i + 1) * slot : g.x0 + i * slot);
          const xThr = tIdx >= 0 ? (g.reversed ? g.x0 + g.w - tIdx * slot : g.x0 + tIdx * slot) : null;
          const zone = tIdx >= 0 ? (g.reversed ? { x: g.x0, w: xThr - g.x0 } : { x: xThr, w: g.x0 + g.w - xThr }) : null;
          // 該当%（アニメ値でなく確定値 — Bカード値と照合可能に）
          const exceed = tIdx >= 0 ? p.prefShare.slice(tIdx).reduce((s, v) => s + v, 0) : null;
          // 全国ゴーストのステップ輪郭（前面重ね・fill:none）
          const stepPath = (arr) => {
            let d = `M ${g.x0} ${baseline}`;
            for (let i = 0; i < n; i++) {
              const xi = g.reversed ? n - 1 - i : i; // 視覚順に走査
              const y = baseline - hOf(arr[xi]);
              d += ` L ${g.x0 + i * slot} ${y} L ${g.x0 + (i + 1) * slot} ${y}`;
            }
            d += ` L ${g.x0 + g.w} ${baseline}`;
            return d;
          };
          const pillW = 84, pillH = 16;
          const pillX = zone ? Math.max(g.x0 + 2, Math.min(g.x0 + g.w - pillW - 2, zone.x + zone.w / 2 - pillW / 2)) : 0;
          return (
            <g key={pi}>
              {/* Yグリッド */}
              {[0.5, 1].map((f) => (
                <g key={f}>
                  <line x1={g.x0} x2={g.x0 + g.w} y1={baseline - chartH * f} y2={baseline - chartH * f} stroke="#f1f5f9" strokeWidth={1} />
                  {(pi === 0 || stacked) && (
                    <text x={g.x0 - 4} y={baseline - chartH * f + 3} fontSize={8} fill="#94a3b8" textAnchor="end">{(yMax * f).toFixed(0)}%</text>
                  )}
                </g>
              ))}
              {/* 閾値ゾーン（rgbaリスク色10-14% + 斜線網掛け） */}
              {zone && (
                <g>
                  <rect x={zone.x} y={g.yTop - 4} width={zone.w} height={chartH + 4} fill={hexA(color, 0.12)} />
                  <rect x={zone.x} y={g.yTop - 4} width={zone.w} height={chartH + 4} fill={`url(#${uid}zone)`} />
                  {pulse && !reduced && (
                    <rect x={zone.x} y={g.yTop - 4} width={zone.w} height={chartH + 4} fill={hexA(color, 0.4)} opacity={0}>
                      <animate attributeName="opacity" values="0;0.6;0;0.6;0" dur="1.2s" fill="freeze" />
                    </rect>
                  )}
                </g>
              )}
              {/* 県バー（閾値未満=slate中立 / 閾値以上=リスク色を一段濃く） */}
              {binLabels.map((b, i) => {
                const xL = xLeftOf(i);
                const bx = xL + (slot - barW) / 2;
                const v = anim.pref[i];
                const hh = hOf(v);
                if (p.masked[i]) {
                  // マスクビン: 0高+斜線ハッチのスタブ（値を捏造しない）
                  return (
                    <g key={b}>
                      <rect x={bx} y={baseline - 7} width={barW} height={7} fill={`url(#${uid}mask)`} stroke="#cbd5e1" strokeWidth={0.75} strokeDasharray="2 2" rx={1} />
                    </g>
                  );
                }
                return (
                  <rect key={b} x={bx} y={baseline - hh} width={barW} height={hh} rx={1.5}
                    fill={tIdx >= 0 && i >= tIdx ? colorDeep : '#94a3b8'}
                    opacity={hover && hover.panel === pi && hover.idx === i ? 1 : 0.92} />
                );
              })}
              {/* 全国=灰ゴースト輪郭（前面重ね） */}
              <path d={stepPath(anim.nat)} fill="none" stroke="#cbd5e1" strokeWidth={1.5} strokeLinejoin="round" />
              {/* ◆ピン県=橙第2輪郭 */}
              {anim.pin && (
                <path d={stepPath(anim.pin)} fill="none" stroke="#f97316" strokeWidth={1.5} strokeDasharray="4 2.5" strokeLinejoin="round" opacity={0.9} />
              )}
              {/* 臨床閾値の縦破線+ラベル */}
              {xThr != null && (
                <g>
                  <line x1={xThr} x2={xThr} y1={g.yTop - 8} y2={baseline} stroke={colorDeep} strokeWidth={1.2} strokeDasharray="4 3" />
                  <text x={xThr + (g.reversed ? -3 : 3)} y={baseline + 10} fontSize={8} fontWeight={700}
                    fill={colorDeep} textAnchor={g.reversed ? 'end' : 'start'}>{th ? th.thLabel : ''}{th && th.unit ? ` ${th.unit}` : ''}</text>
                </g>
              )}
              {/* 該当%ピル（Bカード値と照合可） */}
              {zone && exceed != null && (
                <g>
                  <rect x={pillX} y={g.yTop - 22} width={pillW} height={pillH} rx={8} fill="#fff" stroke={colorDeep} strokeWidth={1} />
                  <text x={pillX + pillW / 2} y={g.yTop - 10.5} fontSize={9} fontWeight={700} fill={colorDeep} textAnchor="middle">
                    該当 {exceed.toFixed(1)}%
                  </text>
                </g>
              )}
              {/* パネルタイトル（ミラー時 男/女）— 閾値ゾーン/ピルと重ならない側（鏡像=右・通常=左）に置く */}
              {p.title && (
                <text x={g.reversed ? g.x0 + g.w - 2 : g.x0 + 2} y={g.yTop - 10.5} fontSize={10} fontWeight={700}
                  fill={p.titleColor} textAnchor={g.reversed ? 'end' : 'start'}>{p.title}</text>
              )}
              {/* X軸ビンラベル */}
              {binLabels.map((b, i) => {
                const xL = xLeftOf(i);
                return (
                  <text key={b} x={xL + slot / 2} y={baseline + (tIdx >= 0 && i === tIdx ? 20 : 10)} fontSize={8}
                    fill={tIdx >= 0 && i >= tIdx ? colorDeep : '#64748b'} textAnchor="middle">{shortBin(metric, b)}</text>
                );
              })}
              {/* ベースライン */}
              <line x1={g.x0} x2={g.x0 + g.w} y1={baseline} y2={baseline} stroke="#e2e8f0" strokeWidth={1} />
              {/* hover捕捉レイヤ（タッチ=1タップで同ツールチップ） */}
              {binLabels.map((b, i) => {
                const xL = xLeftOf(i);
                return (
                  <rect key={`h${b}`} x={xL} y={g.yTop - 8} width={slot} height={chartH + 8} fill="transparent" style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHover({ panel: pi, idx: i })}
                    onClick={() => setHover((h) => (h && h.panel === pi && h.idx === i ? null : { panel: pi, idx: i }))} />
                );
              })}
            </g>
          );
        })}
      </svg>
      {/* 濃紺ツールチップ（実値は常に小数1桁+生count） */}
      {hoverInfo && (
        <div style={{ position: 'absolute', left: `${(hoverInfo.cx / W) * 100}%`, top: stacked && hover.panel === 1 ? '50%' : 0,
          transform: 'translate(-50%,-100%)', background: '#1e293b', color: '#fff', fontSize: 10, lineHeight: 1.5,
          padding: '5px 8px', borderRadius: 4, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 20,
          boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}>
          <div style={{ fontWeight: 700 }}>
            {metric} {hoverInfo.label}
            {hoverInfo.title && <span style={{ color: '#93c5fd' }}>（{hoverInfo.title}性）</span>}
            {age !== 'all' && <span style={{ color: '#cbd5e1', fontWeight: 400 }}> ・{age}歳</span>}
            {cdf && <span style={{ color: '#cbd5e1', fontWeight: 400 }}> ・棒は累積%表示中</span>}
          </div>
          {hoverInfo.masked ? (
            <div style={{ color: '#fbbf24' }}>集計値なし — NDB10未満マスクによる非公開の可能性（値ゼロと断定しません）</div>
          ) : (
            <div>
              <b>{prefName}</b> <span style={{ color: '#93c5fd', fontWeight: 700 }}>{fmt1(hoverInfo.pref)}%</span>
              <span style={{ color: '#cbd5e1' }}>
                （全国 {fmt1(hoverInfo.nat)}%・Δ{hoverInfo.delta > 0 ? '+' : ''}{fmt1(hoverInfo.delta)}pp・n={hoverInfo.count.toLocaleString()}件）
              </span>
            </div>
          )}
          {hoverInfo.pin != null && !hoverInfo.masked && (
            <div style={{ color: '#fdba74' }}>◆{pinnedName} {fmt1(hoverInfo.pin)}%</div>
          )}
        </div>
      )}
    </div>
  );
}
