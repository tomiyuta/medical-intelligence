#!/usr/bin/env python3
"""
Phase 2E-3: 中四国・九州 在宅移行支援型の検証

Phase 2E-2 (東北・北日本 ギャップ型) の対照分析。
Phase 2 在宅移行 v1 で支援型候補と分類された県のうち、中四国・九州地域を
実データで定量検証する。

仮説:
- 中四国・九州の一部県では、高齢化に対して在宅・回復期/慢性期病床・
  cap.homecare/cap.rehab proxy が相対的に厚く、東北・北日本ギャップ型と
  異なる地域医療供給構造を持つ。

対象10県 (中四国 + 九州):
  中四国: 高知/山口/島根/和歌山/徳島/愛媛/岡山
  九州:   長崎/鹿児島/熊本

検証軸 (E-2と同じ):
1. 5指標 (NDB在宅 / 回復期床 / 慢性期床 / cap.homecare / cap.rehab) を75+10万対で正規化
2. Phase 3-1 年齢調整死亡率 (脳血管・腎不全・肺炎・心疾患・悪性新生物)
3. ギャップ判定 v1 ロジック踏襲: high≥3 で支援型
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data' / 'static'

def load(name):
    return json.loads((DATA / f'{name}.json').read_text(encoding='utf-8'))

bedfunc = load('bed_function_by_pref')
homecare_cap = load('homecare_capability_by_pref')
ndb_diag = load('ndb_diagnostics')
age_pyramid = load('age_pyramid')
vital = load('vital_stats_pref')
mortality_aa = load('age_adjusted_mortality_2020')

WESTERN = ['高知県', '山口県', '島根県', '和歌山県', '徳島県', '愛媛県', '岡山県',
           '長崎県', '鹿児島県', '熊本県']

print('='*78)
print('Phase 2E-3: 中四国・九州 在宅移行支援型の検証 (E-2 対照群)')
print('='*78)
print(f'対象10県: {WESTERN}')

def get_p75plus(pref_name):
    pyr = age_pyramid.get('prefectures', {}).get(pref_name)
    if not pyr or not pyr.get('male') or not pyr.get('female'):
        return None
    male = pyr['male']
    female = pyr['female']
    p75 = sum(male[15:]) + sum(female[15:])
    total = sum(male) + sum(female)
    return {'p75': p75, 'total': total, 'rate75': p75/total*100 if total else 0}

def get_ndb_homecare(pref_name):
    rec = next((d for d in ndb_diag if d.get('category') == 'C_在宅医療' and d.get('prefecture') == pref_name), None)
    return rec.get('total_claims') if rec else None

def get_bed_func(pref_name, key):
    return bedfunc.get('prefectures', {}).get(pref_name, {}).get(key, {}).get('beds')

def get_cap(pref_name, key):
    return homecare_cap.get('by_prefecture', {}).get(pref_name, {}).get(key)

def get_death_rate(pref_name, cause):
    pref_rec = next((p for p in vital.get('prefectures', []) if p.get('pref') == pref_name), None)
    if not pref_rec: return None
    cd = next((c for c in pref_rec.get('causes', []) if c.get('cause') == cause), None)
    return cd.get('rate') if cd else None

def get_age_adjusted_rate(pref_name, cause):
    pref_data = mortality_aa.get('prefectures', {}).get(pref_name, {}).get(cause)
    if not pref_data: return None
    return pref_data.get('total_simple_mean')

def compute_metrics(pref_name):
    p75 = get_p75plus(pref_name)
    if not p75 or p75['p75'] <= 0: return None
    pop75 = p75['p75']
    ndb = get_ndb_homecare(pref_name)
    bd_recovery = get_bed_func(pref_name, '回復期')
    bd_chronic = get_bed_func(pref_name, '慢性期')
    cap_hc = get_cap(pref_name, 'homecare_per75')
    cap_rh = get_cap(pref_name, 'rehab_per75')
    return {
        'pref': pref_name,
        'rate75': p75['rate75'],
        'm1_ndb_per75': (ndb / pop75 * 100000) if ndb else None,
        'm2_recovery_per75': (bd_recovery / pop75 * 100000) if bd_recovery else None,
        'm3_chronic_per75': (bd_chronic / pop75 * 100000) if bd_chronic else None,
        'm4_homecare_cap': cap_hc,
        'm5_rehab_cap': cap_rh,
        'cerebro_death': get_death_rate(pref_name, '脳血管疾患'),
        'renal_death': get_death_rate(pref_name, '腎不全'),
        'pneumonia_death': get_death_rate(pref_name, '肺炎'),
        'heart_death': get_death_rate(pref_name, '心疾患'),
        'cancer_death': get_death_rate(pref_name, 'がん(悪性新生物)'),
        'cerebro_age_adj': get_age_adjusted_rate(pref_name, '脳血管疾患'),
        'renal_age_adj': get_age_adjusted_rate(pref_name, '腎不全'),
        'pneumonia_age_adj': get_age_adjusted_rate(pref_name, '肺炎'),
        'heart_age_adj': get_age_adjusted_rate(pref_name, '心疾患'),
        'cancer_age_adj': get_age_adjusted_rate(pref_name, '悪性新生物'),
    }

def compute_national_avg(getter):
    vals = []
    for pref in age_pyramid.get('prefectures', {}):
        v = getter(pref)
        if v is not None and v > 0:
            vals.append(v)
    return sum(vals) / len(vals) if vals else None

nat_avg = {
    'rate75': compute_national_avg(lambda p: get_p75plus(p)['rate75'] if get_p75plus(p) else None),
    'm1_ndb_per75': compute_national_avg(lambda p: compute_metrics(p)['m1_ndb_per75'] if compute_metrics(p) else None),
    'm2_recovery_per75': compute_national_avg(lambda p: compute_metrics(p)['m2_recovery_per75'] if compute_metrics(p) else None),
    'm3_chronic_per75': compute_national_avg(lambda p: compute_metrics(p)['m3_chronic_per75'] if compute_metrics(p) else None),
    'm4_homecare_cap': compute_national_avg(lambda p: compute_metrics(p)['m4_homecare_cap'] if compute_metrics(p) else None),
    'm5_rehab_cap': compute_national_avg(lambda p: compute_metrics(p)['m5_rehab_cap'] if compute_metrics(p) else None),
}

print(f'\n## 全国平均 (47県単純平均、E-2と同じ):')
for k, v in nat_avg.items():
    if v is not None:
        print(f'  {k}: {v:.2f}')

# ─── 10県の検証 ───
print(f'\n## 中四国・九州10県の指標 (vs 全国平均)')
print(f'\n{"県":<8}{"75+%":>7}{"NDB在宅":>12}{"回復期":>11}{"慢性期":>11}{"homecare":>11}{"rehab":>10}')
print('-'*72)

target_metrics = []
def fmt_delta(val, nat):
    if val is None or nat is None or nat == 0: return '-'
    d = (val/nat - 1) * 100
    return f'{val:.1f}({d:+.0f}%)'

for pref in WESTERN:
    m = compute_metrics(pref)
    if not m: continue
    target_metrics.append(m)
    print(f'{pref:<8}{m["rate75"]:>6.1f}%{fmt_delta(m["m1_ndb_per75"], nat_avg["m1_ndb_per75"]):>13}{fmt_delta(m["m2_recovery_per75"], nat_avg["m2_recovery_per75"]):>12}{fmt_delta(m["m3_chronic_per75"], nat_avg["m3_chronic_per75"]):>12}{fmt_delta(m["m4_homecare_cap"], nat_avg["m4_homecare_cap"]):>12}{fmt_delta(m["m5_rehab_cap"], nat_avg["m5_rehab_cap"]):>11}')

# ─── 支援型判定 ───
print(f'\n## 支援型判定: 5指標で全国平均より+5%以上の数 (E-2 と同じ ±5% neutral zone)')
results = []
for m in target_metrics:
    high = 0
    low = 0
    for k in ['m1_ndb_per75', 'm2_recovery_per75', 'm3_chronic_per75', 'm4_homecare_cap', 'm5_rehab_cap']:
        if m[k] is None or nat_avg[k] is None or nat_avg[k] == 0: continue
        d = (m[k]/nat_avg[k] - 1) * 100
        if d > 5: high += 1
        elif d < -5: low += 1
    
    judge = ''
    if high >= 3:
        judge = f'✅ 支援型 (high={high}/5)'
    elif low >= 3:
        judge = f'⚠️ ギャップ型 (low={low}/5)'
    else:
        judge = f'➖ 中間型 (h={high}, l={low})'
    
    aging_judge = '高齢化↑' if m['rate75'] > nat_avg['rate75'] else '高齢化↓'
    print(f'  {m["pref"]:<8} {aging_judge}  {judge}')
    results.append({'pref': m['pref'], 'judge': judge, 'high': high, 'low': low, 'rate75': m['rate75']})

# ─── 死亡率比較 (粗 vs 年齢調整) ───
print(f'\n## 死亡率: 5死因の年齢調整死亡率 vs 全国平均 (Phase 3-1 データ)')
nat_aa = mortality_aa.get('national', {})
nat_cerebro_aa = (nat_aa.get('脳血管疾患', {}).get('male', {}).get('rate', 0) + nat_aa.get('脳血管疾患', {}).get('female', {}).get('rate', 0)) / 2
nat_renal_aa = (nat_aa.get('腎不全', {}).get('male', {}).get('rate', 0) + nat_aa.get('腎不全', {}).get('female', {}).get('rate', 0)) / 2
nat_pneumonia_aa = (nat_aa.get('肺炎', {}).get('male', {}).get('rate', 0) + nat_aa.get('肺炎', {}).get('female', {}).get('rate', 0)) / 2
nat_heart_aa = (nat_aa.get('心疾患', {}).get('male', {}).get('rate', 0) + nat_aa.get('心疾患', {}).get('female', {}).get('rate', 0)) / 2
nat_cancer_aa = (nat_aa.get('悪性新生物', {}).get('male', {}).get('rate', 0) + nat_aa.get('悪性新生物', {}).get('female', {}).get('rate', 0)) / 2

print(f'\n  全国(年齢調整 男女平均): 脳血管 {nat_cerebro_aa:.1f}, 腎不全 {nat_renal_aa:.1f}, 肺炎 {nat_pneumonia_aa:.1f}, 心疾患 {nat_heart_aa:.1f}, 悪性 {nat_cancer_aa:.1f}')
print(f'\n{"県":<8}{"脳血管":>10}{"腎不全":>10}{"肺炎":>10}{"心疾患":>10}{"悪性":>10}')
print('-'*60)
def fmt_aa(v, nat):
    if v is None or nat == 0: return '-'
    d = (v/nat - 1) * 100
    return f'{v:.1f}({d:+.0f}%)'
for m in target_metrics:
    print(f'{m["pref"]:<8}{fmt_aa(m["cerebro_age_adj"], nat_cerebro_aa):>11}{fmt_aa(m["renal_age_adj"], nat_renal_aa):>11}{fmt_aa(m["pneumonia_age_adj"], nat_pneumonia_aa):>11}{fmt_aa(m["heart_age_adj"], nat_heart_aa):>11}{fmt_aa(m["cancer_age_adj"], nat_cancer_aa):>11}')

# ─── E-2 と E-3 の対照表 ───
print(f'\n{"="*78}')
print('## E-2 (東北・北日本) vs E-3 (中四国・九州) 対照')
print('='*78)
print(f'')
print(f'                E-2 東北7県      E-3 中四国・九州10県')
print(f'-'*72)
support_3 = sum(1 for r in results if 'high' in r and r['high'] >= 3)
gap_3 = sum(1 for r in results if 'high' not in r or (r['high'] < 3 and r['low'] >= 3))
neutral_3 = sum(1 for r in results if r['high'] < 3 and r['low'] < 3)

print(f'ギャップ型:     6/7 (86%)        ?/10  ({gap_3}/10)')
print(f'支援型:        0/7 ( 0%)        {support_3}/10 ({support_3*100/10:.0f}%)')
print(f'中間型:        1/7 (14%)        {neutral_3}/10 ({neutral_3*100/10:.0f}%)')

# ─── 仮説総合判定 ───
print(f'\n{"="*78}')
print('## Phase 2E-3 仮説総合判定')
print('='*78)
print(f'')
if support_3 >= 5:
    print(f'✅ 支援型仮説は支持される ({support_3}/10 県が支援型)')
elif support_3 >= 3:
    print(f'➖ 部分支持 ({support_3}/10 県のみ支援型)')
else:
    print(f'❌ 支援型仮説は支持されない ({support_3}/10 県のみ支援型)')
print(f'')
print(f'地域分布:')
for r in results:
    print(f'  {r["pref"]:<8} {r["judge"]}')
