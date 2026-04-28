#!/usr/bin/env python3
"""
audit_home_transition.py — 在宅移行 補助分類 v0 の47県分布検証

目的:
- ⑤ classifyHomecareType v0 が47県をどう分類しているか確認
- 「支援型が検出されない」のはロジック問題か実態か判別
- 各指標の分布(min/median/mean/max/p25/p75)を確認
- レビュー懸念「慢性期を支援型に含めてよいか」の検証材料

出力: コンソール + JSON (data/static/audit_home_transition.json)
"""
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).parent.parent
AP_PATH = ROOT / 'data' / 'static' / 'age_pyramid.json'
ND_PATH = ROOT / 'data' / 'static' / 'ndb_diagnostics.json'
BF_PATH = ROOT / 'data' / 'static' / 'bed_function_by_pref.json'

with open(AP_PATH) as f: ap = json.load(f)
with open(ND_PATH) as f: nd = json.load(f)
with open(BF_PATH) as f: bf = json.load(f)

# 47県集計 + 47県平均
def compute_pref(pref):
    apref = ap['prefectures'].get(pref)
    bfref = bf['prefectures'].get(pref)
    if not apref or not bfref or bfref.get('総床数', 0) == 0:
        return None
    
    tot = sum(apref['male']) + sum(apref['female'])
    p75 = sum(apref['male'][15:]) + sum(apref['female'][15:])
    share75 = p75/tot*100 if tot > 0 else None
    
    ndb_rec = next((d for d in nd if d.get('category')=='C_在宅医療' and d.get('prefecture')==pref), None)
    hc_per75 = ndb_rec['total_claims']/p75*100000 if (ndb_rec and p75 > 0) else None
    
    total_beds = bfref['総床数']
    rec_share = bfref['回復期']['beds']/total_beds*100
    chr_share = bfref['慢性期']['beds']/total_beds*100
    
    # v1 拡張用: 75+ あたり 回復期/慢性期 床数
    rec_per75 = bfref['回復期']['beds']/p75*100000 if p75 > 0 else None
    chr_per75 = bfref['慢性期']['beds']/p75*100000 if p75 > 0 else None
    
    return {
        'pref': pref, 'share75': share75, 'hc_per75': hc_per75,
        'rec_share': rec_share, 'chr_share': chr_share,
        'rec_per75': rec_per75, 'chr_per75': chr_per75,
        'p75_pop': p75, 'total_pop': tot, 'total_beds': total_beds,
    }

prefs = list(ap['prefectures'].keys())
all_stats = [compute_pref(p) for p in prefs]
all_stats = [s for s in all_stats if s]
print(f'=== 47県集計 (n={len(all_stats)}) ===')

# 指標ごとの分布
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

dists = {
    'share75': dist([s['share75'] for s in all_stats], '75歳以上割合(%)'),
    'hc_per75': dist([s['hc_per75'] for s in all_stats], 'NDB在宅医療/75+10万対'),
    'rec_share': dist([s['rec_share'] for s in all_stats], '回復期シェア(%)'),
    'chr_share': dist([s['chr_share'] for s in all_stats], '慢性期シェア(%)'),
    'rec_per75': dist([s['rec_per75'] for s in all_stats], '回復期病床/75+10万対'),
    'chr_per75': dist([s['chr_per75'] for s in all_stats], '慢性期病床/75+10万対'),
}
print(f'\n## 各指標の分布 (47県)')
print(f'{"指標":<28}{"min":>11}{"p25":>11}{"median":>11}{"mean":>11}{"p75":>11}{"max":>11}')
for k, d in dists.items():
    if d:
        print(f'{d["label"]:<28}{d["min"]:>11.1f}{d["p25"]:>11.1f}{d["median"]:>11.1f}{d["mean"]:>11.1f}{d["p75"]:>11.1f}{d["max"]:>11.1f}')

# 47県平均 (基準)
avg = {k: dists[k]['mean'] for k in ['share75', 'hc_per75', 'rec_share', 'chr_share']}
print(f'\n## 47県平均 (基準)')
for k, v in avg.items():
    print(f'  {k}: {v:.2f}')

# 各県を分類 (v0ロジック)
def classify(s):
    if s['share75'] < avg['share75']:
        return ('gate_not_aging', 0, 0)
    high = sum([
        s['hc_per75'] > avg['hc_per75'] if s['hc_per75'] else False,
        s['rec_share'] > avg['rec_share'] if s['rec_share'] is not None else False,
        s['chr_share'] > avg['chr_share'] if s['chr_share'] is not None else False,
    ])
    low = sum([
        s['hc_per75'] < avg['hc_per75'] if s['hc_per75'] else False,
        s['rec_share'] < avg['rec_share'] if s['rec_share'] is not None else False,
        s['chr_share'] < avg['chr_share'] if s['chr_share'] is not None else False,
    ])
    if high >= 2: return ('支援型可能性', high, low)
    if low >= 2: return ('ギャップ型可能性', high, low)
    return ('mixed', high, low)

