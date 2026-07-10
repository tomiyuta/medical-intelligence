'use client';
// ══════════════════════════════════════════════════════════════════
// SelectionContext — MedIntel「共有分析状態」の単一ソース (keystone)
//   view / pref / pinnedPref / pinnedAreaCode / reportCode / futureYear
//   / domain / hoverPref を一箇所で保持し、全ビューが横断参照する。
//   URL 同期は useUrlSync() が担当（?v&pref&pin&year&code&domain / popstate）。
//   ★旧 ?v=&pref=&code= リンクは新パラメータ追加後も同一画面に着地（後方互換）。
// ══════════════════════════════════════════════════════════════════
import { createContext, useContext, useState, useEffect, useRef } from 'react';

// 既定値（従来 page.js の useState 初期値と一致させる＝挙動不変）
const DEFAULTS = {
  view: 'map',
  pref: '東京都',
  futureYear: '2025',
};

const SelectionContext = createContext(null);

export function SelectionProvider({ children }) {
  const [view, setView] = useState(DEFAULTS.view);
  const [pref, setPref] = useState(DEFAULTS.pref);          // 旧 globalPref（5ビュー共有）
  const [pinnedPref, setPinnedPref] = useState(null);      // ◆比較ピン県（ビュー横断で持ち回り）
  const [pinnedAreaCode, setPinnedAreaCode] = useState(null); // 圏ピン（AreaStrip330・pref|area キー）
  const [reportCode, setReportCode] = useState(null);      // カルテ選択圏コード（URL 永続）
  const [futureYear, setFutureYear] = useState(DEFAULTS.futureYear); // 将来推計の単一年軸
  const [domain, setDomain] = useState(null);              // 疾患ドメインレンズ（NdbView）
  const [hoverPref, setHoverPref] = useState(null);        // ストリップ hover 同期（transient）

  const value = {
    view, setView,
    pref, setPref,
    pinnedPref, setPinnedPref,
    pinnedAreaCode, setPinnedAreaCode,
    reportCode, setReportCode,
    futureYear, setFutureYear,
    domain, setDomain,
    hoverPref, setHoverPref,
  };
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within <SelectionProvider>');
  return ctx;
}

// ── URL ⇄ SelectionContext 双方向同期フック ─────────────────────────
// (1) マウント時に ?v&pref&code&year&pin&domain を読んで復元（順序固定・後方互換）。
// (2) 変更時に URL へ書込。view/pref/code の変化＝履歴に残す遷移は pushState、
//     それ以外（year/pin/domain のみ変化＝スイープ等）は replaceState。
// (3) popstate で戻るボタン復元。
export function useUrlSync() {
  const s = useSelection();
  const [ready, setReady] = useState(false);
  const prevHist = useRef(null); // 直前の「履歴キー」= view|pref|code

  // (1)+(3) 復元 & popstate（マウント時一回）
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    // 復元順序を固定: view → pref → code → year → pin → domain
    const v = p.get('v'); if (v) s.setView(v);
    const pr = p.get('pref'); if (pr) s.setPref(pr);
    const cd = p.get('code'); if (cd) s.setReportCode(cd);
    const yr = p.get('year'); if (yr) s.setFutureYear(yr);
    const pin = p.get('pin'); if (pin) s.setPinnedPref(pin);
    const dm = p.get('domain'); if (dm) s.setDomain(dm);

    const onPop = () => {
      const q = new URLSearchParams(window.location.search);
      s.setView(q.get('v') || DEFAULTS.view);
      s.setPref(q.get('pref') || DEFAULTS.pref);
      s.setReportCode(q.get('code') || null);
      s.setFutureYear(q.get('year') || DEFAULTS.futureYear);
      s.setPinnedPref(q.get('pin') || null);
      s.setDomain(q.get('domain') || null);
    };
    window.addEventListener('popstate', onPop);
    setReady(true); // 復元 setState 反映後に (2) の書込を解禁（初回クロバー防止）
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // (2) 書込
  useEffect(() => {
    if (!ready) return;
    const p = new URLSearchParams(window.location.search); // 既存の未知パラメータは温存
    p.set('v', s.view);
    p.set('pref', s.pref);
    if (s.reportCode) p.set('code', s.reportCode); else p.delete('code');
    // year は既定(2025)なら省略＝旧 URL 互換・クリーンさ維持
    if (s.futureYear && s.futureYear !== DEFAULTS.futureYear) p.set('year', s.futureYear); else p.delete('year');
    if (s.pinnedPref) p.set('pin', s.pinnedPref); else p.delete('pin');
    if (s.domain) p.set('domain', s.domain); else p.delete('domain');
    const url = '?' + p.toString();

    const histKey = s.view + '|' + s.pref + '|' + (s.reportCode || '');
    if (prevHist.current === null || prevHist.current === histKey) {
      window.history.replaceState(null, '', url); // 初回 or 履歴非該当（year/pin/domain 変化）
    } else {
      window.history.pushState(null, '', url);    // view/pref/code 遷移＝履歴に残す
    }
    prevHist.current = histKey;
  }, [ready, s.view, s.pref, s.reportCode, s.futureYear, s.pinnedPref, s.domain]);
}
