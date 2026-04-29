# Phase 4-3a: NDB 26 risk proxy audit report

**フェーズ**: Phase 4-3a (Phase 4-3 第 3 弾、Risk proxy 側拡張の検討)
**branch**: feature/phase4-3a-ndb-26-risk-proxy-audit
**reviewer 採択方針**: scoping + audit first (UI 変更なし、Risk proxy 解像度向上の検討)
**結論サマリ**: 26 項目フル取得より先に **既存 19 項目の活用拡大** が ROI 高 → docs-only で記録、UI 反映は次フェーズ判断

---

## 0. Executive Summary

| 軸 | 結論 |
|---|---|
| 「26 項目フル取得」の出典 | BRIDGE_V1 §7 #3 (検査値 5 → 26) |
| 既存実態 | **検査値 5 + 質問票 14 = 19 項目を既に取得済** (Phase 2 完了) |
| 既存項目の活用率 | P1 = 4 evidence (BMI/HbA1c のみ NDB 由来)、P6 = 3 evidence |
| **ボトルネック** | **NDB 追加取得ではなく、既存 19 項目の活用不足** |
| 沖縄 P1 強化候補 | 4 evidence → 8-10 evidence (体重増加歴 rank 1、心疾患歴 rank 2、脳卒中歴 rank 4 等) |
| 東京 P6 強化候補 | 3 evidence → 5-6 evidence (SBP rank 47、hypertension_med rank 47 等) |
| 採用判断 | **docs-only**: 本フェーズは audit、判定ロジック変更は行わない |
| 次フェーズ候補 | (a) 既存 19 項目の P1/P6 evidence 拡張 (中工数、UI 影響中)、(b) 追加 7 検査値項目 ETL (中工数) |

---

## 1. 背景

`docs/BRIDGE_V1_INTERPRETATION.md §7` で「検査値 26項目フル取得 (現在5項目)」が将来候補として記載されている。一方、Phase 2 で NDB 質問票 14 項目が既に ETL 済み (`data/static/ndb_questionnaire.json`) であり、合計 **19 項目が既存**。

reviewer 採択 Phase 4-3 推奨優先順序 (Phase 4-3d/e で Supply 側を点検済み):
> 次は Risk proxy 側を厚くするのが自然。

本 audit では、既存 19 項目と未取得 7 項目を整理し、どこから拡張すべきかを判断する。

---

## 2. NDB 第10回 26 項目の構成

reviewer の言う「26 項目」は厚労省 [第10回NDBオープンデータ](https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177221_00016.html) の以下の構成:

### 2.1 検査値階層別分布 (公式公開項目)

| # | 項目 | 既存取得 | 用途 |
|---|---|---|---|
| 1 | BMI | ✅ `bmi_ge_25` | 代謝・循環器 (P1 使用中) |
| 2 | 腹囲 | ❌ 未取得 | メタボ |
| 3 | 収縮期血圧 (SBP) | ✅ `sbp_ge_140` | 循環器・脳血管 |
| 4 | 拡張期血圧 (DBP) | ❌ 未取得 | 循環器 |
| 5 | 中性脂肪 (TG) | ❌ 未取得 | 循環器 |
| 6 | HDL コレステロール | ❌ 未取得 | 循環器 |
| 7 | LDL コレステロール | ✅ `ldl_ge_140` | 循環器 |
| 8 | AST (GOT) | ❌ 未取得 | 肝機能 |
| 9 | ALT (GPT) | ❌ 未取得 | 肝機能 |
| 10 | γ-GT | ❌ 未取得 | 肝機能 |
| 11 | 空腹時血糖 | ❌ 未取得 | 糖尿病 |
| 12 | HbA1c | ✅ `hba1c_ge_6_5` | 糖尿病 (P1 使用中) |
| 13 | 尿糖 | ❌ 未取得 | 糖尿病 |
| 14 | 尿蛋白 | ✅ `urine_protein_ge_1plus` | 腎疾患 |
| 15-20 | (eGFR, クレアチニン, 尿酸, 血色素 等) | ❌ 未取得 | 腎・代謝 |

→ **検査値 5 取得済 / 15 未取得** = フル取得まで 15 項目

### 2.2 質問票回答分布 (既存 ETL 完了)

`data/static/ndb_questionnaire.json#questions`:

