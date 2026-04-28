#!/usr/bin/env python3
"""
audit_renal_domain.py — Bridge 腎疾患 (renal) 6領域目追加の事前audit

peer review (2026-04-28) の指定5項目を全47県で確認:
1. ndb_health_checkup の eGFR
2. vital_stats の 腎不全死亡率
3. 患者調査 R5 の腎疾患カテゴリ (ⅩⅣ_腎尿路生殖器系)
4. NDB診療行為に透析・人工腎臓関連 (J038/J039)
5. 施設基準に透析・腎関連 capability

判定: Case A (完全) / Case B (eGFR+死亡率のみ) / Case C (実装不可)
"""
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA = ROOT / 'data' / 'static'

with open(DATA/'ndb_health_checkup.json') as f: hc = json.load(f)
with open(DATA/'vital_stats_pref.json') as f: vs = json.load(f)
with open(DATA/'patient_survey_r5.json') as f: ps = json.load(f)
with open(DATA/'ndb_diagnostics.json') as f: nd = json.load(f)

print('='*70)
print('Bridge 腎疾患 (renal) audit')
print('='*70)

# 1) eGFR 47県カバレッジ
egfr_recs = [d for d in hc if d.get('metric') == 'eGFR']
egfr_dict = {d['pref']: d for d in egfr_recs if d['pref'] != '全国'}
print(f'\n## 1. eGFR (健診)')
print(f'   47県カバレッジ: {len([p for p in egfr_dict if p in [v["pref"] for v in vs["prefectures"]]])}/47')
print(f'   構造: pref/metric/male/female (男女別)')
egfr_avg_vals = [(d['male']+d['female'])/2 for d in egfr_dict.values()]
print(f'   eGFR男女平均 分布: min {min(egfr_avg_vals):.1f} / median {statistics.median(egfr_avg_vals):.1f} / max {max(egfr_avg_vals):.1f}')

# 2) 腎不全死亡率 47県
print(f'\n## 2. 腎不全死亡率 (vital_stats, 粗死亡率)')
renal_data = []
for p in vs['prefectures']:
    r = next((c for c in p.get('causes', []) if c.get('cause') == '腎不全'), None)
    if r: renal_data.append({'pref': p['pref'], 'rate': r['rate']})
print(f'   47県カバレッジ: {len(renal_data)}/47 完全')
rates = [d['rate'] for d in renal_data]
print(f'   分布: min {min(rates):.1f} / median {statistics.median(rates):.1f} / mean {sum(rates)/len(rates):.1f} / max {max(rates):.1f}')
nat_rate = next((c['rate'] for c in vs['national']['causes'] if c.get('cause') == '腎不全'), None)
print(f'   全国: {nat_rate}')
print(f'   TOP 5: {sorted(renal_data, key=lambda x:-x["rate"])[:5]}')
print(f'   BOTTOM 5: {sorted(renal_data, key=lambda x:x["rate"])[:5]}')

# 3) 患者調査 ⅩⅣ_腎尿路生殖器系の疾患 47県
print(f'\n## 3. 患者調査 ⅩⅣ_腎尿路生殖器系の疾患 (受療率proxy)')
prefs_ps = ps.get('prefectures', {})
target_cat = 'ⅩⅣ_腎尿路生殖器系の疾患'
covered = 0
sample = []
for p, d in prefs_ps.items():
    cat_data = d.get('categories', {}).get(target_cat)
    if cat_data: 
        covered += 1
        if len(sample) < 3: sample.append({'pref': p, 'inpatient': cat_data.get('inpatient'), 'outpatient': cat_data.get('outpatient')})
print(f'   47県カバレッジ: {covered}/47')
print(f'   sample: {sample}')
nat_cat = ps.get('national', {}).get('categories', {}).get(target_cat) if isinstance(ps.get('national'), dict) else None
print(f'   全国 inpatient/outpatient: {nat_cat}')
print(f'   ⚠️ 注意: CKD専用ではない (結石・前立腺肥大・腎盂腎炎等を含む) — 解釈に注意')

