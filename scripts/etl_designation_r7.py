#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tier B ETL: 医療機関の指定状況（カルテ#7）。6つの指定レジストリの施設を二次医療圏へ割当。
入力: data/raw/source/12_指定/sources.json  (抽出WFの出力 {sources:[{key,label,facilities:[{name,pref,city,hsaArea,kubun}]}]})
解決順: (1)hsaArea名→圏 (2)(pref,city)→圏 (3)(pref,norm施設名)→圏(病床機能報告の施設名照合)
出力: data/static/designation_r7.json  {areas:{code:{facilities:[{name,designations:[...]}]}}}

★カルテ#7は各種一覧の公表版で構成。本実装は最新公表版のため版ずれあり(カルテと厳密一致せず=
「最新の指定状況」として提示)。
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'raw' / 'source' / '12_指定' / 'sources.json'
MASTER = ROOT / 'data' / 'hsa' / 'area_master.json'
BED = ROOT / 'data' / 'static' / 'bed_detail_r6.json'
AREA_DEMO = ROOT / 'data' / 'static' / 'area_demographics.json'
OUT = ROOT / 'data' / 'static' / 'designation_r7.json'

DESIG_LABEL = {
    'chiiki_shien': '地域医療支援', 'kyumei': '救命救急センター', 'saigai': '災害拠点',
    'shusanki': '周産期母子', 'gan': 'がん診療連携',
}
LEGAL = re.compile(r'(医療法人社団|医療法人財団|医療法人|社会医療法人|独立行政法人|国立研究開発法人|'
                   r'国立大学法人|公立大学法人|地方独立行政法人|一般財団法人|公益財団法人|一般社団法人|'
                   r'公益社団法人|社会福祉法人|学校法人|日本赤十字社|恩賜財団|済生会|厚生農業協同組合連合会|'
                   r'国家公務員共済組合連合会|地域医療機能推進機構|労働者健康安全機構|\(福\)|\(医\)|（福）|（医）)')


def norm(s):
    s = str(s or '').strip()
    s = LEGAL.sub('', s)
    s = re.sub(r'[\s　・（）\(\)]', '', s)
    return s


def norm_area(s):
    s = str(s or '').strip()
    return re.sub(r'(二次医療圏|医療圏|構想区域|区域|地域|圏)$', '', s)


def main():
    master = json.load(open(MASTER, encoding='utf-8'))['areas']
    # (1) hsaArea名 → code
    area2code = {}
    for m in master:
        for nm in {m['area'], m.get('siteArea', '')}:
            if nm:
                area2code[(m['pref'], norm_area(nm))] = m['code']
    # (2) (pref, 市区町村名) → code
    prefarea = {(m['pref'], m['area']): m['code'] for m in master}
    prefarea.update({(m['pref'], m.get('siteArea')): m['code'] for m in master if m.get('siteArea')})
    muni2code = {}
    for a in json.load(open(AREA_DEMO, encoding='utf-8')):
        code = prefarea.get((a['pref'], a['area']))
        if not code:
            continue
        for mu in a.get('munis', []):
            muni2code[(a['pref'], mu['name'])] = code
            muni2code[(a['pref'], re.sub(r'(市|区|町|村)$', '', mu['name']))] = code
    # (3) (pref, norm施設名) → code  (病床機能報告の施設名)。pref別リストで接尾辞ファジー照合も。
    name2code = {}
    pref2names = {}
    bd = json.load(open(BED, encoding='utf-8'))
    code2pref = {m['code']: m['pref'] for m in master}
    for code, a in bd['areas'].items():
        pref = code2pref.get(code, a.get('pref', ''))
        for f in a['facilities']:
            nn = norm(f['name'])
            name2code[(pref, nn)] = code
            pref2names.setdefault(pref, []).append((nn, code))
    for pref in pref2names:  # 長い名前優先(部分一致の誤マッチ低減)
        pref2names[pref].sort(key=lambda x: -len(x[0]))

    def fuzzy(pref, nn):
        if len(nn) < 5:
            return None
        cand = None
        for bn, code in pref2names.get(pref, []):
            if len(bn) < 5:
                continue
            # 指定名の接尾辞がbed施設名(法人格接頭の差) or 逆
            if nn.endswith(bn) or bn.endswith(nn) or (bn in nn) or (nn in bn):
                cand = code
                break  # 長い順ゆえ最長一致
        return cand

    def resolve(fac):
        pref = fac.get('pref', '')
        if fac.get('hsaArea'):
            c = area2code.get((pref, norm_area(fac['hsaArea'])))
            if c:
                return c
        if fac.get('city'):
            city = fac['city'].strip()
            c = muni2code.get((pref, city)) or muni2code.get((pref, re.sub(r'(市|区|町|村)$', '', city)))
            if c:
                return c
        nn = norm(fac.get('name', ''))
        return name2code.get((pref, nn)) or fuzzy(pref, nn)

    sources = json.load(open(SRC, encoding='utf-8'))['sources']
    # code -> {norm施設名: {'name':表示名, 'desig':set}}
    areas = {}
    stats = {}
    for s in sources:
        key = s['key']; matched = 0; total = 0
        for fac in s['facilities']:
            total += 1
            code = resolve(fac)
            if not code:
                continue
            matched += 1
            fa = areas.setdefault(code, {})
            nn = norm(fac['name'])
            rec = fa.setdefault(nn, {'name': fac['name'], 'desig': set()})
            rec['desig'].add(key)
        stats[key] = {'label': s['label'], 'total': total, 'matched': matched}

    out = {}
    mbycode = {m['code']: m for m in master}
    DORDER = ['chiiki_shien', 'kyumei', 'saigai', 'shusanki', 'gan']
    for code, facs in areas.items():
        m = mbycode.get(code, {})
        fl = []
        for nn, rec in facs.items():
            fl.append({'name': rec['name'], 'designations': [d for d in DORDER if d in rec['desig']]})
        fl.sort(key=lambda x: -len(x['designations']))
        out[code] = {'pref': m.get('pref', ''), 'area': m.get('area', ''), 'facilities': fl}

    payload = {
        'source': '各種指定医療機関一覧(地域医療支援病院R7.9/救命救急R7.4/災害拠点R8.4/周産期R6.4/がん拠点R8.4) 厚生労働省',
        'note': '公表最新版の指定状況を施設名・二次医療圏名・住所で二次医療圏へ割当。版ずれによりカルテ#7とは差がある場合あり(最新の指定状況として提示)。脳卒中PSC(日本脳卒中学会)は都道府県別HTMLのため今回未収載。',
        'labels': DESIG_LABEL, 'order': DORDER, 'stats': stats,
        'areaCount': len(out), 'areas': out,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f"[desig] 圏={len(out)} out={OUT.name}")
    for k, v in stats.items():
        print(f"  {v['label']}: {v['matched']}/{v['total']} 突合")
    ya = out.get('2606')
    if ya:
        print('[desig] 山城南:', [(f['name'], f['designations']) for f in ya['facilities']])


if __name__ == '__main__':
    main()
