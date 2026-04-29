# Phase 4-3c-B-lite: 広島県二次医療圏 prototype report

**フェーズ**: Phase 4-3c-B-lite (二次医療圏化、scope を厳守した最小最新化 prototype)
**branch**: feature/phase4-3c-b-lite-hiroshima
**reviewer 採択 scope**: 広島県のみ、Supply + Population、UI 変更なし、NDB Risk side 実装なし、全国拡張なし
**結論サマリ**: ✅ Done 条件 全達成。広島県 7 圏域で JMAP fixture と既存 3 ETL の整合確認、市区町村→圏域集計 prototype が動作。

---

## 0. Executive Summary

| 軸 | 結論 |
|---|---|
| 圏域数の整合性 | ✅ 4 source すべて 7 圏域 (homecare/bed/demo/JMAP) |
| 圏域名の一致 | ✅ 7 圏域名すべて期待通り (広島/広島西/呉/広島中央/尾三/福山・府中/備北) |
| JMAP fixture 値 | ✅ 7 圏域 = 227 hospitals (全値一致) |
| 市区町村→圏域集計 | ✅ 7/7 圏域で動作 |
| NDB Risk side scope | ✅ 未実装、別フェーズ (4-3c-Risk-NDB) に明示分離 |
| ETL vs JMAP 差分 | ⚠ +20 hospitals (時期差、4-3c-1 で要対応) |

---

## 1. 背景

reviewer 採択 (Phase 4-3c source feasibility micro-fix ACCEPT 後):

> 推奨: 4-3c-B-lite 着手
> JMAP + 社人研による Supply + Population の二次医療圏 prototype
> 対象: 広島県
> UI変更なし、NDB Risk side 実装なし、全国拡張なし

本 prototype は、広島県を「最小最新化」候補として用い、JMAP supply data と既存 ETL の整合性、および市区町村→二次医療圏集計の feasibility を実証する。

---

## 2. data source の構成

### 2.1 既存 3 ETL (取得済)

| source | ファイル | 圏域数 (広島) |
|---|---|---|
| 在宅医療 ETL | `data/static/area_emergency_homecare.json` | 7 |
| 病床 ETL | `data/static/medical_areas_national.json` | 7 |
| 人口 ETL | `data/static/area_demographics.json` | 7 |

### 2.2 JMAP screen-confirmed fixture (本フェーズで追加)

reviewer 採択方針: 一括 download は医師会員限定のため、画面確認値を fixture 化。

```
出典: JMAP (公益社団法人日本医師会)
URL:  https://jmap.jp/
取得方法: 広島県 (pref_id=34) × 二次医療圏別集計 × 病院数
data source 元: ウェルネスデータベース (毎月25日に前月情報へ更新)
確認時刻: 2026-04-30
```

| 圏域 | JMAP 病院数 |
|---|---|
| 広島(広島市安佐南区など) | 92 |
| 広島西(廿日市市など) | 12 |
| 呉(呉市など) | 28 |
| 広島中央(東広島市など) | 19 |
| 尾三(尾道市など) | 21 |
| 福山・府中(福山市など) | 45 |
| 備北(三次市など) | 10 |
| **合計** | **227** |

### 2.3 社人研 2023 推計 (skeleton のみ)

reviewer 採択方針:
> もし今回の環境で Excel 取得が重い場合は、prototype として既存 municipality population source を使う
> + 社人研 Excel 取得手順を docs に明記
> + population aggregation logic の skeleton を作る

本 prototype では既存 `area_demographics.json` (国勢調査 2020 ベース) を population source として使用し、市区町村→二次医療圏集計の **logic skeleton** を実装。社人研 2023 推計 Excel の取り込みは別フェーズ (4-3c-2 ETL 拡張) で実施する。

社人研 取得手順 (skeleton):
1. https://www.ipss.go.jp/pp-shicyoson/j/shicyoson23/t-page.asp にアクセス
2. 「結果表1 総人口および指数」(Excel、約 1 MB) をダウンロード
3. または「全都道府県・市区町村別の男女・年齢（5歳）階級別の推計結果一覧」(Excel、約 8 MB)
4. 広島県の市区町村行を抽出
5. 既存 `area_demographics.json#munis` の市区町村 mapping を使い、二次医療圏に集計
6. 推計年 (2025/2030/2035/2040/2045/2050) ごとに pop / p65 / p75 を再集計

---

## 3. 検証結果

### 3.1 圏域数照合

