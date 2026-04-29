# Phase 4-3c: 二次医療圏 Menu 機能設計書 (要件定義)

**作成日**: 2026-04-30
**branch**: feature/phase4-3c-menu-design
**目的**: 二次医療圏単位の詳細解析 menu の機能要件を定義 (実装ではなく scoping)
**前提**: Phase 4-3c-B-lite 完了 (HEAD = 0b34fd0)、広島県 7 圏域 prototype 動作確認済
**reviewer 採択方針 (継承)**: docs-only、UI 実装は別フェーズ判断、Phase 4-1 guardrail 完全遵守
**結論サマリ**: 「二次医療圏 menu」は **新規 view (例: AreaDeepDiveView.jsx)** として既存 NdbView と独立に設計する。中核は **3 axes × 9 機能** の MECE 構造。

---

## 0. Executive Summary

| 軸 | 結論 |
|---|---|
| menu 位置づけ | 既存 7 view (Ndb/Area/Map/Muni/Facility/RegionalBedFunction/DomainSupplyDemandBridge) と並列の **8 番目 view** |
| 推奨名称 | **Secondary Area Deep Dive** (二次医療圏 詳細解析) |
| 中核機能数 | **9 機能** (3 axes × 3 layer = MECE) |
| 工数見積 | 完全実装 50-70h、MVP 18-25h |
| 前提依存 | Phase 4-3c-1 (data 整合性 audit) + Phase 4-3c-2 (47 県 ETL 拡張) |
| guardrail | 既存と同じ (NDB Risk side は scope 別、優劣評価禁止、出典明記) |

---

## 1. 設計原則 (3 軸 × 3 層の MECE 構造)

二次医療圏 menu は以下の **3 軸 × 3 層** で構成。1 個の機能が 1 軸 × 1 層に対応 = 9 機能。

```
                    Axis A             Axis B             Axis C
                  Supply面            Demand/Risk面       Outcome/Bridge面
                    │                    │                    │
   ┌─────────────────┼────────────────────┼────────────────────┤
   │ Layer 1        │ A1                 │ B1                 │ C1
   │ 圏域 Profile    │ 施設・病床 Profile  │ 人口・高齢化 Profile│ 死亡率 Profile
   │                │                    │                    │
   ├────────────────┼────────────────────┼────────────────────┤
   │ Layer 2        │ A2                 │ B2                 │ C2
   │ 県内格差        │ 集中度 (Phase 4-3e) │ 高齢化バイアス      │ 死亡率分布
   │ Distribution   │                    │                    │
   │                │                    │                    │
   ├────────────────┼────────────────────┼────────────────────┤
   │ Layer 3        │ A3                 │ B3                 │ C3
   │ Mismatch &     │ 圏域 Pattern       │ 圏域 Risk-Care Gap │ 圏域 caveats
   │ Pattern        │ (P3/P5 圏域版)     │ (P1 県値 fallback) │ (NDB Risk skip)
   └────────────────┴────────────────────┴────────────────────┘
```

---

## 2. 9 機能の詳細仕様

### 2.1 Axis A (Supply 面)

#### **A1. 圏域 Supply Profile**

| 項目 | 内容 |
|---|---|
| 目的 | 1 圏域の supply 全体像を一覧 |
| input | JMAP fixture / area_emergency_homecare / medical_areas_national |
| 表示 | KPI cards × 6 (病院数 / 病床合計 / 一般 / 療養 / 医師数 / 介護施設数) |
| caveat | 47 県平均との差を rank/percentile で表示、ranking 表示は禁止 |
| 既存比較 | NdbView Layer 6 (BRIDGE v0) の supply 部分の圏域版 |
| 工数 | 4-6h |

#### **A2. 県内格差 (集中度) View**

| 項目 | 内容 |
|---|---|
| 目的 | Phase 4-3e で発見した「集中度 (1 施設あたり患者数)」を圏域単位で可視化 |
| input | area_emergency_homecare.json (圏域単位 patients / facilities) |
| 表示 | **box plot**: 県内 7-13 圏域の集中度を min/Q1/median/Q3/max で表示 + 全国平均線 |
| 重要 | rank 表示なし (sample 小で rank 不安定)、distribution のみ |
| 例 | 広島県 7 圏域の集中度 = min 134.4 (広島西) ～ max 588.7 (福山・府中) |
| 工数 | 6-8h |

#### **A3. 圏域 Pattern (P3/P5 圏域版)**

| 項目 | 内容 |
|---|---|
| 目的 | 県平均で P3 と判定される県でも、圏域単位で見れば異質な構造があるかを検出 |
| 例 | 山口県 P3 (Supply-Outcome Mismatch) → 8 圏域に分解、capability_high_actual_mid 圏域を特定 |
| input | 圏域単位 capability proxy + actual + outcome (圏域単位死亡率は要 e-Stat 集計) |
| 表示 | 圏域別 P-flag (P3/P5/P6/none)、stability 表示は廃止 (sample 小) |
| 注意 | NDB Risk side は県値 fallback、これにより P1 圏域版は **限定的** (Risk-Care Gap の Risk 軸が県全体) |
| 既存比較 | RegionalMismatchExplorer の圏域版、ただし主 evidence 数は同じ |
| 工数 | 8-10h |