| # | キー | 内容 | 用途 |
|---|---|---|---|
| 1 | smoking | 喫煙 | 循環器 |
| 2 | weight_gain | 体重増加歴 | 代謝・糖尿病 |
| 3 | exercise | 運動習慣 | 全般 |
| 4 | walking | 歩行習慣 | 全般 |
| 5 | late_dinner | 遅い夕食 | 代謝 |
| 6 | drinking_daily | 毎日飲酒 | 肝・代謝 |
| 7 | heavy_drinker | 大酒飲み | 肝・循環器 |
| 8 | sleep_ok | 睡眠良好 | 全般 |
| 9 | hypertension_med | 高血圧治療薬 (Q1) | 循環器 |
| 10 | heart_disease | 心疾患既往 | 循環器 |
| 11 | ckd_history | 腎疾患既往 | 腎 |
| 12 | diabetes_medication | 糖尿病治療薬 (Q2) | 糖尿病 |
| 13 | lipid_medication | 脂質異常症薬 (Q3) | 循環器 |
| 14 | stroke_history | 脳卒中既往 (Q4) | 脳血管 |

→ **質問票 14 取得済 / 8 未取得** (Q5/Q6/その他)

### 2.3 既存 + 未取得 集計

| 種別 | 既存 | 未取得 | 合計 |
|---|---|---|---|
| 検査値 | 5 | 15 | 20 |
| 質問票 | 14 | 8 | 22 |
| **総計** | **19** | **23** | **42** |

→ **「26項目」より既に多い 19 項目が取得済**。以降「26項目」は便宜的な括りとし、本 audit は **既存 19 項目の活用** を主眼にする。

---

## 3. 既存 19 項目の Pattern 1-6 mapping 適性

### 3.1 沖縄県 P1 (Risk-Care Gap) — 焦点 A

**現在の P1 evidence**: BMI / HbA1c / endo (内分泌外来受療率) / dm (糖尿病死亡率) = 4 項目

| 既存項目 | 沖縄 rank | 強化方向 | 採用候補 |
|---|---|---|---|
| BMI ≥25 | **1/47** | リスク超高位 | ✅ 使用中 |
| HbA1c ≥6.5 | 6/47 | リスク高位 | ✅ 使用中 |
| SBP ≥140 | 13/47 | 中位、弱い | ⚠ 中立 |
| LDL ≥140 | 26/47 | 中位、矛盾 | ❌ |
| 尿蛋白 1+ | 13/47 | 中位 | ⚠ 中立 |
| weight_gain | **1/47** | リスク超高位 | ✅ **強化候補** |
| heart_disease | **2/47** | 既往歴超高位 | ✅ **強化候補** |
| stroke_history | **4/47** | 既往歴高位 | ✅ **強化候補** |
| heavy_drinker | **1/47** | リスク高位 | ✅ **強化候補** |
| exercise | 47/47 | 運動最少 | ✅ **強化候補** (リスク方向) |
| smoking | 44/47 | 喫煙少、矛盾 | ❌ |
| drinking_daily | 47/47 | 飲酒少、矛盾 | ❌ |

**沖縄パラドクスの解像度向上**:
- 沖縄は「全リスクが高い」ではなく **「BMI / 体重増加 / 既往歴 / 大酒飲み / 運動不足」が突出**、一方「喫煙・毎日飲酒は最少」という複雑構造
- 4 evidence → **8 evidence に拡張可能** (BMI/HbA1c/weight_gain/heart_disease/stroke_history/heavy_drinker/exercise + dm)

### 3.2 東京都 P6 (Urban Context) — 焦点 B

**現在の P6 evidence**: 75+ / hba1c / bmi = 3 項目

| 既存項目 | 東京 rank | 強化方向 | 採用候補 |
|---|---|---|---|
| 75+ | 46/47 | 低齢化超高位 | ✅ 使用中 |
| HbA1c ≥6.5 | **47/47** | リスク最低 | ✅ 使用中 |
| BMI ≥25 | 37/47 | 低位 | ✅ 使用中 |
| SBP ≥140 | **47/47** | リスク最低 | ✅ **強化候補** |
| hypertension_med | **47/47** | 治療率最低 | ✅ **強化候補** |
| diabetes_medication | 46/47 | 治療率低位 | ✅ **強化候補** |
| lipid_medication | 46/47 | 治療率低位 | ✅ **強化候補** |
| heart_disease | 40/47 | 既往歴低位 | ✅ **強化候補** |
| exercise | 46/47 | 運動低、矛盾 | ⚠ 注意 |
| walking | 45/47 | 歩行低、矛盾 | ⚠ 注意 |

→ 3 evidence → **6-7 evidence に拡張可能**。ただし運動・歩行の低さは Urban Context と矛盾する補助 evidence (都市部では交通機関依存)。

