# Phase 4-1 Bridge Outcome UI 設計仕様 (data-to-UI correction)

**作成日**: 2026-04-29\
**対象 commit**: `abdd4d4` (Phase 4 Review Package v3 + version reference 整合済)\
**ステータス**: 内部設計案 (実装は delta review 結果 OK 後)\
**reviewer 採択**: P1-1 として最初の実装単位に固定済 (peer review v2)\
**位置づけ**: UI改修ではなく、**Outcome 誤読防止のための data-to-UI correction**

---

## 0. このドキュメントの位置づけ

P1-1 は **「UIだけの修正」ではない**。

reviewer 採択 (peer review v2) により、本フェーズは以下の3層構造で進める:

```
Layer 1: ETL 追加         (2020年 粗死亡率を新規取得)
   ↓
Layer 2: Schema 統合      (mortality_outcome_2020.json 新規)
   ↓
Layer 3: Bridge UI 分離   (3行表示 + 比較ルール)
```

「Bridge UI を作る」ではなく、「**Outcome 誤読を構造的に防ぐ**」のが目的。

---

## 1. Purpose

Bridge Outcome 表示を、**時点・補正有無が混同されない形** に再設計する。

```
表示対象:
- 2020年 粗死亡率
- 2020年 年齢調整死亡率
- 2024年 粗死亡率

目的:
- 2020年内で「年齢補正前 vs 補正後」を比較可能にする
- 2024年粗死亡率は最新参考値として分離する
- 2020年齢調整死亡率と2024年粗死亡率を直接比較しない
```

reviewer 採択の「**最も安全な P1 実装順**」に基づく:

1. data-to-UI correction (P1-1) ← 本docs
2. UI guardrail (P1-2)
3. 個別画面への guard 設置 (P1-3)
4. Regional Mismatch Explorer MVP (P1-4)
5. terminology guard CI (P1-5/P0-5)

---

## 2. Key Discovery (重要発見)

**現行実装では、2020年粗死亡率は ETL 対象外である。**

データ状態時点`data/static/age_adjusted_mortality_2020.json`✅ Phase 3-1 Option B 生成済2020 年齢調整`data/static/vital_stats_pref.json`✅ Phase 1〜2 で既存**2024 粗死亡率2020年 粗死亡率**❌ **不足** (要新規取得)2020

→ reviewer が求めた「2020粗 / 2020年齢調整 / 2024粗」を UI で正しく出すには、**2020粗死亡率を別途 ETL で取り込む必要がある**。

この発見により、P1-1 は以下の3層になる:

```
ETL追加 → schema追加 → Bridge Outcome UI 分離表示
```

---

## 3. Data Source

```
Source: 厚生労働省 令和5年度人口動態統計特殊報告
        令和2年都道府県別年齢調整死亡率の概況
URL:    https://www.mhlw.go.jp/toukei/saikin/hw/jinkou/other/20sibou/index.html
xlsx:   https://www.mhlw.go.jp/toukei/saikin/hw/jinkou/other/20sibou/xls/13.xlsx

使用する表:
- 参考1: 主な死因、性、都道府県別 粗死亡率・順位 — 令和2年
- 参考2: 主な死因、性、都道府県別 年齢調整死亡率・順位 — 令和2年
```

**Phase 3-1b 確認済**: 6死因 (悪性新生物・心疾患・脳血管疾患・糖尿病・腎不全・肺炎) すべてが同一 xlsx 内に格納されている (e-Stat DB API 不要)。

---

## 4. ETL 方針 (reviewer 採択: 新規統合 JSON)

### 4.1 評価された3案

案内容評価案A既存 `age_adjusted_mortality_2020.json` に crude を追加❌ ファイル名と中身がズレる案B既存ファイルを rename❌ 既存参照を壊す可能性**案C新規** `mortality_outcome_2020.json` **を追加**✅ **最も安全、既存互換性を保つ**

→ **案C 採択** (reviewer 採択)。

### 4.2 既存ファイルの扱い

