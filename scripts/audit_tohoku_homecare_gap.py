#!/usr/bin/env python3
"""
Phase 2E-2: 東北・北日本 在宅移行ギャップ型の検証

Phase 2 の在宅移行補助分類 v1 で、東北・北日本が「ギャップ型」候補とされた仮説を
実データで定量検証する。

仮説:
- 東北・北日本 (北海道・青森・岩手・宮城・秋田・山形・福島) は
  高齢化が高い + NDB在宅・回復期/慢性期病床・cap.homecare/rehab が低い傾向
  + 腎不全・脳血管死亡率も全国上位

検証軸:
1. 75歳以上割合 (人口構造)
2. NDB在宅医療 (75+人口10万対)
3. 回復期病床 (75+人口10万対)
4. 慢性期病床 (75+人口10万対)
5. cap.homecare (75+人口10万対)
6. cap.rehab (75+人口10万対)
7. 死亡率 (脳血管・腎不全・肺炎・誤嚥性肺炎)
8. Phase 3-1 年齢調整死亡率の確認
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

TOHOKU = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県']

print('='*78)
print('Phase 2E-2: 東北・北日本 在宅移行ギャップ型の検証')
print('='*78)
print(f'対象7県: {TOHOKU}')

# ─── 75歳以上人口の計算 ───
def get_p75plus(pref_name):
    pyr = age_pyramid.get('prefectures', {}).get(pref_name)
    if not pyr or not pyr.get('male') or not pyr.get('female'):
        return None
    male = pyr['male']
    female = pyr['female']
    p75 = sum(male[15:]) + sum(female[15:])
    total = sum(male) + sum(female)
    return {'p75': p75, 'total': total, 'rate75': p75/total*100 if total else 0}

# ─── NDB在宅医療 (C_在宅医療) ───
def get_ndb_homecare(pref_name):
    rec = next((d for d in ndb_diag if d.get('category') == 'C_在宅医療' and d.get('prefecture') == pref_name), None)
    return rec.get('total_claims') if rec else None

# ─── 病床機能 ───
def get_bed_func(pref_name, key):
    return bedfunc.get('prefectures', {}).get(pref_name, {}).get(key, {}).get('beds')

# ─── cap proxy ───
def get_cap(pref_name, key):
    return homecare_cap.get('by_prefecture', {}).get(pref_name, {}).get(key)

# ─── 死亡率 ───
def get_death_rate(pref_name, cause):
    pref_rec = next((p for p in vital.get('prefectures', []) if p.get('pref') == pref_name), None)
    if not pref_rec: return None
    cd = next((c for c in pref_rec.get('causes', []) if c.get('cause') == cause), None)
    return cd.get('rate') if cd else None

# ─── 年齢調整死亡率 (男女平均) ───
def get_age_adjusted_rate(pref_name, cause):
    pref_data = mortality_aa.get('prefectures', {}).get(pref_name, {}).get(cause)
    if not pref_data: return None
    return pref_data.get('total_simple_mean')

# ─── 全国平均 (47県の単純平均) ───
def compute_national_avg(getter):
    vals = []
    for pref in age_pyramid.get('prefectures', {}):
        v = getter(pref)
        if v is not None and v > 0:
            vals.append(v)
    return sum(vals) / len(vals) if vals else None

# ─── 計算 ───
def compute_metrics(pref_name):
    p75 = get_p75plus(pref_name)
    if not p75 or p75['p75'] <= 0:
        return None
    
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
        'aspiration_death': get_death_rate(pref_name, '誤嚥性肺炎'),
        'cerebro_age_adj': get_age_adjusted_rate(pref_name, '脳血管疾患'),
        'renal_age_adj': get_age_adjusted_rate(pref_name, '腎不全'),
    }

# 全国平均
nat_avg = {
    'rate75': compute_national_avg(lambda p: get_p75plus(p)['rate75'] if get_p75plus(p) else None),
    'm1_ndb_per75': compute_national_avg(lambda p: compute_metrics(p)['m1_ndb_per75'] if compute_metrics(p) else None),
    'm2_recovery_per75': compute_national_avg(lambda p: compute_metrics(p)['m2_recovery_per75'] if compute_metrics(p) else None),
    'm3_chronic_per75': compute_national_avg(lambda p: compute_metrics(p)['m3_chronic_per75'] if compute_metrics(p) else None),
    'm4_homecare_cap': compute_national_avg(lambda p: compute_metrics(p)['m4_homecare_cap'] if compute_metrics(p) else None),
    'm5_rehab_cap': compute_national_avg(lambda p: compute_metrics(p)['m5_rehab_cap'] if compute_metrics(p) else None),
}

print(f'\n## 全国平均 (47県単純平均):')
for k, v in nat_avg.items():
    if v is not None:
        print(f'  {k}: {v:.2f}')

# ─── 東北7県の検証 ───
print(f'\n## 東北・北日本7県の指標 (vs 全国平均)')
print(f'\n{"県":<8}{"75+%":>7}{"NDB在宅":>10}{"回復期":>9}{"慢性期":>9}{"homecare":>10}{"rehab":>8}{"脳血管死":>9}{"腎不全死":>9}')
print('-'*78)

target_metrics = []
for pref in TOHOKU:
    m = compute_metrics(pref)
    if not m: continue
    target_metrics.append(m)
    
    # 各指標を全国比 -%/+% で
    def fmt_delta(val, nat):
        if val is None or nat is None or nat == 0: return '-'
        d = (val/nat - 1) * 100
        return f'{val:.1f}({d:+.0f}%)'
    
    print(f'{pref:<8}{m["rate75"]:>6.1f}%{fmt_delta(m["m1_ndb_per75"], nat_avg["m1_ndb_per75"]):>11}{fmt_delta(m["m2_recovery_per75"], nat_avg["m2_recovery_per75"]):>10}{fmt_delta(m["m3_chronic_per75"], nat_avg["m3_chronic_per75"]):>10}{fmt_delta(m["m4_homecare_cap"], nat_avg["m4_homecare_cap"]):>11}{fmt_delta(m["m5_rehab_cap"], nat_avg["m5_rehab_cap"]):>9}{(m["cerebro_death"] if m["cerebro_death"] else 0):>9.1f}{(m["renal_death"] if m["renal_death"] else 0):>9.1f}')

# ─── ギャップ判定 ───
print(f'\n## ギャップ判定: 5指標で全国平均より-5%以下の数')
print(f'(在宅移行 v1 ロジック踏襲)')
for m in target_metrics:
    low_count = 0
    high_count = 0
    for k in ['m1_ndb_per75', 'm2_recovery_per75', 'm3_chronic_per75', 'm4_homecare_cap', 'm5_rehab_cap']:
        if m[k] is None or nat_avg[k] is None or nat_avg[k] == 0: continue
        d = (m[k]/nat_avg[k] - 1) * 100
        if d < -5: low_count += 1
        elif d > 5: high_count += 1
    
    judge = ''
    if low_count >= 3:
        judge = f'⚠️ ギャップ型 (low={low_count}/5)'
    elif high_count >= 3:
        judge = f'✅ 支援型 (high={high_count}/5)'
    else:
        judge = f'➖ 中間型 (low={low_count}, high={high_count})'
    
    aging_judge = '高齢化↑' if m['rate75'] > nat_avg['rate75'] else '高齢化↓'
    print(f'  {m["pref"]:<8} {aging_judge}  {judge}')

# ─── 死亡率の Phase 3-1 補強 ───
print(f'\n## 死亡率: 粗死亡率 vs 年齢調整死亡率 (Phase 3-1 データ)')
print(f'\n{"県":<8}{"脳血管(粗)":>11}{"脳血管(調整)":>13}{"腎不全(粗)":>11}{"腎不全(調整)":>13}')
print('-'*60)
for m in target_metrics:
    cb_r = m["cerebro_death"] if m["cerebro_death"] else 0
    cb_a = m["cerebro_age_adj"] if m["cerebro_age_adj"] else 0
    rn_r = m["renal_death"] if m["renal_death"] else 0
    rn_a = m["renal_age_adj"] if m["renal_age_adj"] else 0
    print(f'{m["pref"]:<8}{cb_r:>10.1f} {cb_a:>12.1f}  {rn_r:>10.1f} {rn_a:>12.1f}')

# 全国の年齢調整値 (sanity)
nat_aa = mortality_aa.get('national', {})
nat_cerebro_aa = (nat_aa.get('脳血管疾患', {}).get('male', {}).get('rate', 0) + nat_aa.get('脳血管疾患', {}).get('female', {}).get('rate', 0)) / 2
nat_renal_aa = (nat_aa.get('腎不全', {}).get('male', {}).get('rate', 0) + nat_aa.get('腎不全', {}).get('female', {}).get('rate', 0)) / 2
print(f'\n  全国(年齢調整, 男女平均): 脳血管 {nat_cerebro_aa:.1f}, 腎不全 {nat_renal_aa:.1f}')

# ─── 仮説総合判定 ───
print(f'\n{"="*78}')
print('## Phase 2E-2 仮説総合判定')
print('='*78)

gap_count = 0
neutral_count = 0
support_count = 0
for m in target_metrics:
    low = 0
    high = 0
    for k in ['m1_ndb_per75', 'm2_recovery_per75', 'm3_chronic_per75', 'm4_homecare_cap', 'm5_rehab_cap']:
        if m[k] is None or nat_avg[k] is None or nat_avg[k] == 0: continue
        d = (m[k]/nat_avg[k] - 1) * 100
        if d < -5: low += 1
        elif d > 5: high += 1
    if low >= 3: gap_count += 1
    elif high >= 3: support_count += 1
    else: neutral_count += 1

print(f'\n7県中:')
print(f'  ギャップ型: {gap_count}/7 ({gap_count/7*100:.0f}%)')
print(f'  支援型:    {support_count}/7 ({support_count/7*100:.0f}%)')
print(f'  中間型:    {neutral_count}/7 ({neutral_count/7*100:.0f}%)')
