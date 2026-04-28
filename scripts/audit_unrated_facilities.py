#!/usr/bin/env python3
"""
audit_unrated_facilities.py — Tier C/D → '未評価' ラベル整理 (commit 2abae89) の妥当性検証

目的:
- kijun_shards 全47都道府県を走査
- tier/score の有無を集計
- 「未評価」施設の全体比率・都道府県別比率・capability有無別比率を出力

出力先: コンソール + JSON (data/static/audit_unrated.json)
"""
import json
import os
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent.parent
SHARD_DIR = ROOT / 'data' / 'static' / 'kijun_shards'
SUMMARY_PATH = ROOT / 'data' / 'static' / 'facility_standards_summary.json'

def main():
    # サマリ読込で総施設数確認
    with open(SUMMARY_PATH) as f:
        summary = json.load(f)
    summary_total = summary.get('total_facilities')
    summary_prefs = summary.get('prefectures', [])
    
    print(f'=== Audit: 未評価施設の実態 ===')
    print(f'Source summary total_facilities: {summary_total:,}')
    print(f'Shards expected: 47')
    print()
    
    # 集計
    pref_stats = {}
    global_stats = {
        'total': 0,
        'tier_present': 0,    # f.t (=tier) が空でない
        'tier_absent': 0,
        'score_present': 0,   # f.sc (=score) が存在し非null
        'score_absent': 0,
        'has_caps_only': 0,   # caps はあるが tier/score なし
        'tier_dist': defaultdict(int),
    }
    
    cap_keys = ['imaging','surgery','acute','rehab','homecare','oncology','psychiatry','pediatric','infection','dx_it']
    cap_unrated = defaultdict(lambda: {'total':0,'unrated':0})  # cap別の未評価率
    
    for pref in summary_prefs:
        path = SHARD_DIR / f'{pref}.json'
        if not path.exists():
            print(f'  WARN: shard missing: {pref}')
            continue
        with open(path) as f:
            data = json.load(f)
        
        n = len(data)
        tier_present = sum(1 for d in data if d.get('t') and d.get('t') != '')
        score_present = sum(1 for d in data if d.get('sc') is not None)
        has_caps_only = sum(1 for d in data if d.get('cap') and not (d.get('t') or d.get('sc')))
        
        tier_dist = defaultdict(int)
        for d in data:
            t = d.get('t') or 'unrated'
            tier_dist[t] += 1
        
        pref_stats[pref] = {
            'total': n,
            'tier_present': tier_present,
            'tier_absent': n - tier_present,
            'score_present': score_present,
            'unrated_pct': round((n - tier_present) / n * 100, 1) if n else 0.0,
            'tier_dist': dict(tier_dist),
        }
        
        global_stats['total'] += n
        global_stats['tier_present'] += tier_present
        global_stats['tier_absent'] += (n - tier_present)
        global_stats['score_present'] += score_present
        global_stats['has_caps_only'] += has_caps_only
        for t, cnt in tier_dist.items():
            global_stats['tier_dist'][t] += cnt
        
        # cap別の未評価率
        for cap in cap_keys:
            for d in data:
                if d.get('cap', {}).get(cap, 0) > 0:
                    cap_unrated[cap]['total'] += 1
                    if not (d.get('t') or '').strip():
                        cap_unrated[cap]['unrated'] += 1
    
    # 全体結果
    G = global_stats
    G['unrated_pct'] = round(G['tier_absent'] / G['total'] * 100, 2) if G['total'] else 0.0
    G['rated_pct'] = round(G['tier_present'] / G['total'] * 100, 2) if G['total'] else 0.0
    G['tier_dist'] = dict(G['tier_dist'])
    
    print(f'## 全体集計')
    print(f'  集計対象施設: {G["total"]:,}')
    print(f'  Tier 付与あり: {G["tier_present"]:,} ({G["rated_pct"]}%)')
    print(f'  Tier なし(未評価): {G["tier_absent"]:,} ({G["unrated_pct"]}%)')
    print(f'  score 付与あり: {G["score_present"]:,}')
    print(f'  caps のみ存在 (tier/score なし): {G["has_caps_only"]:,}')
    print()
    print(f'## Tier 分布')
    for t, c in sorted(G['tier_dist'].items()):
        pct = c / G['total'] * 100
        print(f'  {t:>10}: {c:>7,} ({pct:.2f}%)')
    print()
    
    # 都道府県別 (未評価率の高い順)
    print(f'## 都道府県別 未評価率 (top 10)')
    sorted_prefs = sorted(pref_stats.items(), key=lambda x: -x[1]['unrated_pct'])
    print(f'  {"県":<8} {"全施設":>8} {"未評価":>8} {"未評価率":>10}')
    for pref, st in sorted_prefs[:10]:
        print(f'  {pref:<8} {st["total"]:>8,} {st["tier_absent"]:>8,} {st["unrated_pct"]:>9.1f}%')
    print()
    print(f'## 都道府県別 未評価率 (bottom 5, 評価率高い)')
    for pref, st in sorted_prefs[-5:]:
        print(f'  {pref:<8} {st["total"]:>8,} {st["tier_absent"]:>8,} {st["unrated_pct"]:>9.1f}%')
    print()
    
    # capability別
    print(f'## Capability 別 未評価率 (各cap保有施設のうちTierなし比率)')
    print(f'  {"cap":<12} {"保有施設":>8} {"未評価":>8} {"未評価率":>10}')
    cap_results = {}
    for cap in cap_keys:
        d = cap_unrated[cap]
        pct = round(d['unrated']/d['total']*100, 1) if d['total'] else 0
        cap_results[cap] = {'total': d['total'], 'unrated': d['unrated'], 'unrated_pct': pct}
        print(f'  {cap:<12} {d["total"]:>8,} {d["unrated"]:>8,} {pct:>9.1f}%')
    print()
    
    # 結果をJSON保存
    out = {
        'summary': {
            'total_facilities': G['total'],
            'tier_present': G['tier_present'],
            'tier_absent_unrated': G['tier_absent'],
            'unrated_pct': G['unrated_pct'],
            'rated_pct': G['rated_pct'],
            'score_present': G['score_present'],
            'has_caps_only': G['has_caps_only'],
            'tier_distribution': G['tier_dist'],
        },
        'by_prefecture': pref_stats,
        'by_capability': cap_results,
        'methodology': '未評価=Tier欄(t)が空または存在しない施設。kijun_shards(47都道府県)を走査し集計。'
    }
    
    out_path = ROOT / 'data' / 'static' / 'audit_unrated.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f'結果JSON保存: {out_path}')
    print()
    print(f'## Summary line')
    print(f'未評価施設: {G["tier_absent"]:,} / {G["total"]:,} ({G["unrated_pct"]:.1f}%)')

if __name__ == '__main__':
    main()
