# Phase 4-3e: Capability mapping audit report

**フェーズ**: Phase 4-3e (Phase 4-3d の後続、capability mapping 再監査)
**branch**: feature/phase4-3e-capability-mapping-audit
**reviewer 採択 P3 再定義**:
> 旧: Supply high × Outcome poor
> **修正: Reported capability high × actual usage mid × Outcome poor**

**結論サマリ**: capability proxy (施設数ベース) の構造的特性を確定。**修正せず caveat 強化** で運用。

---

## 1. 背景

Phase 4-3d (homecare actual audit) で 9 県が `capability_high_actual_mid` (P3 proxy caveat 強)、宮崎県が `capability_low_actual_high` で gap -36 (異常値) と判明。

reviewer 採択 Devil's Advocate により、P3 を以下のように再定義:

```
旧:    Supply high × Outcome poor
修正:  Reported capability high × actual usage mid × Outcome poor
```

本 audit では、`docs/capability_mapping.md` の homecare 定義と
`scripts/audit_homecare_rehab_capability.py` の集計ロジックを再点検し、
重点5県 (宮崎・広島・山口・岡山・秋田) の構造的差異を解明する。

---

## 2. 既存 ETL 仕様の再確認

### 2.1 計算式

`scripts/audit_homecare_rehab_capability.py` の core ロジック:

```python
homecare_facilities = sum(1 for d in data if d.get('cap', {}).get('homecare', 0) > 0)
homecare_per75 = homecare_facilities / p75 * 100000
```

→ **「cap.homecare > 0 の施設数」を 75歳以上人口で正規化**。

### 2.2 keyword mapping (`facility_taxonomy.json#homecare`)

```
['在宅', '訪問診療', '訪問看護', '訪問リハ', '居宅', '往診']
```

6 keywords が 59 種類の施設基準コード (届出) にマッチ。47県合計 cap = 161,660。

### 2.3 構造的特性 (本 audit で新たに特定)

| 特性 | 影響 |
|---|---|
| **施設規模を吸収できない** | cap=1 (在宅基準1個) の小規模施設も、cap=10 (在宅特化) の大規模施設も同じ 1 として count |
| **施設集中度を反映しない** | 1施設で 1万人を診ても、月 5人だけ診ても、同じ 1 施設 |
| **キーワード mapping は妥当** | 6 keywords は homecare の主要届出名を網羅、漏れは限定的 |

---

## 3. 重点5県の比較分析

### 3.1 一覧

| 県 | 全施設数 | hc>0施設 | hc>0比率 | cap合計 | cap平均 | cap最大 | 患者数 | **集中度 (患者/施設)** |
|---|---|---|---|---|---|---|---|---|
| 広島県 | 5,070 | **4,359** | 86.0% | 9,354 | 2.1 | 12 | 80,238 | **18.4** (最分散) |
| 山口県 | 2,091 | 1,832 | 87.6% | 3,319 | 1.8 | 12 | 44,203 | 24.1 (分散) |
| 岡山県 | 2,198 | 1,919 | 87.3% | 4,145 | 2.2 | 10 | 67,766 | 35.3 (中間) |
| 秋田県 | 457 | 374 | 81.8% | 1,104 | 3.0 | 11 | 19,222 | 51.4 (中間) |
| **宮崎県** | **515** | **431** | 83.7% | **893** | 2.1 | 10 | **51,349** | **119.1** (最集中) |

### 3.2 集中度の 47県 ranking

**集中型 (TOP 5)**:
1. 宮崎県 119.1 patients/facility
2. 大分県 106.2
3. 岩手県 83.4
4. 鹿児島県 83.1
5. 北海道 83.1

**分散型 (BOTTOM 5)**:
- 43位 岐阜県 29.2
- 44位 鳥取県 28.1
- 45位 島根県 26.8
- **46位 山口県 24.1**
- **47位 広島県 18.4**

→ **広島・山口は 47県中もっとも分散型**、**宮崎は最も集中型**。これが capability_high_actual_mid と capability_low_actual_high を生む構造的要因。

---

## 4. 仮説整理 (4 軸別)

### 4.1 軸 A: 岡山県 (capability_high_actual_high) — positive control

| 指標 | 値 | 判定 |
|---|---|---|
| cap rank | 4 | 高 |
| actual rank | 9 | 高 |
| 集中度 | 35.3 | 中間 |
| cap=3+ 比率 | 27.7% (530/1919) | 中 |

**観察**: 中規模施設に適切な患者数。capability と actual が両軸で整合する稀少な県。

→ **positive control として頑健**。Phase 4-1 P2-5 で `Pattern 4 = Alignment Context` の代表と判断したのは妥当。

### 4.2 軸 B: 広島・山口 (capability_high_actual_mid) — proxy caveat 強

#### 広島県 (cap rank 1 → actual rank 19、gap +18)

