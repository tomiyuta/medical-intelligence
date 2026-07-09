'use client';
import { useRef, useState, useMemo, useId } from 'react';

/**
 * PsIris — 受療率フィンガープリント「虹彩レーダー」（視覚アイデンティティの主役）
 *
 * 21傷病大分類（患者調査 第39表）を章番号順の固定角スポークに配置し、
 * 対全国比を log2 対称スケールの放射花弁で描くカスタムSVG純表示部品。
 * Recharts 不使用・データ依存なし（items を受け取るだけ）。
 *
 * props:
 *   items         : [{key, rom(章ローマ数字), name, ratio(対全国比% or null), small(bool ⚠章)}] 21件・章番号順
 *   prefName      : 中心表示の県名
 *   modeLabel     : '入院' | '外来'
 *   pinnedRatios  : 比較県の ratio 配列21件 | null（items と同順）→ 橙ポリゴン指紋照合
 *   pinnedName    : 比較県名（◆ラベル表示用）
 *   fadedKeys     : Set | null — ドメインレンズ退色対象 key（該当花弁 opacity .15）
 *   onHoverChapter: (key|null)=>void — 単一 onMouseMove の atan2 セクタ判定で発火
 *   onSelectChapter: (key)=>void — click（=行展開の既存文法）
 *   hoveredKey    : 外部同期用の現在ホバー章 key | null
 *   yearBadge     : {label, color} 必須。無ければ描画せず console.warn（PrefStrip47 と同規約）
 *   mob           : bool — 280px相当へ縮小・リム数字非表示・花弁幅9px・モーフ瞬時切替
 *
 * スケール: r = r0 + 46.7·log2(ratio/100)、クランプ[28,140]。
 * クランプ時は先端に小シェブロンで「振り切れ」を明示（値を捏造しない）。
 * 超過=外側 rose（#e05c7a→#9f1239 の2段）/ 未満=内側 indigo（#6366f1→#4338ca の2段）。
 * ⚠small章はハッチ＋低彩度で像に参加させつつ数値主張させない。ratio=null は極小グレースタブ。
 * 内蔵ツールチップは持たない（親が行リスト側と統合ツールチップを出す）。
 *
 * ── モバイル タッチ2段階（情報→展開）の設計メモ ──
 *   1タップ目 = セクタ選択の情報表示（onHoverChapter 発火 → 親の固定情報バー）
 *   2タップ目（同じ章を再タップ）= 展開（onSelectChapter 発火）
 */

const VB = 340;          // viewBox 一辺
const CX = 170, CY = 170;
const R0 = 70;           // 基準円 = 全国100%
const K = 46.7;          // log2 スケール係数
const R_MIN = 28, R_MAX = 140;
const R_RIM = 152;       // 章ローマ数字リム
const N_FALLBACK = 21;

const ROSE_LIGHT = '#e05c7a';
const ROSE_DARK = '#9f1239';
const INDIGO_LIGHT = '#6366f1';   // #818cf8 は全国平均線 #2563EB と近接のため使わない
const INDIGO_DARK = '#4338ca';
const PIN = '#f97316';
const BASE_RING = '#cbd5e1';
const STUB = '#e2e8f0';
const TEXT = '#475569';
const FAINT = '#94a3b8';
const HI = '#1e293b';

// 2段グラデ: |log2(ratio/100)| が ×1.5(≈0.585) を超えたら濃色
function petalFill(ratio, small, over, pid) {
  if (ratio == null) return STUB;
  if (small) return `url(#${pid}-hatch-${over ? 'rose' : 'indigo'})`;
  const t = Math.abs(Math.log2(ratio / 100));
  const strong = t >= 0.585;
  return over ? (strong ? ROSE_DARK : ROSE_LIGHT) : (strong ? INDIGO_DARK : INDIGO_LIGHT);
}

function radiusOf(ratio) {
  if (ratio == null || !isFinite(ratio) || ratio <= 0) return null;
  const r = R0 + K * Math.log2(ratio / 100);
  return Math.max(R_MIN, Math.min(R_MAX, r));
}

