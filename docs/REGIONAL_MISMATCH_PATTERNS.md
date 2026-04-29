# 地域医療の不一致パターン (Regional Mismatch Patterns)

**作成日**: 2026-04-29  
**ステータス**: ✅ Phase 4-0 (統合 docs、UI未反映)  
**Phase**: Phase 4-0 (E-1〜E-3 統合)  
**関連 commit**: `c457f77` (Phase 2E-3 完了)

---

## 0. 目的

> MedIntel は「**地域医療の不一致・構造パターンを発見する仮説生成装置**」である。  
>
> 単一指標で地域を評価せず、**複数軸 (リスク・受療・処方・供給・結果)** を独立に読み、**それらの不一致または特徴的な構造プロファイル** を可視化することで、追加調査の動機付けを与える。  
>
> 本文書は、Phase 2E-1 (沖縄)、Phase 2E-2 (東北)、Phase 2E-3 (中四国・九州) の発見を **6つの地域医療プロファイル (multi-label archetype)** として統合する。

### 0.1 重要な前提 ⚠️ (peer review v1 採択 micro-fix)

> これら6つは **排他的分類ではなく**、都道府県が複数プロファイルに同時該当しうる **multi-label archetype** である。  
> **MECE な分類体系ではなく、仮説生成のための観察ラベル** である。  
>
> 例: 秋田県は Pattern 2 (Supply-Outcome 並列悪化) と Pattern 5 (高齢化-在宅移行ギャップ) の両方に該当する。

---

## 1. MedIntel の設計思想 (再掲)

6軸は因果順ではなく、地域構造を横断的に観察するための **独立した観察軸** である:

```
6 axes observed independently (順序は読む方向、因果ではない):

- Risk proxy           — 行動・生体・既往 (NDB特定健診)
- Demand proxy         — 患者調査受療率
- Use proxy            — NDB処方・診療行為
- Supply proxy         — 病床・cap・施設基準
- Outcome proxy        — 死亡率 (粗 + 年齢調整)
- Aging / demographic  — 住基・将来推計
```

**重要原則**: これらの軸は **独立に評価する**。本モデルは、Risk が Demand を生み、Demand が Use を生み、Supply が Outcome を改善する、という因果連鎖を **仮定しない**。

- 「リスク高 → 受療高 → 医療利用高 → 結果改善」 という線形連鎖は **必ずしも成立しない** (反証: 沖縄)
- 「供給厚 → 結果良好」も **成立しない** (反証: 山口・徳島・鹿児島)
- **「不一致こそが情報」** であり、追加調査の動機付けとなる

---

## 2. Archetype の二層構造 (multi-label archetype)

reviewer指摘 (P0-4) に基づき、6 archetype を **2 層** に分けて扱う:

### 2.A. Mismatch Signal Tags (不一致シグナル)
複数軸の間に観察される **乖離** を示すラベル。仮説生成の主対象。

- **Pattern 1**: Risk-Care Gap (沖縄)
- **Pattern 2**: Supply-Outcome Gap (供給薄×結果悪、東北)
- **Pattern 3**: Supply-Outcome Mismatch (供給+×結果悪、山口・徳島・鹿児島)
- **Pattern 5**: Aging-Outcome Burden (高齢化-在宅移行、秋田・青森)

### 2.B. Context Archetypes (背景構造プロファイル)
地域構造の **背景や参照パターン** を示すラベル。これらは単独では「不一致シグナル」ではない。

- **Pattern 4**: Supply-Outcome Alignment Context (岡山・熊本・島根)
- **Pattern 6**: Urban Low-risk / High-capability Context (東京・大阪)

### 2.C. 6 archetype の詳細

### Pattern 1: Risk-Care 乖離 (Risk high / Care low)

**特徴**: リスクが高いが、受療率・処方 proxy が低い

| 指標 | 状態 |
|---|---|
| リスク (BMI/HbA1c/SBP/LDL/尿蛋白) | 高 |
| 受療率 (患者調査) | 低 |
| 処方 proxy | 低〜中 |
| 結果 (死亡率) | 多様 |

