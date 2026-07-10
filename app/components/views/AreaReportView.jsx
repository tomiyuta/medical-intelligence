'use client';
import { useState, useEffect, useMemo } from 'react';
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
import { useSelection } from '../SelectionContext';

const CH_COLOR = ['#64748b', '#2563EB', '#0891b2', '#7c3aed', '#059669'];
const selStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', cursor: 'pointer' };

const CHAPTERS = [
  { id: 'ch1', idx: 1, name: '1. 地域の概況' },
  { id: 'ch2', idx: 2, name: '2. 医療提供体制' },
  { id: 'ch3', idx: 3, name: '3. 医療需要の将来推計' },
  { id: 'ch4', idx: 4, name: '4. パフォーマンス・連携' },
];

function ChapterHead({ id, idx, name }) {
  return (
    <div id={id} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 2px 10px', scrollMarginTop: 56 }}>
      <span style={{ width: 4, height: 18, borderRadius: 2, background: CH_COLOR[idx] || '#64748b' }} />
      <span style={{ fontSize: 15, fontWeight: 700, color: '#334155', letterSpacing: '-0.01em' }}>{name}</span>
    </div>
  );
}

// 章スクロールスパイ付き sticky ナビ（click=章へジャンプ）
function ChapterNav({ active, onJump, mob }) {
  return (
    <div style={{ position: 'sticky', top: mob ? 50 : 0, zIndex: 6, margin: '0 -2px 14px', padding: '8px 2px',
                  background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                  borderBottom: '1px solid #eef2f6', display: 'flex', gap: 6, overflowX: 'auto' }}>
      {CHAPTERS.map(ch => {
        const on = active === ch.id;
        return (
          <button key={ch.id} onClick={() => onJump(ch.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0,
                           padding: '5px 11px', borderRadius: 8, cursor: 'pointer',
                           border: '1px solid ' + (on ? CH_COLOR[ch.idx] : '#e2e8f0'),
                           background: on ? CH_COLOR[ch.idx] + '14' : '#fff',
                           color: on ? CH_COLOR[ch.idx] : '#64748b', fontSize: mob ? 11 : 12, fontWeight: on ? 700 : 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? CH_COLOR[ch.idx] : '#cbd5e1' }} />
            {mob ? ch.name.split('.')[0] + '. ' + ch.name.split('. ')[1].slice(0, 4) : ch.name}
          </button>
        );
      })}
    </div>
  );
}

