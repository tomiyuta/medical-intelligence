'use client';
import { useState, useEffect } from 'react';

// #7 医療機関の指定状況（基幹的機能の担い手を圏内で一覧）
const COLORS = {
  chiiki_shien: '#2563EB', kyumei: '#dc2626', saigai: '#f97316',
  shusanki: '#db2777', gan: '#7c3aed', psc: '#0891b2',
};

export default function HsaDesignationPanel({ code, mob }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!code || !open) return;
    if (d && d.code === code) return;
    setLoading(true); setD(null);
    fetch(`/api/hsa/designation?code=${code}`).then(r => r.json()).then(x => { setD({ ...x, code }); setLoading(false); })
      .catch(() => setLoading(false));
  }, [code, open]);

  if (!code) return null;
  const facs = d?.facilities || [];
  const order = d?.order || [];
  const labels = d?.labels || {};

  const th = { padding: '7px 6px', fontSize: 9.5, fontWeight: 600, color: '#94a3b8', borderBottom: '1px solid #eef2f6', whiteSpace: 'nowrap', textAlign: 'center' };

  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', border: 'none', background: 'linear-gradient(180deg,#f8fafc,#fff)', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0f6e5d', background: '#e3f0ed', padding: '2px 8px', borderRadius: 10 }}>ネイティブ再構築</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>医療機関の指定状況</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: 10 }}>最新公表版</span>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{open ? '▲ 閉じる' : '▼ 開く'}</span>
      </button>

      {open && (
        <div style={{ padding: '4px 18px 18px' }}>
          {loading && <div style={{ padding: 24, color: '#cbd5e1', fontSize: 13 }}>読み込み中…</div>}
          {!loading && facs.length > 0 && <>
            <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 10 }}>圏内で基幹的機能（救急・災害・周産期・がん等）を担う {facs.length} 医療機関</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {facs.map((f, i) => (
                <div key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 8px', padding: '9px 12px', background: '#fafbfc', border: '1px solid #f0f0f0', borderRadius: 9 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginRight: 4 }}>{f.name}</span>
                  {order.filter(k => f.designations.includes(k)).map(k => (
                    <span key={k} style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: COLORS[k], padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>{labels[k]}</span>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.7, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              出典: {d.source}｜施設名・二次医療圏名・住所で二次医療圏へ割当。
              <span style={{ color: '#0369a1' }}>※最新公表版のため、カルテ #7（作成時点版）とは指定の増減により差がある場合があります。脳卒中PSC（日本脳卒中学会認定）は別ソースのため本表には未収載。</span>
            </div>
          </>}
          {!loading && facs.length === 0 && <div style={{ padding: 20, fontSize: 12.5, color: '#94a3b8' }}>この圏域で該当する指定医療機関は見つかりませんでした。</div>}
        </div>
      )}
    </div>
  );
}