仮説:
1. **施設多数だが小規模・分散**: 4,359 hc>0 施設のうち cap=1 が 1,937 (44.4%) = 「homecare 基準を 1 個だけ届出」 が約半数
2. **政令指定都市の医療資源分散**: 広島市・福山市など複数都市圏に施設が分散
3. **届出 vs 実施実態のギャップ**: 在宅基準を制度上届出するだけで、実際の在宅実績が限定的な施設多数
4. **高齢化率は低位**: 75+ 人口分母が大きく、施設密度が嵩上げ

#### 山口県 (cap rank 3 → actual rank 21、gap +18)

仮説 (広島と類似):
1. **分散型構造**: 47位 広島、46位 山口で連続して分散型
2. **届出の制度的な厚み**: 「医療体制は厚いが実績量は中位」(reviewer 採択再定義)
3. **outcome 悪化との因果**: P3 再定義通り、capability が高くても actual usage が中位なため outcome 改善に繋がらない

→ Phase 4-3d で得た「9 県が capability_high_actual_mid」の中で、**広島・山口は集中度 47/46 位 = 構造的最分散型** という事実が決定的。

### 4.3 軸 C: 宮崎県 (capability_low_actual_high) — capability mapping の限界

| 指標 | 値 | 判定 |
|---|---|---|
| cap rank | 38 | 低 |
| actual rank | **2** | 高 |
| 集中度 | **119.1** (47県中 1位) | 最集中 |
| 全施設数 | 515 | 小 |
| 75+人口 | 195,083 (秋田 199,934 とほぼ同じ) | 中 |

仮説:
1. **施設集中型構造**: 少数の大規模施設に患者が集約 (1施設 119人 vs 秋田 51人)
2. **過疎地域の医療集約**: 居住地が分散している逆説、患者が大規模拠点へ集約
3. **施設タイプ偏り**: 在宅療養支援病院などの hub 型施設が他県より高比率の可能性
4. **キーワード mapping の漏れ**: 部分的可能性 (要検証)、ただし主要 6 keywords は妥当

→ **capability proxy は施設数密度を測るのみで、集中度・規模を測れない**。これが宮崎の異常値の根本原因。

### 4.4 軸 D: 秋田県 (capability_low_actual_low) — negative control

| 指標 | 値 | 判定 |
|---|---|---|
| cap rank | 45 | 低 |
| actual rank | 45 | 低 |
| 集中度 | 51.4 | 中間 |
| 75+ 比率 | 全国 +2pt 級 | 高齢化 |

**観察**: 高齢化高 + 施設数少 + 患者数少 + 集中度 中間 → 4軸で整合。P5 (Aging-Outcome Burden) 代表として整合性が高い。

→ **negative control として頑健**。

---

## 5. 代替 proxy 案の評価

### 5.1 案 1: 件数ベース (cap.homecare 値の合計 / p75)

| 県 | 現行 (施設数) | 件数ベース | 変化 |
|---|---|---|---|
| 広島県 | 901.36 (rank 1) | 1934.24 | (rank 1) |
| 岡山県 | 572.63 (rank 4) | 1236.87 | (rank 4) |
| 山口県 | 679.51 (rank 3) | 1231.05 | (rank 5) |
| 東京都 | 398.62 (rank 7) | 897.93 | rank 上昇 |
| 鹿児島県 | 304.63 (rank 25) | 749.61 | 上昇 |
| 秋田県 | 187.06 (rank 45) | 552.18 | 微増 |
| **宮崎県** | 220.93 (rank 38) | **457.75** | **依然低位** |

→ **宮崎の rank 上昇は限定的、actual rank 2 との乖離は解消されない**。広島・山口の高 cap も維持。

**評価**: 部分的改善のみ、根本解決には至らず。

### 5.2 案 2: cap >= 3 の施設のみカウント (規模フィルタ)

「在宅基準を 3 個以上届出する施設 = 在宅機能を主軸とする施設」と定義:

| 県 | 全hc>0 | cap>=3 施設数 | cap>=3 比率 |
|---|---|---|---|
| 広島県 | 4,359 | 1,251 | 28.7% |
| 山口県 | 1,832 | 310 | 16.9% |
| 岡山県 | 1,919 | 537 | 28.0% |
| 秋田県 | 374 | 188 | 50.3% |
| 宮崎県 | 431 | 108 | 25.1% |

→ 山口・宮崎が下がる、秋田が上がる。但し統一的な改善にはならない。

**評価**: 閾値 (3) の根拠が恣意的、proxy の信頼性が低下するリスク。

### 5.3 案 3: 集中度 (1施設あたり患者数) を補助 metric として併記

47県集計済み (本 audit で実施)。

| 用途 | 推奨 |
|---|---|
| capability proxy 自体の修正 | × しない |
| docs / report に補助情報として記載 | ○ する |
| UI に表示 | × しない (誤読リスク) |

