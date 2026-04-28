'use client';
import { DOMAIN_MAPPING, describeDelta, DATA_BADGE } from '../../../lib/domainMapping';

const ACTIVE_FUNCS = ['高度急性期', '急性期', '回復期', '慢性期'];

export default function DomainSupplyDemandBridge({ ndbPref, patientSurvey, ndbQ, vitalStats, bedFunc, mob }) {
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
  const bfNat = bedFunc?.national;
  const bfPref = bedFunc?.prefectures?.[ndbPref];

  // bedFunc から機能区分シェアを計算
  const computeBfShare = (bf, keys) => {
    if (!bf) return null;
    const total = bf['総床数'] || 0;
    if (total === 0) return null;
    return keys.reduce((s, k) => s + ((bf[k]?.beds || 0) / total * 100), 0);
  };

  // 各セルの値を取得するヘルパー
  const getCell = (domain, type) => {
    const cfg = domain[type];
    if (!cfg) return null;
    let prefVal = null, natVal = null, label = cfg.label, unit = cfg.unit, note = cfg.note;

    if (type === 'risk') {
      prefVal = ndbQPref?.[cfg.ndbQKey];
      natVal = ndbQNat?.[cfg.ndbQKey];
    } else if (type === 'demand') {
      const psKey = cfg.patientSurveyKey;
      prefVal = psPref?.categories?.[psKey]?.outpatient;
      natVal = psNat?.categories?.[psKey]?.outpatient;
    } else if (type === 'supply') {
      prefVal = computeBfShare(bfPref, cfg.bedFuncKeys);
      natVal = computeBfShare(bfNat, cfg.bedFuncKeys);
    } else if (type === 'outcome') {
      prefVal = vsPref?.causes?.find(c => c.cause === cfg.vitalCause)?.rate;
      natVal = vsNat?.causes?.find(c => c.cause === cfg.vitalCause)?.rate;
    }

    if (prefVal == null) return { label, unit, note, missing: true };
    const delta = describeDelta(prefVal, natVal, cfg.direction || 'higher_worse');
    return { label, unit, note, prefVal, natVal, delta };
  };

  const fmtVal = (v, unit) => {
    if (v == null) return '—';
    const numStr = typeof v === 'number' ? (v % 1 === 0 ? v.toString() : v.toFixed(1)) : String(v);
    return numStr + (unit || '');
  };

  return (
    <div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'20px 24px',marginBottom:16}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <span style={{fontSize:18}}>🔗</span>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>
            疾患別 需要・供給・結果サマリー (v0)
            <span style={{marginLeft:6,fontSize:9,padding:'2px 6px',borderRadius:4,background:'#e0e7ff',color:'#3730a3',fontWeight:500}}>3領域・横並び</span>
          </div>
          <div style={{fontSize:11,color:'#94a3b8'}}>
            循環器・糖尿病代謝・がん の各領域で「リスク → 疾病負荷 → 医療利用 → 供給proxy → 結果」を{ndbPref}と全国で横並び比較
          </div>
        </div>
      </div>

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
              const risk = getCell(domain, 'risk');
              const demand = getCell(domain, 'demand');
              const supply = domain.supply ? getCell(domain, 'supply') : null;
              const outcome = getCell(domain, 'outcome');

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
                    <div style={{fontSize:9,color:'#cbd5e1',marginTop:3,lineHeight:1.4}}>{cell.label}</div>
                  </div>
                );
              };

              return (
                <tr key={domain.id} style={{borderBottom:'1px solid #f1f5f9',background:domain.bg}}>
                  <td style={{padding:'12px',borderRight:'1px solid #f1f5f9',verticalAlign:'top'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:18}}>{domain.icon}</span>
                      <span style={{fontSize:13,fontWeight:700,color:domain.color}}>{domain.label}</span>
                    </div>
                  </td>
                  <td style={{padding:'12px 8px',verticalAlign:'top'}}>{renderCell(risk)}</td>
                  <td style={{padding:'12px 8px',verticalAlign:'top'}}>{renderCell(demand)}</td>
                  <td style={{padding:'12px 8px',verticalAlign:'top'}}>
                    <span style={{fontSize:10,color:'#94a3b8',fontStyle:'italic'}}>Phase 2 で詳細化</span>
                    <div style={{fontSize:9,color:'#cbd5e1',marginTop:3,lineHeight:1.4}}>NDB処方薬の薬効分類対応辞書整備後</div>
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
                  <td style={{padding:'12px 8px',verticalAlign:'top'}}>{renderCell(outcome)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 注記 */}
      <div style={{fontSize:10,color:'#94a3b8',marginTop:14,lineHeight:1.7,padding:'10px 14px',background:'#f8fafc',borderRadius:6}}>
        <b style={{color:'#475569'}}>📌 v0 の制約</b><br/>
        ・本サマリーは <b>スコア化を行わず</b>、データ並べ表示のみ。Gap指標化はPhase 2で検討。<br/>
        ・「医療利用」列は Phase 2 で薬効分類辞書整備後に詳細化(現状はNDB処方薬の集約ロジック未整備)。<br/>
        ・「供給proxy」は急性期病床等の代理指標であり、各疾患専用の供給体制ではない(例: cap.surgery は循環器も整形外科も含む)。<br/>
        ・受療率は<b>標本推計</b>(令和5年患者調査・3年に1回)。「罹患率」とは異なる指標。<br/>
        ・全国比は分母=全国値での自然言語ラベル化(±5%未満=同程度 / ±15%以上=顕著)。z-score化はPhase 2課題。
      </div>
    </div>
  );
}
