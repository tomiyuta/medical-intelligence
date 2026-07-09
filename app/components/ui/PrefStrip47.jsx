'use client';
import { useRef, useState, useEffect, useMemo } from 'react';

/**
 * PrefStrip47 — 47都道府県 1次元分布ストリップ（rank1 中核部品）
 *
 * 全セクションの「点推定」の脇に常設する再利用可能なカスタムSVGストリップ。
 * hover同期・比較県ピン・県ジャンプを1つの文法で提供し、他の全部品の
 * ドット語彙の親となる。純表示部品でデータ依存なし（values を受け取るだけ）。
 *
 * props:
 *   values    : [{pref, value}] 47件（欠損 value は非表示フォールバック）
 *   selected  : 選択県名（自県）→ 青塗り2pxリング
 *   pinned    : 比較県名|null → 橙◆
 *   inverse   : bool 高値=低リスクの向き注記（軸は反転しない・注記のみ）
 *   yearBadge : {label, color} 必須。無ければ描画せず console.warn
 *   natAvg    : number|undefined 全国平均tick位置（未指定なら values 平均を使用）
 *   hoverPref : 外部同期用の現在ホバー県|null（他行と同期点灯）
 *   onHover   : (pref|null)=>void
 *   onPin     : (pref)=>void
 *   onJump    : (pref)=>void
 *   mode      : 'micro'(14px高・レンジバー縮退) | 'inline'(28px) | 'full'(64pxビースウォーム)
 *   domain    : [min,max]|undefined 固定軸域。未指定=行内min/max自動スケール（従来挙動）。
 *               域外値は端にクランプし ▸/◂ マーカーで「振り切れ」を明示（値は捏造しない・
 *               ツールチップは常に実値を表示）。
 *   scale     : 'linear'(既定) | 'log2' x写像。log2 は x=(log2(v)-log2(min))/(log2(max)-log2(min))。
 *               min<=0 の域では log2 不能のため linear に縮退。
 *
 * hover同期は単一 onMouseMove で最近傍x探索（circle個別リスナー回避）。
 * ツールチップは内部 absolute div（親の onHover でも制御可能）。
 *
 * ── モバイル タッチ2段階（情報→移動）の設計メモ ──
 *   1タップ目 = 最近傍県の情報表示（onHover 発火＋ツールチップ）
 *   2タップ目（既ピン県ドットを再タップ）= 移動（onJump 発火）
 *   実際のジャンプ確定は呼び出し側の確認に委ねる（onJump ハンドラ内で確認導線）。
 */

const MODE_CFG = {
  micro:  { h: 14, r: 2.2, top: 3,  band: 8,  header: false, labels: false, padX: 6,  badgeFs: 8 },
  inline: { h: 28, r: 3,   top: 5,  band: 18, header: true,  labels: false, padX: 8,  badgeFs: 9 },
  full:   { h: 64, r: 4,   top: 12, band: 30, header: true,  labels: true,  padX: 14, badgeFs: 9 },
};

const C = {
  track:     '#f1f5f9',
  spine:     '#e2e8f0',
  dot:       '#cbd5e1',
  dotStroke: '#94a3b8',
  median:    '#64748b',
  avg:       '#2563EB',
  selected:  '#2563EB',
  pin:       '#f97316',
  pinStroke: '#c2410c',
  hi:        '#1e293b',
  text:      '#475569',
  faint:     '#94a3b8',
};

function fmtVal(v) {
  if (v == null || !isFinite(v)) return '—';
  return Number.isInteger(v) ? String(v) : (Math.abs(v) < 100 ? v.toFixed(1) : Math.round(v).toString());
}

