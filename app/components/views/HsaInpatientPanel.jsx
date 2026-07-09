'use client';
import { useState } from 'react';
import { fmt } from '../shared';
import { useHsaPanel } from '../hsa/useHsaArea';
import HsaPanel from '../hsa/HsaPanel';

// #17 入院患者数と平均在院日数の推移（都道府県内の二次医療圏比較・2013/2018/2023）
export default function HsaInpatientPanel({ mob }) {
  const { code, data: d, loading } = useHsaPanel('inpatient');
  const [metric, setMetric] = useState('zaiin'); // zaiin | nissu

  if (!code) return null;
  const self = d?.self;
  const years = d?.years || [2013, 2018, 2023];
  const unit = metric === 'zaiin' ? '人/日' : '日';

  const th = { padding: '7px 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #eef2f6', whiteSpace: 'nowrap' };
  const td = { padding: '7px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' };
  const chg = (row) => {
    const a = row[metric]?.[String(years[0])], b = row[metric]?.[String(years[years.length - 1])];
    if (a == null || b == null || !a) return null;
    return Math.round((b / a - 1) * 1000) / 10;
  };
  const fval = (v) => v == null ? <span style={{ color: '#e2e8f0' }}>–</span> : (metric === 'nissu' ? v.toFixed(1) : fmt(Math.round(v)));

  const Row = ({ row, label, cur, muted }) => {
    const c = chg(row);
    return (
      <tr style={{ background: cur ? '#eff6ff' : 'transparent', borderBottom: '1px solid #f8f9fa', color: muted ? '#94a3b8' : '#334155', fontWeight: cur ? 700 : (muted ? 500 : 400) }}>
        <td style={{ ...td, textAlign: 'left', color: cur ? '#2563EB' : (muted ? '#94a3b8' : '#334155'), fontWeight: cur || muted ? 700 : 500 }}>{label}</td>
        {years.map(y => <td key={y} style={td}>{fval(row[metric]?.[String(y)])}</td>)}
        <td style={{ ...td, fontWeight: 700, color: c == null ? '#cbd5e1' : (c >= 0 ? '#dc2626' : '#0891b2') }}>{c == null ? '–' : `${c > 0 ? '+' : ''}${c}%`}</td>
      </tr>
    );
  };

  return (
    <HsaPanel title="入院患者数と平均在院日数の推移"
              badges={[]}
              defaultOpen={false}
              loading={loading}
              empty={!self}
              emptyText="この圏域の入院患者数データは見つかりませんでした。">
      {() => (
        <>
          <div style={{ display: 'flex', gap: 6, margin: '8px 0 10px' }}>
            {[['zaiin', '1日平均在院患者数'], ['nissu', '平均在院日数']].map(([id, l]) => (
              <button key={id} onClick={() => setMetric(id)}
                      style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid ' + (metric === id ? '#2563EB' : '#e2e8f0'), background: metric === id ? '#eff6ff' : '#fff', color: metric === id ? '#2563EB' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 400 }}>
              <thead><tr>
                <th style={{ ...th, textAlign: 'left' }}>二次医療圏</th>
                {years.map(y => <th key={y} style={{ ...th, textAlign: 'right' }}>{y}年<span style={{ fontSize: 8.5, color: '#cbd5e1' }}>({unit})</span></th>)}
                <th style={{ ...th, textAlign: 'right' }}>{years[0]}比</th>
              </tr></thead>
              <tbody>
                {(d.siblings || []).map(s => <Row key={s.code} row={s} label={s.area} cur={s.code === code} />)}
                {d.prefRow && <Row row={d.prefRow} label={`${d.pref} 計`} muted />}
                {d.national && <Row row={d.national} label="全国" muted />}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            出典: {d.source}｜1日平均在院患者数・平均在院日数（全病床）。カルテ #17 と<b style={{ color: '#0f6e5d' }}>数値一致</b>を検証済み（山城南 在院患者数394→441→458、在院日数19.8→21.0→21.7）。
          </div>
        </>
      )}
    </HsaPanel>
  );
}
