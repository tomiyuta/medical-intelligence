# Phase 2D — 透析・人工腎臓データ availability audit (Case C 確定)

**作成日**: 2026-04-29  
**ステータス**: ✅ Case C (現状維持) で確定  
**関連commit**: `3d1d60f` (audit script), `8bd4710` (Layer 2 拡張)  
**audit script**: `scripts/audit_dialysis_data.py`

---

## 0. 結論

> NDB診療行為・処方薬からは透析/人工腎臓関連 proxy を確認できなかった。  
> 施設基準データの 6県サンプル では透析関連基準 9件 を確認したが、**47都道府県フルカバレッジではないため、Bridge 腎疾患の supply proxy には採用しない**。  
>
> 現時点では、腎疾患 Bridge の **医療利用 (utilization)・供給 (supply) proxy は「未整備」として維持** する。  
> 将来、kijun_shards 再ETL または cap.renal 追加が可能になった時点で再評価する。

---

## 1. audit 結果サマリ

| データソース | 透析関連件数 | 評価 |
|---|---|---|
| ndb_diagnostics (A_初再診/B_医学管理/C_在宅医療) | **0件** | ❌ Case A 不成立 (D_検査・処置等は NDB公開データに未収載) |
| ndb_prescriptions (薬効分類) | 0件 | 期待通り (透析は薬剤分類非該当) |
| **facility_standards (6県サンプル)** | **9件** | ⚠️ Case B 候補 (47県不完全) |
| NDB index HTML (408 xlsx) | 0件 | 専用xlsx非公開 |

### 確認できた施設基準 (9件、6県サンプルベース)

```
- 人工腎臓
- 在宅血液透析指導管理料
- 導入期加算１
- 導入期加算２及び腎代替療法実績加算
- 導入期加算３及び腎代替療法実績加算
- 慢性腎臓病透析予防指導管理料
- 糖尿病透析予防指導管理料
- 胎児胸腔・羊水腔シャント術
- 透析液水質確保加算及び慢性維持透析濾過加算
```

### 6県サンプル カバレッジ

| 県 | 透析届出施設 | 総施設 | 比率 |
|---|---|---|---|
| 三重 | 76 | 1,223 | 6.2% |
| 富山 | 46 | 659 | 7.0% |
| 岐阜 | 82 | 1,317 | 6.2% |
| 愛知 | 261 | 4,947 | 5.3% |
| 石川 | 49 | 739 | 6.6% |
| 静岡 | 158 | 2,279 | 6.9% |
| **合計** | **672** | **11,164** | **6.0%** |

---

## 2. Case 判断 (採択: C)

| Case | 内容 | 工数 | 採否 | 理由 |
|---|---|---|---|---|
| A | `cap.renal` を kijun_shards に追加 | 大 | **保留** | 元ETL再実行が必要 (レポジトリ外、user 介入要) |
| B | facility_standards 6県から `renal_supply_by_pref.json` 新規生成 | 中 | **不採用** | 47県比較の Bridge に 6県データを混ぜるのは危険 |
| **C** | **現状維持 + audit記録のみ** | 小 | **✅ 採択** | 誤読リスクが最も低い、v2 への布石になる |

### Case B を採用しない理由 (重要)

6県データを Bridge に入れると、UI上で「**腎疾患 supply proxy がある県とない県が混在する**」状態になる。これは、

- 実際に供給がない (proxyが0)
- データがない (測定不能)

の区別ができず、**Bridge の解釈仕様 (47県完全前提) に反する**。

---

## 3. peer review 遵守事項 (将来 Case A 実装時)

### ❌ やってはいけないこと

- 利尿剤 / RAS阻害薬を腎疾患治療 proxy にする (循環器・心不全と重複)
- 「腎不全死亡率が高い = 透析供給不足」と断定する
- 「透析proxy = 透析患者数」と表現する
- 「CKD患者数」「罹患率」「供給不足」断定

### ✅ 使うなら必ず proxy 表現

- 「人工腎臓算定 proxy」
- 「透析関連施設基準 proxy」

---

## 4. 関連ドキュメント

- `scripts/audit_dialysis_data.py` — audit 実装
- `docs/BRIDGE_V1_INTERPRETATION.md` — Bridge Risk Model v1 解釈仕様
- `docs/capability_mapping.md` — keyword taxonomy v1 (cap.renal 未定義)
- `lib/domainMapping.js` (renal section) — 現状の腎疾患領域定義
