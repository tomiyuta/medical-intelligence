'use client';
import { useState, useEffect, useRef, useMemo, useLayoutEffect, useId, Fragment } from 'react';
import { fmt, sortPrefs, PREF_ORDER } from '../shared';
import { dispersionForCause, classifyDispersion } from '../../../lib/dispersionMetrics';

import DomainSupplyDemandBridge from './DomainSupplyDemandBridge';
import InterpretationGuard from '../ui/InterpretationGuard';
import RegionalMismatchExplorer from '../ui/RegionalMismatchExplorer';
import PrefStrip47 from '../ui/PrefStrip47';
import PsIris from '../ui/PsIris';
import PrefChoropleth from '../ui/PrefChoropleth';
import CheckupBinsHistogram, { RISK_BIN_THRESHOLD, METRIC_TO_RISK_KEY } from '../ui/CheckupBinsHistogram';
import DeathWaffle100, { buildWaffleItems, WAFFLE_CAUSE_COLORS, WAFFLE_OTHER, WAFFLE_OTHER_COLOR } from '../ui/DeathWaffle100';
import { getSourceBadge } from '../../../lib/sourceRegistry';
import { DOMAIN_MAPPING, DOMAIN_ORDER, rowInDomain, domainSectionStatus, DOMAIN_TO_RX_LABEL, FP_TIERS, tierOf } from '../../../lib/domainMapping';

