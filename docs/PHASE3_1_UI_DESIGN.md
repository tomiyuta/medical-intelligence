# Phase 3-1 UI 反映 設計仕様 (Bridge OUTCOME 列分離)

**作成日**: 2026-04-29  
**対象 commit**: `f85ae4c` (P0 alignment + version reference 整合済)  
**ステータス**: 内部設計案 (実装は delta review 結果 OK 後)  
**reviewer 採択**: P1-1 として最初の実装単位に固定済

---

## 0. 目的

外部レビュアー Conditional Go 5条件のうち #2 (UI注記強制表示) を達成するため、Bridge OUTCOME 列に **時点ズレを明示した3行表示** を導入する。

```
2020 粗死亡率
2020 年齢調整死亡率
2024 粗死亡率
```

reviewer 指示の「**最も安全な P1 実装順**」に基づく。UI guardrail (InterpretationGuard) より前に、誤読されやすい Outcome 表示そのものを分離する。

---

## 1. 現状の Outcome 列実装 (修正前)

### 1.1 データソース
- `data/static/vital_stats_pref.json` — **2024年確定数の粗死亡率のみ**

### 1.2 表示構造
- `lib/domainMapping.js` の各 domain.outcome.vitalCause で死因を指定
- `app/components/views/DomainSupplyDemandBridge.jsx` の `getCell(domain, 'outcome')` で値取得
- 結果: **粗死亡率 1行 + delta バッジ** のみ表示

### 1.3 既存の注記 (footnote)
> ・**「結果」列は粗死亡率(年齢調整前)**。年齢構成の影響を強く受けるため、医療アウトカムの優劣として直接解釈しない。

### 1.4 制約
- **2020年データなし** (vital_stats_pref は2024のみ)
- **年齢調整死亡率なし** (Phase 3-1 Option B で生成済の AAM JSON が UI 未接続)

---

## 2. 修正後の Outcome 列構造

### 2.1 表示構造 (3行 + 注記)

```
┌─ Outcome / 心疾患 ─────────────────────────────────┐
│                                                  │
│  2020 粗死亡率                                    │
│    [値] /10万                                    │
│    [delta バッジ vs 2020 全国]                     │
│                                                  │
│  2020 年齢調整死亡率 (主指標)                       │
│    [値] /10万 (男女平均)                           │
│    男 [値] / 女 [値]                              │
│    [delta バッジ vs 2020 全国年齢調整]              │
│                                                  │
│  2024 粗死亡率 (最新参考)                          │
│    [値] /10万                                    │
│    [delta バッジ vs 2024 全国]                     │
│    ※2020年齢調整値と直接比較しない                  │
│                                                  │
└──────────────────────────────────────────────────┘
```

### 2.2 主指標と参考指標の区別

| 行 | 役割 | 表示優先度 | 色 |
|---|---|---|---|
| 2020 粗死亡率 | 同時点比較ベース | 中 | 灰 |
| **2020 年齢調整死亡率** | **主指標** (年齢構成補正済) | **大** | **紫** |
| 2024 粗死亡率 | 最新トレンド参考 | 中 | 灰 |

reviewer 推奨: 「2020粗死亡率 + 2020年齢調整死亡率 をペア表示し、2024粗死亡率は別行・別バッジで扱う」

### 2.3 必須注記 (該当セル内)

```
※年齢調整死亡率は2020年(令和2年)時点。
※2020年齢調整値と2024粗死亡率を直接比較しない (年次変化と年齢補正を混同しない)。
※男女別データから計算した単純平均 (人口加重なし)。
```

### 2.4 男女別表示の扱い

reviewer Q5 案B採択により **「2020 年齢調整死亡率」セル内に男女別値も併記**:

```
2020 年齢調整死亡率 (主指標)
  20.8/10万 (男)
   9.7/10万 (女)
  15.25/10万 (男女単純平均)
```

- 男女平均は `total_simple_mean` (単純平均) を使用 — 既に AAM JSON に格納済
- **人口加重平均は本フェーズでは実装しない** (将来課題)

---

## 3. データソース要件

### 3.1 既存 (実装済)
- ✅ `data/static/age_adjusted_mortality_2020.json` — 2020 年齢調整死亡率 (Phase 3-1 Option B 生成済)
- ✅ `data/static/vital_stats_pref.json` — 2024 粗死亡率

### 3.2 ⚠️ 不足: 2020年粗死亡率
- AAM xlsx の **参考1シート** に 2020 年粗死亡率が格納されている (確認済)
- 現在の `etl_age_adjusted_mortality_2020.py` は参考2 (年齢調整) のみ抽出
- **要追加実装**: ETL を拡張し参考1 も抽出 → `crude_mortality_2020` フィールドを JSON に追加

### 3.3 ETL 拡張案

