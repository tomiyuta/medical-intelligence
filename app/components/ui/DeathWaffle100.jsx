'use client';
import { useState, useEffect, useRef } from 'react';
import { tierOf } from '../../../lib/domainMapping';

// ── Layer5 百人ワッフル並置: 「{県}の100人 / 全国の100人」（純表示・カスタムSVG・データ依存なし） ──
// 死因構成比（粗死亡率2024の断面のみ — 構成%の意味が成立する断面）を、
// 100人の人間スケールに縮めた 10×10 格子2枚の並置 + 中央差分チップ列で読む。
//
// 規約踏襲（PrefStrip47 → 新部品の規約共有・コード共有でなく規約共有）:
//   ・yearBadge {label,color} 必須。無ければ console.warn + 非描画
//   ・1マス≈1人。端数は最大剰余法で計100人ちょうどに調整し、値は捏造しない —
//     ツールチップ/情報バーは常に実値（構成%小数1桁 + 粗死亡率/10万）を併記
//   ・mob は PsIris 踏襲の2段階タッチ（1タップ=情報バー / 同カテゴリ2タップ目=onSelectCause）
//
// 色意味論（colorDecision 準拠・二層）:
//   ①カテゴリ色 = 名義尺度なので赤緑リスク色を避けたカテゴリカル8色
//     （がん=本区画既存の紫#7c3aed継承。ピン橙#f97316・選択青#2563EBと衝突しない琥珀/teal等）
//   ②対全国差分（±n人チップ・対全国比）= 構成比の高低は良し悪しでないため
//     rose#9f1239 / indigo#4338ca の中立発散 + tierOf ことばチップ

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
    if (target == null || from == null || !isFinite(from) || !isFinite(target) || prefersReducedMotion()) { setVal(target); return; }
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

// ── カテゴリ定義: 全国構成比降順の固定8分類（上位7死因 + その他） ──
export const FOLD_TOP7 = 7;
export const WAFFLE_CAUSE_COLORS = {
  'がん(悪性新生物)': '#7c3aed',
  '心疾患':           '#e05c7a',
  '老衰':             '#0d9488',
  '脳血管疾患':       '#4338ca',
  '肺炎':             '#d97706',
  '誤嚥性肺炎':       '#b45309',
  '不慮の事故':       '#64748b',
};
export const WAFFLE_OTHER = 'その他の死因';
export const WAFFLE_OTHER_COLOR = '#cbd5e1';

const shortCause = (s) => (s || '').replace(/\(.+\)/, '');

