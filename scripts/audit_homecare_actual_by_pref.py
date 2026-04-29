#!/usr/bin/env python3
"""
Phase 4-3d: Homecare actual indicators audit (47県集計)

reviewer 採択方針:
  在宅医療 capability proxy が、実際の在宅関連実績とどの程度整合するかを検証する。
  UI拡張ではなく、まず data validation / proxy audit として扱う。

入力:
  - data/static/area_emergency_homecare.json (339圏域)
  - data/static/age_pyramid.json (75+ 人口計算用)
  - data/static/homecare_capability_by_pref.json (capability 比較用)

出力:
  - data/static/homecare_actual_by_pref.json (47県集計 + comparison)

集計対象 field (data quality check 済み):
  - hospitals: 病院数 (100% 充足)
  - homecare: 在宅医療届出施設数 (100% 充足、capability_homecare と重複)
  - homecare_patients: 在宅医療患者数 (100% 充足、★実績指標の核心)
  - acute_support: 急性期支援施設数 (72.3% 充足)

非対象 (data quality 不十分):
  - emerg / emerg_claims: 92.9% null/0 (使用しない)

注意 (Phase 4-1 guardrail 継承):
  - 「実績が高い = 医療の質が高い」と書かない
  - 「実績が低い = 悪い」と書かない
  - capability と actual の不一致を政策失敗と断定しない
"""

import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "static"

# ── 入力 ──
with (DATA_DIR / "area_emergency_homecare.json").open() as f:
    areas = json.load(f)
with (DATA_DIR / "age_pyramid.json").open() as f:
    age_pyramid = json.load(f)
with (DATA_DIR / "homecare_capability_by_pref.json").open() as f:
    capability = json.load(f)

# ── 75+ 人口計算 (capability と同じロジック: index 15 以降が 75+) ──
def compute_75plus_population(ap):
    """agePyramid から 75歳以上人口を返す。
    male/female は 5歳階級配列、index 15 が 75-79 歳から。"""
    if not ap or 'male' not in ap or 'female' not in ap:
        return None
    male = ap['male'][15:]
    female = ap['female'][15:]
    return sum(male) + sum(female)

def compute_total_population(ap):
    """全人口"""
    if not ap or 'male' not in ap or 'female' not in ap:
        return None
    return sum(ap['male']) + sum(ap['female'])

# ── 339圏域 → 47県集計 ──
from collections import defaultdict
agg_by_pref = defaultdict(lambda: {
    'areas': 0,
    'hospitals': 0,
    'homecare_facilities': 0,
    'homecare_patients': 0,
    'acute_support': 0,
})
for entry in areas:
    p = entry['pref']
    a = agg_by_pref[p]
    a['areas'] += 1
    a['hospitals'] += entry.get('hospitals', 0) or 0
    a['homecare_facilities'] += entry.get('homecare', 0) or 0
    a['homecare_patients'] += entry.get('homecare_patients', 0) or 0
    a['acute_support'] += entry.get('acute_support', 0) or 0

PREFECTURES_47 = [
    '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
    '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
    '新潟県','富山県','石川県','福井県','山梨県','長野県',
    '岐阜県','静岡県','愛知県','三重県',
    '滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
    '鳥取県','島根県','岡山県','広島県','山口県',
    '徳島県','香川県','愛媛県','高知県',
    '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
]

# ── 47県の per75/per100k 計算 ──
per_pref = {}
for pref in PREFECTURES_47:
    a = agg_by_pref.get(pref)
    if not a:
        print(f"WARNING: {pref} データなし")
        continue
    ap = age_pyramid.get('prefectures', {}).get(pref)
    pop_75 = compute_75plus_population(ap)
    pop_total = compute_total_population(ap)
    cap = capability.get('by_prefecture', {}).get(pref, {})
    cap_homecare_per75 = cap.get('homecare_per75')
    cap_rehab_per75 = cap.get('rehab_per75')

    # 単位調整: 人口は age_pyramid が「人」単位、per75 は per 100k = 10万対
    # area_emergency_homecare の値も "件数" なので、件数 / (75+人口/100000) = per75 (10万対)
    per_75_100k = lambda v: round(v / pop_75 * 100000, 2) if pop_75 else None
    per_100k = lambda v: round(v / pop_total * 100000, 2) if pop_total else None

    per_pref[pref] = {
        'areas': a['areas'],
        'population': {
            '75plus': pop_75,
            'total': pop_total,
        },
        'actual_total': {
            'hospitals': a['hospitals'],
            'homecare_facilities': a['homecare_facilities'],
            'homecare_patients': a['homecare_patients'],
            'acute_support': a['acute_support'],
        },
        'actual_per_75plus_100k': {
            'hospitals': per_75_100k(a['hospitals']),
            'homecare_facilities': per_75_100k(a['homecare_facilities']),
            'homecare_patients': per_75_100k(a['homecare_patients']),
            'acute_support': per_75_100k(a['acute_support']),
        },
        'actual_per_100k': {
            'hospitals': per_100k(a['hospitals']),
            'homecare_patients': per_100k(a['homecare_patients']),
        },
        'capability': {
            'homecare_per75': cap_homecare_per75,
            'rehab_per75': cap_rehab_per75,
        },
    }

