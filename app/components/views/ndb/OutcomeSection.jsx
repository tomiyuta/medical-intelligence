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

export default function OutcomeSection(props){
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
  causes.length > 0 && <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:18}}>📊</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>死因構造 <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fce7f3',color:'#9f1239',fontWeight:500}}>結果</span></div>
          <div style={{fontSize:11,color:'#94a3b8'}}>
            {mortalityMode === 'crude'
              ? '厚労省人口動態統計 2024年確定数（粗死亡率 人口10万対、年齢調整前）'
              : `令和5年度人口動態統計特殊報告 2020年都道府県別年齢調整死亡率（2015年(平成27年)モデル人口、${mortalitySex === 'male' ? '男' : '女'}）`}
          </div>
        </div>
      </div>
      {/* Phase 4-3 R3: 粗 vs 年齢調整 toggle */}
      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:0,background:'#f1f5f9',padding:2,borderRadius:5}}>
          <button
            onClick={() => setMortalityMode('crude')}
            style={{padding:'4px 10px',fontSize:10,fontWeight:600,border:'none',borderRadius:3,cursor:'pointer',background:mortalityMode==='crude'?'#fff':'transparent',color:mortalityMode==='crude'?'#0f172a':'#64748b',boxShadow:mortalityMode==='crude'?'0 1px 2px rgba(0,0,0,0.05)':'none'}}
            title="2024年確定数 全14死因 (年齢調整前)"
          >粗死亡率 2024</button>
          <button
            onClick={() => setMortalityMode('age_adjusted')}
            style={{padding:'4px 10px',fontSize:10,fontWeight:600,border:'none',borderRadius:3,cursor:'pointer',background:mortalityMode==='age_adjusted'?'#fff':'transparent',color:mortalityMode==='age_adjusted'?'#0f172a':'#64748b',boxShadow:mortalityMode==='age_adjusted'?'0 1px 2px rgba(0,0,0,0.05)':'none'}}
            title="2020年 6死因 (2015年(平成27年)モデル人口で年齢調整)"
          >年齢調整 2020</button>
        </div>
        {mortalityMode === 'age_adjusted' && (
          <div style={{display:'flex',gap:0,background:'#f1f5f9',padding:2,borderRadius:5}}>
            <button
              onClick={() => setMortalitySex('male')}
              style={{padding:'4px 10px',fontSize:10,fontWeight:600,border:'none',borderRadius:3,cursor:'pointer',background:mortalitySex==='male'?'#fff':'transparent',color:mortalitySex==='male'?'#1e40af':'#64748b'}}
            >男</button>
            <button
              onClick={() => setMortalitySex('female')}
              style={{padding:'4px 10px',fontSize:10,fontWeight:600,border:'none',borderRadius:3,cursor:'pointer',background:mortalitySex==='female'?'#fff':'transparent',color:mortalitySex==='female'?'#be185d':'#64748b'}}
            >女</button>
          </div>
        )}
      </div>
    </div>
    {/* P1-2: 解釈注意 (死亡率指標の誤読防止) */}
    <InterpretationGuard variant="mortality" compact={true} />
    {/* 百人ワッフル並置 — 粗2024モード専用（構成%の意味が成立する断面のみ）。
        年齢調整2020は6死因のみで全死因合計が無く構成%が定義できないため既存バー行のみ。
        domainレンズは dMatch('vitalCause') を dim フラグで移植（その他=畳込死因のいずれか該当で残す） */}
    {mortalityMode === 'crude' && waffleItems && (
      <DeathWaffle100
        items={waffleItems.map(w => ({ ...w, dim: !!activeDomain && (w.foldedList ? !w.foldedList.some(f => dMatch('vitalCause', f)) : !dMatch('vitalCause', w.cause)) }))}
        prefName={ndbPref}
        totalRatePref={vp?.total_death_rate}
        totalRateNat={vitalStats?.national?.total_death_rate}
        hoverCause={hoverCause}
        onHoverCause={setHoverCause}
        onSelectCause={(cat) => { if (cat !== WAFFLE_OTHER) setSelectedCause(prev => prev === cat ? null : cat); }}
        yearBadge={yb('vitalStats')}
        mob={mob}
      />
    )}
    {mortalityMode === 'age_adjusted' && (
      <div style={{fontSize:10,color:'#64748b',background:'#f8fafc',padding:'6px 10px',borderRadius:4,marginBottom:8,lineHeight:1.5}}>
        年齢調整モードは公式データが6死因のみで<b>全死因合計が無い</b>ため、「100人の内訳」図は粗死亡率2024でのみ表示します。各行に公式順位（47都道府県中・1位=全国最高値）を併記。
      </div>
    )}
    {/* Phase 4-3 R1: 47県 dispersion KPI 凡例 */}
    <div style={{fontSize:10,color:'#64748b',background:'#f8fafc',padding:'6px 10px',borderRadius:4,marginBottom:8,lineHeight:1.5}}
         title="CV (変動係数) = SD/平均×100。47県分布のばらつきを表す相対指標。CV が大きいほど県差が大きい。base rate (絶対値) の影響を受けないため、死因間の県差を公平比較可能。詳細: docs/ANALYSIS_MORTALITY_DISPERSION.md">
      💡 <b>県差度 (CV / max-min 比)</b>: 各バーの右に 47 県 dispersion を併記。CV 大 = 県差大。
      <span style={{color:'#94a3b8',marginLeft:8}}>体感「ガンだけ差が大」は data 上 逆の場合あり (合算で打ち消し効果)</span>
    </div>
    <div style={{display:'flex',flexDirection:'column',gap:4}}>
      {displayCauses.map((c,i)=>{
        const maxRate = displayCauses[0]?.rate || 1;
        // Phase 4-3 R1+R3: 47県 dispersion KPI 計算 (mode に応じて source 切替)
        let disp;
        if (mortalityMode === 'crude') {
          const allPref = vitalStats?.prefectures || [];
          disp = dispersionForCause(allPref, c.cause.replace(/\(.+\)/,'').trim());
        } else {
          // 年齢調整 mode: mortalityOutcome2020 から 47 県 dispersion を計算
          const moPrefs = mortalityOutcome2020?.prefectures || {};
          const data = Object.entries(moPrefs).map(([p, d]) => ({pref: p, value: d?.[c.cause]?.age_adjusted?.[mortalitySex]?.rate})).filter(x => x.value != null);
          if (data.length >= 40) {
            const vals = data.map(x => x.value);
            const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
            const variance = vals.reduce((a,b) => a + (b-mean)**2, 0) / (vals.length - 1);
            const sd = Math.sqrt(variance);
            const cv = sd / mean * 100;
            const mn = Math.min(...vals), mx = Math.max(...vals);
            const pmax = data.find(x => x.value === mx).pref;
            const pmin = data.find(x => x.value === mn).pref;
            disp = {n: data.length, mean: Math.round(mean*100)/100, sd: Math.round(sd*100)/100, cv_pct: Math.round(cv*100)/100, min: mn, max: mx, max_min_ratio: Math.round(mx/mn*1000)/1000, pref_max: pmax, pref_min: pmin};
          }
        }
        const dispLabel = classifyDispersion(disp);
        const levelColor = dispLabel?.level === 'high' ? '#dc2626' : dispLabel?.level === 'medium' ? '#d97706' : '#64748b';
        // rank1: 死因の47県分布（mode に応じ source 切替・判別不可除外）
        let causeStrip = [];
        if (mortalityMode === 'crude') {
          causeStrip = (vitalStats?.prefectures||[]).filter(p=>isP47(p.pref))
            .map(p=>({pref:p.pref, value:p.causes?.find(x=>x.cause===c.cause)?.rate})).filter(x=>x.value!=null);
        } else {
          const moPrefs = mortalityOutcome2020?.prefectures || {};
          causeStrip = Object.entries(moPrefs).filter(([p])=>isP47(p))
            .map(([p,d])=>({pref:p, value:d?.[c.cause]?.age_adjusted?.[mortalitySex]?.rate})).filter(x=>x.value!=null);
        }
        // rank5: マップ・エコー — この行が選択中か / 地図展開可否
        const mapEnabled = causeStrip.length >= 40 && !!japanMap?.prefs;
        const isMapOpen = mapEnabled && selectedCause === c.cause;
        const valueByPref = isMapOpen
          ? causeStrip.reduce((m,x)=>{ m[x.pref]=x.value; return m; }, {})
          : null;
        const mapTitle = mortalityMode === 'crude'
          ? `${c.cause.replace(/\(.+\)/,'')}・粗死亡率 2024（年齢調整前）`
          : `${c.cause.replace(/\(.+\)/,'')}・年齢調整死亡率 2020（2015年(平成27年)モデル人口・${mortalitySex==='male'?'男':'女'}）`;
        // 百人ワッフル同期（粗モードのみ）: この行のワッフル・カテゴリ（top7=死因名そのもの / 畳込=その他）
        const wCat = mortalityMode === 'crude' && waffleItems ? (WAFFLE_CAUSE_COLORS[c.cause] ? c.cause : WAFFLE_OTHER) : null;
        const swColor = wCat ? (WAFFLE_CAUSE_COLORS[c.cause] || WAFFLE_OTHER_COLOR) : null;
        const rowHl = wCat != null && hoverCause === wCat;   // 格子側 hover → 行同期ハイライト
        const sharePct = mortalityMode === 'crude' && vp?.total_death_rate ? c.rate / vp.total_death_rate * 100 : null;
        // 年齢調整モード: 公式 rank バッジ（mortality_outcome_2020 — rank は 1位=全国最高値）
        const aaRank = mortalityMode === 'age_adjusted'
          ? mortalityOutcome2020?.prefectures?.[ndbPref]?.[c.cause]?.age_adjusted?.[mortalitySex]?.rank
          : null;
        return <div key={i} style={{...dFade('vitalCause',c.cause),...dBorder('vitalCause',c.cause)}}>
          <div
            onClick={mapEnabled ? (()=>setSelectedCause(prev=>prev===c.cause?null:c.cause)) : undefined}
            onMouseEnter={wCat ? (()=>setHoverCause(wCat)) : undefined}
            onMouseLeave={wCat ? (()=>setHoverCause(null)) : undefined}
            title={mapEnabled ? (isMapOpen?'地図を閉じる':'クリックで 47 県地図を展開') : undefined}
            style={{display:'flex',alignItems:'center',gap:8,cursor:mapEnabled?'pointer':'default',background:isMapOpen?'#faf5ff':(rowHl?'#f1f5f9':'transparent'),borderRadius:4,padding:isMapOpen?'2px 4px':'0',margin:isMapOpen?'0 -4px':'0',transition:'background 200ms ease'}}
          >
            {mapEnabled && <span style={{fontSize:10,color:isMapOpen?'#7c3aed':'#cbd5e1',flexShrink:0,width:10,textAlign:'center'}}>{isMapOpen?'▾':'▸'}</span>}
            {wCat && <span title={wCat===WAFFLE_OTHER?'上のワッフルでは「その他の死因」に統合':'上のワッフル格子と同色対応'} style={{width:8,height:8,borderRadius:wCat===WAFFLE_OTHER?'50%':2,background:swColor,flexShrink:0}}/>}
            <span style={{width:mob?(mapEnabled?80:90):(mapEnabled?110:120),fontSize:12,fontWeight:500,color:'#475569',flexShrink:0}}>{c.cause.replace(/\(.+\)/,'')}</span>
            <div style={{flex:1,height:16,background:'#f1f5f9',borderRadius:3,overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:3,background:i<3?'#7c3aed':'#a78bfa',width:`${c.rate/maxRate*100}%`,opacity:0.85}}/>
            </div>
            <span style={{fontSize:12,fontWeight:600,color:'#7c3aed',fontVariantNumeric:'tabular-nums',width:60,textAlign:'right',flexShrink:0}}>{c.rate}</span>
            {sharePct != null && (
              <span title={`構成% = ${c.rate} ÷ ${vp.total_death_rate}（全死因粗死亡率/10万）— 上のワッフルの人数に対応`}
                    style={{fontSize:9,color:'#94a3b8',fontVariantNumeric:'tabular-nums',width:mob?30:38,textAlign:'right',flexShrink:0}}>
                {sharePct.toFixed(1)}%
              </span>
            )}
            {aaRank != null && (
              <span title={`公式順位（年齢調整死亡率 2020・${mortalitySex==='male'?'男':'女'}）: ${aaRank}位/47。1位=47都道府県で最も高い（全国最高値）・47位=最も低い`}
                    style={{fontSize:9,fontWeight:700,color:'#7c3aed',background:'#f5f3ff',padding:'2px 6px',borderRadius:8,flexShrink:0,cursor:'help'}}>
                {aaRank}位/47
              </span>
            )}
            {dispLabel && (
              <span
                title={dispLabel.label_full}
                style={{fontSize:9,color:levelColor,fontVariantNumeric:'tabular-nums',width:mob?75:100,textAlign:'right',flexShrink:0,cursor:'help',background:dispLabel.level==='high'?'#fef2f2':dispLabel.level==='medium'?'#fffbeb':'#f1f5f9',padding:'2px 5px',borderRadius:3,fontWeight:600}}
              >
                CV {disp.cv_pct.toFixed(1)}% / 比{disp.max_min_ratio?.toFixed(1) || '-'}
              </span>
            )}
          </div>
          {causeStrip.length >= 40 && <div style={{margin:`2px 0 4px ${mob?18:24}px`}}><PrefStrip47 {...stripCommon} values={causeStrip} yearBadge={mortalityMode==='crude'?yb('vitalStats'):yb('mortalityAdj')} mode="inline" /></div>}
          {/* rank5: マップ・エコー — 選択死因の 47 県コロプレスをその場に展開 */}
          {isMapOpen && (
            <div style={{margin:`6px 0 12px ${mob?4:24}px`}}>
              {mortalityMode === 'crude' && (
                <div style={{fontSize:10,color:'#92400e',background:'#fffbeb',borderLeft:'3px solid #f59e0b',borderRadius:3,padding:'6px 10px',marginBottom:6,lineHeight:1.5}}>
                  ⚠ <b>粗死亡率は高齢県ほど高く出ます</b>（年齢調整前）。県間の高低は年齢構成差を多分に含むため、上部の「年齢調整 2020」トグルで補正した分布と見比べてください。構成（100人の内訳）も年齢構成の影響を受けます — 高齢県は老衰・肺炎の割合が大きく出ます。
                </div>
              )}
              <PrefChoropleth
                japanMap={japanMap}
                valueByPref={valueByPref}
                selected={ndbPref}
                onSelect={setNdbPref}
                title={mapTitle}
                unit="/10万"
                yearBadge={mortalityMode==='crude'?yb('vitalStats'):yb('mortalityAdj')}
                mob={mob}
              />
              <div style={{fontSize:9,color:'#94a3b8',marginTop:5,lineHeight:1.5}}>
                色階級は各指標ごとに独立した 5 分位です。<b>地図どうしで色の濃淡は比較できません</b>（死因・調整方式・年度が変われば基準も変わります）。ここに現れる高低は「地域差の観察」であり、原因の特定ではありません。
              </div>
            </div>
          )}
        </div>;
      })}
    </div>
    {/* Phase 4-3 R1: 県差 ranking 概要 */}
    {(() => {
      const allPref = vitalStats?.prefectures || [];
      if (allPref.length < 40) return null;
      const dispersions = causes.slice(0, 8).map(c => {
        const d = dispersionForCause(allPref, c.cause.replace(/\(.+\)/,'').trim());
        return d ? { cause: c.cause.replace(/\(.+\)/,'').trim(), cv: d.cv_pct, ratio: d.max_min_ratio, mean: d.mean } : null;
      }).filter(Boolean);
      if (dispersions.length === 0) return null;
      const sorted = [...dispersions].sort((a,b) => b.cv - a.cv);
      const top = sorted[0], bottom = sorted[sorted.length - 1];
      return (
        <div style={{marginTop:10,padding:'8px 12px',background:'#fffbeb',borderLeft:'3px solid #f59e0b',borderRadius:3,fontSize:11,lineHeight:1.6}}>
          <div style={{fontWeight:700,color:'#78350f',marginBottom:3}}>📐 県差度 ranking (CV 順)</div>
          <div style={{color:'#92400e'}}>
            <b>県差最大</b>: {top.cause} (CV {top.cv.toFixed(1)}%, 比 {top.ratio?.toFixed(1)})
            <span style={{margin:'0 6px',color:'#cbd5e1'}}>vs</span>
            <b>県差最小</b>: {bottom.cause} (CV {bottom.cv.toFixed(1)}%, 比 {bottom.ratio?.toFixed(1)})
          </div>
          <div style={{fontSize:9,color:'#78350f',marginTop:3}}>注: 「県差大 = 重要」「県差小 = 不重要」ではありません。base rate (絶対値) と CV (相対ばらつき) は別の指標です。</div>
        </div>
      );
    })()}
    {/* Phase 4-3 R5: 5 大がん部位別 (75歳未満年齢調整、別 source) */}
    {cancerSites2024 && cancerSites2024.prefectures?.[ndbPref] && (() => {
      const csPref = cancerSites2024.prefectures[ndbPref];
      const csNat = cancerSites2024.national || {};
      const SITE_LABELS = [
        {key:'all', label:'全部位 (5大+他)', sex:'男女計', baseline:true},
        {key:'stomach', label:'胃', sex:'男女計'},
        {key:'colorectal', label:'大腸', sex:'男女計'},
        {key:'liver', label:'肝・肝内胆管', sex:'男女計'},
        {key:'lung', label:'肺・気管', sex:'男女計'},
        {key:'breast', label:'乳房 (女)', sex:'女'},
        {key:'prostate', label:'前立腺 (男)', sex:'男'},
      ];
      // 47 県 dispersion を計算
      const allPrefs = Object.entries(cancerSites2024.prefectures);
      const computeSiteDispersion = (siteKey, sex) => {
        const data = allPrefs.map(([p, d]) => ({pref: p, value: d[siteKey]?.[sex]})).filter(x => x.value != null);
        if (data.length < 40) return null;
        const vals = data.map(x => x.value);
        const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
        const variance = vals.reduce((a,b) => a + (b-mean)**2, 0) / (vals.length - 1);
        const sd = Math.sqrt(variance);
        const cv = sd / mean * 100;
        const mn = Math.min(...vals), mx = Math.max(...vals);
        const pmax = data.find(x => x.value === mx).pref;
        const pmin = data.find(x => x.value === mn).pref;
        return {cv, ratio: mx/mn, mean, max: mx, min: mn, pmax, pmin};
      };
      const rows = SITE_LABELS.map(s => {
        const v = csPref[s.key]?.[s.sex];
        const nat = csNat[s.key]?.[s.sex];
        const disp = computeSiteDispersion(s.key, s.sex);
        return {...s, v, nat, disp};
      }).filter(r => r.v != null);
      if (rows.length === 0) return null;
      const maxV = Math.max(...rows.map(r => r.v));
      return (
        <div style={{marginTop:16,padding:'14px 16px',background:'#fafaf9',borderRadius:8,border:'1px solid #e7e5e4',transition:'opacity 300ms ease',...(activeDomain?(activeDomain==='cancer'?{opacity:1,borderLeft:`3px solid ${DOMAIN_MAPPING.cancer.color}`}:{opacity:0.32}):{})}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <span style={{fontSize:14}}>🎯</span>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:'#1e293b'}}>5 大がん部位別 死亡率 <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fef3c7',color:'#92400e',fontWeight:500}}>R5: 部位別</span></div>
              <div style={{fontSize:10,color:'#94a3b8'}}>国立がん研究センター 2024年 75歳未満年齢調整死亡率 (人口10万対、1985 model 人口)</div>
            </div>
          </div>
          <div style={{fontSize:9,color:'#92400e',background:'#fffbeb',padding:'5px 8px',borderRadius:3,marginBottom:8,lineHeight:1.5}}>
            ⚠ caveat: 本指標は <b>75 歳未満限定</b>。上の死因構造 (全年齢粗死亡率 vital_stats) と直接比較不可。<br/>
            合算で打ち消されている部位別県差を分解して可視化 (詳細: docs/PHASE4_3_CANCER_SITES_ANALYSIS.md)
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            {rows.map((r,i) => {
              const dispLevel = r.disp ? (r.disp.cv >= 20 ? 'high' : r.disp.cv >= 10 ? 'medium' : 'low') : null;
              const lvColor = dispLevel === 'high' ? '#dc2626' : dispLevel === 'medium' ? '#d97706' : '#64748b';
              const lvBg = dispLevel === 'high' ? '#fef2f2' : dispLevel === 'medium' ? '#fffbeb' : '#f1f5f9';
              return (
                <div key={i} style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{width:mob?100:130,fontSize:11,color:r.baseline?'#475569':'#0f172a',fontWeight:r.baseline?500:600,flexShrink:0}}>
                    {r.label}
                  </span>
                  <div style={{flex:1,height:14,background:'#f5f5f4',borderRadius:2,overflow:'hidden'}}>
                    <div style={{height:'100%',background:r.baseline?'#a8a29e':'#dc2626',width:`${r.v/maxV*100}%`,opacity:0.85}}/>
                  </div>
                  <span style={{fontSize:11,fontWeight:600,color:'#dc2626',fontVariantNumeric:'tabular-nums',width:50,textAlign:'right',flexShrink:0}}>{r.v}</span>
                  <span style={{fontSize:8,color:'#94a3b8',width:48,textAlign:'right',flexShrink:0}}>全国 {r.nat?.toFixed(1) || '-'}</span>
                  {r.disp && (
                    <span
                      title={`47県分布: 平均 ${r.disp.mean.toFixed(2)}, CV ${r.disp.cv.toFixed(2)}%, max ${r.disp.max} (${r.disp.pmax}), min ${r.disp.min} (${r.disp.pmin}), max-min 比 ${r.disp.ratio.toFixed(2)}`}
                      style={{fontSize:9,color:lvColor,fontVariantNumeric:'tabular-nums',width:mob?68:90,textAlign:'right',flexShrink:0,cursor:'help',background:lvBg,padding:'2px 4px',borderRadius:3,fontWeight:600}}
                    >
                      CV {r.disp.cv.toFixed(1)}% / 比{r.disp.ratio.toFixed(1)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {(() => {
            const siteRows = rows.filter(r => !r.baseline);
            const allBase = rows.find(r => r.baseline);
            if (!allBase?.disp || siteRows.length === 0) return null;
            const maxCv = siteRows.reduce((a,b) => (a.disp?.cv||0) > (b.disp?.cv||0) ? a : b);
            const expansion = maxCv.disp.cv / allBase.disp.cv;
            return (
              <div style={{marginTop:8,padding:'7px 10px',background:'#fef3c7',borderLeft:'3px solid #f59e0b',borderRadius:3,fontSize:10,lineHeight:1.5}}>
                <b style={{color:'#92400e'}}>📊 部位別の発見</b>
                <span style={{color:'#78350f',marginLeft:6}}>
                  全部位 CV {allBase.disp.cv.toFixed(1)}% に対し <b>{maxCv.label} CV {maxCv.disp.cv.toFixed(1)}%</b> = <b>{expansion.toFixed(1)} 倍</b>。
                  合算では打ち消されていた部位別県差が顕在化。
                </span>
              </div>
            );
          })()}
        </div>
      );
    })()}

    {/* rank6: がん部位別 30 年トレンド (1995-2024 ASR75 スモールマルチプル) */}
    {cancerTrend?.allSeries?.[ndbPref] && (() => {
      const years = cancerTrend.years;
      const xN = years.length;
      const nat = cancerTrend.national || {};
      const allS = cancerTrend.allSeries;
      const sexJp = cancerTrendSex === 'male' ? '男' : '女';
      const sexColor = cancerTrendSex === 'male' ? '#1e40af' : '#be185d';
      const SITES = [
        {short:'all', label:'全部位'},
        {short:'stomach', label:'胃'},
        {short:'colorectal', label:'大腸'},
        {short:'liver', label:'肝・肝内胆管'},
        {short:'lung', label:'肺・気管'},
        {short:'breast', label:'乳房', femaleOnly:true},
        {short:'prostate', label:'前立腺', maleOnly:true},
      ].filter(s => (cancerTrendSex === 'male' ? !s.femaleOnly : !s.maleOnly));

      const firstLast = (arr) => {
        if (!arr) return null;
        let f=null,l=null;
        for (let i=0;i<arr.length;i++){ if(arr[i]!=null){ if(f==null) f=arr[i]; l=arr[i]; } }
        if (f==null||l==null||f===0) return null;
        return {first:f,last:l,pct:(l-f)/f*100};
      };
      const linePath = (arr, sx, sy) => {
        if (!arr) return '';
        let d='',started=false;
        for (let i=0;i<arr.length;i++){ const v=arr[i]; if(v==null){started=false;continue;} const X=sx(i),Y=sy(v); d+=(started?'L':'M')+X.toFixed(1)+' '+Y.toFixed(1)+' '; started=true; }
        return d.trim();
      };
      const domainOf = (...arrs) => {
        let lo=Infinity,hi=-Infinity;
        arrs.forEach(a=>{ if(a) a.forEach(v=>{ if(v!=null){ if(v<lo)lo=v; if(v>hi)hi=v; } }); });
        if(lo===Infinity) return null;
        if(lo===hi){lo-=1;hi+=1;}
        const pad=(hi-lo)*0.08; return {lo:lo-pad,hi:hi+pad};
      };

      const contStyle = {marginTop:16,padding:'14px 16px',background:'#fafaf9',borderRadius:8,border:'1px solid #e7e5e4',transition:'opacity 300ms ease',...(activeDomain?(activeDomain==='cancer'?{opacity:1,borderLeft:`3px solid ${DOMAIN_MAPPING.cancer.color}`}:{opacity:0.32}):{})};

      return (
        <div style={contStyle}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
            <span style={{fontSize:14}}>📈</span>
            <div style={{flex:1,minWidth:180}}>
              <div style={{fontSize:12,fontWeight:700,color:'#1e293b'}}>
                がん部位別 30 年トレンド
                <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#e0e7ff',color:'#3730a3',fontWeight:600}}>1995–2024 ASR75</span>
              </div>
              <div style={{fontSize:10,color:'#94a3b8'}}>{cancerTrend.source} ／ {cancerTrend.basis}（{cancerTrend.unit}）</div>
            </div>
            <div style={{display:'inline-flex',background:'#f1f5f9',borderRadius:4,padding:2}}>
              <button onClick={()=>setCancerTrendSex('male')} style={{padding:'4px 10px',fontSize:10,fontWeight:600,border:'none',borderRadius:3,cursor:'pointer',background:cancerTrendSex==='male'?'#fff':'transparent',color:cancerTrendSex==='male'?'#1e40af':'#64748b'}}>男</button>
              <button onClick={()=>setCancerTrendSex('female')} style={{padding:'4px 10px',fontSize:10,fontWeight:600,border:'none',borderRadius:3,cursor:'pointer',background:cancerTrendSex==='female'?'#fff':'transparent',color:cancerTrendSex==='female'?'#be185d':'#64748b'}}>女</button>
            </div>
          </div>
          <div style={{fontSize:9,color:'#92400e',background:'#fffbeb',padding:'5px 8px',borderRadius:3,marginBottom:10,lineHeight:1.5}}>
            ⚠ <b>75 歳未満年齢調整死亡率（1985 年モデル人口）</b> — 高齢者死亡を含まない。上の死因構造（全年齢粗死亡率 2024）とは基準が異なり直接比較不可。<br/>
            検診普及・診断精度・登録精度の変化を含むため <b>医療の質の直接指標ではない</b>。
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {SITES.map(s => {
              const prefArr = allS[ndbPref]?.[s.short]?.[sexJp];
              const natArr = nat[s.short]?.[sexJp];
              if (!prefArr && !natArr) return null;
              const dom = domainOf(prefArr, natArr);
              if (!dom) return null;
              const W=150,H=58,pL=4,pR=6,pT=6,pB=6;
              const pw=W-pL-pR, ph=H-pT-pB;
              const sx=i=> pL + (xN<=1?0:i/(xN-1))*pw;
              const sy=v=> pT + (1-(v-dom.lo)/(dom.hi-dom.lo))*ph;
              const fl = firstLast(prefArr);
              const active = trendSite===s.short;
              const lastIdx = prefArr ? (()=>{ for(let i=prefArr.length-1;i>=0;i--) if(prefArr[i]!=null) return i; return -1; })() : -1;
              return (
                <button key={s.short} onClick={()=>setTrendSite(active?null:s.short)}
                  style={{textAlign:'left',background:'#fff',border:'1px solid '+(active?sexColor:'#e7e5e4'),borderRadius:6,padding:'6px 8px',cursor:'pointer',transition:'border-color 150ms'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:4,marginBottom:2}}>
                    <span style={{fontSize:11,fontWeight:700,color:'#0f172a'}}>{s.label}</span>
                    {fl && <span style={{fontSize:9,fontWeight:700,fontVariantNumeric:'tabular-nums',color:fl.pct<0?'#059669':'#dc2626'}}>{fl.pct<0?'▼':'▲'}{Math.abs(fl.pct).toFixed(0)}%</span>}
                  </div>
                  <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',display:'block'}}>
                    {natArr && <path d={linePath(natArr,sx,sy)} fill="none" stroke="#cbd5e1" strokeWidth={1.4} strokeDasharray="3,2"/>}
                    {prefArr && <path d={linePath(prefArr,sx,sy)} fill="none" stroke={sexColor} strokeWidth={1.8}/>}
                    {lastIdx>=0 && <circle cx={sx(lastIdx)} cy={sy(prefArr[lastIdx])} r={2.2} fill={sexColor}/>}
                  </svg>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:8,color:'#94a3b8',marginTop:1}}>
                    <span>1995</span>
                    <span style={{color:sexColor,fontWeight:600}}>{ndbPref}</span>
                    <span>2024</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{fontSize:9,color:'#94a3b8',marginTop:6,lineHeight:1.6}}>
            <span style={{display:'inline-block',width:14,borderTop:`2px solid ${sexColor}`,verticalAlign:'middle',marginRight:3}}/> {ndbPref}
            <span style={{display:'inline-block',width:14,borderTop:'2px dashed #cbd5e1',verticalAlign:'middle',margin:'0 3px 0 10px'}}/> 全国　·　▼/▲＝30 年変化率　·　タイル click で 47 県分布を全幅展開
          </div>

          {trendSite && (() => {
            const site = SITES.find(s=>s.short===trendSite) || {short:trendSite,label:trendSite};
            const natArr = nat[trendSite]?.[sexJp];
            const prefArr = allS[ndbPref]?.[trendSite]?.[sexJp];
            const allArrs = Object.entries(allS).map(([p,d])=>({pref:p, arr:d?.[trendSite]?.[sexJp]})).filter(x=>x.arr);
            const dom = domainOf(...allArrs.map(x=>x.arr), natArr);
            if (!dom) return null;
            const EW=mob?340:660, EH=270, pL=42,pR=14,pT=14,pB=30;
            const pw=EW-pL-pR, ph=EH-pT-pB;
            const sx=i=> pL + (xN<=1?0:i/(xN-1))*pw;
            const sy=v=> pT + (1-(v-dom.lo)/(dom.hi-dom.lo))*ph;
            const ticks=[1995,2005,2015,2024];
            const yTicks=[dom.lo,(dom.lo+dom.hi)/2,dom.hi];
            const hi=trendHoverIdx;
            let rankInfo=null;
            if(hi!=null){ const vals=allArrs.map(x=>({pref:x.pref,v:x.arr[hi]})).filter(x=>x.v!=null).sort((a,b)=>b.v-a.v); const idx=vals.findIndex(x=>x.pref===ndbPref); rankInfo={n:vals.length,rank:idx>=0?idx+1:null,self:prefArr?prefArr[hi]:null,natV:natArr?natArr[hi]:null}; }
            const onMove=(e)=>{ const r=e.currentTarget.getBoundingClientRect(); const xv=(e.clientX-r.left)/r.width*EW; let i=Math.round((xv-pL)/(pw||1)*(xN-1)); i=Math.max(0,Math.min(xN-1,i)); setTrendHoverIdx(i); };
            return (
              <div style={{marginTop:12,padding:'10px 12px',background:'#fff',border:`1px solid ${sexColor}33`,borderRadius:6}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <div style={{fontSize:11,fontWeight:700,color:'#0f172a'}}>{site.label} — 47 県分布の 30 年推移（{sexJp}・ASR75）</div>
                  <button onClick={()=>{setTrendSite(null);setTrendHoverIdx(null);}} style={{fontSize:10,color:'#64748b',background:'transparent',border:'none',cursor:'pointer'}}>× 閉じる</button>
                </div>
                <svg viewBox={`0 0 ${EW} ${EH}`} style={{width:'100%',display:'block',touchAction:'none'}} onMouseMove={onMove} onMouseLeave={()=>setTrendHoverIdx(null)}>
                  {yTicks.map((v,i)=>(<g key={i}><line x1={pL} y1={sy(v)} x2={EW-pR} y2={sy(v)} stroke="#f1f5f9" strokeWidth={1}/><text x={pL-4} y={sy(v)+3} textAnchor="end" fontSize={8} fill="#94a3b8">{v.toFixed(0)}</text></g>))}
                  {ticks.map(y=>{ const i=years.indexOf(y); if(i<0) return null; return <text key={y} x={sx(i)} y={EH-pB+16} textAnchor="middle" fontSize={9} fill="#64748b">{y}</text>; })}
                  {allArrs.map(x=> x.pref===ndbPref?null:<path key={x.pref} d={linePath(x.arr,sx,sy)} fill="none" stroke="#e2e8f0" strokeWidth={1}/>)}
                  {natArr && <path d={linePath(natArr,sx,sy)} fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="4,3"/>}
                  {prefArr && <path d={linePath(prefArr,sx,sy)} fill="none" stroke={sexColor} strokeWidth={2.6}/>}
                  {hi!=null && <line x1={sx(hi)} y1={pT} x2={sx(hi)} y2={EH-pB} stroke={sexColor} strokeWidth={1} strokeDasharray="2,2" opacity={0.6}/>}
                  {hi!=null && prefArr && prefArr[hi]!=null && <circle cx={sx(hi)} cy={sy(prefArr[hi])} r={3.5} fill={sexColor}/>}
                  {hi!=null && natArr && natArr[hi]!=null && <circle cx={sx(hi)} cy={sy(natArr[hi])} r={2.8} fill="#94a3b8"/>}
                </svg>
                <div style={{minHeight:18,fontSize:10,color:'#475569',marginTop:2,lineHeight:1.5}}>
                  {rankInfo ? (
                    <span><b style={{color:sexColor}}>{years[hi]}年</b>　{ndbPref} {rankInfo.self!=null?rankInfo.self.toFixed(1):'—'}（全国 {rankInfo.natV!=null?rankInfo.natV.toFixed(1):'—'}）　{rankInfo.rank?`高い順 ${rankInfo.rank} / ${rankInfo.n} 位`:''}</span>
                  ) : (
                    <span style={{color:'#94a3b8'}}>チャートにカーソルを合わせるとその年の {ndbPref} の値・全国値・47 県順位を表示（薄灰＝他 46 県、破線＝全国）</span>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      );
    })()}
  </div>

  );
}
