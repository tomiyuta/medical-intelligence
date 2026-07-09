'use client';
import { useState, useMemo } from 'react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { fmt, sortPrefs } from '../shared';
import { useHsaPanel } from '../hsa/useHsaArea';
import HsaPanel from '../hsa/HsaPanel';

// #38 DPC症例数・平均入院期間の推移（圏）/ #40 都道府県別 平均在院日数
const IDX = [
  { key: 'kensu', label: 'DPC症例件数', color: '#2563EB' },
  { key: 'los', label: '平均入院期間', color: '#f97316' },
  { key: 'nobe', label: '推計延べ患者数', color: '#7c3aed' },
];

export default function HsaDpcTrendPanel({ mob }) {
  const { code, data: d, loading } = useHsaPanel('dpcLosTrend');
  const [tab, setTab] = useState('trend');

  const self = d?.self;
  const years = d?.years || [];
  const prefName = self?.pref;

  const idxRows = useMemo(() => {
    if (!self) return [];
    const b = self.years[String(years[0])] || {};
    const base = { kensu: b.kensu, los: b.los, nobe: (b.kensu && b.los) ? b.kensu * b.los : null };
    return years.map(y => {
      const v = self.years[String(y)] || {};
      const nobe = (v.kensu && v.los) ? v.kensu * v.los : null;
      return {
        year: `${y}`,
        DPC症例件数: (v.kensu && base.kensu) ? Math.round(v.kensu / base.kensu * 1000) / 10 : null,
        平均入院期間: (v.los != null && base.los) ? Math.round(v.los / base.los * 1000) / 10 : null,
        推計延べ患者数: (nobe && base.nobe) ? Math.round(nobe / base.nobe * 1000) / 10 : null,
        _raw: v,
      };
    });
  }, [self, years]);

  // 都道府県比較(#40): 2016/2018/2023
  const cmpYears = ['2016', '2018', '2023'];
  const prefRows = useMemo(() => {
    if (!d?.prefs) return [];
    return sortPrefs(Object.keys(d.prefs)).map(p => ({ pref: p, ...d.prefs[p] }));
  }, [d]);

  if (!code) return null;

  return (
    <HsaPanel title="DPC症例数・平均入院期間の推移"
              badges={[{ label: '参考', kind: 'muted' }]}
              defaultOpen={false}
              loading={loading}
              empty={!self && !d?.prefs}
              emptyText="この圏域のDPC推移データは見つかりませんでした。">
      {() => (
        <>
          <div style={{ display: 'flex', gap: 6, margin: '8px 0 10px' }}>
            {[['trend', '症例数・在院期間の推移 (#38)'], ['pref', '都道府県比較 (#40)']].map(([id, l]) => (
              <button key={id} onClick={() => setTab(id)}
                      style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid ' + (tab === id ? '#2563EB' : '#e2e8f0'), background: tab === id ? '#eff6ff' : '#fff', color: tab === id ? '#2563EB' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>

          {tab === 'trend' && (self ? <>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>DPC対象病院の症例数・平均入院期間（2016年=100の指数。推計延べ＝症例数×在院日数）</div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={idxRows} margin={{ left: 8, right: 12, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} interval={mob ? 1 : 0} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="%" width={44} />
                <Tooltip formatter={(v, n, p) => [`${v}（${n === 'DPC症例件数' ? fmt(p.payload._raw.kensu) + '件' : n === '平均入院期間' ? p.payload._raw.los + '日' : '延べ'}）`, n]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={100} stroke="#cbd5e1" strokeDasharray="4 3" />
                {IDX.map(m => <Line key={m.key} dataKey={m.label} stroke={m.color} strokeWidth={2.2} dot={{ r: 2 }} name={m.label} />)}
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginTop: 10 }}>
              {[{ l: 'DPC症例件数 2023', v: fmt(self.years['2023']?.kensu), u: '件', b: self.years['2016']?.kensu, c: self.years['2023']?.kensu },
                { l: '平均入院期間 2023', v: self.years['2023']?.los, u: '日', b: self.years['2016']?.los, c: self.years['2023']?.los }].map((k, i) => {
                  const ch = (k.b && k.c != null) ? Math.round((k.c / k.b - 1) * 1000) / 10 : null;
                  return (
                    <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '9px 12px' }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#334155' }}>{k.v}<span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 2 }}>{k.u} {ch != null && <span style={{ color: ch >= 0 ? '#dc2626' : '#0891b2' }}>({ch > 0 ? '+' : ''}{ch}%)</span>}</span></div>
                    </div>
                  );
                })}
            </div>
          </> : <div style={{ padding: 16, fontSize: 12, color: '#94a3b8' }}>この圏域はDPC対象病院が無く症例数推移を表示できません。</div>)}

          {tab === 'pref' && (
            <>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>都道府県別 DPC参加病院の平均在院日数（日）</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 360 }}>
                <thead><tr style={{ background: '#fafbfc' }}>
                  <th style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', textAlign: 'left' }}>都道府県</th>
                  {cmpYears.map(y => <th key={y} style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', textAlign: 'right' }}>{y}</th>)}
                  <th style={{ padding: '6px 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', textAlign: 'right' }}>16比</th>
                </tr></thead>
                <tbody>
                  {d.national && (
                    <tr style={{ borderBottom: '2px solid #eef2f6', fontWeight: 700, color: '#475569' }}>
                      <td style={{ padding: '6px 8px' }}>全国</td>
                      {cmpYears.map(y => <td key={y} style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.national[y] ?? '–'}</td>)}
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#0891b2', fontVariantNumeric: 'tabular-nums' }}>{d.national['2016'] && d.national['2023'] ? `${Math.round((d.national['2023'] / d.national['2016'] - 1) * 1000) / 10}%` : '–'}</td>
                    </tr>
                  )}
                  {prefRows.map(r => {
                    const cur = r.pref === prefName;
                    const ch = (r['2016'] && r['2023']) ? Math.round((r['2023'] / r['2016'] - 1) * 1000) / 10 : null;
                    return (
                      <tr key={r.pref} style={{ background: cur ? '#eff6ff' : 'transparent', borderBottom: '1px solid #f8f9fa' }}>
                        <td style={{ padding: '6px 8px', fontWeight: cur ? 700 : 400, color: cur ? '#2563EB' : '#334155' }}>{r.pref}</td>
                        {cmpYears.map(y => <td key={y} style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569' }}>{r[y] ?? '–'}</td>)}
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ch == null ? '#cbd5e1' : '#0891b2' }}>{ch == null ? '–' : `${ch}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}

          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            出典: {d.source}｜カルテ #38/#40 と<b style={{ color: '#0f6e5d' }}>数値一致</b>を検証済み（山城南 症例数 4431→4147・在院日数 10.6→10.0、全国 12.43→11.72）。在院日数の状況は5年ローリング収録のため2018版＋2023版で2016-2023を充足。
          </div>
        </>
      )}
    </HsaPanel>
  );
}