**代表例**: **沖縄県 — 糖尿病** (Phase 2E-1)
- BMI≥25: 47県中1位 (+35.2%)
- HbA1c≥6.5: 47県中6位 (+14.5%)
- 内分泌外来受療率: **47県中47位** (-47.1%)
- 糖尿病薬服用率: 12位 (中位)
- 糖尿病粗死亡率: 47県中40位 (低位、-11.3%)
- 糖尿病年齢調整死亡率: **47県中2位** (高位、男+49.6%)

**示唆**: 「リスクは高いが医療接触が少ない」「治療捕捉率の地域差」「健診受診者選択バイアス」「コーディング習慣」等の複合要因の可能性。  
**詳細**: `docs/OKINAWA_DIABETES_PARADOX.md`

---

### Pattern 2: Supply-Outcome 並列悪化 (Supply low / Outcome poor)

**特徴**: 供給 proxy が薄く、結果指標 (年齢調整死亡率) も全国平均より悪い

| 指標 | 状態 |
|---|---|
| 高齢化率 | 高 |
| NDB在宅 / 75+10万対 | 低 |
| 回復期 / 慢性期 病床 / 75+10万対 | 低 |
| cap.homecare / cap.rehab | 低 |
| 結果 (脳血管・腎不全 年齢調整死亡率) | 全国平均より高い |

**代表例**: **秋田県・青森県・岩手県・山形県** (Phase 2E-2)
- 5指標すべて -28%以上 (秋田)
- cap.homecare/rehab とも -40〜-50% (秋田/山形)
- 脳血管疾患 年齢調整死亡率: 全県+20-54% (全国比)
- 腎不全 年齢調整死亡率: 7県中4県で全国比+20%以上

**示唆**: 高齢化に対して在宅・回復期・リハ関連の供給が薄く、**年齢構成では説明できない結果指標の悪化** が並列している。  
**詳細**: `docs/PHASE_2E_2_TOHOKU_HOMECARE.md`

---

### Pattern 3: Supply-Outcome 不一致 (再定義版 P2-3e)

**reviewer Devil's Advocate 採択 (Phase 4-3e、commit a9f2a16) により再定義**:

```
旧: Supply high × Outcome poor
修正: Reported capability high × actual usage mid × Outcome poor
```

**特徴**: **届出・体制 proxy は厚い** が、**実績量は中位** で、**結果指標は悪い**

| 指標 | 状態 | 備考 |
|---|---|---|
| 高齢化率 | 高 | |
| NDB在宅 / 75+10万対 | 中〜高 | |
| 回復期 / 慢性期 病床 / 75+10万対 | **高** | 届出ベース |
| cap.homecare / cap.rehab | **高** | 届出 proxy ⚠ proxy caveat |
| **homecare_patients (実績) per 75+10万対** | **中位 (rank 19-21)** | **★ Phase 4-3d で確認、4-3e で構造解明** |
| 結果 (肺炎・腎不全 等) | 全国平均より高い | |

**代表例**: **山口県・徳島県・鹿児島県** (Phase 2E-3、4-3d/4-3e で再検証)
- 山口: cap.homecare +104% (rank 3) / **actual rank 21** / 肺炎 年齢調整 +31% / 心疾患 +14% / 腎不全 +17%
- 広島 (4-3d で新規確認): cap rank 1 / **actual rank 19** / cap_high_actual_mid
- 徳島: 回復期+51% / 肺炎+32% / 腎不全+19%
- 鹿児島: 回復期+64% / 肺炎+26%

**示唆**:

1. **「供給+ ≠ 結果+」**: 届出・体制は厚いが、結果が悪い (因果は不明)
2. **「届出 ≠ 実績」**: capability proxy (施設数ベース) は実際の在宅医療実績を必ずしも反映しない (Phase 4-3d/4-3e で実証)
3. **構造的要因**: 山口・広島は集中度 (1施設あたり患者数) が 47県中 46/47位 = 最分散型。多数の小規模施設が cap proxy を膨らませている可能性 (Phase 4-3e §3)
4. **その他要因**: 文化・行動・誤嚥性肺炎集計差・人口高齢化の交絡・施設基準届出 vs 実施実態のギャップ等

**「供給+ ≠ 結果+」かつ「届出 ≠ 実績」を実証する重要パターン**。

