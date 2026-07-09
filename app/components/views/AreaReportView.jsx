'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { sortPrefs } from '../shared';
import HsaBedDetailPanel from './HsaBedDetailPanel';
import HsaPhysicianPanel from './HsaPhysicianPanel';
import HsaEmergencyPanel from './HsaEmergencyPanel';
import HsaDpcPanel from './HsaDpcPanel';
import HsaPopulationPanel from './HsaPopulationPanel';
import HsaDemandPanel from './HsaDemandPanel';
import HsaCarePanel from './HsaCarePanel';
import HsaOverviewPanel from './HsaOverviewPanel';
import HsaSpecialtyPanel from './HsaSpecialtyPanel';
import HsaHomecarePanel from './HsaHomecarePanel';
import HsaSurgeryPanel from './HsaSurgeryPanel';
import HsaInpatientPanel from './HsaInpatientPanel';
import HsaDesignationPanel from './HsaDesignationPanel';
import HsaHospTrendPanel from './HsaHospTrendPanel';
import HsaDpcTrendPanel from './HsaDpcTrendPanel';
import { HsaAreaProvider } from '../hsa/useHsaArea';
import HsaSummaryCards from '../hsa/HsaSummaryCards';

function ChapterHead({ idx, name }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 2px 10px' }}>
      <span style={{ width: 4, height: 18, borderRadius: 2, background: CH_COLOR[idx] || '#64748b' }} />
      <span style={{ fontSize: 15, fontWeight: 700, color: '#334155', letterSpacing: '-0.01em' }}>{name}</span>
    </div>
  );
}

// PDF由来フォント名 → ローカル日本語フォントへのエイリアス。
// SVGテキストは各グリフ絶対座標配置のため、字幅差があってもレイアウトは崩れない。
const FONT_ALIAS_CSS = `
@font-face{font-family:'MeiryoUI';src:local('Hiragino Sans'),local('Hiragino Kaku Gothic ProN'),local('Yu Gothic Medium'),local('Noto Sans JP');font-display:swap}
@font-face{font-family:'Meiryo';src:local('Hiragino Sans'),local('Hiragino Kaku Gothic ProN'),local('Yu Gothic'),local('Noto Sans JP');font-display:swap}
@font-face{font-family:'YuMincho';src:local('Hiragino Mincho ProN'),local('YuMincho'),local('Yu Mincho'),local('Noto Serif JP');font-display:swap}
@font-face{font-family:'ArialMT';src:local('Arial'),local('Helvetica Neue'),local('Helvetica')}
@font-face{font-family:'TimesNewRomanPSMT';src:local('Times New Roman'),local('Times'),local('Georgia')}
.hsa-slide-svg svg{width:100%!important;height:auto!important;display:block}
`;

const CH_COLOR = ['#64748b', '#2563EB', '#0891b2', '#7c3aed', '#059669'];

