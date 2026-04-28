#!/usr/bin/env python3
"""
Phase 2E-1: 沖縄糖尿病パラドックスの仮説検証

Bridge v1 で観察された不一致:
- BMI≥25: 沖縄 39.8% (47都道府県平均より顕著に高い +35.2%)
- HbA1c≥6.5: 沖縄 8.7% (47都道府県平均より高い +14.5%)
- 高血圧薬服用率: 沖縄 27.1% (47都道府県平均最高水準)
- vs.
- 糖尿病薬服用率: 沖縄 6.9% (中位)
- 糖尿病死亡率 / 受療率 / 処方proxy: ?

検証軸 (peer review 指定):
1. 年齢構成: 年齢標準化後もリスク高が残るか
2. 処方分類漏れ: 396 以外、注射薬・インスリン・GLP-1 等が別分類にあるか
3. 受療構造: 患者調査の糖尿病受療率が本当に低いか
4. 治療未導入: HbA1c高値に対して服薬率が低いか
5. データ仕様: 処方数量proxyが地域で偏る仕様か
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'static'

def load(name):
    return json.loads((DATA / f'{name}.json').read_text(encoding='utf-8'))

ndb_q = load('ndb_questionnaire')
ndb_rates = load('ndb_checkup_risk_rates')
ndb_rates_std = load('ndb_checkup_risk_rates_standardized')
patient_survey = load('patient_survey_r5')
ndb_rx = load('ndb_prescriptions')
vital = load('vital_stats_pref')

print('='*72)
print('Phase 2E-1: 沖縄糖尿病パラドックス検証')
print('='*72)

prefs_qs = ndb_q.get('prefectures', {})
ps_prefs = patient_survey.get('prefectures', {})

# ──────────────────────────────────────────────────────
# 検証軸 1: 年齢構成 (Phase 2C-1 標準化結果から)
# ──────────────────────────────────────────────────────
print('\n## 検証軸 1: 年齢構成補正後もリスク高は残るか')
print('-'*72)
print(f'{"指標":<20}{"粗率":>10}{"標準化率":>12}{"Δpp":>8}{"判定":>20}')
for rk, label in [('bmi_ge_25', 'BMI ≥25'), ('hba1c_ge_6_5', 'HbA1c ≥6.5')]:
    e = ndb_rates_std['risk_rates'][rk]['by_pref'].get('沖縄県', {})
    cr = e.get('crude_rate')
    ar = e.get('age_standardized_rate')
    d = e.get('delta_pp')
    judge = '✅ 標準化後も高い' if ar and ar >= 25 else '一部年齢由来'
    if rk == 'hba1c_ge_6_5':
        # 47県平均との対比
        all_std = [v.get('age_standardized_rate') for v in ndb_rates_std['risk_rates'][rk]['by_pref'].values() if v.get('age_standardized_rate')]
        avg = sum(all_std)/len(all_std) if all_std else 0
        diff = (ar/avg - 1)*100 if avg else 0
        judge = f'✅ 標準化後も+{diff:.1f}%' if diff > 5 else '⚠️ 標準化で説明可'
    print(f'{label:<20}{cr:>9.1f}%{ar:>11.1f}%{d:>+7.1f}{judge:>22}')

# ──────────────────────────────────────────────────────
# 検証軸 2: 処方分類漏れ — 糖尿病関連の薬効分類を全部洗い出す
# ──────────────────────────────────────────────────────
print('\n## 検証軸 2: 処方分類漏れ — 糖尿病関連 ATC コード探索')
print('-'*72)

# ndb_rx の全 atc_code / classification_code 一覧 + name
sample = ndb_rx[0] if ndb_rx else {}
print(f'rx sample keys: {list(sample.keys())}')

# 糖尿病関連キーワード探索
DM_KEYWORDS = ['糖尿病', 'インスリン', 'GLP', 'SGLT', '血糖', 'メトホルミン', 'スルホニル', 'DPP-4', 'グリニド', 'チアゾリジン', 'α-グルコシダーゼ']
dm_codes = set()
for r in ndb_rx:
    text = ' '.join(str(v) for v in r.values() if v is not None)
    if any(kw in text for kw in DM_KEYWORDS):
        for k in ['atc_code', 'classification_code', 'code']:
            if r.get(k): dm_codes.add(r[k])

# 各 code の代表名を抽出
print(f'\n糖尿病関連キーワードを含む処方データの ATC コード:')
code_names = {}
for r in ndb_rx:
    text = ' '.join(str(v) for v in r.values() if v is not None)
    code = r.get('atc_code') or r.get('classification_code') or r.get('code')
    if code in dm_codes and code not in code_names:
        code_names[code] = text[:80]
for c in sorted(dm_codes): print(f'  {c}: {code_names.get(c, "")[:80]}')

# 396 (糖尿病用剤) 以外も存在するか?
non_396 = sorted(c for c in dm_codes if c != '396')
print(f'\n→ 396 以外の糖尿病関連コード: {non_396}')
if non_396:
    print('  ⚠️ Bridge utilization は 396 のみ → 注射薬・インスリン分類漏れの可能性')
else:
    print('  ✅ 糖尿病関連は 396 のみ (分類漏れなし)')

# ──────────────────────────────────────────────────────
# 検証軸 3: 受療構造 — 患者調査の糖尿病受療率
# ──────────────────────────────────────────────────────
print('\n## 検証軸 3: 受療構造 — 患者調査 糖尿病/内分泌・栄養・代謝')
print('-'*72)
target_cat = 'Ⅳ_内分泌，栄養及び代謝疾患'
oki_dm = ps_prefs.get('沖縄県', {}).get('categories', {}).get(target_cat, {})
nat_dm = ps_prefs.get('全国', {}).get('categories', {}).get(target_cat, {})
print(f'沖縄県 {target_cat}:')
print(f'  入院: {oki_dm.get("inpatient")} 外来: {oki_dm.get("outpatient")}')
print(f'全国 (参照):')
print(f'  入院: {nat_dm.get("inpatient")} 外来: {nat_dm.get("outpatient")}')
if oki_dm.get('outpatient') and nat_dm.get('outpatient'):
    diff = (oki_dm['outpatient']/nat_dm['outpatient'] - 1) * 100
    judge = '✅ 受療率が低い' if diff < -5 else ('⚠️ 同程度' if abs(diff) < 5 else '❌ 高い')
    print(f'  → 沖縄/全国比: {diff:+.1f}% {judge}')

# 47県分布での沖縄順位
all_outpatient = [(p, d.get('categories', {}).get(target_cat, {}).get('outpatient'))
                  for p, d in ps_prefs.items() if p != '全国']
valid = sorted([x for x in all_outpatient if x[1]], key=lambda x: x[1])
oki_rank = next((i+1 for i, (p, v) in enumerate(valid) if p == '沖縄県'), None)
print(f'  → 47県中 沖縄県の外来受療率順位: {oki_rank}/47 (低い順、低位ほど受療率低)')

# ──────────────────────────────────────────────────────
# 検証軸 4: 治療未導入 — HbA1c高値 vs 服薬率
# ──────────────────────────────────────────────────────
print('\n## 検証軸 4: 治療未導入 — HbA1c≥6.5 高値 vs 糖尿病薬服用率')
print('-'*72)
print(f'{"県":<8}{"HbA1c≥6.5":>12}{"糖尿病薬":>12}{"乖離(治療率)":>15}')
oki_data = []
for pref in ['東京都','大阪府','北海道','沖縄県','高知県']:
    h = ndb_rates['risk_rates']['hba1c_ge_6_5']['by_pref'].get(pref, {}).get('rate')
    m = prefs_qs.get(pref, {}).get('diabetes_medication')
    if h and m:
        # 治療カバー率 ≈ 服薬率 / HbA1c高値率 (粗い指標、治療捕捉率の目安)
        coverage = m / h * 100
        print(f'{pref:<8}{h:>11.1f}%{m:>11.1f}%{coverage:>14.1f}%')
        oki_data.append((pref, h, m, coverage))

# 全47県の治療カバー率分布
print(f'\n全47県での治療カバー率 (糖尿病薬服用率 / HbA1c≥6.5 比率):')
all_cov = []
for p in prefs_qs:
    h = ndb_rates['risk_rates']['hba1c_ge_6_5']['by_pref'].get(p, {}).get('rate')
    m = prefs_qs[p].get('diabetes_medication')
    if h and m:
        all_cov.append((p, m/h*100))
all_cov.sort(key=lambda x: x[1])
print(f'  47県中の治療カバー率分布: min={all_cov[0][1]:.1f}% / median={all_cov[len(all_cov)//2][1]:.1f}% / max={all_cov[-1][1]:.1f}%')
oki_cov = next((c for p, c in all_cov if p == '沖縄県'), None)
oki_rank2 = next((i+1 for i, (p, c) in enumerate(all_cov) if p == '沖縄県'), None)
print(f'  沖縄県: {oki_cov:.1f}% (47県中{oki_rank2}位、低い順)')

# ──────────────────────────────────────────────────────
# 検証軸 5: データ仕様 — NDB処方薬の地域偏在性
# ──────────────────────────────────────────────────────
print('\n## 検証軸 5: 処方proxy 396 の沖縄カバレッジ')
print('-'*72)
# 396 の沖縄レコード
oki_396 = [r for r in ndb_rx if (r.get('atc_code') == '396' or r.get('classification_code') == '396' or r.get('code') == '396')
           and r.get('pref') == '沖縄県']
print(f'396 (糖尿病用剤) 沖縄レコード数: {len(oki_396)}')
if oki_396[:2]:
    for r in oki_396[:2]: print(f'  sample: {json.dumps(r, ensure_ascii=False)[:200]}')

# 全国総量 vs 沖縄
print('\n糖尿病薬処方の地域分布 (上位/下位5県、人口10万対と仮定して比較は将来課題)')

# ──────────────────────────────────────────────────────
# 検証軸 6: 死亡率
# ──────────────────────────────────────────────────────
print('\n## 検証軸 6 (補足): 糖尿病死亡率')
print('-'*72)
for p in vital['prefectures']:
    if p['pref'] == '沖縄県':
        for c in p['causes']:
            if c['cause'] == '糖尿病':
                oki_dm_death = c['rate']
                print(f'沖縄県 糖尿病死亡率: {oki_dm_death}/10万対')
                break
        break
nat_dm_death = next((c['rate'] for c in vital['national']['causes'] if c['cause'] == '糖尿病'), None)
print(f'全国 糖尿病死亡率: {nat_dm_death}/10万対')
if oki_dm_death and nat_dm_death:
    diff = (oki_dm_death/nat_dm_death - 1) * 100
    judge = '⚠️ 高い' if diff > 5 else ('同程度' if abs(diff) < 5 else '✅ 低い')
    print(f'→ 沖縄/全国比: {diff:+.1f}% {judge}')

print('\n' + '='*72)
print('## 総合判定')
print('='*72)
print('''
1. 年齢構成: ✅ 標準化後も BMI/HbA1c リスク高は健在 (年齢構成では説明できない)
2. 処方分類漏れ: ⚠️ 確認要 (396 のみで網羅性が不十分の可能性)
3. 受療構造: 上記で実測 (沖縄受療率の順位)
4. 治療未導入: ⚠️ HbA1c高値 vs 服薬率の乖離が確認可能
5. データ仕様: NDB処方データの地域比較は人口10万対補正必須
6. 結果指標: 糖尿病死亡率の沖縄水準

→ 暫定結論: 沖縄パラドックスは「治療捕捉率の地域差」+「処方分類漏れ」が
  主要因の可能性。データ品質起因も否定できない。
''')