`data/static/age_adjusted_mortality_2020.json` は **そのまま残す** (Phase 3-1b 監査記録として):

- 削除しない
- rename しない
- UI 接続箇所はゼロのため後方互換性問題なし

新規 `data/static/mortality_outcome_2020.json` を **Bridge UI の Outcome 表示専用** として作る。

### 4.3 ETL スクリプト

新規: `scripts/etl_mortality_outcome_2020.py`

```python
# 参考1 (粗死亡率) + 参考2 (年齢調整死亡率) を同時に抽出
# → mortality_outcome_2020.json に統合出力
# 既存 etl_age_adjusted_mortality_2020.py は rename せず残す
```

---

## 5. 推奨 schema (reviewer 採択)

```json
{
  "source": "令和5年度人口動態統計特殊報告 令和2年都道府県別年齢調整死亡率の概況",
  "source_url": "https://www.mhlw.go.jp/toukei/saikin/hw/jinkou/other/20sibou/xls/13.xlsx",
  "year": 2020,
  "unit": "人口10万対",
  "causes": ["悪性新生物", "心疾患", "脳血管疾患", "糖尿病", "腎不全", "肺炎"],
  "prefectures": {
    "沖縄県": {
      "糖尿病": {
        "crude": {
          "male":   { "rate": 0.0, "rank": null },
          "female": { "rate": 0.0, "rank": null }
        },
        "age_adjusted": {
          "male":   { "rate": 20.8, "rank": 2 },
          "female": { "rate": 9.7,  "rank": 2 }
        }
      },
      "悪性新生物": { "crude": {...}, "age_adjusted": {...} },
      "心疾患":     { "crude": {...}, "age_adjusted": {...} },
      "脳血管疾患": { "crude": {...}, "age_adjusted": {...} },
      "腎不全":     { "crude": {...}, "age_adjusted": {...} },
      "肺炎":       { "crude": {...}, "age_adjusted": {...} }
    }
  },
  "national": {
    "糖尿病": { "crude": {...}, "age_adjusted": {...} }
  },
  "notes": [
    "crude と age_adjusted は同じ2020年ソースから取得 — 比較可能",
    "2024年粗死亡率は別ファイル vital_stats_pref.json から参照",
    "2020年齢調整死亡率と2024年粗死亡率は直接比較しない",
    "rank は1位最高(高値)、47位最低の順"
  ]
}
```

---

## 6. Bridge Mapping (疾患領域 → 死因)

```javascript
// lib/domainMapping.js に追加するフィールド: outcome.aamCause
const OUTCOME_CAUSE_MAP = {
  cancer:             "悪性新生物",   // vital_stats: 'がん(悪性新生物)' ↔ AAM: '悪性新生物'
  cardiovascular:     "心疾患",
  cerebrovascular:    "脳血管疾患",
  diabetes_metabolic: "糖尿病",
  respiratory:        "肺炎",         // ⚠️ 弱いproxy: COPD/喘息全体ではない
  renal:              "腎不全",
};
```

Bridge 表示vital_stats (2024)AAM (2020 統合 JSON)循環器心疾患心疾患糖尿病・代謝糖尿病糖尿病がん**がん(悪性新生物)悪性新生物** ← 唯一の正規化脳血管脳血管疾患脳血管疾患呼吸器肺炎肺炎 (⚠️ 弱proxy 注記必須)腎疾患腎不全腎不全

---

## 7. UI 表示仕様

### 7.1 推奨表示 (3段構造)

```
┌─ Outcome proxy / 糖尿病 ─────────────────────────┐
│                                                │
│  2020年 粗死亡率                                │
│    男: xx.x /10万                              │
│    女: xx.x /10万                              │
│                                                │
│  2020年 年齢調整死亡率 (主指標)                  │
│    男: 20.8 /10万                              │
│    女:  9.7 /10万                              │
│                                                │
│  2024年 粗死亡率                                │
│    総数: 11.0 /10万                            │
│    ※ 最新参考値。2020年齢調整死亡率と直接比較しない │
│                                                │
└────────────────────────────────────────────────┘
```

