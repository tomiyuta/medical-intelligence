# Phase 4-3f: Risk-Support Evidence Implementation (B-lite 案)

**フェーズ**: Phase 4-3f (Phase 4-3a の reviewer 採択を受けて実装)
**branch**: feature/phase4-3f-risk-support-evidence
**reviewer 採択方針 (Phase 4-3a の 4 案より)**:
> 案 B-lite: UI 主 evidence は増やさず、support evidence は confidence score の
> 補助加点としてのみ使用 (max +1)。stability=true の場合のみ加算し、
> 境界県の過剰 A 化を防ぐ。

**結論サマリ**: 既存 NDB 19 項目 (Phase 4-3a 発見) を P1/P6 の補助 evidence として
実装。UI 主 evidence は不変、confidence score に補助加点のみ。境界県は無加点で
Phase 4-1 guardrail を完全保持。

---

## 0. Executive Summary

| 軸 | 結論 |
|---|---|
| reviewer 採択方針 | B-lite (UI 不変、score 補助加点のみ) |
| support_bonus 範囲 | max +1 (stability=true かつ strongSupport ≥ 2) |
| 境界県の扱い | stability=false で support_bonus=0 (過剰昇格防止) |
| 沖縄 P1 結果 | score 4 → 5 (A 維持) |
| 東京 P6 結果 | score 3 → 4 (A 維持) |
| 境界県 (大阪 P6 / 新潟 P5) | C 維持 (Phase 4-1 P2-4 baseline 不変) |
| Phase 4-1 guardrail | 完全遵守 (UI 主 evidence・Pattern 判定変更なし) |

---

## 1. 背景

Phase 4-3a (NDB 26 risk proxy audit) で以下を確認:
- 既存 19 項目 (検査値 5 + 質問票 14) のうち、Bridge V1 の活用率は 10.5%
- 沖縄 P1 は 4 → 8 evidence、東京 P6 は 3 → 7 evidence に拡張余地

reviewer 4 案 (4-3a §5) の判定 (採択):

| 案 | 内容 | 採否 |
|---|---|---|
| A | 既存 19 項目を docs/audit 整理 | ✅ Phase 4-3a で実施済 |
| **B-lite** | **既存項目を confidence 補助加点として使用 (UI 主 evidence 不変)** | ✅ **本フェーズ採用** |
| C | 未取得 7 検査値 ETL | ⏳ 後回し |
| D | UI に追加 evidence 表示 | ❌ Phase 4-1 guardrail 違反 |

---

## 2. 設計

### 2.1 SUPPORT_EVIDENCE_CONFIG (`lib/regionalMismatchLogic.js`)

Pattern 1 (Risk-Care Gap) と Pattern 6 (Urban Context) のみを scope。

```javascript
const SUPPORT_EVIDENCE_CONFIG = {
  P1: {
    questionnaire: ['weight_gain', 'heart_disease', 'stroke_history', 'heavy_drinker'],
    checkup: [],
    direction: 'high',  // 上位リスクが Pattern を支持 (沖縄は high が支持)
  },
  P6: {
    questionnaire: ['hypertension_med', 'diabetes_medication', 'lipid_medication'],
    checkup: ['sbp_ge_140'],
    direction: 'low',   // 下位リスクが Pattern を支持 (東京は low が支持)
  },
};
```

P3 / P5 は本フェーズでは scope 外 (reviewer 採択方針)。

### 2.2 support_bonus 計算ロジック (`computeConfidence`)

```javascript
const supportEvidence = match?.supportEvidence || [];
const supportStats = supportEvidence.map(e => e.stats).filter(Boolean);
const strongSupport = supportStats.filter(s =>
  Math.abs(s.zscore) >= 1.5 || s.rank <= 5 || (s.n - s.rank) <= 4
).length;
// support_bonus: stability=true かつ strongSupport >= 2 の場合のみ +1
const supportBonus = (stability === true && strongSupport >= 2) ? 1 : 0;

// score 計算
score += supportBonus;  // max +1
```

**設計意図**:
- `stability === true` 条件: relaxed/baseline/strict 全シナリオで該当する場合のみ
- `strongSupport >= 2`: 補助 evidence のうち 2 軸以上が極端 (rank≤5 or |z|≥1.5)
- 境界例 (stability=false) は加算されない → **過剰 A 昇格を構造的に防止**

### 2.3 UI 表示 (`RegionalMismatchExplorer.jsx`)

UI 主 evidence は **不変**。下部に補助 evidence summary を 1 行のみ追加:

```
💡 補助 evidence: 4/4 項目が同方向に支持 (confidence +1)
```

詳細は hover tooltip で表示 (各項目の rank・zscore)。

### 2.4 検証された境界条件

| 県 | Pattern | stability | support_bonus | grade 変化 | 検証結果 |
|---|---|---|---|---|---|
| 沖縄 | P1 | true | **+1** | A → A | ✅ 補強成功 |
| 東京 | P6 | true | **+1** | A → A | ✅ 補強成功 |
| 山口 | P3 | true | 0 (scope 外) | A → A | ✅ 不変 |
| 秋田 | P5 | true | 0 (scope 外) | A → A | ✅ 不変 |
| 大阪 | P6 | **false** | **0** | C → C | ✅ **過剰昇格防止** |
| 新潟 | P5 | scope 外 | 0 | C → C | ✅ 不変 |

→ **B-lite 案の核心 (境界例の過剰昇格防止) が実データで検証された**。

---

## 3. 実装変更ファイル

