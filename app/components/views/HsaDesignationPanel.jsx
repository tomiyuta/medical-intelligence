'use client';
import { useHsaPanel } from '../hsa/useHsaArea';
import HsaPanel from '../hsa/HsaPanel';

// #7 医療機関の指定状況（基幹的機能の担い手を圏内で一覧）
const COLORS = {
  chiiki_shien: '#2563EB', kyumei: '#dc2626', saigai: '#f97316',
  shusanki: '#db2777', gan: '#7c3aed', psc: '#0891b2',
};

export default function HsaDesignationPanel({ mob }) {
  const { code, data: d, loading } = useHsaPanel('designation');

  if (!code) return null;
  const facs = d?.facilities || [];
  const order = d?.order || [];
  const labels = d?.labels || {};

  return (
    <HsaPanel title="医療機関の指定状況"
              badges={[{ label: '最新公表版', kind: 'latest' }]}
              defaultOpen={false}
              loading={loading}
              empty={facs.length === 0}
              emptyText="この圏域で該当する指定医療機関は見つかりませんでした。">
      {() => (
        <>
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
        </>
      )}
    </HsaPanel>
  );
}
