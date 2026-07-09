'use client';
import { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from 'recharts';
import { useHsaPanel } from '../hsa/useHsaArea';
import HsaPanel from '../hsa/HsaPanel';

// #13 診療科別医師数（65歳以上人口10万対・圏 vs 全国）。厚労省三師統計R6による独自集計。
export default function HsaSpecialtyPanel({ mob }) {
  const { code, data: d, loading } = useHsaPanel('specialty');
  const [sort, setSort] = useState('shortage'); // shortage | size

  const self = d?.self;
  const rows = useMemo(() => {
    if (!self) return [];
    const r = self.specialties.map(s => ({ ...s, diff: Math.round(((s.per100k || 0) - (s.natPer100k || 0)) * 10) / 10 }));
    return sort === 'shortage' ? r.sort((a, b) => a.diff - b.diff) : r.sort((a, b) => b.per100k - a.per100k);
  }, [self, sort]);

  if (!code) return null;
  const totalDiff = self ? Math.round((self.totalPer100k - d.national.totalPer100k) * 10) / 10 : 0;

  return (
    <HsaPanel title="診療科別 医師数（65歳以上人口10万対）"
              badges={[{ label: '一次統計・独自集計', kind: 'reconstructed' }]}
              defaultOpen={false}
              loading={loading}
              empty={!self}
              emptyText="この圏域の診療科別データは見つかりませんでした。">
      {() => (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, margin: '10px 0 12px' }}>
            {[
              { l: '医師数 総計', v: self.total, u: '人', c: '#0f172a' },
              { l: '65歳以上人口', v: self.pop65, u: '人', c: '#64748b' },
              { l: '10万対 (圏/全国)', v: `${self.totalPer100k}`, u: `/ ${d.national.totalPer100k} (${totalDiff >= 0 ? '+' : ''}${totalDiff})`, c: totalDiff >= 0 ? '#0891b2' : '#dc2626' },
            ].map((k, i) => (
              <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '9px 12px' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: k.c }}>{typeof k.v === 'number' ? k.v.toLocaleString() : k.v}<span style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{k.u}</span></div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, color: '#94a3b8' }}>並び替え:</span>
            {[['shortage', '不足順'], ['size', '医師数順']].map(([id, l]) => (
              <button key={id} onClick={() => setSort(id)}
                      style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid ' + (sort === id ? '#2563EB' : '#e2e8f0'), background: sort === id ? '#eff6ff' : '#fff', color: sort === id ? '#2563EB' : '#64748b', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>

          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>全国との差（人/10万・65歳以上）　<span style={{ color: '#dc2626' }}>◀ 不足</span>　<span style={{ color: '#0891b2' }}>充足 ▶</span></div>
          <ResponsiveContainer width="100%" height={rows.length * 21 + 30}>
            <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9.5, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9.5, fill: '#475569' }} axisLine={false} tickLine={false} width={mob ? 92 : 116} interval={0} />
              <Tooltip formatter={(v, n, p) => [`圏 ${p.payload.per100k} / 全国 ${p.payload.natPer100k}（差 ${v > 0 ? '+' : ''}${v}）`, p.payload.name]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <ReferenceLine x={0} stroke="#cbd5e1" />
              <Bar dataKey="diff" barSize={13} radius={[2, 2, 2, 2]}>
                {rows.map((r, i) => <Cell key={i} fill={r.diff >= 0 ? '#0891b2' : '#dc2626'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            出典: {d.source}｜<b>独自集計</b>。主たる診療科・従業地ベースの実人数を65歳以上人口10万対で圏 vs 全国(pooled)で比較。
            <span style={{ color: '#b45309' }}>※カルテ #13 は別の医師配置基準（住所地等）を用いており、絶対値は本集計と異なります（総計は約0.5%一致）。診療科ごとの過不足の傾向把握にご利用ください。</span>
          </div>
        </>
      )}
    </HsaPanel>
  );
}