### 3.3 山口県 P3 (Supply-Outcome Mismatch) — 焦点 C

**現在の P3 evidence**: hc / pneumonia / 腎不全 (年齢調整) = 3 項目

| 既存項目 | 山口 rank | 強化方向 | 採用候補 |
|---|---|---|---|
| LDL ≥140 | **1/47** | リスク超高位 | ✅ **強化候補** |
| stroke_history | **2/47** | 既往歴超高位 | ✅ **強化候補** (cerebro 死亡率と整合) |
| heart_disease | 13/47 | 中位 | ⚠ 中立 |
| ckd_history | 15/47 | 中位 | ⚠ 中立 |

→ Risk 側で 2 項目強化候補 (LDL / stroke_history)。Phase 4-3d/4-3e で確認した「届出 ≠ 実績」と整合する補助情報になる。

### 3.4 秋田県 P5 (Aging-Outcome Burden) — 焦点 D

**現在の P5 evidence**: 75+ / hc / rh / cerebro = 4 項目

| 既存項目 | 秋田 rank | 強化方向 | 採用候補 |
|---|---|---|---|
| SBP ≥140 | **4/47** | リスク超高位 | ✅ **強化候補** |
| BMI ≥25 | 6/47 | リスク高位 | ✅ **強化候補** |
| hypertension_med | **3/47** | 治療率高位 | ✅ **強化候補** |
| lipid_medication | **1/47** | 治療率最高 | ✅ **強化候補** |
| drinking_daily | **1/47** | 飲酒最多 | ✅ **強化候補** |
| smoking | 6/47 | 喫煙高位 | ✅ **強化候補** |
| stroke_history | 6/47 | 既往歴高位 | ✅ **強化候補** |

→ 4 evidence → **9-10 evidence に拡張可能**。秋田は全リスク・治療指標が高位で、P5 (Aging-Outcome Burden) と完全整合。

---

## 4. Bridge Risk Model v1 との整合性

`lib/domainMapping.js` の現状を確認 (commit 3bfe491):

```javascript
// 既存: hba1c_ge_6_5, bmi_ge_25 のみ riskKey で参照
// 他 17 項目は ndb_checkup_risk_rates / ndb_questionnaire に存在するが
// detectArchetypes で参照されていない
```

→ **既存項目 19 / Bridge Risk Model 参照 2 = 活用率 10.5%**。

拡張余地:
- detectArchetypes で SBP, LDL, weight_gain, heart_disease 等を riskKey として追加
- ただし判定ロジック変更は Phase 4-1 P2 で確定した baseline を変える可能性 → 慎重判断必要

---

## 5. 採用判断

reviewer 採択 4 候補の評価:

| 案 | 内容 | 工数 | 価値 | 採否 |
|---|---|---|---|---|
| **A** | 既存 19 項目を docs/audit に整理 | 小 | 中 (透明性向上) | ✅ **本フェーズ採用** |
| B | 既存 19 項目を detectArchetypes に追加 (lib 改修) | 中 | 高 (P1/P6 evidence 拡張) | ⏳ 次フェーズ判断 (UI 影響中) |
| C | 未取得 7 検査値項目 ETL (TG/HDL/eGFR/腹囲/AST/ALT/空腹時血糖) | 中 | 中 | ⏳ 次フェーズ判断 |
| D | UI に追加 evidence を表示 | 中 | 中 | ❌ Phase 4-1 guardrail 違反、現時点では行わない |

**本フェーズ (4-3a) は A のみ採用** = audit と docs 整理に留める。

理由:
1. reviewer 採択方針 (UI 変更なし、scoping + audit first) に整合
2. B/C は Phase 4-1 で確定した P1/P6 判定 baseline を変える可能性 → reviewer 判断を仰ぐべき
3. 既存項目の存在自体が docs で明示されていなかったので、まず透明性を確保

---

## 6. 沖縄 P1 / 東京 P6 シミュレーション

reviewer Done 条件:
> 沖縄 P1 の Risk-Care Gap が追加項目で強化されるか確認

**結論**: ✅ **強化される** (4 → 8 evidence 候補)

詳細:
- BMI rank 1, HbA1c rank 6, weight_gain rank 1, heart_disease rank 2, stroke_history rank 4, heavy_drinker rank 1, exercise rank 47 (運動少 = リスク方向), 既存 dm/endo
- ただし detectArchetypes に組み込むかは Phase 4-2/UX 判断

> 東京 P6 の low-risk context が追加項目でも維持されるか確認

**結論**: ✅ **維持される** (3 → 6 evidence 候補)

