'use client';
import { useState, useEffect, useMemo } from 'react';
import { fmt, sortPrefs } from '../shared';
import PrefChoropleth from '../ui/PrefChoropleth';
import PrefStrip47 from '../ui/PrefStrip47';
import AreaStrip330 from '../ui/AreaStrip330';
import DeathWaffle100, { buildWaffleItems, WAFFLE_CAUSE_COLORS, WAFFLE_OTHER, WAFFLE_OTHER_COLOR } from '../ui/DeathWaffle100';
import { getSourceBadge } from '../../../lib/sourceRegistry';
import { tierOf } from '../../../lib/domainMapping';

// 県コロプレスの指標セレクタ(圏の県内合計=実数、圏数のみ件数)。beds/hosp は10万対換算対応。
const METRICS = [
  { key: 'hosp', label: '病院数', unit: '施設', percap: true },
  { key: 'beds', label: '病床数', unit: '床', percap: true },
  { key: 'count', label: '医療圏数', unit: '圏', percap: false },
];

// yearBadge {label,color}: 年度文字列を色付きバッジに(PrefStrip47 / AreaStrip330 必須prop)
const yb = (k) => { const s = getSourceBadge(k); return { label: s.year, color: s.color }; };

// 人口10万対換算(分母0/欠測は null=「—」)。値は捏造しない。
const per100k = (raw, pop) => (pop && pop > 0 && raw != null && isFinite(raw)) ? raw / pop * 100000 : null;
// 数値整形(欠測は「—」)
const nf = (v, dec = 0) => (v == null || !isFinite(v)) ? '—' : v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });

export default function AreaView({ mob, navTitle, areaData, areaDemoData, areaPref, setAreaPref, areaPrefList, vitalStats, japanMap, onOpenKarte }) {
  const vp = vitalStats?.prefectures?.find(p => p.pref === areaPref);
  const causes = vp?.causes || [];

  const [metric, setMetric] = useState('beds');
  const [percap, setPercap] = useState(false);           // 実数 ⇄ 人口10万対
  const [allAreas, setAllAreas] = useState([]);          // 全国330圏(供給・県集計用)
  const demo = areaDemoData || [];                       // area_demographics 330圏(圏人口/高齢化率) — 親(page.js)取得済を参照
  const [emerg, setEmerg] = useState([]);                // 選択県の救急/在宅 圏別
  const [emergMeta, setEmergMeta] = useState(null);      // 件数差の脚注メタ
  const [karteMap, setKarteMap] = useState(null);        // pref|area -> hsa圏コード (null=未取得)

  // 死因構造の横断同期(百人ワッフル hoverCause + 展開 selectedCause)
  const [hoverCause, setHoverCause] = useState(null);
  const [selectedCause, setSelectedCause] = useState(null);
  // 県ストリップ(死因)横断同期・◆ピン
  const [hoverPref, setHoverPref] = useState(null);
  const [pinnedPref, setPinnedPref] = useState(null);
  // 圏ストリップ(AreaStrip330)横断同期・◆ピン(テーブル行と共有)
  const [hoverArea, setHoverArea] = useState(null);      // pref|area
  const [pinnedArea, setPinnedArea] = useState(null);    // pref|area

  const stripCommon = {
    selected: areaPref, pinned: pinnedPref, hoverPref,
    onHover: setHoverPref,
    onPin: (p) => setPinnedPref(prev => prev === p ? null : p),
    onJump: setAreaPref,
  };

  // 全国医療圏(供給・県集計)を一度だけ取得
  useEffect(() => {
    fetch('/api/medical-areas').then(r => r.json()).then(d => setAllAreas(d.data || [])).catch(() => {});
  }, []);

  // 圏人口・高齢化率(住基2025・330圏)は親(page.js)取得済の areaDemoData を参照(再fetch廃止)

  // 医療圏カルテ(hsa)の圏コード対応表を一度だけ取得(未抽出なら空)
  useEffect(() => {
    fetch('/api/hsa/manifest').then(r => r.json()).then(d => {
      if (!d.ready) { setKarteMap({}); return; }
      const m = {};
      for (const a of (d.areas || [])) m[a.pref + '|' + a.area] = a.code;
      setKarteMap(m);
    }).catch(() => setKarteMap({}));
  }, []);

  // 選択県の救急告示・在宅療養支援(圏別)を取得
  useEffect(() => {
    if (!areaPref) return;
    fetch('/api/area-emergency-homecare?pref=' + encodeURIComponent(areaPref))
      .then(r => r.json()).then(d => {
        setEmerg(d.data || []);
        setEmergMeta({ note: d.countMismatchNote, source: d.source, rowCount: d.rowCount, areaCount: d.medicalAreaCount });
      }).catch(() => { setEmerg([]); setEmergMeta(null); });
  }, [areaPref]);

  // 圏キー(pref|area) -> {pop, p65, aging}(munis合計・住基2025)
  const demoByKey = useMemo(() => {
    const m = {};
    for (const a of demo) {
      let pop = 0, p65 = 0;
      for (const mu of (a.munis || [])) { pop += mu.pop || 0; p65 += mu.p65 || 0; }
      m[a.pref + '|' + a.area] = { pop, p65, aging: pop > 0 ? p65 / pop * 100 : null };
    }
    return m;
  }, [demo]);

  // 県別人口(圏合計)と全国計・全国高齢化率(10万対換算の分母)
  const { popByPref, natPop, natP65, natAging } = useMemo(() => {
    const pp = {}; let np = 0, n65 = 0;
    for (const a of demo) {
      let pop = 0, p65 = 0;
      for (const mu of (a.munis || [])) { pop += mu.pop || 0; p65 += mu.p65 || 0; }
      pp[a.pref] = (pp[a.pref] || 0) + pop;
      np += pop; n65 += p65;
    }
    return { popByPref: pp, natPop: np, natP65: n65, natAging: np > 0 ? n65 / np * 100 : null };
  }, [demo]);

  // 全国330圏を圏人口とjoin(AreaStrip330 用・10万対値供給)
  const allJoined = useMemo(() => {
    return allAreas.map(a => {
      const key = a.pref + '|' + a.area;
      const d = demoByKey[key];
      const pop = d?.pop ?? null;
      return { ...a, code: key, pop, aging: d?.aging ?? null,
        bedsPer: per100k(a.beds, pop), hospPer: per100k(a.hosp, pop) };
    });
  }, [allAreas, demoByKey]);

  // 全国 病床10万対(AreaStrip330 の全国平均tick)
  const natBeds = useMemo(() => allAreas.reduce((s, a) => s + (a.beds || 0), 0), [allAreas]);
  const natBedsPer = natPop > 0 ? natBeds / natPop * 100000 : null;

  // AreaStrip330 values: 全国330圏の病床10万対
  const stripValues = useMemo(() =>
    allJoined.map(a => ({ code: a.code, area: a.area, pref: a.pref, value: a.bedsPer })).filter(x => x.value != null),
    [allJoined]);

  // 県別集計コロプレス(percap 対応。count は常に実数)
  const valueByPref = useMemo(() => {
    const acc = {};
    for (const a of allAreas) {
      if (!acc[a.pref]) acc[a.pref] = { hosp: 0, beds: 0, count: 0 };
      acc[a.pref].hosp += a.hosp || 0;
      acc[a.pref].beds += a.beds || 0;
      acc[a.pref].count += 1;
    }
    const out = {};
    const usePc = percap && metric !== 'count';
    for (const k in acc) {
      const raw = acc[k][metric];
      out[k] = usePc ? per100k(raw, popByPref[k]) : raw;
    }
    return out;
  }, [allAreas, metric, percap, popByPref]);

  // 圏名 -> 救急/在宅レコード
  const emergByArea = useMemo(() => {
    const m = {};
    for (const r of emerg) m[r.area] = r;
    return m;
  }, [emerg]);

  const mBadge = getSourceBadge('medicalAreas');
  const aBadge = getSourceBadge('agePyramid');
  const mInfo = METRICS.find(m => m.key === metric);
  const usePc = percap && metric !== 'count';

  // ── 統合テーブル(bar-in-table・ソート可能) ──
  const [sort, setSort] = useState({ key: 'beds', dir: 'desc' });
  const clickSort = (key) => setSort(prev => prev.key === key
    ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
    : { key, dir: key === 'area' ? 'asc' : 'desc' });

  // 各行のjoin済みデータ(選択県の圏)
  const rows = useMemo(() => {
    return (areaData || []).map(a => {
      const key = areaPref + '|' + a.area;
      const d = demoByKey[key];
      const pop = d?.pop ?? null;
      const e = emergByArea[a.area];
      return {
        ...a, code: key, pop, aging: d?.aging ?? null,
        bedsShow: usePc ? per100k(a.beds, pop) : a.beds,
        hospShow: usePc ? per100k(a.hosp, pop) : a.hosp,
        emerg: e && e.emerg > 0 ? e.emerg : null,            // 24/339のみ収載・残は「—」
        homecare: e ? (e.homecare ?? null) : null,           // 339/339
        homecare_patients: e ? (e.homecare_patients ?? null) : null, // 339/339
        acute_support: e && e.acute_support > 0 ? e.acute_support : null, // 245/339収載
        karte: karteMap ? karteMap[key] : undefined,
      };
    });
  }, [areaData, areaPref, demoByKey, emergByArea, karteMap, usePc]);

  const sortVal = (r, key) => {
    switch (key) {
      case 'area': return r.area || '';
      case 'hosp': return r.hospShow;
      case 'wards': return r.wards;
      case 'beds': return r.bedsShow;
      case 'aging': return r.aging;
      case 'emerg': return r.emerg;
      case 'homecare': return r.homecare;
      case 'hp': return r.homecare_patients;
      case 'as': return r.acute_support;
      default: return r[key];
    }
  };
  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      const va = sortVal(a, key), vb = sortVal(b, key);
      if (key === 'area') return dir === 'asc' ? String(va).localeCompare(vb, 'ja') : String(vb).localeCompare(va, 'ja');
      const na = va == null || !isFinite(va) ? -Infinity : va;
      const nb = vb == null || !isFinite(vb) ? -Infinity : vb;
      return dir === 'asc' ? na - nb : nb - na;
    });
    return arr;
  }, [rows, sort]);

  // 病床バーの最大値(現モードの選択県内max)
  const maxBedsShow = useMemo(() => {
    let mx = 0;
    for (const r of rows) if (r.bedsShow != null && r.bedsShow > mx) mx = r.bedsShow;
    return mx || 1;
  }, [rows]);

  // 死因ワッフル items
  const waffleItems = useMemo(() => {
    if (!vp?.causes?.length || !vitalStats?.national?.causes?.length) return null;
    if (!vp.total_death_rate || !vitalStats.national.total_death_rate) return null;
    return buildWaffleItems({
      prefCauses: vp.causes, prefTotal: vp.total_death_rate,
      natCauses: vitalStats.national.causes, natTotal: vitalStats.national.total_death_rate,
    });
  }, [vp, vitalStats]);

  const pcUnit = usePc ? '/10万' : '';
  const arrow = (key) => sort.key === key ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : '';
  const thBase = { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #f1f5f9', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };

  // ピン圏・ホバー圏の比較値(AreaStrip330 下チップ)
  const areaInfo = (code) => {
    if (!code) return null;
    const a = allJoined.find(x => x.code === code);
    return a ? { area: a.area, pref: a.pref, bedsPer: a.bedsPer, aging: a.aging } : null;
  };
  const pinInfo = areaInfo(pinnedArea);

  return <>
  <div style={{marginBottom:24,display:'flex',flexDirection:mob?'column':'row',justifyContent:'space-between',alignItems:mob?'flex-start':'flex-end',gap:12}}>
    <div>
      <div style={{fontSize:11,color:'#2563EB',fontWeight:600,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4}}>Medical Area Analysis</div>
      <h1 style={{fontSize:22,fontWeight:700,letterSpacing:'-0.03em',margin:0}}>{navTitle || '医療圏 一覧・比較'}</h1>
      <p style={{fontSize:13,color:'#94a3b8',margin:'4px 0 0'}}>全国330二次医療圏の医療体制を都道府県別に比較・圏カルテへドリルダウン。</p>
    </div>
    <select value={areaPref} onChange={e=>setAreaPref(e.target.value)} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:13,background:'#fff',cursor:'pointer',minWidth:140}}>
      {sortPrefs(areaPrefList).map(p=><option key={p} value={p}>{p}</option>)}
    </select>
  </div>

  {/* ═══ 県コロプレス(指標セレクタ + 実数⇄10万対トグル・県click=切替) ═══ */}
  {japanMap && (
    <div style={{marginBottom:20}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,flexWrap:'wrap'}}>
        <span style={{fontSize:11,color:'#94a3b8',fontWeight:600}}>指標</span>
        {METRICS.map(m=>(
          <button key={m.key} onClick={()=>setMetric(m.key)} style={{padding:'6px 13px',borderRadius:8,border:'1px solid '+(metric===m.key?'#2563EB':'#e2e8f0'),background:metric===m.key?'#eff6ff':'#fff',color:metric===m.key?'#2563EB':'#64748b',fontSize:12.5,fontWeight:600,cursor:'pointer'}}>{m.label}</button>
        ))}
        <span style={{width:1,height:20,background:'#e2e8f0',margin:'0 4px'}}/>
        <div style={{display:'flex',gap:0,background:'#f1f5f9',padding:2,borderRadius:6,opacity:mInfo?.percap?1:0.5}} title={mInfo?.percap?'実数と人口10万対を切り替え(住基2025 圏人口)':'医療圏数は実数のみ'}>
          {[{k:false,l:'実数'},{k:true,l:'人口10万対'}].map(o=>(
            <button key={String(o.k)} disabled={!mInfo?.percap} onClick={()=>setPercap(o.k)}
              style={{padding:'4px 11px',fontSize:11,fontWeight:600,border:'none',borderRadius:4,cursor:mInfo?.percap?'pointer':'not-allowed',background:(percap===o.k&&mInfo?.percap)?'#fff':'transparent',color:(percap===o.k&&mInfo?.percap)?'#0f172a':'#64748b',boxShadow:(percap===o.k&&mInfo?.percap)?'0 1px 2px rgba(0,0,0,0.05)':'none'}}>{o.l}</button>
          ))}
        </div>
      </div>
      <PrefChoropleth
        japanMap={japanMap}
        valueByPref={valueByPref}
        selected={areaPref}
        onSelect={setAreaPref}
        title={'都道府県別 ' + (mInfo?.label || '') + (usePc ? '（人口10万対）' : '')}
        unit={usePc ? '/10万' : (mInfo?.unit || '')}
        yearBadge={{ label: mBadge.label + ' ' + mBadge.year, color: mBadge.color }}
        mob={mob}
      />
      <div style={{fontSize:11,color:'#94a3b8',marginTop:6}}>
        県内二次医療圏の{usePc?'合計を人口10万対に換算':'単純合計（実数）'}。地図をクリックすると対象県を切り替えます。
        {usePc && <span style={{color:'#475569'}}> 分母＝{aBadge.label}{aBadge.year}（圏内市区町村の住民合計）。</span>}
        {metric==='count' && <span style={{color:'#b45309'}}> 医療圏数は件数のため10万対換算は行いません。</span>}
      </div>
    </div>
  )}

  <div style={{display:'grid',gridTemplateColumns:mob?'1fr':'repeat(3,1fr)',gap:12,marginBottom:20}}>
    {[{l:'病院数',v:fmt(areaData.reduce((s,a)=>s+(a.hosp||0),0)),sub:`${areaPref} ${areaData.length}圏域`,c:'#2563EB'},{l:'総病床数',v:fmt(areaData.reduce((s,a)=>s+(a.beds||0),0)),sub:'許可病床数合計',c:'#0891b2'},{l:'病棟数',v:fmt(areaData.reduce((s,a)=>s+(a.wards||0),0)),sub:'病床機能報告対象',c:'#059669'}].map((k,i)=>(
      <div key={i} style={{background:'#fff',borderRadius:12,padding:'16px 20px',border:'1px solid #f0f0f0'}}>
        <div style={{fontSize:11,color:'#94a3b8',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>{k.l}</div>
        <div style={{fontSize:28,fontWeight:700,color:k.c,letterSpacing:'-0.02em'}}>{k.v}</div>
        <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{k.sub}</div>
      </div>))}
  </div>

  {/* ═══ 統合 圏プロファイルレーン(bar-in-table・ソート可能・行内病床バー) ═══ */}
  <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',overflow:'hidden'}}>
    <div style={{padding:'16px 20px 10px',display:'flex',justifyContent:'space-between',alignItems:'baseline',flexWrap:'wrap',gap:8}}>
      <div style={{fontSize:14,fontWeight:600}}>二次医療圏プロファイル — {areaPref}
        <span style={{fontSize:11,fontWeight:500,color:'#94a3b8',marginLeft:8}}>{usePc?'人口10万対':'実数'}・列見出しクリックで並べ替え</span>
      </div>
    </div>
    <div style={{overflowX:'auto'}}>
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
      <thead>
        <tr style={{background:'#fafbfc'}}>
          <th onClick={()=>clickSort('area')} style={{...thBase,textAlign:'left'}}>二次医療圏{arrow('area')}</th>
          <th onClick={()=>clickSort('hosp')} style={{...thBase,textAlign:'right'}}>病院数{usePc?'/10万':''}{arrow('hosp')}</th>
          <th onClick={()=>clickSort('wards')} style={{...thBase,textAlign:'right'}}>病棟数{arrow('wards')}</th>
          <th onClick={()=>clickSort('beds')} style={{...thBase,textAlign:'right'}}>病床数{usePc?'/10万':''}{arrow('beds')}</th>
          <th onClick={()=>clickSort('aging')} style={{...thBase,textAlign:'right'}}>高齢化率{arrow('aging')}</th>
          <th onClick={()=>clickSort('emerg')} style={{...thBase,textAlign:'right'}}>救急告示{arrow('emerg')}</th>
          <th onClick={()=>clickSort('homecare')} style={{...thBase,textAlign:'right'}}>在支診/病{arrow('homecare')}</th>
          <th onClick={()=>clickSort('hp')} style={{...thBase,textAlign:'right'}}>在宅患者数{arrow('hp')}</th>
          <th onClick={()=>clickSort('as')} style={{...thBase,textAlign:'right'}}>急性期支援{arrow('as')}</th>
          <th style={{...thBase,textAlign:'center',cursor:'default'}}>カルテ</th>
        </tr>
        <tr style={{background:'#fafbfc'}}>
          <th colSpan={4} style={{padding:'0 14px 8px',fontSize:9.5,fontWeight:500,color:'#cbd5e1',textAlign:'left'}}>病床機能報告 R6</th>
          <th style={{padding:'0 14px 8px',fontSize:9.5,fontWeight:500,color:'#cbd5e1',textAlign:'right'}}>住基2025</th>
          <th colSpan={4} style={{padding:'0 14px 8px',fontSize:9.5,fontWeight:500,color:'#cbd5e1',textAlign:'right'}}>医療需給総覧（圏別）</th>
        </tr>
      </thead>
      <tbody>{sortedRows.map((r,i)=>{
        const tier = (r.aging != null && natAging) ? tierOf((r.aging/natAging - 1)*100) : null;
        const barW = r.bedsShow != null ? Math.max(2, r.bedsShow/maxBedsShow*100) : 0;
        const isHl = hoverArea === r.code || pinnedArea === r.code;
        return (
        <tr key={i}
            onMouseEnter={()=>setHoverArea(r.code)} onMouseLeave={()=>setHoverArea(null)}
            style={{borderBottom:'1px solid #f8f9fa',background:pinnedArea===r.code?'#fff7ed':(hoverArea===r.code?'#f8faff':'transparent'),transition:'background 150ms ease'}}>
          <td style={{padding:'9px 14px',fontWeight:500,whiteSpace:'nowrap'}}>
            {pinnedArea===r.code && <span style={{color:'#f97316',marginRight:4}}>◆</span>}{r.area}
          </td>
          <td style={{padding:'9px 14px',textAlign:'right',fontWeight:600,color:'#2563EB',fontVariantNumeric:'tabular-nums'}}>{nf(r.hospShow, usePc?1:0)}</td>
          <td style={{padding:'9px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{nf(r.wards)}</td>
          <td style={{padding:'9px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'flex-end'}}>
              <div style={{flex:'0 0 72px',height:8,background:'#f1f5f9',borderRadius:3,overflow:'hidden',order:mob?2:0}}>
                <div style={{height:'100%',width:barW+'%',background:isHl?'#1d4ed8':'#93c5fd',borderRadius:3,transition:'width 200ms ease,background 150ms ease'}}/>
              </div>
              <span style={{minWidth:48,textAlign:'right'}}>{nf(r.bedsShow, usePc?0:0)}</span>
            </div>
          </td>
          <td style={{padding:'9px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums'}}>
            {r.aging != null ? <span style={{display:'inline-flex',alignItems:'center',gap:5,justifyContent:'flex-end'}}>
              {r.aging.toFixed(1)}%
              {tier && <span title={`全国(${natAging?.toFixed(1)}%)比: ${tier.label}`} style={{fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:8,color:tier.color,background:tier.color+'1a',border:`1px solid ${tier.color}33`}}>{tier.short}</span>}
            </span> : '—'}
          </td>
          <td style={{padding:'9px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums',color:r.emerg!=null?'#0f172a':'#cbd5e1'}} title={r.emerg==null?'この圏は救急告示施設が本データに収載されていません(欠測)':undefined}>{r.emerg!=null?fmt(r.emerg):'—'}</td>
          <td style={{padding:'9px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums',color:r.homecare!=null?'#0f172a':'#cbd5e1'}}>{r.homecare!=null?fmt(r.homecare):'—'}</td>
          <td style={{padding:'9px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums',color:r.homecare_patients!=null?'#0f172a':'#cbd5e1'}}>{r.homecare_patients!=null?fmt(r.homecare_patients):'—'}</td>
          <td style={{padding:'9px 14px',textAlign:'right',fontVariantNumeric:'tabular-nums',color:r.acute_support!=null?'#0f172a':'#cbd5e1'}} title={r.acute_support==null?'急性期支援は本データに収載されていません(欠測)':undefined}>{r.acute_support!=null?fmt(r.acute_support):'—'}</td>
          <td style={{padding:'7px 14px',textAlign:'center',whiteSpace:'nowrap'}}>
            {r.karte ? (
              <button onClick={()=>onOpenKarte&&onOpenKarte(r.karte)} style={{padding:'5px 11px',borderRadius:7,border:'1px solid #bfdbfe',background:'#eff6ff',color:'#2563EB',fontSize:12,fontWeight:600,cursor:'pointer'}}
                onMouseEnter={ev=>{ev.currentTarget.style.background='#dbeafe';}} onMouseLeave={ev=>{ev.currentTarget.style.background='#eff6ff';}}>
                カルテを開く→
              </button>
            ) : (
              <span style={{fontSize:11,color:'#cbd5e1'}}>{karteMap===null?'…':'—'}</span>
            )}
          </td>
        </tr>);
      })}</tbody>
    </table>
    </div>
    <div style={{padding:'12px 16px',fontSize:11,color:'#94a3b8',borderTop:'1px solid #f1f5f9',lineHeight:1.7}}>
      出典: 病院数/病棟数/病床数＝厚労省 病床機能報告（令和6年度・全国330二次医療圏対応）｜ 高齢化率＝{aBadge.label}{aBadge.year}（圏内市区町村の住民合計、全国計{fmt(natPop)}人）｜ 救急告示・在宅・急性期支援＝医療需給総覧（圏別集計）<br/>
      <span>※人口10万対は住基2025の圏人口を分母に算出（圏別分母を実装。県単位だけでなく圏別も換算可能）。</span><br/>
      <span>※救急告示は{emergMeta?.rowCount || 339}圏中の収載圏のみ非ゼロ・急性期支援も一部圏のみ収載のため、未収載は「0」ではなく<b style={{color:'#b45309'}}>「—」（欠測）</b>で表示します。</span><br/>
      <span>※病床機能報告の医療圏マスタ（330圏）と救急/在宅データ（{emergMeta?.rowCount || 339}行）は圏定義が異なるため、都道府県＋圏名で突合し、対応が無い圏は「—」表示です。</span>
    </div>
  </div>

  {/* ═══ 全国330圏分布ストリップ(この県の各圏は全国のどこか・病床10万対) ═══ */}
  {stripValues.length >= 40 && natBedsPer != null && (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'16px 20px',marginTop:16}}>
      <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>この県の各圏は全国330圏のどこか <span style={{fontSize:11,fontWeight:500,color:'#94a3b8'}}>病床数 人口10万対</span></div>
      <div style={{fontSize:11,color:'#94a3b8',marginBottom:8}}>上の表の行をなぞると全国分布の中で光ります。ドットをクリックで◆ピン比較、ピンを再クリックでカルテへ。</div>
      <AreaStrip330
        values={stripValues}
        hoverCode={hoverArea}
        pinnedCode={pinnedArea}
        onHover={setHoverArea}
        onPin={(c)=>setPinnedArea(prev=>prev===c?null:c)}
        onSelect={(c)=>{ const code=karteMap&&karteMap[c]; if(code&&onOpenKarte) onOpenKarte(code); }}
        natAvg={natBedsPer}
        unit="/10万"
        yearBadge={yb('medicalAreas')}
        mode="full"
      />
      {pinInfo && (
        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8,fontSize:11,alignItems:'center'}}>
          <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'3px 9px',borderRadius:8,background:'#fff7ed',border:'1px solid #fed7aa',color:'#9a3412',fontWeight:600}}>
            <span style={{color:'#f97316'}}>◆</span>{pinInfo.pref} {pinInfo.area}
          </span>
          <span style={{color:'#475569',fontVariantNumeric:'tabular-nums'}}>病床 {nf(pinInfo.bedsPer)}/10万</span>
          {pinInfo.aging!=null && <span style={{color:'#475569',fontVariantNumeric:'tabular-nums'}}>高齢化率 {pinInfo.aging.toFixed(1)}%</span>}
          <span style={{color:'#94a3b8'}}>全国平均 {nf(natBedsPer)}/10万</span>
          <button onClick={()=>setPinnedArea(null)} style={{marginLeft:'auto',fontSize:10,color:'#94a3b8',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>ピン解除</button>
        </div>
      )}
      <div style={{fontSize:10,color:'#94a3b8',marginTop:8}}>分母＝{aBadge.label}{aBadge.year}（圏人口）。高低は良し悪しではありません（人口構成・受療動線で適正水準は圏ごとに異なる）。</div>
    </div>
  )}

  {/* ═══ 死因構造(百人ワッフル 県vs全国 + 各死因47県ストリップ) ═══ */}
  {causes.length > 0 && (
    <div style={{background:'#fff',borderRadius:14,padding:'20px 24px',border:'1px solid #f0f0f0',marginTop:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div>
          <div style={{fontSize:14,fontWeight:600}}>死因構造 — {areaPref} <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fce7f3',color:'#9f1239',fontWeight:500}}>結果</span></div>
          <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>厚労省人口動態統計 2024年確定数 ｜ 粗死亡率（人口10万対・年齢調整前）</div>
        </div>
      </div>

      {waffleItems && vp?.total_death_rate && vitalStats?.national?.total_death_rate && (
        <DeathWaffle100
          items={waffleItems}
          prefName={areaPref}
          totalRatePref={vp.total_death_rate}
          totalRateNat={vitalStats.national.total_death_rate}
          hoverCause={hoverCause}
          onHoverCause={setHoverCause}
          onSelectCause={(cat)=>{ if (cat !== WAFFLE_OTHER) setSelectedCause(prev => prev === cat ? null : cat); }}
          yearBadge={yb('vitalStats')}
          mob={mob}
        />
      )}

      <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:4}}>
        {causes.map((c,i)=>{
          const maxRate = causes[0]?.rate || 1;
          const causeStrip = (vitalStats?.prefectures||[])
            .map(p=>({pref:p.pref, value:p.causes?.find(x=>x.cause===c.cause)?.rate})).filter(x=>x.value!=null);
          const natRate = vitalStats?.national?.causes?.find(x=>x.cause===c.cause)?.rate;
          const rankArr = [...causeStrip].sort((a,b)=>b.value-a.value);
          const rank = rankArr.findIndex(x=>x.pref===areaPref) + 1;
          const sharePct = vp?.total_death_rate ? c.rate/vp.total_death_rate*100 : null;
          const wCat = WAFFLE_CAUSE_COLORS[c.cause] ? c.cause : WAFFLE_OTHER;
          const swColor = WAFFLE_CAUSE_COLORS[c.cause] || WAFFLE_OTHER_COLOR;
          const rowHl = hoverCause === wCat;
          const mapEnabled = causeStrip.length >= 40 && !!japanMap;
          const isMapOpen = mapEnabled && selectedCause === c.cause;
          const valueByPrefCause = isMapOpen ? causeStrip.reduce((m,x)=>{m[x.pref]=x.value;return m;},{}) : null;
          return <div key={i}>
            <div
              onClick={mapEnabled?(()=>setSelectedCause(prev=>prev===c.cause?null:c.cause)):undefined}
              onMouseEnter={()=>setHoverCause(wCat)} onMouseLeave={()=>setHoverCause(null)}
              title={mapEnabled?(isMapOpen?'地図を閉じる':'クリックで47県地図を展開'):undefined}
              style={{display:'flex',alignItems:'center',gap:8,cursor:mapEnabled?'pointer':'default',background:isMapOpen?'#faf5ff':(rowHl?'#f1f5f9':'transparent'),borderRadius:4,padding:isMapOpen?'2px 4px':'0',margin:isMapOpen?'0 -4px':'0',transition:'background 200ms ease'}}>
              {mapEnabled && <span style={{fontSize:10,color:isMapOpen?'#7c3aed':'#cbd5e1',flexShrink:0,width:10,textAlign:'center'}}>{isMapOpen?'▾':'▸'}</span>}
              <span title={wCat===WAFFLE_OTHER?'上のワッフルでは「その他の死因」に統合':'上のワッフル格子と同色対応'} style={{width:8,height:8,borderRadius:wCat===WAFFLE_OTHER?'50%':2,background:swColor,flexShrink:0}}/>
              <span style={{width:mob?90:120,fontSize:12,fontWeight:500,color:'#475569',flexShrink:0}}>{c.cause?.replace(/\(.+\)/,'')||c.cause}</span>
              <div style={{flex:1,height:16,background:'#f1f5f9',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:3,background:i<3?'#7c3aed':'#a78bfa',width:`${c.rate/maxRate*100}%`,opacity:0.85}}/>
              </div>
              <span style={{fontSize:12,fontWeight:600,color:'#7c3aed',fontVariantNumeric:'tabular-nums',width:56,textAlign:'right',flexShrink:0}}>{c.rate}</span>
              {sharePct != null && <span title={`構成% = ${c.rate} ÷ ${vp.total_death_rate}（全死因粗死亡率/10万）`} style={{fontSize:9,color:'#94a3b8',fontVariantNumeric:'tabular-nums',width:mob?32:40,textAlign:'right',flexShrink:0}}>{sharePct.toFixed(1)}%</span>}
              {rank>0 && <span title={`${causeStrip.length}都道府県中${rank}位（1位=全国最高値）`} style={{fontSize:9,fontWeight:700,color:'#7c3aed',background:'#f5f3ff',padding:'2px 6px',borderRadius:8,flexShrink:0,cursor:'help'}}>{rank}位/{causeStrip.length}</span>}
            </div>
            {causeStrip.length >= 40 && <div style={{margin:`2px 0 4px ${mob?18:24}px`}}><PrefStrip47 {...stripCommon} values={causeStrip} natAvg={natRate} yearBadge={yb('vitalStats')} mode="inline" /></div>}
            {isMapOpen && (
              <div style={{margin:`6px 0 12px ${mob?4:24}px`}}>
                <div style={{fontSize:10,color:'#92400e',background:'#fffbeb',borderLeft:'3px solid #f59e0b',borderRadius:3,padding:'6px 10px',marginBottom:6,lineHeight:1.5}}>
                  ⚠ <b>粗死亡率は高齢県ほど高く出ます</b>（年齢調整前）。県間の高低は年齢構成差を多分に含みます。
                </div>
                <PrefChoropleth
                  japanMap={japanMap}
                  valueByPref={valueByPrefCause}
                  selected={areaPref}
                  onSelect={setAreaPref}
                  title={`${c.cause?.replace(/\(.+\)/,'')||c.cause}・粗死亡率 2024（年齢調整前）`}
                  unit="/10万"
                  yearBadge={{ label: '人口動態 2024', color: '#9f1239' }}
                  mob={mob}
                />
              </div>
            )}
          </div>;
        })}
      </div>
      <div style={{fontSize:10,color:'#94a3b8',marginTop:10,lineHeight:1.6}}>
        各行の帯＝当県の粗死亡率、右のドット列＝47都道府県分布（この県=青・◆=ピン比較・青破線=全国）。順位は1位=全国最高値。高低は良し悪しではありません（粗死亡率は年齢構成差を含みます）。
      </div>
    </div>
  )}
  </>;
}
