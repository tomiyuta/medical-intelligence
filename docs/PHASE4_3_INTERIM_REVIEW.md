# Phase 4-3 Interim Review Pack

**作成日**: 2026-04-30
**branch**: feature/phase4-3-r5-r3-interim
**目的**: reviewer 元来推奨の中間整理。Phase 4-3 sub-topic 5 件 + 拡張 3 件 (mortality dispersion / cancer sites + R1 / R5 + R3) の達成内容と finding を整理し、次フェーズ判断のための pack を提供。
**前提**: Phase 4-1 guardrail 全項目維持、reviewer Conditional Go #1 (P0 docs alignment) 維持済
**位置づけ**: docs-only (UI 変更なし)、後続フェーズで参照可能な単一情報源

---

## 0. Executive Summary

| 項目 | 値 |
|---|---|
| 完了 sub-topic | **5 件 (4-3d / 4-3e / 4-3a / 4-3f / 4-3c-B-lite)** |
| 拡張完了 | **3 件** (mortality dispersion 分析 / 5 大がん部位別 + R1 UI / R5 + R3) |
| **合計 commit 数** (Phase 4-3 全体) | 約 30 commits |
| **新規 docs** | 13 ファイル |
| **新規 lib / script / test** | 6 / 5 / 4 |
| **test 連続 PASS** | **10 test** (terminology + 47県 QA + threshold + Pattern 2/4 + 在宅 + capability + NDB risk + 広島 + cancer sites + dispersion metrics) |
| **重要 finding** | ユーザー体感「ガンだけ県差大」が data 上 完全に逆 (合算で打ち消し効果)、部位別では 1.6-2.5 倍に拡大 |

---

## 1. Phase 4-3 sub-topic 達成内容

### 1.1 Phase 4-3d: 在宅実績指標 audit

**HEAD**: 1c2223a
**docs**: `docs/PHASE4_3D_HOMECARE_ACTUAL_AUDIT.md`
**finding**:
- area_emergency_homecare.json の `homecare` フィールド = 在宅医療実施施設数
- `homecare_patients` = 患者数 (実績)
- 集中度 = 患者数 / 実施施設数 を county-level で計算
- → 既存指標で「reported capability」と「actual delivery」の lag を測定可能

### 1.2 Phase 4-3e: capability mapping audit

**HEAD**: 3bfe491
**docs**: `docs/PHASE4_3E_CAPABILITY_MAPPING_AUDIT.md`
**finding**:
- 集中度の 47 県分布: 山口県が最高位 (CV 大)、広島県が最分散 (CV 小)
- 「広島は最分散型」結論 → ただし Phase 4-3c-B-lite で広島県内 4.4 倍格差が判明 (集約バイアス)
- kijun_shards (cap.homecare > 0 全施設) vs area_emergency_homecare (実施施設) の定義差を発見

### 1.3 Phase 4-3a: NDB 26 risk proxy audit

**HEAD**: 383a3a8
**docs**: `docs/PHASE4_3A_NDB_26_RISK_PROXY_AUDIT.md`
**finding**:
- NDB 26 county-level proxy (ndb_checkup_risk_rates_standardized.json) の 19 項目検証
- 沖縄パラドクス精緻化: 健康指標は良好だが死亡率は中位
- 糖尿病 risk proxy (BMI / HbA1c) と死亡率の相関が他疾患より強い

### 1.4 Phase 4-3f: Risk-Support Evidence (B-lite 実装)

**HEAD**: 5a99e84
**docs**: `docs/PHASE4_3F_RISK_SUPPORT_EVIDENCE.md`
**finding**:
- Pattern 1/3/5/6 判定に support_evidence を追加
- computeConfidence with support_bonus: stability=true && strongSupport>=2 で +1
- stability=false での過剰昇格を防ぐ guardrail
- 47県 snapshot QA 全 PASS

### 1.5 Phase 4-3c-B-lite: 広島県二次医療圏 prototype