export default function PsIris({
  items,
  prefName,
  modeLabel,
  pinnedRatios = null,
  pinnedName = null,
  fadedKeys = null,
  onHoverChapter,
  onSelectChapter,
  hoveredKey = null,
  yearBadge,
  mob = false,
}) {
  // ── hooks（順序固定のため yearBadge ガードより前に全て宣言） ──
  const pid = useId().replace(/[:]/g, '');
  const svgRef = useRef(null);
  const warnedRef = useRef(false);
  const lastHoverRef = useRef(null);
  const lastTapRef = useRef(null); // mob 2段階タップの1回目記憶
  const [localHover, setLocalHover] = useState(null);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  }, []);

  const list = Array.isArray(items) ? items : [];
  const n = list.length || N_FALLBACK;

  // 章 i の固定角（章番号順）: i*360/n − 90°（=真上スタート・時計回り）
  const geo = useMemo(() => list.map((it, i) => {
    const rotDeg = i * 360 / n;                     // group rotate（未回転rectは真上向き）
    const rad = (rotDeg - 90) * Math.PI / 180;      // 実座標角
    const rr = radiusOf(it.ratio);
    const over = it.ratio != null && it.ratio >= 100;
    const clampHi = rr === R_MAX;
    const clampLo = rr === R_MIN;
    // 花弁は基準円から先端まで（超過=外へ / 未満=内へ）。null章は基準円上の極小スタブ。
    const rOuter = rr == null ? R0 + 4 : Math.max(rr, R0);
    const rInner = rr == null ? R0 - 4 : Math.min(rr, R0);
    return {
      ...it, i, rotDeg, rad, r: rr, over, clampHi, clampLo,
      y: CY - rOuter,
      h: Math.max(1.5, rOuter - rInner),
      tipX: CX + (rr == null ? R0 : rr) * Math.cos(rad),
      tipY: CY + (rr == null ? R0 : rr) * Math.sin(rad),
      rimX: CX + R_RIM * Math.cos(rad),
      rimY: CY + R_RIM * Math.sin(rad),
    };
  }), [list, n]);

  // ── yearBadge ガード（全 hook 宣言後に return / PrefStrip47 と同規約） ──
  if (!yearBadge || !yearBadge.label) {
    if (!warnedRef.current) {
      warnedRef.current = true;
      if (typeof console !== 'undefined') {
        console.warn('PsIris: yearBadge（必須 {label,color}）が無いため描画しません。', { prefName, modeLabel });
      }
    }
    return null;
  }
  if (list.length === 0) return null;

  const badgeColor = yearBadge.color || '#64748b';
  const petalW = mob ? 9 : 11;
  const morph = (mob || reducedMotion)
    ? 'none'                                          // mob/reduced-motion は瞬時切替に無害劣化
    : 'y 400ms cubic-bezier(.4,0,.2,1), height 400ms cubic-bezier(.4,0,.2,1), fill 400ms cubic-bezier(.4,0,.2,1)';

  // ── 単一 onMouseMove の atan2 セクタ判定（21分割・circle個別リスナー回避） ──
  const sectorKeyFromEvent = (e) => {
    const el = svgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return null;
    const scale = VB / rect.width;
    const mx = (e.clientX - rect.left) * scale;
    const my = (e.clientY - rect.top) * scale;
    const dx = mx - CX, dy = my - CY;
    const dist = Math.hypot(dx, dy);
    if (dist < 20 || dist > VB / 2) return null;      // 中心ラベル圏・盤外は非該当
    const deg = Math.atan2(dy, dx) * 180 / Math.PI;   // -180..180（0=右）
    const norm = (((deg + 90) % 360) + 360) % 360;    // 真上=0 に正規化
    const idx = Math.round(norm / (360 / n)) % n;
    return list[idx] ? list[idx].key : null;
  };

  const emitHover = (key) => {
    if (lastHoverRef.current !== key) {
      lastHoverRef.current = key;
      if (typeof onHoverChapter === 'function') onHoverChapter(key);
    }
  };

  const handleMove = (e) => {
    const key = sectorKeyFromEvent(e);
    setLocalHover(key);
    emitHover(key);
  };

  const handleLeave = () => {
    setLocalHover(null);
    emitHover(null);
  };

  const handleClick = (e) => {
    const key = sectorKeyFromEvent(e);
    if (key == null) return;
    if (mob) {
      // ── タッチ2段階: 1タップ目=情報（onHoverChapter）→ 同章再タップ=展開（onSelectChapter） ──
      if (lastTapRef.current === key) {
        lastTapRef.current = null;
        if (typeof onSelectChapter === 'function') onSelectChapter(key);
      } else {
        lastTapRef.current = key;
        setLocalHover(key);
        emitHover(key);
      }
    } else {
      if (typeof onSelectChapter === 'function') onSelectChapter(key);
    }
  };

  // 同期点灯対象（ローカルhover優先 → 外部 hoveredKey）
  const litKey = localHover != null ? localHover : hoveredKey;
  const lit = litKey != null ? geo.find((g) => g.key === litKey) : null;

  // ピン照合ポリゴン（比較県 ratio ベクトルの花弁先端を結ぶ / null章は基準円上）
  const pinPts = (Array.isArray(pinnedRatios) && pinnedRatios.length === list.length)
    ? geo.map((g, i) => {
        const rp = radiusOf(pinnedRatios[i]);
        const rr = rp == null ? R0 : rp;
        return `${(CX + rr * Math.cos(g.rad)).toFixed(1)},${(CY + rr * Math.sin(g.rad)).toFixed(1)}`;
      }).join(' ')
    : null;

  const hatch = (id, bg, line) => (
    <pattern id={id} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={5} height={5} fill={bg} />
      <line x1={0} y1={0} x2={0} y2={5} stroke={line} strokeWidth={2} />
    </pattern>
  );

  const legendSw = (color) => (
    <svg width={10} height={10} style={{ flexShrink: 0 }}><rect x={1} y={1} width={8} height={8} rx={2} fill={color} /></svg>
  );

  return (
    <div style={{ width: '100%', maxWidth: mob ? 280 : VB, margin: '0 auto' }}>
      <div style={{ position: 'relative', width: '100%' }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB} ${VB}`}
          style={{ width: '100%', height: 'auto', display: 'block', cursor: 'pointer', touchAction: 'manipulation' }}
          role="img"
          aria-label={`受療率フィンガープリント虹彩 ${prefName || ''} ${modeLabel || ''}（対全国比・${yearBadge.label}）`}
          onMouseMove={mob ? undefined : handleMove}
          onMouseLeave={mob ? undefined : handleLeave}
          onClick={handleClick}
        >
          <defs>
            {/* ⚠small章: 低彩度ハッチ（像に参加させつつ数値主張させない） */}
            {hatch(`${pid}-hatch-rose`, '#f3dade', '#c9909d')}
            {hatch(`${pid}-hatch-indigo`, '#dcdcf0', '#9c9cc9')}
          </defs>

          {/* 基準円 = 全国100%（破線） */}
          <circle cx={CX} cy={CY} r={R0} fill="none" stroke={BASE_RING} strokeWidth={1} strokeDasharray="3 3" />

          {/* 花弁（章番号順固定角・y/height/fill CSSモーフ） */}
          {geo.map((g) => {
            const isLit = litKey != null && g.key === litKey;
            const faded = fadedKeys && typeof fadedKeys.has === 'function' && fadedKeys.has(g.key);
            const fill = petalFill(g.ratio, g.small, g.over, pid);
            return (
              <g key={g.key} transform={`rotate(${g.rotDeg} ${CX} ${CY})`}
                 style={{ opacity: faded ? 0.15 : 1, transition: 'opacity 200ms' }}>
                <rect
                  x={CX - petalW / 2}
                  y={g.y}
                  width={petalW}
                  height={g.h}
                  rx={2}
                  fill={fill}
                  stroke={isLit ? HI : 'none'}
                  strokeWidth={isLit ? 1.2 : 0}
                  style={{ y: g.y, height: g.h, fill, transition: morph, filter: isLit ? 'brightness(1.15)' : 'none' }}
                />
                {/* クランプ時シェブロン=「振り切れ」明示（値を捏造しない・実値はリスト側） */}
                {g.clampHi && (
                  <path d={`M ${CX - 4.5} ${CY - R_MAX - 4} L ${CX} ${CY - R_MAX - 9} L ${CX + 4.5} ${CY - R_MAX - 4}`}
                        fill="none" stroke={g.small ? '#c9909d' : ROSE_DARK} strokeWidth={1.4} strokeLinecap="round" />
                )}
                {g.clampLo && (
                  <path d={`M ${CX - 4.5} ${CY - R_MIN + 4} L ${CX} ${CY - R_MIN + 9} L ${CX + 4.5} ${CY - R_MIN + 4}`}
                        fill="none" stroke={g.small ? '#9c9cc9' : INDIGO_DARK} strokeWidth={1.4} strokeLinecap="round" />
                )}
              </g>
            );
          })}

          {/* ホバー同期リング（花弁先端） */}
          {lit && (
            <circle cx={lit.tipX} cy={lit.tipY} r={petalW / 2 + 3} fill="none" stroke={HI} strokeWidth={1.4} opacity={0.85} />
          )}

          {/* ピン照合ポリゴン（◆比較県の指紋輪郭） */}
          {pinPts && (
            <polygon points={pinPts} fill="none" stroke={PIN} strokeWidth={1.6}
                     strokeLinejoin="round" opacity={0.9} style={{ transition: 'opacity 400ms' }} />
          )}
          {pinPts && pinnedName && (
            <text x={VB - 6} y={13} fontSize={9} fontWeight={700} fill={PIN} textAnchor="end">◆{pinnedName}</text>
          )}

          {/* リム章ローマ数字（mob 非表示） */}
          {!mob && geo.map((g) => (
            <text key={`rim-${g.key}`} x={g.rimX} y={g.rimY + 2.5}
                  fontSize={8} fontWeight={litKey === g.key ? 700 : 500}
                  fill={litKey === g.key ? HI : FAINT} textAnchor="middle">
              {g.rom}
            </text>
          ))}

          {/* 中心: 県名 + 入院/外来 */}
          <text x={CX} y={CY - 2} fontSize={13} fontWeight={700} fill={HI} textAnchor="middle">{prefName}</text>
          <text x={CX} y={CY + 12} fontSize={10} fontWeight={600} fill={ROSE_DARK} textAnchor="middle">{modeLabel}</text>
        </svg>

        {/* 年度バッジ（右下常設） */}
        <span style={{
          position: 'absolute', right: 2, bottom: 2, fontSize: 8, fontWeight: 700,
          padding: '0 4px', borderRadius: 4, color: badgeColor,
          background: badgeColor + '1a', border: `1px solid ${badgeColor}33`,
          whiteSpace: 'nowrap', lineHeight: 1.4, pointerEvents: 'none',
        }}>
          {yearBadge.label}
        </span>
      </div>

      {/* 凡例1行 + 正確性ガードレール文言 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
        gap: mob ? 6 : 10, fontSize: 9, color: FAINT, marginTop: 4, lineHeight: 1.5,
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{legendSw(ROSE_LIGHT)}外=高い</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{legendSw(INDIGO_LIGHT)}内=低い</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <svg width={14} height={10} style={{ flexShrink: 0 }}><line x1={1} y1={5} x2={13} y2={5} stroke={BASE_RING} strokeWidth={1.4} strokeDasharray="3 2" /></svg>
          破線=全国100%
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{legendSw(`url(#${pid}-hatch-rose)`)}網掛=⚠標本誤差</span>
        <span style={{ fontWeight: 600 }}>※高低は良し悪しではありません</span>
      </div>
    </div>
  );
}