**proxy caveat**: P3 は P2-4 confidence grade 計算で `proxy_caveat = -1` を付与済み。Phase 4-3d/4-3e で妥当性が実データで補強された。

**詳細**: 
- `docs/PHASE_2E_3_WESTERN_JAPAN_HOMECARE.md` (Phase 2E-3 元データ)
- `docs/PHASE4_3D_HOMECARE_ACTUAL_AUDIT.md` (実績比較)
- `docs/PHASE4_3E_CAPABILITY_MAPPING_AUDIT.md` (構造分析)

---

### Pattern 4: Supply-Outcome 整合 (Supply high / Outcome stable) — Context Archetype

⚠️ **注**: これは Mismatch Signal ではなく **Context Archetype (背景構造)** である。  
Pattern 3 (不一致) との対比のために archetype 内に含めるが、単独では「不一致」を示さない。

**特徴**: 供給 proxy が厚く、結果指標も安定または良好

| 指標 | 状態 |
|---|---|
| 高齢化率 | 中〜高 |
| 供給 proxy (5指標) | 高 (high≥3) |
| 結果 (5死因 年齢調整) | 全国平均近く〜良好 |

**代表例**: **岡山県・熊本県** (Phase 2E-3)
- 岡山: cap.homecare+72%、全死因が全国平均近くで安定
- 熊本: 慢性期+65%、回復期+67% × 脳血管-9%、悪性新生物-9%

**特例**: **島根県** — 肺炎 年齢調整死亡率 -35% (47県内最良級)、cap.homecare+69%

**示唆**: 「供給+結果整合」は珍しいパターンで、地域医療体制の好事例として参照可能。ただし因果関係は推論しない。  
**詳細**: `docs/PHASE_2E_3_WESTERN_JAPAN_HOMECARE.md`

---

### Pattern 5: 高齢化-在宅移行ギャップ (Aging high / Transition gap)

**特徴**: 高齢化が進んでいるが、在宅移行体制が追いついていない

| 指標 | 状態 |
|---|---|
| 75歳以上人口割合 | 高 (全国+1pt以上) |
| NDB在宅 / 75+10万対 | 低 (-15%以下) |
| cap.homecare | 低 (-15%以下) |
| 慢性期病床依存 | 高い場合あり (北海道型) |

**代表例**: **秋田県 (22.0%)・青森県 (19.4%)・岩手県 (19.6%)** (Phase 2E-2)

**特殊例**: **北海道** — 慢性期病床+61%突出 (大病院依存) だが NDB在宅 ±0%、cap.homecare -24%

**示唆**: 高齢化進行に対する在宅医療の追従が遅れている地域群。  
**Pattern 2 と重複** するが、「アウトカム」を含めるかどうかで区別可能。  
**詳細**: `docs/PHASE_2E_2_TOHOKU_HOMECARE.md`

---

### Pattern 6: 都市低リスク・高機能集積 (Urban low-risk / high-function) — Context Archetype

⚠️ **注**: これは Mismatch Signal ではなく **Context Archetype (背景構造)** である。  
若年構造 + リスク低 + 専門医療集積という複合的な構造特徴を示すが、単独では「不一致」を示さない。

**特徴**: 大都市圏で若年人口比率が高く、リスクが低く、高機能病院が集積する

| 指標 | 状態 |
|---|---|
| 75歳以上人口割合 | 中〜低 |
| BMI / HbA1c / SBP リスク | 全国平均近く〜低 |
| 高機能病院 (Tier S/A) 数 | 多い |
| 結果 (心疾患 年齢調整) | 全国平均より高い (大阪) or 中位 (東京) |

**代表例**: **東京都・大阪府** (Phase 1〜2)
- 東京: BMI≥25 27.9% (中位)、HbA1c≥6.5 6.0% (47県最低)、Tier S 集積、腎不全死亡率 全国最低
- 大阪: BMI≥25 28.8% (中位)、心疾患 年齢調整死亡率 +7% (全国比)

**示唆**: 大都市圏の若年・専門医療集積の構造。低リスクは **若年構造のみで説明できるとは限らず**、健診受診者選択バイアス、生活習慣、医療アクセス、社会経済要因が複合している可能性。  
**「リスク低 + 結果良好」は文脈依存**であり、医療提供の質との因果は分離不可能。  
**詳細**: 直接の単独 docs はなし、Phase 1〜2 全体の参照値。