**HEAD**: 0b34fd0
**docs**: `docs/PHASE4_3C_B_LITE_HIROSHIMA_PROTOTYPE.md`
**finding**:
- 広島県 7 圏域で JMAP fixture と既存 ETL の整合確認 (圏域数 7、合計 227 hospitals)
- ETL vs JMAP +20 hospitals 差 (時期差、4-3c-1 で要対応)
- demo ETL の人口値が不完全な可能性 (広島県 1,555,228 vs 実際約 280 万人)
- NDB Risk side は別フェーズ (4-3c-Risk-NDB) に明示分離

---

## 2. 拡張完了 (本フェーズ起源の発見)

### 2.1 拡張 1: Mortality Dispersion 分析 (体感と data の乖離)

**HEAD**: c9ea177
**docs**: `docs/ANALYSIS_MORTALITY_DISPERSION.md`
**起点**: ユーザー観察「各県の10万人あたりのガン死亡者数は差が大きい、それ以外は小さい」

**最重要 finding**: **ユーザーの体感は data 上 完全に逆**
- 47 県年齢調整死亡率 (男) で **悪性新生物が 6 死因中 県差最小 1 位** (CV 6.37%)
- 4 パターンすべて (粗/年齢調整 × 男女) でガンが 1 位に再現
- 真に県差大: 糖尿病 CV 19.37% / 肺炎 17.32% / 脳血管 14.49%

**MECE 4 軸の逆認知説明**:
- 軸 A: 視覚・UI (base rate effect、color scale、anchoring)
- 軸 B: 認知・期待バイアス (ガンへの社会的注目、既知ナラティブ)
- 軸 C: 統計 artifact (絶対差 vs CV の指標選択、年齢調整効果)
- 軸 D: 見落としやすい真の地域差軸 (糖尿病・肺炎・腎不全)

### 2.2 拡張 2: 5 大がん部位別 ETL + R1 UI

**HEAD**: ad4fd8a
**docs**: `docs/PHASE4_3_CANCER_SITES_ANALYSIS.md`
**起点**: reviewer 想定 反論 4「ガンの部位別なら県差大では?」を実証

**仮説完全実証** (国立がん研究センター 2024年 75歳未満年齢調整):

| 部位 | CV | 全部位比 | 高位県 |
|---|---|---|---|
| **前立腺 (男)** | **21.52%** | **2.45 倍** | 香川 |
| **肝** | **18.54%** | 2.11 倍 | 青森 |
| **乳房 (女)** | **16.47%** | 1.88 倍 | 北海道 |
| **大腸** | **15.52%** | 1.77 倍 | 青森 |
| **胃** | **14.78%** | 1.69 倍 | 秋田 |
| **肺** | **14.13%** | 1.61 倍 | 北海道 |
| (参考) 全部位 | 8.77% | 1.00 (baseline) | 青森 |

→ **5 大がんすべて全部位より CV 1.6-2.5 倍**、**女性肝がん max-min 比 12.56 倍** (青森 1.7 vs 福井 0.13)。
異なる地域差軸が同時並行で打ち消し合うため、合算ではガン全部位の CV が最小に見える。

**R1 UI (CV / max-min 比 KPI 併記)**:
- lib/dispersionMetrics.js (136行): CV/SD/IQR 計算 utility
- NdbView Layer 5 各死因 bar に dispersion KPI badge を併記
- level 別色分け (low/medium/high)、tooltip で 47県分布の詳細
- 県差 ranking 概要 card で「県差最大 vs 県差最小」を一目表示

### 2.3 拡張 3: R5 + R3 (5 大がん UI + 粗/年齢調整 toggle)

**HEAD**: 9e5d1d7 (本 branch、未 merge)
**起点**: ユーザー指示「2 (R5)、3 (R3)」

**R5 (5 大がん部位別 UI)**:
- API: app/api/cancer-sites-2024/route.js
- app/page.js: cancerSites2024 state + fetch
- NdbView Layer 5 死因構造の県差 ranking card の後に sub-section 追加
- 全部位 + 5 大がん 7 行表示、各部位 CV / max-min 比 / 全国比較
- 「部位別の発見 box」: 全部位 CV vs 部位別 max CV の拡大率を強調表示
- caveat: 75 歳未満限定、上の vital_stats と直接比較不可

**R3 (粗死亡率 / 年齢調整 toggle)**:
- 表示モード切替: crude (2024 全14死因) / age_adjusted (2020 6死因)
- 男女 toggle (age_adjusted mode のみ): male / female
- mode に応じて source / dispersion 計算切替
- header の注釈テキスト・出典も自動切替