```python
# scripts/etl_age_adjusted_mortality_2020.py 拡張
# 既存: 参考2(1)/(2)/(3) → age_adjusted: { 男率/順位/女率/順位 }
# 追加: 参考1(1)/(2)/(3) → crude_2020:  { 男率/順位/女率/順位 }

JSON 構造 (拡張後):
{
  "prefectures": {
    "沖縄県": {
      "糖尿病": {
        "age_adjusted": {
          "male":   {"rate": 20.8, "rank": 2},
          "female": {"rate": 9.7,  "rank": 2},
          "total_simple_mean": 15.25
        },
        "crude_2020": {
          "male":   {"rate": ..., "rank": ...},
          "female": {"rate": ..., "rank": ...},
          "total_simple_mean": ...
        }
      }
    }
  }
}
```

⚠️ **後方互換性**: 既存スキーマは `male` / `female` / `total_simple_mean` が直接 cause 直下にあるため、**v2 スキーマへ移行が必要**。古いコード (もしあれば) を破壊しないよう注意。

---

## 4. cause 名のマッピング

`lib/domainMapping.js` の `vitalCause` ↔ AAM JSON の cause 名:

| domain | vitalCause (vital_stats) | AAM cause | sanity OK? |
|---|---|---|---|
| 循環器 | 心疾患 | 心疾患 | ✅ 一致 |
| 糖尿病・代謝 | 糖尿病 | 糖尿病 | ✅ 一致 |
| がん | **がん(悪性新生物)** | **悪性新生物** | ⚠️ 名前差異あり、正規化必要 |
| 脳血管 | 脳血管疾患 | 脳血管疾患 | ✅ 一致 |
| 呼吸器 | 肺炎 | 肺炎 | ✅ 一致 |
| 腎疾患 | 腎不全 | 腎不全 | ✅ 一致 |

**正規化方針**: `lib/domainMapping.js` 側に `aamCause` フィールドを追加。

```js
// 例: がん domain
outcome: {
  vitalCause: 'がん(悪性新生物)',  // vital_stats 検索キー (2024)
  aamCause: '悪性新生物',          // AAM 検索キー (2020 + 年齢調整)
  label: '悪性新生物 死亡率',
  ...
}
```

---

## 5. 実装範囲 (P1-1 のみ)

### 5.1 含める ✅
- `scripts/etl_age_adjusted_mortality_2020.py` 拡張 (参考1 = 2020粗死亡率追加)
- AAM JSON v2 スキーマ生成 (`age_adjusted` / `crude_2020` 階層化)
- `lib/domainMapping.js` に `aamCause` フィールド追加 (6 domain)
- `app/components/views/DomainSupplyDemandBridge.jsx` の Outcome セル描画を 3行表示に変更
- AAM JSON 読み込み API endpoint 追加 (`/api/age-adjusted-mortality-2020`)
- 各セル内に必須注記 (時点・男女平均・直接比較禁止)

### 5.2 含めない ❌ (P1-2 以降)
- `InterpretationGuard` component (P1-2 で別実装)
- Bridge 全体の上部 guardrail (P1-2)
- 男女別レイヤーの追加表示 (P1 後半 or P2)
- 人口加重平均 (将来課題)
- 47県全国比 vs 47県平均比の正規化選択 UI (将来)
- Regional Mismatch Explorer (P1-3 以降)

---

## 6. テスト項目 (Done条件)

| # | 検証項目 | 期待値 |
|---|---|---|
| T1 | 沖縄 糖尿病 OUTCOME に3行表示 | 2020粗 / 2020調整 男20.8女9.7 平均15.25 / 2024粗11.0 |
| T2 | 山口 肺炎 OUTCOME に3行表示 | 2024粗 + 2020調整男(81.0/10万 想定) + 2020粗 |
| T3 | 全国(全47県平均)が AAM 全国値と一致 | 厚労省公表値 (糖尿病男13.9等) |
| T4 | 男女平均値が単純平均で計算される | (male + female) / 2 |
| T5 | 注記が常時表示される | 「2020年齢調整値と2024粗死亡率を直接比較しない」 |
| T6 | 既存の 2024粗死亡率 表示も維持 | (regression なし) |
| T7 | additionalCauses (誤嚥性肺炎) の表示も維持 | 既存挙動と整合 |

---

## 7. 想定されるデザイン上の課題

### 7.1 行数増加によるテーブル高さ拡大
- 現状: 1行 (粗死亡率のみ) + 補足
- 変更後: 3-4行 + 注記 → **約 2.5x の高さ**
- 対応: 各行をコンパクト表示、フォントサイズ縮小 (10-11px)、または **トグル展開** で詳細表示

### 7.2 mobile (iPhone) での視認性
- 概況タブと違い NdbView (Bridge を含む) は **横スクロール許容** 設計
- ただし Outcome 列だけが大きく拡大すると行が読みにくい
- 対応: mobile 専用 layout で「**上から順に表示**」(縦スクロール優先)