---

## 3. プロファイル対応表 (代表県、multi-label)

**A. Mismatch Signal Tags** (不一致シグナル):

| パターン | 代表例 | 関連 docs |
|---|---|---|
| 1. Risk-Care 乖離 | **沖縄** | OKINAWA_DIABETES_PARADOX.md |
| 2. Supply-Outcome 並列悪化 | **秋田、青森、岩手、山形** | PHASE_2E_2_TOHOKU_HOMECARE.md |
| 3. Supply-Outcome 不一致 | **山口、徳島、鹿児島** | PHASE_2E_3_WESTERN_JAPAN_HOMECARE.md |
| 5. 高齢化-在宅移行ギャップ | **秋田、青森、岩手、北海道(特殊)** | PHASE_2E_2_TOHOKU_HOMECARE.md |

**B. Context Archetypes** (背景構造プロファイル):

| パターン | 代表例 | 関連 docs |
|---|---|---|
| 4. Supply-Outcome 整合 (Context) | **岡山、熊本、島根** | PHASE_2E_3_WESTERN_JAPAN_HOMECARE.md |
| 6. 都市低リスク・高機能集積 (Context) | **東京、大阪** | (Phase 1〜2 全体) |

**注**: 1県は **複数プロファイルに同時該当** することがある (例: 秋田は Pattern 2 と Pattern 5 の両方)。これは仕様であって不具合ではない。multi-label の検証として扱う。

---

## 4. 因果断定しないルール (peer review遵守、再掲)

### ❌ やってはいけない

- 「供給が薄い → 死亡率が高い → 在宅医療を増やせば死亡率は下がる」と因果推論
- 「支援型 = 医療の質が高い」「ギャップ型 = 医療の質が低い」と評価
- 「リスク低 = 医療提供の質が良い」と解釈
- 単一指標で県を評価する
- 政策判断・個別医療機関評価に使用する

### ✅ 表現のルール

- 「供給 proxy が厚い」(医療の質ではなく届出件数集計値)
- 「結果指標が全国平均と並列に悪化している」(因果は不明)
- 「不一致パターンを示す」(発見であって診断ではない)
- 「追加調査の動機付け」(行動推奨ではない)
- 「年齢調整死亡率は2020年、他は2022-2024年」(時点ズレ明示)

---

## 5. MedIntel の発見能力 (まとめ)

> MedIntel は **6つの地域医療プロファイル (multi-label archetype)** を 47都道府県スケールで可視化できる:  
>
> 1. **Risk-Care 乖離** (沖縄): リスクは高いが医療接触が少ない地域  
> 2. **Supply-Outcome 並列悪化** (東北・北日本): 供給薄 + 結果悪 の連動  
> 3. **Supply-Outcome 不一致** (山口・徳島・鹿児島): 供給+ でも結果改善せず  
> 4. **Supply-Outcome 整合** (岡山・熊本・島根): 供給+結果良の好事例  
> 5. **高齢化-在宅移行ギャップ** (秋田・青森): 高齢化進行に体制追従せず  
> 6. **都市低リスク・高機能集積** (東京・大阪): 大都市圏の構造  
>
> これらは **現行の MedIntel データ (NDB / 患者調査 / 病床機能 / cap / 死亡率 / 年齢調整死亡率) のみで識別可能** であり、追加データなしで仮説生成が完結する。  
> **ただし「分類」ではなく「観察ラベル」** であり、複数該当・該当なしの両方が起こりうる。

---

## 6. 限界 (本docsで識別できないこと)

- **二次医療圏レベルの偏在** (大都市内の差/過疎地)
- **個別施設の質**
- **患者個人の予後・QOL**
- **医療経済 (費用対効果)**
- **政策効果 (因果推論)**
- **時系列変化** (現状は単年データ)

これらを将来扱うには別フェーズが必要。

---

## 7. Phase 4 UI候補 (将来)

### 7.1 「Regional Mismatch Explorer」(NdbView 下部の小型セクション)

