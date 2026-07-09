'use client';
import { useMemo, useState } from 'react';
import { fmt } from '../shared';

// ---- Default 5-quintile blue sequential palette (#2563EB 系) ----
const PALETTE = ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#1d4ed8'];
const NEUTRAL = '#eef1f5'; // データなし県

// 値の書式: 整数はカンマ区切り、小数は 1 桁
const fmtVal = v => (v == null || isNaN(v)) ? '—' : (Number.isInteger(v) ? fmt(v) : v.toFixed(1));

// SVG path(相対/絶対コマンド混在)から重心近似を求める(max/min アノテーション用のラベルアンカー)
function pathCentroid(d) {
  try {
    const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g);
    if (!toks) return null;
    let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = '';
    let sumX = 0, sumY = 0, n = 0;
    const num = () => parseFloat(toks[i++]);
    const isCmd = t => /[a-zA-Z]/.test(t);
    while (i < toks.length) {
      if (isCmd(toks[i])) cmd = toks[i++];
      if (i >= toks.length && !/[Zz]/.test(cmd)) break;
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      if (C === 'M') {
        let x = num(), y = num(); if (rel) { x += cx; y += cy; }
        cx = x; cy = y; sx = x; sy = y; sumX += cx; sumY += cy; n++;
        while (i < toks.length && !isCmd(toks[i])) { // 以降のペアは暗黙の L
          let lx = num(), ly = num(); if (rel) { lx += cx; ly += cy; }
          cx = lx; cy = ly; sumX += cx; sumY += cy; n++;
        }
      } else if (C === 'L' || C === 'T') {
        let x = num(), y = num(); if (rel) { x += cx; y += cy; }
        cx = x; cy = y; sumX += cx; sumY += cy; n++;
      } else if (C === 'H') {
        let x = num(); if (rel) x += cx; cx = x; sumX += cx; sumY += cy; n++;
      } else if (C === 'V') {
        let y = num(); if (rel) y += cy; cy = y; sumX += cx; sumY += cy; n++;
      } else if (C === 'C') {
        num(); num(); num(); num(); let x = num(), y = num(); if (rel) { x += cx; y += cy; }
        cx = x; cy = y; sumX += cx; sumY += cy; n++;
      } else if (C === 'S' || C === 'Q') {
        num(); num(); let x = num(), y = num(); if (rel) { x += cx; y += cy; }
        cx = x; cy = y; sumX += cx; sumY += cy; n++;
      } else if (C === 'A') {
        num(); num(); num(); num(); num(); let x = num(), y = num(); if (rel) { x += cx; y += cy; }
        cx = x; cy = y; sumX += cx; sumY += cy; n++;
      } else if (C === 'Z') {
        cx = sx; cy = sy;
      } else {
        i++; // 未知トークンはスキップ
      }
    }
    if (!n) return null;
    return { x: sumX / n, y: sumY / n };
  } catch (e) {
    return null;
  }
}

/**
 * PrefChoropleth — 都道府県 5 分位コロプレス地図(単一)
 * MapView.jsx の県パス描画 / hover ツールチップ / クリック連動を部品化・一般化。
 *
 * props:
 *  - japanMap   : { viewBox, prefs:[{id, ja, d}] }  (MapView と同一形式)
 *  - valueByPref: { 県名: 値 }
 *  - colorScale : (値)=>色  省略時は valueByPref から 5 分位を内部生成
 *  - selected   : 県名(強調表示)
 *  - onSelect   : (pref)=>void  (省略可。既存 setGlobalPref 流儀)
 *  - yearBadge  : { label, color }  年度/出典バッジ
 *  - title      : 見出し
 *  - unit       : 値の単位(ツールチップ・凡例に付与)
 *  - hoverable  : hover ツールチップ有効(既定 true)
 *  - annotate   : 最大県/最小県の自動アノテーション(既定 true)
 *  - mob        : モバイル寄せ(高さ調整。省略可)
 *  - height     : SVG 高さ px を明示指定(省略可)
 */
