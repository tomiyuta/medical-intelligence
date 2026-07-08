'use client';
import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from 'recharts';

// #13 診療科別医師数（65歳以上人口10万対・圏 vs 全国）。厚労省三師統計R6による独自集計。
export default function HsaSpecialtyPanel({ code, mob }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState('shortage'); // shortage | size

  useEffect(() => {
    if (!code || !open) return;
    if (d && d.code === code) return;
    setLoading(true); setD(null);
    fetch(`/api/hsa/specialty?code=${code}`).then(r => r.json()).then(x => { setD({ ...x, code }); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code, open]);

  const self = d?.self;
  const rows = useMemo(() => {
    if (!self) return [];
    const r = self.specialties.map(s => ({ ...s, diff: Math.round(((s.per100k || 0) - (s.natPer100k || 0)) * 10) / 10 }));
    return sort === 'shortage' ? r.sort((a, b) => a.diff - b.diff) : r.sort((a, b) => b.per100k - a.per100k);
  }, [self, sort]);

  if (!code) return null;
  const totalDiff = self ? Math.round((self.totalPer100k - d.national.totalPer100k) * 10) / 10 : 0;

  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0f6e5d', background: '#e3f0ed', padding: '2px 8px', borderRadius: 10 }}>一次統計・独自集計</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>診療科別 医師数（65歳以上人口10万対）</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          {loading && <div style={{ padding: 24, color: '#cbd5e1', fontSize: 13 }}>読み込み中…</div>}
          {!loading && self && <>
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
          </>}
          {!loading && !self && <div style={{ padding: 20, fontSize: 12.5, color: '#94a3b8' }}>この圏域の診療科別データは見つかりませんでした。</div>}
        </div>
      )}
    </div>
  );
}