### 7.2 重要ルール (reviewer 採択、必須明記)

```
🟢 比較してよい:
   2020粗死亡率 vs 2020年齢調整死亡率
   → 同一年・補正前後の比較

🔴 比較してはいけない:
   2020年齢調整死亡率 vs 2024粗死亡率
   → 時点も補正有無も異なる
   → 4年間の変化と年齢補正効果を混同するリスク

🟡 別枠表示:
   2024粗死亡率
   → 最新参考値として独立した枠で表示
   → 2020データとの間に視覚的境界線を引く
```

### 7.3 視覚的ヒエラルキー

行役割フォントサイズ色強調2020 粗死亡率同時点比較ベース中灰控えめ**2020 年齢調整死亡率主指標大紫強調**2024 粗死亡率最新参考中灰区切り線で分離

### 7.4 必須注記 (UI copy)

各セル内に常時表示:

```
※ 年齢調整死亡率は2020年(令和2年)時点。
※ 2020年齢調整値と2024粗死亡率を直接比較しない
   (年次変化と年齢補正を混同しない)。
※ 死亡率は医療の優劣を示す指標ではない。
```

呼吸器ドメインのみ追加:

```
※ 肺炎死亡率は呼吸器領域全体を代表しない弱proxy。
   COPD・喘息は別途扱うべき。
```

---

## 8. 実装範囲 (P1-1 のみ)

### 8.1 含める ✅

#内容1`scripts/etl_mortality_outcome_2020.py` 新規作成 (参考1+2 統合抽出)2`data/static/mortality_outcome_2020.json` 新規生成3`lib/domainMapping.js` 6 domain に `aamCause` フィールド追加4`app/api/mortality-outcome-2020/route.js` 新規 API endpoint5`app/components/views/DomainSupplyDemandBridge.jsx` Outcome 描画変更 (3段表示)6各セル内の必須注記追加

### 8.2 含めない ❌ (P1-2 以降)

- `InterpretationGuard` component (P1-2)
- Bridge 全体の上部 guardrail (P1-2)
- 男女合算の人口加重平均 (P2 以降、現状は男女別併記のみ)
- 47県全国比 vs 47県平均比の正規化選択 UI (将来)
- Regional Mismatch Explorer (P1-4)
- terminology guard CI test (P0-5/P1-5)

---

## 9. Done 条件 (reviewer 採択)

設計 docs (本docs) 自体の Done 条件:

- \[x\] 2020粗死亡率が現行ETL対象外であることを明記 (§2)
- \[x\] 参考1から2020粗死亡率を抽出する方針を明記 (§3, §4)
- \[x\] 参考2の2020年齢調整死亡率との統合 schema を定義 (§5)
- \[x\] 2024粗死亡率は最新参考値として分離表示する方針を明記 (§7)
- \[x\] Bridge 6疾患領域と6死因の mapping を明記 (§6)
- \[x\] 「2020年齢調整死亡率と2024粗死亡率を直接比較しない」と明記 (§7.2)
- \[x\] UI copy に因果否定・時点差注記を入れる (§7.4)

実装の Done 条件 (将来):

- \[ \] AAM ETL (新) が 2020粗死亡率を抽出する
- \[ \] `mortality_outcome_2020.json` が47県 × 6死因 × 男女別 × {crude, age_adjusted} 構造で生成される
- \[ \] `lib/domainMapping.js` の6 domain に `aamCause` が追加される
- \[ \] Bridge OUTCOME セルが 3段 (2020粗 / 2020年齢調整 / 2024粗) で表示される
- \[ \] 各セル内に時点・直接比較禁止の注記が常時表示される
- \[ \] 沖縄 糖尿病で 2020 年齢調整男20.8/女9.7 が表示される
- \[ \] 既存の additionalCauses (誤嚥性肺炎) 挙動が維持される
- \[ \] build / Vercel deploy が通過する

---

## 10. 実装順序 (commit 単位)