// ── 1スライド（IntersectionObserverで遅延読込＋アクティブ判定）──
function Slide({ code, page, title, chapterIdx, slideRef, onActive }) {
  const holderRef = useRef(null);
  const [svg, setSvg] = useState(null);
  const [err, setErr] = useState(false);

  // 近接で読込
  useEffect(() => {
    const el = holderRef.current;
    if (!el || svg) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        io.disconnect();
        fetch(`/api/hsa/slide?code=${code}&page=${page}`)
          .then(r => r.ok ? r.text() : Promise.reject(r.status))
          .then(setSvg).catch(() => setErr(true));
      }
    }, { rootMargin: '700px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [code, page, svg]);

  // 中央帯に入ったらアクティブ
  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) onActive(page);
    }, { rootMargin: '-45% 0px -50% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [page, onActive]);

  // SVG注入後、レスポンシブ化（width/height属性を除去しviewBoxで拡縮）
  const injectRef = useCallback((node) => {
    if (node && svg) {
      node.innerHTML = svg;
      const s = node.querySelector('svg');
      if (s) { s.removeAttribute('width'); s.removeAttribute('height'); }
    }
  }, [svg]);

  return (
    <div ref={(n) => { holderRef.current = n; if (slideRef) slideRef(n); }}
         data-page={page}
         style={{ scrollMarginTop: 12, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, paddingLeft: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: CH_COLOR[chapterIdx] || '#64748b',
                       fontVariantNumeric: 'tabular-nums', minWidth: 30 }}>P.{page}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#475569' }}>{title}</span>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 10,
                    overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
        {svg ? (
          <div ref={injectRef} className="hsa-slide-svg" />
        ) : (
          <div style={{ aspectRatio: '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: err ? '#ef4444' : '#cbd5e1', fontSize: 12,
                        background: err ? '#fef2f2' : 'repeating-linear-gradient(45deg,#fbfcfd,#fbfcfd 10px,#f6f8fa 10px,#f6f8fa 20px)' }}>
            {err ? '読込エラー' : '読込中…'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AreaReportView({ mob, globalPref, setGlobalPref, initialCode, onInitialCodeConsumed, setView }) {
  const [ready, setReady] = useState(null);       // null=loading, false=未抽出, true=ok
  const [areas, setAreas] = useState([]);          // 軽量一覧
  const [prefectures, setPrefectures] = useState([]);
  const [meta, setMeta] = useState(null);          // 選択圏の全スライド
  const [code, setCode] = useState(null);          // 選択圏コード
  const [activePage, setActivePage] = useState(1);
  const [source, setSource] = useState('');

  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchScope, setSearchScope] = useState('all'); // all | pref

  const slideNodes = useRef({});   // page -> DOM node
  const pendingScroll = useRef(null);

  // 初期ロード（軽量一覧）
  useEffect(() => {
    fetch('/api/hsa/manifest').then(r => r.json()).then(d => {
      setReady(d.ready);
      if (!d.ready) return;
      setAreas(d.areas || []);
      setPrefectures(d.prefectures || []);
      setSource(d.source || '');
    }).catch(() => setReady(false));
  }, []);

  // 都道府県内の圏域
  const areasInPref = useMemo(
    () => areas.filter(a => a.pref === globalPref),
    [areas, globalPref]);

  // 圏一覧(AreaView)からのディープリンク: initialCode が指定されていれば最優先で当該圏を開く
  useEffect(() => {
    if (initialCode && areas.some(a => a.code === initialCode)) {
      setCode(initialCode);
      if (onInitialCodeConsumed) onInitialCodeConsumed();
    }
  }, [initialCode, areas]); // eslint-disable-line

  // 県が変わったら先頭圏を選択(ただし initialCode 指定中はそれを尊重)
  useEffect(() => {
    if (initialCode && areas.some(a => a.code === initialCode)) return;
    if (!areasInPref.length) { setCode(null); return; }
    if (!areasInPref.some(a => a.code === code)) setCode(areasInPref[0].code);
  }, [areasInPref]); // eslint-disable-line

  // 圏が変わったら全スライドメタ取得
  useEffect(() => {
    if (!code) { setMeta(null); return; }
    setMeta(null); slideNodes.current = {};
    fetch(`/api/hsa/manifest?code=${code}`).then(r => r.json()).then(d => {
      setMeta(d.area || null);
      setActivePage(1);
    });
  }, [code]);

  // meta（スライド）描画完了後に、検索ジャンプ待ちがあればスクロール／無ければ先頭へ
  useEffect(() => {
    if (!meta) return;
    if (pendingScroll.current != null) {
      const p = pendingScroll.current; pendingScroll.current = null;
      // ノードがcommitされるまで最大40フレーム再試行（別圏ジャンプ時のタイミング差を吸収）
      let tries = 0;
      const attempt = () => {
        const node = slideNodes.current[p];
        if (node) node.scrollIntoView({ behavior: 'auto', block: 'start' });
        else if (tries++ < 40) requestAnimationFrame(attempt);
      };
      requestAnimationFrame(attempt);
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [meta]);

  const scrollToPage = (p, smooth = true) => {
    const node = slideNodes.current[p];
    if (node) node.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  };

  const onActive = useCallback((p) => setActivePage(p), []);

  // 章グループ（早期returnより前で必ず呼ぶ＝フック順序固定）
  const slidesByCh = useMemoGroups(meta);
  const chapters = meta?.chapters || [];

  const runSearch = () => {
    const term = q.trim();
    if (!term) { setResults(null); return; }
    setSearching(true);
    const scope = searchScope === 'pref' ? `&pref=${encodeURIComponent(globalPref)}` : '';
    fetch(`/api/hsa/search?q=${encodeURIComponent(term)}${scope}`).then(r => r.json()).then(d => {
      setResults(d); setSearching(false);
    }).catch(() => setSearching(false));
  };

  const jumpTo = (r) => {
    setResults(null); setQ('');
    const target = areas.find(a => a.code === r.code);
    if (target && target.pref !== globalPref) setGlobalPref(target.pref);
    if (r.code === code) {
      scrollToPage(r.n);
    } else {
      pendingScroll.current = r.n;
      setCode(r.code);
    }
  };

  // ── 未抽出 / ローディング ──
  if (ready === null) return <div style={{ padding: 40, color: '#94a3b8' }}>読み込み中…</div>;
  if (ready === false) return (
    <div style={{ padding: 32, background: '#fff', border: '1px solid #f0f0f0', borderRadius: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>医療圏カルテは未抽出です</div>
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.8 }}>
        330の二次医療圏レポート（医療需給総覧）をローカルに反映するには、抽出スクリプトを一度実行してください：<br />
        <code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>python3 scripts/extract_hsa_svg.py</code>
      </p>
    </div>
  );

  return <>
    <style dangerouslySetInnerHTML={{ __html: FONT_ALIAS_CSS }} />

    {/* ── 圏一覧へ戻る ── */}
    {setView && (
      <button onClick={() => setView('area')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '6px 12px',
                       borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569',
                       fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f8faff'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}>
        ◀ 医療圏一覧へ戻る
      </button>
    )}

    {/* ── ヘッダ ── */}
    <div style={{ marginBottom: 16, display: 'flex', flexDirection: mob ? 'column' : 'row',
                  justifyContent: 'space-between', alignItems: mob ? 'flex-start' : 'flex-end', gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, color: '#2563EB', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Medical Area Report</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>医療圏カルテ</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>全国330二次医療圏の地域分析レポート（各約73ページ）を圏域単位で閲覧・全文検索。</p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={globalPref} onChange={e => setGlobalPref(e.target.value)}
                style={selStyle}>
          {sortPrefs(prefectures).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={code || ''} onChange={e => setCode(e.target.value)} style={{ ...selStyle, minWidth: 160 }}>
          {areasInPref.map(a => <option key={a.code} value={a.code}>{a.area}（{a.pageCount}p）</option>)}
        </select>
      </div>
    </div>

    {/* ── 全文検索 ── */}
    <div style={{ marginBottom: 18, position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()}
               placeholder="全330圏を横断検索（例: 回復期 不足 / 医師偏在 / 救急車受入）"
               style={{ flex: 1, minWidth: 220, padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }} />
        <select value={searchScope} onChange={e => setSearchScope(e.target.value)} style={selStyle}>
          <option value="all">全国</option>
          <option value="pref">{globalPref}内</option>
        </select>
        <button onClick={runSearch} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>検索</button>
      </div>
      {results && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: '#fff',
                      border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 28px rgba(15,23,42,0.14)',
                      zIndex: 40, maxHeight: 420, overflowY: 'auto' }}>
          <div style={{ padding: '8px 14px', fontSize: 11, color: '#94a3b8', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
            <span>{searching ? '検索中…' : `${results.total}件ヒット「${results.q}」`}</span>
            <span onClick={() => setResults(null)} style={{ cursor: 'pointer', color: '#cbd5e1' }}>✕ 閉じる</span>
          </div>
          {results.results?.map((r, i) => (
            <div key={i} onClick={() => jumpTo(r)}
                 style={{ padding: '9px 14px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', fontSize: 12.5 }}
                 onMouseEnter={e => e.currentTarget.style.background = '#f8faff'}
                 onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontWeight: 700, color: '#2563EB' }}>{r.pref} {r.area}</span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>P.{r.n}</span>
                <span style={{ color: '#475569' }}>{r.title}</span>
              </div>
              <div style={{ color: '#94a3b8', marginTop: 2, lineHeight: 1.5 }}>{r.snippet}</div>
            </div>
          ))}
          {results.total === 0 && !searching && <div style={{ padding: 16, fontSize: 12, color: '#94a3b8' }}>該当なし</div>}
        </div>
      )}
    </div>

    {/* ── 本体：左レール（章・スライド）＋ スライドビューア ── */}
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
      {!mob && (
        <aside style={{ width: 234, flexShrink: 0, position: 'sticky', top: 0, maxHeight: '92vh', overflowY: 'auto',
                        background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, padding: '12px 6px' }}>
          {meta ? slidesByCh.map(({ idx, name, items }) => (
            <div key={idx} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px 4px' }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: CH_COLOR[idx] || '#64748b' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', letterSpacing: '0.02em' }}>{name}</span>
              </div>
              {items.map(s => (
                <button key={s.n} onClick={() => scrollToPage(s.n)}
                        style={{ display: 'flex', gap: 7, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                                 background: activePage === s.n ? '#eff6ff' : 'transparent', borderRadius: 6, padding: '5px 12px',
                                 color: activePage === s.n ? '#2563EB' : '#64748b', fontSize: 11.5, lineHeight: 1.4,
                                 fontWeight: activePage === s.n ? 600 : 400 }}>
                  <span style={{ fontVariantNumeric: 'tabular-nums', color: '#cbd5e1', minWidth: 22 }}>{s.n}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || '（無題）'}</span>
                </button>
              ))}
            </div>
          )) : <div style={{ padding: 16, fontSize: 12, color: '#cbd5e1' }}>読み込み中…</div>}
        </aside>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* モバイル用 章チップ */}
        {mob && meta && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 8 }}>
            {chapters.map(c => (
              <button key={c.idx} onClick={() => scrollToPage((slidesByCh.find(g => g.idx === c.idx)?.items[0] || {}).n)}
                      style={{ whiteSpace: 'nowrap', padding: '5px 12px', borderRadius: 16, border: '1px solid #e2e8f0',
                               background: '#fff', fontSize: 11.5, color: CH_COLOR[c.idx] || '#64748b', fontWeight: 600, cursor: 'pointer' }}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {meta && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>{meta.pref} {meta.area}医療圏</span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>医療圏コード {meta.code} ｜ {meta.pageCount}ページ</span>
          </div>
        )}

        {/* ネイティブ再構築パネル（1リクエストで全パネル取得・章別グルーピング） */}
        {meta && (
          <HsaAreaProvider code={meta.code}>
            <HsaSummaryCards mob={mob} />
            <ChapterHead idx={1} name="1. 地域の概況" />
            <HsaOverviewPanel mob={mob} />
            <HsaPopulationPanel mob={mob} />
            <HsaPhysicianPanel mob={mob} />
            <HsaSpecialtyPanel mob={mob} />
            <HsaDesignationPanel mob={mob} />
            <ChapterHead idx={2} name="2. 医療提供体制" />
            <HsaBedDetailPanel mob={mob} />
            <HsaInpatientPanel mob={mob} />
            <HsaHospTrendPanel mob={mob} />
            <HsaEmergencyPanel mob={mob} />
            <ChapterHead idx={3} name="3. 医療需要の将来推計" />
            <HsaDemandPanel mob={mob} />
            <HsaCarePanel mob={mob} />
            <HsaHomecarePanel mob={mob} />
            <HsaSurgeryPanel mob={mob} />
            <ChapterHead idx={4} name="4. パフォーマンス・連携" />
            <HsaDpcPanel mob={mob} />
            <HsaDpcTrendPanel mob={mob} />
          </HsaAreaProvider>
        )}

        {meta ? meta.slides.map(s => (
          <Slide key={s.n} code={meta.code} page={s.n} title={s.title} chapterIdx={s.chapterIdx}
                 slideRef={(n) => { if (n) slideNodes.current[s.n] = n; }} onActive={onActive} />
        )) : <div style={{ padding: 40, color: '#cbd5e1', fontSize: 13 }}>スライドを読み込み中…</div>}

        <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.7, marginTop: 8, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
          出典元：医療需給総覧（{meta?.pref}{meta?.area}医療圏）（株式会社日本経営）<br />
          各ページ下部記載の公表データを用いて株式会社日本経営が作成。本ビューは個人確認用にローカル反映したものです。
        </div>
      </div>
    </div>
  </>;
}

// 章ごとにスライドをグループ化（フックのルール順序を守るため関数化）
function useMemoGroups(meta) {
  return useMemo(() => {
    if (!meta) return [];
    const map = new Map();
    for (const c of meta.chapters) map.set(c.idx, { idx: c.idx, name: c.name, items: [] });
    for (const s of meta.slides) {
      if (!map.has(s.chapterIdx)) map.set(s.chapterIdx, { idx: s.chapterIdx, name: s.chapter, items: [] });
      map.get(s.chapterIdx).items.push(s);
    }
    return [...map.values()].sort((a, b) => a.idx - b.idx);
  }, [meta]);
}

const selStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', cursor: 'pointer' };