### 2.2 Axis B (Demand / Risk 面)

#### **B1. 圏域 人口・高齢化 Profile**

| 項目 | 内容 |
|---|---|
| 目的 | 1 圏域の人口構造、将来推計 (社人研 2023 推計) |
| input | area_demographics.json + 社人研 2023 推計 (4-3c-2 で取り込み済前提) |
| 表示 | 人口ピラミッド (5 歳階級) + 将来推計線グラフ (2025/2030/.../2050) + 高齢化率推移 |
| 重要 | 「広島市が 7 munis に分散」のような既存 ETL の課題を 4-3c-1 で解決済前提 |
| 工数 | 6-8h |

#### **B2. 高齢化バイアス Distribution**

| 項目 | 内容 |
|---|---|
| 目的 | Phase 4-3c で発見した「東京都内 18.2pt 高齢化差」のような県内バイアスを可視化 |
| input | area_demographics.json |
| 表示 | 県内全圏域の高齢化率 box plot + 圏域名ラベル + 全国平均線 |
| 例 | 東京都 13 圏域: 区部 (若年, 17.7%) ～ 島嶼 (高齢, 35.9%) |
| 工数 | 4-6h |

#### **B3. 圏域 Risk-Care Gap (P1 県値 fallback)**

| 項目 | 内容 |
|---|---|
| 目的 | 圏域単位の P1 (Risk-Care Gap) 判定。ただし Risk side は県値 fallback |
| input | 県単位 NDB risk rates + 圏域単位 care evidence (受療率は県値) |
| 表示 | 圏域別 P1 候補度、ただし「Risk = 県値」を明示 caveat |
| 制約 | Phase 4-3c-Risk-NDB 完了までは **限定的機能**。完了後にフル機能化 |
| 工数 | 6-8h (limited) / +20h (NDB 二次医療圏化後) |

### 2.3 Axis C (Outcome / Bridge 面)

#### **C1. 圏域 死亡率 Profile**

| 項目 | 内容 |
|---|---|
| 目的 | 1 圏域の年齢調整死亡率 (主要疾患別) |
| input | e-Stat 市区町村別 → 圏域集計 (4-3c-2 で実装) |
| 表示 | 全国平均との差を z-score で表示、ranking なし |
| 制約 | 既存 mortality_outcome_2020.json は県単位、圏域版 ETL が前提 |
| 工数 | 8-10h (e-Stat ETL 含む) |

#### **C2. 圏域 死亡率 Distribution**

| 項目 | 内容 |
|---|---|
| 目的 | 県内圏域間の死亡率分布、bias 検出 |
| input | C1 と同じ |
| 表示 | 主要 5 疾患の box plot |
| 工数 | 4-6h |

#### **C3. 圏域 Caveats Panel**

| 項目 | 内容 |
|---|---|
| 目的 | 圏域 view の制約・注意事項を一括表示 |
| 内容 | (a) NDB Risk side は県値 fallback / (b) sample 小で rank 不安定 / (c) ETL 時期差 / (d) 圏域 master 出典 / (e) 出典クレジット |
| 工数 | 2-3h |

---

## 3. UI/UX 設計

### 3.1 Navigation 階層

```
既存 menu 構造 (7 views)
   ├─ NdbView  ← 47 県単位
   ├─ AreaView
   ├─ MapView
   ├─ MuniView
   ├─ FacilityExplorerView
   ├─ RegionalBedFunctionView
   ├─ DomainSupplyDemandBridge
   └─ ★ 新規: AreaDeepDiveView (二次医療圏単位)
```

### 3.2 圏域選択 UI

```
┌─ Step 1: 都道府県 ─┐  ┌─ Step 2: 二次医療圏 ─────┐
│ [広島県 ▼]         │  │ [広島(広島市など) ▼]      │
└────────────────────┘  └───────────────────────────┘
   47 県 dropdown          選択県の 5-13 圏域 dropdown
```

選択後、9 機能 (A1-A3, B1-B3, C1-C3) が **collapsible section** で順次表示。デフォルトは A1/B1/C1 のみ展開。

### 3.3 レイアウト原則

- 既存 RegionalMismatchExplorer と同じ design tokens を継承
- Phase 4-1 で確定した evidence card pattern を再利用
- 47 県との比較は **percentile + z-score**、rank は補助情報のみ
- 圏域間 ranking 表示は **禁止** (sample 5-13 で順位は信頼性低)

---

## 4. data dependencies