順commit内容1`chore: add ETL for mortality_outcome_2020 (crude + age-adjusted)`scripts/etl_mortality_outcome_2020.py 新規、JSON 生成2`chore: add aamCause field to domainMapping`lib/domainMapping.js 6 domain に aamCause3`feat: add /api/mortality-outcome-2020 endpoint`API ルート4`feat: split Bridge outcome into 2020 crude / 2020 age-adj / 2024 crude`DomainSupplyDemandBridge.jsx 描画変更5`docs: update qa checklist for split outcome cells`QA 更新

各 commit は **独立にロールバック可能** な粒度。

---

## 11. Devil's Advocate

### 反論: 2020粗死亡率 ETL まで入れると、P1-1 が重くなりすぎるのではないか

**回答**: 重くはなるが、**必要な重さ**である。

2020粗死亡率なしで UI だけ作ると、結局「2020年齢調整死亡率」と「2024粗死亡率」を並べることになり、reviewer が避けろと言った誤読 (時点差混同) を再発させる。

したがって、P1-1 の **最小単位** はこうなる:

```
最低限:
  2020粗死亡率 ETL
  + 2020年齢調整死亡率との統合 schema
  + Bridge Outcome UI の3段表示
```

P1-1 は「**UI 改修**」ではなく、「**Outcome 誤読防止のための data-to-UI correction**」と位置づける。

### 反論: 既存の age_adjusted_mortality_2020.json を捨てるのか

**回答**: 捨てない。

- 既存ファイルは残す (Phase 3-1b 監査記録としての価値あり)
- 既存 ETL スクリプトも残す
- UI 接続は新規 `mortality_outcome_2020.json` を使う
- 二重持ちの一時期間は許容。**将来一本化** するかは別判断 (P2 以降)。

### 反論: 既存ファイル削除しないと冗長で混乱しないか

**回答**: その通りだが、優先順位の問題。

- P1-1 では「既存を壊さない」を最優先
- 一本化は delta review 後、UI が安定してから判断
- 現時点ではドキュメントで「**新規 mortality_outcome_2020.json が UI 専用**」と明示する

---

## 12. delta review への添付方針 (reviewer 採択)

本 docs は **delta review の主レビュー対象としては出さない**。

理由:

- delta review の主目的は **P0 修正確認**
- P1-1 設計まで含めるとレビュー対象が肥大化する
- 致命的な誤読リスクの確認に集中する

添える場合の文面:

```
なお、P1-1 の最初の UI 実装は Bridge Outcome 表示分離に固定し、
設計メモを先行作成しました。現時点では実装未着手です。
P0 確認後に、2020粗死亡率 ETL 追加 → 2020年齢調整死亡率との分離表示
→ 2024粗死亡率の参考表示、の順で実装予定です。
```

---

## 13. 関連ドキュメント

- `docs/PHASE4_REVIEW_PACKAGE.md` v3 — Q5 案B採択の根拠
- `docs/AGE_ADJUSTED_MORTALITY_AUDIT.md` — Phase 3-1 audit と糖尿病経路統一
- `docs/REGIONAL_MISMATCH_PATTERNS.md` v3 — Pattern 1〜6 の Outcome 引用元
- `docs/BRIDGE_V1_INTERPRETATION.md` — Bridge Risk Model v1 解釈
- `data/static/age_adjusted_mortality_2020.json` — Phase 3-1 Option B 生成 (UI未接続、残置)
- `lib/domainMapping.js` — 修正対象 (`aamCause` 追加)
- `app/components/views/DomainSupplyDemandBridge.jsx` — 修正対象 (3段表示化)

---

## 14. 並行作業メモ (peer review v2 採択範囲、実装は禁止)

reviewer 採択により、delta review 結果待ちの間、以下のみ進めてよい:

- ✅ 実装ブランチ名・commit順の確定
- ✅ ETL対象 xlsx の列・表構造メモ
- ✅ expected JSON fixture の手書き案
- ❌ 実装コード追加禁止 (etl/api/ui どれも触らない)