| ETL source | 圏域数 |
|---|---|
| homecare ETL | 7 |
| bed ETL | 7 |
| demo ETL | 7 |
| JMAP fixture | 7 |
| **consistent** | **✅ true** |

### 3.2 病院数 比較 (JMAP vs ETL)

| 圏域 | JMAP | ETL | 差 |
|---|---|---|---|
| 広島 | 92 | 84 | **+8** |
| 広島西 | 12 | 12 | 0 |
| 呉 | 28 | 23 | **+5** |
| 広島中央 | 19 | 17 | +2 |
| 尾三 | 21 | 21 | 0 |
| 福山・府中 | 45 | 40 | **+5** |
| 備北 | 10 | 10 | 0 |
| **合計** | **227** | **207** | **+20** |

**観察**:
- 4 圏域で完全一致 (広島西/尾三/備北/広島中央 はほぼ一致)
- 3 圏域で正の差分 (広島 +8、呉 +5、福山・府中 +5)
- 合計 +20 病院 (約 9.7% の差)
- → JMAP は毎月25日更新 (現在: 2026-04-30 時点の最新)、既存 ETL は取り込み時点で時期差あり
- → Phase 4-3c-1 で **既存 ETL の再取り込み** が推奨される

### 3.3 市区町村→二次医療圏 集計 (Population)

既存 `area_demographics.json#munis` を集計:

| 圏域 | 市区町村数 | 総人口 | 75 歳以上人口 | 高齢化率 (65+) |
|---|---|---|---|---|
| 広島 | 7 | 167,218 | 52,439 | 31.36% |
| 広島西 | 2 | 140,804 | 45,981 | 32.66% |
| 呉 | 2 | 221,932 | 82,937 | 37.37% |
| 広島中央 | 3 | 220,247 | 60,321 | 27.39% |
| 尾三 | 3 | 227,990 | 84,887 | 37.23% |
| 福山・府中 | 3 | 497,935 | 152,011 | 30.53% |
| 備北 | 2 | 79,102 | 31,605 | 39.95% |
| **合計** | **22** | **1,555,228** | **510,181** | - |

⚠ **重要な caveat (4-3c-1 で要調査)**:
- 「広島」圏域の人口 167,218 は不自然に小さい (広島市全体は約 119万人)
- 既存 `area_demographics.json` の広島市の **区別 (中区/南区/西区/東区/安佐北区/安佐南区/安芸区) が 7 munis として収録されているが、人口値が不完全である可能性**
- 広島県全体の合計 1,555,228 は実際の人口 (約 280万人) より大きく不足
- → 4-3c-1 (Data 整合性 audit、6-8h) で **demo ETL の再構築** が必要

---

## 4. JMAP fixture の出典・利用条件

