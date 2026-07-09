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

const CH_COLOR = ['#64748b', '#2563EB', '#0891b2', '#7c3aed', '#059669'];
const selStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', cursor: 'pointer' };

function ChapterHead({ idx, name }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 2px 10px' }}>
      <span style={{ width: 4, height: 18, borderRadius: 2, background: CH_COLOR[idx] || '#64748b' }} />
      <span style={{ fontSize: 15, fontWeight: 700, color: '#334155', letterSpacing: '-0.01em' }}>{name}</span>
    </div>
  );
}

// 医療圏カルテ = 全国330二次医療圏を公開データからネイティブ再構築したパネル群。
// （元PDFスライドの貼付け表示は removed — 圏一覧/メタは data/static/hsa_manifest.json 由来で独立）
export default function AreaReportView({ mob, globalPref, setGlobalPref, initialCode, onInitialCodeConsumed, setView }) {
  const [ready, setReady] = useState(null);       // null=loading, false=未生成, true=ok
  const [areas, setAreas] = useState([]);          // 軽量圏域一覧
  const [prefectures, setPrefectures] = useState([]);
  const [code, setCode] = useState(null);          // 選択圏コード

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

  // 圏一覧(AreaView)からのディープリンク: initialCode を最優先で開く
  useEffect(() => {
    if (initialCode && areas.some(a => a.code === initialCode)) {
      setCode(initialCode);
      if (onInitialCodeConsumed) onInitialCodeConsumed();
    }
  }, [initialCode, areas]); // eslint-disable-line

  // 県が変わったら先頭圏を選択（ただし initialCode 指定中はそれを尊重）
  useEffect(() => {
    if (initialCode && areas.some(a => a.code === initialCode)) return;
    if (!areasInPref.length) { setCode(null); return; }
    if (!areasInPref.some(a => a.code === code)) setCode(areasInPref[0].code);
  }, [areasInPref]); // eslint-disable-line

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
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>全国330二次医療圏を、公開データからネイティブ再構築したカルテとして圏域単位で閲覧。</p>
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

    {/* ネイティブ再構築パネル（1リクエストで全パネル取得・章別グルーピング） */}
    {sel ? (
      <HsaAreaProvider code={sel.code}>
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
    ) : <div style={{ padding: 40, color: '#cbd5e1', fontSize: 13 }}>医療圏を選択してください。</div>}

    <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.7, marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
      各パネルは厚労省 病床機能報告・NDBオープンデータ・人口動態統計・医師偏在指標・社人研将来推計などの公開統計から独自に再構築したものです（出典は各パネル内に明記）。本ビューは個人確認用です。
    </div>
  </>;
}
