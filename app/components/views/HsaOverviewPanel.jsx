'use client';
import { useState, useEffect } from 'react';
import { fmt } from '../shared';

// #4 二次医療圏の概況: 都道府県内の人口・面積・人口密度の比較
export default function HsaOverviewPanel({ code, mob }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState('basic');

  useEffect(() => {
    if (!code) return;
    setLoading(true); setD(null);
    fetch(`/api/hsa/overview?code=${code}`).then(r => r.json()).then(x => { setD({ ...x, code }); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code]);

  if (!code) return null;
  const self = d?.self;
  const rows = d?.prefAreas || [];

  const cell = (v, u) => v == null ? <span style={{ color: '#e2e8f0' }}>–</span> : <>{fmt(v)}<span style={{ fontSize: 9.5, color: '#cbd5e1' }}>{u}</span></>;
  const th = { padding: '7px 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #eef2f6', whiteSpace: 'nowrap' };
  const td = { padding: '7px 8px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0f6e5d', background: '#e3f0ed', padding: '2px 8px', borderRadius: 10 }}>ネイティブ再構築</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>二次医療圏の概況（人口・面積・人口密度）</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          {loading && <div style={{ padding: 24, color: '#cbd5e1', fontSize: 13 }}>読み込み中…</div>}
          {!loading && self && <>
            {/* 当圏サマリー */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, margin: '10px 0 14px' }}>
              {[
                { l: '総人口 (2020)', v: self.pop, u: '人', c: '#2563EB' },
                { l: '面積', v: self.menseki, u: '㎢', c: '#0891b2' },
                { l: '人口密度', v: self.density, u: '人/㎢', c: '#7c3aed' },
              ].map((k, i) => (
                <div key={i} style={{ background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 8, padding: '9px 12px' }}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: k.c }}>{k.v == null ? '–' : fmt(k.v)}<span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginLeft: 2 }}>{k.u}</span></div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[['basic', '人口・面積 (#4)'], ['medical', '医療資源 10万対 (#9)'], ['staff', '医療従事者 10万対 (#10)']].map(([id, l]) => (
                <button key={id} onClick={() => setTab(id)}
                        style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid ' + (tab === id ? '#2563EB' : '#e2e8f0'), background: tab === id ? '#eff6ff' : '#fff', color: tab === id ? '#2563EB' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{l}</button>
              ))}
            </div>

            {tab === 'basic' && <>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>{d.pref}内の二次医療圏比較</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 360 }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: 'left' }}>二次医療圏</th>
                  <th style={{ ...th, textAlign: 'right' }}>人口</th>
                  <th style={{ ...th, textAlign: 'right' }}>面積(㎢)</th>
                  <th style={{ ...th, textAlign: 'right' }}>人口密度</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => {
                    const cur = r.code === code;
                    return (
                      <tr key={r.code} style={{ background: cur ? '#eff6ff' : 'transparent', borderBottom: '1px solid #f8f9fa' }}>
                        <td style={{ ...td, fontWeight: cur ? 700 : 500, color: cur ? '#2563EB' : '#334155' }}>{r.area}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{cell(r.pop, '')}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{cell(r.menseki, '')}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{cell(r.density, '')}</td>
                      </tr>
                    );
                  })}
                  {d.prefTotal && (
                    <tr style={{ borderTop: '2px solid #eef2f6', fontWeight: 700, color: '#475569' }}>
                      <td style={td}>{d.pref} 計</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.prefTotal.pop, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.prefTotal.menseki, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.prefTotal.density, '')}</td>
                    </tr>
                  )}
                  {d.national && (
                    <tr style={{ color: '#94a3b8' }}>
                      <td style={td}>全国</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.national.pop, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.national.menseki, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.national.density, '')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              出典: {d.source}｜人口密度=人口÷面積。カルテ #4 と<b style={{ color: '#0f6e5d' }}>数値一致</b>を検証済み。
            </div>
            </>}

            {tab === 'medical' && <>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>{d.pref}内の人口10万人あたり 医療機関数・病床数</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 420 }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: 'left' }}>二次医療圏</th>
                  <th style={{ ...th, textAlign: 'right' }}>病院数</th>
                  <th style={{ ...th, textAlign: 'right' }}>診療所数</th>
                  <th style={{ ...th, textAlign: 'right' }}>一般病床</th>
                  <th style={{ ...th, textAlign: 'right' }}>療養病床</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => {
                    const cur = r.code === code; const md = r.med || {};
                    return (
                      <tr key={r.code} style={{ background: cur ? '#eff6ff' : 'transparent', borderBottom: '1px solid #f8f9fa' }}>
                        <td style={{ ...td, fontWeight: cur ? 700 : 500, color: cur ? '#2563EB' : '#334155' }}>{r.area}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{cell(md.byoinP, '')}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{cell(md.shinryoP, '')}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{cell(md.ippanP, '')}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{cell(md.ryoyoP, '')}</td>
                      </tr>
                    );
                  })}
                  {d.prefTotal?.med && (
                    <tr style={{ borderTop: '2px solid #eef2f6', fontWeight: 700, color: '#475569' }}>
                      <td style={td}>{d.pref} 計</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.prefTotal.med.byoinP, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.prefTotal.med.shinryoP, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.prefTotal.med.ippanP, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.prefTotal.med.ryoyoP, '')}</td>
                    </tr>
                  )}
                  {d.national?.med && (
                    <tr style={{ color: '#94a3b8' }}>
                      <td style={td}>全国</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.national.med.byoinP, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.national.med.shinryoP, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.national.med.ippanP, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.national.med.ryoyoP, '')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              {d.facSource}｜病院数・診療所数は実数がカルテ #9 と一致。全国より病床が多い＝医療資源の分散、診療所が少ない＝かかりつけ医確保が課題の目安。
            </div>
            </>}

            {tab === 'staff' && <>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 6 }}>{d.pref}内の人口10万人あたり 医療従事者数（常勤換算・病院＋診療所）</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 420 }}>
                <thead><tr>
                  <th style={{ ...th, textAlign: 'left' }}>二次医療圏</th>
                  <th style={{ ...th, textAlign: 'right' }}>医師</th>
                  <th style={{ ...th, textAlign: 'right' }}>看護師</th>
                  <th style={{ ...th, textAlign: 'right' }}>薬剤師</th>
                  <th style={{ ...th, textAlign: 'right' }}>PT・OT・ST</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => {
                    const cur = r.code === code; const s = r.staff || {};
                    return (
                      <tr key={r.code} style={{ background: cur ? '#eff6ff' : 'transparent', borderBottom: '1px solid #f8f9fa' }}>
                        <td style={{ ...td, fontWeight: cur ? 700 : 500, color: cur ? '#2563EB' : '#334155' }}>{r.area}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{cell(s.ishiP, '')}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{cell(s.kangoP, '')}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{cell(s.yakuP, '')}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{cell(s.rehaP, '')}</td>
                      </tr>
                    );
                  })}
                  {d.prefTotal?.staff && (
                    <tr style={{ borderTop: '2px solid #eef2f6', fontWeight: 700, color: '#475569' }}>
                      <td style={td}>{d.pref} 計</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.prefTotal.staff.ishiP, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.prefTotal.staff.kangoP, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.prefTotal.staff.yakuP, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.prefTotal.staff.rehaP, '')}</td>
                    </tr>
                  )}
                  {d.national?.staff && (
                    <tr style={{ color: '#94a3b8' }}>
                      <td style={td}>全国</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.national.staff.ishiP, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.national.staff.kangoP, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.national.staff.yakuP, '')}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{cell(d.national.staff.rehaP, '')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              {d.staffSource}｜職種別の実数はカルテ #10 と一致。全国を下回る職種は医療従事者の確保が課題の目安。
            </div>
            </>}
          </>}
          {!loading && !self && <div style={{ padding: 20, fontSize: 12.5, color: '#94a3b8' }}>この圏域の概況データは見つかりませんでした。</div>}
        </div>
      )}
    </div>
  );
}