// 最大剰余法: 実数share配列 → 合計が厳密に total(=100) の整数配列
export const largestRemainder = (shares, total = 100) => {
  const safe = shares.map(s => (s != null && isFinite(s) && s > 0 ? s : 0));
  const floors = safe.map(s => Math.floor(s));
  let rem = total - floors.reduce((a, b) => a + b, 0);
  const out = [...floors];
  if (rem > 0) {
    const order = safe.map((s, i) => ({ i, frac: s - Math.floor(s) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
    let k = 0;
    while (rem > 0 && order.length > 0) { out[order[k % order.length].i]++; rem--; k++; }
  } else if (rem < 0) {
    // 過剰（通常発生しない防御）: 大きい順に1ずつ減らす
    const order = safe.map((s, i) => ({ i, s })).sort((a, b) => b.s - a.s);
    let k = 0;
    while (rem < 0 && order.length > 0) { const i = order[k % order.length].i; if (out[i] > 0) { out[i]--; rem++; } k++; }
  }
  return out;
};

// items ビルダ: vitalStats の県causes/全国causes（全国降順）→ 8カテゴリ items
// その他 = 上位7以外の死因 + 残差（14死因に未掲載の死因ぶん。全国では約21.8%）
export const buildWaffleItems = ({ prefCauses, prefTotal, natCauses, natTotal }) => {
  if (!prefCauses?.length || !natCauses?.length || !prefTotal || !natTotal) return null;
  const top = natCauses.slice(0, FOLD_TOP7); // 全国データは構成比降順を実確認
  const cats = top.map(nc => ({
    cause: nc.cause,
    color: WAFFLE_CAUSE_COLORS[nc.cause] || '#94a3b8',
    prefRate: prefCauses.find(c => c.cause === nc.cause)?.rate ?? 0,
    natRate: nc.rate ?? 0,
    foldedList: null,
  }));
  const foldedList = natCauses.slice(FOLD_TOP7).map(c => c.cause);
  const prefTopSum = cats.reduce((s, c) => s + c.prefRate, 0);
  const natTopSum = cats.reduce((s, c) => s + c.natRate, 0);
  cats.push({
    cause: WAFFLE_OTHER, color: WAFFLE_OTHER_COLOR,
    prefRate: Math.max(0, prefTotal - prefTopSum),
    natRate: Math.max(0, natTotal - natTopSum),
    foldedList,
  });
  const prefShares = cats.map(c => c.prefRate / prefTotal * 100);
  const natShares = cats.map(c => c.natRate / natTotal * 100);
  const prefCounts = largestRemainder(prefShares);
  const natCounts = largestRemainder(natShares);
  return cats.map((c, i) => ({
    ...c,
    prefShare: prefShares[i], natShare: natShares[i],
    prefCount: prefCounts[i], natCount: natCounts[i],
  }));
};

// ±n人 差分チップの数値（useCountUp 同期・符号表示）
const DiffNum = ({ value }) => {
  const v = useCountUp(value);
  const r = Math.round(v != null && isFinite(v) ? v : value);
  return <>{r > 0 ? '+' : r < 0 ? '−' : '±'}{Math.abs(r)}</>;
};
// 人数チップ（凡例用・useCountUp 同期）
const CountNum = ({ value }) => {
  const v = useCountUp(value);
  return <>{Math.round(v != null && isFinite(v) ? v : value)}</>;
};

export default function DeathWaffle100({
  items, prefName, totalRatePref, totalRateNat,
  hoverCause, onHoverCause, onSelectCause, yearBadge, mob,
}) {
  const boxRef = useRef(null);
  const [tip, setTip] = useState(null);        // {x,y} 相対座標（desktop hover ツールチップ）
  const [tapCause, setTapCause] = useState(null); // mob 2段階タッチの1タップ目
  useEffect(() => { setTapCause(null); }, [prefName]);
  useEffect(() => { if (hoverCause == null) setTapCause(null); }, [hoverCause]);
  const reduced = prefersReducedMotion();

  // ── yearBadge ガード（全 hook 宣言後・PrefStrip47 規約） ──
  if (!yearBadge || !yearBadge.label) {
    if (typeof window !== 'undefined') console.warn('DeathWaffle100: yearBadge（必須 {label,color}）が無いため描画しません。', { prefName });
    return null;
  }
  if (!items || items.length === 0 || !totalRatePref || !totalRateNat) return null;

  const C = mob ? 10 : 14, G = mob ? 2 : 4;    // セル/間隔（mobは横並び死守サイズ）
  const size = 10 * C + 9 * G;                  // PC≒176 / mob≒118
  const trans = reduced ? 'none' : 'fill 300ms ease, opacity 300ms ease';

  // カテゴリindex列 100個（両格子とも左上から同一カテゴリ順充填=形状比較可能）
  const buildCells = (key) => {
    const out = [];
    items.forEach((w, i) => { for (let k = 0; k < (w[key] || 0) && out.length < 100; k++) out.push(i); });
    while (out.length < 100) out.push(items.length - 1); // 防御（合計は最大剰余法で100厳密）
    return out;
  };
  const prefCells = buildCells('prefCount');
  const natCells = buildCells('natCount');

  const catOpacity = (w) => {
    if (hoverCause) return w.cause === hoverCause ? 1 : 0.25;
    return w.dim ? 0.25 : 1;
  };
  const enterCat = (cause, e) => {
    if (mob) return;
    onHoverCause && onHoverCause(cause);
    if (e && boxRef.current) {
      const r = boxRef.current.getBoundingClientRect();
      setTip({ x: e.clientX - r.left, y: e.clientY - r.top });
    }
  };
  const leaveAll = () => { if (!mob) { onHoverCause && onHoverCause(null); setTip(null); } };
  // click=展開（既存 selectedCause トグル→マップエコー）。「その他」は click 無効。
  // mob は2段階: 1タップ=情報バー / 同カテゴリ2タップ目=展開
  const tapCat = (cause) => {
    if (mob) {
      if (tapCause !== cause) { setTapCause(cause); onHoverCause && onHoverCause(cause); return; }
      if (cause !== WAFFLE_OTHER) onSelectCause && onSelectCause(cause);
    } else if (cause !== WAFFLE_OTHER) {
      onSelectCause && onSelectCause(cause);
    }
  };

  // 格子1枚（plain 関数レンダ=再マウントさせず fill transition を効かせる）
  const renderGrid = (cells, caption, totalRate) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: size }}>
      <div style={{ fontSize: mob ? 10 : 11.5, fontWeight: 700, color: '#334155' }}>{caption}</div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
           aria-label={`${caption} — 死因構成を100人に換算したワッフル格子（1マス≈1人）`} style={{ display: 'block' }}>
        {cells.map((ci, idx) => {
          const w = items[ci];
          const col = idx % 10, row = Math.floor(idx / 10);
          return (
            <rect key={idx} x={col * (C + G)} y={row * (C + G)} width={C} height={C} rx={mob ? 2 : 3}
              fill={w.color} opacity={catOpacity(w)}
              style={{ transition: trans, cursor: w.cause === WAFFLE_OTHER ? 'default' : 'pointer' }}
              onMouseEnter={(e) => enterCat(w.cause, e)}
              onClick={() => tapCat(w.cause)}
            />
          );
        })}
      </svg>
      <div style={{ fontSize: 9, color: '#94a3b8' }}>全死因 <b style={{ color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{totalRate.toFixed(1)}</b>/10万</div>
    </div>
  );

  // ツールチップ/情報バー本文（常に実値: 人数+構成%+粗死亡率/10万+対全国比tierOfことば）
  const catInfo = (w) => {
    const ratioPct = w.natRate > 0 ? (w.prefRate / w.natRate - 1) * 100 : null;
    const tier = ratioPct != null ? tierOf(ratioPct) : null;
    return (
      <>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>
          {shortCause(w.cause)}
          {w.foldedList && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6, fontSize: 9 }}>含む: {w.foldedList.slice(0, 4).map(shortCause).join('・')} など+残差</span>}
        </div>
        <div style={{ fontVariantNumeric: 'tabular-nums' }}>{prefName}: <b>{w.prefCount}人</b>（{w.prefShare.toFixed(1)}%・{w.prefRate.toFixed(1)}/10万）</div>
        <div style={{ fontVariantNumeric: 'tabular-nums' }}>全国: <b>{w.natCount}人</b>（{w.natShare.toFixed(1)}%・{w.natRate.toFixed(1)}/10万）</div>
        {ratioPct != null && (
          <div style={{ marginTop: 2 }}>
            対全国比(率) {ratioPct > 0 ? '+' : ''}{ratioPct.toFixed(1)}%
            {tier && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 8, background: tier.color + '26', color: '#fff', border: `1px solid ${tier.color}`, fontSize: 9, fontWeight: 700 }}>{tier.label}</span>}
          </div>
        )}
      </>
    );
  };
  const hoverItem = hoverCause ? items.find(x => x.cause === hoverCause) : null;

  return (
    <div ref={boxRef} onMouseLeave={leaveAll}
         style={{ position: 'relative', background: '#fbfcfd', border: '1px solid #eef2f6', borderRadius: 10, padding: mob ? '10px 8px' : '14px 16px', marginBottom: 10 }}>
      {/* ヘッダ + 変換凡例（構成% ⇔ 死亡率/10万 の変換を明示） + yearBadge 常設 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: mob ? 11 : 12, fontWeight: 700, color: '#1e293b' }}>もし死亡を100人に縮めたら</span>
        <span style={{ fontSize: 8.5, padding: '2px 6px', borderRadius: 4, background: (yearBadge.color || '#64748b') + '1a', color: yearBadge.color || '#64748b', fontWeight: 700 }}>{yearBadge.label}</span>
        <span style={{ fontSize: 9, color: '#64748b', background: '#f1f5f9', padding: '2px 7px', borderRadius: 8 }}
              title={`各死因の人数 = 構成% を100人に換算。構成% = 各死因の粗死亡率 ÷ 全死因粗死亡率（${prefName} ${totalRatePref.toFixed(1)}/10万・全国 ${totalRateNat.toFixed(1)}/10万）`}>
          構成% = 死因別粗死亡率 ÷ 全死因{mob ? '' : `（この県 ${totalRatePref.toFixed(1)}/10万）`}
        </span>
      </div>
      {/* 2格子並置 + 中央差分チップ列（mob も横並び死守） */}
      <div style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: mob ? 6 : 18 }}>
        {renderGrid(prefCells, `${prefName}の100人`, totalRatePref)}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: mob ? 2 : 4, width: mob ? 72 : 96, flexShrink: 0 }}
             title="中央チップ = 県100人 − 全国100人 の人数差。多い=rose / 少ない=indigo（良し悪しではありません）">
          {items.map((w) => {
            const d = w.prefCount - w.natCount;
            const col = d > 0 ? '#9f1239' : d < 0 ? '#4338ca' : '#94a3b8';
            const bg = d > 0 ? '#fdf2f4' : d < 0 ? '#eef2ff' : '#f8fafc';
            return (
              <div key={w.cause}
                   onMouseEnter={(e) => enterCat(w.cause, e)} onClick={() => tapCat(w.cause)}
                   style={{ display: 'flex', alignItems: 'center', gap: 4, padding: mob ? '1px 4px' : '2px 6px', borderRadius: 8, background: bg,
                            opacity: catOpacity(w), transition: reduced ? 'none' : 'opacity 300ms ease',
                            cursor: w.cause === WAFFLE_OTHER ? 'default' : 'pointer',
                            outline: hoverCause === w.cause ? `1.5px solid ${w.color}` : 'none' }}>
                <span style={{ width: 7, height: 7, borderRadius: w.cause === WAFFLE_OTHER ? '50%' : 2, background: w.color, flexShrink: 0 }} />
                <span style={{ fontSize: mob ? 8.5 : 9.5, fontWeight: 700, color: col, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  <DiffNum value={d} />人
                </span>
              </div>
            );
          })}
        </div>
        {renderGrid(natCells, '全国の100人', totalRateNat)}
      </div>
      {/* 凡例チップ（hover 同期・click 展開） */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, justifyContent: 'center' }}>
        {items.map((w) => (
          <span key={w.cause}
                onMouseEnter={(e) => enterCat(w.cause, e)} onClick={() => tapCat(w.cause)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: mob ? 8.5 : 9.5, color: '#475569', background: '#fff',
                         border: `1px solid ${hoverCause === w.cause ? w.color : '#e2e8f0'}`, borderRadius: 10, padding: '2px 7px',
                         opacity: catOpacity(w), transition: reduced ? 'none' : 'opacity 300ms ease',
                         cursor: w.cause === WAFFLE_OTHER ? 'default' : 'pointer' }}>
            <span style={{ width: 7, height: 7, borderRadius: w.cause === WAFFLE_OTHER ? '50%' : 2, background: w.color, flexShrink: 0 }} />
            {shortCause(w.cause)}
            <span style={{ color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>県<b style={{ color: '#334155' }}><CountNum value={w.prefCount} /></b>/全<CountNum value={w.natCount} /></span>
          </span>
        ))}
      </div>
      {/* mob 情報バー（2段階タッチの1段目） / desktop はカーソル追従ツールチップ */}
      {mob && hoverItem && (
        <div style={{ marginTop: 8, background: '#1e293b', color: '#f1f5f9', borderRadius: 6, padding: '7px 10px', fontSize: 10, lineHeight: 1.6 }}>
          {catInfo(hoverItem)}
          {hoverItem.cause !== WAFFLE_OTHER && <div style={{ color: '#94a3b8', fontSize: 9, marginTop: 2 }}>もう一度タップで 47 県地図（下の行に展開）</div>}
        </div>
      )}
      {!mob && hoverItem && tip && (() => {
        const bw = boxRef.current?.getBoundingClientRect().width || 320;
        const x = Math.max(120, Math.min(tip.x, bw - 120));
        return (
          <div style={{ position: 'absolute', left: x, top: Math.max(tip.y - 10, 8), transform: 'translate(-50%,-100%)',
                        background: '#1e293b', color: '#f1f5f9', borderRadius: 6, padding: '7px 10px', fontSize: 10.5, lineHeight: 1.6,
                        pointerEvents: 'none', zIndex: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.25)', whiteSpace: 'nowrap' }}>
            {catInfo(hoverItem)}
          </div>
        );
      })()}
      {/* 脚注（guardrail: 1マス≈1人・最大剰余法・小死因統合を明示） */}
      <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
        1マス≈1人。端数は<b>最大剰余法</b>で計100人ちょうどに調整（人数は概数・実値は%と/10万を参照）。
        上位7死因以外の小死因と統計上の残差は<b>「その他の死因」</b>に統合（クリック対象外）。
        マスをクリックすると下の該当死因行に 47 県地図が展開します。
      </div>
    </div>
  );
}
