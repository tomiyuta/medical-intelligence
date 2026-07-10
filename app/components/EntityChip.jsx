'use client';
// ══════════════════════════════════════════════════════════════════
// EntityChip — どこでもエンティティカード（有機的接続lens）
//   県名 / 圏名を包み、hover（モバイルは長押し/タップ）で popover ミニ
//   プロファイルを表示する。データは全て page.js で既ロード済み（useData の
//   モジュールキャッシュ共有）＝追加 fetch なし。
//
//   popover 内容:
//     ・県 (name)   : 人口 / 高齢化率75+ / 総病床 / 死因top3 / 2050人口増減
//     ・圏 (code)   : 圏人口 / 高齢化率65+ / 所属県（圏別は住基のみ既取得）
//   アクション: ◆ピン / →医療プロファイル or →カルテ / →県プロファイル
//     （全て SelectionContext.navigate() でビュー横断遷移）
//
//   ★実装上の注意:
//     ・popover は createPortal で <body> 直下へ描画＝親の overflow/z-index に
//       影響されない。position:fixed + getBoundingClientRect で追従。
//     ・グローバルに 1 つだけ開く（custom event 'medintel:entitychip-open'）。
//     ・モバイル誤タップ回避: click でトグル、hover はポインタ環境のみ。
//
//   ★正確性ガードレール:
//     ・値は既取得データそのまま。高低=良し悪しと断定しない（ことばを付けない）。
//     ・各値に出典年度バッジ。死因は粗死亡率（年齢調整前）と明示。
//     ・圏の高齢化率は 65+（住基）、県は 75+（年齢ピラミッド）で基準が異なるため
//       それぞれラベルに基準年齢を明記。
//
//   props:
//     name  : string  県名（都道府県）→ 県プロファイル
//     code  : string  圏キー "pref|area"（AreaView r.code と同一）→ 圏プロファイル
//     children : ReactNode  ラベル表示（未指定なら name / 圏名）
//     as    : 'span'|'inline'  既定 'span'（下線付きトリガ）
//     style : object  トリガの追加スタイル
// ══════════════════════════════════════════════════════════════════
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSelection } from './SelectionContext';
import { useData } from '../../lib/dataClient';
import { getSourceBadge } from '../../lib/sourceRegistry';

// ── フォーマッタ ──
const fInt = (v) => (v == null || !isFinite(v)) ? '—' : Math.round(v).toLocaleString();
const f1 = (v) => (v == null || !isFinite(v)) ? '—' : v.toFixed(1);
const fPct = (v) => (v == null || !isFinite(v)) ? '—' : (v > 0 ? '+' : '') + v.toFixed(1);
const sumFrom = (arr, from = 0) => (arr || []).slice(from).reduce((s, x) => s + (x || 0), 0);

// グローバル単一 open 用のユニーク id 発番
let _seq = 0;
const OPEN_EVENT = 'medintel:entitychip-open';

// 出典バッジ（小）
function YearBadge({ srcKey }) {
  const b = getSourceBadge(srcKey);
  return (
    <span title={b.title} style={{
      fontSize: 8.5, fontWeight: 700, padding: '0px 5px', borderRadius: 4,
      background: b.bg, color: b.color, border: '1px solid ' + b.border, flexShrink: 0,
    }}>{b.year}</span>
  );
}

// 値行
function Row({ label, value, unit, srcKey, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '4px 0', borderTop: '1px solid #f4f4f6' }}>
      <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>{label}</span>
      {srcKey && <YearBadge srcKey={srcKey} />}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {unit && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{unit}</span>}
      </span>
      {note && <span style={{ fontSize: 8.5, color: '#0891b2', fontWeight: 600, flexShrink: 0, marginLeft: 4 }}>{note}</span>}
    </div>
  );
}

