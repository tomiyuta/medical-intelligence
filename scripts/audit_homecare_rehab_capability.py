#!/usr/bin/env python3
"""
audit_homecare_rehab_capability.py — cap.homecare/cap.rehab 47県集計

目的:
- v1 在宅移行分類で使用する cap.homecare/cap.rehab 施設密度を事前集計
- 47県すべてで集計可能か確認
- 既存指標 (NDB在宅医療/回復期病床) との相関を測定
- 支援型/ギャップ型 再分類への寄与可能性を評価

出力:
- data/static/homecare_capability_by_pref.json (v1 で使用)
- コンソール: 集計結果 + 分布 + 相関
"""
import json
import statistics
from pathlib import Path
import os

ROOT = Path(__file__).parent.parent
SHARD_DIR = ROOT / 'data' / 'static' / 'kijun_shards'
AP_PATH = ROOT / 'data' / 'static' / 'age_pyramid.json'
ND_PATH = ROOT / 'data' / 'static' / 'ndb_diagnostics.json'
BF_PATH = ROOT / 'data' / 'static' / 'bed_function_by_pref.json'

with open(AP_PATH) as f: ap = json.load(f)
with open(ND_PATH) as f: nd = json.load(f)
with open(BF_PATH) as f: bf = json.load(f)

prefs = list(ap['prefectures'].keys())
print(f'=== cap.homecare/cap.rehab 47県集計 ===\n')

# 各県のシャードを走査
results = []
for pref in prefs:
    shard_path = SHARD_DIR / f'{pref}.json'
    if not shard_path.exists():
        print(f'  WARN: {pref} shard missing')
        continue
    with open(shard_path) as f:
        data = json.load(f)
    
    # 75歳以上人口
    apref = ap['prefectures'].get(pref)
    p75 = sum(apref['male'][15:]) + sum(apref['female'][15:]) if apref else 0
    
    # NDB在宅医療
    ndb_rec = next((d for d in nd if d.get('category')=='C_在宅医療' and d.get('prefecture')==pref), None)
    hc_per75 = ndb_rec['total_claims']/p75*100000 if (ndb_rec and p75 > 0) else None
    
    # 回復期病床/75+10万対
    bfref = bf['prefectures'].get(pref)
    rec_per75 = (bfref['回復期']['beds']/p75*100000) if (bfref and p75 > 0) else None
    
    # cap集計
    homecare_facilities = sum(1 for d in data if d.get('cap', {}).get('homecare', 0) > 0)
    rehab_facilities = sum(1 for d in data if d.get('cap', {}).get('rehab', 0) > 0)
    homecare_total = sum(d.get('cap', {}).get('homecare', 0) for d in data)
    rehab_total = sum(d.get('cap', {}).get('rehab', 0) for d in data)
    
    homecare_per75 = homecare_facilities/p75*100000 if p75 > 0 else None
    rehab_per75 = rehab_facilities/p75*100000 if p75 > 0 else None
    
    results.append({
        'pref': pref,
        'p75_pop': p75,
        'total_facilities': len(data),
        'homecare_facilities': homecare_facilities,
        'rehab_facilities': rehab_facilities,
        'homecare_total': homecare_total,
        'rehab_total': rehab_total,
        'homecare_per75': homecare_per75,
        'rehab_per75': rehab_per75,
        'hc_per75_ndb': hc_per75,
        'rec_per75_beds': rec_per75,
    })

print(f'集計成功: {len(results)} / 47 県\n')