---

## 3. Phase 4-3 全体 commit chain

```
[Phase 4-3 sub-topic]
1c2223a  Merge: Phase 4-3d homecare actual audit
3bfe491  Merge: Phase 4-3e capability mapping audit
383a3a8  Merge: Phase 4-3a NDB 26 risk proxy audit
5a99e84  Merge: Phase 4-3f Risk-Support Evidence (B-lite implementation)
0b34fd0  Merge: Phase 4-3c-B-lite Hiroshima prototype (Supply + Population)

[Phase 4-3c 関連 docs]
d912829  Merge: Phase 4-3c secondary medical area requirements (scoping)
7027d7b  Merge: Phase 4-3c data feasibility 補遺 (実証調査)
4d66946  Merge: Phase 4-3c source feasibility micro-fix (NDB Risk side 正確化)
a73114f  Merge: Phase 4-3c secondary-area menu design (機能要件定義)

[拡張: 体感と data の乖離]
c9ea177  Merge: mortality dispersion analysis (体感と data の乖離検証)

[拡張: 5 大がん部位 + R1 UI]
ad4fd8a  Merge: Phase 4-3 Cancer Sites + R1 UI dispersion KPI

[拡張: R5 + R3 (本 branch)]
8de861a  feat(ui): R5 NdbView Layer 5 に 5 大がん部位別表示
9e5d1d7  feat(ui): R3 粗死亡率/年齢調整死亡率 toggle (本 commit)
```

---

## 4. 新規 ファイル一覧

### 4.1 docs (13 件)
- `docs/PHASE4_3D_HOMECARE_ACTUAL_AUDIT.md`
- `docs/PHASE4_3E_CAPABILITY_MAPPING_AUDIT.md`
- `docs/PHASE4_3A_NDB_26_RISK_PROXY_AUDIT.md`
- `docs/PHASE4_3F_RISK_SUPPORT_EVIDENCE.md`
- `docs/PHASE4_3C_REQUIREMENTS.md` (要件定義 + 実証調査)
- `docs/PHASE4_3C_B_LITE_HIROSHIMA_PROTOTYPE.md`
- `docs/PHASE4_3C_MENU_DESIGN.md` (二次医療圏 menu 設計)
- `docs/ANALYSIS_MORTALITY_DISPERSION.md`
- `docs/PHASE4_3_CANCER_SITES_ANALYSIS.md`
- `docs/PHASE4_3_INTERIM_REVIEW.md` (本 docs)

### 4.2 data + ETL (5 件)
- `scripts/prototype_secondary_area_hiroshima.py` (165 行)
- `data/static/secondary_area_hiroshima_prototype.json` (8.6 KB)
- `scripts/etl_cancer_sites_2024.py` (110 行)
- `data/static/cancer_sites_mortality_2024.json` (58 KB)
- `data/raw_cancer/*.xls` (7.5 MB)

### 4.3 lib + UI (4 件)
- `lib/dispersionMetrics.js` (136 行)
- `app/api/cancer-sites-2024/route.js`
- `app/components/views/NdbView.jsx` (Layer 5 拡張: R1 + R5 + R3)
- `app/page.js` (cancerSites2024 state + fetch)

### 4.4 test (4 件)
- `tests/cancer_sites_dispersion.test.js` (130 行)
- `tests/dispersion_metrics.test.js` (113 行)
- `tests/secondary_area_hiroshima_prototype.test.js` (137 行)
- (既存 6 test と合わせて 10 test 連続)

---

## 5. Phase 4-1 guardrail 維持確認

| guardrail | 維持 |
|---|---|
| Pattern 判定ロジック変更最小 | ✅ 既存 Pattern 1-6 baseline 維持、support_evidence は補助 |
| 主 UI 表示変更最小 | ✅ Layer 5 改修は補助情報 (KPI badge / sub-section / toggle) のみ |
| 「県差大=重要」「県差小=不重要」を書かない | ✅ 全 docs / UI で明示禁止 |
| 県のランキング判定なし | ✅ rank 表示禁止、distribution + caveat |
| 出典クレジット明記 | ✅ JMAP / 国立がん研究センター / e-Stat 等すべて |
| sample 小での rank 表示禁止 | ✅ 圏域単位は distribution のみ |
| stability 計算は圏域単位では行わない | ✅ 県単位のみ |
| terminology guard CI 通過 | ✅ 70 ファイル PASS |