| 機能 | 依存 data | Phase 4-3 sub-topic |
|---|---|---|
| A1 | area_emergency_homecare / medical_areas_national | 既存 (4-3c-1 で再構築推奨) |
| A2 | 集中度 metric の正式 ETL | **4-3c-2 待ち** |
| A3 | 圏域単位 capability + actual + outcome | 4-3c-2 + 4-3c-Risk-NDB |
| B1 | area_demographics + 社人研 2023 推計 | **4-3c-2 待ち** |
| B2 | area_demographics | 既存 (要再構築) |
| B3 | 県値 NDB + 圏域 care evidence | 4-3c-2 (限定版) |
| C1 | 圏域別年齢調整死亡率 (e-Stat) | **新規 ETL 必要** |
| C2 | C1 と同じ | 同上 |
| C3 | docs metadata | 即実装可 |

→ **MVP 候補**: 既存 data で実装可能な A1/A2/B2 + C3 (caveats only)

---

## 5. 段階的実装案

### 5.1 MVP (案 P1): 18-25h

A1 + A2 + B2 + C3 のみ:
- A1 圏域 Supply Profile
- A2 県内格差 (集中度) View
- B2 高齢化バイアス Distribution
- C3 圏域 Caveats Panel

新規 ETL 不要、4-3c-1 (data 整合性) 完了後に着手可能。

### 5.2 中位 (案 P2): 35-45h

P1 + B1 + B3 (limited):
- B1 圏域 人口・高齢化 Profile (社人研 2023 推計、4-3c-2 で取り込み)
- B3 圏域 Risk-Care Gap (NDB は県値 fallback)

### 5.3 完全実装 (案 P3): 50-70h

P2 + A3 + C1 + C2:
- A3 圏域 Pattern (P3/P5 圏域版)
- C1 圏域 死亡率 Profile (e-Stat ETL 必要)
- C2 圏域 死亡率 Distribution

### 5.4 究極形 (案 P4): 70-100h

P3 + B3 強化:
- B3 を NDB 二次医療圏化 (Phase 4-3c-Risk-NDB 完了後にフル機能化)

---

## 6. Phase 4-1 guardrail との整合確認

✅ Pattern 判定ロジック変更なし (圏域版は別 logic として追加、既存 47県 baseline は維持)
✅ NDB Risk side は scope 別 (B3 で県値 fallback、Phase 4-3c-Risk-NDB で別途検討)
✅ 「圏域 = ランキング」を表示しない (distribution のみ、rank は補助)
✅ 「圏域別の優劣判定」を書かない (差分は構造的特性として記述)
✅ JMAP / 社人研 / e-Stat / NDB の出典クレジット明記
✅ sample 小 (5-13 圏域) の統計安定性を caveat 明記
✅ stability 計算は圏域単位では行わない (sample 小)

---

## 7. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| Sample 小 (5-13 圏域) で統計不安定 | rank/zscore の信頼性低下 | distribution 表示のみ、rank は補助 |
| NDB Risk side が県値 fallback で機能限定 | B3 の説明力低下 | C3 で caveat 明示、Phase 4-3c-Risk-NDB 後にフル化 |
| 既存 ETL に課題 (広島市 7 munis 分散等) | A1/B1 の精度低下 | 4-3c-1 で再構築、本 menu の前提 |
| UI 複雑化で既存 NdbView と混乱 | UX 悪化 | 別 view (AreaDeepDiveView) として独立、相互リンクは明示 |
| 圏域間比較のミスリード | 「圏域別ランキング」誤読 | rank 表示禁止、distribution + caveat |
| 出典管理の煩雑化 | JMAP/社人研/e-Stat 複数 source | 各機能下部に出典 footer 標準化 |

---

## 8. 推奨進行 Path

reviewer 推奨:
1. **Phase 4-3 interim review pack** (4-3d/e/a/f/c の中間整理)
2. **Phase 4-3c-1** (Data 整合性 audit、demo ETL 再構築)
3. **本 menu の MVP (案 P1)** 着手 (4-3c-1 完了後、18-25h)
4. **Phase 4-3c-2** (47 県拡張、ETL 拡張)
5. 案 P2 / P3 への段階的拡張

---

## 9. 関連 docs

- `docs/PHASE4_3C_REQUIREMENTS.md` (Phase 4-3c 全体要件定義書)
- `docs/PHASE4_3C_B_LITE_HIROSHIMA_PROTOTYPE.md` (広島 prototype 実装報告)
- `docs/PHASE4_3D_HOMECARE_ACTUAL_AUDIT.md` (在宅実績 audit)
- `docs/PHASE4_3E_CAPABILITY_MAPPING_AUDIT.md` (集中度発見、A2 機能の根拠)
- `docs/PHASE4_3A_NDB_26_RISK_PROXY_AUDIT.md` (NDB risk proxy audit、B3 の前提)
- `docs/REGIONAL_MISMATCH_PATTERNS.md` (Pattern 1-6 定義)