### 7.3 男女別値の扱い (peer review v1 採択)
- 主指標: `total_simple_mean` (男女単純平均) を大きく表示
- 補助: 男 / 女 の値を小さく併記
- 男女合算が必要な場面 (47県比較時) は単純平均で十分、人口加重は将来

### 7.4 Pattern 3 (山口・徳島・鹿児島) の誤読リスク
- reviewer Q6 で最も危険と指摘された画面
- Outcome セルが「供給+ × 結果悪」をハイライトすると **政策効果否定** に読まれる
- 対応: Outcome セル直下に **「供給 proxy は実施件数や政策効果を示さない」** の guard を併置 (P1-2)

---

## 8. 実装順序 (commit 単位)

| 順 | commit | 内容 |
|---|---|---|
| 1 | `chore: extend AAM ETL to include 2020 crude mortality` | etl_age_adjusted_mortality_2020.py 拡張、JSON v2 生成 |
| 2 | `chore: add aamCause field to domainMapping` | lib/domainMapping.js 6 domain に aamCause 追加 |
| 3 | `feat: add age-adjusted mortality API endpoint` | /api/age-adjusted-mortality-2020 新規 |
| 4 | `feat: split Bridge outcome into 2020 crude / 2020 age-adj / 2024 crude` | DomainSupplyDemandBridge.jsx 描画変更 |
| 5 | `docs: update interpretation notes for split outcome cells` | 注記追加、qa checklist 更新 |

各 commit は **独立にロールバック可能**な粒度。

---

## 9. Devil's Advocate (実装前の自己検証)

### 反対意見1: 「3行表示は情報過多で誤読リスクが上がる」
- 実値・男女別・時点・全国比が同時に並ぶと、ユーザーが優先順位を見失う
- 反証: reviewer は「2020粗死亡率 + 2020年齢調整死亡率をペアで主表示、2024粗は参考」と明示
- 対応: 主指標 (年齢調整) を視覚的に強調 (紫色・大きいフォント)、参考は小さく目立たせない

### 反対意見2: 「2020 vs 2024 の差は4年間あり、その間の改善・悪化を見落とす」
- 例: 4年間の医療改善で 2024 が 2020 年齢調整より低い場合、「年齢調整 < 粗」と誤読
- 反証: 各セル内の必須注記で **「年次変化と年齢補正を混同しない」** を明示
- 対応: 注記を視覚的にも強調 (黄色背景 or アイコン)

### 反対意見3: 「ETL 拡張は AAM JSON v1→v2 の破壊的変更で既存利用箇所を壊すリスク」
- 反証: AAM JSON は Phase 3-1 Option B 生成のみで、UI 未接続。**現時点で読み込み箇所ゼロ**
- 対応: v2 スキーマで生成、後方互換性は不要

### 反対意見4: 「P1-2 の InterpretationGuard が無いと P1-1 の効果が薄い」
- 全画面 guardrail が無いと、Bridge を直接見たユーザーは依然誤読しうる
- 反証: reviewer は「Outcome 表示分離が最も誤読リスクの高い場所」と判定、まずここを潰す
- 対応: P1-1 と P1-2 を別 commit で連続実施 (どちらも待たない)

---

## 10. 完了基準 (Done条件)

- ✅ AAM ETL が 2020粗死亡率も抽出する
- ✅ AAM JSON v2 が47県 × 6死因 × 男女別 × {age_adjusted, crude_2020} 構造で生成される
- ✅ `lib/domainMapping.js` の6 domain に `aamCause` が追加される
- ✅ Bridge OUTCOME セルが 3行 (2020粗 / 2020年齢調整 / 2024粗) で表示される
- ✅ 各セル内に時点・直接比較禁止の注記が常時表示される
- ✅ 沖縄 糖尿病で 2020 年齢調整男20.8/女9.7 が表示される
- ✅ 既存の additionalCauses (誤嚥性肺炎) 挙動が維持される
- ✅ build (next build) が通過する
- ✅ Vercel deploy が成功する
- ✅ docs/PHASE3_1_UI_DESIGN.md が固定される (本docs)

---

## 11. 関連ドキュメント

- `docs/PHASE4_REVIEW_PACKAGE.md` v3 — Q5 案B採択の根拠
- `docs/AGE_ADJUSTED_MORTALITY_AUDIT.md` — Phase 3-1 audit と糖尿病経路統一
- `docs/REGIONAL_MISMATCH_PATTERNS.md` v3 — Pattern 1〜6 の Outcome 引用元
- `docs/BRIDGE_V1_INTERPRETATION.md` — Bridge Risk Model v1 解釈
- `data/static/age_adjusted_mortality_2020.json` — Phase 3-1 Option B 生成
- `lib/domainMapping.js` — 修正対象
- `app/components/views/DomainSupplyDemandBridge.jsx` — 修正対象