### 14.1 実装ブランチ名 (確定案)

```
feature/p1-1-mortality-outcome-2020
```

理由:

- `feature/` プレフィックスで delta review 後の機能追加と明確化
- `p1-1-` で reviewer 採択の P1 順序内の最初の単位を明示
- `mortality-outcome-2020` でデータ仕様 (時点・対象) を直接表現

### 14.2 ETL対象 xlsx の列・表構造メモ

**xlsx パス**: `data/raw_age_adjusted_mortality/r2_age_adjusted_mortality.xlsx` (4.7MB、Phase 3-1 で取得済)

**シート構成** (全38シート、内ETL対象 6シート):

シート内容ETL対象参考１（１）**粗死亡率** — 全死因/悪性新生物/胃/大腸/肺/糖尿病✅ Layer 1参考１（２）**粗死亡率** — 心疾患/急性心筋梗塞/脳血管疾患/脳梗塞/肺炎/慢性閉塞性肺疾患✅ Layer 1参考１（３）**粗死亡率** — 肝疾患/腎不全/老衰/不慮の事故/自殺✅ Layer 1参考２（１）**年齢調整死亡率** — 全死因/悪性新生物/胃/大腸/肺/糖尿病✅ Layer 1参考２（２）**年齢調整死亡率** — 心疾患/急性心筋梗塞/脳血管疾患/脳梗塞/肺炎/慢性閉塞性肺疾患✅ Layer 1参考２（３）**年齢調整死亡率** — 肝疾患/腎不全/老衰/不慮の事故/自殺✅ Layer 1図1〜22, 表1〜3, 統計表1〜3, 参考3集計・グラフ等❌ 対象外

**行構造** (参考1/2 共通):

row内容1タイトル ("参考１　主な死因、性、都道府県別粗死亡率・順位 — 令和2年" 等)2空行3死因見出し (col 2, 6, 10, 14, 18, 22 ... に死因名)4性別見出し ("男" col=2/6/..., "女" col=4/8/...)5値種別 ("率" col=2,4,6,..., "順位" col=3,5,7,...)6全国値 ("全 　国")7-5347都道府県54-55注記

**6死因 → (シート, col) の正確な対応**:

```python
CAUSE_LOC = {
    '悪性新生物': {'crude_sheet': '参考１（１）', 'crude_col': 6,  'aam_sheet': '参考２（１）', 'aam_col': 6},
    '糖尿病':     {'crude_sheet': '参考１（１）', 'crude_col': 22, 'aam_sheet': '参考２（１）', 'aam_col': 22},
    '心疾患':     {'crude_sheet': '参考１（２）', 'crude_col': 2,  'aam_sheet': '参考２（２）', 'aam_col': 2},
    '脳血管疾患': {'crude_sheet': '参考１（２）', 'crude_col': 10, 'aam_sheet': '参考２（２）', 'aam_col': 10},
    '肺炎':       {'crude_sheet': '参考１（２）', 'crude_col': 18, 'aam_sheet': '参考２（２）', 'aam_col': 18},
    '腎不全':     {'crude_sheet': '参考１（３）', 'crude_col': 6,  'aam_sheet': '参考２（３）', 'aam_col': 6},
}
# 各 col は男率、col+1=男順位、col+2=女率、col+3=女順位
```

**注意点**:

- シート名は **全角括弧** (`参考１（１）` ではなく `参考1(1)` ではない)
- 47都道府県名にも `\u3000` (全角空白) が含まれる ("沖\\u3000 縄" 等)、文字列正規化が必要
- 参考1のタイトルは「主な死因、性、都道府県別粗死亡率・順位 -令和2年-」
- 参考2のタイトルは「主な死因、性、都道府県別年齢調整死亡率・順位 -令和2年-」
- 「東京都」は xlsx 内では「東 京 都」(全角空白入り)

### 14.3 expected JSON fixture (4代表県、6死因、男女別)

**全国値** (47都道府県の参照基準、xlsx row 6 から抽出):