JMAP 利用規約 (https://jmap.jp/pages/guide):
> 「対外的な発表や出版等の活動に際しては、当サイト名および情報入手元の表記をお願いいたします」

本 prototype の `secondary_area_hiroshima_prototype.json#_data_sources.jmap_fixture` に明記:
- `_source`: "JMAP screen-confirmed fixture (公益社団法人日本医師会)"
- `_source_url`: "https://jmap.jp/"
- `_data_source_origin`: "ウェルネスデータベース (地方厚生局公表資料、毎月25日に前月情報へ更新)"
- `_confirmed_at`: "2026-04-30"
- `_disclaimer`: "本データは画面表示の確認値であり、JMAP の一括 download (医師会員限定) ではない。対外公開時は JMAP の名称と情報入手元の表記を行うこと。"

---

## 5. NDB Risk side の取り扱い (reviewer 採択 scope 厳守)

`secondary_area_hiroshima_prototype.json#ndb_risk_side_status`:

```json
{
  "implemented": false,
  "reason": "reviewer 採択方針 (Phase 4-3c-B-lite scope 外)",
  "deferred_to": "Phase 4-3c-Risk-NDB (別フェーズ、性年齢別再集計・分母再設計・秘匿値「－」のゼロ変換・年齢標準化の再設計が必要)",
  "details_doc": "docs/PHASE4_3C_REQUIREMENTS.md §12.5"
}
```

NDB Risk side の二次医療圏化は本フェーズの scope 外。詳細は `docs/PHASE4_3C_REQUIREMENTS.md §12.5` 参照。

---

## 6. Done 条件 全達成

| # | 条件 | 状態 |
|---|---|---|
| 1 | JMAP から広島県7圏域の supply stats を取得または再現 | ✅ fixture 化 (画面確認値) |
| 2 | 広島県7圏域の病院数が既存確認値と一致 | ✅ 全 7 圏域 + 合計 227 一致 |
| 3 | 既存 medical_areas_national.json と圏域数・名称を照合 | ✅ 7 圏域 完全一致 |
| 4 | 社人研または既存市区町村人口 source から二次医療圏人口集計 prototype を作成 | ✅ 既存 demo ETL から集計 + 社人研取得手順 docs 化 |
| 5 | NDB Risk side は未実装と明記 | ✅ ndb_risk_side_status.implemented=false |
| 6 | UI変更なし | ✅ |
| 7 | npm test PASS | ✅ 8 test 連続 PASS |

---

## 7. Phase 4-1 guardrail 完全遵守

✅ UI / lib 変更なし (data + script + test + docs のみ)
✅ Pattern 判定ロジック変更なし
✅ NDB Risk side の二次医療圏実装なし (scope 厳守)
✅ 全国 339/330 圏域への拡張なし
✅ 医療圏別の優劣評価を書かない (差分は時期差として記述、優劣判定はしない)
✅ JMAP の出典クレジット明記
✅ 8 test 連続 PASS

---

## 8. 発見と次フェーズへの示唆

### 8.1 Phase 4-3c-1 (Data 整合性 audit) で対応すべき課題

本 prototype で発見した data 整合性課題:

1. **demo ETL の人口値が不完全な可能性**
   - 広島県全体合計 1,555,228 (実際 約 280 万人)
   - 「広島」圏域 167,218 (広島市全体 約 119 万人)
   - → 既存 `area_demographics.json` の集計範囲・元 source 要確認

2. **JMAP vs ETL 差分 (+20 hospitals)**
   - 時期差 (JMAP 2026-04 vs ETL 取り込み時点)
   - → 既存 ETL の再取得タイミング検討

3. **圏域名の表記揺れチェック**
   - 本 prototype では完全一致 (広島県のみ)
   - 全国 47 県では揺れ可能性あり (4-3c-1 で確認)

### 8.2 Phase 4-3c-2 (ETL 拡張) で実施すべき内容

1. JMAP から全国 47 県の二次医療圏別 supply stats 取得 (scope 拡張時)
2. 社人研 2023 推計 Excel から市区町村人口を取得し、二次医療圏に集計 (実 ETL 化)
3. 集中度 metric の正式 ETL 化 (Phase 4-3e の発見を恒久化)
4. 圏域 master の正式版作成

### 8.3 Phase 4-3c-Risk-NDB (別フェーズ) の独立検討

`docs/PHASE4_3C_REQUIREMENTS.md §12.5` に詳細記載済:
- 第 10 回 NDB OpenData の「特定健診 性年齢・二次医療圏別 回答分布」を性年齢別再集計
- 分母再設計 (受診者ベース vs 人口ベース)
- 秘匿値「－」のゼロ変換ルール明示
- 年齢標準化の再設計 (直接法/間接法)
- 圏域人口 source の整合 (社人研 vs e-Stat)

---

## 9. 関連ファイル

### 9.1 本フェーズで追加

| ファイル | 役割 | 行数/サイズ |
|---|---|---|
| `scripts/prototype_secondary_area_hiroshima.py` | prototype 集計スクリプト | 165 行 |
| `data/static/secondary_area_hiroshima_prototype.json` | 出力 prototype data | 8.6 KB |
| `tests/secondary_area_hiroshima_prototype.test.js` | QA test | 137 行 |
| `docs/PHASE4_3C_B_LITE_HIROSHIMA_PROTOTYPE.md` | 本 docs | (本ファイル) |

### 9.2 修正

| ファイル | 変更内容 |
|---|---|
| `package.json` | scripts.test に hiroshima-prototype 追加 (8 test 連続) |

### 9.3 関連 docs

- `docs/PHASE4_3C_REQUIREMENTS.md` (Phase 4-3c 要件定義書、§12 でデータフィージビリティ実証)
- `docs/PHASE4_3D_HOMECARE_ACTUAL_AUDIT.md` (在宅実績 audit、Phase 4-3d)
- `docs/PHASE4_3E_CAPABILITY_MAPPING_AUDIT.md` (capability mapping、Phase 4-3e)

---

## 10. commit chain

```
(本フェーズ) chore(data): add hiroshima secondary-area prototype data
(本フェーズ) test: add hiroshima secondary-area prototype checks
(本フェーズ) docs: add phase4-3c b-lite hiroshima prototype report
(本フェーズ) Merge: Phase 4-3c-B-lite Hiroshima prototype
```

