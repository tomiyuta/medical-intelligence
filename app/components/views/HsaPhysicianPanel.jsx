'use client';
import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts';

// 分類→色（医師少数=不足=要注意で赤系, 多数=充足でシアン, 中間=グレー）
const CLS = {
  '医師多数': { color: '#0891b2', bg: '#e0f2fe' },
  '中間': { color: '#64748b', bg: '#f1f5f9' },
  '医師少数': { color: '#dc2626', bg: '#fef2f2' },
  '不明': { color: '#cbd5e1', bg: '#f8fafc' },
};

function IdxTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.area}</div>
      <div style={{ color: CLS[p.classification]?.color }}>医師偏在指標 {p.index}（{p.classification}）</div>
      <div style={{ color: '#94a3b8', fontSize: 11 }}>全国 {p.rank} 位 / 330圏</div>
    </div>
  );
}

export default function HsaPhysicianPanel({ code, mob }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!code) return;
    setLoading(true); setD(null);
    fetch(`/api/hsa/physician?code=${code}`).then(r => r.json()).then(x => { setD(x); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code]);

  if (!code) return null;
  const area = d?.area;
  const cls = area ? CLS[area.classification] : null;
  const rows = (d?.siblings || []).map(s => ({ ...s, self: s.code === code }));

  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0f6e5d', background: '#e3f0ed', padding: '2px 8px', borderRadius: 10 }}>ネイティブ再構築</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>医師偏在指標</span>
          {area && cls && <span style={{ fontSize: 11, fontWeight: 700, color: cls.color, background: cls.bg, padding: '2px 9px', borderRadius: 10 }}>{area.classification}</span>}
          <span style={{ fontSize: 11, color: '#94a3b8' }}>令和6年1月公表版</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          {loading && <div style={{ padding: 24, color: '#cbd5e1', fontSize: 13 }}>読み込み中…</div>}
          {!loading && area && <>
            {/* KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 8, margin: '10px 0 14px' }}>
              {[
                { l: '医師偏在指標', v: area.index, u: '', c: cls?.color || '#0f172a' },
                { l: '全国順位', v: `${area.rank}`, u: `/ ${d.areaCount}圏`, c: '#0f172a' },
                { l: '標準化医師数', v: area.stdDoctors?.toLocaleString(), u: '人', c: '#2563EB' },
                { l: '人口', v: (area.pop10man * 10).toFixed(1), u: '万人', c: '#0891b2' },
              ].map((k, i) => (
                <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: k.c }}>{k.v}<span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{k.u}</span></div>
                </div>
              ))}
            </div>

            {/* 分類の意味 */}
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, marginBottom: 12, background: cls?.bg, borderRadius: 8, padding: '8px 12px' }}>
              全国 {d.areaCount} の二次医療圏を医師偏在指標で3分割し、{area.area}医療圏は<b style={{ color: cls?.color }}>「{area.classification}」</b>区域（
              医師多数=全国上位1/3・{d.thresholds.majority}以上、医師少数=下位1/3・{d.thresholds.minority}以下）。全国値は {d.national}。
            </div>

            {/* 県内二次医療圏 比較（PDF P.11 相当・当該圏を強調） */}
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>{d.pref} 内の二次医療圏比較</div>
            <ResponsiveContainer width="100%" height={Math.max(150, rows.length * 30 + 46)}>
              <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, dataMax => Math.ceil(Math.max(dataMax, d.national) / 100) * 100]} />
                <YAxis type="category" dataKey="area" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={mob ? 84 : 118} />
                <Tooltip content={<IdxTip />} />
                <ReferenceLine x={d.thresholds.minority} stroke="#dc2626" strokeDasharray="4 3" strokeOpacity={0.6} label={{ value: `少数 ${d.thresholds.minority}`, position: 'top', fontSize: 9, fill: '#dc2626' }} />
                <ReferenceLine x={d.thresholds.majority} stroke="#0891b2" strokeDasharray="4 3" strokeOpacity={0.6} label={{ value: `多数 ${d.thresholds.majority}`, position: 'top', fontSize: 9, fill: '#0891b2' }} />
                <ReferenceLine x={d.national} stroke="#64748b" strokeDasharray="2 2" strokeOpacity={0.5} label={{ value: `全国 ${d.national}`, position: 'insideTopRight', fontSize: 9, fill: '#64748b' }} />
                <Bar dataKey="index" barSize={16} radius={[0, 3, 3, 0]}>
                  {rows.map((r, i) => (
                    <Cell key={i} fill={CLS[r.classification]?.color || '#94a3b8'} fillOpacity={r.self ? 1 : 0.4} stroke={r.self ? '#0f172a' : 'none'} strokeWidth={r.self ? 1.4 : 0} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 8, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              出典: {d.source}｜{d.note}<br />
              カルテのP.11「都道府県内の医療圏の医師偏在指標」と<b style={{ color: '#0f6e5d' }}>同一データ・数値一致</b>。全国順位は本サイトが330圏で算出。
            </div>
          </>}
          {!loading && !area && <div style={{ padding: 20, fontSize: 12.5, color: '#94a3b8' }}>この圏域の医師偏在指標データは見つかりませんでした。</div>}
        </div>
      )}
    </div>
  );
}
