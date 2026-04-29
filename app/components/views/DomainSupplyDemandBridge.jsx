'use client';
import { useState } from 'react';
import { DOMAIN_MAPPING, describeDelta, DATA_BADGE } from '../../../lib/domainMapping';
import InterpretationGuard from '../ui/InterpretationGuard';

const MAX_RISKS_COLLAPSED = 3;

const ACTIVE_FUNCS = ['高度急性期', '急性期', '回復期', '慢性期'];

export default function DomainSupplyDemandBridge({ ndbPref, patientSurvey, ndbQ, vitalStats, bedFunc, ndbRx, agePyramid, mob, ndbHc, ndbCheckupRiskRates, ndbCheckupRiskRatesStd, mortalityOutcome2020 }) {
  // Phase 2A: risks[] が4件以上の領域は3件で折りたたみ表示
  const [expandedRisks, setExpandedRisks] = useState({});
  const toggleExpand = (id) => setExpandedRisks(prev => ({ ...prev, [id]: !prev[id] }));
  if (!ndbPref) return null;

  // 各データソースから pref/national を抽出
  const psNat = patientSurvey?.prefectures?.['全国'];
  const psPref = patientSurvey?.prefectures?.[ndbPref];
  // ndbQ には '全国' エントリがないため、47都道府県の単純平均を国の代理として計算
  const ndbQNat = (() => {
    const direct = ndbQ?.prefectures?.['全国'];
    if (direct) return direct;
    const prefs = ndbQ?.prefectures || {};
    const valid = Object.entries(prefs).filter(([k,v]) => k !== '都道府県判別不可' && typeof v === 'object');
    if (valid.length === 0) return null;
    const keys = Object.keys(valid[0][1]);
    const result = {};
    for (const k of keys) {
      const vals = valid.map(([, v]) => v[k]).filter(v => typeof v === 'number');
      if (vals.length > 0) result[k] = vals.reduce((s,v) => s+v, 0) / vals.length;
    }
    return result;
  })();
  const ndbQPref = ndbQ?.prefectures?.[ndbPref];
  const vsNat = vitalStats?.national;
  const vsPref = vitalStats?.prefectures?.find(p => p.pref === ndbPref);
  // Phase 4-1 P1-1: 2020年 粗死亡率 + 年齢調整死亡率 (新規)
  const moPref = mortalityOutcome2020?.prefectures?.[ndbPref];
  const moNat = mortalityOutcome2020?.national;
  // Outcome の3段データ取得ヘルパー
  // 戻り値: { crude2020: {male, female}, ageAdj2020: {male, female}, crude2024: total }
  const getOutcomeTriad = (cfg) => {
    if (!cfg) return null;
    const aamCause = cfg.aamCause;
    const aamPref = aamCause ? moPref?.[aamCause] : null;
    const aamNat = aamCause ? moNat?.[aamCause] : null;
    const c2024Pref = vsPref?.causes?.find(c => c.cause === cfg.vitalCause)?.rate;
    const c2024Nat = vsNat?.causes?.find(c => c.cause === cfg.vitalCause)?.rate;
    return {
      crude2020: aamPref?.crude || null,
      ageAdj2020: aamPref?.age_adjusted || null,
      crude2020Nat: aamNat?.crude || null,
      ageAdj2020Nat: aamNat?.age_adjusted || null,
      crude2024: c2024Pref,
      crude2024Nat: c2024Nat,
    };
  };
  const bfNat = bedFunc?.national;
  const bfPref = bedFunc?.prefectures?.[ndbPref];

  // 都道府県人口の集計 (agePyramid 21年齢帯から男+女合計)
  const computePop = (prefName) => {
    if (!agePyramid?.prefectures) return null;
    const ap = agePyramid.prefectures[prefName];
    if (!ap?.male || !ap?.female) return null;
    let sum = 0;
    for (let i = 0; i < ap.male.length; i++) sum += (ap.male[i] || 0) + (ap.female[i] || 0);
    return sum;
  };

  // 処方proxy: 都道府県別 対象code合計qty / 人口 × 100000
  const computeRxProxy = (prefName, codes) => {
    if (!ndbRx || !prefName || !codes?.length) return null;
    const sum = ndbRx
      .filter(d => d.pref === prefName && codes.includes(d.code))
      .reduce((s, d) => s + (d.qty || 0), 0);
    const pop = computePop(prefName);
    if (!pop || sum === 0) return null;
    return sum / pop * 100000;
  };

  // 47都道府県の単純平均 proxy (人口加重なし)
  const compute47Avg = (codes) => {
    if (!ndbRx || !agePyramid?.prefectures) return null;
    const proxies = Object.keys(agePyramid.prefectures)
      .map(p => computeRxProxy(p, codes))
      .filter(v => v != null);
    if (proxies.length === 0) return null;
    return proxies.reduce((s, v) => s + v, 0) / proxies.length;
  };

  // bedFunc から機能区分シェアを計算
  const computeBfShare = (bf, keys) => {
    if (!bf) return null;
    const total = bf['総床数'] || 0;
    if (total === 0) return null;
    return keys.reduce((s, k) => s + ((bf[k]?.beds || 0) / total * 100), 0);
  };

  // ─────────────────────────────────────────────────────────────────
  // Bridge Risk Model v1: risks[] 配列の各要素を処理するヘルパー
  // ─────────────────────────────────────────────────────────────────
  const getRiskCell = (riskCfg) => {
    if (!riskCfg) return null;
    let prefVal = null, natVal = null;
    let refLabel = '47都道府県平均';
    if (riskCfg.source === 'ndbCheckupRiskRate') {
      // NDB特定健診 リスク該当者率 (Phase 1 v1: bmi_ge_25, hba1c_ge_6_5, sbp_ge_140, ldl_ge_140, urine_protein_ge_1plus)
      const rates = ndbCheckupRiskRates?.risk_rates?.[riskCfg.riskKey];
      if (rates) {
        prefVal = rates.by_pref?.[ndbPref]?.rate;
        const all = Object.values(rates.by_pref || {}).map(v => v.rate).filter(v => typeof v === 'number');
        if (all.length > 0) natVal = all.reduce((s,v) => s+v, 0) / all.length;
      }
      // Phase 2C-1: 年齢標準化率も併記 (47県内標準人口で直接標準化)
      const stdRates = ndbCheckupRiskRatesStd?.risk_rates?.[riskCfg.riskKey];
      if (stdRates?.by_pref?.[ndbPref]) {
        const e = stdRates.by_pref[ndbPref];
        riskCfg._stdInfo = {
          stdRate: e.age_standardized_rate,
          deltaPp: e.delta_pp,
        };
      }
    } else if (riskCfg.source === 'ndbHc') {
      // NDB健診 平均値 (eGFR等)。男女平均を県値とする
      const hcRecs = Array.isArray(ndbHc) ? ndbHc.filter(h => h.metric === riskCfg.ndbHcMetric) : [];
      const prefRec = hcRecs.find(h => h.pref === ndbPref);
      if (prefRec) prefVal = (prefRec.male + prefRec.female) / 2;
      const valid = hcRecs.filter(h => h.pref !== '全国');
      if (valid.length > 0) natVal = valid.reduce((s,h) => s + (h.male+h.female)/2, 0) / valid.length;
    } else if (riskCfg.source === 'ndbQ') {
      // NDB質問票
      prefVal = ndbQPref?.[riskCfg.ndbQKey];
      natVal = ndbQNat?.[riskCfg.ndbQKey];
    }
    if (prefVal == null) return { ...riskCfg, missing: true };
    const delta = describeDelta(prefVal, natVal, riskCfg.direction || 'higher_worse', undefined, undefined, refLabel);
    return { ...riskCfg, prefVal, natVal, delta };
  };

  // 各セルの値を取得するヘルパー (demand/utilization/supply/outcome)
  const getCell = (domain, type) => {
    const cfg = domain[type];
    if (!cfg) return null;
    let prefVal = null, natVal = null, label = cfg.label, unit = cfg.unit, note = cfg.note;

    let refLabel = '全国平均';
    if (type === 'demand') {
      const psKey = cfg.patientSurveyKey;
      prefVal = psPref?.categories?.[psKey]?.outpatient;
      natVal = psNat?.categories?.[psKey]?.outpatient;
    } else if (type === 'utilization') {
      prefVal = computeRxProxy(ndbPref, cfg.codes);
      natVal = compute47Avg(cfg.codes);
      refLabel = '47都道府県平均'; // 処方薬データに'全国'集計値がないため47県平均を使用
    } else if (type === 'supply') {
      prefVal = computeBfShare(bfPref, cfg.bedFuncKeys);
      natVal = computeBfShare(bfNat, cfg.bedFuncKeys);
    } else if (type === 'outcome') {
      prefVal = vsPref?.causes?.find(c => c.cause === cfg.vitalCause)?.rate;
      natVal = vsNat?.causes?.find(c => c.cause === cfg.vitalCause)?.rate;
    }

    if (prefVal == null) return { label, unit, note, missing: true, basis: cfg.basis };
    const delta = describeDelta(prefVal, natVal, cfg.direction || 'higher_worse', undefined, undefined, refLabel);
    return { label, unit, note, prefVal, natVal, delta, proxyLabel: cfg.proxyLabel, basis: cfg.basis };
  };

  const fmtVal = (v, unit) => {
    if (v == null) return '—';
    if (typeof v !== 'number') return String(v);
    // 1000以上はカンマ区切り整数 (処方薬proxyなど大きな値)
    if (v >= 1000) return Math.round(v).toLocaleString('ja-JP');
    if (v % 1 === 0) return v.toString();
    return v.toFixed(1);
  };

  return (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <span style={{fontSize:18}}>🔗</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>
            疾患別 需要・供給・結果サマリー (v1)
            <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#e0e7ff',color:'#3730a3',fontWeight:500}}>6領域・複数riskモデル</span>
            <span style={{marginLeft:4,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#fef3c7',color:'#92400e',fontWeight:500}}>🆙 Risk Model v1</span>
          </div>
          <div style={{fontSize:11,color:'#94a3b8'}}>
            循環器・糖尿病代謝・がん の各領域で「リスク・疾病負荷・医療利用・供給proxy・結果」を{ndbPref}と全国で横並び観察 (独立軸、因果連鎖は仮定しない)
          </div>
        </div>
      </div>

      {/* P1-2: 解釈注意 (Bridge OUTCOME 周辺の誤読防止) */}
      <InterpretationGuard variant="outcome" />

      {/* テーブル */}
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:mob?720:0}}>
          <thead>
            <tr style={{background:'#fafbfc',borderBottom:'2px solid #e2e8f0'}}>
              <th style={{padding:'10px 12px',textAlign:'left',fontSize:11,fontWeight:600,color:'#94a3b8',borderRight:'1px solid #f1f5f9',minWidth:120}}>領域</th>
              {[
                ['リスク', DATA_BADGE.risk],
                ['疾病負荷', DATA_BADGE.demand],
                ['医療利用', DATA_BADGE.utilization],
                ['供給proxy', DATA_BADGE.supply],
                ['結果', DATA_BADGE.outcome],
              ].map(([title, badge], i) => (
                <th key={i} style={{padding:'10px 8px',textAlign:'left',fontSize:11,fontWeight:600,color:'#94a3b8',minWidth:140,verticalAlign:'top'}}>
                  <div>{title}</div>
                  <span style={{display:'inline-block',marginTop:3,padding:'1px 6px',borderRadius:4,background:badge.bg,color:badge.fg,fontSize:9,fontWeight:600}}>{badge.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.values(DOMAIN_MAPPING).map(domain => {
              // Bridge Risk Model v1: risks[] 配列対応
              const riskCells = (domain.risks || []).map(getRiskCell).filter(Boolean);
              const demand = domain.demand ? getCell(domain, 'demand') : null;
              const supply = domain.supply ? getCell(domain, 'supply') : null;
              const outcome = domain.outcome ? getCell(domain, 'outcome') : null;

              const renderCell = (cell, fallbackText) => {
                if (!cell) return <span style={{fontSize:11,color:'#cbd5e1'}}>{fallbackText || '—'}</span>;
                if (cell.missing) return <span style={{fontSize:11,color:'#cbd5e1'}}>データなし</span>;
                return (
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:'#1e293b'}}>
                      {fmtVal(cell.prefVal, cell.unit === '%' ? '%' : '')}
                      {cell.unit !== '%' && <span style={{fontSize:10,color:'#94a3b8',marginLeft:2}}>{cell.unit}</span>}
                    </div>
                    {cell.delta && (
                      <div style={{fontSize:10,color:cell.delta.color,fontWeight:600,marginTop:2}}>
                        {cell.delta.label} ({cell.delta.deltaPct > 0 ? '+' : ''}{cell.delta.deltaPct.toFixed(1)}%)
                      </div>
                    )}
                    {cell.proxyLabel && (
                      <div style={{fontSize:9,fontWeight:600,color:'#92400e',marginTop:2,padding:'1px 4px',background:'#fef3c7',borderRadius:3,display:'inline-block'}}>{cell.proxyLabel}</div>
                    )}
                    {cell.basis && (
                      <div style={{fontSize:9,fontWeight:500,color:'#155e75',marginTop:2,padding:'1px 4px',background:'#cffafe',borderRadius:3,display:'inline-block'}}>{cell.basis}</div>
                    )}
                    <div style={{fontSize:9,color:'#cbd5e1',marginTop:3,lineHeight:1.4}}>{cell.label}</div>
                    {cell.note && (
                      <div style={{fontSize:9,color:'#94a3b8',marginTop:2,lineHeight:1.4,fontStyle:'italic'}}>※{cell.note}</div>
                    )}
                  </div>
                );
              };

              return (
                <tr key={domain.id} style={{borderBottom:'1px solid #f1f5f9',background:domain.bg}}>
                  <td style={{padding:'12px',borderRight:'1px solid #f1f5f9',verticalAlign:'top'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                      <span style={{fontSize:18}}>{domain.icon}</span>
                      <span style={{fontSize:13,fontWeight:700,color:domain.color}}>{domain.label}</span>
                      {domain.isExperimental && (
                        <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'#fef3c7',color:'#92400e',fontWeight:600}}>🧪 v1 exp</span>
                      )}
                    </div>
                    {domain.isExperimental && domain.experimentalNote && (
                      <div style={{fontSize:9,color:'#78350f',marginTop:4,lineHeight:1.4,fontStyle:'italic'}}>{domain.experimentalNote}</div>
                    )}
                  </td>
                  <td style={{padding:'12px 8px',verticalAlign:'top'}}>
                    {riskCells.length === 0 ? (
                      <span style={{fontSize:11,color:'#cbd5e1'}}>—</span>
                    ) : (() => {
                      // Phase 2A: 3件超で折りたたみ
                      const isExpanded = !!expandedRisks[domain.id];
                      const visibleCells = isExpanded ? riskCells : riskCells.slice(0, MAX_RISKS_COLLAPSED);
                      const hiddenCount = riskCells.length - visibleCells.length;
                      return (
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          {visibleCells.map((rc, ri) => (
                            <div key={ri} style={{paddingBottom: ri < visibleCells.length-1 ? 6 : 0, borderBottom: ri < visibleCells.length-1 ? '1px dashed #e2e8f0' : 'none'}}>
                              {rc.missing ? (
                                <div>
                                  <div style={{fontSize:11,color:'#cbd5e1'}}>データなし</div>
                                  <div style={{fontSize:9,color:'#cbd5e1',marginTop:2}}>{rc.label}</div>
                                </div>
                              ) : (
                                <div>
                                  <div style={{display:'flex',alignItems:'baseline',gap:4,flexWrap:'wrap'}}>
                                    <span style={{fontSize:13,fontWeight:600,color:'#1e293b'}}>
                                      {fmtVal(rc.prefVal, rc.unit === '%' ? '%' : '')}
                                      {rc.unit !== '%' && <span style={{fontSize:10,color:'#94a3b8',marginLeft:2}}>{rc.unit}</span>}
                                    </span>
                                    {rc.legacy && (
                                      <span title="Bridge v0 から継承した旧risk proxy" style={{fontSize:8,padding:'0 4px',background:'transparent',color:'#cbd5e1',border:'1px solid #e2e8f0',borderRadius:3,fontWeight:500}}>v0</span>
                                    )}
                                  </div>
                                  {rc.delta && (
                                    <div style={{fontSize:10,color:rc.delta.color,fontWeight:600,marginTop:1}}>
                                      {rc.delta.label} ({rc.delta.deltaPct > 0 ? '+' : ''}{rc.delta.deltaPct.toFixed(1)}%)
                                    </div>
                                  )}
                                  <div style={{fontSize:9,color:'#94a3b8',marginTop:2,lineHeight:1.4}}>{rc.label}</div>
                                  {rc._stdInfo && rc._stdInfo.stdRate != null && (
                                    <div title="NDB内標準人口で直接標準化 (47県合算 sex × age_group)" style={{fontSize:9,color:'#7c3aed',marginTop:1,lineHeight:1.4,fontWeight:500}}>
                                      年齢標準化: {rc._stdInfo.stdRate.toFixed(1)}% ({rc._stdInfo.deltaPp >= 0 ? '+' : ''}{rc._stdInfo.deltaPp.toFixed(1)}pp)
                                    </div>
                                  )}
                                  {rc.note && (
                                    <div style={{fontSize:8,color:'#cbd5e1',marginTop:1,lineHeight:1.4,fontStyle:'italic'}}>※{rc.note}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                          {(hiddenCount > 0 || isExpanded) && (
                            <button
                              onClick={() => toggleExpand(domain.id)}
                              style={{marginTop:4,padding:'3px 8px',fontSize:10,fontWeight:600,color:'#475569',background:'#f1f5f9',border:'1px solid #e2e8f0',borderRadius:4,cursor:'pointer',alignSelf:'flex-start'}}
                            >
                              {isExpanded ? '▲ 折りたたむ' : `▼ +${hiddenCount}指標を表示`}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{padding:'12px 8px',verticalAlign:'top'}}>
                    {demand
                      ? renderCell(demand)
                      : (
                        <div style={{fontSize:11,color:'#92400e',fontWeight:500,padding:'4px 8px',background:'#fef3c7',borderRadius:4,display:'inline-block'}}>
                          ⚠ 独立データなし
                          <div style={{fontSize:9,color:'#78350f',marginTop:3,lineHeight:1.5,fontWeight:400,maxWidth:180}}>{domain.demandNote || ''}</div>
                        </div>
                      )
                    }
                  </td>
                  <td style={{padding:'12px 8px',verticalAlign:'top'}}>
                    {(() => {
                      const util = domain.utilization ? getCell(domain, 'utilization') : null;
                      if (!util) return (
                        <div style={{fontSize:11,color:'#92400e',fontWeight:500,padding:'4px 8px',background:'#fef3c7',borderRadius:4,display:'inline-block'}}>
                          ⚠ proxy未整備
                          <div style={{fontSize:9,color:'#78350f',marginTop:3,lineHeight:1.5,fontWeight:400,maxWidth:180}}>{domain.utilizationNote || ''}</div>
                        </div>
                      );
                      return renderCell(util);
                    })()}
                  </td>
                  <td style={{padding:'12px 8px',verticalAlign:'top'}}>
                    {supply
                      ? renderCell(supply)
                      : (
                        <div style={{fontSize:11,color:'#92400e',fontWeight:500,padding:'4px 8px',background:'#fef3c7',borderRadius:4,display:'inline-block'}}>
                          ⚠ proxy未整備
                          <div style={{fontSize:9,color:'#78350f',marginTop:3,lineHeight:1.5,fontWeight:400,maxWidth:180}}>{domain.supplyNote || ''}</div>
                        </div>
                      )
                    }
                  </td>
                  <td style={{padding:'12px 8px',verticalAlign:'top'}}>
                    {(() => {
                      // Phase 4-1 P1-1: Outcome 3段表示 (2020粗 / 2020年齢調整 / 2024粗)
                      const triad = domain.outcome ? getOutcomeTriad(domain.outcome) : null;
                      const causeLabel = domain.outcome?.label || '';
                      if (!triad || (!triad.crude2020 && !triad.ageAdj2020 && triad.crude2024 == null)) {
                        return <span style={{fontSize:11,color:'#cbd5e1'}}>データなし</span>;
                      }
                      const fmt = (v) => v == null ? '—' : (typeof v === 'number' ? v.toFixed(1) : String(v));
                      // delta 計算: 値 vs 全国
                      const deltaPct = (val, nat) => (val == null || nat == null || nat === 0) ? null : ((val/nat - 1) * 100);
                      const deltaColor = (pct) => pct == null ? '#94a3b8' : (pct > 5 ? '#dc2626' : pct < -5 ? '#16a34a' : '#94a3b8');
                      const deltaLabel = (pct) => pct == null ? '' : ((pct > 0 ? '+' : '') + pct.toFixed(1) + '%');
                      // 男女平均 (簡易: 男+女)/2 — 人口加重未対応 (P2将来)
                      const avg = (m, f) => (m == null || f == null) ? null : (m + f) / 2;
                      const pAvgC = avg(triad.crude2020?.male?.rate, triad.crude2020?.female?.rate);
                      const nAvgC = avg(triad.crude2020Nat?.male?.rate, triad.crude2020Nat?.female?.rate);
                      const pAvgA = avg(triad.ageAdj2020?.male?.rate, triad.ageAdj2020?.female?.rate);
                      const nAvgA = avg(triad.ageAdj2020Nat?.male?.rate, triad.ageAdj2020Nat?.female?.rate);

                      return (
                        <div>
                          {/* 2020 粗死亡率 */}
                          {triad.crude2020 && (
                            <div style={{marginBottom:8}}>
                              <div style={{fontSize:9,fontWeight:600,color:'#64748b',marginBottom:2}}>2020 粗死亡率</div>
                              <div style={{fontSize:11,color:'#475569'}}>
                                男 <b>{fmt(triad.crude2020.male?.rate)}</b>
                                <span style={{fontSize:9,color:'#94a3b8',marginLeft:4}}>({triad.crude2020.male?.rank}位)</span>
                                {' / '}
                                女 <b>{fmt(triad.crude2020.female?.rate)}</b>
                                <span style={{fontSize:9,color:'#94a3b8',marginLeft:4}}>({triad.crude2020.female?.rank}位)</span>
                              </div>
                              {pAvgC != null && nAvgC != null && (
                                <div style={{fontSize:9,color:deltaColor(deltaPct(pAvgC, nAvgC)),fontWeight:600,marginTop:1}}>
                                  vs 全国平均 {deltaLabel(deltaPct(pAvgC, nAvgC))}
                                </div>
                              )}
                            </div>
                          )}
                          {/* 2020 年齢調整死亡率 (主指標) */}
                          {triad.ageAdj2020 && (
                            <div style={{marginBottom:8,padding:'6px 8px',background:'#faf5ff',borderRadius:4,borderLeft:'3px solid #a855f7'}}>
                              <div style={{fontSize:9,fontWeight:700,color:'#7c3aed',marginBottom:2}}>2020 年齢調整死亡率（主指標）</div>
                              <div style={{fontSize:13,fontWeight:700,color:'#581c87'}}>
                                男 {fmt(triad.ageAdj2020.male?.rate)}
                                <span style={{fontSize:9,color:'#a855f7',marginLeft:4}}>({triad.ageAdj2020.male?.rank}位)</span>
                              </div>
                              <div style={{fontSize:13,fontWeight:700,color:'#581c87'}}>
                                女 {fmt(triad.ageAdj2020.female?.rate)}
                                <span style={{fontSize:9,color:'#a855f7',marginLeft:4}}>({triad.ageAdj2020.female?.rank}位)</span>
                              </div>
                              {pAvgA != null && nAvgA != null && (
                                <div style={{fontSize:9,color:deltaColor(deltaPct(pAvgA, nAvgA)),fontWeight:600,marginTop:2}}>
                                  vs 全国平均 {deltaLabel(deltaPct(pAvgA, nAvgA))}
                                </div>
                              )}
                            </div>
                          )}
                          {/* 2024 粗死亡率 (最新参考) */}
                          {triad.crude2024 != null && (
                            <div style={{marginTop:8,paddingTop:6,borderTop:'1px dashed #e2e8f0'}}>
                              <div style={{fontSize:9,fontWeight:600,color:'#64748b',marginBottom:2}}>2024 粗死亡率（最新参考）</div>
                              <div style={{fontSize:11,color:'#475569'}}>
                                総数 <b>{fmt(triad.crude2024)}</b>
                                <span style={{fontSize:9,color:'#94a3b8',marginLeft:4}}>/10万</span>
                              </div>
                              {triad.crude2024Nat != null && (
                                <div style={{fontSize:9,color:deltaColor(deltaPct(triad.crude2024, triad.crude2024Nat)),fontWeight:600,marginTop:1}}>
                                  vs 全国 {deltaLabel(deltaPct(triad.crude2024, triad.crude2024Nat))}
                                </div>
                              )}
                            </div>
                          )}
                          {/* 注記 */}
                          <div style={{fontSize:9,color:'#94a3b8',marginTop:6,lineHeight:1.5,fontStyle:'italic'}}>
                            ※ 2020年齢調整値と2024粗死亡率を直接比較しない<br/>
                            ※ 男女平均は単純平均（人口加重なし）<br/>
                            ※ 死亡率は医療の優劣を示す指標ではない
                          </div>
                          <div style={{fontSize:9,color:'#cbd5e1',marginTop:3,lineHeight:1.4}}>{causeLabel}</div>
                        </div>
                      );
                    })()}
                    {domain.outcome?.additionalCauses?.map((ac, ai) => {
                      const acPref = vsPref?.causes?.find(c => c.cause === ac.vitalCause)?.rate;
                      const acNat = vsNat?.causes?.find(c => c.cause === ac.vitalCause)?.rate;
                      const acDelta = describeDelta(acPref, acNat, 'higher_worse');
                      if (acPref == null) return null;
                      return (
                        <div key={ai} style={{marginTop:10,paddingTop:8,borderTop:'1px dashed #e2e8f0'}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#1e293b'}}>
                            {fmtVal(acPref, '')}
                            <span style={{fontSize:10,color:'#94a3b8',marginLeft:2}}>{ac.unit}</span>
                          </div>
                          {acDelta && (
                            <div style={{fontSize:10,color:acDelta.color,fontWeight:600,marginTop:2}}>
                              {acDelta.label} ({acDelta.deltaPct > 0 ? '+' : ''}{acDelta.deltaPct.toFixed(1)}%)
                            </div>
                          )}
                          <div style={{fontSize:9,color:'#cbd5e1',marginTop:3,lineHeight:1.4}}>{ac.label}（2024粗）</div>
                        </div>
                      );
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 注記 */}
      <div style={{fontSize:10,color:'#94a3b8',marginTop:14,lineHeight:1.7,padding:'10px 14px',background:'#f8fafc',borderRadius:6}}>
        <b style={{color:'#475569'}}>📌 Bridge Risk Model v1 の制約と注意点</b><br/>
        ・<b>v1 (2026-04-28 採択):</b> リスク列は単一proxyから <code>risks[]</code> 配列(複数指標)へ移行。NDB健診リスク率 (BMI/HbA1c/SBP/LDL/尿蛋白) と質問票 (服薬・既往) を統合。<br/>
        ・既存リスクは <span style={{padding:'0 4px',background:'transparent',color:'#cbd5e1',border:'1px solid #e2e8f0',borderRadius:3,fontSize:9}}>v0</span> ラベル(Bridge v0からの継承指標)で保持。新規追加リスクと並列表示。<br/>
        ・リスク4件以上の領域はデフォルト3件表示。「+N指標を表示」で展開できます。<br/>
        ・📖 解釈仕様: <a href="https://github.com/tomiyuta/medical-intelligence/blob/main/docs/BRIDGE_V1_INTERPRETATION.md" target="_blank" rel="noopener noreferrer" style={{color:'#2563eb',textDecoration:'underline'}}>Bridge Risk Model v1 解釈仕様</a> (GitHub)<br/>
        ・<span style={{color:'#7c3aed',fontWeight:500}}>年齢標準化率</span>: NDB特定健診の5項目(BMI/HbA1c/SBP/LDL/尿蛋白)について、47県合算の性年齢階級構成を標準人口とした直接標準化率を併記。地域差が年齢構成由来かを判別可能 (Phase 2C-1)。<br/>
        ・脳血管/呼吸器/腎疾患は <b>v1 experimental</b> (5列中の一部空白あり)。<br/>
        ・本サマリーは <b>スコア化を行わず</b>、データ並べ表示のみ。Gap指標化はPhase 2で検討。<br/>
        ・「医療利用」列は<b>NDB処方薬の薬効分類ベース proxy</b>(人口10万対補正)。<u>疾患患者数ではない</u>。比較基準は47都道府県平均(処方薬集計に全国値なし)。<br/>
        ・処方数量は薬効分類別数量の合算であり、薬剤単位・剤形・用量差を含みます。<u>治療人数や患者数ではありません</u>。<br/>
        ・「供給proxy」は<b>各疾患専用の供給体制ではない</b>(例: 急性期床は循環器も整形外科も含む)。proxyラベルを参照のこと。<br/>
        ・受療率は<b>標本推計</b>(令和5年患者調査・3年に1回)。「罹患率」とは異なる指標。<br/>
        ・<b>「リスク」列の比較は47都道府県の単純平均</b>(NDB質問票に全国エントリがないため代理使用)。人口加重ではない。<br/>
        ・<b>「結果」列は3段表示</b>: <span style={{color:'#7c3aed',fontWeight:500}}>2020年齢調整死亡率(主指標)</span> + 2020粗死亡率 + 2024粗死亡率。<u>2020年齢調整死亡率と2024粗死亡率を直接比較しないこと</u>(年次変化と年齢補正の混同を避ける)。<br/>
        ・年齢調整死亡率は<b>令和2年(2020年)時点</b>のデータ。NDB(令和4-5年)・患者調査(令和5年)・病床機能(令和6年)とは時点差あり。<br/>
        ・男女平均は<b>単純平均</b>(男+女)/2 — 人口加重未対応(将来課題)。<br/>
        ・差は分母=参照値での自然言語ラベル化(±5%未満=同程度 / ±15%以上=顕著)。z-score化はPhase 2課題。
      </div>
    </div>
  );
}
