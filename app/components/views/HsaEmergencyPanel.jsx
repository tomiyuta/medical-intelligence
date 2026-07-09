'use client';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { fmt } from '../shared';
import { useHsaPanel } from '../hsa/useHsaArea';
import HsaPanel from '../hsa/HsaPanel';

// 救急種別→色（三次=最高次で赤, 二次=橙, 告示=黄, その他=グレー）
const ER = {
  '三次救急': '#dc2626', '二次救急': '#f97316', '救急告示': '#eab308', 'その他': '#cbd5e1',
};

function ErTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.fullName}</div>
      <div style={{ color: ER[p.kyukyuType] }}>{p.kyukyuType}</div>
      <div>救急車受入 <b>{fmt(p.ambulance)}</b> 件/年</div>
      <div style={{ color: '#64748b', fontSize: 11 }}>CT {p.ct} ・ MRI {p.mri}</div>
    </div>
  );
}

export default function HsaEmergencyPanel({ mob }) {
  const { code, data: d, loading } = useHsaPanel('emergency');
  const [tab, setTab] = useState('chart');

  const area = d?.area;
  const t = area?.totals;
  // 救急車受入>0 の病院を件数降順（PDF #60 と同順）
  const rows = (area?.facilities || []).filter(f => f.ambulance > 0).map(f => ({
    name: f.name.length > 16 ? f.name.slice(0, 15) + '…' : f.name,
    fullName: f.name, ambulance: f.ambulance, kyukyuType: f.kyukyuType, ct: f.ct, mri: f.mri,
  }));

  if (!code) return null;

  return (
    <HsaPanel title="救急・職員体制"
              badges={[
                { label: 'ネイティブ再構築', kind: 'reconstructed' },
                { label: '令和6年度病床機能報告', kind: 'muted' },
              ]}
              defaultOpen={true}
              loading={loading}
              empty={!area}
              emptyText="この圏域の救急データは見つかりませんでした。">
      {() => (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 8, margin: '10px 0 14px' }}>
            {[
              { l: '救急車受入 圏計', v: fmt(t.ambulanceTotal), u: '件/年', c: '#dc2626' },
              { l: '救急対応 病院数', v: t.erHospitals, u: '施設', c: '#f97316' },
              { l: '三次救急', v: t.tertiary, u: '施設', c: '#dc2626' },
              { l: '二次救急', v: t.secondary, u: '施設', c: '#f97316' },
            ].map((k, i) => (
              <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: k.c }}>{k.v}<span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{k.u}</span></div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[['chart', '救急車受入件数'], ['table', '救急体制・機器'], ['staff', '職員数']].map(([id, l]) => (
              <button key={id} onClick={() => setTab(id)}
                      style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid ' + (tab === id ? '#2563EB' : '#e2e8f0'), background: tab === id ? '#eff6ff' : '#fff', color: tab === id ? '#2563EB' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>

          {tab === 'chart' && (rows.length ? (
            <ResponsiveContainer width="100%" height={Math.max(140, rows.length * 30 + 30)}>
              <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} width={mob ? 90 : 130} />
                <Tooltip content={<ErTip />} />
                <Bar dataKey="ambulance" name="救急車受入件数" barSize={16} radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 10, fill: '#64748b', formatter: (v) => v.toLocaleString() }}>
                  {rows.map((r, i) => <Cell key={i} fill={ER[r.kyukyuType] || '#cbd5e1'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ padding: 16, fontSize: 12, color: '#94a3b8' }}>救急車受入実績のある病院がありません。</div>)}

          {tab === 'table' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
                <thead><tr style={{ background: '#fafbfc' }}>
                  {['医療機関名', '救急種別', '医師', 'うち常勤', '看護職員', '救急車/年', 'CT', 'MRI'].map((h, i) => (
                    <th key={i} style={{ padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: '#94a3b8', textAlign: i >= 2 ? 'right' : 'left', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{area.facilities.map((f, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f8f9fa' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 500 }}>{f.name}</td>
                    <td style={{ padding: '7px 10px' }}><span style={{ fontSize: 11, fontWeight: 600, color: ER[f.kyukyuType], background: (ER[f.kyukyuType] || '#cbd5e1') + '22', padding: '1px 7px', borderRadius: 9 }}>{f.kyukyuType}</span></td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f.staff?.doc ?? '–'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{f.staff ? `${f.staff.docFull}（${f.staff.docFullRatio}%）` : '–'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f.staff?.nurse ?? '–'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: f.ambulance ? '#dc2626' : '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{f.ambulance ? fmt(f.ambulance) : '–'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f.ct || '–'}</td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f.mri || '–'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {tab === 'staff' && (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>医療機関別 職員数（常勤換算・施設全体）</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
                <thead><tr style={{ background: '#fafbfc' }}>
                  {['医療機関名', '医師', 'うち常勤', '看護職員', '看護補助', 'PT+OT+ST', '薬剤師', '全職員'].map((h, i) => (
                    <th key={i} style={{ padding: '8px 10px', fontSize: 10.5, fontWeight: 600, color: '#94a3b8', textAlign: i === 0 ? 'left' : 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{[...area.facilities].sort((a, b) => (b.staff?.total || 0) - (a.staff?.total || 0)).map((f, i) => {
                  const s = f.staff || {};
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f8f9fa' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 500 }}>{f.name}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#2563EB', fontVariantNumeric: 'tabular-nums' }}>{s.doc ?? '–'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{s.docFull != null ? `${s.docFull}（${s.docFullRatio}%）` : '–'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.nurse ?? '–'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.nurseAid ?? '–'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.rehab ?? '–'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.pharm ?? '–'}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.total ?? '–'}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}

          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
            出典: {d.source}｜{d.note}｜職員数は常勤換算（常勤＋非常勤の常勤換算値）。看護職員＝看護師＋准看護師＋助産師。<br />
            カルテの救急スライド（救急車受入を行う病院の概要・救急車受入件数）および医療機関別職員数と<b style={{ color: '#0f6e5d' }}>同一データ・数値一致</b>を検証済み。
          </div>
        </>
      )}
    </HsaPanel>
  );
}