# ── rank 計算 (capability vs actual) ──
# capability_rank: cap_homecare_per75 の降順 (1=最高)
# actual_rank: actual homecare_patients_per_75plus_100k の降順
def rank_by(values, key, descending=True):
    """values: dict {pref: dict}, key: 比較するキー (path)"""
    items = []
    for pref, d in values.items():
        v = d
        for k in key.split('.'):
            v = v.get(k) if isinstance(v, dict) else None
        if v is not None:
            items.append((pref, v))
    items.sort(key=lambda x: -x[1] if descending else x[1])
    return {pref: i + 1 for i, (pref, _) in enumerate(items)}

cap_rank = rank_by(per_pref, 'capability.homecare_per75')
actual_rank = rank_by(per_pref, 'actual_per_75plus_100k.homecare_patients')

# ── gap_type 分類 (reviewer 採択 4 軸) ──
# top 10 = high (rank <= 10), bottom 10 = low (rank >= 38), middle 中央
def classify_rank(rank, n=47):
    if rank is None:
        return 'unknown'
    if rank <= 10:
        return 'high'
    if rank >= 38:
        return 'low'
    return 'mid'

def gap_type(cap_r, act_r):
    cc = classify_rank(cap_r)
    aa = classify_rank(act_r)
    return f"capability_{cc}_actual_{aa}"

for pref in PREFECTURES_47:
    if pref not in per_pref:
        continue
    cr = cap_rank.get(pref)
    ar = actual_rank.get(pref)
    per_pref[pref]['comparison'] = {
        'capability_rank': cr,
        'actual_rank': ar,
        'rank_gap': (ar - cr) if (cr and ar) else None,  # 正 = capability が actual より上位
        'gap_type': gap_type(cr, ar),
    }

# ── 最終出力 ──
output = {
    '_generated_by': 'scripts/audit_homecare_actual_by_pref.py',
    '_phase': 'Phase 4-3d',
    '_description': '在宅医療 capability proxy vs 実績指標 audit (47県集計、reviewer 採択 P3 proxy caveat 検証用)',
    '_caveat': '本データは観察ラベル化・proxy 検証用であり、医療の質・地域の優劣・政策効果を示すものではない。Phase 4-1 P2-4 confidence grade と同様の解釈ルールが適用される。',
    '_methodology': {
        'source': 'data/static/area_emergency_homecare.json (339 二次医療圏)',
        'aggregation': '都道府県名で SUM (圏域単位の値を県単位に合算)',
        'normalization_per75': '集計値 / 75歳以上人口 × 100000 (capability proxy と同じ単位)',
        'normalization_per100k': '集計値 / 全人口 × 100000 (補助)',
        'rank_basis': 'high = top 10, low = bottom 10 (rank >= 38), mid = それ以外',
        'data_quality': {
            'hospitals': '100%',
            'homecare_facilities': '100%',
            'homecare_patients': '100%',
            'acute_support': '72.3%',
            'emerg / emerg_claims': '7.1% (使用しない、scope 外)',
        },
    },
    'by_prefecture': per_pref,
}

out_path = DATA_DIR / 'homecare_actual_by_pref.json'
with out_path.open('w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"出力: {out_path}")
print(f"size: {out_path.stat().st_size / 1024:.1f} KB")
print(f"47県: {len(per_pref)}")
print()

# ── 簡易 audit summary ──
print("=" * 60)
print("Phase 4-3d: 47県 capability vs actual gap_type 分類")
print("=" * 60)

from collections import Counter
gt_counter = Counter(per_pref[p]['comparison']['gap_type'] for p in per_pref)
for gt, count in sorted(gt_counter.items(), key=lambda x: -x[1]):
    prefs = [p for p in per_pref if per_pref[p]['comparison']['gap_type'] == gt]
    print(f"  {gt}: {count}県 — {'・'.join(prefs[:8])}{'...' if len(prefs) > 8 else ''}")

print()
print("=" * 60)
print("重点県 (P3/P4/P5/P6 候補) の actual vs capability")
print("=" * 60)
focus = ['山口県', '徳島県', '鹿児島県', '岡山県', '広島県', '秋田県', '東京都', '沖縄県']
print(f"{'県名':10} | {'cap_per75':>10} | {'cap_rank':>8} | {'pat_per75':>11} | {'pat_rank':>8} | {'gap_type':<35}")
print("-" * 100)
for pref in focus:
    if pref not in per_pref:
        continue
    d = per_pref[pref]
    cap_v = d['capability']['homecare_per75']
    pat_v = d['actual_per_75plus_100k']['homecare_patients']
    cr = d['comparison']['capability_rank']
    ar = d['comparison']['actual_rank']
    gt = d['comparison']['gap_type']
    print(f"{pref:10} | {cap_v:>10.1f} | {cr:>8} | {pat_v:>11.1f} | {ar:>8} | {gt}")
