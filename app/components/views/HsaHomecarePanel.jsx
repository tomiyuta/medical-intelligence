'use client';
import { useState, useMemo } from 'react';
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { fmt } from '../shared';
import { useHsaPanel } from '../hsa/useHsaArea';
import HsaPanel from '../hsa/HsaPanel';

// #50/#51 在宅医療患者数の将来推計（発生率法・参考推計）
const AGE_COLORS = { '15歳未満': '#cbd5e1', '15〜64歳': '#94a3b8', '65〜74歳': '#38bdf8', '75〜84歳': '#f97316', '85歳以上': '#dc2626' };

export default function HsaHomecarePanel({ mob }) {
  const { code, data: d, loading } = useHsaPanel('homecare');
  const [tab, setTab] = useState('place');

  const series = d?.series || [];
  const rows = useMemo(() => series.map(s => ({ year: `${s.year}`, 在宅時: s.zaitaku, 施設入居時: s.shisetsu, 合計: s.total, ...s.byAge })), [series]);
  const ageKeys = ['85歳以上', '75〜84歳', '65〜74歳', '15〜64歳', '15歳未満'];

  if (!code) return null;

  return (
    <HsaPanel title="在宅医療需要の将来推計"
              badges={[{ label: '参考推計', kind: 'reference' }]}
              defaultOpen={false}
              loading={loading}
              empty={series.length === 0}
              emptyText="この圏域の在宅医療推計データは見つかりませんでした。">
      {() => (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: 8, margin: '10px 0 12px' }}>
            {[
              { l: '在宅医療 2020', v: rows[0]?.合計, u: '件/月', c: '#2563EB' },
              { l: '在宅医療 2050', v: rows[rows.length - 1]?.合計, u: '件/月', c: '#dc2626' },
              { l: '2020→2050 増減', v: `${d.growth > 0 ? '+' : ''}${d.growth}`, u: '%', c: d.growth >= 0 ? '#dc2626' : '#0891b2' },
            ].map((k, i) => (
              <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '9px 12px' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: k.c }}>{typeof k.v === 'number' ? fmt(k.v) : k.v}<span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{k.u}</span></div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[['place', '居住場所別'], ['age', '年齢階級別']].map(([id, l]) => (
              <button key={id} onClick={() => setTab(id)}
                      style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid ' + (tab === id ? '#2563EB' : '#e2e8f0'), background: tab === id ? '#eff6ff' : '#fff', color: tab === id ? '#2563EB' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={rows} margin={{ left: 8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} unit="件/月" width={54} />
              <Tooltip formatter={(v, n) => [`${fmt(Math.round(v))}件/月`, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {tab === 'place' ? [
                <Area key="z" dataKey="在宅時" stackId="a" stroke="#2563EB" fill="#bfdbfe" name="在宅時医学総合管理料" />,
                <Area key="s" dataKey="施設入居時" stackId="a" stroke="#7c3aed" fill="#ddd6fe" name="施設入居時等" />,
              ] : ageKeys.map(k => <Area key={k} dataKey={k} stackId="a" stroke={AGE_COLORS[k]} fill={AGE_COLORS[k]} fillOpacity={0.55} name={k} />)}
            </ComposedChart>
          </ResponsiveContainer>

          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            出典: {d.source}｜月当たりレセプト件数（年間算定回数÷12）。
            <span style={{ color: '#b45309' }}>※参考推計。全国の年齢別発生率×圏将来人口。<b>増減率（+{d.growth}%）はカルテ #50/#51 とほぼ一致</b>する一方、絶対水準は性別集約・NDB秘匿処理により約2〜3割上振れします。将来需要の増加トレンドの把握にご利用ください。</span>
          </div>
        </>
      )}
    </HsaPanel>
  );
}