export default function PrefStrip47({
  values,
  selected = null,
  pinned = null,
  inverse = false,
  yearBadge,
  natAvg,
  hoverPref = null,
  onHover,
  onPin,
  onJump,
  mode = 'inline',
  domain = null,
  scale = 'linear',
}) {
  const cfg = MODE_CFG[mode] || MODE_CFG.inline;

  // domain は配列 identity が毎render変わっても再計算しないよう要素で安定化
  const hasDomain = Array.isArray(domain) && domain.length === 2
    && isFinite(domain[0]) && isFinite(domain[1]) && domain[0] < domain[1];
  const d0 = hasDomain ? domain[0] : null;
  const d1 = hasDomain ? domain[1] : null;

  // ── hooks（順序固定のため yearBadge ガードより前に全て宣言） ──
  const holderRef = useRef(null);
  const warnedRef = useRef(false);
  const lastHoverRef = useRef(null);
  const [w, setW] = useState(320);
  const [hover, setHover] = useState(null); // {pref,value,x,y,rank}

  useEffect(() => {
    const el = holderRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cw = e.contentRect.width;
        if (cw > 0) setW(cw);
      }
    });
    ro.observe(el);
    if (el.clientWidth > 0) setW(el.clientWidth);
    return () => ro.disconnect();
  }, [mode]);

  const clean = useMemo(
    () => (Array.isArray(values) ? values : []).filter(
      (d) => d && d.pref != null && d.value != null && isFinite(d.value)
    ),
    [values]
  );

  const layout = useMemo(() => {
    if (clean.length === 0) return null;
    const vals = clean.map((d) => d.value);
    // 固定 domain 指定時は行内 min/max 自動スケールを上書き（共有軸）
    let min = d0 != null ? d0 : Math.min(...vals);
    let max = d1 != null ? d1 : Math.max(...vals);
    if (min === max) { min -= 1; max += 1; }
    // log2 写像は正の域でのみ有効（min<=0 は linear へ縮退）
    const useLog = scale === 'log2' && min > 0;
    const padX = cfg.padX;
    const innerW = Math.max(1, w - padX * 2);
    // 域外値は端にクランプ（表示位置のみ端寄せ・値は捏造しない）
    const clampV = (v) => Math.max(min, Math.min(max, v));
    const norm = useLog
      ? (v) => (Math.log2(v) - Math.log2(min)) / (Math.log2(max) - Math.log2(min))
      : (v) => (v - min) / (max - min);
    const xOf = (v) => padX + norm(clampV(v)) * innerW;

    const cy = cfg.top + cfg.band / 2;
    const r = cfg.r;
    const bandTop = cy - cfg.band / 2 + r;
    const bandBottom = cy + cfg.band / 2 - r;

    // 中央値
    const sorted = [...vals].sort((a, b) => a - b);
    const midIx = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[midIx] : (sorted[midIx - 1] + sorted[midIx]) / 2;

    // 全国平均tick（prop 優先、無ければ平均）
    const avg = (natAvg != null && isFinite(natAvg))
      ? natAvg
      : vals.reduce((s, v) => s + v, 0) / vals.length;
    const avgX = xOf(Math.max(min, Math.min(max, avg)));

    // 貪欲スタッキング（ビースウォーム）— x昇順に中央から交互配置
    // clamped: 固定 domain の域外値（'low'|'high'|null）→ 端マーカーで振り切れ明示
    const pts = clean.map((d, i) => ({
      pref: d.pref, value: d.value, i, x: xOf(d.value), y: cy,
      clamped: d.value < min ? 'low' : d.value > max ? 'high' : null,
    }));
    const byX = [...pts].sort((a, b) => a.x - b.x);
    const minGap = r * 2 + 0.4;
    const placed = [];
    for (const p of byX) {
      let y = cy;
      let step = 0;
      let sign = 1;
      let guard = 0;
      while (guard++ < 500) {
        const cand = cy + step * sign;
        if (cand >= bandTop && cand <= bandBottom) {
          let ok = true;
          for (const q of placed) {
            if (Math.abs(q.x - p.x) < minGap) {
              const dx = q.x - p.x;
              const dy = q.y - cand;
              if (dx * dx + dy * dy < minGap * minGap) { ok = false; break; }
            }
          }
          if (ok) { y = cand; break; }
        }
        if (sign === 1) { sign = -1; } else { sign = 1; step += r * 0.85; }
        if (step > cfg.band) { y = Math.max(bandTop, Math.min(bandBottom, cand)); break; }
      }
      p.y = y;
      placed.push(p);
    }

    // 順位（1 = 最高値）
    const byValDesc = [...clean].sort((a, b) => b.value - a.value);
    const rankMap = {};
    byValDesc.forEach((d, ix) => { rankMap[d.pref] = ix + 1; });

    // full mode 上位/下位3県
    const high3 = byValDesc.slice(0, 3);
    const low3 = byValDesc.slice(-3).reverse();

    return { pts, xOf, min, max, median, medianX: xOf(median), avg, avgX,
             cy, bandTop, bandBottom, r, rankMap, n: clean.length, high3, low3, padX };
  }, [clean, w, mode, natAvg, d0, d1, scale]);

  // ── yearBadge ガード（全 hook 宣言後に return） ──
  if (!yearBadge || !yearBadge.label) {
    if (!warnedRef.current) {
      warnedRef.current = true;
      if (typeof console !== 'undefined') {
        console.warn('PrefStrip47: yearBadge（必須 {label,color}）が無いため描画しません。', { selected, mode });
      }
    }
    return null;
  }

  const badgeColor = yearBadge.color || '#64748b';

  // 最近傍県（x のみ）を探索
  const nearestPt = (clientX) => {
    const el = holderRef.current;
    if (!el || !layout) return null;
    const rect = el.getBoundingClientRect();
    const scale = rect.width ? (w / rect.width) : 1;
    const mx = (clientX - rect.left) * scale;
    let best = null;
    let bd = Infinity;
    for (const p of layout.pts) {
      const d = Math.abs(p.x - mx);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };

  const emitHover = (pref) => {
    if (lastHoverRef.current !== pref) {
      lastHoverRef.current = pref;
      if (typeof onHover === 'function') onHover(pref);
    }
  };

  const handleMove = (e) => {
    const p = nearestPt(e.clientX);
    if (!p) return;
    setHover({ pref: p.pref, value: p.value, x: p.x, y: p.y, rank: layout.rankMap[p.pref], clamped: p.clamped });
    emitHover(p.pref);
  };

  const handleLeave = () => {
    setHover(null);
    emitHover(null);
  };

  const handleClick = (e) => {
    const p = nearestPt(e.clientX);
    if (!p) return;
    // 1タップ目相当: 情報表示
    setHover({ pref: p.pref, value: p.value, x: p.x, y: p.y, rank: layout.rankMap[p.pref], clamped: p.clamped });
    emitHover(p.pref);
    // 既ピン県ドットの再クリック = 移動（呼び出し側で確認）
    if (pinned && p.pref === pinned) {
      if (typeof onJump === 'function') onJump(p.pref);
    } else if (typeof onPin === 'function') {
      onPin(p.pref);
    }
  };

  // 同期点灯対象（ローカルhover優先→外部hoverPref）
  const litPref = hover ? hover.pref : hoverPref;

  // ── 描画（layout 無し = 全欠損） ──
  const renderBadge = (fs) => (
    <span
      style={{
        fontSize: fs,
        fontWeight: 700,
        padding: fs <= 8 ? '0 4px' : '1px 6px',
        borderRadius: 4,
        color: badgeColor,
        background: badgeColor + '1a',
        border: `1px solid ${badgeColor}33`,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
        flexShrink: 0,
      }}
    >
      {yearBadge.label}
    </span>
  );

  const svg = layout ? (
    <svg
      width={w}
      height={cfg.h}
      viewBox={`0 0 ${w} ${cfg.h}`}
      style={{ width: '100%', height: cfg.h, display: 'block', cursor: 'pointer', touchAction: 'manipulation' }}
      role="img"
      aria-label={`47都道府県分布 ${yearBadge.label}${selected ? `・選択=${selected}` : ''}`}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      {/* トラック（レンジ帯） */}
      <rect
        x={layout.xOf(layout.min) - layout.r}
        y={layout.bandTop - 1.5}
        width={(layout.xOf(layout.max) - layout.xOf(layout.min)) + layout.r * 2}
        height={(layout.bandBottom - layout.bandTop) + 3}
        rx={Math.min(4, cfg.band / 2)}
        fill={C.track}
      />
      {/* 全国平均tick（破線＋上部キャレット） */}
      <line
        x1={layout.avgX} x2={layout.avgX}
        y1={layout.bandTop - 2} y2={layout.bandBottom + 2}
        stroke={C.avg} strokeWidth={1} strokeDasharray="2 2" opacity={0.75}
      />
      <path
        d={`M ${layout.avgX - 3} ${layout.bandTop - 5} L ${layout.avgX + 3} ${layout.bandTop - 5} L ${layout.avgX} ${layout.bandTop - 1.5} Z`}
        fill={C.avg} opacity={0.9}
      />
      {/* 中央値 実線 */}
      <line
        x1={layout.medianX} x2={layout.medianX}
        y1={layout.bandTop - 3} y2={layout.bandBottom + 3}
        stroke={C.median} strokeWidth={1.5}
      />
      {/* 通常ドット（selected/pinned/lit は後段で重ね描き） */}
      {layout.pts.map((p) => {
        if (p.pref === selected || p.pref === pinned || p.pref === litPref) return null;
        return (
          <circle key={p.pref} cx={p.x} cy={p.y} r={layout.r}
                  fill={C.dot} stroke={C.dotStroke} strokeWidth={0.5} opacity={0.85} />
        );
      })}
      {/* 同期点灯（selected/pinned でない場合のハイライトリング） */}
      {litPref && litPref !== selected && litPref !== pinned && layout.pts.filter((p) => p.pref === litPref).map((p) => (
        <g key={`lit-${p.pref}`}>
          <circle cx={p.x} cy={p.y} r={layout.r} fill={C.hi} />
          <circle cx={p.x} cy={p.y} r={layout.r + 2.5} fill="none" stroke={C.hi} strokeWidth={1.5} opacity={0.8} />
        </g>
      ))}
      {/* 選択県: 青塗り + 2pxリング */}
      {selected && layout.pts.filter((p) => p.pref === selected).map((p) => (
        <g key={`sel-${p.pref}`}>
          <circle cx={p.x} cy={p.y} r={layout.r + 3.5} fill="#fff" opacity={0.9} />
          <circle cx={p.x} cy={p.y} r={layout.r} fill={C.selected} />
          <circle cx={p.x} cy={p.y} r={layout.r + 2.5} fill="none" stroke={C.selected} strokeWidth={2} />
        </g>
      ))}
      {/* 比較ピン: 橙◆ */}
      {pinned && pinned !== selected && layout.pts.filter((p) => p.pref === pinned).map((p) => {
        const s = layout.r + 1.5;
        return (
          <path
            key={`pin-${p.pref}`}
            d={`M ${p.x} ${p.y - s} L ${p.x + s} ${p.y} L ${p.x} ${p.y + s} L ${p.x - s} ${p.y} Z`}
            fill={C.pin} stroke={C.pinStroke} strokeWidth={1}
          />
        );
      })}
      {/* 域外クランプ ▸/◂ マーカー（固定 domain の振り切れ明示・全ドット種の上に重ねる） */}
      {layout.pts.filter((p) => p.clamped).map((p) => {
        const r = layout.r;
        const d = p.clamped === 'high'
          ? `M ${p.x + r - 0.5} ${p.y - r} L ${p.x + r + 3} ${p.y} L ${p.x + r - 0.5} ${p.y + r} Z`
          : `M ${p.x - r + 0.5} ${p.y - r} L ${p.x - r - 3} ${p.y} L ${p.x - r + 0.5} ${p.y + r} Z`;
        return (
          <path key={`clamp-${p.pref}`} d={d} fill={C.hi} opacity={0.85}>
            <title>{`${p.pref} ${fmtVal(p.value)}（軸域外→端に表示）`}</title>
          </path>
        );
      })}
      {/* full mode: 上位/下位3県ラベル */}
      {cfg.labels && (
        <g>
          {layout.low3.map((d, ix) => (
            <text key={`lo-${d.pref}`} x={layout.padX} y={cfg.top + cfg.band + 8 + ix * 8}
                  fontSize={8} fill={C.faint} textAnchor="start">
              {d.pref} <tspan fill={C.text} fontWeight="600">{fmtVal(d.value)}</tspan>
            </text>
          ))}
          {layout.high3.map((d, ix) => (
            <text key={`hi-${d.pref}`} x={w - layout.padX} y={cfg.top + cfg.band + 8 + ix * 8}
                  fontSize={8} fill={C.faint} textAnchor="end">
              <tspan fill={C.text} fontWeight="600">{fmtVal(d.value)}</tspan> {d.pref}
            </text>
          ))}
        </g>
      )}
    </svg>
  ) : (
    <div style={{ height: cfg.h, display: 'flex', alignItems: 'center', fontSize: 10, color: C.faint }}>
      分布データなし
    </div>
  );

  const tooltip = hover && layout ? (
    <div
      style={{
        position: 'absolute',
        left: hover.x,
        top: Math.max(0, hover.y - layout.r - 4),
        transform: 'translate(-50%, -100%)',
        background: '#1e293b',
        color: '#fff',
        fontSize: 10,
        lineHeight: 1.4,
        padding: '4px 7px',
        borderRadius: 4,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 20,
        boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
      }}
    >
      <span style={{ fontWeight: 700 }}>{hover.pref}</span>{' '}
      <span style={{ color: '#93c5fd', fontWeight: 700 }}>{fmtVal(hover.value)}</span>
      {hover.clamped && (
        <span style={{ color: '#fbbf24', fontWeight: 700, marginLeft: 4 }}>
          {hover.clamped === 'high' ? '▸' : '◂'}軸域外
        </span>
      )}
      <span style={{ color: '#cbd5e1' }}>　{layout.n}県中 {hover.rank}位</span>
      <span style={{ color: '#64748b', marginLeft: 6 }}>{yearBadge.label}</span>
    </div>
  ) : null;

  // ── レイアウト（micro=flex横並び / inline・full=ヘッダー行＋svg） ──
  if (mode === 'micro') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
        {renderBadge(cfg.badgeFs)}
        {inverse && <span title="高値=低リスク方向" style={{ fontSize: 9, color: C.faint, flexShrink: 0 }}>↔</span>}
        <div ref={holderRef} style={{ position: 'relative', flex: 1, minWidth: 40 }}>
          {svg}
          {tooltip}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, minHeight: 14, flexWrap: 'wrap' }}>
        {renderBadge(cfg.badgeFs)}
        {inverse && (
          <span style={{ fontSize: 9, color: C.faint }}>↔ 高値=低リスク方向</span>
        )}
        {mode === 'full' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 9, color: C.faint }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <svg width={12} height={8}><line x1={6} y1={0} x2={6} y2={8} stroke={C.median} strokeWidth={1.5} /></svg>
              中央値
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <svg width={12} height={8}><line x1={6} y1={0} x2={6} y2={8} stroke={C.avg} strokeWidth={1} strokeDasharray="2 2" /></svg>
              全国平均
            </span>
          </span>
        )}
      </div>
      <div ref={holderRef} style={{ position: 'relative', width: '100%' }}>
        {svg}
        {tooltip}
      </div>
    </div>
  );
}
