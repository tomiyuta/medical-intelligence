'use client';
import { Fragment } from 'react';
import { fmt, sortPrefs, PREF_ORDER } from '../../shared';
import { prefersReducedMotion, useCountUp, CountUpNum, useFlipRows, useStripCommon, useYearSweep } from '../../ui/vizHooks';
import { dispersionForCause, classifyDispersion } from '../../../../lib/dispersionMetrics';
import { getSourceBadge } from '../../../../lib/sourceRegistry';
import { DOMAIN_MAPPING, DOMAIN_ORDER, rowInDomain, domainSectionStatus, DOMAIN_TO_RX_LABEL, FP_TIERS, tierOf } from '../../../../lib/domainMapping';
import InterpretationGuard from '../../ui/InterpretationGuard';
import PrefStrip47 from '../../ui/PrefStrip47';
import PsIris from '../../ui/PsIris';
import PrefChoropleth from '../../ui/PrefChoropleth';
import CheckupBinsHistogram, { RISK_BIN_THRESHOLD, METRIC_TO_RISK_KEY } from '../../ui/CheckupBinsHistogram';
import RiskGauge from '../../ui/RiskGauge';
import AgePyramidGhost from '../../ui/AgePyramidGhost';
import DeathWaffle100, { buildWaffleItems, WAFFLE_CAUSE_COLORS, WAFFLE_OTHER, WAFFLE_OTHER_COLOR } from '../../ui/DeathWaffle100';
import { PREF47_SET, isP47, yb, UnitDotLane, RHYTHM_X0, RHYTHM_X1, RHYTHM_W, rhythmX, RHYTHM_MONTHS, RhythmLane, YearRhythmTrack, CAT_LABELS, DIAG_UNIT, RISK_META, RISK_CARDS, RISK_COLOR_DEEP, DRUG_DOMAIN, DOMAIN_COLORS, GAP_TEMPLATES, DOMAIN_GAP_TEMPLATE, DEMO_YEARS, computeAgeRates } from './ndbShared';

export default function DemandForestSection(props){
  const {
  mob, navTitle, ndbDiag, ndbRx, ndbHc, ndbPref, setNdbPref, setNdbRx, vitalStats, ndbQ, agePyramid,
  futureDemo, patientSurvey, bedFunc, ndbCheckupRiskRates, ndbCheckupRiskRatesStd, mortalityOutcome2020,
  cancerSites2024, homecareCapability, japanMap, futureYear, setFutureYear, diagByPref, hcPref, vp, causes,
  pinnedPref, setPinnedPref, hoverPref, setHoverPref, stripCommon, demoKpi, demoNat, rank75, demoStrips,
  tlYear, tlIdx, dumbbellOpen, setDumbbellOpen, tlRef, tlDrag, tlPlaying, tlToggle, fpSel, tlBands, tlJusaki,
  dumbbell, prefPop, perCap, rxDomains, gapTemplate, setGapTemplate, psMode, setPsMode, psSort, setPsSort,
  psShowTop7, setPsShowTop7, psExpanded, setPsExpanded, hoverPSKey, setHoverPSKey, psFlashKey, setPsFlashKey,
  psRowRefs, psFlashTimer, psJumpToRow, psMapOpen, setPsMapOpen, qExpandedKey, setQExpandedKey, qSort,
  setQSort, qHoverKey, setQHoverKey, qRowRefs, demandProj, setDemandProj, mortalityMode, setMortalityMode,
  mortalitySex, setMortalitySex, selectedCause, setSelectedCause, hoverCause, setHoverCause, waffleItems,
  cancerTrend, setCancerTrend, cancerTrendSex, setCancerTrendSex, trendSite, setTrendSite, trendHoverIdx,
  setTrendHoverIdx, rxAll, setRxAll, riskStdMode, setRiskStdMode, binsOpen, setBinsOpen, binsMetric,
  setBinsMetric, binsSex, setBinsSex, binsAge, setBinsAge, binsMirror, setBinsMirror, binsCdf, setBinsCdf,
  binsData, setBinsData, binsPinData, setBinsPinData, binsPulse, setBinsPulse, binsZoneHover,
  setBinsZoneHover, binsBoxRef, binsPulseTimer, binsJumpTo, activeDomain, setActiveDomain, dm, dMatch, dFade,
  dBorder, rxFade, sectionFade, rxSort, setRxSort, rxExpanded, setRxExpanded, rxHoverKey, setRxHoverKey,
  rxFlashKey, setRxFlashKey, rx4bExpanded, setRx4bExpanded, rxRowRefs, rxFlashTimer, rxJumpToRow,
  displayCauses, prefPops, prefMaps, rxShared, rxClassStrip,
  } = props;
  return (
  patientSurvey?.prefectures?.[ndbPref] && (()=>{
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
  })()

  );
}
