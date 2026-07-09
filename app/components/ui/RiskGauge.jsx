'use client';
import { useState, useRef } from 'react';

// ── Layer2 B. リスクメーター盤の半円アークゲージ（純表示・データ依存なし） ──
// 規約踏襲（PrefStrip47 → 新部品の規約共有）:
//   ・角度=47県min-max内の相対位置エンコーディング — 誤読防止のためアーク両端にmin/max実値を
//     常設し、ツールチップ/値表示は常に実値+順位（角度だけの印象値にしない）
//   ・yearBadge はボード（呼び出し側ヘッダ）で必須表示 — 本部品は表示専任
//   ・ゴースト針: hover県=slate破線（hover=情報+hoverPref同期）／◆ピン県=橙実線（ピン=比較）
//   ・針色=呼び出し側の cmpLabel 閾値ロジック（リスク成立指標の赤琥珀緑）を color prop で受ける
//   ・prefers-reduced-motion は reduced prop 経由で針回転 transition を停止
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export default function RiskGauge({
  value,            // 当県値（針）
  natAvg,           // 全国（47県平均）tick
  p10, p90,         // 47県 P10-P90 内帯
  min, max,         // 47県 min-max（アーク全域）
  rank,             // 当県の 47県中順位（高い順）
  color,            // 針色（cmp閾値: slate/琥珀/赤/緑）
  hoverValue = null, hoverName = null,   // hoverPref 県のゴースト針
  pinValue = null, pinName = null,       // ◆ピン県のゴースト針
  values = null,    // [{pref, value}] — アークスクラブの最近傍県探索用（省略可）
  onScrub,          // (pref|null) => void — 最近傍県を親へ（hoverPref 同期）
  onJump,           // () => void — ゲージclick=分布ドロワーへ（既存 binsJumpTo 文法）
  unit = '%',
  prefName,
  reduced = false,
  mob = false,
}) {
  const [tip, setTip] = useState(null); // {x, label} スクラブ中の最近傍県
  const svgRef = useRef(null);
  if (value == null || !isFinite(value) || min == null || max == null || !(max > min)) return null;

  const W = 160, H = 92, CX = 80, CY = 82, R = 54, SW = 10;
  const tOf = (v) => clamp01((v - min) / (max - min));
  // 弧上の点（t=0 左端 → t=1 右端）
  const pt = (t, r = R) => {
    const phi = Math.PI * (1 - t);
    return { x: CX + r * Math.cos(phi), y: CY - r * Math.sin(phi) };
  };
  const arcPath = (t0, t1, r = R) => {
    const a = pt(t0, r), b = pt(t1, r);
    return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  };
  const needleDeg = 180 * tOf(value);
  const fmt1 = (v) => (v != null && isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) : '—');

  // アークスクラブ: マウス角度→値→最近傍県（PrefStrip47 の最近傍x探索と同思想）
  const handleMove = (e) => {
    if (!values || !values.length || !svgRef.current) return;
    const bb = svgRef.current.getBoundingClientRect();
    const sx = (e.clientX - bb.left) / bb.width * W;
    const sy = (e.clientY - bb.top) / bb.height * H;
    const ang = Math.atan2(CY - sy, sx - CX); // 0..π が上半面
    if (ang < -0.15) { setTip(null); if (onScrub) onScrub(null); return; }
    const t = clamp01(1 - ang / Math.PI);
    const target = min + t * (max - min);
    let best = null, bd = Infinity;
    values.forEach((d) => {
      if (d.value == null) return;
      const dd = Math.abs(d.value - target);
      if (dd < bd) { bd = dd; best = d; }
    });
    if (best) {
      const bp = pt(tOf(best.value), R + SW / 2 + 2);
      setTip({ x: bp.x, label: `${best.pref} ${fmt1(best.value)}${unit}` });
      if (onScrub) onScrub(best.pref);
    }
  };
  const handleLeave = () => { setTip(null); if (onScrub) onScrub(null); };

  const needle = (v, stroke, dash, width, len = R - SW / 2 - 3) => (
    <g style={{ transform: `rotate(${180 * tOf(v)}deg)`, transformOrigin: `${CX}px ${CY}px`,
                transition: reduced ? 'none' : 'transform 400ms ease' }}>
      <line x1={CX} y1={CY} x2={CX - len} y2={CY} stroke={stroke} strokeWidth={width}
        strokeDasharray={dash || 'none'} strokeLinecap="round" />
    </g>
  );

  const natT = natAvg != null ? tOf(natAvg) : null;
  const natIn = natT != null ? pt(natT, R - SW / 2 - 1) : null;
  const natOut = natT != null ? pt(natT, R + SW / 2 + 1) : null;
  const natLab = natT != null ? pt(natT, R + SW / 2 + 8) : null;

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height="auto"
        style={{ display: 'block', cursor: onJump ? 'pointer' : 'default', touchAction: 'manipulation', overflow: 'visible' }}
        role="img" aria-label={`${prefName || ''} ${fmt1(value)}${unit}（47県中${rank != null ? rank : '—'}位・全国 ${fmt1(natAvg)}${unit}）のリスクゲージ`}
        onMouseMove={mob ? undefined : handleMove} onMouseLeave={mob ? undefined : handleLeave}
        onClick={() => { if (onJump) onJump(); }}>
        {/* ①トラック（47県 min-max 全域） */}
        <path d={arcPath(0, 1)} fill="none" stroke="#f1f5f9" strokeWidth={SW} />
        {/* ②P10-P90 内帯 */}
        {p10 != null && p90 != null && p90 > p10 && (
          <path d={arcPath(tOf(p10), tOf(p90))} fill="none" stroke="#e2e8f0" strokeWidth={SW} />
        )}
        {/* ③全国平均 tick（黒鉛線 2.5px） */}
        {natIn && natOut && (
          <g>
            <line x1={natIn.x} y1={natIn.y} x2={natOut.x} y2={natOut.y} stroke="#334155" strokeWidth={2.5} strokeLinecap="round">
              <title>{`全国（47県平均）${fmt1(natAvg)}${unit}`}</title>
            </line>
            {!mob && natLab && <text x={natLab.x} y={natLab.y} fontSize={7.5} fontWeight={600} fill="#64748b"
              textAnchor={natT > 0.55 ? 'start' : natT < 0.45 ? 'end' : 'middle'}>全国</text>}
          </g>
        )}
        {/* ⑦ゴースト針: hover県=slate破線 / ◆ピン県=橙実線 */}
        {hoverValue != null && isFinite(hoverValue) && needle(hoverValue, '#64748b', '3 2.5', 1.4)}
        {pinValue != null && isFinite(pinValue) && (
          <g>
            {needle(pinValue, '#f97316', null, 1.6)}
            <title>{`◆${pinName || ''} ${fmt1(pinValue)}${unit}`}</title>
          </g>
        )}
        {/* ④当県針（cmp 閾値色・回転 transition） */}
        {needle(value, color || '#64748b', null, 3)}
        <circle cx={CX} cy={CY} r={4} fill={color || '#64748b'} />
        <circle cx={CX} cy={CY} r={1.6} fill="#fff" />
        {/* ⑥アーク両端の min/max 実値（角度=相対位置の誤読防止） */}
        <text x={CX - R} y={CY + 9} fontSize={8} fill="#94a3b8" textAnchor="middle">{fmt1(min)}</text>
        <text x={CX + R} y={CY + 9} fontSize={8} fill="#94a3b8" textAnchor="middle">{fmt1(max)}</text>
      </svg>
      {/* スクラブ中の最近傍県ラベル（軽量・濃紺） */}
      {tip && (
        <div style={{ position: 'absolute', left: `${tip.x / W * 100}%`, top: -2, transform: 'translate(-50%,-100%)',
          background: '#1e293b', color: '#fff', fontSize: 9.5, padding: '3px 7px', borderRadius: 4,
          whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 20 }}>
          {tip.label}
        </div>
      )}
    </div>
  );
}
