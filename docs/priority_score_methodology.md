# priority_score Observed Methodology — 観測ベース逆算分析

**作成日**: 2026-04-28 **対象**: `data/static/top_facilities.json` の `priority_score` および `tier` フィールド **目的**: peer review に向けた内製スコアの透明性確保 **ステータス**: **暫定 (Phase 2)** — ETL内部の正式な式・重みは未開示

---

## 🚨 本ドキュメントの性質 — 必ず読むこと

> 本ドキュメントは `top_facilities.json` の **観測値から priority_score の性質を逆算・分析した** ものであり、
> ETL内部の正確な **算出式・重みを保証するものではありません**。
>
> - ❌ 内部実装の式の写しではない
> - ❌ 「9因子」と呼称される因子の正確な定義は未確認
> - ❌ 重み係数 (w1, w2, ...) の値は不明
> - ✅ 既存データから観測される相関・閾値・分布の記述
> - ✅ peer reviewer に対する暫定的な透明性開示
>
> 内部実装からの正式仕様書化は Phase 2 課題。本書は実装変更により陳腐化する可能性があります。

---

## ⚠️ 重要な前提

`priority_score` および `tier` は本サイト独自の **内製複合指標** であり、厚労省・公的機関による公式ランキングではありません。

- ❌ 公式 DPC 評価ランキングではない
- ❌ 病院機能評価機構の認定スコアではない
- ❌ 患者満足度・医療の質指標ではない
- ✅ 規模・実績・基準充足度を組み合わせた**内製の複合プロキシ指標**

施設探索の補助として参照することを推奨。地域医療政策の評価には R6 病床機能報告 (RegionalBedFunctionView) を使用。

---

## 1. データ構造

`top_facilities.json` 全 **2,802 施設** が priority_score を保持 (priority_score &lt; 30.0 は本ファイルに含まれない、つまり Tier C/D は範囲外)。

フィールド型説明`priority_score`number内製複合スコア (実測値: 30.0 - 68.5)`tier`"S"/"A"/"B"スコア閾値による5段階分類 (C/D は本ファイル対象外)`rank`number全国順位 (priority_score 降順)`reasons`string\[\]スコア加点理由のラベル化`missing`string\[\]欠損データの記録`confidence`"High"/"Medium"/"Low"データ充足度`cap`object10 カテゴリの capability スコア

---

## 2. Tier 境界 (実測値, 2026-04-28 確認)

データから逆算:

Tierpriority_score 範囲件数平均想定意味S≥ 60.02262.5全国トップクラス (大学病院・特定機能病院級)A45.0 ≤ s &lt; 60.028049.4地域中核病院・大規模 DPC 病院B30.0 ≤ s &lt; 45.02,50035.1DPC 参加病院・標準的な急性期病院C/D&lt; 30.0(本ファイル対象外)—範囲外

**閾値 60/45/30 の根拠**: 不明 (経験則と推測)。peer reviewer から統計的根拠 (z-score, percentile, etc.) を求められる可能性高。

---

## 3. priority_score 構成因子 (相関分析より逆算)

`top_facilities.json` 2,802 施設での Pearson 相関係数:

因子フィールドr (vs priority_score)寄与度1`annual_cases` (DPC年間症例数)**0.877最大**2`total_beds` (許可病床数)**0.804**大3`cap_sum` (10カテゴリ capability 合計)0.547中4`is_dpc_participant` (DPC参加 0/1)0.511中5`avg_los` (平均在院日数)0.155小6`case_growth_pct` (症例成長率)0.023ほぼ無

**観察**: 上位2因子 (年間症例 + 病床数) で全体の8〜9割を説明。3〜4因子目 (capability + DPC参加) で補完。残りはほぼノイズ。

「9因子」と呼称されてきたが、実質的な signal を持つ因子は **4〜5個** である可能性が高い。

---

## 4. 加点ロジックの推測 (reasons配列より)

`reasons` 配列の頻度分析:

ラベル出現件数出現率推測される閾値DPC参加1,54755.2%binary200床超1,11339.7%total_beds ≥ 200短期在院99435.5%avg_los &lt; 12 (推測)500床超28810.3%total_beds ≥ 500症例1万超2789.9%annual_cases ≥ 10000症例2万超240.9%annual_cases ≥ 200001000床超200.7%total_beds ≥ 1000成長+x%散発&lt;1% eachcase_growth_pct &gt; 0

**推測される加点モデル** (実装は未確認):

```
priority_score ≈ base
  + (annual_cases / 1000) * w1
  + (total_beds / 100) * w2
  + sum(cap[k]) * w3
  + 5 * is_dpc_participant
  + (12 - avg_los) * w4   # 短期在院が高評価
  + max(0, case_growth_pct) * w5
  + 段階的ボーナス (200/500/1000床超, 症例1万/2万超)
```

w1〜w5 の正確な値は内部実装にあり、本書では特定不能。

---

## 5. capability スコア (10カテゴリ)

`cap` フィールドには 10 カテゴリの数値が含まれる (届出件数の積み上げと推測):