```json
{
  "全国": {
    "悪性新生物": { "crude": { "male": {"rate": 368.3}, "female": {"rate": 248.3} },
                  "age_adjusted": { "male": {"rate": 394.7}, "female": {"rate": 196.4} } },
    "糖尿病":     { "crude": { "male": {"rate": 12.9},  "female": {"rate": 9.7}   },
                  "age_adjusted": { "male": {"rate": 13.9},  "female": {"rate": 6.9}   } },
    "心疾患":     { "crude": { "male": {"rate": 165.5}, "female": {"rate": 167.7} },
                  "age_adjusted": { "male": {"rate": 190.1}, "female": {"rate": 109.2} } },
    "脳血管疾患": { "crude": { "male": {"rate": 84.0},  "female": {"rate": 83.0}  },
                  "age_adjusted": { "male": {"rate": 93.8},  "female": {"rate": 56.4}  } },
    "肺炎":       { "crude": { "male": {"rate": 74.8},  "female": {"rate": 52.9}  },
                  "age_adjusted": { "male": {"rate": 90.1},  "female": {"rate": 33.4}  } },
    "腎不全":     { "crude": { "male": {"rate": 23.3},  "female": {"rate": 20.5}  },
                  "age_adjusted": { "male": {"rate": 27.3},  "female": {"rate": 13.5}  } }
  }
}
```

**沖縄県 (Pattern 1: Risk-Care 乖離)**:

| 死因 | 粗 男 (順位) | 粗 女 (順位) | 調整 男 (順位) | 調整 女 (順位) |
|---|---|---|---|---|
| 悪性新生物 | 269.0 (47位) | 184.9 (47位) | 352.9 (46位) | 184.9 (35位) |
| **糖尿病** | **16.3 (15位)** | **10.5 (29位)** | **20.8 (2位)** | **9.7 (2位)** |
| 心疾患 | 126.7 (45位) | 104.3 (47位) | 175.1 (38位) | 87.1 (46位) |
| 脳血管疾患 | 73.0 (40位) | 62.3 (45位) | 99.9 (20位) | 52.4 (33位) |
| 肺炎 | 42.2 (47位) | 21.7 (47位) | 65.4 (44位) | 17.9 (47位) |
| 腎不全 | 19.1 (44位) | 18.5 (35位) | 26.9 (26位) | 15.5 (8位) |

**重要発見 (Pattern 1 強化)**: 沖縄 糖尿病の **粗 vs 年齢調整 の劇的逆転**:
- 男: 粗16.3 (15位) → 調整20.8 (**2位**)、+27.6%
- 女: 粗10.5 (29位) → 調整9.7 (**2位**)、-7.6% (rate は微減だが順位が劇的に上昇)

**秋田県 (Pattern 2 + 5)**:

| 死因 | 粗 男 (順位) | 粗 女 (順位) | 調整 男 (順位) | 調整 女 (順位) |
|---|---|---|---|---|
| 悪性新生物 | 530.1 (1位) | 346.0 (1位) | 445.9 (2位) | 203.5 (7位) |
| 糖尿病 | 21.9 (2位) | 14.9 (6位) | 19.5 (3位) | 8.0 (15位) |
| 心疾患 | 202.6 (11位) | 228.7 (9位) | 182.2 (31位) | 99.3 (37位) |
| **脳血管疾患** | **143.0 (2位)** | **162.9 (1位)** | **124.1 (2位)** | **78.2 (2位)** |
| 肺炎 | 117.1 (3位) | 72.7 (12位) | 105.4 (10位) | 31.9 (23位) |
| 腎不全 | 33.9 (4位) | 29.5 (10位) | 29.9 (11位) | 13.8 (23位) |

**観察**: 秋田 脳血管疾患は粗・年齢調整ともに男2位/女2位 (補正後も高位維持)。Pattern 2 (Supply-Outcome 並列悪化) を支持。

**山口県 (Pattern 3: Supply-Outcome 不一致)**:

| 死因 | 粗 男 (順位) | 粗 女 (順位) | 調整 男 (順位) | 調整 女 (順位) |
|---|---|---|---|---|
| 悪性新生物 | 438.5 (7位) | 282.3 (12位) | 398.9 (17位) | 185.0 (34位) |
| 糖尿病 | 16.5 (11位) | 15.1 (3位) | 15.0 (19位) | 8.4 (11位) |
| **心疾患** | **224.3 (3位)** | **247.0 (2位)** | **215.7 (5位)** | **126.7 (2位)** |
| 脳血管疾患 | 105.5 (11位) | 108.9 (14位) | 99.0 (21位) | 56.2 (27位) |
| **肺炎** | **118.7 (1位)** | **94.3 (2位)** | **116.7 (2位)** | **44.9 (4位)** |
| **腎不全** | **33.2 (5位)** | **30.9 (4位)** | **32.4 (4位)** | **15.5 (10位)** |

**観察**: 山口 肺炎は粗 男1位/女2位 → 年齢調整後も男2位/女4位。Pattern 3 (供給+ × 結果悪) の最強証拠 — 「cap.homecare +104%」と並列に肺炎・心疾患・腎不全すべてで補正後も上位を維持。

**東京都 (Pattern 6: 都市低リスク・高機能集積 Context)**:

| 死因 | 粗 男 (順位) | 粗 女 (順位) | 調整 男 (順位) | 調整 女 (順位) |
|---|---|---|---|---|
| 悪性新生物 | 297.2 (46位) | 211.8 (46位) | 385.7 (28位) | 199.0 (11位) |
| **糖尿病** | **10.8 (41位)** | **6.8 (46位)** | **13.7 (27位)** | **5.7 (40位)** |
| 心疾患 | 140.2 (43位) | 131.5 (44位) | 194.4 (22位) | 105.2 (32位) |
| 脳血管疾患 | 66.9 (46位) | 63.1 (44位) | 89.3 (30位) | 52.6 (32位) |
| 肺炎 | 57.5 (43位) | 39.4 (43位) | 84.4 (29位) | 30.8 (28位) |
| 腎不全 | 17.0 (47位) | 13.9 (47位) | 24.3 (43位) | 11.1 (43位) |

**観察**: 東京は粗死亡率では多くが下位 (40位台) だが、年齢調整後は中位 (20-30位) に上がる。**若年構造の影響が大きいことを定量確認**。低リスク・低死亡率の単純評価は誤読 (Pattern 6 Context Archetype の正当性を補強)。

### 14.4 fixture の検証ポイント (実装時)

実装後、ETL の出力 JSON が以下を満たすことをテストで確認:

| # | 検証 | expected |
|---|---|---|
| T1 | 沖縄 糖尿病 粗死亡率 男 | 16.3 |
| T2 | 沖縄 糖尿病 年齢調整死亡率 男 | 20.8 |
| T3 | 全国 糖尿病 年齢調整死亡率 男 | 13.9 (Phase 3-1 既存値と一致) |
| T4 | 山口 肺炎 年齢調整死亡率 男 | 116.7 |
| T5 | 秋田 脳血管疾患 年齢調整死亡率 男 | 124.1 |
| T6 | 東京 糖尿病 粗死亡率 男 | 10.8 |
| T7 | 47都道府県 + 全国 = 48エントリ | (entity完全性) |
| T8 | 6死因 × 47県 × 男女 × {crude, age_adjusted} = 1128エントリ | (シェイプ完全性) |

### 14.5 並行作業の Done 状態 (本commit時点)

- [x] 実装ブランチ名 確定 (`feature/p1-1-mortality-outcome-2020`)
- [x] xlsx シート構造メモ (6シート × cause→col マッピング)
- [x] expected JSON fixture (4代表県 + 全国、6死因、男女別)
- [ ] **実装コード**: 未着手 (delta review OK 後)

このメモは `delta review OK 通知` 受領後、即座に Layer 1 ETL 実装に着手できる状態とする。