export default function PrefChoropleth({
  japanMap,
  valueByPref = {},
  colorScale,
  selected,
  onSelect,
  yearBadge,
  title,
  unit = '',
  hoverable = true,
  annotate = true,
  mob = false,
  height,
}) {
  const [hov, setHov] = useState(null); // { ja, x, y }

  // 値を持つ県のみ抽出
  const withVal = useMemo(() => {
    if (!japanMap?.prefs) return [];
    return japanMap.prefs
      .map(pf => ({ id: pf.id, ja: pf.ja, val: valueByPref?.[pf.ja] }))
      .filter(x => typeof x.val === 'number' && !isNaN(x.val));
  }, [japanMap, valueByPref]);

  // 5 分位のしきい値(20/40/60/80 パーセンタイル)
  const quint = useMemo(() => {
    const vals = withVal.map(x => x.val).sort((a, b) => a - b);
    if (!vals.length) return null;
    const q = p => {
      const idx = (vals.length - 1) * p;
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      return vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
    };
    return { min: vals[0], max: vals[vals.length - 1], th: [q(0.2), q(0.4), q(0.6), q(0.8)] };
  }, [withVal]);

  const binOf = v => {
    if (!quint) return 0;
    const t = quint.th;
    return v <= t[0] ? 0 : v <= t[1] ? 1 : v <= t[2] ? 2 : v <= t[3] ? 3 : 4;
  };

  const fillOf = v => {
    if (v == null || isNaN(v)) return NEUTRAL;
    if (typeof colorScale === 'function') return colorScale(v) || NEUTRAL;
    return PALETTE[binOf(v)];
  };

  // 降順ランク(1 = 最大値)
  const rankByPref = useMemo(() => {
    const sorted = [...withVal].sort((a, b) => b.val - a.val);
    const m = {};
    sorted.forEach((x, i) => { m[x.ja] = i + 1; });
    return m;
  }, [withVal]);
  const total = withVal.length;

  // 最大県 / 最小県
  const extremes = useMemo(() => {
    if (!withVal.length) return null;
    let mx = withVal[0], mn = withVal[0];
    withVal.forEach(x => { if (x.val > mx.val) mx = x; if (x.val < mn.val) mn = x; });
    return { max: mx, min: mn };
  }, [withVal]);

  // アノテーション用の重心(max/min のみ計算)
  const centroids = useMemo(() => {
    if (!annotate || !extremes || !japanMap?.prefs) return {};
    const byJa = {};
    japanMap.prefs.forEach(pf => { byJa[pf.ja] = pf.d; });
    const out = {};
    [extremes.max, extremes.min].forEach(e => {
      if (e && byJa[e.ja]) out[e.ja] = pathCentroid(byJa[e.ja]);
    });
    return out;
  }, [annotate, extremes, japanMap]);

  if (!japanMap?.prefs) return null;

  const svgH = height || (mob ? 300 : 460);
  const valueOf = ja => valueByPref?.[ja];
  const clickable = typeof onSelect === 'function';

  // 凡例の 5 分位レンジ
  const legendBins = quint ? [
    [quint.min, quint.th[0]],
    [quint.th[0], quint.th[1]],
    [quint.th[1], quint.th[2]],
    [quint.th[2], quint.th[3]],
    [quint.th[3], quint.max],
  ] : [];

  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, padding: mob ? 10 : '12px 16px' }}>
      {/* ヘッダー: タイトル + 年度バッジ */}
      {(title || yearBadge) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {title && <div style={{ fontSize: mob ? 13 : 14, fontWeight: 700, color: '#1e293b', letterSpacing: '-0.01em' }}>{title}</div>}
          {yearBadge?.label && (
            <span style={{ fontSize: 10, fontWeight: 600, color: yearBadge.color || '#2563eb', background: (yearBadge.color || '#2563eb') + '14', border: '1px solid ' + ((yearBadge.color || '#2563eb') + '33'), padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>{yearBadge.label}</span>
          )}
        </div>
      )}

      {/* 地図本体 */}
      <div style={{ position: 'relative' }}>
        <svg viewBox={japanMap.viewBox} style={{ width: '100%', height: svgH, display: 'block' }} preserveAspectRatio="xMidYMid meet">
          {japanMap.prefs.map(pf => {
            const v = valueOf(pf.ja);
            const isHov = hoverable && hov?.ja === pf.ja;
            const isSel = selected != null && selected === pf.ja;
            return (
              <path
                key={pf.id}
                d={pf.d}
                fill={fillOf(v)}
                stroke={isSel ? '#111827' : isHov ? '#1e293b' : '#fff'}
                strokeWidth={isSel ? 1.6 : isHov ? 1.2 : 0.5}
                style={{ cursor: clickable ? 'pointer' : 'default', transition: 'fill 0.15s, stroke 0.12s' }}
                onMouseEnter={hoverable ? (e => {
                  const r = e.currentTarget.getBoundingClientRect();
                  const svgR = e.currentTarget.closest('svg').getBoundingClientRect();
                  setHov({ ja: pf.ja, x: r.x - svgR.x + r.width / 2, y: r.y - svgR.y });
                }) : undefined}
                onMouseLeave={hoverable ? (() => setHov(null)) : undefined}
                onClick={clickable ? (() => onSelect(pf.ja)) : undefined}
              />
            );
          })}

          {/* 最大県 / 最小県 の自動アノテーション */}
          {annotate && extremes && [
            { e: extremes.max, tag: '最大', fill: '#1d4ed8' },
            { e: extremes.min, tag: '最小', fill: '#93a3b8' },
          ].map(({ e, tag, fill }) => {
            const c = e && centroids[e.ja];
            if (!c || isNaN(c.x) || isNaN(c.y)) return null;
            return (
              <g key={tag} style={{ pointerEvents: 'none' }}>
                <circle cx={c.x} cy={c.y} r={2.6} fill={fill} stroke="#fff" strokeWidth={0.8} />
                <text
                  x={c.x} y={c.y - 4.5}
                  textAnchor="middle"
                  fontSize={8.5}
                  fontWeight={700}
                  fill="#0f172a"
                  style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 2.4, strokeLinejoin: 'round' }}
                >{tag} {e.ja}</text>
              </g>
            );
          })}
        </svg>

        {/* hover ツールチップ: 県名 + 値 + 47 県中順位 */}
        {hoverable && hov && (() => {
          const v = valueOf(hov.ja);
          const rank = rankByPref[hov.ja];
          return (
            <div style={{
              position: 'absolute',
              left: `clamp(52px, ${hov.x}px, calc(100% - 52px))`,
              top: hov.y,
              transform: 'translate(-50%, calc(-100% - 6px))',
              background: '#1e293b', color: '#fff', padding: '7px 12px', borderRadius: 8,
              fontSize: 12, pointerEvents: 'none', zIndex: 10, whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{hov.ja}</div>
              <div>
                {title ? title + ': ' : ''}
                <span style={{ color: '#93c5fd', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {v == null || isNaN(v) ? 'データなし' : `${fmtVal(v)}${unit || ''}`}
                </span>
              </div>
              {rank != null && (
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  {total}県中 <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{rank}</span> 位（高い順）
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* 凡例: 5 分位 + 最大/最小 */}
      {quint && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 2, alignItems: 'stretch' }}>
            {legendBins.map((b, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 10, background: typeof colorScale === 'function' ? (colorScale((b[0] + b[1]) / 2) || PALETTE[i]) : PALETTE[i], borderRadius: i === 0 ? '3px 0 0 3px' : i === 4 ? '0 3px 3px 0' : 0 }} />
                <div style={{ fontSize: 8.5, color: '#64748b', marginTop: 3, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                  {fmtVal(b[0])}<span style={{ color: '#cbd5e1' }}>–</span>{fmtVal(b[1])}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 10, color: '#64748b', flexWrap: 'wrap', gap: 4 }}>
            <span>低 <span style={{ color: '#94a3b8' }}>→</span> 高（5 分位）{unit ? ` ｜ 単位: ${unit}` : ''}</span>
            {annotate && extremes && (
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: '#1d4ed8', fontWeight: 600 }}>最大</span> {extremes.max.ja} {fmtVal(extremes.max.val)}{unit || ''}
                <span style={{ margin: '0 5px', color: '#cbd5e1' }}>|</span>
                <span style={{ color: '#64748b', fontWeight: 600 }}>最小</span> {extremes.min.ja} {fmtVal(extremes.min.val)}{unit || ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 値なし時のフォールバック */}
      {!quint && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>表示できる県別データがありません</div>
      )}
    </div>
  );
}