// 医療圏カルテ = 全国330二次医療圏を公開データから作成したパネル群。
// （元PDFスライドの貼付け表示は removed — 圏一覧/メタは data/static/hsa_manifest.json 由来で独立）
export default function AreaReportView({ mob, navTitle, globalPref, setGlobalPref, setView }) {
  const [ready, setReady] = useState(null);       // null=loading, false=未生成, true=ok
  const [areas, setAreas] = useState([]);          // 軽量圏域一覧
  const [prefectures, setPrefectures] = useState([]);
  // 選択圏コードは SelectionContext.reportCode に永続化（URL ?code= が常時現在カルテを反映）。
  // カルテ内の圏移動・HsaSummaryCards の setCode も常時 URL に反映される。
  const { reportCode: code, setReportCode: setCode } = useSelection();
  const [activeCh, setActiveCh] = useState('ch1');  // 章スクロールスパイ

  // 初期ロード（軽量一覧）
  useEffect(() => {
    fetch('/api/hsa/manifest').then(r => r.json()).then(d => {
      setReady(d.ready);
      if (!d.ready) return;
      setAreas(d.areas || []);
      setPrefectures(d.prefectures || []);
    }).catch(() => setReady(false));
  }, []);

  // 都道府県内の圏域
  const areasInPref = useMemo(
    () => areas.filter(a => a.pref === globalPref),
    [areas, globalPref]);

  // 選択圏の整合: reportCode(URL 復元/AreaView ディープリンク含む)を最優先で尊重し、
  // 県内に該当が無ければ先頭圏へ。★一覧未ロード中(areas空)は reportCode を保持し、
  // ?code= のディープリンク/リロードが先頭圏に上書きされないようにする。
  useEffect(() => {
    if (!areas.length) return;                              // 一覧未ロード中は触れない
    if (!areasInPref.length) { setCode(null); return; }     // 当該県にカルテ圏なし
    if (!areasInPref.some(a => a.code === code)) setCode(areasInPref[0].code);
  }, [areasInPref, areas]); // eslint-disable-line

  // 章スクロールスパイ: 見出しが上端付近を越えた最後の章をアクティブに
  useEffect(() => {
    if (!code) return;
    const onScroll = () => {
      let act = CHAPTERS[0].id;
      for (const ch of CHAPTERS) {
        const el = document.getElementById(ch.id);
        if (el && el.getBoundingClientRect().top <= 120) act = ch.id;
      }
      setActiveCh(act);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [code]);

  // パネル/章へのスクロール（閉パネルは開いてから）＋ reduced-motion 尊重
  const goTo = (id) => {
    const el = typeof document !== 'undefined' && document.getElementById(id);
    if (!el) return;
    const btn = el.querySelector('button');
    if (btn && /開く/.test(btn.textContent || '')) btn.click();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const sel = areas.find(a => a.code === code) || null;

  // ── 未生成 / ローディング ──
  if (ready === null) return <div style={{ padding: 40, color: '#94a3b8' }}>読み込み中…</div>;
  if (ready === false) return (
    <div style={{ padding: 32, background: '#fff', border: '1px solid #f0f0f0', borderRadius: 14 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>医療圏カルテの圏域一覧が見つかりません</div>
      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.8 }}>
        圏域マニフェスト（<code style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>data/static/hsa_manifest.json</code>）を配置してください。
      </p>
    </div>
  );

  return <>
    {/* ── 階層ナビ: 圏一覧へ戻る / 県の医療プロファイルへ昇る ── */}
    {setView && (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => setView('area')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                         borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569',
                         fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8faff'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}>
          ◀ 医療圏一覧へ戻る
        </button>
        <button onClick={() => setView('ndb')} title="この県の医療プロファイル（NDB統合）へ"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                         borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569',
                         fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f8faff'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0'; }}>
          この県の医療プロファイル →
        </button>
      </div>
    )}

    {/* ── ヘッダ ── */}
    <div style={{ marginBottom: 16, display: 'flex', flexDirection: mob ? 'column' : 'row',
                  justifyContent: 'space-between', alignItems: mob ? 'flex-start' : 'flex-end', gap: 12 }}>
      <div>
        <div style={{ fontSize: 11, color: '#2563EB', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Medical Area Report</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>{navTitle || '医療圏カルテ'}</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>全国330二次医療圏を、公開データから作成したカルテとして圏域単位で閲覧。</p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={globalPref} onChange={e => setGlobalPref(e.target.value)} style={selStyle}>
          {sortPrefs(prefectures).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={code || ''} onChange={e => setCode(e.target.value)} style={{ ...selStyle, minWidth: 160 }}>
          {areasInPref.map(a => <option key={a.code} value={a.code}>{a.area}</option>)}
        </select>
      </div>
    </div>

    {sel && (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{sel.pref} {sel.area}医療圏</span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>医療圏コード {sel.code}</span>
      </div>
    )}

    {/* カルテパネル（1リクエストで全パネル取得・章別グルーピング） */}
    {sel ? (
      <HsaAreaProvider code={sel.code}>
        <ChapterNav active={activeCh} onJump={goTo} mob={mob} />
        <HsaSummaryCards mob={mob} setCode={setCode} onJumpPanel={goTo} />
        <ChapterHead id="ch1" idx={1} name="1. 地域の概況" />
        <HsaOverviewPanel mob={mob} />
        <section id="sec-population" style={{ scrollMarginTop: 56 }}><HsaPopulationPanel mob={mob} /></section>
        <section id="sec-physician" style={{ scrollMarginTop: 56 }}><HsaPhysicianPanel mob={mob} /></section>
        <HsaSpecialtyPanel mob={mob} />
        <HsaDesignationPanel mob={mob} />
        <ChapterHead id="ch2" idx={2} name="2. 医療提供体制" />
        <section id="sec-bed" style={{ scrollMarginTop: 56 }}><HsaBedDetailPanel mob={mob} /></section>
        <HsaInpatientPanel mob={mob} />
        <HsaHospTrendPanel mob={mob} />
        <HsaEmergencyPanel mob={mob} />
        <ChapterHead id="ch3" idx={3} name="3. 医療需要の将来推計" />
        <HsaDemandPanel mob={mob} />
        <HsaCarePanel mob={mob} />
        <HsaHomecarePanel mob={mob} />
        <HsaSurgeryPanel mob={mob} />
        <ChapterHead id="ch4" idx={4} name="4. パフォーマンス・連携" />
        <HsaDpcPanel mob={mob} />
        <HsaDpcTrendPanel mob={mob} />
      </HsaAreaProvider>
    ) : <div style={{ padding: 40, color: '#cbd5e1', fontSize: 13 }}>医療圏を選択してください。</div>}

    <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.7, marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
      各パネルは厚労省 病床機能報告・NDBオープンデータ・人口動態統計・医師偏在指標・社人研将来推計などの公開統計から独自に再構築したものです（出典は各パネル内に明記）。本ビューは個人確認用です。
    </div>
  </>;
}
