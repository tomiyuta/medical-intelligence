# Capability Mapping (10カテゴリ) — skeleton

**作成日**: 2026-04-28
**ステータス**: **skeleton (Phase 2 未完成)** — ETLからのマッピング表抽出待ち
**目的**: 施設基準届出データを 10カテゴリの capability に変換するマッピング仕様の文書化

---

## 0. 本書の性質

> 本ドキュメントは **暫定 skeleton** であり、ETL内部にハードコードされている
> 「施設基準コード → capabilityカテゴリ」 のマッピング表は**未抽出**です。
>
> Phase 2 で内製 ETL からの export を行い、本書を**正式仕様**に格上げします。
> 現時点では、各カテゴリの定義・含めるもの・含めないものの**枠組みのみ**を記述。

なぜこの文書が重要か:
- `top_facilities.json` の `cap` フィールド (10カテゴリ数値) と
- `facility_standards` シャードの `caps` フィールド
の両方で、各カテゴリの構成施設基準コード一覧が**ブラックボックス**になっている。

ユーザーが `cap.oncology=26` の意味を検証するには、本マッピング表が必須。

---

## 1. 10カテゴリ定義 (skeleton)

| カテゴリ | UI表示 | 想定意味 | 構成施設基準 (Phase 2で確定) |
|---|---|---|---|
| `imaging` | 画像診断 | CT/MRI/PET 等の画像診断・撮影体制 | _未抽出_ |
| `surgery` | 手術 | 手術室・周術期管理・術中麻酔 | _未抽出_ |
| `acute` | 急性期/救急 | 救急医療・特定集中治療室・急性期入院料 | _未抽出_ |
| `rehab` | リハビリ | 回復期リハ・脳卒中・運動器・心大血管 | _未抽出_ |
| `homecare` | 在宅医療 | 在宅療養支援・在宅時医学総合管理・往診 | _未抽出_ |
| `oncology` | がん | 外来化学療法・放射線治療・緩和ケア・がん性疼痛 | _未抽出_ |
| `psychiatry` | 精神 | 精神科入院料・身体合併症・認知療法 | _未抽出_ |
| `pediatric` | 小児/周産期 | 小児入院・新生児集中治療・産科 | _未抽出_ |
| `infection` | 感染対策 | 感染対策向上加算・抗菌薬適正使用 | _未抽出_ |
| `dx_it` | DX/IT | 医療DX推進体制・電子化加算・オンライン診療 | _未抽出_ |

---

## 2. proxy 解釈の注意 (重要)

各 capability は**届出件数の集計値**であり、以下を**意味しない**:

### 2.1 `oncology` ≠ がん診療連携拠点病院
- `cap.oncology` 数値は化学療法・放射線治療等の届出基準カウント
- 「がん診療連携拠点病院」「地域がん診療病院」のステータスは別データ
- 例: `cap.oncology=26` でも拠点指定なしの可能性

### 2.2 `surgery` ≠ 高度手術実績
- 手術室・周術期管理の届出件数
- 心臓外科・移植・ロボット支援等の高度手術実績は含まれない

### 2.3 `acute` ≠ 救急受入実績
- 救命救急センター指定・三次救急の指定とは異なる
- 特定集中治療室管理料等の届出基準ベース

### 2.4 `rehab` ≠ リハ実績
- 回復期リハ病棟入院料等の届出件数
- リハ単位数・FIM改善実績等のアウトカムは含まれない

### 2.5 `homecare` ≠ 在宅酸素実施施設
- 在宅療養支援病院・診療所の届出
- 在宅酸素・在宅人工呼吸等の個別療法実施は別

### 2.6 `psychiatry` ≠ 精神科専門病院
- 精神科入院料・身体合併症加算等の届出
- 措置入院・精神保健指定医配置等は別

### 2.7 `pediatric` ≠ NICU実績
- 小児入院医療管理料・新生児特定集中治療室管理料の届出
- 周産期母子医療センター指定とは異なる

