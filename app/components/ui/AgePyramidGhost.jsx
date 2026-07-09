'use client';
import { useState, useMemo, useRef } from 'react';

/**
 * AgePyramidGhost — 県 vs 全国ゴースト・ミラーピラミッド（%正規化）+ 社人研3帯リボン
 *
 * NdbView「人口コンテキスト」のヒーロー部品。純表示・データ依存なし（propsのみ）。
 *
 * MuniView の年齢ピラミッド（絶対数・単一系列）との差別化 — 役割が異なる別部品:
 *   本部品は 県/全国/ピン県 を「各自の総人口を分母に独立%正規化」して同座標へ重畳する
 *   比較文法の部品。全国=輪郭ゴースト・ピン県=橙破線輪郭（◆ピン文法の面展開）・
 *   高齢帯ゾーン（65+/75+）・社人研3帯リボン（tlYear 連動モーフ）が固有。
 *   絶対数の規模感は MuniView 側の役割（重複部品化はしない）。
 *
 * 誠実性ガードレール:
 *   ・将来年の21階級データは存在しない — ピラミッド形状は住基2025実測で固定し、
 *     将来（tlYear）は右端の社人研3帯リボンのみがモーフ（疑似将来ピラミッドを描かない）
 *   ・県/全国/ピンは必ず各自の総人口を分母に%正規化（共通分母だと人口規模差で形が潰れる）
 *   ・sex色は中立 rose/indigo 規約（リスク赤琥珀緑と混同させない）・rect の fill/stroke のみで着色
 *   ・yearBadges {pyramid, ribbon} 必須（pyramid 欠落は描画せず warn）
 *   ・prefers-reduced-motion 時は width/x/height/y の transition を全て無効化
 *
 * props:
 *   ap         : {male:[21], female:[21]} 選択県（住基2025実測）
 *   natAp      : 同構造・全国（輪郭ゴースト）
 *   pinnedAp   : 同構造・ピン県|null（橙破線輪郭）
 *   ageGroups  : ['0-4',...,'100+'] 21階級ラベル
 *   prefName / pinnedName : 表示名
 *   tlBands    : {b064,b6574,b75}|null 選択年の社人研3帯（%）— タイムレンズ tlBands をそのまま受ける
 *   tlYear     : スクラバー選択年（'2025'=基準）
 *   mob        : モバイル（縦積み・ラベル間引き・barH縮小）
 *   onZoneClick: 高齢帯ゾーン行 click（=47県ダンベル展開トグル）
 *   yearBadges : {pyramid:{label,color}, ribbon:{label,color}} 年度バッジ
 */

const SEX = { m: '#6366f1', f: '#f43f5e' };        // 男=indigo / 女=rose（中立規約）
const GHOST = '#94a3b8';                            // 全国=輪郭ゴースト
const PIN = '#f97316';                              // ピン県=橙破線（◆文法）
const ZONE = { z6574: '#fcd34d', z75: '#f59e0b' };  // タイムレンズBANDSと同色

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 各系列を「自らの総人口」を分母に%化（独立正規化 — ガードレール(2)）
const pctSeries = (src) => {
  if (!src?.male || !src?.female) return null;
  const sum = (a) => a.reduce((s, v) => s + (v || 0), 0);
  const total = sum(src.male) + sum(src.female);
  if (total <= 0) return null;
  return { total, m: src.male.map(v => (v || 0) / total * 100), f: src.female.map(v => (v || 0) / total * 100) };
};

const Badge = ({ b, fs = 8.5 }) => !b?.label ? null : (
  <span style={{ fontSize: fs, fontWeight: 700, padding: '0 5px', borderRadius: 4, color: b.color || '#64748b',
    background: (b.color || '#64748b') + '1a', border: `1px solid ${(b.color || '#64748b')}33`, whiteSpace: 'nowrap', lineHeight: 1.5, flexShrink: 0 }}>
    {b.label}
  </span>
);

