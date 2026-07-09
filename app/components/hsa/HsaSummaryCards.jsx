'use client';
import { useHsaBundle } from './useHsaArea';
import { fmt } from '../shared';

// 圏の一目サマリー: 総人口増減・高齢化率・医師偏在順位・病床過不足
export default function HsaSummaryCards({ mob }) {
  const { bundle, loading } = useHsaBundle();
  if (loading || !bundle) {
    return <div style={{ height: 78, marginBottom: 20, borderRadius: 12, background: '#f1f5f9' }} />;
  }
  const cards = [];

  const py = bundle.population?.area?.years;
  if (py?.['2020'] && py?.['2050']) {
    const chg = Math.round((py['2050'].total / py['2020'].total - 1) * 1000) / 10;
    cards.push({ l: '総人口 2050', v: fmt(py['2050'].total), u: `人 (${chg > 0 ? '+' : ''}${chg}%)`, c: chg >= 0 ? '#dc2626' : '#0891b2' });
    const aging = Math.round(py['2050'].a65 / py['2050'].total * 1000) / 10;
    cards.push({ l: '高齢化率 2050', v: aging, u: '%', c: '#b45309' });
  }
  const ph = bundle.physician?.area;
  if (ph?.rank) cards.push({ l: '医師偏在 全国順位', v: ph.rank, u: `位 / ${bundle.physician.areaCount || 330}`, c: '#2563EB' });

  const nec = bundle.bed?.necessity?.series?.['合計'];
  if (nec && nec['2024'] != null && nec['必要'] != null) {
    const diff = nec['2024'] - nec['必要'];
    cards.push({ l: '病床 過不足', v: `${diff > 0 ? '+' : ''}${fmt(diff)}`, u: `床 (2024実績−必要)`, c: diff > 0 ? '#dc2626' : '#0891b2' });
  }
  if (!cards.length) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: mob ? 'repeat(2,1fr)' : `repeat(${cards.length},1fr)`, gap: 8, marginBottom: 20 }}>
      {cards.map((k, i) => (
        <div key={i} style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: 12, padding: '11px 15px' }}>
          <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500 }}>{k.l}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: k.c, letterSpacing: '-0.02em' }}>{k.v}<span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500, marginLeft: 3 }}>{k.u}</span></div>
        </div>
      ))}
    </div>
  );
}
