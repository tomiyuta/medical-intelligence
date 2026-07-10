'use client';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { fmt } from '../shared';
import { useHsaPanel } from '../hsa/useHsaArea';
import HsaPanel from '../hsa/HsaPanel';
import { CountUpNum } from '../ui/vizHooks';

// 過不足ステータス配色: 不足=赤 / 過剰=琥珀 / 整合=緑
function necStatus(diff) {
  if (diff < 0) return { label: '不足', color: '#dc2626', mark: '▲' };
  if (diff > 0) return { label: '過剰', color: '#d97706', mark: '+' };
  return { label: '整合', color: '#0f6e5d', mark: '' };
}

// 機能別の実績推移スパークライン（時系列の別ミニ軸・ダンベル背後に温存）
function NecSparkline({ series, color, w = 52, h = 22 }) {
  if (!series || series.length < 2) return <svg width={w} height={h} style={{ display: 'block' }} />;
  const min = Math.min(...series), max = Math.max(...series), rng = (max - min) || 1;
  const px = (i) => (i / (series.length - 1)) * (w - 3) + 1.5;
  const py = (v) => (h - 2) - ((v - min) / rng) * (h - 4);
  const pts = series.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const li = series.length - 1;
  return (
    <svg width={w} height={h} style={{ display: 'block' }} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.3} strokeOpacity={0.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={px(li)} cy={py(series[li])} r={1.9} fill={color} />
    </svg>
  );
}

// 機能1行のダンベル: 2024実績●が2025必要○へ届くか。連結線色=過不足方向。
function NecDumbbellRow({ f, cur, need, diff, domainMax, series, mob }) {
  const st = necStatus(diff);
  const curPct = Math.min(100, cur / domainMax * 100);
  const needPct = Math.min(100, need / domainMax * 100);
  const lo = Math.min(curPct, needPct), span = Math.abs(curPct - needPct);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: mob ? '52px 40px 1fr 76px' : '72px 54px 1fr 96px', alignItems: 'center', gap: mob ? 6 : 10, padding: '5px 0' }}>
      <span style={{ fontSize: mob ? 11 : 12, fontWeight: 700, color: f.color, whiteSpace: 'nowrap' }}>{f.key}</span>
      <NecSparkline series={series} color={f.color} w={mob ? 40 : 54} />
      <div style={{ position: 'relative', height: 26 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 2, background: '#eef1f5', borderRadius: 1 }} />
        {/* 過不足の発散セグメント（●→○間・不足赤/過剰琥珀/整合緑） */}
        <div style={{ position: 'absolute', top: 11, left: `${lo}%`, width: `${Math.max(span, 0.4)}%`, height: 4, background: st.color, opacity: 0.85, borderRadius: 2 }} />
        {/* 必要 ○（中空スレート） */}
        <div title={`2025必要 ${fmt(need)}床`} style={{ position: 'absolute', top: 6, left: `calc(${needPct}% - 6px)`, width: 12, height: 12, borderRadius: '50%', border: '2px solid #64748b', background: '#fff', boxSizing: 'border-box' }} />
        {/* 実績 ●（機能色） */}
        <div title={`2024実績 ${fmt(cur)}床`} style={{ position: 'absolute', top: 6, left: `calc(${curPct}% - 6px)`, width: 12, height: 12, borderRadius: '50%', background: f.color, boxShadow: '0 0 0 1.5px #fff' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25 }}>
        <span style={{ fontSize: mob ? 12 : 13, fontWeight: 700, color: st.color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {st.mark}<CountUpNum value={Math.abs(diff)} />{diff !== 0 ? '床' : ''}
        </span>
        <span style={{ fontSize: 9.5, fontWeight: 600, color: st.color }}>{st.label}</span>
      </div>
    </div>
  );
}

