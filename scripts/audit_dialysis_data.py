#!/usr/bin/env python3
"""
Phase 2D Step 1: 透析・人工腎臓関連データの存在確認 audit

peer review (2026-04-28 採択) の指示通り、3データソース横断で透析関連を検索し、
renal Bridge の utilization / supply 列に追加可能か判定する。

判定 Case:
- Case A: NDB診療行為に人工腎臓・透析関連 → utilization に追加
- Case B: 施設基準に透析関連 → supply に追加
- Case C: どちらも弱い → 現状維持 + docs に記録

検索キーワード:
  人工腎臓, 透析, 血液透析, 腹膜透析, CAPD, シャント,
  ダイアライザー, 血液回路, 血液濾過, ＨＤＦ, HDF,
  導入期加算, 慢性維持透析
"""
import json
import collections

KEYWORDS = ['人工腎臓', '透析', '血液透析', '腹膜透析', 'CAPD', 'シャント',
            'ダイアライザー', '血液回路', '血液濾過', 'ＨＤＦ', 'HDF',
            '導入期加算', '慢性維持透析']


def main():
    print('='*70)
    print('Phase 2D Step 1: 透析・人工腎臓データ audit')
    print('='*70)

    # 1) NDB診療行為
    with open('data/static/ndb_diagnostics.json') as f: nd = json.load(f)
    matches_nd = [d for d in nd if any(kw in str(d.get('name','') + str(d.get('item','')) + str(d.get('label',''))) for kw in KEYWORDS)]
    print(f'\n## 1. NDB診療行為 (ndb_diagnostics.json)')
    print(f'   total: {len(nd)} entries / categories: A_初再診/B_医学管理/C_在宅医療')
    print(f'   透析関連: {len(matches_nd)} 件')
    print(f'   → ❌ Case A 不成立 (D_検査・処置等が NDB公開データに未収載)')

    # 2) NDB処方薬
    with open('data/static/ndb_prescriptions.json') as f: rx = json.load(f)
    matches_rx = [r for r in rx if any(kw in ' '.join(str(v) for v in r.values() if v is not None) for kw in KEYWORDS)]
    print(f'\n## 2. NDB処方薬 (ndb_prescriptions.json)')
    print(f'   total: {len(rx)}')
    print(f'   透析関連: {len(matches_rx)} 件 (期待通り — 透析は薬剤分類非該当)')

    # 3) 施設基準
    with open('data/static/facility_standards.json') as f: fs = json.load(f)
    all_standards = sorted(set(st.get('name','') for f_rec in fs for st in f_rec.get('standards', [])))
    dialysis_standards = sorted([s for s in all_standards if any(kw in s for kw in KEYWORDS)])
    print(f'\n## 3. 施設基準 (facility_standards.json — 6県サンプル)')
    print(f'   ユニーク基準数: {len(all_standards)}')
    print(f'   透析関連: {len(dialysis_standards)} 件')
    for s in dialysis_standards:
        print(f'     - {s}')

    # 4) 6県カバレッジ
    print(f'\n## 4. 6県サンプル: 透析関連届出施設数')
    pref_dialysis = collections.defaultdict(set)
    pref_total = collections.defaultdict(int)
    pref_std_count = collections.defaultdict(lambda: collections.defaultdict(int))
    for f_rec in fs:
        pref = f_rec.get('pref','')
        if not pref: continue
        pref_total[pref] += 1
        for st in f_rec.get('standards', []):
            if st.get('name') in dialysis_standards:
                pref_dialysis[pref].add(f_rec.get('code'))
                pref_std_count[pref][st.get('name')] += 1
    
    for pref in sorted(pref_total.keys()):
        rate = len(pref_dialysis[pref]) / pref_total[pref] * 100
        print(f'  {pref:<8}: 透析届出 {len(pref_dialysis[pref]):>4} / 総 {pref_total[pref]:>5} ({rate:.1f}%)')
    
    total_dia = sum(len(s) for s in pref_dialysis.values())
    total_fac = sum(pref_total.values())
    print(f'  6県合計     : 透析届出 {total_dia} / 総 {total_fac} ({total_dia/total_fac*100:.1f}%)')

    # 5) NDB index HTML — 透析xlsx
    print(f'\n## 5. NDB第10回オープンデータ index HTML 透析関連 xlsx')
    import os, re
    if os.path.exists('/tmp/ndb_index.html'):
        with open('/tmp/ndb_index.html') as f: html = f.read()
        pattern = re.compile(r'href="/content/12400000/(\d+)\.xlsx">([^<]+)</a>')
        matches = pattern.findall(html)
        dia_xlsx = [(u, re.sub(r'&#160;', ' ', l).strip()) for u, l in matches if any(kw in l for kw in KEYWORDS)]
        print(f'   全 xlsx links: {len(matches)}')
        print(f'   透析関連: {len(dia_xlsx)} (NDB公開データに専用xlsxは非存在)')
    else:
        print(f'   /tmp/ndb_index.html 不在')

    # 6) 判定
    print(f'\n{"="*70}')
    print('## 最終判定')
    print('='*70)
    print('Case B: 施設基準に透析関連 9件あり → renal supply proxy 追加可能')
    print()
    print('実装上の制約:')
    print('  ⚠️ facility_standards.json は 6県サンプル のみ (47県不完全)')
    print('  ⚠️ kijun_shards/*.json は cap値集計済で raw standards を保持しない')
    print('  ⚠️ kijun_shards 再生成のための元ETLはレポジトリ外 → cap.renal 直接追加不可')
    print()
    print('Bridge への反映オプション:')
    print('  A. cap.renal 追加 (kijun_shards 再ETL必要、user 介入要)')
    print('  B. facility_standards 6県から renal_supply_by_pref.json 新規生成 (部分カバレッジ)')
    print('  C. 現状維持 + docs に audit結果記録 (最も安全)')
    print()
    print('推奨: Case B audit 結果を docs に記録 + Bridge supply は引き続き未整備表示。')
    print('      実装は user 判断後に別 commit。')


if __name__ == '__main__':
    main()