# 分布
def dist(values, label):
    vs = sorted([v for v in values if v is not None])
    if not vs: return None
    n = len(vs)
    return {
        'label': label, 'n': n,
        'min': vs[0], 'max': vs[-1],
        'mean': sum(vs)/n,
        'median': statistics.median(vs),
        'p25': vs[n//4], 'p75': vs[3*n//4],
    }

print('## 分布')
print(f'{"指標":<32}{"min":>11}{"p25":>11}{"median":>11}{"mean":>11}{"p75":>11}{"max":>11}')
for key, label in [
    ('homecare_facilities', 'cap.homecare 施設数'),
    ('rehab_facilities', 'cap.rehab 施設数'),
    ('homecare_per75', 'cap.homecare/75+10万対'),
    ('rehab_per75', 'cap.rehab/75+10万対'),
]:
    d = dist([r[key] for r in results], label)
    if d:
        print(f'{d["label"]:<32}{d["min"]:>11.1f}{d["p25"]:>11.1f}{d["median"]:>11.1f}{d["mean"]:>11.1f}{d["p75"]:>11.1f}{d["max"]:>11.1f}')

# 上位/下位5県
print(f'\n## cap.homecare/75+10万対 top 5')
for r in sorted(results, key=lambda x: -(x['homecare_per75'] or 0))[:5]:
    print(f'  {r["pref"]:<8} {r["homecare_per75"]:.1f} ({r["homecare_facilities"]}施設 / 75+={r["p75_pop"]:,})')
print(f'\n## cap.homecare/75+10万対 bottom 5')
for r in sorted(results, key=lambda x: (x['homecare_per75'] or 999))[:5]:
    print(f'  {r["pref"]:<8} {r["homecare_per75"]:.1f} ({r["homecare_facilities"]}施設 / 75+={r["p75_pop"]:,})')

print(f'\n## cap.rehab/75+10万対 top 5')
for r in sorted(results, key=lambda x: -(x['rehab_per75'] or 0))[:5]:
    print(f'  {r["pref"]:<8} {r["rehab_per75"]:.1f} ({r["rehab_facilities"]}施設)')
print(f'\n## cap.rehab/75+10万対 bottom 5')
for r in sorted(results, key=lambda x: (x['rehab_per75'] or 999))[:5]:
    print(f'  {r["pref"]:<8} {r["rehab_per75"]:.1f} ({r["rehab_facilities"]}施設)')

# Pearson相関
def pearson(xs, ys):
    pairs = [(x,y) for x,y in zip(xs,ys) if x is not None and y is not None]
    if len(pairs) < 3: return None
    xs2, ys2 = zip(*pairs)
    n = len(xs2)
    mx, my = sum(xs2)/n, sum(ys2)/n
    cov = sum((x-mx)*(y-my) for x,y in pairs)/n
    sx = (sum((x-mx)**2 for x in xs2)/n)**0.5
    sy = (sum((y-my)**2 for y in ys2)/n)**0.5
    return cov/(sx*sy) if sx*sy > 0 else 0, n

hc75_vals = [r['homecare_per75'] for r in results]
rh75_vals = [r['rehab_per75'] for r in results]
ndb_vals = [r['hc_per75_ndb'] for r in results]
rec_vals = [r['rec_per75_beds'] for r in results]

print(f'\n## 相関 (Pearson r)')
pairs = [
    ('cap.homecare/75+ vs NDB在宅/75+', hc75_vals, ndb_vals),
    ('cap.homecare/75+ vs 回復期/75+', hc75_vals, rec_vals),
    ('cap.rehab/75+ vs NDB在宅/75+', rh75_vals, ndb_vals),
    ('cap.rehab/75+ vs 回復期/75+', rh75_vals, rec_vals),
    ('cap.homecare/75+ vs cap.rehab/75+', hc75_vals, rh75_vals),
]
for label, xs, ys in pairs:
    r = pearson(xs, ys)
    if r:
        print(f'  {label:<40} r={r[0]:+.3f} (n={r[1]})')

# 既存 v0 (3指標) で支援型/ギャップ型に分類された県を、cap指標で見た時にどうか
# 47県平均
hc75_avg = sum(v for v in hc75_vals if v)/len([v for v in hc75_vals if v])
rh75_avg = sum(v for v in rh75_vals if v)/len([v for v in rh75_vals if v])
print(f'\n## 47県平均: cap.homecare/75+ = {hc75_avg:.1f}, cap.rehab/75+ = {rh75_avg:.1f}')

# v0支援型 10県の cap指標
v0_support = ['山口県','和歌山県','徳島県','愛媛県','大分県','長崎県','鳥取県','鹿児島県','山梨県','熊本県']
v0_gap = ['秋田県','高知県','島根県','山形県','岩手県','富山県','青森県','長野県','奈良県','新潟県','香川県','北海道','宮崎県','岡山県','岐阜県']

print(f'\n## v0 支援型10県 で cap.homecare/cap.rehab を見る (vs 47県平均)')
for r in results:
    if r['pref'] in v0_support:
        hc_d = (r['homecare_per75']/hc75_avg-1)*100 if r['homecare_per75'] else None
        rh_d = (r['rehab_per75']/rh75_avg-1)*100 if r['rehab_per75'] else None
        hc_str = f'{r["homecare_per75"]:.1f} ({hc_d:+.0f}%)' if hc_d is not None else '—'
        rh_str = f'{r["rehab_per75"]:.1f} ({rh_d:+.0f}%)' if rh_d is not None else '—'
        print(f'  {r["pref"]:<8} cap.homecare/75+ = {hc_str:<22} cap.rehab/75+ = {rh_str}')

print(f'\n## v0 ギャップ型15県 で cap.homecare/cap.rehab を見る')
for r in results:
    if r['pref'] in v0_gap:
        hc_d = (r['homecare_per75']/hc75_avg-1)*100 if r['homecare_per75'] else None
        rh_d = (r['rehab_per75']/rh75_avg-1)*100 if r['rehab_per75'] else None
        hc_str = f'{r["homecare_per75"]:.1f} ({hc_d:+.0f}%)' if hc_d is not None else '—'
        rh_str = f'{r["rehab_per75"]:.1f} ({rh_d:+.0f}%)' if rh_d is not None else '—'
        print(f'  {r["pref"]:<8} cap.homecare/75+ = {hc_str:<22} cap.rehab/75+ = {rh_str}')

# JSON 保存
out_data = {
    'methodology': 'kijun_shards 47都道府県走査。cap.homecare/cap.rehab>0 の施設数を集計、75歳以上10万人あたりに補正。',
    'reference_avg': {
        'homecare_per75_avg': hc75_avg,
        'rehab_per75_avg': rh75_avg,
    },
    'distributions': {
        'homecare_facilities': dist([r['homecare_facilities'] for r in results], 'cap.homecare 施設数'),
        'rehab_facilities': dist([r['rehab_facilities'] for r in results], 'cap.rehab 施設数'),
        'homecare_per75': dist([r['homecare_per75'] for r in results], 'cap.homecare/75+10万対'),
        'rehab_per75': dist([r['rehab_per75'] for r in results], 'cap.rehab/75+10万対'),
    },
    'by_prefecture': {r['pref']: {
        'homecare_facilities': r['homecare_facilities'],
        'rehab_facilities': r['rehab_facilities'],
        'homecare_per75': r['homecare_per75'],
        'rehab_per75': r['rehab_per75'],
    } for r in results},
}
out_path = ROOT / 'data' / 'static' / 'homecare_capability_by_pref.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(out_data, f, ensure_ascii=False, indent=2)
print(f'\n結果JSON保存: {out_path}')
