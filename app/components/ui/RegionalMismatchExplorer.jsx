'use client';
import InterpretationGuard from './InterpretationGuard';
import { detectArchetypes } from '../../../lib/regionalMismatchLogic';

/**
 * RegionalMismatchExplorer (Phase 4-1 P1-4 MVP)
 *
 * 選択した県について、地域医療構造の archetype (観察ラベル) を
 * 自然言語で 0〜3個提示する。地図色分けではなく evidence panel 形式。
 *
 * Phase 4-1 P2-1 で判定ロジックを lib/regionalMismatchLogic.js に分離。
 * 47都道府県全件 snapshot QA test と共通のロジックを使う。
 *
 * reviewer 採択 (Conditional Go 5条件 #5):
 *   "Regional Mismatch Explorer は地図色分けではなく
 *    個別県 evidence panel から始める"
 *
 * 6 archetype のうち MVP では 4 つを実装 (lib/regionalMismatchLogic.js 参照):
 *   Mismatch Signal: Pattern 1 (Risk-Care Gap), Pattern 3 (Supply-Outcome Mismatch),
 *                    Pattern 5 (Aging-Outcome Burden)
 *   Context:         Pattern 6 (Urban Low-risk / High-capability)
 *
 * 自然言語表示は peer review v1 案B採択 (「乖離が見られます」形式)。
 * 「Pattern N」のラベル直接表示は避ける (診断的に見えるため)。
 *
 * docs: REGIONAL_MISMATCH_PATTERNS.md, PHASE4_REVIEW_PACKAGE.md §7
 */