# 分類カウント
buckets = {'支援型可能性': [], 'ギャップ型可能性': [], 'mixed': [], 'gate_not_aging': []}
for s in all_stats:
    cls, h, l = classify(s)
    buckets[cls].append({'pref': s['pref'], 'share75': s['share75'], 'hc_per75': s['hc_per75'], 'rec_share': s['rec_share'], 'chr_share': s['chr_share'], 'high': h, 'low': l})

print(f'\n## 47県分類分布 (v0ロジック)')
for cls, lst in buckets.items():
    print(f'  {cls}: {len(lst)}県')

# 分類別県リスト
print(f'\n## 支援型可能性 ({len(buckets["支援型可能性"])}県)')
for x in sorted(buckets['支援型可能性'], key=lambda r: -r['share75']):
    print(f'  {x["pref"]:<8} 75+={x["share75"]:.1f}% / NDB在宅={x["hc_per75"]:,.0f} / 回復期={x["rec_share"]:.1f}% / 慢性期={x["chr_share"]:.1f}% [high={x["high"]}/3]')

print(f'\n## ギャップ型可能性 ({len(buckets["ギャップ型可能性"])}県)')
for x in sorted(buckets['ギャップ型可能性'], key=lambda r: -r['share75']):
    print(f'  {x["pref"]:<8} 75+={x["share75"]:.1f}% / NDB在宅={x["hc_per75"]:,.0f} / 回復期={x["rec_share"]:.1f}% / 慢性期={x["chr_share"]:.1f}% [low={x["low"]}/3]')

print(f'\n## mixed ({len(buckets["mixed"])}県)')
for x in sorted(buckets['mixed'], key=lambda r: -r['share75']):
    print(f'  {x["pref"]:<8} 75+={x["share75"]:.1f}% / NDB在宅={x["hc_per75"]:,.0f} / 回復期={x["rec_share"]:.1f}% / 慢性期={x["chr_share"]:.1f}% [h={x["high"]}/l={x["low"]}]')

print(f'\n## 若年gate対象外 ({len(buckets["gate_not_aging"])}県)')
for x in sorted(buckets['gate_not_aging'], key=lambda r: -r['share75']):
    print(f'  {x["pref"]:<8} 75+={x["share75"]:.1f}%')

# 慢性期 vs NDB在宅 の相関 (レビュー懸念2)
print(f'\n## 慢性期シェア vs NDB在宅医療 の相関 (47県)')
chr_vals = [s['chr_share'] for s in all_stats if s['chr_share'] is not None and s['hc_per75'] is not None]
hc_vals = [s['hc_per75'] for s in all_stats if s['chr_share'] is not None and s['hc_per75'] is not None]
n = len(chr_vals)
mean_c = sum(chr_vals)/n
mean_h = sum(hc_vals)/n
cov = sum((c-mean_c)*(h-mean_h) for c,h in zip(chr_vals,hc_vals))/n
sd_c = (sum((c-mean_c)**2 for c in chr_vals)/n)**0.5
sd_h = (sum((h-mean_h)**2 for h in hc_vals)/n)**0.5
r = cov/(sd_c*sd_h) if sd_c*sd_h > 0 else 0
print(f'  Pearson r = {r:.3f} (n={n})')
print(f'  解釈: 慢性期シェアと在宅医療proxyは{"正相関" if r > 0.3 else "弱い相関" if abs(r) < 0.3 else "負相関"}')

# JSON 保存
out = {
    'methodology': 'classifyHomecareType v0 logic を全47県に適用',
    'reference_avg': avg,
    'distributions': dists,
    'classification': {k: {'count': len(v), 'prefs': [x['pref'] for x in v]} for k, v in buckets.items()},
    'detail': {k: v for k, v in buckets.items()},
    'correlation_chronic_vs_homecare': {'pearson_r': r, 'n': n},
}
out_path = ROOT / 'data' / 'static' / 'audit_home_transition.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f'\n結果JSON保存: {out_path}')

# Summary line
print(f'\n## Summary')
print(f'47県分類: 支援型 {len(buckets["支援型可能性"])} / ギャップ型 {len(buckets["ギャップ型可能性"])} / mixed {len(buckets["mixed"])} / 若年gate対象外 {len(buckets["gate_not_aging"])}')