**評価**: **caveat 強化として最適**。proxy を変更せず、補助 metric として確定。

---

## 6. 最終判定: capability proxy 修正 vs caveat 強化

### 6.1 判定: **caveat 強化** (proxy は修正しない)

**理由**:
1. Phase 4-1 で確定した P3/P5 判定 baseline を維持 (回帰影響を避ける)
2. 案 1 (件数ベース) は宮崎 rank 上昇が限定的、根本解決にならない
3. 案 2 (cap>=3 フィルタ) は閾値の恣意性、信頼性低下リスク
4. **集中度** という新次元を docs / 補助 metric として保持すれば、誤読防止になる
5. UI 変更を避けるため (reviewer 採択 4-3e Done 条件)

### 6.2 caveat 強化内容

`docs/REGIONAL_MISMATCH_PATTERNS.md` および `docs/capability_mapping.md` に以下を追記推奨:

```
capability proxy (施設数ベース) は以下の特性に注意:
- 施設の規模・集中度を吸収できない (cap=1 の施設も cap=10 の施設も同じ 1 として count)
- 1施設あたり患者数 (集中度) は 47県で 18-119 と大差 (広島 18 vs 宮崎 119)
- capability_high で actual_mid となる 9 県は、分散型構造に起因する可能性あり
- capability_low で actual_high となる宮崎県は、集中型構造に起因する可能性あり
- 「capability 高 = 在宅医療実態が厚い」とは限らない
- P3 判定の proxy_caveat = -1 (P2-4) はこの不確実性を反映済み
```

---

## 7. P3 再定義の確定 (reviewer Devil's Advocate 採択)

```
旧:    P3 = Supply high × Outcome poor

修正:  P3 = Reported capability high × (actual usage mid) × Outcome poor
            └── proxy             └── 4-3d で確認  └── 既存
```

UI 表示文言は変更しない (Phase 4-1 P2-3 で確定した evidence 表現を維持)。
**docs 上の解釈枠組みのみ修正**。

---

## 8. Phase 4-1 guardrail 整合確認

✅ UI / Pattern 判定変更なし (本フェーズは audit のみ)
✅ 「actual が高い = 医療の質が高い」と書かない
✅ 「actual が低い = 悪い」と書かない
✅ 集中度 = 良/悪 という解釈を持ち込まない
✅ capability mapping の修正は行わない (caveat 強化のみ)
✅ terminology guard CI 通過維持

---

## 9. Done 条件チェック

reviewer 採択 Done 条件:

| # | 条件 | 状態 |
|---|---|---|
| 1 | capability_mapping.md の homecare 定義を再確認 | ✅ §2.2 6 keywords 確認 |
| 2 | homecare_capability_by_pref.json の算出元・指標を整理 | ✅ §2.1 ETL 計算式 |
| 3 | 宮崎県の cap低actual高の原因仮説を列挙 | ✅ §4.3 4 仮説 |
| 4 | 広島・山口の cap高actual中の原因仮説を列挙 | ✅ §4.2 4 仮説 |
| 5 | 岡山の cap高actual高 を positive control 確認 | ✅ §4.1 |
| 6 | 秋田の cap低actual低 を negative control 確認 | ✅ §4.4 |
| 7 | capability proxy 修正 vs caveat 強化判断 | ✅ §6 caveat 強化 |
| 8 | UI・判定ロジック変更は行わない | ✅ |
| 9 | npm test PASS | ✅ (test 追加済) |

---

## 10. 関連 commit / 次フェーズ候補

### Phase 4-3 commit chain (本フェーズまで)
```
b80ba02  docs: phase4-3 data expansion scoping plan
9715f91  chore(data): aggregate homecare actual metrics (P2-3d)
0160c22  test: homecare actual audit checks
dc90284  docs: phase4-3d homecare actual audit report
1c2223a  Merge: Phase 4-3d (main)
(本フェーズ) docs: phase4-3e capability mapping audit
(本フェーズ) test: capability mapping audit checks
```

### 次フェーズ候補

| 優先 | 候補 | 理由 |
|---|---|---|
| 1 | **4-3a NDB 26項目** | BRIDGE_V1 §7 #3、データ拡張で新 mismatch pattern 発見余地 |
| 2 | 集中度 metric の正式 ETL 化 | 本 audit の発見を恒久 data 化 |
| 3 | 4-3b NDB 396 薬効分類 | 沖縄 cross-check |
| 4 | 4-3c 二次医療圏化 | UI 大改造、後回し推奨 |

### 関連 docs
- `docs/PHASE4_3D_HOMECARE_ACTUAL_AUDIT.md` (前フェーズ)
- `docs/REGIONAL_MISMATCH_PATTERNS.md` §Pattern 3, §Pattern 4
- `docs/capability_mapping.md` (本 audit 対象)
- `scripts/audit_homecare_rehab_capability.py` (本 audit 対象 ETL)

