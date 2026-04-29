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
