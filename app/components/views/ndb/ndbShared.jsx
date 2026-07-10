'use client';
import { useState, useId } from 'react';
import { PREF_ORDER } from '../../shared';
import { useCountUp, CountUpNum } from '../../ui/vizHooks';
import { getSourceBadge } from '../../../../lib/sourceRegistry';
import { tierOf } from '../../../../lib/domainMapping';

// rank1: 47都道府県ホワイトリスト（「都道府県判別不可」「全国」等の擬似県を分布から除外）
export const PREF47_SET = new Set(PREF_ORDER);
export const isP47 = (p) => PREF47_SET.has(p);
// yearBadge（PrefStrip47 必須prop）: SOURCE_REGISTRY から {label:year, color}
export const yb = (k) => { const s = getSourceBadge(k); return { label: s.year, color: s.color }; };
// 運動フック(useCountUp/CountUpNum/useFlipRows/prefersReducedMotion)は ui/vizHooks.js へ抽出し共有。
// 挙動不変(同一実装を移設しただけ)。他ビュー(Map/Muni/Area)も同importを再利用する。
// ── Layer3 ユニットドット・レーン（人間換算 1ドット=1回 の折返しドット列） ──
// 規約踏襲（PrefStrip47 → 新部品の規約共有）:
//   ・端数/域外は clipPath 横幅比の部分塗りで表示し値は捏造しない — ツールチップは常に小数1桁実値
//   ・全国tick=#2563EB破線+▽（PrefStrip47 の avg 語彙）／◆ピン=#f97316・縁#c2410c
//   ・充填は useCountUp のアニメ値からドット数を導出 — ジャンボ数字（CountUpNum）と同一の
//     400ms easeOutCubic で同期し、prefers-reduced-motion では瞬時
// 色意味論: 基準部 min(県,全国)=slate#94a3b8塗り／超過(全国→県)=rose#9f1239塗り／
//           不足(県→全国)=indigo#4338ca中抜き輪郭 — rose/indigoはFP_TIERS両端と同一の中立発散
//           （solid/hollow の形状差併用で色覚多様性にも頑健）。良し悪しの色ではない。
export const UnitDotLane = ({ value, natValue, pinnedValue = null, perRow = 12, natLabel, mob, prefName, pinnedName, rank, unitLabel }) => {
  const anim = useCountUp(value);               // ジャンボ数字と同一アニメ値（400ms easeOutCubic）
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, ''); // clipPath id（SSR安全）
  const [hover, setHover] = useState(false);
  if (value == null || !isFinite(value) || natValue == null || !isFinite(natValue)) return null;
  const R = 4.5, PITCH = 13, PAD = 2;
  const a = Math.max(0, anim != null && isFinite(anim) ? anim : value);
  const n = Math.max(0, natValue);
  const total = Math.max(1, Math.ceil(Math.max(value, n) - 1e-9)); // 目標ベース=アニメ中もレイアウト安定
  const rows = Math.ceil(total / perRow);
  const topPad = 14;                            // ▽キャレット+全国ラベル帯
  const hasPin = pinnedValue != null && isFinite(pinnedValue);
  const W = perRow * PITCH + PAD * 2;
  const H = topPad + rows * PITCH + (hasPin ? 12 : 2);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const deficit = value < n - 1e-9;             // 目標ベース（アニメ過渡で輪郭を明滅させない）
  // 実数位置 → {row, x}（perRow の整数倍ちょうどは前行の右端に置く）
  const posOf = (v) => {
    const vv = Math.max(0, Math.min(total, v));
    let row = Math.floor(vv / perRow), dx = vv - row * perRow;
    if (dx === 0 && row > 0) { row -= 1; dx = perRow; }
    if (row > rows - 1) { row = rows - 1; dx = perRow; }
    return { row, x: PAD + dx * PITCH, yTop: topPad + row * PITCH, yBot: topPad + (row + 1) * PITCH };
  };
  const natPos = posOf(n);
  const pinPos = hasPin ? posOf(Math.max(0, pinnedValue)) : null;
  const dots = [];
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / perRow);
    const cx = PAD + (i - row * perRow) * PITCH + PITCH / 2;
    const cy = topPad + row * PITCH + PITCH / 2;
    const slate = clamp01(Math.min(a, n) - i);                       // 基準部の充填率
    const roseS = clamp01(n - i), roseE = a > n ? clamp01(a - i) : 0; // 超過部の区間
    const hollow = deficit && i < Math.ceil(n - 1e-9) && (i + 1) > Math.min(value, n) - 1e-9;
    dots.push({ i, cx, cy, slate, roseS, roseE, hollow });
  }
  const partialSlate = dots.filter((d) => d.slate > 0.001 && d.slate < 0.999);
  const partialRose = dots.filter((d) => (d.roseE - d.roseS) > 0.001 && !(d.roseS <= 0.001 && d.roseE >= 0.999));
  const natLabelX = Math.max(18, Math.min(W - 18, natPos.x));
  const fmt1 = (v) => (v != null && isFinite(v) ? v.toFixed(1) : '—');
  const diffNat = value - n;
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={() => setHover((h) => !h)}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', maxWidth: '100%', cursor: 'pointer', touchAction: 'manipulation' }}
        role="img" aria-label={`${prefName || ''} ${fmt1(value)}${unitLabel || ''}（全国 ${fmt1(n)}）のユニットドット表示`}>
        <defs>
          {partialSlate.map((d) => (
            <clipPath key={`s${d.i}`} id={`${uid}s${d.i}`}>
              <rect x={d.cx - R} y={d.cy - R} width={2 * R * d.slate} height={2 * R} />
            </clipPath>
          ))}
          {partialRose.map((d) => (
            <clipPath key={`r${d.i}`} id={`${uid}r${d.i}`}>
              <rect x={d.cx - R + 2 * R * d.roseS} y={d.cy - R} width={2 * R * (d.roseE - d.roseS)} height={2 * R} />
            </clipPath>
          ))}
        </defs>
        {dots.map((d) => {
          const roseLen = d.roseE - d.roseS;
          const roseFull = d.roseS <= 0.001 && d.roseE >= 0.999;
          return (
            <g key={d.i}>
              {d.hollow && <circle cx={d.cx} cy={d.cy} r={R - 0.75} fill="none" stroke="#4338ca" strokeWidth={1.5} opacity={0.85} />}
              {d.slate >= 0.999
                ? <circle cx={d.cx} cy={d.cy} r={R} fill="#94a3b8" />
                : d.slate > 0.001 && <g clipPath={`url(#${uid}s${d.i})`}><circle cx={d.cx} cy={d.cy} r={R} fill="#94a3b8" /></g>}
              {roseLen > 0.001 && (roseFull
                ? <circle cx={d.cx} cy={d.cy} r={R} fill="#9f1239" />
                : <g clipPath={`url(#${uid}r${d.i})`}><circle cx={d.cx} cy={d.cy} r={R} fill="#9f1239" /></g>)}
            </g>
          );
        })}
        {/* 全国基準tick（青破線+▽+ラベル — PrefStrip47 の avg 語彙） */}
        <line x1={natPos.x} x2={natPos.x} y1={natPos.yTop + 0.5} y2={natPos.yBot - 0.5}
          stroke="#2563EB" strokeWidth={1.2} strokeDasharray="2 2" opacity={0.85} />
        <path d={`M ${natPos.x - 3.2} ${natPos.yTop - 4.5} L ${natPos.x + 3.2} ${natPos.yTop - 4.5} L ${natPos.x} ${natPos.yTop - 0.5} Z`}
          fill="#2563EB" opacity={0.9} />
        {natPos.row === 0 && natLabel && (
          <text x={natLabelX} y={topPad - 6.5} fontSize={8} fontWeight={600} fill="#2563EB" textAnchor="middle">{natLabel}</text>
        )}
        {/* ◆ピン県tick（橙 — PrefStrip47 のピン語彙） */}
        {pinPos && (
          <g>
            <line x1={pinPos.x} x2={pinPos.x} y1={pinPos.yTop + 0.5} y2={pinPos.yBot - 0.5}
              stroke="#f97316" strokeWidth={1.2} opacity={0.85} />
            <path d={`M ${pinPos.x} ${pinPos.yBot + 1} L ${pinPos.x + 4} ${pinPos.yBot + 5} L ${pinPos.x} ${pinPos.yBot + 9} L ${pinPos.x - 4} ${pinPos.yBot + 5} Z`}
              fill="#f97316" stroke="#c2410c" strokeWidth={1}>
              <title>{`◆${pinnedName || ''} ${fmt1(pinnedValue)}`}</title>
            </path>
          </g>
        )}
      </svg>
      {/* 濃紺ツールチップ（hover / タッチ1タップ・実値は常に小数1桁） */}
      {hover && (
        <div style={{ position: 'absolute', left: '50%', top: -4, transform: 'translate(-50%,-100%)',
          background: '#1e293b', color: '#fff', fontSize: 10, lineHeight: 1.5, padding: '5px 8px',
          borderRadius: 4, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 20,
          boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}>
          <div>
            <b>{prefName}</b> <span style={{ color: '#93c5fd', fontWeight: 700 }}>{fmt1(value)}{unitLabel}</span>
            <span style={{ color: '#cbd5e1' }}>（全国 {fmt1(n)}・差 {diffNat > 0 ? '+' : ''}{fmt1(diffNat)}回{rank != null ? `・47県中${rank}位` : ''}）</span>
          </div>
          {hasPin && (
            <div style={{ color: '#fdba74' }}>
              ◆{pinnedName} {fmt1(pinnedValue)}回（差 {(value - pinnedValue) > 0 ? '+' : ''}{fmt1(value - pinnedValue)}回）
            </div>
          )}
        </div>
      )}
    </div>
  );
};
// ── Layer3 受診リズム・イヤートラック「県民の1年」 ──
// 年間総数の均等割り換算で12ヶ月時間軸にドットを配置する模式図。月次・季節分布は
// データに存在しない — 『均等割り模式』マイクロバッジ+脚注で明示（guardrail①）。
// 値の正は常にツールチップ小数1桁実値・端数はclipPath部分塗り（UnitDotLane技法移植・捏造しない）。
// hoverPref同期: 他ストリップで県をなぞるとトラックがその県の値へ400msモーフ（useCountUp転用）。
// ドット本体は中立色のみ（rose/indigoは差分数値ラベル限定 — 時間的アーティファクト回避・guardrail⑤）。
export const RHYTHM_X0 = 8, RHYTHM_X1 = 592, RHYTHM_W = 600;
export const rhythmX = (tMonth) => RHYTHM_X0 + (Math.max(0, Math.min(12, tMonth)) / 12) * (RHYTHM_X1 - RHYTHM_X0);
// 会計年度の月ラベル（4月始まり）: index 0=4月 … 11=3月
export const RHYTHM_MONTHS = [['0','4月'],['3','7月'],['6','10月'],['9','1月'],['11','3月']];
export const RhythmLane = ({ lane, mob, prefName, hoverPrefName, pinnedName }) => {
  const dispTarget = lane.hoverValue ?? lane.value;
  const anim = useCountUp(dispTarget);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [tip, setTip] = useState(false);
  if (lane.value == null || !isFinite(lane.value) || lane.natValue == null) return null;
  const v = Math.max(0.001, anim != null && isFinite(anim) ? anim : dispTarget);
  const n = Math.max(0.001, lane.natValue);
  const R = mob ? 3.4 : 4.2;
  const hasPin = lane.pinnedValue != null && isFinite(lane.pinnedValue) && lane.pinnedValue > 0;
  const H = hasPin ? 58 : 46;
  const yMain = 15, yGhost = 33, yPin = 49;
  // 等間隔リズム配置: t_i=(i+0.5)×12/v ヶ月。端数ドットはclipPath部分塗り（右端クランプ）
  const dotsOf = (val) => {
    const full = Math.floor(val + 1e-9);
    const frac = val - full;
    const out = [];
    for (let i = 0; i < Math.min(full, 400); i++) out.push({ t: (i + 0.5) * 12 / val, frac: 1 });
    if (frac > 0.01 && full < 400) out.push({ t: Math.min(11.85, (full + 0.5) * 12 / val), frac });
    return out;
  };
  const mainDots = dotsOf(v);
  const ghostDots = dotsOf(n);
  const pinDots = hasPin ? dotsOf(lane.pinnedValue) : [];
  const weeks = 52 / (lane.hoverValue ?? lane.value);
  const natWeeks = 52 / n;
  const fmt1 = (x) => (x != null && isFinite(x) ? x.toFixed(1) : '—');
  const diff = (lane.hoverValue ?? lane.value) - n;
  const t = tierOf(((lane.hoverValue ?? lane.value) / n - 1) * 100);
  const partial = (arr) => arr.filter(d => d.frac < 0.999);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : '158px 1fr 128px', gap: mob ? 2 : 10, alignItems: 'center',
      padding: '7px 0', borderTop: lane.sep ? '1px dashed #e2e8f0' : 'none', background: lane.sep ? '#fafbff' : 'transparent', borderRadius: lane.sep ? 8 : 0 }}>
      {/* 左: レーンラベル + 週数（mobはインライン化） */}
      <div style={{ paddingLeft: lane.sep ? 8 : 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#1e293b' }}>
          {lane.label}
          <span style={{ marginLeft: 5, fontSize: 8.5, fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>{lane.denomBadge}</span>
        </div>
        <div style={{ fontSize: mob ? 11 : 10, color: '#475569', marginTop: 1 }}>
          <b style={{ fontSize: mob ? 13 : 12, color: weeks < natWeeks ? '#9f1239' : weeks > natWeeks ? '#4338ca' : '#475569', fontVariantNumeric: 'tabular-nums' }}>
            <CountUpNum value={weeks} decimals={1} />週</b>に1回
          <span style={{ color: '#94a3b8' }}>（全国 {fmt1(natWeeks)}週）</span>
        </div>
      </div>
      {/* 中央: リズムトラックSVG（県ドット行 + 全国ゴースト行 + ◆ピン行） */}
      <div style={{ position: 'relative' }}
        onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)} onClick={() => setTip(x => !x)}>
        <svg viewBox={`0 0 ${RHYTHM_W} ${H}`} width="100%" height="auto"
          style={{ display: 'block', touchAction: 'manipulation', cursor: 'default' }}
          role="img" aria-label={`${prefName} ${lane.label} 年${fmt1(lane.value)}${lane.unit}（全国 ${fmt1(n)}）の受診リズム`}>
          <defs>
            {partial(mainDots).map((d, i) => (
              <clipPath key={i} id={`${uid}m${i}`}>
                <rect x={rhythmX(d.t) - R} y={yMain - R} width={2 * R * d.frac} height={2 * R} />
              </clipPath>
            ))}
          </defs>
          {/* 月グリッド */}
          {Array.from({ length: 13 }, (_, m) => (
            <line key={m} x1={rhythmX(m)} x2={rhythmX(m)} y1={4} y2={H - 4} stroke="#eef2f7" strokeWidth={m === 0 || m === 12 ? 1.4 : 1} />
          ))}
          {/* 県ドット行（中立slate） */}
          {mainDots.map((d, i) => d.frac >= 0.999
            ? <circle key={`m${i}`} cx={rhythmX(d.t)} cy={yMain} r={R} fill="#64748b" />
            : <g key={`m${i}`} clipPath={`url(#${uid}m${partial(mainDots).indexOf(d)})`}><circle cx={rhythmX(d.t)} cy={yMain} r={R} fill="#64748b" /></g>)}
          {/* 全国ゴースト行（青アウトライン破線 = PrefStrip47のavg語彙拡張） */}
          {ghostDots.map((d, i) => (
            <circle key={`g${i}`} cx={rhythmX(d.t)} cy={yGhost} r={R - 0.6} fill="none" stroke="#2563EB"
              strokeWidth={1.2} strokeDasharray="2 1.6" opacity={0.75 * Math.max(0.35, d.frac)} />
          ))}
          {/* ◆ピン県行（橙ダイヤ） */}
          {pinDots.map((d, i) => {
            const x = rhythmX(d.t);
            return <path key={`p${i}`} d={`M ${x} ${yPin - 3.6} L ${x + 3.6} ${yPin} L ${x} ${yPin + 3.6} L ${x - 3.6} ${yPin} Z`}
              fill="#f97316" stroke="#c2410c" strokeWidth={0.8} opacity={Math.max(0.4, d.frac)} />;
          })}
          {/* 行ラベル（svg内左端・8px） */}
          <text x={RHYTHM_X0} y={yMain - R - 2.5} fontSize={8} fill="#94a3b8">{hoverPrefName && lane.hoverValue != null ? hoverPrefName : prefName}</text>
          <text x={RHYTHM_X0} y={yGhost - R - 2} fontSize={8} fill="#2563EB" opacity={0.8}>全国</text>
          {hasPin && <text x={RHYTHM_X0} y={yPin - 6} fontSize={8} fill="#c2410c">◆{pinnedName}</text>}
        </svg>
        {tip && (
          <div style={{ position: 'absolute', left: '50%', top: -6, transform: 'translate(-50%,-100%)',
            background: '#1e293b', color: '#fff', fontSize: 10, lineHeight: 1.5, padding: '5px 9px',
            borderRadius: 4, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 20 }}>
            <div><b>{hoverPrefName && lane.hoverValue != null ? hoverPrefName : prefName}</b>{' '}
              <span style={{ color: '#93c5fd', fontWeight: 700 }}>{fmt1(lane.hoverValue ?? lane.value)}{lane.unit}</span>
              <span style={{ color: '#cbd5e1' }}>（全国 {fmt1(n)}・差 {diff > 0 ? '+' : ''}{fmt1(diff)}回{lane.rank != null && lane.hoverValue == null ? `・47県中${lane.rank}位` : ''}）</span></div>
            <div style={{ color: '#cbd5e1' }}>≒ {fmt1(weeks)}週に1回（全国 {fmt1(natWeeks)}週に1回）</div>
            {hasPin && <div style={{ color: '#fdba74' }}>◆{pinnedName} {fmt1(lane.pinnedValue)}{lane.unit}</div>}
          </div>
        )}
      </div>
      {/* 右: tierことばチップ + 年差分（mobは非表示 — 左列にインライン済） */}
      {!mob && (
        <div style={{ textAlign: 'right' }}>
          {t && <div><span style={{ fontSize: 9.5, fontWeight: 700, color: t.color, background: t.color + '14', border: `1px solid ${t.color}33`, padding: '1px 6px', borderRadius: 4 }}>{t.label}</span></div>}
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
            年{diff > 0 ? '+' : ''}{fmt1(diff)}回 <span style={{ color: '#94a3b8' }}>vs全国</span>
          </div>
          {lane.reframe && <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{lane.reframe}</div>}
        </div>
      )}
    </div>
  );
};
export const YearRhythmTrack = ({ lanes, mob, prefName, hoverPrefName, pinnedName, yearBadge }) => {
  if (!lanes || !lanes.length) return null;
  return (
    <div style={{ background: '#fbfdff', border: '1px solid #e8eef6', borderRadius: 10, padding: mob ? '10px 10px 6px' : '12px 16px 8px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>🗓 県民の1年 — 受診リズム</span>
        <span title="年間総数を12ヶ月に均等割りした模式図です。実際の月次・季節分布はデータに存在しません"
          style={{ fontSize: 8.5, fontWeight: 600, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', padding: '1px 6px', borderRadius: 3 }}>均等割り模式</span>
        {yearBadge && <span style={{ fontSize: 8.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, border: `1px solid ${yearBadge.color}`, color: yearBadge.color, background: '#fff' }}>{yearBadge.label}</span>}
        {hoverPrefName && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', background: '#334155', padding: '1px 8px', borderRadius: 8 }}>→ {hoverPrefName} を表示中</span>}
        <span style={{ marginLeft: 'auto', fontSize: 9, color: '#94a3b8' }}>●{prefName} ・ ◌全国 ・ 1ドット=1回</span>
      </div>
      {/* 月軸ヘッダ（会計年度4月→3月） */}
      <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : '158px 1fr 128px', gap: mob ? 2 : 10 }}>
        {!mob && <div />}
        <svg viewBox={`0 0 ${RHYTHM_W} 14`} width="100%" height="auto" style={{ display: 'block' }} aria-hidden="true">
          {(mob ? [RHYTHM_MONTHS[0], RHYTHM_MONTHS[2], RHYTHM_MONTHS[4]] : RHYTHM_MONTHS).map(([m, l]) => (
            <text key={m} x={rhythmX(+m + 0.5)} y={10} fontSize={9} fill="#94a3b8" textAnchor="middle">{l}</text>
          ))}
        </svg>
        {!mob && <div />}
      </div>
      {lanes.map(l => <RhythmLane key={l.key} lane={l} mob={mob} prefName={prefName} hoverPrefName={hoverPrefName} pinnedName={pinnedName} />)}
    </div>
  );
};
// 受療率フィンガープリント色意味論(FP_TIERS/tierOf)は lib/domainMapping.js へ移設
// (手順1共有基盤: Bridge・新部品とことばチップ単一ソース化・循環import回避) — import参照。
export const CAT_LABELS = {'A_初再診料':'外来受診','B_医学管理等':'慢性疾患管理','C_在宅医療':'在宅医療'};
// Layer3 人間換算ユニット定義: ジャンボ数字 = 人口10万対 ÷ div。
// 分母はカテゴリで異なる（A/B=県民1人あたり・C=県民10人あたり）— フットノートに明記。
export const DIAG_UNIT = {
  'A_初再診料':   { div: 100000, denom: '県民1人あたり・年',  unit: '回/人・年',   dec: 1 },
  'B_医学管理等': { div: 100000, denom: '県民1人あたり・年',  unit: '回/人・年',   dec: 1 },
  'C_在宅医療':   { div: 10000,  denom: '県民10人あたり・年', unit: '回/10人・年', dec: 1 },
};
export const RISK_META = {
  'ヘモグロビン': {unit:'g/dL', note:'低値=貧血リスク', icon:'🩸'},
  '血清クレアチニン': {unit:'mg/dL', note:'高値=腎機能低下', icon:'🫘'},
  'eGFR': {unit:'mL/min', note:'60未満でCKD疑い', icon:'💧'},
};
// ── Layer2 B. リスク該当者率カード定義 — 分布ドロワーの指標タブと共用するため
//    Bセクション内IIFEからモジュールへ昇格（内容不変・非破壊） ──
export const RISK_CARDS = [
  { key: 'bmi_ge_25',              icon: '⚖️', label: 'BMI ≥25',          fullLabel: 'BMI ≥25 (肥満)',          color: '#f59e0b' },
  { key: 'hba1c_ge_6_5',           icon: '🍰', label: 'HbA1c ≥6.5',       fullLabel: 'HbA1c ≥6.5% (糖尿病型)',  color: '#dc2626' },
  { key: 'sbp_ge_140',             icon: '❤️', label: 'SBP ≥140',         fullLabel: '収縮期血圧 ≥140 mmHg',     color: '#ef4444' },
  { key: 'ldl_ge_140',             icon: '🩸', label: 'LDL ≥140',         fullLabel: 'LDL ≥140 mg/dL',           color: '#ec4899' },
  { key: 'urine_protein_ge_1plus', icon: '🫘', label: '尿蛋白 1+以上',   fullLabel: '尿蛋白 1+以上',            color: '#8b5cf6' },
];
// 分布ドロワー: 閾値超えバー用の一段濃い色（Bカード色の濃色版 — 二層色制の閾値層。
// 分布本体=slate中立・閾値以上のみリスク色 — BMI≥25等は臨床的に確立した「高=悪い」断面）
export const RISK_COLOR_DEEP = {
  bmi_ge_25: '#d97706', hba1c_ge_6_5: '#b91c1c', sbp_ge_140: '#dc2626',
  ldl_ge_140: '#db2777', urine_protein_ge_1plus: '#7c3aed',
};
// 薬効分類→疾患領域マッピング
export const DRUG_DOMAIN = {
  '糖尿病用剤':'糖尿病・代謝','高脂血症用剤':'循環器','血圧降下剤':'循環器','不整脈用剤':'循環器',
  '強心剤':'循環器','血管拡張剤':'循環器','利尿剤':'循環器',
  '気管支拡張剤':'呼吸器','鎮咳去たん剤':'呼吸器',
  '催眠鎮静剤，抗不安剤':'精神・神経','抗てんかん剤':'精神・神経','抗うつ剤':'精神・神経',
  '抗パーキンソン剤':'精神・神経','精神神経用剤':'精神・神経',
  '解熱鎮痛消炎剤':'整形・疼痛','副腎皮質ホルモン剤':'免疫・内分泌',
  '消化性潰瘍用剤':'消化器','制酸剤':'消化器','止しゃ剤，整腸剤':'消化器','下剤，浣腸剤':'消化器',
  '肝臓疾患用剤':'消化器','健胃消化剤':'消化器',
  '代謝拮抗剤':'がん','抗腫瘍性植物成分製剤':'がん','その他の腫瘍用薬':'がん',
  '抗ヒスタミン剤':'アレルギー','合成抗菌剤':'感染症','抗ウイルス剤':'感染症',
  '甲状腺，副甲状腺ホルモン剤':'内分泌','副腎ホルモン剤':'内分泌',
  '痛風治療剤':'代謝','腎臓ホルモン剤':'腎疾患',
};
export const DOMAIN_COLORS = {'循環器':'#dc2626','糖尿病・代謝':'#f59e0b','呼吸器':'#06b6d4','精神・神経':'#8b5cf6','整形・疼痛':'#059669','消化器':'#64748b','がん':'#be123c','免疫・内分泌':'#0891b2','アレルギー':'#f472b6','感染症':'#fb923c','内分泌':'#14b8a6','代謝':'#a3a3a3','腎疾患':'#6366f1'};

// Gap Finder テンプレート定義
// xType: 'q'(質問票) | 'aging'(65歳以上割合) | 'egfr'(健診eGFR平均)
// yType: 'cause'(死因 人口10万対) | 'diag'(医療利用 人口10万対)
// xInverse: true=低い値が高リスク (色判定・象限ラベルを反転)
export const GAP_TEMPLATES = [
  {id:'smoke_cancer', label:'喫煙×がん死亡', xLabel:'喫煙率 (%)', yLabel:'がん死亡率',
    xType:'q', xKey:'smoking', yType:'cause', yKey:'がん', xInverse:false,
    note:'喫煙は最大の予防可能ながんリスク。地域差から需給ギャップを抽出。'},
  {id:'aging_homecare', label:'高齢化×在宅医療', xLabel:'65歳以上 (%)', yLabel:'在宅医療/10万人',
    xType:'aging', yType:'diag', yKey:'C_在宅医療', xInverse:false,
    note:'高齢化進行に対し在宅医療供給が追いつくか。左上(高齢×低算定)が供給不足候補。'},
  {id:'exercise_heart', label:'運動不足×心疾患死亡', xLabel:'運動不足率 (%)', yLabel:'心疾患死亡率',
    xType:'q', xKey:'exercise', yType:'cause', yKey:'心疾患', xInverse:false,
    note:'X軸は運動不足率（30分以上の運動が週2日未満の割合・高=リスク方向）。'},
  {id:'weight_diabetes', label:'体重増加×糖尿病死亡', xLabel:'体重増加歴 (%)', yLabel:'糖尿病死亡率',
    xType:'q', xKey:'weight_gain', yType:'cause', yKey:'糖尿病', xInverse:false,
    note:'20歳比10kg以上の増加は2型糖尿病の独立リスク因子。'},
  {id:'walking_senility', label:'歩行不足×老衰', xLabel:'歩行不足率 (%)', yLabel:'老衰死亡率',
    xType:'q', xKey:'walking', yType:'cause', yKey:'老衰', xInverse:false,
    note:'X軸は歩行不足率（1日1時間以上の歩行なしの割合・高=リスク方向）。地域の身体活動量と老衰の関連を可視化。'},
  {id:'late_dinner_htn', label:'夕食遅×高血圧死亡', xLabel:'就寝前夕食 (%)', yLabel:'高血圧性疾患死亡率',
    xType:'q', xKey:'late_dinner', yType:'cause', yKey:'高血圧性疾患', xInverse:false,
    note:'夜間摂食と血圧の関連は近年注目。代理指標として扱う。'},
  {id:'aging_outpatient', label:'高齢化×外来受診', xLabel:'65歳以上 (%)', yLabel:'外来受診/10万人',
    xType:'aging', yType:'diag', yKey:'A_初再診料', xInverse:false,
    note:'高齢化と外来受診頻度の関係。受診抑制は左上または右下に現れる。'},
  {id:'egfr_kidney', label:'腎機能×腎不全死亡', xLabel:'eGFR平均 (mL/min)', yLabel:'腎不全死亡率',
    xType:'egfr', yType:'cause', yKey:'腎不全', xInverse:true,
    note:'X軸は健診eGFR平均（低値=腎機能低下=リスク）。男女平均値を使用。'},
  {id:'daily_drink_heart', label:'毎日飲酒×心疾患死亡', xLabel:'毎日飲酒率 (%)', yLabel:'心疾患死亡率',
    xType:'q', xKey:'drinking_daily', yType:'cause', yKey:'心疾患', xInverse:false,
    note:'毎日飲酒と循環器疾患の関連は用量依存とされる。地域差として可視化。'},
  {id:'heavy_drink_liver', label:'高量飲酒×肝疾患死亡', xLabel:'2合以上飲酒率 (%)', yLabel:'肝疾患死亡率',
    xType:'q', xKey:'heavy_drinker', yType:'cause', yKey:'肝疾患', xInverse:false,
    note:'分母は飲酒者のみ。地域の飲酒文化と肝疾患死亡の関連を探索。'},
  {id:'sleep_heart', label:'睡眠充足×心疾患死亡', xLabel:'睡眠充足率 (%)', yLabel:'心疾患死亡率',
    xType:'q', xKey:'sleep_ok', yType:'cause', yKey:'心疾患', xInverse:true,
    note:'X軸は睡眠で休養がとれている人の割合（高=低リスク）。睡眠不足と循環器の関連は確立。'},
];

// rank2: ドメインレンズ選択時に Gap Finder テンプレを該当ドメインへ自動切替（対応があるドメインのみ）
export const DOMAIN_GAP_TEMPLATE = {
  cardiovascular: 'exercise_heart',
  diabetes_metabolic: 'weight_diabetes',
  cancer: 'smoke_cancer',
  renal: 'egfr_kidney',
  // cerebrovascular / respiratory は対応テンプレ無し → 自動切替しない
};

// rank9: 人口タイムレンズ — 社人研推計7年（2020国調ベース・2020-2050）
export const DEMO_YEARS = ['2020','2025','2030','2035','2040','2045','2050'];

// ── 人口KPI: age_pyramid (住基2025) の年齢帯集計（純関数・モジュールレベル）──
// age_groups 21帯: idx 13=65-69, 15=75-79, 17=85-89
// 手順1共有基盤: prefPops useMemo（deps安定化）と demoKpi 等で共用するため部品外へ移設。
export const computeAgeRates = (ap) => {
  if (!ap || !ap.male || !ap.female) return null;
  const sum = arr => arr.reduce((s,v)=>s+(v||0),0);
  const m = ap.male, f = ap.female;
  const total = sum(m) + sum(f);
  if (total <= 0) return null;
  return {
    total,
    rate65: (sum(m.slice(13)) + sum(f.slice(13))) / total * 100,
    rate75: (sum(m.slice(15)) + sum(f.slice(15))) / total * 100,
    rate85: (sum(m.slice(17)) + sum(f.slice(17))) / total * 100,
  };
};
