'use client';
import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { fmt } from '../shared';

// 病床機能区分の配色（医療需給総覧の凡例に準拠）
const FUNC = [
  { key: '高度急性期', color: '#dc2626' },
  { key: '急性期', color: '#f97316' },
  { key: '回復期', color: '#16a34a' },
  { key: '慢性期', color: '#2563EB' },
  { key: '休棟', color: '#cbd5e1' },
];

function StackTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '9px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12, maxWidth: 260 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.filter(p => p.value > 0).map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: p.color }}>
          <span>{p.name}</span><span style={{ fontWeight: 600 }}>{fmt(p.value)}床</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: '1px solid #f1f5f9', marginTop: 3, paddingTop: 3, fontWeight: 700 }}>
        <span>許可病床 計</span><span>{fmt(total)}床</span>
      </div>
    </div>
  );
}

export default function HsaBedDetailPanel({ code, mob }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState('chart'); // chart | table

  useEffect(() => {
    if (!code) return;
    setLoading(true); setData(null);
    fetch(`/api/hsa/bed-detail?code=${code}`).then(r => r.json()).then(d => {
      setData(d); setLoading(false);
    }).catch(() => setLoading(false));
  }, [code]);

  const area = data?.area;
  if (!code) return null;

  // 入院料別 病床数（圏域計・PDF #21 相当）
  const admFees = (data?.admFees || []).map(x => ({
    fee: x.fee.length > 20 ? x.fee.slice(0, 19) + '…' : x.fee, fullFee: x.fee, beds: x.beds,
  }));

  // 施設別スタックデータ（病床降順・カルテと同順）
  const rows = (area?.facilities || []).map(f => ({
    name: f.name.length > 16 ? f.name.slice(0, 15) + '…' : f.name,
    fullName: f.name, beds: f.beds, wards: f.wards,
    ...FUNC.reduce((o, fn) => ({ ...o, [fn.key]: f.funcBeds[fn.key] || 0 }), {}),
  }));
  const t = area?.totals;

  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                       padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0f6e5d', background: '#e3f0ed', padding: '2px 8px', borderRadius: 10 }}>ネイティブ再構築</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>圏域内 医療機関別 病床機能構成</span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>令和6年度病床機能報告</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          {loading && <div style={{ padding: 24, color: '#cbd5e1', fontSize: 13 }}>読み込み中…</div>}
          {!loading && area && <>
            {/* サマリー */}
            <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 8, margin: '10px 0 14px' }}>
              {[
                { l: '医療機関数', v: t.hospitals, u: '施設', c: '#0f172a' },
                { l: '許可病床 計', v: t.beds, u: '床', c: '#2563EB' },
                { l: '病棟数', v: t.wards, u: '', c: '#0891b2' },
                { l: '急性期系比率', v: Math.round((t.funcBeds['高度急性期'] + t.funcBeds['急性期']) / Math.max(1, t.beds) * 100), u: '%', c: '#f97316' },
              ].map((k, i) => (
                <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: k.c }}>{fmt(k.v)}<span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{k.u}</span></div>
                </div>
              ))}
            </div>

            {/* 機能別 内訳バー（圏域計） */}
            <div style={{ display: 'flex', height: 22, borderRadius: 5, overflow: 'hidden', marginBottom: 4, border: '1px solid #f0f0f0' }}>
              {FUNC.map(fn => {
                const v = t.funcBeds[fn.key]; if (!v) return null;
                const pct = v / Math.max(1, t.beds) * 100;
                return <div key={fn.key} title={`${fn.key} ${v}床`} style={{ width: `${pct}%`, background: fn.color }} />;
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, fontSize: 11 }}>
              {FUNC.map(fn => t.funcBeds[fn.key] > 0 && (
                <span key={fn.key} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: fn.color }} />{fn.key} {fmt(t.funcBeds[fn.key])}床
                </span>
              ))}
            </div>

            {/* タブ */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[['chart', '施設別グラフ'], ['adm', '入院料別'], ['table', '表']].map(([id, l]) => (
                <button key={id} onClick={() => setTab(id)}
                        style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid ' + (tab === id ? '#2563EB' : '#e2e8f0'),
                                 background: tab === id ? '#eff6ff' : '#fff', color: tab === id ? '#2563EB' : '#64748b',
                                 fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
              ))}
            </div>

            {tab === 'chart' && (
              <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 30 + 40)}>
                <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={mob ? 90 : 130} />
                  <Tooltip content={<StackTip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {FUNC.map(fn => <Bar key={fn.key} dataKey={fn.key} stackId="a" fill={fn.color} name={fn.key} barSize={16} />)}
                </BarChart>
              </ResponsiveContainer>
            )}

            {tab === 'adm' && (admFees.length ? (
              <>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>入院基本料・特定入院料別の届出病床数（病院のみ）</div>
                <ResponsiveContainer width="100%" height={Math.max(150, admFees.length * 30 + 30)}>
                  <BarChart data={admFees} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="fee" tick={{ fontSize: 10.5, fill: '#475569' }} axisLine={false} tickLine={false} width={mob ? 120 : 200} />
                    <Tooltip formatter={(v) => [`${v}床`, '届出病床数']} labelFormatter={(l, p) => p?.[0]?.payload?.fullFee || l} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="beds" fill="#0891b2" name="届出病床数" barSize={16} radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 10, fill: '#64748b' }} />
                  </BarChart>
                </ResponsiveContainer>
              </>
            ) : <div style={{ padding: 16, fontSize: 12, color: '#94a3b8' }}>入院料の届出データがありません。</div>)}

            {tab === 'table' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
                  <thead><tr style={{ background: '#fafbfc' }}>
                    {['医療機関名', ...FUNC.map(f => f.key), '計', '病棟'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: '#94a3b8', textAlign: i === 0 ? 'left' : 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{area.facilities.map((f, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f8f9fa' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 500 }}>{f.name}</td>
                      {FUNC.map(fn => <td key={fn.key} style={{ padding: '7px 10px', textAlign: 'right', color: f.funcBeds[fn.key] ? fn.color : '#e2e8f0', fontVariantNumeric: 'tabular-nums' }}>{f.funcBeds[fn.key] || '–'}</td>)}
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(f.beds)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{f.wards}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              出典: {data.source}｜許可病床数=一般+療養。機能は施設の自己申告（2024/7/1時点）。<br />
              医療需給総覧の当該圏スライド（医療機関別の許可病床数）と<b style={{ color: '#0f6e5d' }}>同一データ・数値一致</b>を検証済み。カルテのPDFと相互参照できます。
            </div>
          </>}
          {!loading && !area && <div style={{ padding: 20, fontSize: 12.5, color: '#94a3b8' }}>この圏域の病床機能データは見つかりませんでした。</div>}
        </div>
      )}
    </div>
  );
}