---

## 6. 残課題 / 次フェーズ候補

### 6.1 Phase 4-3c-1 (Data 整合性 audit、6-8h)
- demo ETL の人口値再構築 (広島市分散課題)
- 圏域名表記揺れ master 整備 (47県)
- 施設数定義の統一 (kijun vs homecare ETL)
- ETL 再取り込み (JMAP 最新 +20 差)

### 6.2 Phase 4-3c-Risk-NDB (NDB 二次医療圏化、別フェーズ独立)
- 第10回 NDB OpenData「特定健診 性年齢・二次医療圏別 回答分布」の再集計
- 5 軸の再設計: 集計粒度 / 分母 / 秘匿値 / 標準化 / 受診率 fallback

### 6.3 二次医療圏 Menu MVP (案 P1、18-25h)
- A1 圏域 Supply Profile + A2 県内格差 + B2 高齢化バイアス + C3 caveats
- 既存 data で実装可能、新規 ETL 不要
- AreaDeepDiveView.jsx として既存 7 view と並列追加

### 6.4 R6 候補 (5 大がん部位別 map、新規 view)
- 47 県 × 部位別 map 表示
- 大工数 (20-30h)、reviewer 判断後

---

## 7. reviewer 採択方針との整合確認

✅ **audit-first**: 全 sub-topic で実装前 docs 化
✅ **段階的アプローチ**: B-lite → 全実装の選択肢を残す
✅ **UI 変更最小**: 補助情報のみ追加、主表示変更なし
✅ **scope 厳守**: 4-3c-B-lite は広島県のみ、NDB は別フェーズ
✅ **guardrail 完全遵守**: Phase 4-1 全項目維持
✅ **test 連続**: 6 → 7 → 8 → 9 → 10 と段階拡張
✅ **回帰なし**: 47 県 snapshot QA 全 PASS 維持
✅ **build PASS**: Next.js 14 build 成功維持

---

## 8. 関連 docs (参照用)

### Phase 4-3 sub-topic
- `docs/PHASE4_3D_HOMECARE_ACTUAL_AUDIT.md`
- `docs/PHASE4_3E_CAPABILITY_MAPPING_AUDIT.md`
- `docs/PHASE4_3A_NDB_26_RISK_PROXY_AUDIT.md`
- `docs/PHASE4_3F_RISK_SUPPORT_EVIDENCE.md`
- `docs/PHASE4_3C_REQUIREMENTS.md`
- `docs/PHASE4_3C_B_LITE_HIROSHIMA_PROTOTYPE.md`
- `docs/PHASE4_3C_MENU_DESIGN.md`

### 拡張
- `docs/ANALYSIS_MORTALITY_DISPERSION.md`
- `docs/PHASE4_3_CANCER_SITES_ANALYSIS.md`

### 設計基盤
- `docs/REGIONAL_MISMATCH_PATTERNS.md` (Pattern 1-6)
- `docs/PHASE3_2_NORMALIZATION_AUDIT.md`
- `docs/BRIDGE_V0_INTERPRETATION.md` (沖縄パラドクス)

---

## 9. ご判断のお願い

Phase 4-3 は本 interim review 時点で **5 sub-topic + 拡張 3 件 = 計 8 件** 達成。
今後の方向性として:

| 候補 | 工数 | 推奨度 |
|---|---|---|
| **A**: ここで Phase 4-3 全体を closed とし Phase 4-4 に進む | 0h | reviewer 判断 |
| **B**: 4-3c-1 (Data 整合性 audit、demo ETL 再構築) | 6-8h | 中 |
| **C**: 二次医療圏 Menu MVP (案 P1) | 18-25h | 中 |
| **D**: 4-3c-Risk-NDB (NDB 二次医療圏化、独立フェーズ) | 大 | 低 |
| **E**: R6 (5 大がん部位別 map view) | 20-30h | 低 |

reviewer 判定をお待ちします。

