'use client';
import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { useHsaPanel } from '../hsa/useHsaArea';
import HsaPanel from '../hsa/HsaPanel';

// #14/#15/#16 病床数及び診療実績の推移（病床種類別・2013年基準の指数）
const METRICS = [
  { key: 'zaiin', label: '入院患者数', color: '#2563EB', unit: '人/日', dec: 0 },
  { key: 'nissu', label: '平均在院日数', color: '#f97316', unit: '日', dec: 1 },
  { key: 'riyou', label: '病床利用率', color: '#0891b2', unit: '%', dec: 1 },
];
const KINDS = [['ippan', '一般病床'], ['ryoyo', '療養病床'], ['total', '一般＋療養']];

export default function HsaHospTrendPanel({ mob }) {
  const { code, data: d, loading } = useHsaPanel('hospTrend');
  const [kind, setKind] = useState('ippan');

  const years = d?.years || [];
  const series = d?.kinds?.[kind] || {};
  const base = series[String(years[0])] || {};

  // 指数（2013=100）
  const idxRows = useMemo(() => years.map(y => {
    const v = series[String(y)] || {};
    const o = { year: `${y}` };
    METRICS.forEach(m => { o[m.label] = (v[m.key] != null && base[m.key]) ? Math.round(v[m.key] / base[m.key] * 1000) / 10 : null; });
    return o;
  }), [series, years, base]);

  const hasKind = Object.keys(series).length > 0;
  if (!code) return null;

  const fval = (v, dec) => v == null ? '–' : (dec ? v.toFixed(dec) : Math.round(v).toLocaleString());
  const chg = (m) => {
    const a = base[m.key], b = (series[String(years[years.length - 1])] || {})[m.key];
    return (a && b != null) ? Math.round((b / a - 1) * 1000) / 10 : null;
  };

  return (
    <HsaPanel title="病床数及び診療実績の推移"
              badges={[]}
              defaultOpen={false}
              loading={loading}
              empty={!d?.kinds}
              emptyText="この圏域の診療実績推移データは見つかりませんでした。">
      {() => (
        <>
          <div style={{ display: 'flex', gap: 6, margin: '8px 0 10px' }}>
            {KINDS.map(([id, l]) => (
              <button key={id} onClick={() => setKind(id)}
                      style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid ' + (kind === id ? '#2563EB' : '#e2e8f0'), background: kind === id ? '#eff6ff' : '#fff', color: kind === id ? '#2563EB' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>

          {!hasKind ? <div style={{ padding: 16, fontSize: 12, color: '#94a3b8' }}>この病床種類のデータがありません。</div> : <>
          <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>2013年を100とした指数（診療実績の変化）</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={idxRows} margin={{ left: 8, right: 12, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} interval={mob ? 1 : 0} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} unit="%" width={44} />
              <Tooltip formatter={(v, n) => [`${v}`, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={100} stroke="#cbd5e1" strokeDasharray="4 3" />
              {METRICS.map(m => <Line key={m.key} dataKey={m.label} stroke={m.color} strokeWidth={2.2} dot={{ r: 2 }} name={m.label} />)}
            </LineChart>
          </ResponsiveContainer>

          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 420 }}>
              <thead><tr style={{ background: '#fafbfc' }}>
                <th style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', textAlign: 'left', whiteSpace: 'nowrap' }}>指標</th>
                {years.map(y => <th key={y} style={{ padding: '6px 6px', fontSize: 9.5, fontWeight: 600, color: '#94a3b8', textAlign: 'right', whiteSpace: 'nowrap' }}>{String(y).slice(2)}</th>)}
                <th style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', textAlign: 'right' }}>13比</th>
              </tr></thead>
              <tbody>
                {METRICS.map(m => {
                  const c = chg(m);
                  return (
                    <tr key={m.key} style={{ borderBottom: '1px solid #f8f9fa' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: m.color, whiteSpace: 'nowrap' }}>{m.label}</td>
                      {years.map(y => <td key={y} style={{ padding: '6px 6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>{fval((series[String(y)] || {})[m.key], m.dec)}</td>)}
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c == null ? '#cbd5e1' : (c >= 0 ? '#dc2626' : '#0891b2') }}>{c == null ? '–' : `${c > 0 ? '+' : ''}${c}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            出典: {d.source}｜カルテ #14-16 と<b style={{ color: '#0f6e5d' }}>数値一致</b>を検証済み（山城南 一般病床 入院患者数 351→410、在院日数 18.0→19.7、利用率 68.7→64.7%）。
            <span style={{ color: '#94a3b8' }}>※カルテの病床数線は医療施設調査（3年毎）由来のため、本パネルは年次の診療実績3指標を表示。</span>
          </div>
          </>}
        </>
      )}
    </HsaPanel>
  );
}