export default function EntityChip({ name, code, children, as = 'span', style }) {
  const { navigate, setPinnedPref, setPinnedAreaCode, pinnedPref, pinnedAreaCode } = useSelection();
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = ++_seq;
  const myId = idRef.current;

  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const openT = useRef(null);
  const closeT = useRef(null);

  // 既取得データ（useData モジュールキャッシュ共有＝新規 fetch なし）
  const agePyramid = useData('/api/age-pyramid');
  const bedFunc = useData('/api/bed-function');
  const vitalStats = useData('/api/vital-statistics');
  const futureDemo = useData('/api/future-demographics');
  const areaDemo = useData('/api/area-demographics');
  const manifest = useData('/api/hsa/manifest');

  const isArea = code != null && name == null;

  // ── プロファイル算出（純関数・欠測は null＝「—」）──
  const profile = useMemo(() => {
    if (isArea) {
      // code = "pref|area"
      const [aPref, aArea] = String(code).split('|');
      let pop = null, p65 = null, karte = null;
      const rows = areaDemo?.data;
      if (Array.isArray(rows)) {
        const hit = rows.find((a) => a.pref === aPref && a.area === aArea);
        if (hit) {
          pop = 0; p65 = 0;
          for (const mu of (hit.munis || [])) { pop += mu.pop || 0; p65 += mu.p65 || 0; }
        }
      }
      const areas = manifest?.ready ? manifest.areas : null;
      if (Array.isArray(areas)) {
        const m = areas.find((a) => a.pref === aPref && a.area === aArea);
        if (m) karte = m.code;
      }
      return {
        kind: 'area', title: aArea + '医療圏', sub: aPref, pref: aPref, karte,
        pop, aging65: (pop && pop > 0) ? p65 / pop * 100 : null,
      };
    }
    // 県プロファイル
    const n = name;
    let pop = null, p75 = null, beds = null, pop2050 = null;
    let top3 = [];
    const ap = agePyramid?.prefectures?.[n];
    if (ap) { pop = sumFrom(ap.male) + sumFrom(ap.female); p75 = sumFrom(ap.male, 15) + sumFrom(ap.female, 15); }
    const bf = bedFunc?.prefectures?.[n];
    if (bf) beds = bf['総床数'] ?? null;
    const vp = vitalStats?.prefectures?.find((p) => p.pref === n);
    if (vp && Array.isArray(vp.causes)) {
      top3 = [...vp.causes].filter((c) => c.rate != null).sort((a, b) => b.rate - a.rate).slice(0, 3);
    }
    const fdRows = futureDemo?.prefectures;
    if (Array.isArray(fdRows)) {
      const fr = fdRows.find((x) => x.pref === n && !x.city);
      const a = fr?.total_pop?.['2025'], b = fr?.total_pop?.['2050'];
      if (a && b) pop2050 = (b / a - 1) * 100;
    }
    return {
      kind: 'pref', title: n, sub: null, pref: n,
      pop, aging75: (pop && pop > 0) ? p75 / pop * 100 : null, beds, top3, pop2050,
    };
  }, [isArea, code, name, agePyramid, bedFunc, vitalStats, futureDemo, areaDemo, manifest]);

  const isPinned = isArea ? (pinnedAreaCode === code) : (pinnedPref === profile.pref);

  // ── 位置計算（fixed・ビューポートにクランプ）──
  const computePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const W = 264, vw = window.innerWidth, vh = window.innerHeight;
    let left = r.left;
    if (left + W > vw - 8) left = vw - W - 8;
    if (left < 8) left = 8;
    // 下に十分な余白があれば下、無ければ上
    const below = r.bottom + 6;
    const placeBelow = (vh - r.bottom) > 240 || r.top < 240;
    return { left, top: placeBelow ? below : undefined, bottom: placeBelow ? undefined : (vh - r.top + 6), width: W };
  }, []);

  const doOpen = useCallback(() => {
    setPos(computePos());
    setOpen(true);
    try { window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: myId })); } catch { /* no-op */ }
  }, [computePos, myId]);

  const doClose = useCallback(() => setOpen(false), []);

  // 他チップが開いたら閉じる（グローバル単一 open）
  useEffect(() => {
    const onOther = (e) => { if (e.detail !== myId) setOpen(false); };
    window.addEventListener(OPEN_EVENT, onOther);
    return () => window.removeEventListener(OPEN_EVENT, onOther);
  }, [myId]);

  // 開いた直後: 実測高さでビューポート下端クランプ（背の高い県プロファイルが
  // 画面外へはみ出さないよう top を上方向へ寄せる）。
  useEffect(() => {
    if (!open) return;
    const el = popRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    const vh = window.innerHeight;
    setPos((p) => {
      if (!p || p.top == null) return p;                 // 上配置(bottom指定)はそのまま
      if (p.top + h <= vh - 8) return p;                 // 収まっている
      return { ...p, top: Math.max(8, vh - 8 - h) };     // 上へ寄せる
    });
  }, [open]);

  // 開いている間: スクロール/リサイズで追従、外側クリック/Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const reposition = () => setPos(computePos());
    const onDocDown = (e) => {
      const t = triggerRef.current, pop = popRef.current;
      if (t && t.contains(e.target)) return;
      if (pop && pop.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    document.addEventListener('pointerdown', onDocDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      document.removeEventListener('pointerdown', onDocDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, computePos]);

  // タイマ掃除
  useEffect(() => () => { clearTimeout(openT.current); clearTimeout(closeT.current); }, []);

  const popRef = useRef(null);

  // hover（ポインタ環境のみ・モバイルは click 経由）
  const hasHover = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover)').matches;
  const onEnter = () => {
    if (!hasHover()) return;
    clearTimeout(closeT.current);
    openT.current = setTimeout(doOpen, 140);
  };
  const onLeave = () => {
    if (!hasHover()) return;
    clearTimeout(openT.current);
    closeT.current = setTimeout(doClose, 220);
  };
  const onClick = (e) => {
    e.stopPropagation();
    clearTimeout(openT.current); clearTimeout(closeT.current);
    if (open) setOpen(false); else doOpen();
  };

  // ── アクション（navigate でビュー横断遷移・popover 閉じる）──
  const go = (view, opts) => { setOpen(false); navigate(view, opts); };
  const togglePin = () => {
    if (isArea) setPinnedAreaCode(isPinned ? null : code);
    else setPinnedPref(isPinned ? null : profile.pref);
  };

  const label = children != null ? children : (isArea ? profile.title : profile.pref);

  const triggerStyle = {
    cursor: 'pointer', color: 'inherit', font: 'inherit', background: 'transparent',
    border: 'none', padding: 0, textAlign: 'inherit',
    borderBottom: '1px dotted ' + (open ? '#2563EB' : '#cbd5e1'),
    ...(style || {}),
  };

  // ── popover 本体 ──
  const popover = open && pos ? createPortal(
    <div
      ref={popRef}
      onMouseEnter={() => { if (hasHover()) clearTimeout(closeT.current); }}
      onMouseLeave={onLeave}
      role="dialog"
      style={{
        position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width,
        zIndex: 10000, background: '#fff', border: '1px solid #e6e8ec', borderRadius: 12,
        boxShadow: '0 10px 30px rgba(15,23,42,0.16)', padding: '12px 13px', boxSizing: 'border-box',
        maxHeight: 'calc(100vh - 16px)', overflowY: 'auto',
      }}
    >
      {/* ヘッダ */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: '#7c3aed', letterSpacing: '0.06em' }}>
          {isArea ? '医療圏' : '都道府県'}
        </span>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>{profile.title}</span>
        {profile.sub && <span style={{ fontSize: 11, color: '#94a3b8' }}>{profile.sub}</span>}
      </div>

      {/* 値 */}
      <div style={{ marginBottom: 8 }}>
        <Row label="人口" value={fInt(profile.pop)} unit="人" srcKey={isArea ? 'agePyramid' : 'agePyramid'} />
        {isArea ? (
          <Row label="高齢化率(65+)" value={f1(profile.aging65)} unit="%" srcKey="agePyramid" />
        ) : (
          <>
            <Row label="高齢化率(75+)" value={f1(profile.aging75)} unit="%" srcKey="agePyramid" />
            <Row label="総病床数" value={fInt(profile.beds)} unit="床" srcKey="bedFunc" />
            <Row label="2050年 人口増減" value={fPct(profile.pop2050)} unit="%" srcKey="futureDemo" note="対2025" />
            {profile.top3 && profile.top3.length > 0 && (
              <div style={{ padding: '5px 0 2px', borderTop: '1px solid #f4f4f6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: '#64748b' }}>主な死因</span>
                  <YearBadge srcKey="vitalStats" />
                  <span style={{ fontSize: 8.5, color: '#0891b2', fontWeight: 600 }}>粗率(年齢調整前)</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {profile.top3.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11 }}>
                      <span style={{ color: '#94a3b8', fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ color: '#334155' }}>{c.cause}</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{f1(c.rate)}</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>/10万</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* アクション */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button onClick={togglePin} style={actBtn(isPinned ? 'pin-on' : 'ghost')}>
          {isPinned ? '◆ ピン中' : '◆ ピン'}
        </button>
        {isArea ? (
          <>
            {profile.karte && (
              <button onClick={() => go('report', { pref: profile.pref, code: profile.karte })} style={actBtn('primary')}>
                → カルテを見る
              </button>
            )}
            <button onClick={() => go('ndb', { pref: profile.pref })} style={actBtn('ghost')}>
              → 県プロファイル
            </button>
          </>
        ) : (
          <>
            <button onClick={() => go('ndb', { pref: profile.pref })} style={actBtn('primary')}>
              → 医療プロファイル
            </button>
            <button onClick={() => go('area', { pref: profile.pref })} style={actBtn('ghost')}>
              → 圏一覧
            </button>
          </>
        )}
      </div>

      {/* ガードレール（極小） */}
      <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
        値の高低は地域差の記述であり、医療の良し悪しを意味しません。指標ごとに調査年度が異なります。
      </div>
    </div>,
    document.body
  ) : null;

  const Tag = as === 'inline' ? 'span' : 'span';
  return (
    <>
      <Tag
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } }}
        style={triggerStyle}
        title="クリックで詳細"
      >
        {label}
      </Tag>
      {popover}
    </>
  );
}

// アクションボタン スタイル
function actBtn(kind) {
  const base = {
    padding: '5px 9px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
    whiteSpace: 'nowrap', flexShrink: 0,
  };
  if (kind === 'primary') return { ...base, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#2563EB' };
  if (kind === 'pin-on') return { ...base, border: '1px solid #fdba74', background: '#fff7ed', color: '#ea580c' };
  return { ...base, border: '1px solid #e2e8f0', background: '#fff', color: '#475569' };
}