カテゴリmedianmeanmax想定対応oncology810.141がん診療連携拠点・化学療法等imaging410.378CT/MRI/PET 等画像診断surgery48.040手術室・周術期管理psychiatry23.241精神科入院料・身体合併症rehab55.422回復期リハ・脳卒中リハacute45.037救急・特定集中治療室homecare33.813在宅療養支援・往診pediatric32.912小児入院・周産期医療dx_it32.712医療DX・電子化加算infection11.65感染対策向上加算

**未文書化**: 各カテゴリに紐づく**具体的な施設基準コード一覧**は前処理 ETL にハードコードされており、本書の対象外。

---

## 6. 欠損データの取扱い

`missing` 配列の出現頻度:

欠損項目件数出現率DPC実績なし1,25544.8%成長率不明44615.9%症例数非開示42915.3%在院日数不明42915.3%

**欠損時の policy** (推測): 該当因子は 0 または median で埋めて計算。詳細な imputation ルールは内部実装にあり、本書では特定不能。

`confidence` フィールド:

- `High`: 5 因子中 4 以上が揃う
- `Medium`: 2-3 因子
- `Low`: 1 因子以下

---

## 7. 既知の限界と peer review focal points

### 7.1 構造的限界

#項目影響度L19因子のうち実 signal は 4〜5 因子のみ高 (再現性)L2重み w1〜w5 が未文書化高L3Tier 境界 60/45/30 の根拠が経験則中L4欠損 imputation policy が未文書化中L5priority_score &lt; 30 の施設は本データに含まれない高 (偏向リスク)L6annual_cases r=0.877 の偏重で「規模が大きい=良い病院」になりがち**本質的**L7患者満足度・医療の質などのアウトカム要素を含まない**本質的**

### 7.2 偏向リスク (重要)

priority_score の主成分が **annual_cases (r=0.877) と total_beds (r=0.804)** であるため、本指標は実質的に「**規模スコア**」に近い。

- 大規模急性期病院 → 高 score (偏重)
- 専門特化型小病院 (高機能だが症例少) → 低 score (過小評価)
- 在宅・慢性期型病院 → 評価対象外傾向

**推奨される利用法**:

- 「症例数の多い大規模 DPC 病院」を探す指標として使用
- 「医療の質」「患者アウトカム」を表す指標として**使わない**
- 専門領域別の評価には capability スコアと併用

### 7.3 Phase 2 課題

1. **9因子の式・重みの完全開示** — 内部実装からエクスポート
2. **Tier 境界の統計的根拠** — z-score / percentile 化
3. **欠損 imputation の明文化** — どの因子をどう埋めているか
4. **規模偏重の補正** — annual_cases / total_beds の対数変換 or 標準化
5. **アウトカム指標の追加** — 死亡率・再入院率・機能改善率 (利用可能なら)
6. **priority_score &lt; 30 施設の取り込み** — 全 90,215 施設で再ランキング

---

## 8. UI 上の表示原則

本サイト (MedIntel) では以下の原則で priority_score / Tier を扱う:

✅ **やる**:

- 「内製複合指標」バッジを必ず併記
- FacilityExplorer **スコア説明タブ** で本書へのリンクまたは要約を提供
- capability を主軸に施設を探させ、Tier は補助列に降格

❌ **やらない**:

- "公式ランキング" のような表現
- "Tier S = 最良の病院" のような断定
- 政策評価 (RegionalBedFunctionView) で priority_score を使用
- ランキング順での絞り込みを唯一の検索手段にする

---

## 9. 参考: 検証用クエリ

本書記載の数値を再現するスクリプト:

```python
import json
from collections import defaultdict, Counter
import statistics

with open('data/static/top_facilities.json') as f:
    arr = json.load(f)['data']

# Tier境界
by_tier = defaultdict(list)
for f in arr:
    by_tier[f['tier']].append(f['priority_score'])
for t, scores in sorted(by_tier.items()):
    print(f'Tier {t}: n={len(scores)}, range={min(scores):.1f}-{max(scores):.1f}, mean={sum(scores)/len(scores):.1f}')

# 因子相関 (Pearson)
def corr(xs, ys):
    n = len(xs); mx, my = sum(xs)/n, sum(ys)/n
    num = sum((x-mx)*(y-my) for x,y in zip(xs,ys))
    den = (sum((x-mx)**2 for x in xs))**0.5 * (sum((y-my)**2 for y in ys))**0.5
    return num/den if den else None

ps = [f['priority_score'] for f in arr]
for fld in ['total_beds', 'annual_cases', 'avg_los', 'case_growth_pct', 'is_dpc_participant']:
    vals = [f.get(fld) or 0 for f in arr]
    print(f'  {fld:20} r = {corr(ps, vals):.3f}')
```

---

**End of methodology**

---

## 改訂履歴

| 日付 | 変更 |
|---|---|
| 2026-04-28 | 初版作成 (top_facilities.json 観測ベース逆算分析) |
| 2026-04-28 | 冒頭 disclaimer 強化 (peer review feedback反映) |

> 本書は priority_score の **観測ベース逆算分析** であり、内部実装の正式仕様書ではありません。
> Phase 2 で内部実装からの **正式な spec exporter** を作成予定。
> 本書の数値・解釈は実装変更により陳腐化する可能性があります。