| ファイル | 変更 | 行数差 |
|---|---|---|
| `lib/regionalMismatchLogic.js` | computeConfidence 拡張 + SUPPORT_EVIDENCE_CONFIG | +116 -1 |
| `app/components/ui/RegionalMismatchExplorer.jsx` | ndbQuestionnaire prop + 補助 evidence summary | +30 -2 |
| `app/components/views/NdbView.jsx` | RegionalMismatchExplorer に ndbQuestionnaire pass | +2 -1 |
| `tests/regional_mismatch_snapshot_qa.test.js` | support_bonus / 境界県の assertion 追加 | +51 -1 |
| `tests/snapshots/regional_mismatch_47pref.json` | factors に support_bonus / supportEvidence 追加 | +249 -33 |

---

## 4. snapshot QA 拡張 (`regional_mismatch_snapshot_qa.test.js`)

新たな assertion カテゴリ:

```
[Done条件] 沖縄 P1 / 東京 P6 で support_bonus = +1 (説明力補強)
[Done条件] 境界県 (大阪・新潟・青森・岩手・山形) で support_bonus = 0 (過剰昇格防止)
[Done条件] 大阪 P6 / 新潟 P5 は C 維持 (Phase 4-1 P2-4 baseline 不変)
```

検証結果: **全 PASS** (47県全件、6 boundary 県すべて C 維持)。

---

## 5. Phase 4-1 guardrail 完全遵守

| guardrail | 状態 | 根拠 |
|---|---|---|
| UI 主 evidence 変更なし | ✅ | RegionalMismatchExplorer の主 evidence panel は不変 |
| Pattern 判定 (`detectArchetypes`) 変更なし | ✅ | thresholds / 判定条件は Phase 4-1 baseline 維持 |
| 47県判定結果の不変 | ✅ | snapshot の by_pattern (P1/P3/P5/P6 県数) は不変 |
| confidence grade の boundary 県 C 維持 | ✅ | 大阪・新潟など全 6 boundary 県で grade 不変 |
| terminology guard CI 通過 | ✅ | 67 ファイルスキャン、forbidden term 0 件 |
| 因果推論しない | ✅ | docs 上で「観察信号の補助」と明示 |

---

## 6. Devil's Advocate (採択経緯)

### 6.1 想定される批判

> support_bonus を加えると、結局 A grade 県が増えて、A = 正しいの誤読が強まるのでは?

**反論**: 本実装は **既存 A 県のみを補強**。grade B/C 県は support_bonus が無加算 (stability=false 経由) で grade 変化しない。47県の by_grade 分布は不変。

### 6.2 想定される批判

> P1 / P6 のみ scope では恣意的では?

**反論**: P3 (Supply-Outcome Mismatch) は Phase 4-3d/4-3e で proxy_caveat=-1 を確定済 (届出 ≠ 実績)。Risk side の補助 evidence で再補強すると caveat が薄まるリスク。P5 (Aging-Outcome Burden) は既に 4 evidence で signal が強く、補助は不要。
P1 (Risk-Care Gap) は Risk proxy が中核で、補助 evidence の親和性が高い。
P6 (Urban Context) は context archetype で、低リスク傾向の補助が context を補強する。

### 6.3 想定される批判

> support_bonus = +1 だけだと小さすぎないか?

**反論**: 大きく加点すると境界県が A に昇格するリスク。+1 に留め、stability=true 必須としたのは、Phase 4-1 P2-4 で確定した baseline (grade A の県数 4 件) を変えないため。

---

## 7. Done 条件チェック

| # | 条件 | 状態 |
|---|---|---|
| 1 | SUPPORT_EVIDENCE_CONFIG で P1/P6 のみ scope | ✅ |
| 2 | support_bonus の stability=true 制約 | ✅ |
| 3 | 沖縄 P1 で support_bonus=+1 | ✅ score 4→5 |
| 4 | 東京 P6 で support_bonus=+1 | ✅ score 3→4 |
| 5 | 境界県 (大阪/新潟等) で support_bonus=0 | ✅ test assertion 追加 |
| 6 | grade A 県数の不変 (Phase 4-1 P2-4 baseline) | ✅ A=4 維持 |
| 7 | UI 主 evidence 変更なし | ✅ |
| 8 | Pattern 判定ロジック変更なし | ✅ |
| 9 | npm test PASS | ✅ 7 test 連続 |
| 10 | terminology guard CI 通過 | ✅ |

---

## 8. 関連 commit / 次フェーズ候補

### Phase 4-3 commit chain (本フェーズまで)
```
b80ba02  scoping plan
1c2223a  Merge: Phase 4-3d Homecare actual audit
3bfe491  Merge: Phase 4-3e P3 caveat update
383a3a8  Merge: Phase 4-3a NDB 26 risk proxy audit
(本フェーズ) feat: support evidence implementation (B-lite)
(本フェーズ) test: snapshot QA 拡張
(本フェーズ) docs: phase4-3f risk-support evidence report
```

### 次フェーズ候補

| 優先 | 候補 | 理由 |
|---|---|---|
| 1 | reviewer 判定待ち | Phase 4-3f の B-lite 実装の評価 |
| 2 | 4-3b NDB 396 薬効分類 | 沖縄パラドクス cross-check |
| 3 | 集中度 metric の正式 ETL 化 | Phase 4-3e の発見を data 化 |
| 4 | 4-3c 二次医療圏化 | UI 大改造、後回し |

### 関連 docs
- `docs/PHASE4_3A_NDB_26_RISK_PROXY_AUDIT.md` (前フェーズ、本実装の根拠)
- `docs/REGIONAL_MISMATCH_PATTERNS.md` §10 (P2-4 confidence grade 仕様)
- `docs/PHASE4_3D_HOMECARE_ACTUAL_AUDIT.md` (P3 proxy caveat 関連)
- `docs/PHASE4_3E_CAPABILITY_MAPPING_AUDIT.md` (P3 再定義)