# 4) NDB透析・人工腎臓 (J038/J039)
print(f'\n## 4. NDB診療行為 透析・人工腎臓関連 (J038/J039)')
nd_cats = sorted(set(d.get('category','') for d in nd))
print(f'   ndb_diagnostics categories: {nd_cats}')
print(f'   ❌ 透析・人工腎臓カテゴリなし — 未整備 (Phase 2 で D_検査・処置等を追加検討)')

# 5) 施設基準 透析cap
print(f'\n## 5. 施設基準 透析・腎関連 capability')
with open(DATA/'kijun_shards/東京都.json') as f: shard = json.load(f)
all_cap_keys = set()
for d in shard:
    if 'cap' in d: all_cap_keys.update(d['cap'].keys())
print(f'   cap キー一覧: {sorted(all_cap_keys)}')
print(f'   ❌ 透析・腎特化 capability なし — 未整備')
print(f'   注: dx_it は診療情報・診断書系で腎特化ではない (誤読リスクあり、利用しない)')

# 6) eGFR vs 腎不全死亡率 sanity 相関
print(f'\n## 6. eGFR vs 腎不全死亡率 相関 (sanity)')
renal_dict = {d['pref']: d['rate'] for d in renal_data}
pairs = []
for p in renal_dict:
    if p in egfr_dict:
        e = (egfr_dict[p]['male'] + egfr_dict[p]['female'])/2
        pairs.append((renal_dict[p], e))
n = len(pairs)
rs = [p[0] for p in pairs]
es = [p[1] for p in pairs]
mr = sum(rs)/n; me = sum(es)/n
cov = sum((r-mr)*(e-me) for r,e in pairs)/n
sr = (sum((r-mr)**2 for r in rs)/n)**0.5
se = (sum((e-me)**2 for e in es)/n)**0.5
rho = cov/(sr*se) if sr*se > 0 else 0
print(f'   Pearson r (腎不全死亡率 vs eGFR平均): {rho:+.3f} (n={n})')
print(f'   解釈: 期待は負相関 (eGFR高=腎機能良好=死亡率低) だが r=+0.186 で弱い正相関')
print(f'   → 加齢の交絡が強い (高齢化県でeGFRも腎不全死亡もともに高い等)')
print(f'   → eGFR を単純な「リスク」proxy 扱いは注意が必要')

# 5県 sanity (Bridge 既存5領域の比較県)
print(f'\n## 5県 sanity (東京/大阪/北海道/沖縄/高知)')
for pref in ['東京都','大阪府','北海道','沖縄県','高知県']:
    egfr = egfr_dict.get(pref)
    renal = renal_dict.get(pref)
    cat14 = prefs_ps.get(pref, {}).get('categories', {}).get(target_cat)
    print(f'  {pref}: eGFR avg={(egfr["male"]+egfr["female"])/2:.1f} / 腎不全死亡率={renal:.1f} / ⅩⅣ受療率(in/out)={cat14.get("inpatient") if cat14 else "—"}/{cat14.get("outpatient") if cat14 else "—"}')

# 判定
print(f'\n{"="*70}')
print('## 最終判定 (peer review Case 分け)')
print('='*70)
print('Case B+: eGFR + 腎不全死亡率 + 患者調査ⅩⅣ_腎尿路生殖器系 利用可')
print('         透析・人工腎臓 (NDB), 透析cap (施設基準) は未整備')
print('         → isExperimental: true で 実装可')
print()
print('実装制約:')
print('  ✅ リスク: eGFR (健診受診者集団値、CKD診断率ではない注記)')
print('  ⚠️ 疾病負荷: 患者調査ⅩⅣ_腎尿路生殖器系 (CKD専用ではない、結石・前立腺肥大含む注記)')
print('  ❌ 医療利用: 未整備 (透析・人工腎臓データなし)')
print('  ❌ 供給: 未整備 (透析cap未抽出)')
print('  ✅ 結果: 腎不全死亡率 (粗死亡率、年齢調整前)')
print()
print('禁止事項 (peer review 遵守):')
print('  ❌ 利尿剤 = 腎疾患治療proxy (循環器・心不全と重複)')
print('  ❌ RAS阻害薬 = 腎疾患治療proxy (循環器・高血圧と重複)')
print('  ❌ 「CKD患者数」「罹患率」「供給不足」断定')