export default function AgePyramidGhost({ ap, natAp, pinnedAp = null, ageGroups = [], prefName, pinnedName = null,
  tlBands = null, tlYear = '2025', mob = false, onZoneClick, yearBadges }) {
  const holderRef = useRef(null);
  const warnedRef = useRef(false);
  const [hover, setHover] = useState(null); // {idx, px, py}
  const P = useMemo(() => pctSeries(ap), [ap]);
  const N = useMemo(() => pctSeries(natAp), [natAp]);
  const G = useMemo(() => pctSeries(pinnedAp), [pinnedAp]);

  if (!yearBadges?.pyramid?.label) {
    if (!warnedRef.current) { warnedRef.current = true; if (typeof console !== 'undefined') console.warn('AgePyramidGhost: yearBadges.pyramid（必須）が無いため描画しません。'); }
    return null;
  }
  if (!P || !N || !ageGroups.length) return null;

  const reduced = prefersReducedMotion();
  const nRows = ageGroups.length;                     // 21
  const W = mob ? 340 : 480;
  const barH = mob ? 9 : 13;
  const gap = 1;
  const topPad = 22;
  const botPad = 24;
  const chartH = nRows * (barH + gap);
  const H = topPad + chartH + botPad;                 // desktop≈340 / mob≈260
  const ribbonW = 26, ribbonGap = mob ? 8 : 12;
  const pyrW = W - ribbonW - ribbonGap;
  const labelW = mob ? 34 : 40;
  const chartW = (pyrW - labelW) / 2;
  const cxL = chartW, cxR = chartW + labelW;
  // xスケールは県/全国/ピンの最大%で共通化
  const maxPct = Math.max(...P.m, ...P.f, ...N.m, ...N.f, ...(G ? [...G.m, ...G.f] : [0])) || 1;
  const xs = chartW / maxPct;
  const rowY = (i) => topPad + (nRows - 1 - i) * (barH + gap); // 高齢帯が上（頭でっかちが上で結像）
  const y65 = rowY(13) + barH + gap / 2;              // 65-69行の下端
  const y75 = rowY(15) + barH + gap / 2;              // 75-79行の下端
  const trBar = reduced ? undefined : { transition: 'x 300ms ease, width 300ms ease' };
  const trRib = reduced ? undefined : { transition: 'y 400ms ease, height 400ms ease' };

  // 形状要約チップ: 75+割合の全国比Δpt
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const d75 = (sum(P.m.slice(15)) + sum(P.f.slice(15))) - (sum(N.m.slice(15)) + sum(N.f.slice(15)));
  const shape = d75 >= 1 ? { t: `頭でっかち +${d75.toFixed(1)}pt`, bg: '#fef3c7', c: '#92400e' }
    : d75 <= -1 ? { t: `生産年齢厚め ${d75.toFixed(1)}pt`, bg: '#e0e7ff', c: '#3730a3' }
    : { t: `全国並みの形 ${d75 >= 0 ? '+' : ''}${d75.toFixed(1)}pt`, bg: '#f1f5f9', c: '#475569' };

  const isFut = tlYear !== '2025';
  const ribbon = tlBands ? [
    { k: 'b75', label: '75+', c: ZONE.z75, tc: '#7c2d12', v: tlBands.b75 },
    { k: 'b6574', label: '65-74', c: ZONE.z6574, tc: '#78350f', v: tlBands.b6574 },
    { k: 'b064', label: '0-64', c: '#e2e8f0', tc: '#475569', v: tlBands.b064 },
  ] : null;

  // hover同期は単一 onMouseMove の最近傍y探索（行個別リスナー回避 — PrefStrip47と同流儀）
  const posFromEvent = (e) => {
    const el = holderRef.current; if (!el) return null;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const vx = px / rect.width * W, vy = py / rect.height * H;
    if (vx > pyrW) return null;                       // リボン域は native <title> に委ねる
    const row = Math.floor((vy - topPad) / (barH + gap));
    if (row < 0 || row >= nRows) return null;
    return { idx: nRows - 1 - row, px, py };
  };
  const handleMove = (e) => setHover(posFromEvent(e));
  const handleLeave = () => setHover(null);
  const handleClick = (e) => {                        // タッチ2段階: 1タップ=帯情報 / ゾーン帯タップ=ダンベル展開
    const p = posFromEvent(e); if (!p) return;
    if (p.idx >= 13 && typeof onZoneClick === 'function') { onZoneClick(); return; }
    setHover(prev => (prev && prev.idx === p.idx ? null : p));
  };

  return (
    <div style={{ width: '100%' }}>
      {/* ヘッダ: タイトル + 年度バッジ + 形状要約チップ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>人口ピラミッド — {prefName} vs 全国</span>
        <Badge b={yearBadges.pyramid} />
        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: shape.bg, color: shape.c }}>{shape.t}</span>
        <span style={{ fontSize: 9, color: '#94a3b8' }}>75+割合の全国比</span>
      </div>
      <div ref={holderRef} style={{ position: 'relative', width: '100%' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', userSelect: 'none', touchAction: 'manipulation', cursor: 'pointer' }}
          role="img" aria-label={`${prefName}の人口ピラミッド（%正規化・全国ゴースト重畳）${yearBadges.pyramid.label}`}
          onMouseMove={handleMove} onMouseLeave={handleLeave} onClick={handleClick}>
          {/* 高齢帯ゾーン（行背景・click=47県ダンベル展開）— タイムレンズBANDSと同色語彙 */}
          <rect x={0} y={rowY(nRows - 1)} width={pyrW} height={(nRows - 15) * (barH + gap)} fill={ZONE.z75} opacity={0.15} />
          <rect x={0} y={rowY(14)} width={pyrW} height={2 * (barH + gap)} fill={ZONE.z6574} opacity={0.12} />
          <line x1={0} x2={pyrW} y1={y75} y2={y75} stroke={ZONE.z75} strokeWidth={1} opacity={0.8} />
          <line x1={0} x2={pyrW} y1={y65} y2={y65} stroke={ZONE.z6574} strokeWidth={1} opacity={0.9} />
          <text x={2} y={y75 - 2.5} fontSize={6.5} fontWeight={700} fill="#9a3412">75歳</text>
          <text x={2} y={y65 - 2.5} fontSize={6.5} fontWeight={700} fill="#b45309">65歳</text>
          {/* 21階級ミラーバー: 県=塗り / 全国=輪郭ゴースト / ピン県=橙破線輪郭 */}
          {ageGroups.map((ag, i) => {
            const y = rowY(i);
            const pm = P.m[i] * xs, pf = P.f[i] * xs;
            const nm = N.m[i] * xs, nf = N.f[i] * xs;
            return (
              <g key={i}>
                {hover?.idx === i && <rect x={0} y={y - 0.5} width={pyrW} height={barH + 1} fill="#1e293b" opacity={0.07} />}
                <rect x={cxL - pm} y={y} width={pm} height={barH} rx={1.5} fill={SEX.m} opacity={0.78} style={trBar} />
                <rect x={cxR} y={y} width={pf} height={barH} rx={1.5} fill={SEX.f} opacity={0.78} style={trBar} />
                <rect x={cxL - nm} y={y + 0.5} width={nm} height={barH - 1} fill="none" stroke={GHOST} strokeWidth={1.2} style={trBar} />
                <rect x={cxR} y={y + 0.5} width={nf} height={barH - 1} fill="none" stroke={GHOST} strokeWidth={1.2} style={trBar} />
                {G && <rect x={cxL - G.m[i] * xs} y={y + 1} width={G.m[i] * xs} height={barH - 2} fill="none" stroke={PIN} strokeWidth={1.2} strokeDasharray="3 2" style={trBar} />}
                {G && <rect x={cxR} y={y + 1} width={G.f[i] * xs} height={barH - 2} fill="none" stroke={PIN} strokeWidth={1.2} strokeDasharray="3 2" style={trBar} />}
                {(!mob || i % 2 === 0) && <text x={cxL + labelW / 2} y={y + barH - (mob ? 1.5 : 3)} textAnchor="middle" fontSize={mob ? 6.5 : 7.5} fill="#94a3b8">{ag}</text>}
              </g>
            );
          })}
          {/* 軸ラベル + %スケール（各系列とも自総人口比） */}
          <text x={chartW / 2} y={H - 6} textAnchor="middle" fontSize={9} fontWeight={600} fill={SEX.m}>男性</text>
          <text x={cxR + chartW / 2} y={H - 6} textAnchor="middle" fontSize={9} fontWeight={600} fill={SEX.f}>女性</text>
          <text x={0} y={H - 6} textAnchor="start" fontSize={6.5} fill="#cbd5e1">{maxPct.toFixed(1)}%</text>
          <text x={pyrW} y={H - 6} textAnchor="end" fontSize={6.5} fill="#cbd5e1">{maxPct.toFixed(1)}%</text>
          {/* 社人研3帯リボン（右ガター・tlYear連動モーフ）— 形状は動かさず帯だけ未来へ */}
          {ribbon && (() => {
            const x0 = W - ribbonW;
            let acc = 0;
            return (
              <g>
                <text x={x0 + ribbonW / 2} y={topPad - 6} textAnchor="middle" fontSize={7.5} fontWeight={700} fill={isFut ? '#b45309' : '#64748b'}>{tlYear}</text>
                {ribbon.map(seg => {
                  const hgt = Math.max(0, seg.v / 100 * chartH);
                  const y = topPad + acc; acc += hgt;
                  return (
                    <g key={seg.k}>
                      <rect x={x0} y={y} width={ribbonW} height={hgt} fill={seg.c} style={trRib}>
                        <title>{`${seg.label}歳 ${seg.v.toFixed(1)}%（社人研 ${tlYear}年推計）`}</title>
                      </rect>
                      {hgt >= 14 && <text x={x0 + ribbonW / 2} y={y + hgt / 2 + 2.5} textAnchor="middle" fontSize={6.5} fontWeight={700} fill={seg.tc} style={trRib} pointerEvents="none">{seg.v.toFixed(0)}%</text>}
                    </g>
                  );
                })}
                <rect x={x0} y={topPad} width={ribbonW} height={chartH} fill="none" stroke={isFut ? '#fbbf24' : '#e2e8f0'} strokeWidth={1} rx={2} />
              </g>
            );
          })()}
        </svg>
        {/* 帯ツールチップ（SVG外の absolute div — overflow事故回避） */}
        {hover && (() => {
          const i = hover.idx;
          const pPct = P.m[i] + P.f[i], nPct = N.m[i] + N.f[i], d = pPct - nPct;
          return (
            <div style={{ position: 'absolute', left: hover.px, top: Math.max(0, hover.py - 8), transform: 'translate(-50%,-100%)',
              background: '#1e293b', color: '#fff', fontSize: 10, lineHeight: 1.5, padding: '5px 8px', borderRadius: 4,
              whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}>
              <span style={{ fontWeight: 700 }}>{ageGroups[i]}歳</span>
              <span style={{ color: '#cbd5e1', marginLeft: 6 }}>男 {(ap.male?.[i] || 0).toLocaleString()} / 女 {(ap.female?.[i] || 0).toLocaleString()}人</span>
              <div>県 <span style={{ color: '#93c5fd', fontWeight: 700 }}>{pPct.toFixed(1)}%</span> vs 全国 {nPct.toFixed(1)}%
                <span style={{ color: d >= 0 ? '#fda4af' : '#a5b4fc', fontWeight: 700 }}> {d >= 0 ? '+' : ''}{d.toFixed(1)}pt</span></div>
              {G && pinnedName && <div style={{ color: '#fdba74' }}>◆ {pinnedName} {(G.m[i] + G.f[i]).toFixed(1)}%</div>}
              {i >= 13 && <div style={{ color: '#94a3b8' }}>{i >= 15 ? '75+' : '65-74'}帯 — クリックで47県ダンベル展開</div>}
            </div>
          );
        })()}
      </div>
      {/* 凡例 + 誠実性キャプション */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 9, color: '#64748b', marginTop: 5, alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: SEX.m, display: 'inline-block' }} /><span style={{ width: 9, height: 9, borderRadius: 2, background: SEX.f, display: 'inline-block' }} />塗り={prefName}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><span style={{ width: 9, height: 9, borderRadius: 2, border: `1.2px solid ${GHOST}`, display: 'inline-block' }} />輪郭=全国</span>
        {G && pinnedName && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#c2410c' }}><span style={{ width: 9, height: 9, borderRadius: 2, border: `1.2px dashed ${PIN}`, display: 'inline-block' }} />◆ {pinnedName}</span>}
        <span>各系列は自らの総人口で%正規化</span>
      </div>
      <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3, lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {ribbon && <Badge b={yearBadges.ribbon} fs={8} />}
        <span>形状は2025実測（住基）で固定{ribbon ? ` — 将来（${isFut ? tlYear + '年' : 'スクラバー選択年'}）は右端の社人研3帯推計リボンのみがモーフ。21階級の将来形状は推計データに存在しないため描画しない。` : '。'}高齢帯ゾーンのクリック=47県ダンベル展開。</span>
      </div>
    </div>
  );
}