// 病床機能区分の配色（医療需給総覧の凡例に準拠）
const FUNC = [
  { key: '高度急性期', color: '#dc2626' },
  { key: '急性期', color: '#f97316' },
  { key: '回復期', color: '#16a34a' },
  { key: '慢性期', color: '#2563EB' },
  { key: '休棟', color: '#cbd5e1' },
];

// 入退棟経路(#56)の場所カテゴリ配色
const ADMIT_CATS = [
  { key: '院内他病棟', color: '#64748b' },
  { key: '家庭', color: '#16a34a' },
  { key: '他院', color: '#f97316' },
  { key: '介護', color: '#7c3aed' },
  { key: '出生', color: '#ec4899' },
  { key: 'その他', color: '#cbd5e1' },
];
const DISCH_CATS = [
  { key: '院内他病棟', color: '#64748b' },
  { key: '家庭', color: '#16a34a' },
  { key: '他院', color: '#f97316' },
  { key: '介護', color: '#7c3aed' },
  { key: '死亡等', color: '#334155' },
  { key: 'その他', color: '#cbd5e1' },
];
const FUNC_GROUP_COLORS = { '高度急性期・急性期': '#dc2626', '回復期': '#16a34a', '慢性期': '#2563EB' };

// 100%積み上げ横バー（構成割合）。route={cat: count}, cats=[{key,color}]
function RouteBar({ route, cats }) {
  const total = cats.reduce((s, c) => s + (route[c.key] || 0), 0);
  if (!total) return <div style={{ fontSize: 11, color: '#cbd5e1' }}>該当なし</div>;
  return (
    <div style={{ display: 'flex', height: 26, borderRadius: 5, overflow: 'hidden', border: '1px solid #f0f0f0' }}>
      {cats.map(c => {
        const v = route[c.key] || 0; if (!v) return null;
        const pct = v / total * 100;
        return (
          <div key={c.key} title={`${c.key} ${fmt(v)}件 (${pct.toFixed(1)}%)`}
               style={{ width: `${pct}%`, background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {pct >= 9 && <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{pct.toFixed(0)}%</span>}
          </div>
        );
      })}
    </div>
  );
}

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

export default function HsaBedDetailPanel({ mob }) {
  const { code, data, loading } = useHsaPanel('bed');
  const [tab, setTab] = useState('chart'); // chart | table

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

  // 病床機能別 推移＋2025必要数（カルテ #19）
  const NEC_FUNCS = [
    { key: '高度急性期', color: '#dc2626' },
    { key: '急性期', color: '#f97316' },
    { key: '回復期', color: '#16a34a' },
    { key: '慢性期', color: '#2563EB' },
  ];
  const nec = data?.necessity;
  const NEC_HIST_YEARS = ['2015', '2018', '2019', '2020', '2021', '2022', '2023', '2024'];
  const necDiff = nec ? NEC_FUNCS.map(f => {
    const cur = nec.series?.[f.key]?.['2024'] ?? 0;
    const need = nec.series?.[f.key]?.['必要'] ?? 0;
    return { ...f, cur, need, diff: cur - need };
  }) : [];

  // 閉状態でも見える結論: 総床数 + 機能比率ミニバー
  const headline = area && t ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2563EB', whiteSpace: 'nowrap' }}>{fmt(t.beds)}<span style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 500, marginLeft: 1 }}>床</span></span>
      <span style={{ display: 'flex', width: 64, height: 9, borderRadius: 3, overflow: 'hidden', border: '1px solid #eef1f5' }}>
        {FUNC.map(fn => { const v = t.funcBeds[fn.key]; if (!v) return null; const pct = v / Math.max(1, t.beds) * 100; return <span key={fn.key} title={`${fn.key} ${fmt(v)}床`} style={{ width: `${pct}%`, background: fn.color }} />; })}
      </span>
    </div>
  ) : null;

  return (
    <HsaPanel title="圏域内 医療機関別 病床機能構成"
              badges={[{ label: '令和6年度病床機能報告', kind: 'muted' }]}
              headline={headline}
              defaultOpen={true}
              loading={loading}
              empty={!area}
              emptyText="この圏域の病床機能データは見つかりませんでした。">
      {() => (
        <>
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
            {[['chart', '施設別グラフ'], ['adm', '入院料別'], ['necessity', '必要病床数'], ['route', '入退棟経路'], ['table', '表']].map(([id, l]) => (
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

          {tab === 'necessity' && (nec ? (() => {
            const domainMax = Math.max(1, ...necDiff.flatMap(x => [x.cur, x.need])) * 1.06;
            return (
            <>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 8 }}>機能別 2024実績（<b style={{ color: '#334155' }}>●</b>）が2025必要数（<span style={{ color: '#64748b' }}>○</span>）へ届くか。連結線の色＝過不足の向き。左のスパークラインは2015→2024の実績推移。</div>
              {/* 目盛レジェンド */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 10.5, color: '#64748b', marginBottom: 4 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#334155' }} />2024実績</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #64748b', background: '#fff', boxSizing: 'border-box' }} />2025必要</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 4, borderRadius: 2, background: '#dc2626' }} />不足</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 4, borderRadius: 2, background: '#d97706' }} />過剰</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 4, borderRadius: 2, background: '#0f6e5d' }} />整合</span>
              </div>
              <div style={{ marginTop: 4 }}>
                {necDiff.map((r) => (
                  <NecDumbbellRow key={r.key} f={r} cur={r.cur} need={r.need} diff={r.diff} domainMax={domainMax}
                                  series={NEC_HIST_YEARS.map(y => nec.series?.[r.key]?.[y]).filter(v => v != null)} mob={mob} />
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                差分＝2024実績−2025必要数。<span style={{ color: '#dc2626' }}>不足（実績が必要に届かない）</span>は機能の確保、<span style={{ color: '#d97706' }}>過剰</span>は機能分化が課題。回復期の不足は機能分化の遅れを示唆。<br />
                出典: {data.necessitySource}｜カルテ #19 と<b style={{ color: '#0f6e5d' }}>数値一致</b>を検証済み（必要数は構想区域単位の固定値）。
              </div>
            </>
            );
          })() : (tab === 'necessity' && <div style={{ padding: 16, fontSize: 12, color: '#94a3b8' }}>この圏域は構想区域と二次医療圏が一致せず、必要病床数を単独表示できません。</div>))}

          {tab === 'route' && (area.routes && Object.keys(area.routes).length ? (
            <>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 10 }}>病床機能グループ別の入棟経路（入棟前の場所）・退棟先の構成割合（年間・令和6年度）</div>
              {Object.entries(area.routes).map(([grp, r]) => (
                <div key={grp} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: FUNC_GROUP_COLORS[grp] || '#64748b' }} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>{grp}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : '46px 1fr', gap: mob ? 3 : 8, alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>入棟前</span>
                    <RouteBar route={r.admit} cats={ADMIT_CATS} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : '46px 1fr', gap: mob ? 3 : 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>退棟先</span>
                    <RouteBar route={r.discharge} cats={DISCH_CATS} />
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, marginTop: 4 }}>
                {[...ADMIT_CATS, { key: '死亡等', color: '#334155' }].filter((c, i, a) => a.findIndex(x => x.key === c.key) === i).map(c => (
                  <span key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#475569' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: c.color }} />{c.key}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 8 }}>介護＝入棟前は介護施設・福祉施設＋介護医療院、退棟先は介護老人保健・福祉施設＋介護医療院＋社会福祉施設・有料老人ホーム等。カルテ #56 の2024年の機能別構成割合と数値一致（検証済み）。</div>
            </>
          ) : (tab === 'route' && <div style={{ padding: 16, fontSize: 12, color: '#94a3b8' }}>入退棟経路データがありません。</div>))}

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
        </>
      )}
    </HsaPanel>
  );
}
