# Phase 4-3 Data Expansion Scoping Plan

**フェーズ**: Phase 4-3 (Phase 4-1 完全クローズ後の Data 層拡張)
**branch**: feature/phase4-3-data-expansion-scoping
**reviewer 推奨方針** (P2-5 で確立): まず実装しない、まず scoping report を作る
**目的**: 二次医療圏化 / NDB 細分類 / 在宅実績指標の 4 sub-topic を整理し、優先順を提示する

---

## 1. 背景

reviewer 採択 (P2-5 完了時) より:

> 優先 3: Phase 4-3 Data — 二次医療圏化、NDB 396 細分類、在宅関連実績指標

3 トピックは scope が大きく、1 フェーズで全てを実装するのは現実的ではない。本 scoping で 4 sub-topic に分割し、優先順序を判定する。

---

## 2. 既存データ inventory

### 2.1 二次医療圏データ (partial)

| ファイル | 圏域数 | フィールド | 用途 |
|---|---|---|---|
| `medical_areas_national.json` | 330 | hospitals, wards, beds | 病床機能のみ |
| `area_emergency_homecare.json` | 339 | **hospitals, emerg, emerg_claims, homecare, homecare_patients, acute_support** | 救急・在宅実績 |

→ **339圏域×在宅実績は既存**。47県データをマッピングする ETL があれば二次医療圏 KPI が成立する。

### 2.2 NDB 検査値リスク指標

現在: **5 項目** (bmi_ge_25 / hba1c_ge_6_5 / sbp_ge_140 / ldl_ge_140 / urine_protein_ge_1plus)

`docs/BRIDGE_V1_INTERPRETATION.md §7` で「検査値 26項目フル取得 (現在5項目)」と次の v2 候補に記載済み。21 項目の拡張余地あり。

### 2.3 NDB 薬効分類 (未実装)

`docs/BRIDGE_V0_INTERPRETATION.md §仮説1` 沖縄糖尿病パラドクスで言及:

> 396 + 249 (その他のホルモン剤) で再集計し、インスリン分類漏れを定量化

→ 薬効分類 396 (糖尿病用剤) と 249 (その他ホルモン剤) の都道府県別 ETL は未実装。

### 2.4 在宅実績指標 (partial)

| 既存 | 項目 | 粒度 |
|---|---|---|
| capability (届出) | `homecare_capability_by_pref.json` | 47県 |
| 実績 (患者数) | `area_emergency_homecare.json#homecare_patients` | 339圏域 |

→ 47県集計と capability の cross-check が未実装。山口県 capability +104% が実績でも +N% かを検証する余地あり。

---

## 3. Sub-topic 分割案 (4 項目)

| Sub-topic | 内容 | データソース | 既存資産 | 工数 |
|---|---|---|---|---|
| **4-3a** NDB 検査値 26項目 | 5 → 26 項目に拡張 | 厚労省 第10回NDB | `etl_ndb_checkup_bins_v2.py` | **中** |
| **4-3b** NDB 396 薬効分類 | 糖尿病用剤+ホルモン剤の都道府県別 | 同上 (NDB処方薬) | 新規 | **中** |
| **4-3c** 二次医療圏化 (KPI) | 47県KPIを339圏域粒度に展開 | 圏域マスタ + 各 KPI | 病床/在宅は既存 | **大** |
| **4-3d** 在宅実績指標 | capability vs 患者数の cross-check | `area_emergency_homecare.json` | **既存活用のみ** | **小〜中** |

---

## 4. 評価マトリクス

| 軸 | 4-3a 26項目 | 4-3b 396薬効 | 4-3c 二次医療圏 | 4-3d 在宅実績 |
|---|---|---|---|---|
| データ取得コスト | 中 (XLSX×21) | 中 (新規ETL) | 大 (圏域マッピング全件) | **小** (既存) |
| ETL コスト | 中 (Bridge V1 拡張) | 中 (薬効分類追加) | 大 (粒度変更) | 小 (集計) |
| UI 影響 | 中 (新指標表示) | 中 (新カテゴリ) | **大** (粒度切替セレクタ + 全画面改修) | 小 (補助表示) |
| 期待価値 | 高 (新 mismatch pattern 発見余地) | 中 (沖縄 cross-check 価値) | 中 (将来必須だが本フェーズで急がない) | **高** (P3 判定の妥当性検証) |
| reviewer 推奨度 | 直接言及なし | 直接言及あり | 直接言及あり | 直接言及あり |
| ROI | 中 | 中 | 低 (大規模工数) | **高** |