export default function RegionalMismatchExplorer({ pref, ndbCheckupRiskRates, ndbQuestionnaire, patientSurvey, mortalityOutcome2020, homecareCapability, agePyramid }) {
  if (!pref) return null;

  const ctx = { pref, ndbCheckupRiskRates, ndbQuestionnaire, patientSurvey, mortalityOutcome2020, homecareCapability, agePyramid };
  const matches = detectArchetypes(ctx);

  return (
    <div style={{ marginTop: 32, marginBottom: 24, padding: '20px 16px', background: '#fafbfc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
        🔍 {pref}で観察される地域構造ラベル
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 16, lineHeight: 1.6 }}>
        現行データから自動判定される観察ラベル候補です。複数該当しうる multi-label であり、排他的分類ではありません。
        ラベルが0個の場合は、設定された判定閾値内に該当しないことを意味します。
      </div>

      <InterpretationGuard variant="mismatch" compact={true} />

      {matches.length === 0 ? (
        <div style={{ padding: '16px', background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 6, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
          現在の判定閾値内では、特定の観察ラベルに該当しません。
          <br />
          <span style={{ fontSize: 10, color: '#94a3b8' }}>
            これは「問題がない」という意味ではなく、4 archetype (MVP) の判定基準内に該当しないことを示します。
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {matches.map((m, i) => (
            <div
              key={i}
              style={{
                background: '#fff',
                border: `1px solid ${m.layer === 'mismatch' ? '#fecaca' : '#bae6fd'}`,
                borderLeft: `4px solid ${m.layer === 'mismatch' ? '#dc2626' : '#0891b2'}`,
                borderRadius: 6,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 9, fontWeight: 700, color: m.layer === 'mismatch' ? '#dc2626' : '#0891b2', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{m.layer === 'mismatch' ? '◆ Mismatch Signal (不一致シグナル)' : '◇ Context Archetype (背景構造プロファイル)'}</span>
                {m.confidence && (
                  <span
                    title={`confidence: ${m.confidence.label}\nscore: ${m.confidence.score}\nevidence数: ${m.confidence.factors.evidence_count}\n強signal数: ${m.confidence.factors.strong_stats}\n極端signal数: ${m.confidence.factors.very_strong_stats}\nproxy caveat: ${m.confidence.factors.has_proxy_caveat}\n\n${m.confidence.caveat}`}
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: '#64748b',
                      background: '#f1f5f9',
                      padding: '2px 6px',
                      borderRadius: 3,
                      letterSpacing: 0,
                      textTransform: 'none',
                      cursor: 'help',
                    }}
                  >
                    {m.confidence.grade === 'A' ? '高' : m.confidence.grade === 'B' ? '中' : '参考'} confidence ({m.confidence.grade})
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{m.title}</div>
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 10, lineHeight: 1.7 }}>{m.description}</div>

              <div style={{ background: '#f8fafc', borderRadius: 4, padding: '10px 12px', fontSize: 11 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>📊 根拠 (evidence)</div>
                {m.evidence.map((e, j) => (
                  <div key={j} style={{ padding: '4px 0', borderBottom: j < m.evidence.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ color: '#475569', flex: '1 1 60%' }}>{e.label}</div>
                      <div style={{ color: '#1e293b', fontWeight: 600, flex: '0 0 auto', minWidth: 80, textAlign: 'right' }}>{e.value}</div>
                      <div style={{ color: '#94a3b8', fontSize: 10, flex: '0 0 auto', minWidth: 140, textAlign: 'right' }}>{e.ref}</div>
                    </div>
                    {e.stats && (
                      <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2, paddingLeft: 8, lineHeight: 1.4 }}>
                        <span title={`47県分布: 平均=${e.stats.mean}, 標準偏差=${e.stats.std} (n=${e.stats.n})`}>
                          47県分布: percentile <b style={{color:'#475569'}}>{e.stats.percentile.toFixed(0)}</b> /
                          z = <b style={{color:'#475569'}}>{e.stats.zscore > 0 ? '+' : ''}{e.stats.zscore.toFixed(2)}</b> /
                          rank {e.stats.rank}/{e.stats.n}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {m.supportEvidence && m.supportEvidence.length > 0 && (() => {
                const supporting = m.supportEvidence.filter(e => e.supports_pattern).length;
                const total = m.supportEvidence.length;
                const tooltipText = m.supportEvidence
                  .map(e => `${e.label}: rank ${e.stats?.rank}/${e.stats?.n} (z=${e.stats?.zscore})${e.supports_pattern ? ' ★支持' : ''}`)
                  .join('\n');
                return (
                  <div
                    title={`補助 evidence (NDB 質問票・検査値、Phase 4-3f):\n${tooltipText}\n\n注: 主 evidence は変更されません。support_bonus は confidence score に最大 +1 のみ加算され、stability=true の場合のみ有効。境界例の過剰昇格を防ぎます。詳細は docs/PHASE4_3F_RISK_SUPPORT_EVIDENCE.md`}
                    style={{
                      marginTop: 8,
                      fontSize: 10,
                      color: '#64748b',
                      background: '#f1f5f9',
                      padding: '5px 10px',
                      borderRadius: 3,
                      cursor: 'help',
                      borderLeft: supporting >= 2 ? '2px solid #94a3b8' : '2px solid #e2e8f0',
                    }}
                  >
                    💡 補助 evidence: <b style={{color: '#475569'}}>{supporting}/{total} 項目</b>が同方向に支持
                    {m.confidence?.factors?.support_bonus > 0 && <span style={{marginLeft: 8, color: '#0891b2'}}>(confidence +{m.confidence.factors.support_bonus})</span>}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, padding: '10px 12px', background: '#fef9c3', borderRadius: 4, fontSize: 10, color: '#78350f', lineHeight: 1.6 }}>
        <b>💡 設計に関する注意</b>
        <br />
        本機能は MVP (P1-4) です。現行は 4 archetype (Risk-Care / Supply-Outcome Mismatch / Aging-Outcome Burden / Urban Context) のみ判定対象。
        Pattern 2 (Supply-Outcome 並列悪化) と Pattern 4 (Alignment Context) は将来追加します。
        判定閾値は経験則 (±5%/15% neutral zone) に基づく暫定値であり、感度分析は P2 課題です。
        <br />
        <br />
        <b>🧮 evidence の3指標について</b> (Phase 4-1 P2-3):
        <br />
        ・<b>全国比 / 47県平均比 (% diff)</b>: 中央傾向との相対位置。直感的だが分布の幅は反映されない。
        <br />
        ・<b>percentile</b>: 47県分布の中で何位相当か (0-100)。順位ベースで分布の歪みに頑健。
        <br />
        ・<b>z-score</b>: 標準偏差を単位とする位置 (正規分布前提)。±2 以上は「外れ値級」の目安。
        <br />
        ・3指標が一致して大きい場合は強い signal、不一致時は分布の偏りを示唆。
        <br />
        <br />
        <b>🏷 confidence バッジについて</b> (Phase 4-1 P2-4):
        <br />
        ・<b>高 (A)</b>: 複数根拠が揃い分布上も極端、シナリオ間で安定。
        <br />
        ・<b>中 (B)</b>: 根拠あり、ただし境界条件 or proxy caveat。
        <br />
        ・<b>参考 (C)</b>: 閾値・proxy・時点差に注意が必要。
        <br />
        ・confidence は観察信号の強さを示す補助指標であり、医療の質・政策効果・地域の優劣を示すものではありません。
        <br />
        ・<b style={{color:'#92400e'}}>A/B/C は「正解ラベル」ではなく観察信号の強さの目安です。</b> C は「ラベルが間違っている」ではなく「閾値・proxy・時点差を踏まえて参考扱いする」という意味です。
        <br />
        ・z-score は47都道府県分布内での相対的位置を示す補助指標であり、統計的有意差を示すものではありません。
      </div>
    </div>
  );
}
