# Bridge Risk Model v1 — 解釈仕様

**更新日**: 2026-04-28  
**対象**: Disease Supply-Demand Bridge (NdbView Layer 6)  
**ファイル**: `lib/domainMapping.js`, `app/components/views/DomainSupplyDemandBridge.jsx`

---

## 1. v0 FROZEN 解除と v1 への移行

### 判断
Bridge v0 (commit 475a174) の FROZEN を **明示的に解除** し、Bridge Risk Model v1 へ移行する。

### 解除の理由
v0 は循環器・糖尿病・がんの3領域について risk/demand/utilization/supply/outcome の解釈仕様を固定したものであった。NDB特定健診・質問票データの追加取得 (Phase 1) により、疾患領域ごとの risk proxy が **単一指標では不十分** であることが明確になった。

risk定義そのものの構造変更 (`risk` → `risks[]`) は表示項目の追加ではなく **Bridge core の解釈仕様改訂** である。FROZEN v0 を維持したまま後方互換拡張として扱うのは不適切のため、改訂として明示記録する。

### 変更内容

| 項目 | v0 | v1 |
|---|---|---|
| risk フィールド | 単一 `risk: { ... }` | 複数 `risks: [{ ... }, ...]` |
| データソース | `ndbQKey` (質問票) または `ndbHcMetric` (健診平均値) | + `riskKey` (NDB健診リスク該当者率) |
| legacy データ | — | `legacy: true` で保持 |
| UI表示 | 1セル1指標 | 1セル複数指標 (区切り線あり) |

---

## 2. risks[] スキーマ

```typescript
type RiskProxy = {
  source: 'ndbQ' | 'ndbHc' | 'ndbCheckupRiskRate';
  ndbQKey?: string;       // NDB質問票キー (Q1-Q22)
  ndbHcMetric?: string;   // NDB健診平均値メトリック (eGFR等)
  riskKey?: string;       // NDB健診リスク該当者率キー (bmi_ge_25 等)
  label: string;
  unit: string;
  direction: 'higher_worse' | 'higher_better' | 'higher_more';
  note: string;
  legacy?: true;          // v0からの継承
};
```

---

## 3. 6領域の risks[] 構成

| 領域 | risks[] | データ源泉 |
|---|---|---|
| 循環器 | SBP≥140 / LDL≥140 / 高血圧薬 / 脂質薬 / 喫煙(legacy) | 健診率3 + 質問票3 |
| 糖尿病・代謝 | HbA1c≥6.5 / BMI≥25 / 糖尿病薬 / 体重増加(legacy) | 健診率2 + 質問票2 |
| がん | 喫煙(legacy) / 多量飲酒 | 質問票2 |
| 脳血管 (exp) | SBP≥140 / 脳卒中既往 / 喫煙(legacy) | 健診率1 + 質問票2 |
| 呼吸器 (exp) | 喫煙(legacy) | 質問票1 |
| 腎疾患 (exp) | 尿蛋白1+ / eGFR(legacy) / CKD既往 | 健診率1 + 健診平均1 + 質問票1 |

---

## 4. 継承する v0 原則 (変更なし)

以下の v0 原則は v1 でも完全に継承する:

- **受療率 ≠ 罹患率**: 患者調査の受療率は医療機関にかかった患者の集計であり、有病率や罹患率ではない
- **処方薬proxy ≠ 患者数**: NDB処方量は薬剤量であり、治療人数ではない
- **供給proxy ≠ 疾患専用供給**: bedFunc/cap キーは疾患非特異的な代理指標
- **死亡率 ≠ 医療の優劣**: vital_stats causes は粗死亡率で年齢構成の影響を強く受ける
- **Bridge ≠ 異常検出システム**: 仮説生成装置であり、政策判断や個別評価ツールではない

---

## 5. v1 で禁止される変更

- ❌ 47県平均と独立な閾値による「リスク該当県」断定
- ❌ 複数 risk を合成したスコア化 (Phase 2 以降で別 commit 検討)
- ❌ 「罹患率」「供給不足」「医療の質」等の断定表現

## 6. v1 で許可される変更

- ✅ risks[] への新規追加 (Phase 2 健診項目拡張時)
- ✅ legacy フラグ付き要素の保持 (削除しない)
- ✅ source/note/direction の文言修正
- ✅ direction 'higher_better' (eGFR等) の正確な処理

---

## 7. 次の v2 候補 (将来)

| # | 候補 | 工数 | 優先度 |
|---|---|---|---|
| 1 | 年齢階級別データ保持 → 標準化死亡率/リスク率 | 大 | 高 |
| 2 | 二次医療圏別リスク率 (現在は都道府県別のみ) | 大 | 中 |
| 3 | 検査値 26項目フル取得 (現在5項目) | 中 | 中 |
| 4 | NDB透析・人工腎臓 (J038/J039) 追加 → 腎疾患 utilization 整備 | 中 | 中 |
| 5 | 施設基準の疾患専用 capability 抽出 (透析/糖尿病/呼吸器) | 大 | 中 |
| 6 | risks[] のスコア化・統合指標 (Phase 2 慎重判断) | 中 | 低 |