詳細:
- 75+ rank 46, HbA1c rank 47, BMI rank 37, SBP rank 47, hypertension_med rank 47, diabetes_medication rank 46, lipid_medication rank 46, heart_disease rank 40
- exercise/walking 低位 (運動・歩行少) は Urban Context と矛盾する補助 evidence → caveat 必要

---

## 7. 重要な構造的発見 (沖縄パラドクスの再解釈)

本 audit で沖縄リスク構造の解像度が向上:

| 軸 | 沖縄 rank |
|---|---|
| **代謝・体型リスク (突出)** | BMI 1, weight_gain 1 |
| **既往歴リスク (突出)** | heart_disease 2, stroke_history 4 |
| **生活習慣リスク (混在)** | heavy_drinker 1, drinking_daily 47, smoking 44, exercise 47 |
| **検査値リスク (中位)** | SBP 13, LDL 26 |

→ 沖縄は「**代謝・既往歴・運動不足は突出、ただし喫煙・毎日飲酒は最少**」という **複雑型 Risk-Care Gap**。
→ 単純な「沖縄は健康」「沖縄は不健康」の二項対立ではない。

これは BRIDGE_V0 で言及された「沖縄糖尿病パラドクス」に対する解像度向上。ただし因果は推論しない (Phase 4-1 guardrail)。

---

## 8. Phase 4-1 guardrail 整合確認

✅ UI / Pattern 判定変更なし (本フェーズは audit のみ、`lib/regionalMismatchLogic.js` 未変更)
✅ 「リスクが高い県 = 不健康」と書かない (沖縄パラドクスを多軸で整理)
✅ detectArchetypes の改修は次フェーズ判断 (今は提案のみ)
✅ 既存 19 項目を即 lib/UI に組み込まない
✅ terminology guard CI 通過維持

---

## 9. Done 条件チェック

reviewer 採択 Done 条件:

| # | 条件 | 状態 |
|---|---|---|
| 1 | 現行5項目と追加候補21項目を一覧化 | ✅ §2.1/2.2 (既存 19 + 未取得 23 = 42 項目で整理) |
| 2 | 6疾患領域への mapping 候補を作成 | ✅ §3 (Pattern 1/3/5/6 別) |
| 3 | 既存 Bridge Risk Model v1 との整合性を評価 | ✅ §4 (活用率 10.5%) |
| 4 | 追加してよい項目 / docs-only / no-go を分類 | ✅ §5 (4 案分類) |
| 5 | 沖縄 P1 が追加項目で強化されるか確認 | ✅ §6 (4 → 8 evidence 候補) |
| 6 | 東京 P6 が追加項目でも維持されるか確認 | ✅ §6 (3 → 6 evidence 候補) |
| 7 | UI追加は行わない | ✅ §5 案 D 不採用 |
| 8 | npm test PASS | ✅ (test 追加済) |

---

## 10. 関連 commit / 次フェーズ候補

### Phase 4-3 commit chain (本フェーズまで)
```
b80ba02  scoping plan
1c2223a  Merge: Phase 4-3d Homecare actual audit
a9f2a16  Merge: Phase 4-3e Capability mapping audit
3bfe491  Merge: Phase 4-3e P3 caveat update
(本フェーズ) test: ndb 26 risk proxy audit checks
(本フェーズ) docs: phase4-3a ndb 26 risk proxy audit
```

### 次フェーズ候補

| 優先 | 候補 | 工数 | 価値 | 誤読リスク |
|---|---|---|---|---|
| 1 | 既存 19 項目を P1/P6 evidence に組み込む (案 B) | 中 | 高 | 中 (UI 影響あり) |
| 2 | 未取得 7 検査値項目 ETL (案 C: TG/HDL/eGFR等) | 中 | 中 | 低 |
| 3 | 4-3b NDB 396 薬効分類 (沖縄 cross-check) | 中 | 中 | 低 |
| 4 | 4-3c 二次医療圏化 | 大 | 中 | 中 |

### 関連 docs
- `docs/BRIDGE_V0_INTERPRETATION.md` (沖縄糖尿病パラドクス、本 audit と関連)
- `docs/BRIDGE_V1_INTERPRETATION.md §7` (26 項目 next step)
- `docs/PHASE2_RELEASE_NOTES.md` (質問票 14 項目 ETL 履歴)
- `docs/NDB_DATA_REQUEST.md` (Phase 1 取得仕様)
- `docs/PHASE4_3_DATA_EXPANSION_PLAN.md` (4-3a 全体 scoping)