// rank1: 47都道府県ホワイトリスト（「都道府県判別不可」「全国」等の擬似県を分布から除外）
const PREF47_SET = new Set(PREF_ORDER);
const isP47 = (p) => PREF47_SET.has(p);
// yearBadge（PrefStrip47 必須prop）: SOURCE_REGISTRY から {label:year, color}
const yb = (k) => { const s = getSourceBadge(k); return { label: s.year, color: s.color }; };
// SSR警告回避: サーバでは useEffect にフォールバック（FLIP用）
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
// prefers-reduced-motion 尊重（FLIP/カウントアップ共通）
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// カウントアップ(400ms rAF・easeOutCubic)。初回マウントはアニメなし・reduced-motionは瞬時。
const useCountUp = (target, dur = 400) => {
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
const CountUpNum = ({ value, decimals = 0, signed = false, suffix = '' }) => {
  const v = useCountUp(value);
  if (v == null || !isFinite(v)) return null;
  return <>{signed && v > 0 ? '+' : ''}{v.toFixed(decimals)}{suffix}</>;
};
// FLIP行アニメ共通ヘルパ(手順1共有基盤: psRowRefs方式の一般化・挙動不変)。
// refsMap=useRefの{key→行DOM}。deps変更時に行がtranslateYのみで滑走(reflowゼロ)。
// 初回マウントはアニメなし・prefers-reduced-motionは無効。毎レンダ後に現在位置を記録(次のFirst)。
// 受療率フォレスト / Layer1ソート / Layer4ソートで共用する。
const useFlipRows = (refsMap, deps, mob = false) => {
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
// ── Layer3 ユニットドット・レーン（人間換算 1ドット=1回 の折返しドット列） ──
// 規約踏襲（PrefStrip47 → 新部品の規約共有）:
//   ・端数/域外は clipPath 横幅比の部分塗りで表示し値は捏造しない — ツールチップは常に小数1桁実値
//   ・全国tick=#2563EB破線+▽（PrefStrip47 の avg 語彙）／◆ピン=#f97316・縁#c2410c
//   ・充填は useCountUp のアニメ値からドット数を導出 — ジャンボ数字（CountUpNum）と同一の
//     400ms easeOutCubic で同期し、prefers-reduced-motion では瞬時
// 色意味論: 基準部 min(県,全国)=slate#94a3b8塗り／超過(全国→県)=rose#9f1239塗り／
//           不足(県→全国)=indigo#4338ca中抜き輪郭 — rose/indigoはFP_TIERS両端と同一の中立発散
//           （solid/hollow の形状差併用で色覚多様性にも頑健）。良し悪しの色ではない。
const UnitDotLane = ({ value, natValue, pinnedValue = null, perRow = 12, natLabel, mob, prefName, pinnedName, rank, unitLabel }) => {
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
// 受療率フィンガープリント色意味論(FP_TIERS/tierOf)は lib/domainMapping.js へ移設
// (手順1共有基盤: Bridge・新部品とことばチップ単一ソース化・循環import回避) — import参照。
const CAT_LABELS = {'A_初再診料':'外来受診','B_医学管理等':'慢性疾患管理','C_在宅医療':'在宅医療'};
// Layer3 人間換算ユニット定義: ジャンボ数字 = 人口10万対 ÷ div。
// 分母はカテゴリで異なる（A/B=県民1人あたり・C=県民10人あたり）— フットノートに明記。
const DIAG_UNIT = {
  'A_初再診料':   { div: 100000, denom: '県民1人あたり・年',  unit: '回/人・年',   dec: 1 },
  'B_医学管理等': { div: 100000, denom: '県民1人あたり・年',  unit: '回/人・年',   dec: 1 },
  'C_在宅医療':   { div: 10000,  denom: '県民10人あたり・年', unit: '回/10人・年', dec: 1 },
};
const RISK_META = {
  'ヘモグロビン': {unit:'g/dL', note:'低値=貧血リスク', icon:'🩸'},
  '血清クレアチニン': {unit:'mg/dL', note:'高値=腎機能低下', icon:'🫘'},
  'eGFR': {unit:'mL/min', note:'60未満でCKD疑い', icon:'💧'},
};
// ── Layer2 B. リスク該当者率カード定義 — 分布ドロワーの指標タブと共用するため
//    Bセクション内IIFEからモジュールへ昇格（内容不変・非破壊） ──
const RISK_CARDS = [
  { key: 'bmi_ge_25',              icon: '⚖️', label: 'BMI ≥25',          fullLabel: 'BMI ≥25 (肥満)',          color: '#f59e0b' },
  { key: 'hba1c_ge_6_5',           icon: '🍰', label: 'HbA1c ≥6.5',       fullLabel: 'HbA1c ≥6.5% (糖尿病型)',  color: '#dc2626' },
  { key: 'sbp_ge_140',             icon: '❤️', label: 'SBP ≥140',         fullLabel: '収縮期血圧 ≥140 mmHg',     color: '#ef4444' },
  { key: 'ldl_ge_140',             icon: '🩸', label: 'LDL ≥140',         fullLabel: 'LDL ≥140 mg/dL',           color: '#ec4899' },
  { key: 'urine_protein_ge_1plus', icon: '🫘', label: '尿蛋白 1+以上',   fullLabel: '尿蛋白 1+以上',            color: '#8b5cf6' },
];
// 分布ドロワー: 閾値超えバー用の一段濃い色（Bカード色の濃色版 — 二層色制の閾値層。
// 分布本体=slate中立・閾値以上のみリスク色 — BMI≥25等は臨床的に確立した「高=悪い」断面）
const RISK_COLOR_DEEP = {
  bmi_ge_25: '#d97706', hba1c_ge_6_5: '#b91c1c', sbp_ge_140: '#dc2626',
  ldl_ge_140: '#db2777', urine_protein_ge_1plus: '#7c3aed',
};
// 薬効分類→疾患領域マッピング
const DRUG_DOMAIN = {
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
const DOMAIN_COLORS = {'循環器':'#dc2626','糖尿病・代謝':'#f59e0b','呼吸器':'#06b6d4','精神・神経':'#8b5cf6','整形・疼痛':'#059669','消化器':'#64748b','がん':'#be123c','免疫・内分泌':'#0891b2','アレルギー':'#f472b6','感染症':'#fb923c','内分泌':'#14b8a6','代謝':'#a3a3a3','腎疾患':'#6366f1'};

// Gap Finder テンプレート定義
// xType: 'q'(質問票) | 'aging'(65歳以上割合) | 'egfr'(健診eGFR平均)
// yType: 'cause'(死因 人口10万対) | 'diag'(医療利用 人口10万対)
// xInverse: true=低い値が高リスク (色判定・象限ラベルを反転)
const GAP_TEMPLATES = [
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
const DOMAIN_GAP_TEMPLATE = {
  cardiovascular: 'exercise_heart',
  diabetes_metabolic: 'weight_diabetes',
  cancer: 'smoke_cancer',
  renal: 'egfr_kidney',
  // cerebrovascular / respiratory は対応テンプレ無し → 自動切替しない
};

// rank9: 人口タイムレンズ — 社人研推計7年（2020国調ベース・2020-2050）
const DEMO_YEARS = ['2020','2025','2030','2035','2040','2045','2050'];

// ── 人口KPI: age_pyramid (住基2025) の年齢帯集計（純関数・モジュールレベル）──
// age_groups 21帯: idx 13=65-69, 15=75-79, 17=85-89
// 手順1共有基盤: prefPops useMemo（deps安定化）と demoKpi 等で共用するため部品外へ移設。
const computeAgeRates = (ap) => {
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

export default function NdbView({ mob, ndbDiag, ndbRx, ndbHc, ndbPref, setNdbPref, setNdbRx, vitalStats, ndbQ, agePyramid, futureDemo, patientSurvey, bedFunc, ndbCheckupRiskRates, ndbCheckupRiskRatesStd, mortalityOutcome2020, cancerSites2024, homecareCapability, japanMap, futureYear, setFutureYear }) {
  const diagByPref = ndbDiag.filter(d=>d.prefecture===ndbPref);
  const hcPref = ndbHc.filter(d=>d.pref===ndbPref);
  const vp = vitalStats?.prefectures?.find(p=>p.pref===ndbPref);
  const causes = vp?.causes || [];

  // ── rank1: 分布ストリップ共通state（hover同期・比較ピン） ──
  const [hoverPref, setHoverPref] = useState(null);
  const [pinnedPref, setPinnedPref] = useState(null);
  // 全ストリップ共通props（onJump=setNdbPref=globalPref連動）
  const stripCommon = {
    selected: ndbPref,
    pinned: pinnedPref,
    hoverPref,
    onHover: setHoverPref,
    onPin: (p)=>setPinnedPref(prev => prev===p ? null : p),
    onJump: setNdbPref,
  };

  // ── 人口KPI: age_pyramid (住基2025) + future_demographics (社人研2050) ──
  // computeAgeRates はモジュールレベルへ移設（手順1共有基盤）
  const demoKpi = (()=>{
    if (!agePyramid?.prefectures?.[ndbPref]) return null;
    const r = computeAgeRates(agePyramid.prefectures[ndbPref]);
    if (!r) return null;
    let change2050 = null, rate75_2050 = null;
    if (futureDemo?.prefectures) {
      const fp = futureDemo.prefectures.find(p => p.pref === ndbPref);
      if (fp) {
        const p20 = fp.total_pop?.['2020'], p50 = fp.total_pop?.['2050'];
        if (p20 && p50) change2050 = (p50/p20 - 1) * 100;
        rate75_2050 = fp.aging_rate_75?.['2050'];
      }
    }
    return { ...r, change2050, rate75_2050 };
  })();
  // 全国平均（人口加重）
  const demoNat = (()=>{
    if (!agePyramid?.prefectures) return null;
    let totals = {tot:0, s65:0, s75:0, s85:0};
    Object.values(agePyramid.prefectures).forEach(ap => {
      const sum = arr => arr.reduce((s,v)=>s+(v||0),0);
      totals.tot += sum(ap.male) + sum(ap.female);
      totals.s65 += sum(ap.male.slice(13)) + sum(ap.female.slice(13));
      totals.s75 += sum(ap.male.slice(15)) + sum(ap.female.slice(15));
      totals.s85 += sum(ap.male.slice(17)) + sum(ap.female.slice(17));
    });
    if (totals.tot <= 0) return null;
    return { rate65: totals.s65/totals.tot*100, rate75: totals.s75/totals.tot*100, rate85: totals.s85/totals.tot*100 };
  })();
  // 75+順位（47都道府県中, 高い順）
  const rank75 = (()=>{
    if (!agePyramid?.prefectures || !demoKpi) return null;
    const arr = Object.entries(agePyramid.prefectures).map(([p, ap]) => {
      const r = computeAgeRates(ap);
      return r ? { pref: p, rate75: r.rate75 } : null;
    }).filter(Boolean).sort((a,b)=>b.rate75-a.rate75);
    const idx = arr.findIndex(x=>x.pref===ndbPref);
    return idx >= 0 ? { rank: idx+1, total: arr.length } : null;
  })();

  // rank1: 人口KPI micro ストリップ用 47県分布（判別不可等は isP47 で除外）
  const demoStrips = (()=>{
    const total = [], r65 = [], r75 = [], r85 = [], chg = [];
    if (agePyramid?.prefectures) {
      Object.entries(agePyramid.prefectures).forEach(([p, ap])=>{
        if (!isP47(p)) return;
        const r = computeAgeRates(ap);
        if (!r) return;
        total.push({pref:p, value:r.total});
        r65.push({pref:p, value:r.rate65});
        r75.push({pref:p, value:r.rate75});
        r85.push({pref:p, value:r.rate85});
      });
    }
    if (futureDemo?.prefectures) {
      futureDemo.prefectures.forEach(fp=>{
        if (!isP47(fp.pref) || !(fp.type==='a'||fp.type===1)) return;
        const p20 = fp.total_pop?.['2020'], p50 = fp.total_pop?.['2050'];
        if (p20 && p50) chg.push({pref:fp.pref, value:(p50/p20-1)*100});
      });
    }
    return { total, r65, r75, r85, chg };
  })();

  // ══ rank9: 人口タイムレンズ + 高齢化ドリフト・ダンベル ══
  const tlYear = DEMO_YEARS.includes(futureYear) ? futureYear : '2025';
  const tlIdx = DEMO_YEARS.indexOf(tlYear);
  const [tlPlaying, setTlPlaying] = useState(false);
  const [dumbbellOpen, setDumbbellOpen] = useState(false);
  const tlRef = useRef(null);
  const tlDrag = useRef(false);
  // 再生: 700ms/step で末尾まで進んで停止（1周）
  // 1ステップずつ setTimeout でスケジュール（tlIdx 依存で毎ステップ再実行）。
  // 停止は「更新関数の外」= エフェクト本体で行う（setFutureYear の updater 内で
  // setTlPlaying を呼ぶと Home のレンダー中に NdbView を更新する setState-in-render になるため）。
  useEffect(() => {
    if (!tlPlaying) return;
    if (tlIdx >= DEMO_YEARS.length - 1) { setTlPlaying(false); return; }
    const id = setTimeout(() => setFutureYear(DEMO_YEARS[tlIdx + 1]), 700);
    return () => clearTimeout(id);
  }, [tlPlaying, tlIdx, setFutureYear]);
  // 選択県の社人研系列（type=a）
  const fpSel = useMemo(
    () => futureDemo?.prefectures?.find(p => p.pref === ndbPref) || null,
    [futureDemo, ndbPref]
  );
  // 選択年の3帯域（0-64 / 65-74 / 75+）と KPI — 社人研系列から厳密導出
  const tlBands = (() => {
    if (!fpSel) return null;
    const r65 = fpSel.aging_rate_65?.[tlYear], r75 = fpSel.aging_rate_75?.[tlYear];
    const pop = fpSel.total_pop?.[tlYear];
    if (r65 == null || r75 == null) return null;
    return { r65, r75, pop, b064: 100 - r65, b6574: r65 - r75, b75: r75 };
  })();
  // 住基2025実測（agePyramid）— 推計との乖離を▲で可視化
  const tlJusaki = (() => {
    const ap = agePyramid?.prefectures?.[ndbPref];
    if (!ap) return null;
    const r = computeAgeRates(ap);
    return r ? { r65: r.rate65, r75: r.rate75, b064: 100 - r.rate65, b6574: r.rate65 - r.rate75, b75: r.rate75 } : null;
  })();
  // ダンベル: 47県 × 75歳以上割合（起点2025推計→終点tlYear推計）。行順は2025値で固定・終点のみ移動
  const dumbbell = useMemo(() => {
    if (!futureDemo?.prefectures) return null;
    const jus = {};
    if (agePyramid?.prefectures) Object.entries(agePyramid.prefectures).forEach(([p, ap]) => {
      if (!isP47(p)) return; const r = computeAgeRates(ap); if (r) jus[p] = r.rate75;
    });
    let vmin = Infinity, vmax = -Infinity;
    const rows = [];
    futureDemo.prefectures.forEach(fp => {
      if (!isP47(fp.pref)) return;
      const s = fp.aging_rate_75?.['2025'], e = fp.aging_rate_75?.[tlYear];
      if (s == null || e == null) return;
      DEMO_YEARS.forEach(y => { const v = fp.aging_rate_75?.[y]; if (v != null) { if (v < vmin) vmin = v; if (v > vmax) vmax = v; } });
      rows.push({ pref: fp.pref, v2025: s, vEnd: e, jusaki: jus[fp.pref] ?? null, drift: e - s });
    });
    if (!rows.length) return null;
    rows.sort((a, b) => b.v2025 - a.v2025); // 固定順（2025推計の高い順）
    return { rows, vmin: Math.floor(vmin), vmax: Math.ceil(vmax) };
  }, [futureDemo, agePyramid, tlYear]);

  // Population for per-capita — 住基2025(agePyramid)の県人口(=demoKpi.total)を単一分母とする。
  // area_demographics の munis 合算も政令指定都市を含む完全値(2026-07 住基ETL再生成)だが、
  // 10万対の分母は agePyramid に一本化する。
  const prefPop = demoKpi?.total || 0;
  const perCap = (v) => prefPop > 0 ? (v / prefPop * 100000).toFixed(0) : '—';

  // Drug domain aggregation（選択県の領域別生数量 — ツールチップの「単位混在・参考」表示に使用）
  const rxDomains = {};
  ndbRx.forEach(r => {
    const domain = DRUG_DOMAIN[r.name] || 'その他';
    if (!rxDomains[domain]) rxDomains[domain] = 0;
    rxDomains[domain] += r.qty;
  });

  // ── Gap Finder: state & 全都道府県メトリック計算 ──
  const [gapTemplate, setGapTemplate] = useState('smoke_cancer');
  const [psMode, setPsMode] = useState('outpatient'); // 患者調査: 入院/外来切替
  // rank4: 受療率フィンガープリント（21章フォレスト）用 state
  const [psSort, setPsSort] = useState('divergence'); // 'divergence'(乖離順) | 'abs'(絶対値順) | 'chapter'(章番号順)
  const [psShowTop7, setPsShowTop7] = useState(false); // 旧Top7表示の折りたたみ温存
  const [psExpanded, setPsExpanded] = useState(null);  // 展開中の章key
  // 虹彩(PsIris)↔行リストの双方向hover同期・ヘッドラインチップ→行フラッシュ
  const [hoverPSKey, setHoverPSKey] = useState(null);
  const [psFlashKey, setPsFlashKey] = useState(null);
  const psRowRefs = useRef({});        // 章key→行DOM（scrollIntoView用）
  const psFlashTimer = useRef(null);
  const psJumpToRow = (key) => {
    const el = psRowRefs.current[key];
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPsFlashKey(key);
    if (psFlashTimer.current) clearTimeout(psFlashTimer.current);
    psFlashTimer.current = setTimeout(() => setPsFlashKey(null), 1200);
  };
  useEffect(() => () => { if (psFlashTimer.current) clearTimeout(psFlashTimer.current); }, []);
  // FLIPソート: psSort/psMode(/◆ピン)変更時に行がtranslateYのみで滑走
  // （実装は共通ヘルパ useFlipRows へ集約 — 手順1共有基盤・挙動不変）
  useFlipRows(psRowRefs, [psSort, psMode, pinnedPref], mob);
  // ◆差分モード: ピン解除(またはピン=自県)時は「対◆差順」から乖離順へ復帰
  useEffect(() => {
    if ((!pinnedPref || pinnedPref === ndbPref) && psSort === 'pindiff') setPsSort('divergence');
  }, [pinnedPref, ndbPref, psSort]);
  // マップエコー: 行展開内の47県地図トグル（展開行/入院外来が変われば閉じる）
  const [psMapOpen, setPsMapOpen] = useState(false);
  useEffect(() => { setPsMapOpen(false); }, [psExpanded, psMode]);
  // ── Layer1 tierゾーン発散バー「県の性格プロファイル」state（手順4） ──
  const [qExpandedKey, setQExpandedKey] = useState(null); // click=単一openアコーディオン
  const [qSort, setQSort] = useState('item');             // 'item'(項目順)|'divergence'(乖離大順) — 生活習慣バンドのみ
  const [qHoverKey, setQHoverKey] = useState(null);       // 行hover=濃紺ツールチップ
  const qRowRefs = useRef({});                            // 生活習慣行のFLIP refs（psRowRefs方式）
  useFlipRows(qRowRefs, [qSort, ndbPref], mob);
  // 県切替で展開を閉じる（乖離大順の並びが変わるため）
  useEffect(() => { setQExpandedKey(null); }, [ndbPref]);
  // rank4: 将来傾き（受療率法・参考推計）— 選択県を圏集約した demand projection を取得
  const [demandProj, setDemandProj] = useState(null);
  useEffect(() => {
    let alive = true;
    setDemandProj(null);
    setPsExpanded(null);
    fetch(`/api/demand-projection/pref?pref=${encodeURIComponent(ndbPref)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) setDemandProj(j); })
      .catch(() => { if (alive) setDemandProj(null); });
    return () => { alive = false; };
  }, [ndbPref]);
  // Phase 4-3 R3: 粗死亡率 (2024 全14) vs 年齢調整死亡率 (2020 6死因) toggle
  const [mortalityMode, setMortalityMode] = useState('crude');
  const [mortalitySex, setMortalitySex] = useState('male');
  // rank5: マップ・エコー — click した死因の 47 県コロプレスを行下に展開
  const [selectedCause, setSelectedCause] = useState(null);
  // Layer5 百人ワッフル: 格子⇔死因行リストの双方向 hover 同期（カテゴリ名 or WAFFLE_OTHER）
  const [hoverCause, setHoverCause] = useState(null);
  useEffect(() => { setHoverCause(null); }, [mortalityMode, ndbPref]);
  // ワッフル items（粗2024モード専用 — 構成%の意味が成立する断面のみ。全国降順top7+その他を最大剰余法で100人化）
  const waffleItems = useMemo(() => {
    if (!vp?.causes?.length || !vitalStats?.national?.causes?.length) return null;
    if (!vp.total_death_rate || !vitalStats.national.total_death_rate) return null;
    return buildWaffleItems({
      prefCauses: vp.causes, prefTotal: vp.total_death_rate,
      natCauses: vitalStats.national.causes, natTotal: vitalStats.national.total_death_rate,
    });
  }, [vp, vitalStats]);

  // rank6: がん部位別30年トレンド (1995-2024 ASR75 スモールマルチプル)
  const [cancerTrend, setCancerTrend] = useState(null);   // /api/cancer-trend?all=1 全量
  const [cancerTrendSex, setCancerTrendSex] = useState('male'); // 'male'|'female'
  const [trendSite, setTrendSite] = useState(null);       // 展開中の部位 short key
  const [trendHoverIdx, setTrendHoverIdx] = useState(null); // 展開チャート scrub の年 index
  useEffect(() => {
    let alive = true;
    fetch('/api/cancer-trend?all=1')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) setCancerTrend(j); })
      .catch(() => { if (alive) setCancerTrend(null); });
    return () => { alive = false; };
  }, []);
  useEffect(() => { setTrendSite(null); setTrendHoverIdx(null); }, [ndbPref]);

  // ── 手順1共有基盤: 処方 全県版 rxAll（1回fetch・cancerTrendパターン） ──
  // Layer4 処方個性ダイアグラム本体と Bridge(ndbRxAll prop) で共用。
  // 既存Bridgeの compute47Avg が選択県のみの ndbRx で縮退する
  // 「utilization delta 恒等+0.0%」バグの根治を兼ねる。
  const [rxAll, setRxAll] = useState(null); // 全47県×薬効106分類=4,786行
  useEffect(() => {
    let alive = true;
    fetch('/api/ndb/prescriptions')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) setRxAll(Array.isArray(j) ? j : null); })
      .catch(() => { if (alive) setRxAll(null); });
    return () => { alive = false; };
  }, []);

  // ── Layer2 分布ドロワー（臨床閾値ヒストグラム）state — 追加型・A/Bカード非破壊 ──
  const [binsOpen, setBinsOpen] = useState(false);      // ドロワー開閉
  const [binsMetric, setBinsMetric] = useState('BMI');  // 指標タブ5種
  const [binsSex, setBinsSex] = useState('all');        // 'all'=男女クライアント合算 | 'male' | 'female'
  const [binsAge, setBinsAge] = useState('all');        // 年齢帯セグメント（7帯+全年齢）
  const [binsMirror, setBinsMirror] = useState(false);  // 男女ミラーモード（男左女右鏡像・mobは縦積み）
  const [binsCdf, setBinsCdf] = useState(false);        // 副トグル: 累積%表示
  const [binsData, setBinsData] = useState(null);       // 選択県レスポンス
  const [binsPinData, setBinsPinData] = useState(null); // ◆ピン県レスポンス（第2輪郭）
  const [binsPulse, setBinsPulse] = useState(false);    // Bカードclick→閾値ゾーンパルス
  const [binsZoneHover, setBinsZoneHover] = useState(false); // 網掛けhover↔Bカード相互ハイライト
  const binsBoxRef = useRef(null);
  const binsPulseTimer = useRef(null);
  // 取得（demandProjパターン・開時のみ）。sexパラメータは常に省略= male/female両行を取得し
  // クライアント側でフィルタ/合算する（「全体」合算とミラーの双方が両性行を要するため・数KB）。
  useEffect(() => {
    if (!binsOpen) return;
    let alive = true;
    setBinsData(null);
    fetch(`/api/ndb/checkup-bins?pref=${encodeURIComponent(ndbPref)}&metric=${encodeURIComponent(binsMetric)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) setBinsData(j); })
      .catch(() => { if (alive) setBinsData(null); });
    return () => { alive = false; };
  }, [binsOpen, ndbPref, binsMetric]);
  // ◆ピン県は ?pref=pinnedPref で追加fetchし橙第2輪郭に重畳
  useEffect(() => {
    setBinsPinData(null);
    if (!binsOpen || !pinnedPref || pinnedPref === ndbPref) return;
    let alive = true;
    fetch(`/api/ndb/checkup-bins?pref=${encodeURIComponent(pinnedPref)}&metric=${encodeURIComponent(binsMetric)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive) setBinsPinData(j && j.prefResolved ? j : null); })
      .catch(() => { if (alive) setBinsPinData(null); });
    return () => { alive = false; };
  }, [binsOpen, pinnedPref, ndbPref, binsMetric]);
  // Bカードclick → ドロワーを該当指標で開き scrollIntoView + 閾値ゾーンパルス
  const binsJumpTo = (riskKey) => {
    const t = RISK_BIN_THRESHOLD[riskKey];
    if (!t) return;
    setBinsMetric(t.metric);
    setBinsOpen(true);
    setTimeout(() => {
      const el = binsBoxRef.current;
      if (el && typeof el.scrollIntoView === 'function')
        el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    }, 80);
    setBinsPulse(false); // 連打時も <animate> を再挿入させる
    requestAnimationFrame(() => setBinsPulse(true));
    if (binsPulseTimer.current) clearTimeout(binsPulseTimer.current);
    binsPulseTimer.current = setTimeout(() => setBinsPulse(false), 1500);
  };
  useEffect(() => () => { if (binsPulseTimer.current) clearTimeout(binsPulseTimer.current); }, []);

  // ── rank2: ドメインレンズ（疾患縦串フィルタ） ──
  const [activeDomain, setActiveDomain] = useState(null);
  const dm = activeDomain ? DOMAIN_MAPPING[activeDomain] : null;
  // chip選択で Gap Finder テンプレを該当ドメインへ自動切替（可能なら）
  useEffect(() => {
    if (activeDomain && DOMAIN_GAP_TEMPLATE[activeDomain]) setGapTemplate(DOMAIN_GAP_TEMPLATE[activeDomain]);
  }, [activeDomain]);
  // 行の該当判定 / 退色 / ドメイン色左ボーダー（300msトランジション）
  const dMatch = (group, key) => !activeDomain || rowInDomain(activeDomain, group, key);
  const dFade = (group, key) => (activeDomain ? { opacity: dMatch(group, key) ? 1 : 0.25, transition: 'opacity 300ms ease' } : { transition: 'opacity 300ms ease' });
  const dBorder = (group, key) => (activeDomain && dMatch(group, key) ? { borderLeft: `3px solid ${dm.color}`, paddingLeft: 8 } : {});
  // Layer4 処方薬（DRUG_DOMAIN 日本語ラベル軸）の退色（utilization未整備ドメインは全行退色）
  const rxFade = (jpDomain) => (activeDomain ? { opacity: DOMAIN_TO_RX_LABEL[activeDomain] === jpDomain ? 1 : 0.25, transition: 'opacity 300ms ease' } : { transition: 'opacity 300ms ease' });
  // ドメイン非該当セクション全体の退色（診療行為カテゴリ等・疾患軸を持たない断面）
  const sectionFade = activeDomain ? { opacity: 0.32, transition: 'opacity 300ms ease' } : { transition: 'opacity 300ms ease' };

  // ── Layer4 処方個性ダイアグラム state（手順6） ──
  const [rxSort, setRxSort] = useState('divergence');   // 'divergence'(乖離大順)|'domain'(領域順=全国数量順)
  const [rxExpanded, setRxExpanded] = useState(null);   // 展開中の領域名（単一openアコーディオン）
  const [rxHoverKey, setRxHoverKey] = useState(null);   // 行hover=濃紺ツールチップ（mobは1タップ=情報）
  const [rxFlashKey, setRxFlashKey] = useState(null);   // ヘッドラインチップ→行フラッシュ（psFlashKey方式）
  const [rx4bExpanded, setRx4bExpanded] = useState(null); // Layer4b: 分類行click=当該分類47県ストリップ展開
  const rxRowRefs = useRef({});                         // 領域行のFLIP refs（psRowRefs方式）
  const rxFlashTimer = useRef(null);
  useFlipRows(rxRowRefs, [rxSort, ndbPref], mob);       // ソート/県切替で行がtranslateY滑走
  const rxJumpToRow = (key) => {
    const el = rxRowRefs.current[key];
    if (el && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    setRxFlashKey(key);
    if (rxFlashTimer.current) clearTimeout(rxFlashTimer.current);
    rxFlashTimer.current = setTimeout(() => setRxFlashKey(null), 1200);
  };
  useEffect(() => () => { if (rxFlashTimer.current) clearTimeout(rxFlashTimer.current); }, []);
  // ドメインレンズ: DOMAIN_TO_RX_LABEL 一致領域行を自動展開（rxFade退色は既存維持）
  useEffect(() => {
    const lbl = activeDomain ? DOMAIN_TO_RX_LABEL[activeDomain] : null;
    if (lbl) setRxExpanded(lbl);
  }, [activeDomain]);

  // Phase 4-3 R3: mode に応じて表示する causes を切り替える
  const displayCauses = (() => {
    if (mortalityMode === 'crude') return causes;
    if (!mortalityOutcome2020?.prefectures?.[ndbPref]) return causes;
    const aaData = mortalityOutcome2020.prefectures[ndbPref];
    const SIX_CAUSES = ['悪性新生物', '心疾患', '脳血管疾患', '肺炎', '糖尿病', '腎不全'];
    return SIX_CAUSES.map(name => {
      const rate = aaData[name]?.age_adjusted?.[mortalitySex]?.rate;
      return rate != null ? { cause: name, rate } : null;
    }).filter(Boolean).sort((a, b) => b.rate - a.rate);
  })();
  // ── 手順1共有基盤: 県別人口 prefPops（住基2025・agePyramid由来の単一分母） ──
  // area_demographics の munis 合算も政令市を含む完全値(2026-07再生成)だが、分母は agePyramid に一本化。
  // prefMaps(popByPref/diagNat) と rxShared(classRatio/domainAgg) で共用する。
  const prefPops = useMemo(() => {
    const m = {};
    if (agePyramid?.prefectures) {
      Object.entries(agePyramid.prefectures).forEach(([p, ap]) => {
        const r = computeAgeRates(ap);
        if (r) m[p] = r.total;
      });
    }
    return m;
  }, [agePyramid]);

  const prefMaps = (()=>{
    // 分母人口・65+率は住基2025(agePyramid)から(単一分母ポリシー)
    const popByPref = prefPops, aging = {};
    if (agePyramid?.prefectures) {
      Object.entries(agePyramid.prefectures).forEach(([p, ap]) => {
        const r = computeAgeRates(ap);
        if (r) aging[p] = r.rate65;
      });
    }
    const diag = {};
    if (ndbDiag) {
      ndbDiag.forEach(d => {
        const pop = popByPref[d.prefecture] || 0;
        if (pop > 0) {
          if (!diag[d.prefecture]) diag[d.prefecture] = {};
          diag[d.prefecture][d.category] = d.total_claims/pop*100000;
        }
      });
    }
    // 手順1共有基盤: diagNat — カテゴリ別の人口加重全国値 Σ_isP47(total_claims)/Σ_isP47(pop)×100000。
    // 47県単純平均でなく人口加重（Layer3のtier判定/全国tick・strip natAvgズレ修正に使用）。
    // データに全国行は無い（isP47で擬似県「都道府県判別不可」等を防御）。
    const diagNat = {};
    if (ndbDiag) {
      const num = {}, den = {};
      ndbDiag.forEach(d => {
        if (!isP47(d.prefecture)) return;
        const pop = popByPref[d.prefecture] || 0;
        if (pop <= 0) return;
        num[d.category] = (num[d.category] || 0) + d.total_claims;
        den[d.category] = (den[d.category] || 0) + pop;
      });
      Object.keys(num).forEach(c => { if (den[c] > 0) diagNat[c] = num[c] / den[c] * 100000; });
    }
    const egfr = {};
    if (ndbHc) {
      ndbHc.filter(h=>h.metric==='eGFR').forEach(h => { egfr[h.pref] = (h.male+h.female)/2; });
    }
    return { aging, diag, diagNat, egfr };
  })();

  // ── 手順1共有基盤: rxAll 由来の処方集計（Layer4本体とBridgeで共用） ──
  // natTotals: 薬効分類name→全国qty合算（データは47県のみだが擬似県混入にisP47で防御）
  // classRatio(pref,name) = (qty/prefPop)/(natQty/natPop) — 人口当たり数量の対全国比。
  //   数量の単位(錠/g/mL)は分子分母で相殺されるため同一分類内の県間比較のみ有効。
  // domainAgg: 疾患領域→{pref→対全国比}。構成分類の qty/natQty を各々合算した比
  //   （=各分類比の全国数量加重平均と数学的に等価）。
  const rxShared = useMemo(() => {
    if (!rxAll || !rxAll.length) return null;
    let natPop = 0;
    Object.entries(prefPops).forEach(([p, v]) => { if (isP47(p)) natPop += v; });
    const natTotals = {}, byPref = {};
    rxAll.forEach(r => {
      if (!isP47(r.pref)) return;
      const qty = r.qty || 0;
      natTotals[r.name] = (natTotals[r.name] || 0) + qty;
      const m = byPref[r.pref] || (byPref[r.pref] = {});
      m[r.name] = (m[r.name] || 0) + qty;
    });
    const classRatio = (pref, name) => {
      const pop = prefPops[pref], qty = byPref[pref]?.[name], natQty = natTotals[name];
      if (!pop || !natPop || qty == null || !natQty) return null;
      return (qty / pop) / (natQty / natPop);
    };
    // 領域別合算（DRUG_DOMAIN構成分類のみ。マッピング外分類は領域集計対象外）
    const domSums = {};
    Object.entries(byPref).forEach(([pref, m]) => {
      Object.entries(m).forEach(([name, qty]) => {
        const dom = DRUG_DOMAIN[name];
        if (!dom) return;
        const d = domSums[dom] || (domSums[dom] = { nat: 0, byPref: {} });
        d.byPref[pref] = (d.byPref[pref] || 0) + qty;
      });
    });
    Object.entries(natTotals).forEach(([name, qty]) => {
      const dom = DRUG_DOMAIN[name];
      if (dom && domSums[dom]) domSums[dom].nat += qty;
    });
    const domainAgg = {};
    Object.entries(domSums).forEach(([dom, d]) => {
      const perPref = {};
      if (d.nat > 0 && natPop > 0) {
        Object.entries(d.byPref).forEach(([pref, qty]) => {
          const pop = prefPops[pref];
          if (pop > 0) perPref[pref] = (qty / pop) / (d.nat / natPop);
        });
      }
      domainAgg[dom] = perPref;
    });
    return { natPop, natTotals, byPref, classRatio, domainAgg };
  }, [rxAll, prefPops]);
  // 薬効分類の47県 対全国比ストリップ値（Layer4展開/Layer4b分類展開で共用・比×100=%）
  const rxClassStrip = (name) => {
    if (!rxShared) return [];
    return Object.keys(rxShared.byPref).filter(isP47).map(p => {
      const cr = rxShared.classRatio(p, name);
      return cr != null ? { pref: p, value: cr * 100 } : null;
    }).filter(Boolean);
  };

  return <>

  {/* Header */}
  <div style={{marginBottom:20}}>
    <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Healthcare Atlas</div>
    <h1 style={{fontSize:mob?20:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>都道府県 医療プロファイル</h1>
    <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>NDB・人口動態統計・特定健診を統合し、地域の「根因→リスク→治療→結果」を俯瞰。</p>
  </div>
  <div style={{display:'flex',gap:8,marginBottom:20,alignItems:'center'}}>
    <select value={ndbPref} onChange={e=>setNdbPref(e.target.value)} style={{padding:'10px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:14,background:'#fff',fontWeight:600}}>
      {sortPrefs([...new Set(ndbDiag.map(d=>d.prefecture))]).map(p=><option key={p} value={p}>{p}</option>)}
    </select>
    {prefPop > 0 && <span style={{fontSize:12,color:'#94a3b8'}}>人口 {fmt(prefPop)}人</span>}
  </div>

  {/* rank2: ドメインレンズ 疾患chipバー（sticky・ヘッダー付近に同居） */}
  <div style={{position:'sticky',top:0,zIndex:20,background:'#fff',padding:'8px 0 6px',marginBottom:12,borderBottom:'1px solid #f1f5f9'}}>
    <div style={{display:'flex',alignItems:'center',gap:6,overflowX:'auto',paddingBottom:2}}>
      <span style={{fontSize:10,color:'#94a3b8',fontWeight:700,flexShrink:0,letterSpacing:'0.04em'}}>疾患縦串</span>
      {DOMAIN_ORDER.map(id=>{
        const d = DOMAIN_MAPPING[id]; const on = activeDomain===id;
        return <button key={id} onClick={()=>setActiveDomain(on?null:id)}
          title={`${d.label} 縦串でフィルタ`}
          style={{display:'inline-flex',alignItems:'center',gap:5,flexShrink:0,padding:'5px 11px',borderRadius:16,cursor:'pointer',
            border:'1px solid '+(on?d.color:'#e2e8f0'), background:on?d.color:'#fff', color:on?'#fff':'#475569',
            fontSize:12,fontWeight:600,transition:'all 200ms',whiteSpace:'nowrap'}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:on?'#fff':d.color,flexShrink:0}}/>
          <span>{d.icon} {d.label}</span>
          {d.isExperimental && <span style={{fontSize:8,padding:'0 4px',borderRadius:4,background:on?'rgba(255,255,255,0.25)':'#f1f5f9',color:on?'#fff':'#94a3b8',fontWeight:600}}>試験的</span>}
        </button>;
      })}
      {activeDomain && <button onClick={()=>setActiveDomain(null)} style={{marginLeft:'auto',flexShrink:0,padding:'5px 10px',borderRadius:16,border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>解除 ✕</button>}
    </div>
  </div>

  {/* rank2: ドメインレンズ 固定ガードバナー（選択中のみ・5断面の整備状況+年度併記） */}
  {dm && (()=>{
    const st = domainSectionStatus(activeDomain);
    const dims = [
      {k:'risks',       label:'リスク',            ok: st.risks>0,      badge:'checkupRisk',   extra: st.risks>0?`${st.risks}指標(質問票+健診)`:null, note:null},
      {k:'demand',      label:'疾病負荷(受療率)',  ok: st.demand,       badge:'patientSurvey', extra:null, note: st.demandNote},
      {k:'utilization', label:'医療利用(処方proxy)',ok: st.utilization,  badge:'ndbRx',         extra:null, note: st.utilizationNote},
      {k:'supply',      label:'供給proxy(病床)',   ok: st.supply,       badge:'bedFunc',       extra:null, note: st.supplyNote},
      {k:'outcome',     label:'結果(死亡率)',       ok: st.outcome,      badge:'vitalStats',    extra:null, note:null},
    ];
    return (
    <div style={{background:dm.bg,border:`1px solid ${dm.color}44`,borderLeft:`4px solid ${dm.color}`,borderRadius:10,padding:'12px 16px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:8}}>
        <span style={{fontSize:16}}>{dm.icon}</span>
        <span style={{fontSize:14,fontWeight:700,color:dm.color}}>{dm.label} 縦串フィルタ 適用中</span>
        {st.isExperimental && <span title={st.experimentalNote||''} style={{fontSize:9,padding:'2px 7px',borderRadius:4,background:'#fff',color:'#b45309',border:'1px solid #fde68a',fontWeight:600,cursor:'help'}}>試験的マッピング</span>}
      </div>
      <div style={{fontSize:11,color:'#7f1d1d',background:'#fff',border:'1px solid #fecaca',borderRadius:6,padding:'7px 10px',marginBottom:10,lineHeight:1.55,fontWeight:600}}>
        ⚠ 縦串は薬効分類・ICD章の定義対応であり、因果連鎖の実証ではありません。各断面は異なる調査・年度に由来します（下のバッジで年度混在を明示）。
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {dims.map(di=>{
          const b = getSourceBadge(di.badge);
          return <div key={di.k} title={di.note||b.title} style={{flex:'1 1 150px',minWidth:130,background:'#fff',borderRadius:6,padding:'7px 10px',border:'1px solid #f1f5f9'}}>
            <div style={{fontSize:10,color:'#64748b',fontWeight:700,marginBottom:4}}>{di.label}</div>
            {di.ok
              ? <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
                  <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:4,background:b.bg,color:b.color,border:`1px solid ${b.border}`}}>{b.year}</span>
                  {di.extra && <span style={{fontSize:9,color:'#94a3b8'}}>{di.extra}</span>}
                </div>
              : <div style={{fontSize:10,color:'#b45309',fontWeight:700}}>この断面は未整備</div>}
          </div>;
        })}
      </div>
    </div>);
  })()}

  {/* rank1: 比較県ピン チップ（分布ストリップのドットclickで設定・ここで解除/移動） */}
  {pinnedPref && pinnedPref !== ndbPref && (
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,padding:'7px 12px',background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,fontSize:12,flexWrap:'wrap'}}>
      <span style={{color:'#c2410c',fontWeight:700}}>◆ 比較県: {pinnedPref}</span>
      <span style={{color:'#9a3412',fontSize:11}}>全ストリップ上で橙◆に点灯中</span>
      <button onClick={()=>setNdbPref(pinnedPref)} style={{marginLeft:'auto',padding:'3px 10px',border:'1px solid #fdba74',background:'#fff',color:'#c2410c',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>この県へ移動 →</button>
      <button onClick={()=>setPinnedPref(null)} style={{padding:'3px 10px',border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'}}>解除 ✕</button>
    </div>
  )}

  {/* ═══ DEMOGRAPHIC CONTEXT (人口KPI) ═══ */}
  {demoKpi && (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'16px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <span style={{fontSize:18}}>👥</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>
            人口コンテキスト
            <span style={{marginLeft:8,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#f1f5f9',color:'#64748b',fontWeight:500}}>実測+推計</span>
          </div>
          <div style={{fontSize:11,color:'#94a3b8'}}>NDB指標を解釈する基盤として — 住基2025 + 社人研2050</div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:mob?'repeat(2,1fr)':'repeat(5,1fr)',gap:8}}>
        {/* 1: 総人口 */}
        <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,color:'#64748b',marginBottom:2}}>総人口</div>
          <div style={{fontSize:mob?15:18,fontWeight:700,color:'#1e293b'}}>{fmt(demoKpi.total)}</div>
          <div style={{fontSize:10,color:'#94a3b8'}}>2025年1月（人）</div>
          {demoStrips.total.length >= 40 && <div style={{marginTop:6}}><PrefStrip47 {...stripCommon} values={demoStrips.total} yearBadge={yb('agePyramid')} mode="micro" /></div>}
        </div>
        {/* 2: 65+ */}
        <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,color:'#64748b',marginBottom:2}}>65歳以上</div>
          <div style={{fontSize:mob?15:18,fontWeight:700,color:'#1e293b'}}>{demoKpi.rate65.toFixed(1)}%</div>
          {demoNat && <div style={{fontSize:10,color:demoKpi.rate65>demoNat.rate65?'#dc2626':'#059669'}}>
            全国比 {demoKpi.rate65>demoNat.rate65?'+':''}{(demoKpi.rate65-demoNat.rate65).toFixed(1)}pt
          </div>}
          {demoStrips.r65.length >= 40 && <div style={{marginTop:6}}><PrefStrip47 {...stripCommon} values={demoStrips.r65} natAvg={demoNat?.rate65} yearBadge={yb('agePyramid')} mode="micro" /></div>}
        </div>
        {/* 3: 75+ */}
        <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,color:'#64748b',marginBottom:2}}>75歳以上 {rank75 && <span style={{fontSize:9,color:'#94a3b8'}}>#{rank75.rank}/{rank75.total}</span>}</div>
          <div style={{fontSize:mob?15:18,fontWeight:700,color:'#1e293b'}}>{demoKpi.rate75.toFixed(1)}%</div>
          {demoNat && <div style={{fontSize:10,color:demoKpi.rate75>demoNat.rate75?'#dc2626':'#059669'}}>
            全国比 {demoKpi.rate75>demoNat.rate75?'+':''}{(demoKpi.rate75-demoNat.rate75).toFixed(1)}pt
          </div>}
          {demoStrips.r75.length >= 40 && <div style={{marginTop:6}}><PrefStrip47 {...stripCommon} values={demoStrips.r75} natAvg={demoNat?.rate75} yearBadge={yb('agePyramid')} mode="micro" /></div>}
        </div>
        {/* 4: 85+ */}
        <div style={{background:'#f8fafc',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,color:'#64748b',marginBottom:2}}>85歳以上</div>
          <div style={{fontSize:mob?15:18,fontWeight:700,color:'#1e293b'}}>{demoKpi.rate85.toFixed(1)}%</div>
          {demoNat && <div style={{fontSize:10,color:demoKpi.rate85>demoNat.rate85?'#dc2626':'#059669'}}>
            全国比 {demoKpi.rate85>demoNat.rate85?'+':''}{(demoKpi.rate85-demoNat.rate85).toFixed(1)}pt
          </div>}
          {demoStrips.r85.length >= 40 && <div style={{marginTop:6}}><PrefStrip47 {...stripCommon} values={demoStrips.r85} natAvg={demoNat?.rate85} yearBadge={yb('agePyramid')} mode="micro" /></div>}
        </div>
        {/* 5: 2050 */}
        <div style={{background:'#fef3c7',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,color:'#92400e',marginBottom:2}}>2050年予測</div>
          <div style={{fontSize:mob?15:18,fontWeight:700,color:'#92400e'}}>
            {demoKpi.change2050!=null ? `${demoKpi.change2050>0?'+':''}${demoKpi.change2050.toFixed(1)}%` : '—'}
          </div>
          <div style={{fontSize:10,color:'#92400e'}}>
            {demoKpi.rate75_2050!=null ? `75+→${demoKpi.rate75_2050.toFixed(1)}%` : '人口変化(2020比)'}
          </div>
          {demoStrips.chg.length >= 40 && <div style={{marginTop:6}}><PrefStrip47 {...stripCommon} values={demoStrips.chg} yearBadge={yb('futureDemo')} mode="micro" /></div>}
        </div>
      </div>
      {/* 解釈文（自動生成） */}
      {demoNat && (()=>{
        const d75 = demoKpi.rate75 - demoNat.rate75;
        let msg;
        if (d75 > 1.5) msg = `${ndbPref}は75歳以上割合が全国平均より${d75.toFixed(1)}pt高く、在宅医療・処方薬・慢性期医療の需要が大きく見えやすい構造です。`;
        else if (d75 < -1.5) msg = `${ndbPref}は75歳以上割合が全国平均より${Math.abs(d75).toFixed(1)}pt低く、NDB算定回数の多さは人口規模の影響を受けている可能性があります。`;
        else msg = `${ndbPref}の75歳以上割合は全国平均水準。NDB指標は人口構造補正の影響を受けにくい解釈となります。`;
        return <div style={{fontSize:11,color:'#475569',marginTop:10,padding:'8px 12px',background:'#f8fafc',borderRadius:6,lineHeight:1.5,borderLeft:'3px solid #2563EB'}}>💡 {msg}</div>;
      })()}

      {/* ══ rank9: 人口タイムレンズ（2020-2050スクラバー・3帯モーフィング・47県ダンベル） ══ */}
      {tlBands && (()=>{
        const isFut = tlYear !== '2025';
        const TL_XL = 24, TL_XR = 676, TL_SPAN = TL_XR - TL_XL;
        const tickX = (i) => TL_XL + i * (TL_SPAN / (DEMO_YEARS.length - 1));
        const idxFromClientX = (clientX) => {
          if (!tlRef.current) return tlIdx;
          const rect = tlRef.current.getBoundingClientRect();
          const x = ((clientX - rect.left) / rect.width) * 700;
          const i = Math.round((x - TL_XL) / (TL_SPAN / (DEMO_YEARS.length - 1)));
          return Math.max(0, Math.min(DEMO_YEARS.length - 1, i));
        };
        const setByClientX = (cx) => setFutureYear(DEMO_YEARS[idxFromClientX(cx)]);
        const BANDS = [
          { key: 'b064', label: '0-64', color: '#e2e8f0', tcol: '#475569', v: tlBands.b064 },
          { key: 'b6574', label: '65-74', color: '#fcd34d', tcol: '#78350f', v: tlBands.b6574 },
          { key: 'b75', label: '75+', color: '#f59e0b', tcol: '#7c2d12', v: tlBands.b75 },
        ];
        return (
        <div style={{marginTop:14,padding:'14px 16px',borderRadius:10,transition:'background 400ms ease',
          background:isFut?'#fffbeb':'#f8fafc',border:'1px solid '+(isFut?'#fde68a':'#eef2f7')}}>
          {/* ヘッダ + 系列バッジ */}
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:10}}>
            <span style={{fontSize:13,fontWeight:700,color:'#1e293b'}}>⏳ 人口タイムレンズ</span>
            <span style={{fontSize:10,color:'#94a3b8'}}>2020 → 2050 の高齢化ドリフト</span>
            {isFut
              ? <span style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#f59e0b',color:'#fff'}}>参考推計（社人研）</span>
              : <span style={{fontSize:9,fontWeight:700,padding:'2px 8px',borderRadius:10,background:'#dbeafe',color:'#1e40af'}}>2025基準（社人研推計・住基実測▲重畳）</span>}
          </div>
          {/* スクラバー（カスタムSVG・7目盛スナップ / ドラッグ / ←→キー / 再生） */}
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button onClick={()=>{ if(tlIdx>=DEMO_YEARS.length-1) setFutureYear(DEMO_YEARS[0]); setTlPlaying(p=>!p); }}
              aria-label={tlPlaying?'停止':'再生'} style={{flex:'0 0 auto',width:30,height:30,borderRadius:15,border:'1px solid '+(isFut?'#fbbf24':'#cbd5e1'),
              background:'#fff',cursor:'pointer',color:'#f59e0b',fontSize:12,fontWeight:700,lineHeight:1}}>{tlPlaying?'⏸':'▶'}</button>
            <div tabIndex={0} role="slider" aria-valuemin={0} aria-valuemax={DEMO_YEARS.length-1} aria-valuenow={tlIdx} aria-valuetext={tlYear+'年'}
              onKeyDown={(e)=>{ if(e.key==='ArrowRight'){e.preventDefault(); if(tlIdx<DEMO_YEARS.length-1) setFutureYear(DEMO_YEARS[tlIdx+1]);}
                else if(e.key==='ArrowLeft'){e.preventDefault(); if(tlIdx>0) setFutureYear(DEMO_YEARS[tlIdx-1]);} }}
              style={{flex:1,outline:'none',cursor:'pointer',touchAction:'none'}}>
              <svg ref={tlRef} viewBox="0 0 700 48" width="100%" style={{display:'block',userSelect:'none'}}
                onPointerDown={(e)=>{ tlDrag.current=true; try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}; setByClientX(e.clientX); }}
                onPointerMove={(e)=>{ if(tlDrag.current) setByClientX(e.clientX); }}
                onPointerUp={()=>{ tlDrag.current=false; }} onPointerLeave={()=>{ tlDrag.current=false; }}>
                <line x1={TL_XL} y1={20} x2={TL_XR} y2={20} stroke="#e2e8f0" strokeWidth={3} strokeLinecap="round" />
                <line x1={tickX(1)} y1={20} x2={tickX(tlIdx)} y2={20} stroke="#f59e0b" strokeWidth={3} strokeLinecap="round" style={{transition:'x2 300ms ease'}} />
                {DEMO_YEARS.map((y,i)=>{
                  const cx=tickX(i), on=i===tlIdx;
                  const col = y==='2025' ? '#2563EB' : (y==='2020' ? '#94a3b8' : '#f59e0b');
                  return (
                    <g key={y} onClick={()=>setFutureYear(y)} style={{cursor:'pointer'}}>
                      <circle cx={cx} cy={20} r={on?7:4} fill={on?col:'#fff'} stroke={col} strokeWidth={2} style={{transition:'r 150ms ease'}} />
                      {y==='2025' && <text x={cx} y={44} textAnchor="middle" fontSize={7} fill="#2563EB" fontWeight={700}>住基実測</text>}
                      <text x={cx} y={y==='2025'?37:37} textAnchor="middle" fontSize={9.5} fontWeight={on?700:400} fill={on?'#1e293b':'#94a3b8'}>{y}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
          {/* 選択年 KPI（モーフィング更新） */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,margin:'6px 0 10px'}}>
            {[['総人口', tlBands.pop!=null?fmt(tlBands.pop):'—', '人'],
              ['65歳以上', tlBands.r65.toFixed(1)+'%', tlJusaki?`住基実測 ${tlJusaki.r65.toFixed(1)}%`:''],
              ['75歳以上', tlBands.r75.toFixed(1)+'%', tlJusaki?`住基実測 ${tlJusaki.r75.toFixed(1)}%`:'']
            ].map(([lab,val,sub],i)=>(
              <div key={i} style={{background:'#fff',borderRadius:8,padding:'8px 10px',border:'1px solid #f1f5f9'}}>
                <div style={{fontSize:10,color:'#64748b'}}>{lab} <span style={{fontSize:9,color:'#94a3b8'}}>({tlYear})</span></div>
                <div style={{fontSize:mob?15:18,fontWeight:700,color:isFut?'#b45309':'#1e293b',transition:'color 300ms ease'}}>{val}</div>
                {sub && <div style={{fontSize:9,color:'#94a3b8'}}>{i===0?sub:sub}</div>}
              </div>
            ))}
          </div>
          {/* 3帯域 水平積み上げバー（width% を CSS transition でモーフィング） */}
          <div>
            <div style={{display:'flex',height:26,borderRadius:6,overflow:'hidden',border:'1px solid #f1f5f9'}}>
              {BANDS.map(b=>(
                <div key={b.key} title={`${b.label}歳 ${b.v.toFixed(1)}%`} style={{width:`${b.v}%`,background:b.color,
                  transition:'width 400ms ease',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
                  {b.v>=8 && <span style={{fontSize:9,fontWeight:700,color:b.tcol,whiteSpace:'nowrap'}}>{b.v.toFixed(0)}%</span>}
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:12,marginTop:5,flexWrap:'wrap'}}>
              {BANDS.map(b=>(
                <span key={b.key} style={{fontSize:9.5,color:'#64748b',display:'inline-flex',alignItems:'center',gap:4}}>
                  <span style={{width:9,height:9,borderRadius:2,background:b.color,display:'inline-block'}} />{b.label}歳 {b.v.toFixed(1)}%
                </span>
              ))}
            </div>
            <div style={{fontSize:9,color:'#94a3b8',marginTop:6}}>
              3帯域は total_pop × aging_rate から厳密導出（0-64=100−rate65 / 65-74=rate65−rate75 / 75+=rate75）。全年とも社人研推計系列（{isFut?tlYear+'年':'2025年基準'}）。
              {!isFut && tlJusaki && ` 住基2025実測との75+乖離 ${(tlBands.r75-tlJusaki.r75>=0?'+':'')}${(tlBands.r75-tlJusaki.r75).toFixed(1)}pt。`}
            </div>
          </div>
          {/* 47県ダンベル 展開 */}
          <button onClick={()=>setDumbbellOpen(o=>!o)} style={{marginTop:12,padding:'6px 12px',borderRadius:8,
            border:'1px solid '+(isFut?'#fbbf24':'#cbd5e1'),background:'#fff',color:'#475569',fontSize:11,fontWeight:600,cursor:'pointer'}}>
            {dumbbellOpen?'▲ 閉じる':`▾ 47県の中での動きを見る（起点2025推計 → 終点${tlYear}推計）`}
          </button>
          {dumbbellOpen && dumbbell && (()=>{
            const { rows, vmin, vmax } = dumbbell;
            const DXL=96, DXR=668, DSPAN=DXR-DXL, ROWH=13, DH=rows.length*ROWH+30;
            const xS=(v)=>DXL+(vmax>vmin?(v-vmin)/(vmax-vmin):0)*DSPAN;
            return (
              <div style={{marginTop:10}}>
                <div style={{display:'flex',gap:14,flexWrap:'wrap',marginBottom:6,fontSize:9.5,color:'#64748b'}}>
                  <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:4,background:'#cbd5e1',display:'inline-block'}} />起点 2025推計</span>
                  <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:4,background:'#f59e0b',display:'inline-block'}} />終点 {tlYear}推計</span>
                  <span style={{display:'inline-flex',alignItems:'center',gap:4}}><span style={{color:'#94a3b8'}}>▲</span> 住基2025実測</span>
                  <span style={{color:'#94a3b8'}}>指標=75歳以上割合(%)・行順=2025推計の高い順で固定</span>
                </div>
                <div style={{maxHeight:520,overflowY:'auto',border:'1px solid #f1f5f9',borderRadius:8,background:'#fff'}}>
                  <svg viewBox={`0 0 700 ${DH}`} width="100%" style={{display:'block'}}>
                    {/* 値軸 */}
                    {[vmin,Math.round((vmin+vmax)/2),vmax].map((v,i)=>(
                      <g key={i}>
                        <line x1={xS(v)} y1={16} x2={xS(v)} y2={DH-6} stroke="#f1f5f9" strokeWidth={1} />
                        <text x={xS(v)} y={11} textAnchor="middle" fontSize={8} fill="#cbd5e1">{v}%</text>
                      </g>
                    ))}
                    {rows.map((r,i)=>{
                      const y=24+i*ROWH, sel=r.pref===ndbPref, pin=r.pref===pinnedPref, hov=r.pref===hoverPref;
                      const endCol=sel?'#2563EB':(pin?'#ea580c':'#f59e0b');
                      return (
                        <g key={r.pref} onMouseEnter={()=>setHoverPref(r.pref)} onMouseLeave={()=>setHoverPref(null)}
                          onClick={()=>stripCommon.onPin(r.pref)} style={{cursor:'pointer'}}>
                          <rect x={0} y={y-6} width={700} height={ROWH} fill={hov?'#eff6ff':(sel?'#f8fbff':'transparent')} />
                          <text x={6} y={y+3} fontSize={8.5} fontWeight={sel||pin?700:400}
                            fill={sel?'#2563EB':(pin?'#ea580c':'#64748b')}>{pin?'◆ ':''}{r.pref}</text>
                          <line x1={xS(r.v2025)} y1={y} x2={xS(r.vEnd)} y2={y} stroke="#fcd34d" strokeWidth={2.5} strokeLinecap="round" style={{transition:'x2 300ms ease'}} />
                          <circle cx={xS(r.v2025)} cy={y} r={2.6} fill="#cbd5e1" />
                          <circle cx={xS(r.vEnd)} cy={y} r={sel?4:3.4} fill={endCol} style={{transition:'cx 300ms ease'}} />
                          {r.jusaki!=null && <path d={`M ${xS(r.jusaki)} ${y-5} L ${xS(r.jusaki)-3} ${y+1} L ${xS(r.jusaki)+3} ${y+1} Z`} fill="#94a3b8" />}
                          <text x={xS(r.vEnd)+7} y={y+3} fontSize={8} fill={endCol} fontWeight={sel?700:400}>{r.vEnd.toFixed(0)}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
                <div style={{fontSize:9,color:'#94a3b8',marginTop:6}}>
                  行click＝比較ピン（他ストリップと連動）。起点・終点とも社人研推計系列で統一（系列不連続による傾き歪みを回避）し、住基2025実測は▲で別途重畳。順位・傾きは<b>推計値</b>に基づく参考値です。
                </div>
              </div>
            );
          })()}
        </div>
        );
      })()}
    </div>
  )}

  {/* ═══ Layer 1: ROOT CAUSE (生活習慣リスク) ═══ */}
  {ndbQ && ndbQ.prefectures?.[ndbPref] && (()=>{
    const qd = ndbQ.prefectures[ndbPref];
    const qs = ndbQ.questions || {};
    const RISK_ICONS = {
      // 生活習慣 (lifestyle)
      smoking:'🚬', weight_gain:'⚖️', exercise:'🏃', walking:'🚶',
      late_dinner:'🌙', drinking_daily:'🍶', heavy_drinker:'🥃', sleep_ok:'😴',
      // 服薬 (medication)
      hypertension_med:'💊', diabetes_medication:'💊', lipid_medication:'💊',
      // 既往歴 (history)
      heart_disease:'🏥', stroke_history:'🏥', ckd_history:'🏥',
    };
    // 高い値=低リスクの項目 — delta色判定を反転。
    // ★sleep_okのみ: exercise/walkingの格納値は「いいえ」率=運動不足率/歩行不足率
    // （risk_labelもデータ側で「◯◯不足率」・原典xlsx検証済）で高=リスク方向のため反転しない。
    const INVERSE_KEYS = new Set(['sleep_ok']);
    // Compute national averages（rank1修正: 「都道府県判別不可」を除外し47県のみで平均）
    const prefEntries47 = Object.entries(ndbQ.prefectures).filter(([p])=>isP47(p));
    const allPrefs = prefEntries47.map(([,v])=>v);
    const natAvg = {};
    for (const key of Object.keys(qd)) {
      const vals = allPrefs.map(p=>p[key]).filter(v=>v!=null);
      natAvg[key] = vals.length > 0 ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
    }
    // rank1: 各項目の47県分布ストリップ用 values
    const stripVals = (key) => prefEntries47.map(([p,v])=>({pref:p, value:v[key]})).filter(d=>d.value!=null);
    // ── tierゾーン発散バー「県の性格プロファイル」──
    // 3バンド化（qs[key].category）: ①生活習慣8=方向色（赤=リスク方向/緑=保護方向・睡眠充足のみ反転）
    // ②服薬3 ③既往歴3=中立発散（rose=多い/indigo=少ない — FP_TIERS両端と同一・良し悪しでない）
    const BANDS = [
      { cat:'lifestyle',  label:'生活習慣', badge:'高=リスク方向・睡眠充足のみ高=良',
        badgeStyle:{background:'#fef2f2',color:'#b91c1c',border:'1px solid #fecaca'}, sortable:true },
      { cat:'medication', label:'服薬',     badge:'方向中立（事実）',
        badgeStyle:{background:'#eef2ff',color:'#4338ca',border:'1px solid #c7d2fe'}, sortable:false },
      { cat:'history',    label:'既往歴',   badge:'方向中立（事実）',
        badgeStyle:{background:'#eef2ff',color:'#4338ca',border:'1px solid #c7d2fe'}, sortable:false },
    ];
    const bandKeys = (cat) => Object.keys(qs).filter(k => qs[k]?.category === cat && qd[k] != null);
    // 発散トラック: x=対全国比−100 のリニア写像・domain[−40,+40]%固定
    // （受療率フォレスト/Layer4のlog2比軸とは別文法 — tierゾーン帯±5/±15を面で常設）
    const DOM = 40;
    const devOf = (v, nat) => (v != null && nat > 0) ? (v / nat - 1) * 100 : null;
    const xPct = (dev) => 50 + Math.max(-DOM, Math.min(DOM, dev)) / DOM * 50;
    const devMap = {};
    Object.keys(qd).forEach(k => { devMap[k] = devOf(qd[k], natAvg[k] || 0); });
    const reduced = prefersReducedMotion();
    const badge = yb('ndbQ');
    const renderRow = (key, sortable) => {
      const q = qs[key] || {};
      const rate = qd[key];
      const nat = natAvg[key] || 0;
      const dev = devMap[key];
      if (rate == null || dev == null) return null;
      const delta = rate - nat;
      const isLife = q.category === 'lifestyle';
      const inverse = INVERSE_KEYS.has(key);
      // 色: 生活習慣=リスク方向へ乖離で赤/保護方向で緑。服薬・既往=多rose/少indigo中立（判定対象外）
      const dirColor = isLife
        ? ((inverse ? dev < 0 : dev > 0) ? '#dc2626' : '#059669')
        : (dev >= 0 ? '#9f1239' : '#4338ca');
      const t = tierOf(dev);
      const clamped = dev > DOM ? 'high' : dev < -DOM ? 'low' : null;
      const tipX = xPct(dev);
      const sv = stripVals(key);
      const rank = 1 + sv.filter(x => x.value > rate).length;
      // 人間スケール翻訳（rate<2%は1000人中へ自動切替 — 低base項目の1人未満不可視を回避）
      const chipTxt = rate < 2
        ? `1000人中${Math.round(rate * 10)}人（全国${Math.round(nat * 10)}人）`
        : `100人中${Math.round(rate)}人（全国${Math.round(nat)}人）`;
      const pinVal = (pinnedPref && pinnedPref !== ndbPref) ? (ndbQ.prefectures[pinnedPref]?.[key] ?? null) : null;
      const pinDev = devOf(pinVal, nat);
      const open = qExpandedKey === key;
      const barL = Math.min(50, tipX), barW = Math.abs(tipX - 50);
      // tierことばチップ: バー先端に併置（端付近はトラック内側へ反転し見切れ回避）
      const chipInward = dev >= 0 ? tipX > 72 : tipX < 28;
      const tierChipStyle = dev >= 0
        ? (chipInward ? { left: `calc(${tipX}% - 5px)`, transform: 'translate(-100%,-50%)' } : { left: `calc(${tipX}% + 5px)`, transform: 'translateY(-50%)' })
        : (chipInward ? { left: `calc(${tipX}% + 5px)`, transform: 'translateY(-50%)' } : { left: `calc(${tipX}% - 5px)`, transform: 'translate(-100%,-50%)' });
      return (
      <div key={key} ref={sortable ? (el) => { qRowRefs.current[key] = el; } : undefined}
        style={{ ...dFade('ndbQKey', key), ...dBorder('ndbQKey', key) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: mob ? 6 : 10, cursor: 'pointer' }}
          onClick={() => setQExpandedKey(open ? null : key)}
          onMouseEnter={() => setQHoverKey(key)} onMouseLeave={() => setQHoverKey(null)}>
          <span style={{ fontSize: 16, width: 24, flexShrink: 0 }}>{RISK_ICONS[key] || '📋'}</span>
          <span style={{ width: mob ? 70 : 90, fontSize: mob ? 11 : 12, fontWeight: 600, color: '#475569', flexShrink: 0 }}>
            {q.risk_label || key}<span style={{ marginLeft: 3, fontSize: 9, color: '#cbd5e1' }}>{open ? '▾' : '▸'}</span>
          </span>
          <div style={{ flex: 1, position: 'relative', height: 26, minWidth: 80 }}>
            {/* tierゾーン帯（±5内/±5〜15/±15超=tier色8%）+発散バー — overflow hidden内層 */}
            <div style={{ position: 'absolute', inset: 0, borderRadius: 4, overflow: 'hidden' }}>
              {[[-DOM, -15, 'rgba(67,56,202,0.08)'], [-15, -5, '#f1f5f9'], [-5, 5, '#f8fafc'], [5, 15, '#f1f5f9'], [15, DOM, 'rgba(159,18,57,0.08)']].map(([a, b, bg], zi) => (
                <div key={zi} style={{ position: 'absolute', left: `${xPct(a)}%`, width: `${xPct(b) - xPct(a)}%`, top: 0, bottom: 0, background: bg }} />
              ))}
              {[-15, -5, 5, 15].map(z => (
                <div key={z} style={{ position: 'absolute', left: `${xPct(z)}%`, top: 0, bottom: 0, borderLeft: '1px dashed #cbd5e1' }} />
              ))}
              {/* 発散バー（中央0→乖離%・width/left 400ms・reduced-motionで無効） */}
              <div style={{ position: 'absolute', top: 6, height: 14, borderRadius: 7, left: `${barL}%`, width: `${barW}%`, background: dirColor, opacity: 0.8,
                transition: reduced ? 'none' : 'left 400ms ease, width 400ms ease, background 300ms ease' }} />
            </div>
            {/* 中央0=全国線（#2563EB 2px実線+上端△ — PrefStrip47のavg語彙） */}
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, marginLeft: -1, background: '#2563EB', opacity: 0.85, zIndex: 1 }} />
            <div style={{ position: 'absolute', left: '50%', top: -4, transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '4px solid #2563EB', zIndex: 2 }} />
            {/* ◆ピン県tick（橙・同トラック上の乖離位置 — 域外は端クランプ） */}
            {pinDev != null && (
              <div title={`◆${pinnedPref} ${pinVal.toFixed(1)}%（対全国比${pinDev > 0 ? '+' : ''}${pinDev.toFixed(1)}%）`}
                style={{ position: 'absolute', left: `calc(${xPct(pinDev)}% - 4px)`, top: 9, width: 8, height: 8, background: '#f97316', border: '1px solid #c2410c', transform: 'rotate(45deg)', zIndex: 3 }} />
            )}
            {/* 域外クランプ ◂/▸（値は捏造しない — チップ・ツールチップに常時実値） */}
            {clamped && (
              <span style={{ position: 'absolute', [clamped === 'high' ? 'right' : 'left']: -2, top: '50%', transform: 'translateY(-50%)', fontSize: 10, fontWeight: 700, color: '#1e293b', zIndex: 3 }}>{clamped === 'high' ? '▸' : '◂'}</span>
            )}
            {/* tierことばチップ（バー先端併置・±5/±15のことばスケール） */}
            {t && <span style={{ position: 'absolute', top: '50%', ...tierChipStyle, fontSize: 8.5, fontWeight: 700, color: t.color, background: '#fff', border: `1px solid ${t.color}55`, borderRadius: 3, padding: '0 4px', lineHeight: '13px', whiteSpace: 'nowrap', zIndex: 2, pointerEvents: 'none' }}>{mob ? t.short : t.label}</span>}
            {/* hover=濃紺ツールチップ（実値/全国/Δpt/対全国比/47県中順位/年度） */}
            {qHoverKey === key && !mob && (
              <div style={{ position: 'absolute', left: '50%', top: -6, transform: 'translate(-50%,-100%)', background: '#1e293b', color: '#fff', fontSize: 10, lineHeight: 1.5, padding: '5px 8px', borderRadius: 4, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}>
                <b>{ndbPref}</b> <span style={{ color: '#93c5fd', fontWeight: 700 }}>{rate.toFixed(1)}%</span>
                <span style={{ color: '#cbd5e1' }}>（全国 {nat.toFixed(1)}%・Δ{delta > 0 ? '+' : ''}{delta.toFixed(1)}pt）</span><br />
                対全国比 {dev > 0 ? '+' : ''}{dev.toFixed(1)}%{clamped ? '（軸域外→端に表示）' : ''} ・ 47県中{rank}位 ・ {badge.label}
              </div>
            )}
          </div>
          {/* 右端: 実値%大数字（useCountUp・tabular-nums）+Δptサブ+人間スケールチップ */}
          <div style={{ width: mob ? 86 : 122, flexShrink: 0, textAlign: 'right', lineHeight: 1.25 }}>
            <div>
              <span style={{ fontSize: mob ? 15 : 17, fontWeight: 800, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}><CountUpNum value={rate} decimals={1} /></span>
              <span style={{ fontSize: 9, color: '#64748b' }}>%</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: dirColor, marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}pt</span>
            </div>
            <div style={{ fontSize: 8.5, color: '#94a3b8' }}>{chipTxt}</div>
          </div>
        </div>
        {/* click=展開: 質問文原文+PrefStrip47 inline+47県中順位+◆比較行（単一openアコーディオン） */}
        {open && (
          <div style={{ margin: '6px 0 8px 34px', padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #eef2f7' }}>
            <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>Q: {q.question}{q.label && q.label !== q.risk_label ? `（${q.label}）` : ''}</div>
            <PrefStrip47 {...stripCommon} values={sv} natAvg={nat} inverse={inverse} yearBadge={badge} mode="inline" />
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
              47県中 <b style={{ color: '#334155' }}>{rank}位</b>（1位=最高値）・全国 {nat.toFixed(1)}%・対全国比 <b style={{ color: t ? t.color : '#334155' }}>{dev > 0 ? '+' : ''}{dev.toFixed(1)}%＝{t ? t.label : ''}</b>
            </div>
            {pinVal != null && (
              <div style={{ fontSize: 10, color: '#c2410c', marginTop: 2 }}>
                ◆{pinnedPref} {pinVal.toFixed(1)}%（Δ全国 {(pinVal - nat) > 0 ? '+' : ''}{(pinVal - nat).toFixed(1)}pt・{ndbPref}との差 {(rate - pinVal) > 0 ? '+' : ''}{(rate - pinVal).toFixed(1)}pt）
              </div>
            )}
          </div>
        )}
      </div>);
    };
    return (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        <span style={{fontSize:18}}>⚠️</span>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>生活習慣・服薬・既往歴 — 県の性格プロファイル
            <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#e0e7ff',color:'#3730a3',fontWeight:500}}>質問票14項目</span>
            <span style={{marginLeft:4,fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:4,color:badge.color,background:badge.color+'1a',border:`1px solid ${badge.color}33`}}>{badge.label}</span>
          </div>
          <div style={{fontSize:11,color:'#94a3b8'}}>特定健診 質問票（40〜74歳受診者の自己申告）— 対全国比%の発散バー・±5/±15のことばゾーン常設</div>
        </div>
      </div>
      {/* 軸ヘッダ（−40%…全国0…+40% リニア軸） */}
      <div style={{display:'flex',alignItems:'center',gap:mob?6:10,marginBottom:2}}>
        <span style={{width:24,flexShrink:0}}/>
        <span style={{width:mob?70:90,flexShrink:0}}/>
        <div style={{flex:1,position:'relative',height:12,fontSize:8.5,color:'#94a3b8',minWidth:80}}>
          <span style={{position:'absolute',left:0}}>−40%</span>
          <span style={{position:'absolute',left:'50%',transform:'translateX(-50%)',color:'#2563EB',fontWeight:700}}>全国=0</span>
          <span style={{position:'absolute',right:0}}>+40%</span>
        </div>
        <span style={{width:mob?86:122,flexShrink:0}}/>
      </div>
      {BANDS.map((band)=>{
        let keys = bandKeys(band.cat);
        if (band.sortable && qSort==='divergence') keys = [...keys].sort((a,b)=>Math.abs(devMap[b]??0)-Math.abs(devMap[a]??0));
        return (
        <div key={band.cat} style={{marginBottom:8}}>
          <div style={{display:'flex',alignItems:'center',gap:8,margin:'8px 0 6px',flexWrap:'wrap'}}>
            <span style={{fontSize:11,fontWeight:700,color:'#334155'}}>{band.label} <span style={{color:'#94a3b8',fontWeight:500}}>{keys.length}項目</span></span>
            <span style={{fontSize:8.5,fontWeight:600,padding:'1px 6px',borderRadius:4,...band.badgeStyle}}>{band.badge}</span>
            {band.sortable && (
              <span style={{marginLeft:'auto',display:'flex',gap:4}}>
                {[['item','項目順'],['divergence','乖離大順']].map(([k,l])=>(
                  <button key={k} onClick={()=>{ setQSort(k); setQExpandedKey(null); /* ソート切替時は展開を閉じる(FLIP文法) */ }}
                    style={{padding:'2px 8px',borderRadius:5,border:`1px solid ${qSort===k?'#9f1239':'#e2e8f0'}`,
                      background:qSort===k?'#9f1239':'#fff',color:qSort===k?'#fff':'#475569',fontSize:10,fontWeight:600,cursor:'pointer'}}>{l}</button>
                ))}
              </span>
            )}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {keys.map((k)=>renderRow(k, band.sortable))}
          </div>
        </div>);
      })}
      <div style={{fontSize:10,color:'#94a3b8',marginTop:10,lineHeight:1.7}}>
        ※軸=対全国比%（−40〜+40固定のリニア軸）。背景の帯=±5/±15の<b>ことばゾーン</b>（標準域/やや高・低/突出高・低）。バー色は生活習慣=<b style={{color:'#dc2626'}}>赤=リスク方向へ乖離</b>/<b style={{color:'#059669'}}>緑=保護方向へ乖離</b>（睡眠充足のみ高=低リスク方向。運動不足率・歩行不足率は高=リスク方向）、服薬・既往歴=<b style={{color:'#9f1239'}}>rose=全国より多い</b>/<b style={{color:'#4338ca'}}>indigo=全国より少ない</b>の中立発散 — <b>服薬・既往は治療負荷・既往の事実で良し悪しの判定対象外</b>。<br/>
        ※40〜74歳特定健診受診者の<b>自己申告</b>（受診者バイアスあり）。低該当率項目（既往歴等）の対全国比%は小さな実数差でも大きく振れます（Δpt併記）。|対全国比|&gt;40%は端に表示（◂/▸マーカー・実値は人数チップとツールチップ）。行クリックで質問文原文と47県分布を展開。◆=比較ピン県。
      </div>
    </div>);
  })()}

  {/* ═══ Layer 2: RISK (健診リスク) — 2セクション化 (Phase 2D-Layer2) ═══ */}
  {(hcPref.length > 0 || ndbCheckupRiskRates) && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>🔬</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>健診リスク <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#dbeafe',color:'#1e40af',fontWeight:500}}>検査値+該当者率</span></div>
        <div style={{fontSize:11,color:'#94a3b8'}}>特定健診（40〜74歳受診者） — A.検査値平均 + B.リスク該当者率</div>
      </div>
    </div>

    {/* ── サブセクション A: 検査値平均 ── */}
    {hcPref.length > 0 && <div style={{marginBottom:18}}>
      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:'#475569',padding:'2px 8px',background:'#f1f5f9',borderRadius:4}}>A. 検査値平均</span>
        <span style={{fontSize:10,color:'#94a3b8'}}>男女別の平均値（参考値）</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(3,1fr)',gap:12}}>
        {hcPref.map((h,i)=>{
          const meta = RISK_META[h.metric] || {};
          // rank1: 検査値の47県分布（男女平均、判別不可除外）
          const hcVals = (ndbHc||[]).filter(x=>x.metric===h.metric && isP47(x.pref) && x.male!=null && x.female!=null)
            .map(x=>({pref:x.pref, value:(x.male+x.female)/2}));
          return <div key={i} style={{background:'#f8fafc',borderRadius:10,padding:'14px 16px',...dFade('hcMetric',h.metric),...dBorder('hcMetric',h.metric)}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
              <span style={{fontSize:13,fontWeight:600}}>{meta.icon||''} {h.metric}</span>
              <span style={{fontSize:10,color:'#94a3b8',background:'#fff',padding:'2px 6px',borderRadius:4}}>{meta.unit||''}</span>
            </div>
            <div style={{display:'flex',gap:20}}>
              <div><div style={{fontSize:10,color:'#3b82f6'}}>男性</div><div style={{fontSize:22,fontWeight:700,color:'#2563EB'}}>{h.male}</div></div>
              <div><div style={{fontSize:10,color:'#dc2626'}}>女性</div><div style={{fontSize:22,fontWeight:700,color:'#dc2626'}}>{h.female}</div></div>
            </div>
            <div style={{fontSize:10,color:'#94a3b8',marginTop:6}}>{meta.note||''}</div>
            {hcVals.length >= 40 && <div style={{marginTop:8}}><PrefStrip47 {...stripCommon} values={hcVals} yearBadge={yb('ndbHc')} mode="inline" /><div style={{fontSize:9,color:'#94a3b8',marginTop:1}}>男女平均の47県分布</div></div>}
          </div>;
        })}
      </div>
      <div style={{fontSize:10,color:'#94a3b8',marginTop:8,fontStyle:'italic'}}>※男女別平均値をもとにした参考値。疾病診断率ではありません。</div>
    </div>}

    {/* ── サブセクション B: リスク該当者率 (Phase 1 + Phase 2C-1) ── */}
    {ndbCheckupRiskRates?.risk_rates && (() => {
      // RISK_CARDS はモジュールレベルへ昇格（分布ドロワーの指標タブと共用・内容不変）
      return <div>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
          <span style={{fontSize:11,fontWeight:700,color:'#475569',padding:'2px 8px',background:'#fef3c7',borderRadius:4}}>B. リスク該当者率</span>
          <span style={{fontSize:10,color:'#94a3b8'}}>NDB特定健診の階級分布から算出 — 粗率＋年齢標準化率</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(5,1fr)',gap:10}}>
          {RISK_CARDS.map(rc => {
            const rates = ndbCheckupRiskRates.risk_rates[rc.key];
            if (!rates) return null;
            const prefEntry = rates.by_pref?.[ndbPref];
            if (!prefEntry) return null;
            const prefVal = prefEntry.rate;
            // rank1修正: 「都道府県判別不可」を除外し47県のみで平均・分布化
            const p47Entries = Object.entries(rates.by_pref).filter(([p])=>isP47(p));
            const stripVals = p47Entries.map(([p,v])=>({pref:p, value:v.rate})).filter(d=>typeof d.value==='number');
            const allVals = stripVals.map(d=>d.value);
            const natAvg = allVals.length > 0 ? allVals.reduce((s,v)=>s+v,0)/allVals.length : null;
            const deltaPct = natAvg ? (prefVal/natAvg - 1) * 100 : null;
            // 自然言語化
            let cmpLabel = '', cmpColor = '#64748b';
            if (deltaPct != null) {
              const abs = Math.abs(deltaPct);
              if (abs < 5) { cmpLabel = '47都道府県平均と同程度'; cmpColor = '#64748b'; }
              else if (deltaPct > 0) {
                cmpLabel = abs >= 15 ? '47都道府県平均より顕著に高い' : '47都道府県平均より高い';
                cmpColor = abs >= 15 ? '#dc2626' : '#f59e0b';
              } else {
                cmpLabel = abs >= 15 ? '47都道府県平均より顕著に低い' : '47都道府県平均より低い';
                cmpColor = '#059669';
              }
            }
            // 年齢標準化率
            const stdInfo = ndbCheckupRiskRatesStd?.risk_rates?.[rc.key]?.by_pref?.[ndbPref];
            // 分布ドロワー連携: click=該当指標でドロワーへ / 網掛けhover時は該当カードをリング強調
            const binsCardActive = binsOpen && RISK_BIN_THRESHOLD[rc.key]?.metric === binsMetric;
            return <div key={rc.key}
              onClick={(e)=>{ if (e.target && e.target.closest && e.target.closest('svg,button,a')) return; binsJumpTo(rc.key); }}
              title="クリックで下の分布ドロワーに階級分布を表示"
              style={{background:'#f8fafc',borderRadius:10,padding:'12px 14px',cursor:'pointer',borderLeft:`3px solid ${(activeDomain&&dMatch('riskKey',rc.key))?dm.color:rc.color}`,...dFade('riskKey',rc.key),
                boxShadow: binsZoneHover && binsCardActive ? `0 0 0 2px ${rc.color}` : 'none',
                transition:'opacity 300ms ease, box-shadow 300ms ease'}}>
              <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:6}}>
                <span style={{fontSize:14}}>{rc.icon}</span>
                <span style={{fontSize:11,fontWeight:600,color:'#1e293b'}}>{rc.label}</span>
              </div>
              <div style={{fontSize:24,fontWeight:700,color:'#1e293b',lineHeight:1.1}}>{prefVal.toFixed(1)}<span style={{fontSize:13,fontWeight:500,color:'#64748b'}}>%</span></div>
              {stdInfo && stdInfo.age_standardized_rate != null && (
                <div title="NDB内標準人口で直接標準化（47県合算 sex × age_group）" style={{fontSize:9,color:'#7c3aed',marginTop:3,fontWeight:500}}>
                  年齢標準化 {stdInfo.age_standardized_rate.toFixed(1)}% ({stdInfo.delta_pp >= 0 ? '+' : ''}{stdInfo.delta_pp.toFixed(1)}pp)
                </div>
              )}
              {cmpLabel && (
                <div style={{fontSize:10,color:cmpColor,fontWeight:600,marginTop:4}}>
                  {cmpLabel} ({deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                </div>
              )}
              <div style={{fontSize:9,color:'#94a3b8',marginTop:3,lineHeight:1.3}}>{rc.fullLabel}</div>
              {stripVals.length >= 40 && <div style={{marginTop:6}}><PrefStrip47 {...stripCommon} values={stripVals} natAvg={natAvg} yearBadge={yb('checkupRisk')} mode="micro" /></div>}
            </div>;
          })}
        </div>
        <div style={{fontSize:10,color:'#94a3b8',marginTop:8,fontStyle:'italic',lineHeight:1.6}}>
          ※NDB特定健診の階級分布から算出した該当者率です。40–74歳の健診受診者ベースであり、地域住民全体の有病率ではありません。<br/>
          ※<span style={{color:'#7c3aed',fontWeight:500}}>年齢標準化率</span>: NDB特定健診データ内の性・年齢階級構成を標準人口とした直接標準化率（地域住民全体の年齢調整率ではありません）。
        </div>

        {/* ── 分布ドロワー: 臨床閾値ヒストグラム（Phase 2D-Layer2 追加型・A/Bカード非破壊） ──
            県=塗りバー / 全国=灰ゴースト輪郭 / 臨床閾値から先=リスク色網掛け（面積=Bカード該当者率と一致） */}
        <div ref={binsBoxRef} style={{marginTop:12,border:'1px solid #e2e8f0',borderRadius:10,background:'#fff',overflow:'hidden'}}>
          <button onClick={()=>setBinsOpen(o=>!o)} aria-expanded={binsOpen}
            style={{width:'100%',display:'flex',alignItems:'center',gap:8,padding:mob?'9px 12px':'10px 14px',border:'none',background:binsOpen?'#f8fafc':'#fff',cursor:'pointer',textAlign:'left'}}>
            <span style={{fontSize:13}}>📊</span>
            <span style={{fontSize:11.5,fontWeight:700,color:'#1e293b'}}>分布ドロワー — 検査値階級の分布と臨床閾値</span>
            {/* yb('checkupRisk')=R4 バッジ（ドロワーヘッダ必須） */}
            <span style={{fontSize:8.5,fontWeight:700,padding:'1px 5px',borderRadius:3,border:`1px solid ${yb('checkupRisk').color}`,color:yb('checkupRisk').color,background:'#fff',flexShrink:0}}>{yb('checkupRisk').label}</span>
            {!mob && <span style={{fontSize:9.5,color:'#94a3b8'}}>県=塗り / 全国=灰輪郭 / 閾値から先=網掛け</span>}
            <span style={{marginLeft:'auto',fontSize:10,color:'#64748b',fontWeight:600,flexShrink:0}}>{binsOpen?'▲ 閉じる':'▼ 分布を見る'}</span>
          </button>
          {binsOpen && (()=>{
            const riskKeyOfMetric = METRIC_TO_RISK_KEY[binsMetric];
            const activeCard = RISK_CARDS.find(c=>c.key===riskKeyOfMetric) || RISK_CARDS[0];
            // rank2: ドメインレンズ — 該当指標タブを前面化（例: 循環器→SBP/LDLが先頭）
            const tabCards = activeDomain ? [...RISK_CARDS].sort((a,b)=>(dMatch('riskKey',b.key)?1:0)-(dMatch('riskKey',a.key)?1:0)) : RISK_CARDS;
            const binLabels = binsData?.binOrder?.[binsMetric] || [];
            const ageGroups = binsData?.ageGroups || [];
            return <div style={{padding:mob?'10px 12px 12px':'12px 16px 14px'}}>
              {/* 指標タブ5種（RISK_CARDS流用: key/色/fullLabel） */}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                {tabCards.map(c=>{
                  const m = RISK_BIN_THRESHOLD[c.key].metric;
                  const on = binsMetric === m;
                  return <button key={c.key} onClick={()=>setBinsMetric(m)} title={c.fullLabel}
                    style={{padding:mob?'4px 8px':'4px 10px',fontSize:10,fontWeight:600,borderRadius:5,cursor:'pointer',
                      border:`1px solid ${on?c.color:'#e2e8f0'}`,background:on?c.color:'#fff',color:on?'#fff':'#475569',
                      opacity: activeDomain && !dMatch('riskKey',c.key) ? 0.4 : 1, transition:'opacity 300ms ease'}}>
                    {c.icon} {c.label}
                  </button>;
                })}
              </div>
              {/* 性別トグル（全体=男女クライアント合算）+ ⇄ミラー + 累積%副トグル */}
              <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:8}}>
                <div style={{display:'flex',border:'1px solid #e2e8f0',borderRadius:6,overflow:'hidden',opacity:binsMirror?0.45:1,pointerEvents:binsMirror?'none':'auto'}}
                  title={binsMirror?'ミラーモード中は男女両方を表示しています':''}>
                  {[['all','全体'],['male','男'],['female','女']].map(([k,l])=>(
                    <button key={k} onClick={()=>setBinsSex(k)}
                      style={{padding:'4px 10px',border:'none',fontSize:10,fontWeight:600,cursor:'pointer',
                        background:binsSex===k?(k==='male'?'#2563EB':k==='female'?'#dc2626':'#475569'):'#fff',
                        color:binsSex===k?'#fff':'#475569'}}>{l}</button>
                  ))}
                </div>
                <button onClick={()=>setBinsMirror(m=>!m)} title="男女を左右鏡像で並置（モバイルは縦積み）"
                  style={{padding:'4px 10px',fontSize:10,fontWeight:600,borderRadius:6,cursor:'pointer',
                    border:`1px solid ${binsMirror?'#1e293b':'#e2e8f0'}`,background:binsMirror?'#1e293b':'#fff',color:binsMirror?'#fff':'#475569'}}>
                  ⇄ ミラー
                </button>
                <button onClick={()=>setBinsCdf(c=>!c)}
                  style={{padding:'4px 6px',fontSize:10,fontWeight:600,borderRadius:6,cursor:'pointer',border:'none',
                    background:'transparent',color:binsCdf?'#1d4ed8':'#64748b',textDecoration:'underline'}}>
                  {binsCdf?'構成%に戻す':'累積%で見る'}
                </button>
              </div>
              {/* 年齢帯セグメント（7帯+全年齢） */}
              {ageGroups.length>0 && (
                <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:10}}>
                  {['all',...ageGroups].map(a=>(
                    <button key={a} onClick={()=>setBinsAge(a)}
                      style={{padding:'3px 8px',fontSize:9.5,fontWeight:600,borderRadius:10,cursor:'pointer',
                        border:`1px solid ${binsAge===a?'#475569':'#e2e8f0'}`,
                        background:binsAge===a?'#475569':'#fff',color:binsAge===a?'#fff':'#64748b'}}>
                      {a==='all'?'全年齢':`${a}歳`}
                    </button>
                  ))}
                </div>
              )}
              {/* 本体（prefResolved=false 防御 — データ未取得県では描画しない） */}
              <div style={dFade('riskKey', riskKeyOfMetric)}>
                {binsData == null ? (
                  <div style={{fontSize:11,color:'#94a3b8',padding:'26px 0',textAlign:'center'}}>分布データ取得中…</div>
                ) : !binsData.prefResolved || binLabels.length===0 ? (
                  <div style={{fontSize:11,color:'#94a3b8',padding:'20px 0',textAlign:'center'}}>この都道府県の{binsMetric}分布データが取得できませんでした。</div>
                ) : (
                  <CheckupBinsHistogram
                    rows={binsData.rows}
                    pinRows={binsPinData?.rows || null}
                    binLabels={binLabels}
                    metric={binsMetric}
                    sex={binsSex} age={binsAge} mirror={binsMirror} cdf={binsCdf}
                    color={activeCard.color} colorDeep={RISK_COLOR_DEEP[activeCard.key] || activeCard.color}
                    prefName={ndbPref}
                    pinnedName={binsPinData ? pinnedPref : null}
                    yearBadge={yb('checkupRisk')}
                    mob={mob} pulse={binsPulse}
                    onZoneHover={setBinsZoneHover}
                  />
                )}
                {/* 凡例 */}
                <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',fontSize:9.5,color:'#64748b',marginTop:8}}>
                  <span><span style={{display:'inline-block',width:10,height:10,background:'#94a3b8',borderRadius:2,verticalAlign:'-1px'}}/> {ndbPref}（構成%）</span>
                  <span><span style={{display:'inline-block',width:10,height:10,border:'1.5px solid #cbd5e1',borderRadius:2,verticalAlign:'-1px',background:'#fff'}}/> 全国（灰輪郭）</span>
                  <span style={{color:RISK_COLOR_DEEP[activeCard.key]||activeCard.color,fontWeight:600}}>▨ 閾値{RISK_BIN_THRESHOLD[activeCard.key].thLabel}から先=リスク該当域（網掛け面積=Bカードの該当者率）</span>
                  {binsPinData && <span style={{color:'#c2410c',fontWeight:600}}>◆ {pinnedPref}（橙点線輪郭）</span>}
                </div>
              </div>
              {/* 脚注（guardrails: 分母・全国合算・閾値・マスク・年齢標準化との区別・色使い分け） */}
              <div style={{fontSize:10,color:'#94a3b8',marginTop:6,fontStyle:'italic',lineHeight:1.6}}>
                ※{binsData?.denominatorNote || '分母=特定健診受診者(40-74歳)。住民全体ではない。比較は同性×同年齢帯同士に限る。'}<br/>
                ※{binsData?.nationalNote || '全国は47都道府県のcountをサーバ側で合算(擬似県「都道府県判別不可」を除外)。公式全国集計とは微差の可能性。'}<br/>
                ※閾値（BMI25等）は集団把握のための臨床カットオフであり、個人の診断基準ではありません。<br/>
                ※斜線ハッチのビン=集計値なし（NDBの10未満マスクによる非公開の可能性）。値ゼロとは断定しません。<br/>
                ※本図は<b>粗分布</b>です。Bカードの<span style={{color:'#7c3aed',fontWeight:500}}>年齢標準化率</span>は本図には適用していません（年齢帯セグメントで同年齢帯比較が可能）。<br/>
                ※色の使い分け: Bカード内47県ストリップ=中立色（県間の位置）、本図の赤系網掛け=臨床閾値超え（高=リスク方向が臨床的に確立した指標のため）。
              </div>
            </div>;
          })()}
        </div>
      </div>;
    })()}
  </div>}

  {/* ═══ Layer 2.5: DEMAND-SIDE (受療率 — 患者調査) ═══ */}
  {patientSurvey?.prefectures?.[ndbPref] && (()=>{
    const ps = patientSurvey.prefectures[ndbPref];
    const nat = patientSurvey.prefectures['全国'];
    if (!ps?.categories || !nat?.categories) return null;
    const metricKey = psMode; // 'inpatient' | 'outpatient'
    const totalLabel = psMode === 'inpatient' ? '入院' : '外来';
    const myTotal = ps.total?.[metricKey];
    const natTotal = nat.total?.[metricKey];
    // rank1: 受療率の47県分布（「全国」「都道府県判別不可」を除外）
    const psPrefs47 = Object.entries(patientSurvey.prefectures).filter(([p])=>isP47(p));
    const stripValsPS = (k) => psPrefs47.map(([p,v])=>({pref:p, value:v.categories?.[k]?.[metricKey]})).filter(d=>d.value!=null && d.value>0);
    // rank4: 対全国比%の47県分布（x=全国比・基準線100%）— PrefStrip47のドット文法を再利用
    const ratioStripPS = (k) => psPrefs47.map(([p,v])=>{
      const pv = v.categories?.[k]?.[metricKey], nv = nat.categories?.[k]?.[metricKey];
      return (pv != null && nv) ? { pref: p, value: pv/nv*100 } : null;
    }).filter(Boolean);
    // rank4: 入院受療率が小さい章（≲10/10万）は標本誤差で比率が不安定 → ⚠で乖離%抑制
    const SMALL_RATE = 10;
    // ◆差分モード: ピン比較県（props内で完結・API追加不要）。章key→{val,ratio}
    const pinnedPs = (pinnedPref && pinnedPref !== ndbPref) ? patientSurvey.prefectures[pinnedPref] : null;
    const pinnedRowOf = (k) => {
      if (!pinnedPs?.categories) return null;
      const pv = pinnedPs.categories[k]?.[metricKey], nv = nat.categories[k]?.[metricKey];
      return { val: pv, ratio: (pv != null && nv) ? pv / nv * 100 : null };
    };
    // rank4: 21章フォレスト（Top7スライスを廃し全章露出）
    const forestAll = Object.entries(ps.categories).map(([k, v], idx) => {
      const val = v[metricKey], natVal = nat.categories[k]?.[metricKey];
      const ratio = (val != null && natVal) ? val/natVal*100 : null;
      return { key: k, name: v.name, chapter: v.chapter, val, natVal, ratio, idx };
    }).filter(x => x.val != null);
    const forestItems = [...forestAll].sort((a,b)=>{
      if (psSort === 'chapter') return a.idx - b.idx;
      if (psSort === 'abs') return (b.val||0) - (a.val||0);
      if (psSort === 'pindiff' && pinnedPs) {
        // 対◆差順: |自県乖離−◆県乖離| 降順。⚠章（自県・◆県いずれかが当metricで小受療率）は後方送り
        const dd = (x) => {
          const pr = pinnedRowOf(x.key);
          const okSelf = x.ratio != null && x.val >= SMALL_RATE;
          const okPin = pr != null && pr.ratio != null && pr.val != null && pr.val >= SMALL_RATE;
          if (!okSelf || !okPin) return -1;
          return Math.abs((x.ratio - 100) - (pr.ratio - 100));
        };
        return dd(b) - dd(a);
      }
      // 乖離順: |対全国比−100| 降順（小受療率章は乖離が不安定なため後方へ）
      const da = (a.ratio != null && a.val >= SMALL_RATE) ? Math.abs(a.ratio - 100) : -1;
      const db = (b.ratio != null && b.val >= SMALL_RATE) ? Math.abs(b.ratio - 100) : -1;
      return db - da;
    });
    const maxForestVal = Math.max(1, ...forestAll.map(x=>x.val||0));
    // ── 指紋ヘッドライン: 母集団= val>=SMALL_RATE かつ ratio非null（⚠章は絶対に昇格させない） ──
    const fpEligible = forestAll.filter(x => x.ratio != null && x.val >= SMALL_RATE);
    const fpHighs = fpEligible.filter(x => x.ratio - 100 >= 5).sort((a,b) => b.ratio - a.ratio);
    const fpLows = fpEligible.filter(x => x.ratio - 100 <= -5).sort((a,b) => a.ratio - b.ratio);
    const fpTopHighs = fpHighs.slice(0, 3);
    const fpTopLows = fpLows.slice(0, 2);
    const fpStdCount = fpEligible.length - fpHighs.length - fpLows.length;
    const fpRestDiv = (fpHighs.length - fpTopHighs.length) + (fpLows.length - fpTopLows.length); // チップ非表示の乖離章（チェリーピッキング回避の全数明示）
    const fpChipEl = (x) => {
      const t = tierOf(x.ratio - 100);
      return <button key={x.key} onClick={() => psJumpToRow(x.key)}
        title={`${x.name} 対全国比${x.ratio.toFixed(0)}% — クリックで該当行へ`}
        style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:12,
          border:`1px solid ${t.color}55`,background:`${t.color}14`,color:t.color,
          fontSize:mob?10:11,fontWeight:700,cursor:'pointer',maxWidth:mob?140:190}}>
        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{x.name}</span>
        <span style={{fontVariantNumeric:'tabular-nums',flexShrink:0}}>{x.ratio-100>0?'+':''}{(x.ratio-100).toFixed(0)}%</span>
      </button>;
    };
    // ── 虹彩(PsIris)データ: forestAll を章番号順(idx順)のまま供給 ──
    const irisItems = forestAll.map(x => ({ key: x.key, rom: x.chapter, name: x.name, ratio: x.ratio, small: x.val < SMALL_RATE }));
    const pinnedIrisRatios = pinnedPs?.categories ? forestAll.map(x => pinnedRowOf(x.key)?.ratio ?? null) : null;
    const irisFaded = activeDomain ? new Set(forestAll.filter(x => !dMatch('patientSurveyKey', x.key)).map(x => x.key)) : null;
    const chipW = mob ? 36 : 88; // ことばチップ幅（48→88、傷病名 w150→142 で吸収）
    const pinChipW = mob ? 34 : 58; // ◆差分チップ幅（ピン比較時のみ出現・mobは縦2段積み）
    // rank4 旧Top7（折りたたみ温存）
    const items = [...forestAll].filter(x=>x.val>0).sort((a,b)=>b.val-a.val).slice(0,7);
    const maxVal = items[0]?.val || 1;
    // rank4: 将来傾き — 患者調査の章(chapter ローマ数字)を demand projection の章キーに突合
    const PROJ_YEARS = [2020,2025,2030,2035,2040,2045,2050];
    const projMap = demandProj ? (metricKey === 'inpatient' ? demandProj.inpatient : demandProj.outpatient) : null;
    const demandSeriesFor = (chapterRoman) => {
      if (!projMap) return null;
      const kk = Object.keys(projMap).find(key => key.startsWith(chapterRoman + ' '));
      return kk ? projMap[kk] : null;
    };
    // 将来傾きチップ（実測=塗り(基準年)/推計=白抜き・受療率法・参考推計）
    const renderSlope = (chapterRoman) => {
      const s = demandSeriesFor(chapterRoman);
      if (!s) return <span style={{fontSize:9,color:'#cbd5e1',width:mob?54:100,textAlign:'right',flexShrink:0}}>{demandProj ? '—' : '…'}</span>;
      const v25 = s['2025'], v50 = s['2050'];
      if (!v25) return <span style={{fontSize:9,color:'#cbd5e1',width:mob?54:100,textAlign:'right',flexShrink:0}}>—</span>;
      const slope = (v50/v25 - 1) * 100;
      const dir = slope > 2 ? '↗' : slope < -2 ? '↘' : '→';
      const col = slope > 2 ? '#b45309' : slope < -2 ? '#0e7490' : '#64748b';
      const vals = PROJ_YEARS.map(y=>s[String(y)]).filter(v=>v!=null);
      const mn = Math.min(...vals), mx = Math.max(...vals);
      const W = 46, H = 14, padS = 2;
      const xo = (i) => padS + i/(PROJ_YEARS.length-1)*(W-2*padS);
      const yo = (v) => mx===mn ? H/2 : padS + (1-(v-mn)/(mx-mn))*(H-2*padS);
      const pts = PROJ_YEARS.map((y,i)=>({ x: xo(i), y: yo(s[String(y)]), i }));
      const path = pts.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+' '+p.y.toFixed(1)).join(' ');
      return (
        <span title={`受療率法推計 ${v25}→${v50}（2025→2050・1日平均患者数・参考推計）`}
          style={{display:'inline-flex',alignItems:'center',gap:4,flexShrink:0,width:mob?54:100,justifyContent:'flex-end'}}>
          {!mob && <svg width={W} height={H} style={{flexShrink:0}}>
            <path d={path} fill="none" stroke={col} strokeWidth={1} opacity={0.55}/>
            {pts.map(p=><circle key={p.i} cx={p.x} cy={p.y} r={1.6} fill={p.i===0?col:'#fff'} stroke={col} strokeWidth={0.8}/>)}
          </svg>}
          <span style={{fontSize:10,fontWeight:700,color:col,fontVariantNumeric:'tabular-nums'}}>{dir}{slope>0?'+':''}{slope.toFixed(0)}%</span>
        </span>
      );
    };
    return (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        <span style={{fontSize:18}}>📈</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>
            受療率フィンガープリント — {totalLabel}
            <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fce7f3',color:'#9f1239',fontWeight:500}}>需要・標本推計</span>
            {pinnedPs && (
              <span title="他セクションで立てた◆ピンによる比較モードです（解除は上部の◆ピンから）"
                style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fff7ed',color:'#c2410c',border:'1px solid #fdba74',fontWeight:600}}>
                ◆ {pinnedPref}と比較中
              </span>
            )}
          </div>
          <div style={{fontSize:11,color:'#94a3b8'}}>厚労省 令和5年患者調査(2023) 第39表 — 全21傷病大分類 × 対全国比（患者住所地ベース）</div>
          <div style={{fontSize:10,color:'#b45309',marginTop:2}}>※乖離は受療行動・供給・疾病構造の複合であり単一要因の証明ではない。</div>
          {activeDomain && dm && !dm.demand && (
            <div style={{fontSize:10,color:'#b45309',marginTop:4,padding:'5px 8px',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:5,lineHeight:1.5}}>
              ⚠ <b>{dm.label}</b> の受療率（疾病負荷）断面は<b>未整備</b>です{dm.demandNote?`: ${dm.demandNote}`:''}。この縦串では該当章がありません（下の全章は退色表示）。
            </div>
          )}
        </div>
        {/* 入院/外来 トグル */}
        <div style={{display:'flex',gap:0,border:'1px solid #e2e8f0',borderRadius:6,overflow:'hidden'}}>
          {[['outpatient','外来'],['inpatient','入院']].map(([k,l])=>(
            <button key={k} onClick={()=>setPsMode(k)}
              style={{padding:'5px 12px',border:'none',background:psMode===k?'#9f1239':'#fff',color:psMode===k?'#fff':'#475569',fontSize:11,fontWeight:600,cursor:'pointer'}}>{l}</button>
          ))}
        </div>
      </div>
      {/* 指紋ヘッドライン — 乖離上位3高(rose)+2低(indigo)チップ+全数明示（psMode切替で内容更新） */}
      <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',fontSize:mob?13:15,fontWeight:700,color:'#1e293b',margin:'0 0 12px'}}>
        <span style={{flexShrink:0}}>{ndbPref}の指紋 —</span>
        {fpTopHighs.length === 0 && fpTopLows.length === 0
          ? <span style={{color:'#64748b'}}>際立つ乖離のない全国平均型の指紋</span>
          : <>
              {fpTopHighs.map(fpChipEl)}
              {fpTopLows.map(fpChipEl)}
              <span style={{fontSize:mob?10:11,fontWeight:600,color:'#94a3b8'}}>
                {fpRestDiv > 0
                  ? `/ ほか乖離${fpRestDiv}章・標準域(±5%以内)は${fpStdCount}章`
                  : `/ 残る${fpStdCount}章は標準域(±5%以内)`}
              </span>
            </>}
      </div>
      {/* 県全体総数 */}
      {myTotal != null && natTotal != null && (
        <div style={{display:'flex',gap:16,marginBottom:14,padding:'10px 14px',background:'#fef3f5',borderRadius:8}}>
          <div>
            <div style={{fontSize:10,color:'#9f1239'}}>{ndbPref} {totalLabel}総数</div>
            <div style={{fontSize:mob?16:20,fontWeight:700,color:'#9f1239'}}>{myTotal}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:'#94a3b8'}}>全国 {totalLabel}総数</div>
            <div style={{fontSize:mob?16:20,fontWeight:700,color:'#64748b'}}>{natTotal}</div>
          </div>
          <div>
            <div style={{fontSize:10,color:'#94a3b8'}}>全国比</div>
            <div style={{fontSize:mob?16:20,fontWeight:700,color:tierOf((myTotal/natTotal-1)*100).color,fontVariantNumeric:'tabular-nums'}}>
              <CountUpNum value={(myTotal/natTotal-1)*100} decimals={1} signed suffix="%" />
            </div>
          </div>
        </div>
      )}
      {/* ヒーロー2カラム: 左=虹彩(像で掴む) / 右=21行フォレスト(リストで検証) — mobは虹彩上の縦積み */}
      <div style={{display:'flex',flexDirection:mob?'column':'row',gap:mob?12:20,alignItems:mob?'stretch':'flex-start'}}>
      <div style={{flexShrink:0,width:mob?'100%':320,maxWidth:mob?300:320,margin:mob?'0 auto':undefined}}>
        <PsIris
          items={irisItems}
          prefName={ndbPref}
          modeLabel={totalLabel}
          pinnedRatios={pinnedIrisRatios}
          pinnedName={pinnedPref}
          fadedKeys={irisFaded}
          onHoverChapter={setHoverPSKey}
          onSelectChapter={(key)=>{ const opening = psExpanded !== key; setPsExpanded(opening ? key : null); if (opening) psJumpToRow(key); }}
          hoveredKey={hoverPSKey}
          yearBadge={yb('patientSurvey')}
          mob={mob}
        />
      </div>
      <div style={{flex:1,minWidth:0}}>
      {/* rank4: ソート + 将来傾き凡例（参考推計バッジ常設） */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
        <span style={{fontSize:10,color:'#94a3b8',fontWeight:600}}>並び替え</span>
        <div style={{display:'flex',gap:0,border:'1px solid #e2e8f0',borderRadius:6,overflow:'hidden'}}>
          {[['divergence','乖離順'],['abs','絶対値順'],['chapter','章番号順'],...(pinnedPs?[['pindiff','対◆差順']]:[])].map(([k,l])=>(
            <button key={k} onClick={()=>{ setPsSort(k); setPsExpanded(null); /* ソート切替時は展開を閉じる(FLIP文法) */ }}
              title={k==='pindiff'?`|${ndbPref}の乖離−◆${pinnedPref}の乖離| が大きい章の順（⚠章は後方）`:undefined}
              style={{padding:'4px 10px',border:'none',
                background:psSort===k?(k==='pindiff'?'#c2410c':'#9f1239'):'#fff',
                color:psSort===k?'#fff':(k==='pindiff'?'#c2410c':'#475569'),fontSize:11,fontWeight:600,cursor:'pointer'}}>{l}</button>
          ))}
        </div>
        <span style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:5,fontSize:9,padding:'2px 7px',borderRadius:4,background:'#fffbeb',color:'#b45309',border:'1px solid #fde68a',fontWeight:600}}>
          <svg width={16} height={10}><circle cx={3} cy={5} r={1.8} fill="#b45309"/><circle cx={9} cy={5} r={1.8} fill="#fff" stroke="#b45309" strokeWidth={0.8}/><circle cx={13} cy={5} r={1.8} fill="#fff" stroke="#b45309" strokeWidth={0.8}/></svg>
          →2050傾き: 参考推計(受療率法)
        </span>
      </div>
      {/* 読み方キャプション（常設1行・フッタ注記の重複はフッタ側を整理済） */}
      <div style={{fontSize:10,color:'#94a3b8',margin:'0 0 6px',lineHeight:1.5}}>
        読み方: 虹彩の花弁=各章の対全国比（外=高い・内=低い・網掛け=⚠標本誤差）／行の点=47都道府県・青破線=全国100%・●={ndbPref}／右のことばチップ=全国との差・→2050は参考推計
      </div>
      {/* 共有log2軸ヘッダ: 全行 domain=[40,250]・natAvg=100破線が同一xに縦整列（背骨）。mobは幅不足でラベル重なるため非表示 */}
      {!mob && <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:1}}>
        <span style={{width:28,flexShrink:0}}/>
        <span style={{width:142,flexShrink:0,fontSize:8,color:'#cbd5e1',textAlign:'right',overflow:'hidden',whiteSpace:'nowrap'}}>対全国比(共有log2軸)</span>
        <div style={{flex:1,minWidth:120,display:'flex',alignItems:'center',gap:6}}>
          <span aria-hidden="true" style={{visibility:'hidden',fontSize:8,fontWeight:700,padding:'0 4px',border:'1px solid transparent',borderRadius:4,lineHeight:1.4,flexShrink:0}}>{yb('patientSurvey').label}</span>
          <div style={{flex:1,minWidth:40,position:'relative',height:11,fontSize:8,color:'#94a3b8'}}>
            <div style={{position:'absolute',left:6,right:6,top:0,bottom:0}}>
              <span style={{position:'absolute',left:'12.2%',transform:'translateX(-50%)'}}>×0.5</span>
              <span style={{position:'absolute',left:'50%',transform:'translateX(-50%)',color:'#2563EB',fontWeight:600}}>100%</span>
              <span style={{position:'absolute',left:'87.8%',transform:'translateX(-50%)'}}>×2</span>
            </div>
          </div>
        </div>
        <span style={{width:chipW,flexShrink:0}}/>
        {pinnedPs && <span style={{width:pinChipW,flexShrink:0,fontSize:8,color:'#fdba74',textAlign:'right'}}>◆{pinnedPref}</span>}
        <span style={{width:100,flexShrink:0}}/>
      </div>}
      {/* rank4: 21章フォレスト — x=対全国比%（共有log2軸・基準線100%）・各行にPrefStrip47ドット文法 */}
      <div style={{display:'flex',flexDirection:'column',gap:2}}>
        {forestItems.map(it => {
          const delta = (it.ratio != null) ? (it.ratio - 100) : null;
          const small = it.val < SMALL_RATE; // 小受療率 → 標本誤差で乖離%抑制
          const ratioStrip = ratioStripPS(it.key);
          const expanded = psExpanded === it.key;
          const rowLit = hoverPSKey === it.key; // 虹彩↔行 双方向同期
          return <div key={it.key} ref={el => { psRowRefs.current[it.key] = el; }}
            onMouseEnter={mob ? undefined : () => setHoverPSKey(it.key)}
            onMouseLeave={mob ? undefined : () => setHoverPSKey(prev => prev === it.key ? null : prev)}
            style={{padding:'2px 0',borderRadius:6,
              background: psFlashKey===it.key ? '#fbcfe8' : expanded ? '#fef3f5' : rowLit ? '#f1f5f9' : 'transparent',
              transition:'background 400ms ease',
              ...dFade('patientSurveyKey',it.key),...dBorder('patientSurveyKey',it.key)}}>
            <div style={{display:'flex',alignItems:'center',gap:mob?4:8}}>
              <span style={{width:mob?18:28,fontSize:9,fontWeight:600,color:'#9f1239',flexShrink:0,textAlign:'right'}}>{it.chapter}</span>
              <span onClick={()=>setPsExpanded(expanded?null:it.key)} title={it.name}
                style={{width:mob?78:142,fontSize:mob?10:12,color:rowLit?'#1e293b':'#475569',fontWeight:rowLit?600:400,flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'pointer'}}>
                {expanded?'▾ ':''}{it.name}
              </span>
              <div style={{flex:1,minWidth:mob?60:120}}>
                {ratioStrip.length >= 40
                  ? <PrefStrip47 {...stripCommon} values={ratioStrip} natAvg={100} domain={[40,250]} scale="log2" yearBadge={yb('patientSurvey')} mode="micro" />
                  : <span style={{fontSize:9,color:'#cbd5e1'}}>分布データ不足</span>}
              </div>
              {small
                ? <span title="入院受療率が小さく標本誤差が大きいため乖離%を抑制" style={{fontSize:10,fontWeight:600,color:'#cbd5e1',width:chipW,textAlign:'right',flexShrink:0}}>⚠ {it.val}</span>
                : (delta != null
                    ? (()=>{ const t = tierOf(delta); return (
                        <span title={`対全国比 ${it.ratio.toFixed(0)}%（全国との差 ${delta>0?'+':''}${delta.toFixed(1)}%）`}
                          style={{width:chipW,flexShrink:0,display:'flex',flexDirection:'column',alignItems:'flex-end',justifyContent:'center',lineHeight:1.15}}>
                          <span style={{fontSize:mob?9:10,fontWeight:700,color:t.color}}>{mob?t.short:t.label}</span>
                          {!mob && <span style={{fontSize:9,fontWeight:600,color:'#94a3b8',fontVariantNumeric:'tabular-nums'}}><CountUpNum value={delta} signed suffix="%" /></span>}
                        </span>); })()
                    : <span style={{width:chipW,flexShrink:0}}/>)}
              {/* ◆差分チップ（ピン比較時のみ・枠線付きで推計amberチップと識別・mobは縦2段積み） */}
              {pinnedPs && (()=>{
                const pr = pinnedRowOf(it.key);
                const pinSmall = !pr || pr.val == null || pr.val < SMALL_RATE || pr.ratio == null;
                if (pinSmall) return (
                  <span title={`◆${pinnedPref}: この章は${totalLabel}受療率が小さく標本誤差が大きいため乖離%を抑制`}
                    style={{width:pinChipW,flexShrink:0,fontSize:9,fontWeight:600,color:'#fdba74',textAlign:'right'}}>◆⚠</span>
                );
                const pd = pr.ratio - 100;
                const selfOk = !small && delta != null;
                const fmtD = (v) => `${v>0?'+':''}${v.toFixed(0)}%`;
                return (
                  <span title={`${ndbPref} ${selfOk?fmtD(delta):'⚠抑制'} / ◆${pinnedPref} ${fmtD(pd)}${selfOk?` / 差 ${(delta-pd)>0?'+':''}${(delta-pd).toFixed(0)}pp`:''} — 受療行動・供給・疾病構造の複合差であり優劣ではありません`}
                    style={{width:pinChipW,flexShrink:0,display:'flex',flexDirection:mob?'column':'row',alignItems:mob?'flex-end':'center',justifyContent:'flex-end',gap:mob?0:3,
                      fontSize:9,fontWeight:700,color:'#c2410c',border:'1px solid #fdba74',borderRadius:4,padding:'1px 3px',background:'#fff',lineHeight:1.2,boxSizing:'border-box'}}>
                    <span>◆</span>
                    <span style={{fontVariantNumeric:'tabular-nums'}}><CountUpNum value={pd} signed suffix="%" /></span>
                  </span>
                );
              })()}
              {renderSlope(it.chapter)}
            </div>
            {expanded && <div style={{margin:`4px 0 6px ${mob?24:40}px`,padding:'8px 10px',background:'#fff',borderRadius:6,border:'1px solid #fce7f3'}}>
              <div style={{fontSize:10,color:'#64748b',marginBottom:4}}>
                {it.name} — {ndbPref} {it.val ?? '—'}／全国 {it.natVal ?? '—'}（人口10万対）
                {it.ratio != null && (()=>{ const t = tierOf(it.ratio - 100); return <b style={{marginLeft:6,color:t.color}}>対全国比 {it.ratio.toFixed(0)}%（{t.label}）</b>; })()}
              </div>
              {ratioStrip.length >= 40
                ? <PrefStrip47 {...stripCommon} values={ratioStrip} natAvg={100} yearBadge={yb('patientSurvey')} mode="full" />
                : <span style={{fontSize:10,color:'#94a3b8'}}>47県分布データ不足</span>}
              <div style={{fontSize:9,color:'#94a3b8',marginTop:4}}>
                ドット=各県の対全国比（青破線=100%基準）／将来傾き {renderSlope(it.chapter)} は受療率法による参考推計。
              </div>
              {/* マップエコー: 対全国比の47県コロプレスをその場展開（死因セクションと同一パターン） */}
              {ratioStrip.length >= 40 && (
                <div style={{marginTop:6}}>
                  <button onClick={()=>setPsMapOpen(v=>!v)}
                    style={{padding:'3px 9px',border:'1px solid #fce7f3',background:psMapOpen?'#fef3f5':'#fff',color:'#9f1239',borderRadius:6,fontSize:10,fontWeight:600,cursor:'pointer'}}>
                    {psMapOpen?'▾ 地図を閉じる':'▸ 47県地図で見る'}
                  </button>
                  {psMapOpen && (
                    <div style={{marginTop:6}}>
                      <PrefChoropleth
                        japanMap={japanMap}
                        valueByPref={Object.fromEntries(ratioStrip.map(d=>[d.pref, d.value]))}
                        selected={ndbPref}
                        onSelect={setNdbPref}
                        title={`${it.name}（${totalLabel}）対全国比`}
                        unit="%"
                        yearBadge={yb('patientSurvey')}
                        mob={mob}
                        height={mob?150:180}
                      />
                      <div style={{fontSize:9,color:'#94a3b8',marginTop:5,lineHeight:1.5}}>
                        色階級はこの指標だけの5分位で、指標ごとに独立です。<b>地図どうしで色の濃淡は比較できません</b>。ここに現れる高低は「地域差の観察」であり、原因の特定ではありません。
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>}
          </div>;
        })}
      </div>
      {/* ことばスケール凡例（5スウォッチ・常設） */}
      <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:mob?6:10,fontSize:9,color:'#94a3b8',marginTop:6}}>
        {FP_TIERS.map(t => (
          <span key={t.label} style={{display:'inline-flex',alignItems:'center',gap:3}}>
            <svg width={10} height={10} style={{flexShrink:0}}><rect x={1} y={1} width={8} height={8} rx={2} fill={t.color}/></svg>
            {t.label}
          </span>
        ))}
        <span style={{fontWeight:600}}>※高低は良し悪しではありません</span>
      </div>
      </div>
      </div>
      {/* rank4: 旧Top7表示を折りたたみで温存 */}
      <div style={{marginTop:12}}>
        <button onClick={()=>setPsShowTop7(v=>!v)}
          style={{padding:'4px 10px',border:'1px solid #e2e8f0',background:'#fff',color:'#64748b',borderRadius:6,fontSize:10,fontWeight:600,cursor:'pointer'}}>
          {psShowTop7?'▾ 従来のTop7バー表示を隠す':'▸ 従来のTop7バー表示'}
        </button>
        {psShowTop7 && <div style={{display:'flex',flexDirection:'column',gap:5,marginTop:8}}>
          {items.map(it => {
            const delta = it.natVal != null ? ((it.val/it.natVal - 1) * 100) : null;
            const psStrip = stripValsPS(it.key);
            return <div key={it.key}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:mob?20:30,fontSize:10,fontWeight:600,color:'#9f1239',flexShrink:0}}>{it.chapter}</span>
                <span style={{width:mob?100:160,fontSize:12,color:'#475569',flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{it.name}</span>
                <div style={{flex:1,height:18,background:'#fef3f5',borderRadius:3,overflow:'hidden'}}>
                  <div style={{height:'100%',borderRadius:3,background:'#9f1239',width:`${it.val/maxVal*100}%`,opacity:0.75}}/>
                </div>
                <span style={{fontSize:11,fontWeight:600,color:'#9f1239',fontVariantNumeric:'tabular-nums',width:42,textAlign:'right',flexShrink:0}}>{it.val}</span>
                {delta != null && <span style={{fontSize:10,fontWeight:600,color:tierOf(delta).color,width:48,textAlign:'right',flexShrink:0}}>{delta>0?'+':''}{delta.toFixed(0)}%</span>}
              </div>
              {psStrip.length >= 40 && <div style={{margin:`2px 0 4px ${mob?28:38}px`}}><PrefStrip47 {...stripCommon} values={psStrip} yearBadge={yb('patientSurvey')} mode="inline" /></div>}
            </div>;
          })}
        </div>}
      </div>
      <div style={{fontSize:10,color:'#94a3b8',marginTop:10,lineHeight:1.6}}>
        ※受療率は「人口10万対」で標準化済み。<b>NDB（供給）とは異なり、患者住所地ベースの標本推計</b>です。
        標本誤差を含むため地域差の細かな比較には注意。3年ごとの調査で、次回は令和8年調査が見込まれる。<br/>
        ※<b style={{color:'#b45309'}}>→2050傾き</b>は受療率法（demand_projection）による1日平均患者数の2025→2050変化率。受療率を固定し人口変動のみを反映した<b>参考推計</b>（塗り=基準年・白抜き=推計）。
      </div>
    </div>);
  })()}

  {/* ═══ Layer 3: DEMAND (医療利用) ═══ */}
  {diagByPref.length > 0 && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16,...sectionFade}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>🏥</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>医療利用 <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#cffafe',color:'#155e75',fontWeight:500}}>医療利用量</span>{activeDomain && <span style={{marginLeft:6,fontSize:9,color:'#94a3b8',fontWeight:500}}>（診療行為カテゴリ・疾患縦串の対象外）</span>}</div>
        <div style={{fontSize:11,color:'#94a3b8'}}>医科診療行為 算定回数（令和5年度レセプト）</div>
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(3,1fr)',gap:10}}>
      {diagByPref.sort((a,b)=>b.total_claims-a.total_claims).map((d)=>{
        // rank1: 人口10万対の47県分布（判別不可除外・prefMaps.diag は既に人口正規化済）
        const diagStrip = Object.entries(prefMaps.diag).filter(([p])=>isP47(p))
          .map(([p,m])=>({pref:p, value:m[d.category]})).filter(x=>x.value!=null);
        // 人間換算: per100k(=diag) ÷ DIAG_UNIT.div。全国値は diagNat（人口加重・isP47・
        // 47県単純平均でない — strip natAvg ズレ修正を含む）
        const per100k = prefMaps.diag[ndbPref]?.[d.category] ?? null;
        const nat100k = prefMaps.diagNat?.[d.category] ?? null;
        const u = DIAG_UNIT[d.category] || { div: 100000, denom: '県民1人あたり・年', unit: '回/人・年', dec: 1 };
        const disp = per100k != null ? per100k / u.div : null;
        const dispNat = (nat100k != null && nat100k > 0) ? nat100k / u.div : null;
        const pin100k = (pinnedPref && pinnedPref !== ndbPref) ? (prefMaps.diag[pinnedPref]?.[d.category] ?? null) : null;
        const dispPin = pin100k != null ? pin100k / u.div : null;
        const ratioPct = (per100k != null && nat100k > 0) ? (per100k / nat100k - 1) * 100 : null;
        const t = ratioPct != null ? tierOf(ratioPct) : null;
        const rank = per100k != null ? 1 + diagStrip.filter((x) => x.value > per100k).length : null;
        // 生活感覚リフレーム（人間換算の参考表現・実値はジャンボ数字とツールチップが正）
        const reframe = disp == null ? null
          : d.category === 'A_初再診料' ? `≒ 月${(disp / 12).toFixed(1)}回の外来受診`
          : d.category === 'B_医学管理等' ? (disp > 0 ? `≒ ${(52 / disp).toFixed(1)}週間に1回` : null)
          : d.category === 'C_在宅医療' ? `≒ 県内で1日${fmt(Math.round(d.total_claims / 365))}件` : null;
        return (
        <div key={d.category} style={{background:'#f0f7ff',borderRadius:10,padding:'12px 16px'}}>
          {/* ラベル行 + tierことばチップ + 全国比%（rose/indigo中立発散 — 高低は良し悪しでない） */}
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
            <span style={{fontSize:11,color:'#64748b'}}>{CAT_LABELS[d.category]||d.category}</span>
            {t && <span title={`全国比${ratioPct>0?'+':''}${ratioPct.toFixed(1)}%＝${t.label}（±5/±15%のことばスケール）。高低は良し悪しではありません`}
              style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:4,flexShrink:0}}>
              <span style={{fontSize:9,fontWeight:700,color:t.color,padding:'1px 5px',borderRadius:4,background:t.color+'14',border:`1px solid ${t.color}33`}}>{t.label}</span>
              <span style={{fontSize:9,fontWeight:600,color:'#94a3b8',fontVariantNumeric:'tabular-nums'}}><CountUpNum value={ratioPct} decimals={1} signed suffix="%" /></span>
            </span>}
          </div>
          {/* ジャンボ数字（人間換算・色に価値判断を語らせない#1e293b） */}
          {disp != null && <div style={{display:'flex',alignItems:'baseline',gap:5,flexWrap:'wrap'}}>
            <span style={{fontSize:mob?26:32,fontWeight:800,color:'#1e293b',fontVariantNumeric:'tabular-nums',lineHeight:1.1}}>
              <CountUpNum value={disp} decimals={u.dec} />
            </span>
            <span style={{fontSize:12,fontWeight:700,color:'#475569'}}>回</span>
            <span style={{fontSize:10,color:'#94a3b8'}}>{u.denom}</span>
          </div>}
          {reframe && <div style={{fontSize:10,color:'#64748b',marginTop:1}}>{reframe}</div>}
          {/* ユニットドット・レーン（充填はジャンボ数字と同一アニメ値で同期） */}
          {disp != null && dispNat != null && <div style={{marginTop:6}}>
            <UnitDotLane value={disp} natValue={dispNat} pinnedValue={dispPin}
              natLabel={`全国 ${dispNat.toFixed(1)}`} mob={mob} prefName={ndbPref}
              pinnedName={pinnedPref} rank={rank} unitLabel={u.unit} />
          </div>}
          {/* 従来値（生値残置 — 換算値の独り歩き防止・10px二次情報） */}
          <div style={{fontSize:10,color:'#94a3b8',marginTop:6}}>総算定 {fmt(d.total_claims)}回 ・ 人口10万対 {perCap(d.total_claims)}</div>
          {diagStrip.length >= 40 && <div style={{marginTop:6}}><PrefStrip47 {...stripCommon} values={diagStrip} natAvg={nat100k} yearBadge={yb('ndbDiag')} mode="inline" /></div>}
        </div>
        );
      })}
    </div>
    <div style={{fontSize:9,color:'#94a3b8',marginTop:10,lineHeight:1.7}}>
      ※ NDBは<b>医療機関所在地ベースの供給側集計</b>です。人口10万対・人間換算は住民人口（住基2025-01-01）で除した<b>参考値</b>で、受診流出入・審査集計仕様の影響を含みます（分子=令和5年度レセプト・分母人口の年次は一致しません）。
      換算の分母はカテゴリで異なります（外来受診・慢性疾患管理=<b>県民1人あたり</b>／在宅医療=<b>県民10人あたり</b>）。<b>高低は良し悪しではありません</b>。
      ドット1個=1回（端数は部分塗り・実値はツールチップ）: <span style={{color:'#64748b'}}>●基準部（県と全国の重なり）</span>・<span style={{color:'#9f1239'}}>●全国超過</span>・<span style={{color:'#4338ca'}}>◯全国比不足（輪郭）</span>・<span style={{color:'#2563EB'}}>▽全国基準</span>。
    </div>
  </div>}

  {/* ═══ Layer 4: TREATMENT (治療パターン — 処方個性ダイアグラム) ═══
       ★単位非統一問題の解決: 絶対数量の棒比較を廃し、同一薬効分類内の
       県vs全国の人口当たり数量比（単位は分子分母で相殺）を中央スパイン発散
       ロリポップ（受療率フォレストと同一の共有log2軸 domain[40,250]%）で描く。 */}
  {ndbRx.length > 0 && (()=>{
    const rs = rxShared;
    const badge = yb('ndbRx');
    const reduced = prefersReducedMotion();
    const chipW = mob ? 48 : 88;
    const labelW = mob ? 72 : 100;
    // 共有log2軸写像（受療率フォレストの domain=[40,250] と同一文法・100%=ちょうど中央）
    const LOG_MIN = Math.log2(40), LOG_MAX = Math.log2(250);
    const xPos = (pct) => Math.max(0, Math.min(1, (Math.log2(Math.max(1e-9, pct)) - LOG_MIN) / (LOG_MAX - LOG_MIN))) * 100;
    // 領域行データ（domainAgg=構成分類qty/natQty各合算の比=全国数量加重）
    const rows = [];
    if (rs) {
      // 領域順トグル用の全国数量（安定順・県非依存）
      const domainNatQty = {};
      Object.entries(rs.natTotals).forEach(([name, q]) => { const d = DRUG_DOMAIN[name]; if (d) domainNatQty[d] = (domainNatQty[d] || 0) + q; });
      Object.keys(rs.domainAgg).forEach(dom => {
        const v = rs.domainAgg[dom][ndbPref];
        if (v == null || !isFinite(v)) return;
        const pinV = (pinnedPref && pinnedPref !== ndbPref) ? rs.domainAgg[dom][pinnedPref] : null;
        const classes = Object.keys(rs.natTotals).filter(n => DRUG_DOMAIN[n] === dom)
          .map(n => ({ name: n, ratio: rs.classRatio(ndbPref, n) }))
          .filter(c => c.ratio != null)
          .sort((a, b) => Math.abs(Math.log2(b.ratio)) - Math.abs(Math.log2(a.ratio)));
        rows.push({ dom, pct: v * 100, pinPct: (pinV != null && isFinite(pinV)) ? pinV * 100 : null,
          classes, natQty: domainNatQty[dom] || 0, prefQty: rxDomains[dom] || 0,
          color: DOMAIN_COLORS[dom] || '#64748b' });
      });
      if (rxSort === 'divergence') rows.sort((a, b) => Math.abs(Math.log2(b.pct / 100)) - Math.abs(Math.log2(a.pct / 100)));
      else rows.sort((a, b) => b.natQty - a.natQty);
    }
    // ヘッドライン: 乖離上位領域のことばチップ（±5%閾値・チェリーピッキング回避の全数明示）
    const rxHighs = rows.filter(r => r.pct - 100 >= 5).sort((a, b) => b.pct - a.pct);
    const rxLows = rows.filter(r => r.pct - 100 <= -5).sort((a, b) => a.pct - b.pct);
    const rxTopHighs = rxHighs.slice(0, 3), rxTopLows = rxLows.slice(0, 2);
    const rxStdCount = rows.length - rxHighs.length - rxLows.length;
    const rxRestDiv = (rxHighs.length - rxTopHighs.length) + (rxLows.length - rxTopLows.length);
    const rxChipEl = (r) => {
      const t = tierOf(r.pct - 100);
      return <button key={r.dom} onClick={() => rxJumpToRow(r.dom)}
        title={`${r.dom} 対全国比${r.pct.toFixed(0)}%（人口当たり数量・単位相殺）— クリックで該当行へ`}
        style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:12,
          border:`1px solid ${t.color}55`,background:`${t.color}14`,color:t.color,
          fontSize:mob?10:11,fontWeight:700,cursor:'pointer',maxWidth:mob?130:180}}>
        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.dom}</span>
        <span style={{fontVariantNumeric:'tabular-nums',flexShrink:0}}>{r.pct-100>0?'+':''}{(r.pct-100).toFixed(0)}%</span>
      </button>;
    };
    // ロリポップ・トラック（中央スパイン=全国100%・×0.5/×2破線・域外クランプ◂▸・◆ピン重畳）
    const lolliTrack = (pct, pinPct, color, h, dotR, onTap) => {
      const clampL = pct < 40, clampR = pct > 250;
      const x = xPos(pct);
      const pinX = pinPct != null ? xPos(pinPct) : null;
      const stemL = Math.min(50, x), stemW = Math.abs(x - 50);
      const trans = reduced ? 'none' : 'left 400ms ease, width 400ms ease';
      return (
        <div onClick={onTap} style={{flex:1,position:'relative',height:h,minWidth:mob?90:140,cursor:onTap?'pointer':'default'}}>
          {/* ×0.5 / ×2 目盛破線 */}
          <div style={{position:'absolute',left:'12.2%',top:2,bottom:2,width:0,borderLeft:'1px dashed #e2e8f0'}}/>
          <div style={{position:'absolute',left:'87.8%',top:2,bottom:2,width:0,borderLeft:'1px dashed #e2e8f0'}}/>
          {/* 中央スパイン=全国100%（#2563EB 2px実線+上端△ — PrefStrip47のavg語彙） */}
          <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:2,marginLeft:-1,background:'#2563EB',opacity:0.85}}/>
          <div style={{position:'absolute',left:'50%',top:-1,width:0,height:0,marginLeft:-3.5,borderLeft:'3.5px solid transparent',borderRight:'3.5px solid transparent',borderTop:'4px solid #2563EB'}}/>
          {/* ◆自県⇔ピン県 接続細線 */}
          {pinX != null && <div style={{position:'absolute',top:'50%',height:1,marginTop:-0.5,background:'#f97316',opacity:0.5,
            left:`${Math.min(x,pinX)}%`,width:`${Math.abs(x-pinX)}%`}}/>}
          {/* 茎（スパイン→ドット・領域色30%） */}
          <div style={{position:'absolute',top:'50%',height:3,marginTop:-1.5,borderRadius:2,background:color,opacity:0.3,
            left:`${stemL}%`,width:`${stemW}%`,transition:trans}}/>
          {/* ドット（領域色塗り+白リング） */}
          <div style={{position:'absolute',top:'50%',left:`${x}%`,width:dotR*2,height:dotR*2,
            transform:'translate(-50%,-50%)',borderRadius:'50%',background:color,
            border:'1.5px solid #fff',boxShadow:`0 0 0 1px ${color}66`,transition:trans}}/>
          {/* 域外クランプマーカー（値は捏造しない・実値は右チップ/ツールチップに常時） */}
          {clampL && <span style={{position:'absolute',left:0,top:'50%',transform:'translateY(-50%)',fontSize:9,fontWeight:700,color}}>◂</span>}
          {clampR && <span style={{position:'absolute',right:0,top:'50%',transform:'translateY(-50%)',fontSize:9,fontWeight:700,color}}>▸</span>}
          {/* ◆ピン県（橙中空 — stripのピン語彙） */}
          {pinX != null && <div title={pinnedPref ? `◆${pinnedPref}` : undefined}
            style={{position:'absolute',top:'50%',left:`${pinX}%`,width:8,height:8,
            transform:'translate(-50%,-50%) rotate(45deg)',background:'#fff',
            border:'1.5px solid #f97316',boxShadow:'0 0 0 1px #c2410c33'}}/>}
        </div>
      );
    };
    return <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,flexWrap:'wrap'}}>
      <span style={{fontSize:18}}>💊</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>処方個性ダイアグラム — 疾患領域別
          <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fef3c7',color:'#92400e',fontWeight:500}}>治療代理</span>
          <span style={{marginLeft:6,fontSize:8.5,fontWeight:700,padding:'1px 5px',borderRadius:3,border:`1px solid ${badge.color}`,color:badge.color,background:'#fff'}}>{badge.label}</span>
          {pinnedPref && pinnedPref !== ndbPref && (
            <span title="他セクションで立てた◆ピンによる比較モードです（解除は◆ピンから）"
              style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fff7ed',color:'#c2410c',border:'1px solid #fdba74',fontWeight:600}}>◆ {pinnedPref}と比較中</span>
          )}
        </div>
        <div style={{fontSize:11,color:'#94a3b8'}}>同一薬効分類内の<b>人口当たり数量の対全国比</b>（単位は分子分母で相殺）— 中央=全国100%</div>
      </div>
      {/* ソートトグル（FLIP: 行はtranslateYのみで滑走） */}
      <div style={{display:'flex',gap:0,border:'1px solid #e2e8f0',borderRadius:6,overflow:'hidden',flexShrink:0}}>
        {[['divergence','乖離大順'],['domain','領域順']].map(([k,l])=>(
          <button key={k} onClick={()=>{ setRxSort(k); setRxExpanded(null); /* ソート切替時は展開を閉じる(FLIP文法) */ }}
            style={{padding:'4px 10px',border:'none',background:rxSort===k?'#475569':'#fff',color:rxSort===k?'#fff':'#475569',fontSize:11,fontWeight:600,cursor:'pointer'}}>{l}</button>
        ))}
      </div>
    </div>
    {activeDomain && dm && !DOMAIN_TO_RX_LABEL[activeDomain] && (
      <div style={{fontSize:10,color:'#b45309',marginBottom:8,padding:'5px 8px',background:'#fffbeb',border:'1px solid #fde68a',borderRadius:5,lineHeight:1.5}}>
        ⚠ <b>{dm.label}</b> の医療利用（処方proxy）断面は<b>未整備</b>です{dm.utilizationNote?`: ${dm.utilizationNote}`:''}。この縦串に対応する薬効領域行がありません（全行を退色表示）。
      </div>
    )}
    {!rs && <div style={{fontSize:11,color:'#94a3b8',padding:'14px 0'}}>47都道府県の処方データを取得中…（取得できない場合、対全国比は表示できません）</div>}
    {rs && rows.length > 0 && <>
    {/* ヘッドライン — 乖離上位領域のことばチップ（click→該当行へスクロール+フラッシュ） */}
    <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',fontSize:mob?12:14,fontWeight:700,color:'#1e293b',margin:'0 0 10px'}}>
      <span style={{flexShrink:0}}>{ndbPref}の処方個性 —</span>
      {rxTopHighs.length === 0 && rxTopLows.length === 0
        ? <span style={{color:'#64748b'}}>際立つ乖離のない全国平均型</span>
        : <>
            {rxTopHighs.map(rxChipEl)}
            {rxTopLows.map(rxChipEl)}
            <span style={{fontSize:mob?10:11,fontWeight:600,color:'#94a3b8'}}>
              {rxRestDiv > 0
                ? `/ ほか乖離${rxRestDiv}領域・標準域(±5%以内)は${rxStdCount}領域`
                : `/ 残る${rxStdCount}領域は標準域(±5%以内)`}
            </span>
          </>}
    </div>
    {/* 共有log2軸ヘッダ（×0.5 / 100% / ×2 — 受療率フォレストと同一の背骨） */}
    <div style={{display:'flex',alignItems:'center',gap:mob?6:10,marginBottom:2}}>
      <span style={{width:labelW,flexShrink:0,fontSize:8,color:'#cbd5e1',textAlign:'right',overflow:'hidden',whiteSpace:'nowrap'}}>対全国比(共有log2軸)</span>
      <div style={{flex:1,minWidth:mob?90:140,position:'relative',height:11,fontSize:8,color:'#94a3b8'}}>
        <span style={{position:'absolute',left:'12.2%',transform:'translateX(-50%)'}}>×0.5</span>
        <span style={{position:'absolute',left:'50%',transform:'translateX(-50%)',color:'#2563EB',fontWeight:600}}>100%</span>
        <span style={{position:'absolute',left:'87.8%',transform:'translateX(-50%)'}}>×2</span>
      </div>
      <span style={{width:chipW,flexShrink:0}}/>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:2}}>
      {rows.map(r => {
        const dev = r.pct - 100;
        const t = tierOf(dev);
        const expanded = rxExpanded === r.dom;
        const hovered = rxHoverKey === r.dom;
        return <div key={r.dom} ref={el => { rxRowRefs.current[r.dom] = el; }}
          onMouseEnter={mob ? undefined : () => setRxHoverKey(r.dom)}
          onMouseLeave={mob ? undefined : () => setRxHoverKey(prev => prev === r.dom ? null : prev)}
          style={{padding:'2px 0',borderRadius:6,position:'relative',
            background: rxFlashKey===r.dom ? '#fbcfe8' : expanded ? '#f8fafc' : hovered ? '#f1f5f9' : 'transparent',
            transition:'background 400ms ease', ...rxFade(r.dom)}}>
          <div style={{display:'flex',alignItems:'center',gap:mob?6:10}}>
            <span onClick={()=>setRxExpanded(expanded?null:r.dom)} title={`${r.dom} — クリックで薬効分類別に展開`}
              style={{width:labelW,fontSize:mob?11:12,fontWeight:600,color:r.color,flexShrink:0,cursor:'pointer',
                overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {expanded?'▾ ':''}{r.dom}
            </span>
            {lolliTrack(r.pct, r.pinPct, r.color, 22, 6,
              mob ? (e)=>{ e.stopPropagation(); setRxHoverKey(prev => prev===r.dom?null:r.dom); } : ()=>setRxExpanded(expanded?null:r.dom))}
            {/* tierOfことばチップ+実値%（域外クランプ時も実値を常時表示） */}
            <span title={`対全国比 ${r.pct.toFixed(0)}%（全国との差 ${dev>0?'+':''}${dev.toFixed(1)}%）`}
              style={{width:chipW,flexShrink:0,display:'flex',flexDirection:'column',alignItems:'flex-end',justifyContent:'center',lineHeight:1.15}}>
              <span style={{fontSize:mob?9:10,fontWeight:700,color:t.color}}>{mob?t.short:t.label}</span>
              <span style={{fontSize:9,fontWeight:600,color:'#94a3b8',fontVariantNumeric:'tabular-nums'}}><CountUpNum value={dev} signed suffix="%" /></span>
            </span>
          </div>
          {/* 濃紺ツールチップ（hover / mob 1タップ=情報） */}
          {hovered && (
            <div style={{position:'absolute',left:'50%',top:-4,transform:'translate(-50%,-100%)',zIndex:30,
              background:'#1e293b',color:'#fff',fontSize:10,lineHeight:1.5,padding:'5px 8px',
              borderRadius:4,whiteSpace:'nowrap',pointerEvents:'none',boxShadow:'0 2px 6px rgba(0,0,0,0.18)'}}>
              <div><b>{r.dom}</b> <span style={{color:'#93c5fd',fontWeight:700}}>対全国比 ×{(r.pct/100).toFixed(2)}</span>
                <span style={{color:'#cbd5e1'}}>（{r.pct.toFixed(0)}%・{t.label}・{badge.label}）</span></div>
              <div style={{color:'#cbd5e1'}}>構成{r.classes.length}分類の全国数量加重集約／{ndbPref}生数量 {fmt(r.prefQty)}<span style={{color:'#94a3b8'}}>（単位混在・参考）</span></div>
              {r.pinPct != null && <div style={{color:'#fdba74'}}>◆{pinnedPref} ×{(r.pinPct/100).toFixed(2)}（{r.pinPct.toFixed(0)}%）</div>}
            </div>
          )}
          {/* click=展開: 分類別ロリポップ（同軸・領域色op0.6）+ 領域47県比ストリップ */}
          {expanded && <div style={{margin:`4px 0 6px ${mob?12:24}px`,padding:'8px 10px',background:'#fff',borderRadius:6,border:'1px solid #f1f5f9'}}>
            <div style={{fontSize:10,color:'#64748b',marginBottom:4}}>
              {r.dom} — 構成{r.classes.length}薬効分類（対全国比・乖離大順）。<b>分類展開が一次情報</b>で、領域値は全国数量加重の参考集約です。
            </div>
            {(()=>{ const domStrip = Object.entries(rs.domainAgg[r.dom]).filter(([p])=>isP47(p)).map(([p,v])=>({pref:p,value:v*100}));
              return domStrip.length >= 40 && <div style={{marginBottom:6}}>
                <PrefStrip47 {...stripCommon} values={domStrip} natAvg={100} domain={[40,250]} scale="log2" yearBadge={badge} mode="inline" />
                <div style={{fontSize:9,color:'#94a3b8',marginTop:1}}>領域全体の47県分布（対全国比%・log2軸）</div>
              </div>; })()}
            <div style={{display:'flex',flexDirection:'column',gap:1}}>
              {r.classes.map(c => {
                const cpct = c.ratio * 100, cdev = cpct - 100, ct = tierOf(cdev);
                return <div key={c.name} style={{display:'flex',alignItems:'center',gap:mob?6:10}}
                  title={`${c.name} 対全国比 ×${c.ratio.toFixed(2)}（${cpct.toFixed(0)}%・人口当たり数量・単位相殺）`}>
                  <span style={{width:mob?96:150,fontSize:10,color:'#475569',flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</span>
                  <div style={{flex:1,position:'relative',height:14,minWidth:mob?70:120}}>
                    <div style={{position:'absolute',left:'50%',top:1,bottom:1,width:0,marginLeft:-0.5,borderLeft:'1px solid #2563EB',opacity:0.5}}/>
                    <div style={{position:'absolute',top:'50%',height:2,marginTop:-1,borderRadius:1,background:r.color,opacity:0.25,
                      left:`${Math.min(50,xPos(cpct))}%`,width:`${Math.abs(xPos(cpct)-50)}%`,transition:reduced?'none':'left 400ms ease, width 400ms ease'}}/>
                    <div style={{position:'absolute',top:'50%',left:`${xPos(cpct)}%`,width:8,height:8,transform:'translate(-50%,-50%)',
                      borderRadius:'50%',background:r.color,opacity:0.6,border:'1px solid #fff',transition:reduced?'none':'left 400ms ease'}}/>
                    {cpct < 40 && <span style={{position:'absolute',left:0,top:'50%',transform:'translateY(-50%)',fontSize:8,fontWeight:700,color:r.color}}>◂</span>}
                    {cpct > 250 && <span style={{position:'absolute',right:0,top:'50%',transform:'translateY(-50%)',fontSize:8,fontWeight:700,color:r.color}}>▸</span>}
                  </div>
                  <span style={{width:chipW,flexShrink:0,fontSize:9,fontWeight:700,color:ct.color,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>
                    {mob?ct.short:ct.label} {cdev>0?'+':''}{cdev.toFixed(0)}%
                  </span>
                </div>;
              })}
            </div>
          </div>}
        </div>;
      })}
    </div>
    {/* ことばスケール凡例（5スウォッチ・常設） */}
    <div style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:mob?6:10,fontSize:9,color:'#94a3b8',marginTop:8}}>
      {FP_TIERS.map(tt => (
        <span key={tt.label} style={{display:'inline-flex',alignItems:'center',gap:3}}>
          <svg width={10} height={10} style={{flexShrink:0}}><rect x={1} y={1} width={8} height={8} rx={2} fill={tt.color}/></svg>
          {tt.label}
        </span>
      ))}
      <span style={{fontWeight:600}}>※処方量の高低は良し悪しではありません</span>
    </div>
    </>}
    <div style={{fontSize:10,color:'#94a3b8',marginTop:10,lineHeight:1.6}}>
      ※ 処方数量は薬剤ごとに単位（錠/g/mL）が異なり、<b>絶対量の県間比較はできません</b>。本図は同一薬効分類内の<b>人口当たり数量の対全国比</b>のみを表示します（単位は分子分母で相殺）。
      領域値は構成分類の全国数量加重集約=<b>参考値</b>で、分類展開が一次情報です。疾患領域は薬効分類からの推定です。
      人口分母は住基2025-01-01（令和5年度レセプトと年次は一致しません）。元データに抗うつ剤・副腎皮質ホルモン剤・腎臓ホルモン剤が存在しないため、精神・神経などの領域は不完全です。
    </div>
  </div>;
  })()}

  {/* ═══ Layer 4b: 処方薬 個別Top10 ═══ */}
  {ndbRx.length > 0 && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
      <span style={{fontSize:18}}>📋</span>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>処方薬 薬効分類別 Top10 <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fef3c7',color:'#92400e',fontWeight:500}}>治療代理</span></div>
        <div style={{fontSize:11,color:'#94a3b8'}}>NDB第10回（令和5年度）処方数量上位</div>
      </div>
    </div>
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
        <thead><tr style={{background:'#fafbfc'}}>
          {['#','薬効分類','疾患領域','対全国比','処方数量 (参考・単位非統一)'].map((h,i)=>(
            <th key={i} style={{padding:'8px 10px',fontSize:11,fontWeight:600,color:'#94a3b8',textAlign:i>=4?'right':'left',borderBottom:'1px solid #f1f5f9',whiteSpace:'nowrap'}}>{h}</th>))}
        </tr></thead>
        {/* コピーしてsort: prop配列ndbRxのin-place破壊を回避（手順0(b)） */}
        <tbody>{[...ndbRx].sort((a,b)=>b.qty-a.qty).slice(0,10).map((r,i)=>{
          const domain = DRUG_DOMAIN[r.name]||'';
          const cr = rxShared ? rxShared.classRatio(ndbPref, r.name) : null; // 人口当たり数量の対全国比（単位相殺）
          const ct = cr != null ? tierOf(cr*100-100) : null;
          const rowOpen = rx4bExpanded === r.name;
          return <Fragment key={r.name}>
          <tr onClick={()=>setRx4bExpanded(rowOpen?null:r.name)} style={{borderBottom:rowOpen?'none':'1px solid #f8f9fa',cursor:'pointer',background:rowOpen?'#f8fafc':'transparent',...rxFade(domain)}}>
            <td style={{padding:'7px 10px',color:'#94a3b8',fontSize:11}}>{i+1}</td>
            <td style={{padding:'7px 10px',fontWeight:500}}>{rowOpen?'▾ ':''}{r.name}</td>
            <td style={{padding:'7px 10px'}}>{domain && <span style={{fontSize:10,padding:'2px 8px',borderRadius:10,background:(DOMAIN_COLORS[domain]||'#94a3b8')+'18',color:DOMAIN_COLORS[domain]||'#94a3b8',fontWeight:600}}>{domain}</span>}</td>
            <td style={{padding:'7px 10px',whiteSpace:'nowrap'}}>
              {ct
                ? <span title={`人口当たり数量の対全国比 ×${cr.toFixed(2)}（${(cr*100).toFixed(0)}%・単位は分子分母で相殺）— クリックで47県分布`}
                    style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:12,
                      border:`1px solid ${ct.color}55`,background:`${ct.color}14`,color:ct.color}}>
                    {ct.label}<span style={{fontVariantNumeric:'tabular-nums'}}>{cr*100-100>0?'+':''}{(cr*100-100).toFixed(0)}%</span>
                  </span>
                : <span style={{fontSize:10,color:'#cbd5e1'}}>{rxShared?'—':'…'}</span>}
            </td>
            <td style={{padding:'7px 10px',textAlign:'right',fontWeight:500,color:'#94a3b8',fontVariantNumeric:'tabular-nums'}}>{fmt(r.qty)}</td>
          </tr>
          {/* 行click=当該分類の47県 対全国比ストリップ展開（log2軸・全国100%基準） */}
          {rowOpen && <tr style={{borderBottom:'1px solid #f8f9fa',...rxFade(domain)}}>
            <td colSpan={5} style={{padding:'0 10px 10px'}}>
              {(()=>{ const sv = rxClassStrip(r.name);
                return sv.length >= 40
                  ? <div>
                      <PrefStrip47 {...stripCommon} values={sv} natAvg={100} domain={[40,250]} scale="log2" yearBadge={yb('ndbRx')} mode="inline" />
                      <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{r.name} — 人口当たり数量の対全国比（%）の47県分布。青破線=全国100%。単位は分子分母で相殺。</div>
                    </div>
                  : <span style={{fontSize:10,color:'#94a3b8'}}>47県分布データ{rxShared?'不足':'を取得中…'}</span>; })()}
            </td>
          </tr>}
          </Fragment>;
        })}</tbody>
      </table>
    </div>
    <div style={{fontSize:10,color:'#94a3b8',marginTop:8,lineHeight:1.6}}>
      ※ 処方数量は薬剤ごとに単位（錠/g/mL）が異なるため<b>参考値（単位非統一）</b>です。県間比較は「対全国比」チップ（同一薬効分類内の人口当たり数量比・単位相殺）をご覧ください。行クリックで47県分布を展開します。
    </div>
  </div>}

  {/* ═══ Layer 5: OUTCOME (結果 — 死因構造) ═══ */}
  {causes.length > 0 && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:18}}>📊</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>死因構造 <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fce7f3',color:'#9f1239',fontWeight:500}}>結果</span></div>
          <div style={{fontSize:11,color:'#94a3b8'}}>
            {mortalityMode === 'crude'
              ? '厚労省人口動態統計 2024年確定数（粗死亡率 人口10万対、年齢調整前）'
              : `令和5年度人口動態統計特殊報告 2020年都道府県別年齢調整死亡率（2015年(平成27年)モデル人口、${mortalitySex === 'male' ? '男' : '女'}）`}
          </div>
        </div>
      </div>
      {/* Phase 4-3 R3: 粗 vs 年齢調整 toggle */}
      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:0,background:'#f1f5f9',padding:2,borderRadius:5}}>
          <button
            onClick={() => setMortalityMode('crude')}
            style={{padding:'4px 10px',fontSize:10,fontWeight:600,border:'none',borderRadius:3,cursor:'pointer',background:mortalityMode==='crude'?'#fff':'transparent',color:mortalityMode==='crude'?'#0f172a':'#64748b',boxShadow:mortalityMode==='crude'?'0 1px 2px rgba(0,0,0,0.05)':'none'}}
            title="2024年確定数 全14死因 (年齢調整前)"
          >粗死亡率 2024</button>
          <button
            onClick={() => setMortalityMode('age_adjusted')}
            style={{padding:'4px 10px',fontSize:10,fontWeight:600,border:'none',borderRadius:3,cursor:'pointer',background:mortalityMode==='age_adjusted'?'#fff':'transparent',color:mortalityMode==='age_adjusted'?'#0f172a':'#64748b',boxShadow:mortalityMode==='age_adjusted'?'0 1px 2px rgba(0,0,0,0.05)':'none'}}
            title="2020年 6死因 (2015年(平成27年)モデル人口で年齢調整)"
          >年齢調整 2020</button>
        </div>
        {mortalityMode === 'age_adjusted' && (
          <div style={{display:'flex',gap:0,background:'#f1f5f9',padding:2,borderRadius:5}}>
            <button
              onClick={() => setMortalitySex('male')}
              style={{padding:'4px 10px',fontSize:10,fontWeight:600,border:'none',borderRadius:3,cursor:'pointer',background:mortalitySex==='male'?'#fff':'transparent',color:mortalitySex==='male'?'#1e40af':'#64748b'}}
            >男</button>
            <button
              onClick={() => setMortalitySex('female')}
              style={{padding:'4px 10px',fontSize:10,fontWeight:600,border:'none',borderRadius:3,cursor:'pointer',background:mortalitySex==='female'?'#fff':'transparent',color:mortalitySex==='female'?'#be185d':'#64748b'}}
            >女</button>
          </div>
        )}
      </div>
    </div>
    {/* P1-2: 解釈注意 (死亡率指標の誤読防止) */}
    <InterpretationGuard variant="mortality" compact={true} />
    {/* 百人ワッフル並置 — 粗2024モード専用（構成%の意味が成立する断面のみ）。
        年齢調整2020は6死因のみで全死因合計が無く構成%が定義できないため既存バー行のみ。
        domainレンズは dMatch('vitalCause') を dim フラグで移植（その他=畳込死因のいずれか該当で残す） */}
    {mortalityMode === 'crude' && waffleItems && (
      <DeathWaffle100
        items={waffleItems.map(w => ({ ...w, dim: !!activeDomain && (w.foldedList ? !w.foldedList.some(f => dMatch('vitalCause', f)) : !dMatch('vitalCause', w.cause)) }))}
        prefName={ndbPref}
        totalRatePref={vp?.total_death_rate}
        totalRateNat={vitalStats?.national?.total_death_rate}
        hoverCause={hoverCause}
        onHoverCause={setHoverCause}
        onSelectCause={(cat) => { if (cat !== WAFFLE_OTHER) setSelectedCause(prev => prev === cat ? null : cat); }}
        yearBadge={yb('vitalStats')}
        mob={mob}
      />
    )}
    {mortalityMode === 'age_adjusted' && (
      <div style={{fontSize:10,color:'#64748b',background:'#f8fafc',padding:'6px 10px',borderRadius:4,marginBottom:8,lineHeight:1.5}}>
        年齢調整モードは公式データが6死因のみで<b>全死因合計が無い</b>ため、「100人の内訳」図は粗死亡率2024でのみ表示します。各行に公式順位（47都道府県中・1位=全国最高値）を併記。
      </div>
    )}
    {/* Phase 4-3 R1: 47県 dispersion KPI 凡例 */}
    <div style={{fontSize:10,color:'#64748b',background:'#f8fafc',padding:'6px 10px',borderRadius:4,marginBottom:8,lineHeight:1.5}}
         title="CV (変動係数) = SD/平均×100。47県分布のばらつきを表す相対指標。CV が大きいほど県差が大きい。base rate (絶対値) の影響を受けないため、死因間の県差を公平比較可能。詳細: docs/ANALYSIS_MORTALITY_DISPERSION.md">
      💡 <b>県差度 (CV / max-min 比)</b>: 各バーの右に 47 県 dispersion を併記。CV 大 = 県差大。
      <span style={{color:'#94a3b8',marginLeft:8}}>体感「ガンだけ差が大」は data 上 逆の場合あり (合算で打ち消し効果)</span>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      {displayCauses.map((c,i)=>{
        const maxRate = displayCauses[0]?.rate || 1;
        // Phase 4-3 R1+R3: 47県 dispersion KPI 計算 (mode に応じて source 切替)
        let disp;
        if (mortalityMode === 'crude') {
          const allPref = vitalStats?.prefectures || [];
          disp = dispersionForCause(allPref, c.cause.replace(/\(.+\)/,'').trim());
        } else {
          // 年齢調整 mode: mortalityOutcome2020 から 47 県 dispersion を計算
          const moPrefs = mortalityOutcome2020?.prefectures || {};
          const data = Object.entries(moPrefs).map(([p, d]) => ({pref: p, value: d?.[c.cause]?.age_adjusted?.[mortalitySex]?.rate})).filter(x => x.value != null);
          if (data.length >= 40) {
            const vals = data.map(x => x.value);
            const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
            const variance = vals.reduce((a,b) => a + (b-mean)**2, 0) / (vals.length - 1);
            const sd = Math.sqrt(variance);
            const cv = sd / mean * 100;
            const mn = Math.min(...vals), mx = Math.max(...vals);
            const pmax = data.find(x => x.value === mx).pref;
            const pmin = data.find(x => x.value === mn).pref;
            disp = {n: data.length, mean: Math.round(mean*100)/100, sd: Math.round(sd*100)/100, cv_pct: Math.round(cv*100)/100, min: mn, max: mx, max_min_ratio: Math.round(mx/mn*1000)/1000, pref_max: pmax, pref_min: pmin};
          }
        }
        const dispLabel = classifyDispersion(disp);
        const levelColor = dispLabel?.level === 'high' ? '#dc2626' : dispLabel?.level === 'medium' ? '#d97706' : '#64748b';
        // rank1: 死因の47県分布（mode に応じ source 切替・判別不可除外）
        let causeStrip = [];
        if (mortalityMode === 'crude') {
          causeStrip = (vitalStats?.prefectures||[]).filter(p=>isP47(p.pref))
            .map(p=>({pref:p.pref, value:p.causes?.find(x=>x.cause===c.cause)?.rate})).filter(x=>x.value!=null);
        } else {
          const moPrefs = mortalityOutcome2020?.prefectures || {};
          causeStrip = Object.entries(moPrefs).filter(([p])=>isP47(p))
            .map(([p,d])=>({pref:p, value:d?.[c.cause]?.age_adjusted?.[mortalitySex]?.rate})).filter(x=>x.value!=null);
        }
        // rank5: マップ・エコー — この行が選択中か / 地図展開可否
        const mapEnabled = causeStrip.length >= 40 && !!japanMap?.prefs;
        const isMapOpen = mapEnabled && selectedCause === c.cause;
        const valueByPref = isMapOpen
          ? causeStrip.reduce((m,x)=>{ m[x.pref]=x.value; return m; }, {})
          : null;
        const mapTitle = mortalityMode === 'crude'
          ? `${c.cause.replace(/\(.+\)/,'')}・粗死亡率 2024（年齢調整前）`
          : `${c.cause.replace(/\(.+\)/,'')}・年齢調整死亡率 2020（2015年(平成27年)モデル人口・${mortalitySex==='male'?'男':'女'}）`;
        // 百人ワッフル同期（粗モードのみ）: この行のワッフル・カテゴリ（top7=死因名そのもの / 畳込=その他）
        const wCat = mortalityMode === 'crude' && waffleItems ? (WAFFLE_CAUSE_COLORS[c.cause] ? c.cause : WAFFLE_OTHER) : null;
        const swColor = wCat ? (WAFFLE_CAUSE_COLORS[c.cause] || WAFFLE_OTHER_COLOR) : null;
        const rowHl = wCat != null && hoverCause === wCat;   // 格子側 hover → 行同期ハイライト
        const sharePct = mortalityMode === 'crude' && vp?.total_death_rate ? c.rate / vp.total_death_rate * 100 : null;
        // 年齢調整モード: 公式 rank バッジ（mortality_outcome_2020 — rank は 1位=全国最高値）
        const aaRank = mortalityMode === 'age_adjusted'
          ? mortalityOutcome2020?.prefectures?.[ndbPref]?.[c.cause]?.age_adjusted?.[mortalitySex]?.rank
          : null;
        return <div key={i} style={{...dFade('vitalCause',c.cause),...dBorder('vitalCause',c.cause)}}>
          <div
            onClick={mapEnabled ? (()=>setSelectedCause(prev=>prev===c.cause?null:c.cause)) : undefined}
            onMouseEnter={wCat ? (()=>setHoverCause(wCat)) : undefined}
            onMouseLeave={wCat ? (()=>setHoverCause(null)) : undefined}
            title={mapEnabled ? (isMapOpen?'地図を閉じる':'クリックで 47 県地図を展開') : undefined}
            style={{display:'flex',alignItems:'center',gap:8,cursor:mapEnabled?'pointer':'default',background:isMapOpen?'#faf5ff':(rowHl?'#f1f5f9':'transparent'),borderRadius:4,padding:isMapOpen?'2px 4px':'0',margin:isMapOpen?'0 -4px':'0',transition:'background 200ms ease'}}
          >
            {mapEnabled && <span style={{fontSize:10,color:isMapOpen?'#7c3aed':'#cbd5e1',flexShrink:0,width:10,textAlign:'center'}}>{isMapOpen?'▾':'▸'}</span>}
            {wCat && <span title={wCat===WAFFLE_OTHER?'上のワッフルでは「その他の死因」に統合':'上のワッフル格子と同色対応'} style={{width:8,height:8,borderRadius:wCat===WAFFLE_OTHER?'50%':2,background:swColor,flexShrink:0}}/>}
            <span style={{width:mob?(mapEnabled?80:90):(mapEnabled?110:120),fontSize:12,fontWeight:500,color:'#475569',flexShrink:0}}>{c.cause.replace(/\(.+\)/,'')}</span>
            <div style={{flex:1,height:16,background:'#f1f5f9',borderRadius:3,overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:3,background:i<3?'#7c3aed':'#a78bfa',width:`${c.rate/maxRate*100}%`,opacity:0.85}}/>
            </div>
            <span style={{fontSize:12,fontWeight:600,color:'#7c3aed',fontVariantNumeric:'tabular-nums',width:60,textAlign:'right',flexShrink:0}}>{c.rate}</span>
            {sharePct != null && (
              <span title={`構成% = ${c.rate} ÷ ${vp.total_death_rate}（全死因粗死亡率/10万）— 上のワッフルの人数に対応`}
                    style={{fontSize:9,color:'#94a3b8',fontVariantNumeric:'tabular-nums',width:mob?30:38,textAlign:'right',flexShrink:0}}>
                {sharePct.toFixed(1)}%
              </span>
            )}
            {aaRank != null && (
              <span title={`公式順位（年齢調整死亡率 2020・${mortalitySex==='male'?'男':'女'}）: ${aaRank}位/47。1位=47都道府県で最も高い（全国最高値）・47位=最も低い`}
                    style={{fontSize:9,fontWeight:700,color:'#7c3aed',background:'#f5f3ff',padding:'2px 6px',borderRadius:8,flexShrink:0,cursor:'help'}}>
                {aaRank}位/47
              </span>
            )}
            {dispLabel && (
              <span
                title={dispLabel.label_full}
                style={{fontSize:9,color:levelColor,fontVariantNumeric:'tabular-nums',width:mob?75:100,textAlign:'right',flexShrink:0,cursor:'help',background:dispLabel.level==='high'?'#fef2f2':dispLabel.level==='medium'?'#fffbeb':'#f1f5f9',padding:'2px 5px',borderRadius:3,fontWeight:600}}
              >
                CV {disp.cv_pct.toFixed(1)}% / 比{disp.max_min_ratio?.toFixed(1) || '-'}
              </span>
            )}
          </div>
          {causeStrip.length >= 40 && <div style={{margin:`2px 0 4px ${mob?18:24}px`}}><PrefStrip47 {...stripCommon} values={causeStrip} yearBadge={mortalityMode==='crude'?yb('vitalStats'):yb('mortalityAdj')} mode="inline" /></div>}
          {/* rank5: マップ・エコー — 選択死因の 47 県コロプレスをその場に展開 */}
          {isMapOpen && (
            <div style={{margin:`6px 0 12px ${mob?4:24}px`}}>
              {mortalityMode === 'crude' && (
                <div style={{fontSize:10,color:'#92400e',background:'#fffbeb',borderLeft:'3px solid #f59e0b',borderRadius:3,padding:'6px 10px',marginBottom:6,lineHeight:1.5}}>
                  ⚠ <b>粗死亡率は高齢県ほど高く出ます</b>（年齢調整前）。県間の高低は年齢構成差を多分に含むため、上部の「年齢調整 2020」トグルで補正した分布と見比べてください。構成（100人の内訳）も年齢構成の影響を受けます — 高齢県は老衰・肺炎の割合が大きく出ます。
                </div>
              )}
              <PrefChoropleth
                japanMap={japanMap}
                valueByPref={valueByPref}
                selected={ndbPref}
                onSelect={setNdbPref}
                title={mapTitle}
                unit="/10万"
                yearBadge={mortalityMode==='crude'?yb('vitalStats'):yb('mortalityAdj')}
                mob={mob}
              />
              <div style={{fontSize:9,color:'#94a3b8',marginTop:5,lineHeight:1.5}}>
                色階級は各指標ごとに独立した 5 分位です。<b>地図どうしで色の濃淡は比較できません</b>（死因・調整方式・年度が変われば基準も変わります）。ここに現れる高低は「地域差の観察」であり、原因の特定ではありません。
              </div>
            </div>
          )}
        </div>;
      })}
    </div>
    {/* Phase 4-3 R1: 県差 ranking 概要 */}
    {(() => {
      const allPref = vitalStats?.prefectures || [];
      if (allPref.length < 40) return null;
      const dispersions = causes.slice(0, 8).map(c => {
        const d = dispersionForCause(allPref, c.cause.replace(/\(.+\)/,'').trim());
        return d ? { cause: c.cause.replace(/\(.+\)/,'').trim(), cv: d.cv_pct, ratio: d.max_min_ratio, mean: d.mean } : null;
      }).filter(Boolean);
      if (dispersions.length === 0) return null;
      const sorted = [...dispersions].sort((a,b) => b.cv - a.cv);
      const top = sorted[0], bottom = sorted[sorted.length - 1];
      return (
        <div style={{marginTop:10,padding:'8px 12px',background:'#fffbeb',borderLeft:'3px solid #f59e0b',borderRadius:3,fontSize:11,lineHeight:1.6}}>
          <div style={{fontWeight:700,color:'#78350f',marginBottom:3}}>📐 県差度 ranking (CV 順)</div>
          <div style={{color:'#92400e'}}>
            <b>県差最大</b>: {top.cause} (CV {top.cv.toFixed(1)}%, 比 {top.ratio?.toFixed(1)})
            <span style={{margin:'0 6px',color:'#cbd5e1'}}>vs</span>
            <b>県差最小</b>: {bottom.cause} (CV {bottom.cv.toFixed(1)}%, 比 {bottom.ratio?.toFixed(1)})
          </div>
          <div style={{fontSize:9,color:'#78350f',marginTop:3}}>注: 「県差大 = 重要」「県差小 = 不重要」ではありません。base rate (絶対値) と CV (相対ばらつき) は別の指標です。</div>
        </div>
      );
    })()}
    {/* Phase 4-3 R5: 5 大がん部位別 (75歳未満年齢調整、別 source) */}
    {cancerSites2024 && cancerSites2024.prefectures?.[ndbPref] && (() => {
      const csPref = cancerSites2024.prefectures[ndbPref];
      const csNat = cancerSites2024.national || {};
      const SITE_LABELS = [
        {key:'all', label:'全部位 (5大+他)', sex:'男女計', baseline:true},
        {key:'stomach', label:'胃', sex:'男女計'},
        {key:'colorectal', label:'大腸', sex:'男女計'},
        {key:'liver', label:'肝・肝内胆管', sex:'男女計'},
        {key:'lung', label:'肺・気管', sex:'男女計'},
        {key:'breast', label:'乳房 (女)', sex:'女'},
        {key:'prostate', label:'前立腺 (男)', sex:'男'},
      ];
      // 47 県 dispersion を計算
      const allPrefs = Object.entries(cancerSites2024.prefectures);
      const computeSiteDispersion = (siteKey, sex) => {
        const data = allPrefs.map(([p, d]) => ({pref: p, value: d[siteKey]?.[sex]})).filter(x => x.value != null);
        if (data.length < 40) return null;
        const vals = data.map(x => x.value);
        const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
        const variance = vals.reduce((a,b) => a + (b-mean)**2, 0) / (vals.length - 1);
        const sd = Math.sqrt(variance);
        const cv = sd / mean * 100;
        const mn = Math.min(...vals), mx = Math.max(...vals);
        const pmax = data.find(x => x.value === mx).pref;
        const pmin = data.find(x => x.value === mn).pref;
        return {cv, ratio: mx/mn, mean, max: mx, min: mn, pmax, pmin};
      };
      const rows = SITE_LABELS.map(s => {
        const v = csPref[s.key]?.[s.sex];
        const nat = csNat[s.key]?.[s.sex];
        const disp = computeSiteDispersion(s.key, s.sex);
        return {...s, v, nat, disp};
      }).filter(r => r.v != null);
      if (rows.length === 0) return null;
      const maxV = Math.max(...rows.map(r => r.v));
      return (
        <div style={{marginTop:16,padding:'14px 16px',background:'#fafaf9',borderRadius:8,border:'1px solid #e7e5e4',transition:'opacity 300ms ease',...(activeDomain?(activeDomain==='cancer'?{opacity:1,borderLeft:`3px solid ${DOMAIN_MAPPING.cancer.color}`}:{opacity:0.32}):{})}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <span style={{fontSize:14}}>🎯</span>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:'#1e293b'}}>5 大がん部位別 死亡率 <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fef3c7',color:'#92400e',fontWeight:500}}>R5: 部位別</span></div>
              <div style={{fontSize:10,color:'#94a3b8'}}>国立がん研究センター 2024年 75歳未満年齢調整死亡率 (人口10万対、1985 model 人口)</div>
            </div>
          </div>
          <div style={{fontSize:9,color:'#92400e',background:'#fffbeb',padding:'5px 8px',borderRadius:3,marginBottom:8,lineHeight:1.5}}>
            ⚠ caveat: 本指標は <b>75 歳未満限定</b>。上の死因構造 (全年齢粗死亡率 vital_stats) と直接比較不可。<br/>
            合算で打ち消されている部位別県差を分解して可視化 (詳細: docs/PHASE4_3_CANCER_SITES_ANALYSIS.md)
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            {rows.map((r,i) => {
              const dispLevel = r.disp ? (r.disp.cv >= 20 ? 'high' : r.disp.cv >= 10 ? 'medium' : 'low') : null;
              const lvColor = dispLevel === 'high' ? '#dc2626' : dispLevel === 'medium' ? '#d97706' : '#64748b';
              const lvBg = dispLevel === 'high' ? '#fef2f2' : dispLevel === 'medium' ? '#fffbeb' : '#f1f5f9';
              return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{width:mob?100:130,fontSize:11,color:r.baseline?'#475569':'#0f172a',fontWeight:r.baseline?500:600,flexShrink:0}}>
                    {r.label}
                  </span>
                  <div style={{flex:1,height:14,background:'#f5f5f4',borderRadius:2,overflow:'hidden'}}>
                    <div style={{height:'100%',background:r.baseline?'#a8a29e':'#dc2626',width:`${r.v/maxV*100}%`,opacity:0.85}}/>
                  </div>
                  <span style={{fontSize:11,fontWeight:600,color:'#dc2626',fontVariantNumeric:'tabular-nums',width:50,textAlign:'right',flexShrink:0}}>{r.v}</span>
                  <span style={{fontSize:8,color:'#94a3b8',width:48,textAlign:'right',flexShrink:0}}>全国 {r.nat?.toFixed(1) || '-'}</span>
                  {r.disp && (
                    <span
                      title={`47県分布: 平均 ${r.disp.mean.toFixed(2)}, CV ${r.disp.cv.toFixed(2)}%, max ${r.disp.max} (${r.disp.pmax}), min ${r.disp.min} (${r.disp.pmin}), max-min 比 ${r.disp.ratio.toFixed(2)}`}
                      style={{fontSize:9,color:lvColor,fontVariantNumeric:'tabular-nums',width:mob?68:90,textAlign:'right',flexShrink:0,cursor:'help',background:lvBg,padding:'2px 4px',borderRadius:3,fontWeight:600}}
                    >
                      CV {r.disp.cv.toFixed(1)}% / 比{r.disp.ratio.toFixed(1)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {(() => {
            const siteRows = rows.filter(r => !r.baseline);
            const allBase = rows.find(r => r.baseline);
            if (!allBase?.disp || siteRows.length === 0) return null;
            const maxCv = siteRows.reduce((a,b) => (a.disp?.cv||0) > (b.disp?.cv||0) ? a : b);
            const expansion = maxCv.disp.cv / allBase.disp.cv;
            return (
              <div style={{marginTop:8,padding:'7px 10px',background:'#fef3c7',borderLeft:'3px solid #f59e0b',borderRadius:3,fontSize:10,lineHeight:1.5}}>
                <b style={{color:'#92400e'}}>📊 部位別の発見</b>
                <span style={{color:'#78350f',marginLeft:6}}>
                  全部位 CV {allBase.disp.cv.toFixed(1)}% に対し <b>{maxCv.label} CV {maxCv.disp.cv.toFixed(1)}%</b> = <b>{expansion.toFixed(1)} 倍</b>。
                  合算では打ち消されていた部位別県差が顕在化。
                </span>
              </div>
            );
          })()}
        </div>
      );
    })()}

    {/* rank6: がん部位別 30 年トレンド (1995-2024 ASR75 スモールマルチプル) */}
    {cancerTrend?.allSeries?.[ndbPref] && (() => {
      const years = cancerTrend.years;
      const xN = years.length;
      const nat = cancerTrend.national || {};
      const allS = cancerTrend.allSeries;
      const sexJp = cancerTrendSex === 'male' ? '男' : '女';
      const sexColor = cancerTrendSex === 'male' ? '#1e40af' : '#be185d';
      const SITES = [
        {short:'all', label:'全部位'},
        {short:'stomach', label:'胃'},
        {short:'colorectal', label:'大腸'},
        {short:'liver', label:'肝・肝内胆管'},
        {short:'lung', label:'肺・気管'},
        {short:'breast', label:'乳房', femaleOnly:true},
        {short:'prostate', label:'前立腺', maleOnly:true},
      ].filter(s => (cancerTrendSex === 'male' ? !s.femaleOnly : !s.maleOnly));

      const firstLast = (arr) => {
        if (!arr) return null;
        let f=null,l=null;
        for (let i=0;i<arr.length;i++){ if(arr[i]!=null){ if(f==null) f=arr[i]; l=arr[i]; } }
        if (f==null||l==null||f===0) return null;
        return {first:f,last:l,pct:(l-f)/f*100};
      };
      const linePath = (arr, sx, sy) => {
        if (!arr) return '';
        let d='',started=false;
        for (let i=0;i<arr.length;i++){ const v=arr[i]; if(v==null){started=false;continue;} const X=sx(i),Y=sy(v); d+=(started?'L':'M')+X.toFixed(1)+' '+Y.toFixed(1)+' '; started=true; }
        return d.trim();
      };
      const domainOf = (...arrs) => {
        let lo=Infinity,hi=-Infinity;
        arrs.forEach(a=>{ if(a) a.forEach(v=>{ if(v!=null){ if(v<lo)lo=v; if(v>hi)hi=v; } }); });
        if(lo===Infinity) return null;
        if(lo===hi){lo-=1;hi+=1;}
        const pad=(hi-lo)*0.08; return {lo:lo-pad,hi:hi+pad};
      };

      const contStyle = {marginTop:16,padding:'14px 16px',background:'#fafaf9',borderRadius:8,border:'1px solid #e7e5e4',transition:'opacity 300ms ease',...(activeDomain?(activeDomain==='cancer'?{opacity:1,borderLeft:`3px solid ${DOMAIN_MAPPING.cancer.color}`}:{opacity:0.32}):{})};

      return (
        <div style={contStyle}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
            <span style={{fontSize:14}}>📈</span>
            <div style={{flex:1,minWidth:180}}>
              <div style={{fontSize:12,fontWeight:700,color:'#1e293b'}}>
                がん部位別 30 年トレンド
                <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#e0e7ff',color:'#3730a3',fontWeight:600}}>1995–2024 ASR75</span>
              </div>
              <div style={{fontSize:10,color:'#94a3b8'}}>{cancerTrend.source} ／ {cancerTrend.basis}（{cancerTrend.unit}）</div>
            </div>
            <div style={{display:'inline-flex',background:'#f1f5f9',borderRadius:4,padding:2}}>
              <button onClick={()=>setCancerTrendSex('male')} style={{padding:'4px 10px',fontSize:10,fontWeight:600,border:'none',borderRadius:3,cursor:'pointer',background:cancerTrendSex==='male'?'#fff':'transparent',color:cancerTrendSex==='male'?'#1e40af':'#64748b'}}>男</button>
              <button onClick={()=>setCancerTrendSex('female')} style={{padding:'4px 10px',fontSize:10,fontWeight:600,border:'none',borderRadius:3,cursor:'pointer',background:cancerTrendSex==='female'?'#fff':'transparent',color:cancerTrendSex==='female'?'#be185d':'#64748b'}}>女</button>
            </div>
          </div>
          <div style={{fontSize:9,color:'#92400e',background:'#fffbeb',padding:'5px 8px',borderRadius:3,marginBottom:10,lineHeight:1.5}}>
            ⚠ <b>75 歳未満年齢調整死亡率（1985 年モデル人口）</b> — 高齢者死亡を含まない。上の死因構造（全年齢粗死亡率 2024）とは基準が異なり直接比較不可。<br/>
            検診普及・診断精度・登録精度の変化を含むため <b>医療の質の直接指標ではない</b>。
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {SITES.map(s => {
              const prefArr = allS[ndbPref]?.[s.short]?.[sexJp];
              const natArr = nat[s.short]?.[sexJp];
              if (!prefArr && !natArr) return null;
              const dom = domainOf(prefArr, natArr);
              if (!dom) return null;
              const W=150,H=58,pL=4,pR=6,pT=6,pB=6;
              const pw=W-pL-pR, ph=H-pT-pB;
              const sx=i=> pL + (xN<=1?0:i/(xN-1))*pw;
              const sy=v=> pT + (1-(v-dom.lo)/(dom.hi-dom.lo))*ph;
              const fl = firstLast(prefArr);
              const active = trendSite===s.short;
              const lastIdx = prefArr ? (()=>{ for(let i=prefArr.length-1;i>=0;i--) if(prefArr[i]!=null) return i; return -1; })() : -1;
              return (
                <button key={s.short} onClick={()=>setTrendSite(active?null:s.short)}
                  style={{textAlign:'left',background:'#fff',border:'1px solid '+(active?sexColor:'#e7e5e4'),borderRadius:6,padding:'6px 8px',cursor:'pointer',transition:'border-color 150ms'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:4,marginBottom:2}}>
                    <span style={{fontSize:11,fontWeight:700,color:'#0f172a'}}>{s.label}</span>
                    {fl && <span style={{fontSize:9,fontWeight:700,fontVariantNumeric:'tabular-nums',color:fl.pct<0?'#059669':'#dc2626'}}>{fl.pct<0?'▼':'▲'}{Math.abs(fl.pct).toFixed(0)}%</span>}
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',display:'block'}}>
                    {natArr && <path d={linePath(natArr,sx,sy)} fill="none" stroke="#cbd5e1" strokeWidth={1.4} strokeDasharray="3,2"/>}
                    {prefArr && <path d={linePath(prefArr,sx,sy)} fill="none" stroke={sexColor} strokeWidth={1.8}/>}
                    {lastIdx>=0 && <circle cx={sx(lastIdx)} cy={sy(prefArr[lastIdx])} r={2.2} fill={sexColor}/>}
                  </svg>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:8,color:'#94a3b8',marginTop:1}}>
                    <span>1995</span>
                    <span style={{color:sexColor,fontWeight:600}}>{ndbPref}</span>
                    <span>2024</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{fontSize:9,color:'#94a3b8',marginTop:6,lineHeight:1.6}}>
            <span style={{display:'inline-block',width:14,borderTop:`2px solid ${sexColor}`,verticalAlign:'middle',marginRight:3}}/> {ndbPref}
            <span style={{display:'inline-block',width:14,borderTop:'2px dashed #cbd5e1',verticalAlign:'middle',margin:'0 3px 0 10px'}}/> 全国　·　▼/▲＝30 年変化率　·　タイル click で 47 県分布を全幅展開
          </div>

          {trendSite && (() => {
            const site = SITES.find(s=>s.short===trendSite) || {short:trendSite,label:trendSite};
            const natArr = nat[trendSite]?.[sexJp];
            const prefArr = allS[ndbPref]?.[trendSite]?.[sexJp];
            const allArrs = Object.entries(allS).map(([p,d])=>({pref:p, arr:d?.[trendSite]?.[sexJp]})).filter(x=>x.arr);
            const dom = domainOf(...allArrs.map(x=>x.arr), natArr);
            if (!dom) return null;
            const EW=mob?340:660, EH=270, pL=42,pR=14,pT=14,pB=30;
            const pw=EW-pL-pR, ph=EH-pT-pB;
            const sx=i=> pL + (xN<=1?0:i/(xN-1))*pw;
            const sy=v=> pT + (1-(v-dom.lo)/(dom.hi-dom.lo))*ph;
            const ticks=[1995,2005,2015,2024];
            const yTicks=[dom.lo,(dom.lo+dom.hi)/2,dom.hi];
            const hi=trendHoverIdx;
            let rankInfo=null;
            if(hi!=null){ const vals=allArrs.map(x=>({pref:x.pref,v:x.arr[hi]})).filter(x=>x.v!=null).sort((a,b)=>b.v-a.v); const idx=vals.findIndex(x=>x.pref===ndbPref); rankInfo={n:vals.length,rank:idx>=0?idx+1:null,self:prefArr?prefArr[hi]:null,natV:natArr?natArr[hi]:null}; }
            const onMove=(e)=>{ const r=e.currentTarget.getBoundingClientRect(); const xv=(e.clientX-r.left)/r.width*EW; let i=Math.round((xv-pL)/(pw||1)*(xN-1)); i=Math.max(0,Math.min(xN-1,i)); setTrendHoverIdx(i); };
            return (
              <div style={{marginTop:12,padding:'10px 12px',background:'#fff',border:`1px solid ${sexColor}33`,borderRadius:6}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#0f172a'}}>{site.label} — 47 県分布の 30 年推移（{sexJp}・ASR75）</div>
                  <button onClick={()=>{setTrendSite(null);setTrendHoverIdx(null);}} style={{fontSize:10,color:'#64748b',background:'transparent',border:'none',cursor:'pointer'}}>× 閉じる</button>
                </div>
                <svg viewBox={`0 0 ${EW} ${EH}`} style={{width:'100%',display:'block',touchAction:'none'}} onMouseMove={onMove} onMouseLeave={()=>setTrendHoverIdx(null)}>
                  {yTicks.map((v,i)=>(<g key={i}><line x1={pL} y1={sy(v)} x2={EW-pR} y2={sy(v)} stroke="#f1f5f9" strokeWidth={1}/><text x={pL-4} y={sy(v)+3} textAnchor="end" fontSize={8} fill="#94a3b8">{v.toFixed(0)}</text></g>))}
                  {ticks.map(y=>{ const i=years.indexOf(y); if(i<0) return null; return <text key={y} x={sx(i)} y={EH-pB+16} textAnchor="middle" fontSize={9} fill="#64748b">{y}</text>; })}
                  {allArrs.map(x=> x.pref===ndbPref?null:<path key={x.pref} d={linePath(x.arr,sx,sy)} fill="none" stroke="#e2e8f0" strokeWidth={1}/>)}
                  {natArr && <path d={linePath(natArr,sx,sy)} fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="4,3"/>}
                  {prefArr && <path d={linePath(prefArr,sx,sy)} fill="none" stroke={sexColor} strokeWidth={2.6}/>}
                  {hi!=null && <line x1={sx(hi)} y1={pT} x2={sx(hi)} y2={EH-pB} stroke={sexColor} strokeWidth={1} strokeDasharray="2,2" opacity={0.6}/>}
                  {hi!=null && prefArr && prefArr[hi]!=null && <circle cx={sx(hi)} cy={sy(prefArr[hi])} r={3.5} fill={sexColor}/>}
                  {hi!=null && natArr && natArr[hi]!=null && <circle cx={sx(hi)} cy={sy(natArr[hi])} r={2.8} fill="#94a3b8"/>}
                </svg>
                <div style={{minHeight:18,fontSize:10,color:'#475569',marginTop:2,lineHeight:1.5}}>
                  {rankInfo ? (
                    <span><b style={{color:sexColor}}>{years[hi]}年</b>　{ndbPref} {rankInfo.self!=null?rankInfo.self.toFixed(1):'—'}（全国 {rankInfo.natV!=null?rankInfo.natV.toFixed(1):'—'}）　{rankInfo.rank?`高い順 ${rankInfo.rank} / ${rankInfo.n} 位`:''}</span>
                  ) : (
                    <span style={{color:'#94a3b8'}}>チャートにカーソルを合わせるとその年の {ndbPref} の値・全国値・47 県順位を表示（薄灰＝他 46 県、破線＝全国）</span>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      );
    })()}
  </div>}

  {/* ═══ GAP FINDER: リスク×結果の不一致検出（テンプレ切替）═══ */}
  {ndbQ && vitalStats?.prefectures && (()=>{
    const tpl = GAP_TEMPLATES.find(t=>t.id===gapTemplate) || GAP_TEMPLATES[0];
    const allQ = ndbQ.prefectures || {};
    const allV = vitalStats.prefectures || [];
    // 軸アクセサ
    const getX = (pref) => {
      if (tpl.xType==='q') return allQ[pref]?.[tpl.xKey];
      if (tpl.xType==='aging') return prefMaps.aging[pref];
      if (tpl.xType==='egfr') return prefMaps.egfr[pref];
      return null;
    };
    const getY = (vp) => {
      if (tpl.yType==='cause') return vp.causes?.find(c=>c.cause.includes(tpl.yKey))?.rate;
      if (tpl.yType==='diag') return prefMaps.diag[vp.pref]?.[tpl.yKey];
      return null;
    };
    const dots = allV.map(vp => {
      const x = getX(vp.pref);
      const y = getY(vp);
      if (x==null || y==null || isNaN(x) || isNaN(y)) return null;
      return { pref: vp.pref, x, y };
    }).filter(Boolean);
    if (dots.length < 10) return (
      <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
        <div style={{fontSize:13,color:'#94a3b8'}}>Gap Finder: テンプレ「{tpl.label}」のデータが不足しています</div>
      </div>
    );

    const xMin = Math.min(...dots.map(d=>d.x));
    const xMax = Math.max(...dots.map(d=>d.x));
    const yMin = Math.min(...dots.map(d=>d.y));
    const yMax = Math.max(...dots.map(d=>d.y));
    const xAvg = dots.reduce((s,d)=>s+d.x,0)/dots.length;
    const yAvg = dots.reduce((s,d)=>s+d.y,0)/dots.length;
    // ピアソン相関係数
    const xSd = Math.sqrt(dots.reduce((s,d)=>s+(d.x-xAvg)**2,0)/dots.length);
    const ySd = Math.sqrt(dots.reduce((s,d)=>s+(d.y-yAvg)**2,0)/dots.length);
    const corr = (xSd>0 && ySd>0) ? dots.reduce((s,d)=>s+(d.x-xAvg)*(d.y-yAvg),0)/(dots.length*xSd*ySd) : 0;

    const W = mob ? 320 : 460;
    const H = 280;
    const pad = {t:20,r:20,b:35,l:50};
    const cw = W-pad.l-pad.r;
    const ch = H-pad.t-pad.b;
    const sx = v => pad.l + (xMax===xMin ? 0.5 : (v-xMin)/(xMax-xMin))*cw;
    const sy = v => pad.t + (1-(yMax===yMin ? 0.5 : (v-yMin)/(yMax-yMin)))*ch;
    const sel = dots.find(d=>d.pref===ndbPref);

    // xInverse対応: 高リスク象限を反転
    const xRiskHi = (d) => tpl.xInverse ? d.x < xAvg : d.x > xAvg;
    const yRiskHi = (d) => d.y > yAvg;
    // 象限矩形（リスク=赤=高Y、安全=緑=低Y）
    const riskRectX = tpl.xInverse ? pad.l : sx(xAvg);
    const riskRectW = tpl.xInverse ? sx(xAvg)-pad.l : cw-(sx(xAvg)-pad.l);
    const safeRectX = tpl.xInverse ? sx(xAvg) : pad.l;
    const safeRectW = tpl.xInverse ? cw-(sx(xAvg)-pad.l) : sx(xAvg)-pad.l;

    return (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        <span style={{fontSize:18}}>🔍</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>Gap Finder — リスク×結果の不一致観察</div>
          <div style={{fontSize:11,color:'#94a3b8'}}>{tpl.xLabel}（横軸）× {tpl.yLabel}（縦軸） — 47都道府県の地域差・相関係数 r={corr.toFixed(2)}</div>
        </div>
      </div>
      {/* P1-2: 解釈注意 (Gap Finder の不一致観察) */}
      <InterpretationGuard variant="mismatch" compact={true} />
      {/* テンプレ切替 */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
        {GAP_TEMPLATES.map(t => (
          <button key={t.id} onClick={()=>setGapTemplate(t.id)}
            style={{padding:'5px 10px',borderRadius:6,border:'1px solid '+(gapTemplate===t.id?'#2563EB':'#e2e8f0'),
                    background:gapTemplate===t.id?'#2563EB':'#fff', color:gapTemplate===t.id?'#fff':'#475569',
                    fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>{t.label}</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',maxWidth:W}}>
        {/* 象限背景: 赤=高リスク高死亡, 緑=低リスク低死亡 */}
        <rect x={riskRectX} y={pad.t} width={riskRectW} height={sy(yAvg)-pad.t} fill="#fef2f2" opacity={0.3} rx={4}/>
        <rect x={safeRectX} y={sy(yAvg)} width={safeRectW} height={ch-(sy(yAvg)-pad.t)} fill="#f0fdf4" opacity={0.3} rx={4}/>
        {/* 平均線 */}
        <line x1={sx(xAvg)} y1={pad.t} x2={sx(xAvg)} y2={H-pad.b} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="4,3"/>
        <line x1={pad.l} y1={sy(yAvg)} x2={W-pad.r} y2={sy(yAvg)} stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="4,3"/>
        {/* ドット */}
        {dots.map(d => {
          const isSel = d.pref === ndbPref;
          const xR = xRiskHi(d), yR = yRiskHi(d);
          const fill = (xR && yR) ? '#dc2626' : (!xR && !yR) ? '#059669' : '#94a3b8';
          return <circle key={d.pref} cx={sx(d.x)} cy={sy(d.y)} r={isSel?7:4}
            fill={fill} opacity={isSel?1:0.6} stroke={isSel?'#1e293b':'none'} strokeWidth={isSel?2:0}/>;
        })}
        {/* 選択県ラベル */}
        {sel && <text x={sx(sel.x)+10} y={sy(sel.y)-4} fontSize={11} fontWeight={700} fill="#1e293b">{ndbPref}</text>}
        {/* 軸ラベル */}
        <text x={W/2} y={H-4} textAnchor="middle" fontSize={10} fill="#64748b">{tpl.xLabel}</text>
        <text x={12} y={H/2} textAnchor="middle" fontSize={10} fill="#64748b" transform={`rotate(-90,12,${H/2})`}>{tpl.yLabel}</text>
        {/* 象限ラベル（xInverseで位置反転） */}
        <text x={tpl.xInverse?pad.l+4:W-pad.r-4} y={pad.t+12}
              textAnchor={tpl.xInverse?'start':'end'} fontSize={8} fill="#dc2626">高リスク×高死亡</text>
        <text x={tpl.xInverse?W-pad.r-4:pad.l+4} y={H-pad.b-4}
              textAnchor={tpl.xInverse?'end':'start'} fontSize={8} fill="#059669">低リスク×低死亡</text>
      </svg>
      <div style={{display:'flex',gap:12,fontSize:11,color:'#64748b',marginTop:8,flexWrap:'wrap'}}>
        <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#dc2626',marginRight:3}}/>高リスク高死亡</span>
        <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#059669',marginRight:3}}/>低リスク低死亡</span>
        <span><span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:'#94a3b8',marginRight:3}}/>不一致(GAP)</span>
        <span style={{color:'#94a3b8'}}>点線=全国平均</span>
      </div>
      <div style={{fontSize:10,color:'#94a3b8',marginTop:8,lineHeight:1.6}}>
        ※{tpl.note}<br/>
        ※相関係数は47都道府県間の地域差を示す指標であり、個人レベルの因果関係を意味するものではありません。
      </div>
    </div>);
  })()}

  {/* ═══ Layer 6: SUPPLY-DEMAND BRIDGE v0 (疾患別 需要・供給・結果サマリー) ═══ */}
  <DomainSupplyDemandBridge
    mob={mob}
    ndbPref={ndbPref}
    patientSurvey={patientSurvey}
    ndbQ={ndbQ}
    vitalStats={vitalStats}
    bedFunc={bedFunc}
    ndbRx={ndbRx}
    ndbRxAll={rxAll}
    pinnedPref={pinnedPref}
    agePyramid={agePyramid}
    ndbHc={ndbHc}
    ndbCheckupRiskRates={ndbCheckupRiskRates}
    ndbCheckupRiskRatesStd={ndbCheckupRiskRatesStd}
    mortalityOutcome2020={mortalityOutcome2020}
  />

  {/* ═══ Layer 7: REGIONAL MISMATCH EXPLORER (Phase 4-1 P1-4 MVP + 4-3f support evidence) ═══ */}
  <RegionalMismatchExplorer
    pref={ndbPref}
    ndbCheckupRiskRates={ndbCheckupRiskRates}
    ndbQuestionnaire={ndbQ}
    patientSurvey={patientSurvey}
    mortalityOutcome2020={mortalityOutcome2020}
    homecareCapability={homecareCapability}
    agePyramid={agePyramid}
  />

  <div style={{padding:'10px 0',fontSize:11,color:'#94a3b8',marginTop:8,lineHeight:1.8}}>
    出典: 厚生労働省 第10回NDBオープンデータ（令和5年度レセプト・令和4年度特定健診）<br/>
    厚労省 人口動態統計 2024年確定数 / 住民基本台帳 2025年1月1日<br/>
    ※処方薬の疾患領域マッピングは薬効分類に基づく推定であり、実際の処方目的とは異なる場合があります
  </div>
  </>;
}