```
地域不一致パターン
  沖縄県:   Pattern 1 (Risk-Care 乖離) — 糖尿病
  秋田県:   Pattern 2,5 (Supply-Outcome 並列 + 在宅gap)
  山口県:   Pattern 3 (Supply高 / Outcome悪化)
  熊本県:   Pattern 4 (Supply-Outcome 整合)
  東京都:   Pattern 6 (都市低risk / 高機能集積)
```

### 7.2 47県分布のパターン色分け

47県マップを6色 (または6パターン) に分類して表示。  
ただし **「これは仮説生成であって診断ではない」** の注釈を必須にする。

### 7.3 個別県の Bridge 画面でパターン表示

NdbView (医療プロファイルタブ) で県を選んだ際、上部に「該当する不一致パターン」を表示。

**注**: UI 実装は **本 docs が peer review で固まってから別 commit で**。年齢調整死亡率の Bridge 反映 (Phase 3-1 案A) と並行して設計判断する。

---

## 8. Phase 2E-1〜2E-3 / Phase 3-1b の発見の意義

| Phase | 発見 | 統合パターン |
|---|---|---|
| 2E-1 | 沖縄: 4重不一致、糖尿病粗死亡率は低位だが年齢調整は高位 | Pattern 1 |
| 2E-2 | 東北: 6/7県ギャップ型、脳血管調整死亡率が全県+20-54% | Pattern 2, 5 |
| 2E-3 | 西日本: 10/10県支援型、しかし山口・徳島・鹿児島で結果悪化 | Pattern 3, 4 |
| 3-1b | 沖縄糖尿病の粗死亡率→年齢調整で逆転 | Pattern 1 補強 |

---
## 9. 関連ドキュメント

- `docs/OKINAWA_DIABETES_PARADOX.md` — Pattern 1 詳細
- `docs/PHASE_2E_2_TOHOKU_HOMECARE.md` — Pattern 2, 5 詳細
- `docs/PHASE_2E_3_WESTERN_JAPAN_HOMECARE.md` — Pattern 3, 4 詳細
- `docs/AGE_ADJUSTED_MORTALITY_AUDIT.md` — Phase 3-1 audit
- `docs/BRIDGE_V1_INTERPRETATION.md` — Bridge Risk Model v1 解釈仕様
- `docs/capability_mapping.md` — supply proxy の定義 (keyword taxonomy v1)
- `docs/PHASE2_RELEASE_NOTES.md` — Phase 2 全体サマリ
- `data/static/age_adjusted_mortality_2020.json` — Phase 3-1 Option B

---

## 10. confidence grade の caveat (Phase 4-1 P2-4)

P2-4 で各観察ラベルに confidence grade A/B/C を付与した。これは **観察信号の強さ** を示す補助バッジであり、以下のものではない (reviewer 採択):

confidence grade は…… ではない観察信号の強さ (evidence completeness + 分布上の極端度 + シナリオ間 stability)真実性政策判断の正しさ医療の質地域の優劣統計的有意差

### grade 計算ロジック (lib/regionalMismatchLogic.js#computeConfidence)

```
score = 0
+1 if evidence_count >= 3        (根拠が多角的)
+1 if strong_stats >= 2          (|z|>=1.5 or rank<=5/n-rank<=4)
+1 if very_strong_stats >= 2     (|z|>=2.0 or rank<=3/n-rank<=2)
+1 if stability == true           (3シナリオで安定)
-1 if stability == false          (境界例)
-1 if id in ['P3', 'P6']          (proxy caveat)

grade = score >= 3 ? 'A' : score >= 1 ? 'B' : 'C'
```

### 実 baseline 結果 (47県)

- **A 4件**: 沖縄 P1 / 山口 P3 / 秋田 P5 / 東京 P6 (全シナリオで安定 + 多角的根拠)
- **B 5件**: 青森・岩手・山形 P5、神奈川・滋賀 P6
- **C 2件**: 新潟 P5、大阪 P6 (boundary、strict で消失)

### 注意事項

- z-score は47都道府県分布内での相対的位置を示す補助指標であり、統計的有意差を示すものではない (n=47 のため厳密な統計検定には不十分)
- proxy caveat 減点 (P3/P6) は、供給 proxy・構造プロファイルが直接の outcome 評価ではなく、複合要因を含むため
- grade C は「ラベルが間違っている」ではなく「閾値・proxy・時点差を踏まえて参考程度に扱う」