### 2.8 `infection` ≠ 感染症指定医療機関
- 感染対策向上加算 (1/2/3) 等の届出件数
- 第一種・第二種感染症指定医療機関とは別

### 2.9 `dx_it` ≠ 完全電子カルテ普及度
- 医療DX推進体制整備加算等の届出
- 電子カルテ導入率・データ標準化レベルは含まれない

---

## 3. 統計値 (top_facilities.json 観測ベース)

各カテゴリの分布 (n=2,802 施設):

| カテゴリ | median | mean | max |
|---|---|---|---|
| oncology | 8 | 10.1 | 41 |
| imaging | 4 | 10.3 | 78 |
| surgery | 4 | 8.0 | 40 |
| psychiatry | 2 | 3.2 | 41 |
| rehab | 5 | 5.4 | 22 |
| acute | 4 | 5.0 | 37 |
| homecare | 3 | 3.8 | 13 |
| pediatric | 3 | 2.9 | 12 |
| dx_it | 3 | 2.7 | 12 |
| infection | 1 | 1.6 | 5 |

**観察**:
- `imaging` の max=78 は非常に高い → 大学病院クラスで多種の届出
- `infection` の median=1 → 多くの施設は感染対策の最低限届出のみ
- `psychiatry` max=41 は精神科専門病院の影響と推測

---

## 4. UI上の取扱い (Bridge / FacilityExplorer)

### 4.1 FacilityExplorer
- Tab 1 (届出ベース) の capability filter は 10カテゴリで絞り込み
- 詳細パネルに `cap.{key}: {数値}` を降順表示
- Tier S/A/B施設のフィルタとして補助使用

### 4.2 Bridge v0/v1 (NdbView Layer 6)
- 供給proxyの一部として使用
- 「※○○専用ではない」proxyラベルで明示
  - 例: 循環器供給 = 「急性期・手術系供給proxy」(cap.surgery+acute)

---

## 5. Phase 2 課題

### 5.1 ETL マッピング抽出
- 内製 ETL コードから施設基準コード一覧を export
- 各カテゴリに含まれるコードを完全リスト化
- 含めない判断 (例: 緩和ケア病棟 vs 緩和ケア外来) の根拠を記録

### 5.2 公式指定との対応表
- がん拠点病院 vs cap.oncology
- 救命救急センター vs cap.acute
- 周産期母子医療センター vs cap.pediatric
- 等の公式指定との対応・乖離を別表化

### 5.3 capability の重み付け検討
- 現状: 単純な届出件数の合算
- 検討: 重要度の高い基準への重み付け (例: 外来化学療法加算 vs 緩和ケア外来)
- ただし重み付けは恣意的になるリスクあり

---

## 6. 参考: 関連ファイル

- `data/static/top_facilities.json` `cap` フィールド (10カテゴリ × 2,802施設, **Tier S/A/B のみ**)
- `data/static/kijun_shards/{pref}.json` `cap` フィールド (10カテゴリ × ~2,000施設/県, **Tier S/A/B/C/D/未評価**)
- データセット間の Tier coverage 差は `docs/priority_score_methodology.md §Tier coverage` 参照
- `app/components/views/FacilityExplorerView.jsx` `CAT_LABELS` / `CAT_COLORS` 定数
- `app/api/facility-standards/route.js` `CAT_LABELS` (同期定義)
- `lib/domainMapping.js` Bridge供給proxyでの参照
- `docs/priority_score_methodology.md` cap_sum を priority_score の構成因子として使用

---

## 7. 改訂履歴

| 日付 | 変更 |
|---|---|
| 2026-04-28 | skeleton 初版 (peer review Phase A Priority 4) |

---

**End of skeleton**

> 本書は capability_mapping の枠組みのみを記述する skeleton です。
> Phase 2 で ETL から実マッピング表をexportし、各カテゴリの構成施設基準コード一覧を確定させます。
> それまでは、UI上で "cap.{category}" の数値を解釈する際は本書 §2 の注意事項を必ず参照してください。