---

## 5. 推奨順序

### 5.1 第 1 候補: **4-3d 在宅実績指標** (最低工数・最高 ROI)

**理由**:
- 既存 `area_emergency_homecare.json` (339圏域) を集計するだけで実装可能
- 工数は 小〜中
- 直接的価値: 山口県 P3 (cap.homecare +104%) が **実績** でも + N% かを cross-check できる
- 期待効果: capability proxy の妥当性検証 → P3 判定の信頼性向上、confidence grade の検証
- reviewer P2-2 で言及した「閾値の感度分析」「proxy caveat」を実証できる

**Done 条件**:
- 339圏域 → 47県への集計 ETL
- `data/static/homecare_actual_by_pref.json` 新規生成
- capability vs 実績の散布図 / 県別比較
- 山口・秋田・大阪 などで cap vs 実績の乖離があるか確認
- 結果を P3 判定に反映するか docs-only かを判断

### 5.2 第 2 候補: **4-3a NDB 検査値 26項目**

**理由**:
- BRIDGE_V1 §7 next step #3 として明示
- Risk Model の入力次元拡大 → 新 mismatch pattern 発見余地
- ETL は既存 `etl_ndb_checkup_bins_v2.py` の拡張で済む

### 5.3 第 3 候補: **4-3b NDB 396 薬効分類**

**理由**:
- BRIDGE_V0 沖縄糖尿病パラドクスの cross-check として価値あり
- ただし 4-3a の方が網羅的、4-3b は 4-3a の sub case として整理可能

### 5.4 第 4 候補 (後回し): **4-3c 二次医療圏化**

**理由**:
- UI 大改造、データマッピング全件、大規模工数
- 4-3d で「47県 → 339圏域」の ETL 経験を積んでから取り組む方が安全
- 現状の 47県粒度は MVP として十分

---

## 6. リスクと留意事項

### 6.1 データ品質リスク

- 第10回 NDB は 2024 年公開の最新版。2025年以降の更新タイミングは不明。
- 二次医療圏マッピングは「市町村 → 圏域」の対応表が必要。`medical_areas_national.json` は 330 / 339 圏域で齟齬あり (公式は 339)。
- 在宅実績 (患者数) は届出ベースに依存し、実態と差異がある可能性。

### 6.2 誤読リスク (Phase 4-1 guardrail との整合)

- 「実績が多い = 良い」と読まれるリスク → confidence grade と同様の caveat が必要
- 「二次医療圏で見ると東京は分裂する」が誤読を生む可能性 → 圏域単位の解釈ガイド必須
- NDB 396 薬効が「処方が多い = 病気が多い or 治療が手厚い」両方解釈可能 → context 必須

### 6.3 Phase 4-1 guardrail の継承

すべての sub-topic で以下を遵守:
- terminology guard CI が通ること
- 因果推論しない (proxy 同士の相関のみ)
- 観察ラベル化を維持
- confidence grade を新指標にも適用

---

## 7. 結論と次のアクション

### 7.1 結論

Phase 4-3 を 4 sub-topic に分割し、**4-3d 在宅実績指標から着手** を推奨。

### 7.2 次のアクション (user 判断)

選択肢:

| 選択肢 | 内容 | 工数 |
|---|---|---|
| **A** | 4-3d 在宅実績指標から着手 (推奨) | 小〜中 |
| **B** | 4-3a NDB 26項目から着手 (BRIDGE_V1 #3) | 中 |
| **C** | 4-3b NDB 396 薬効から着手 (沖縄 cross-check) | 中 |
| **D** | 4-3c 二次医療圏化から着手 (大規模) | 大 |
| **E** | この scoping plan で停止、外部 reviewer 判断を待つ | - |

### 7.3 各 sub-topic の Done 条件雛形

すべての sub-topic で共通:
- ETL script (新規 or 拡張) を `scripts/` に配置
- `data/static/*.json` を生成
- `tests/*.test.js` で 47県/339圏域の値を assertion
- npm test PASS (4 test 連続)
- 適切な docs (使用方法 / caveat / data quality 注記)
- terminology guard CI 通過

