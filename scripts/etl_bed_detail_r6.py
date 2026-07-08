#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P2 ETL: 令和6年度病床機能報告 様式1_病棟票（7地域）→ 二次医療圏×医療機関 集計
医療需給総覧PDF（R6）のスライド #18職員数 / #20病床機能別・医療機関別許可病床数 / #21入院料別 を
ネイティブ再構築するための施設別データ。カルテ(R6)と同一年次で数値一致。

出力: data/static/bed_detail_r6.json
  { source, published, areas: { hsaCode: {pref, area, facilities:[...], totals:{...}} } }
  facilities[i] = { name, code, funcBeds:{高度急性期,急性期,回復期,慢性期,休棟}, beds, wards,
                    staff:{看護師,准看護師,看護補助者,助産師,理学療法士,作業療法士,言語聴覚士,薬剤師,臨床工学技士,管理栄養士,救急救命士},
                    admFees:{入院料名: 病床数} }

hsaコードへの紐付け: (都道府県コード, 二次医療圏名) を area_master.json の (pref_code, siteArea) で照合。
"""
import json, re, os
import openpyxl
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data' / 'raw' / 'source' / '06_病床機能報告' / 'data_R6'
MASTER = ROOT / 'data' / 'hsa' / 'area_master.json'
OUT = ROOT / 'data' / 'static' / 'bed_detail_r6.json'

REGION_FILES = [
    'R6_様式1_北海道東北.xlsx', 'R6_様式1_関東1.xlsx', 'R6_様式1_関東2.xlsx',
    'R6_様式1_中部.xlsx', 'R6_様式1_近畿.xlsx', 'R6_様式1_中国四国.xlsx', 'R6_様式1_九州沖縄.xlsx',
]

# 列インデックス（R6 様式1_病棟票, ヘッダ5行, データは6行目〜）
C_MCODE, C_MNAME = 0, 1
C_PREF, C_AREACODE, C_AREANAME = 2, 3, 4
C_KOSO_NAME = 6
C_WARDCODE = 11
C_FUNC = 15
C_GEN_BEDS, C_RYO_BEDS = 18, 22
C_ADM_FEE = 26            # 算定する入院基本料・特定入院料
STAFF_COLS = {            # 常勤列（非常勤は+1）
    '看護師': 32, '准看護師': 34, '看護補助者': 36, '助産師': 38,
    '理学療法士': 40, '作業療法士': 42, '言語聴覚士': 44, '薬剤師': 46,
    '臨床工学技士': 48, '管理栄養士': 50, '救急救命士': 52,
}
FUNC_KEYS = ['高度急性期', '急性期', '回復期', '慢性期', '休棟']
DATA_START = 6


def num(v):
    if v is None: return 0
    if isinstance(v, (int, float)): return v
    s = str(v).strip().replace(',', '')
    if s in ('', '-', '－', '該当なし'): return 0
    try: return float(s) if '.' in s else int(s)
    except ValueError: return 0


def norm_func(v):
    if v is None: return None
    s = str(v).strip()
    if s.startswith('高度急性期'): return '高度急性期'
    if s.startswith('急性期'): return '急性期'
    if s.startswith('回復期'): return '回復期'
    if s.startswith('慢性期'): return '慢性期'
    if s.startswith('休棟'): return '休棟'
    return None


def pref2(v):
    if v is None: return None
    s = str(v).strip()
    if s.endswith('.0'): s = s[:-2]
    return s.zfill(2)


# 入退棟経路(#56)用: 病床機能を3グループに集約(高度急性期・急性期/回復期/慢性期)
FUNC_GROUPS = ['高度急性期・急性期', '回復期', '慢性期']
def func_group(v):
    f = norm_func(v)
    if f in ('高度急性期', '急性期'): return '高度急性期・急性期'
    if f in ('回復期', '慢性期'): return f
    return None


def main():
    master = json.load(open(MASTER, encoding='utf-8'))['areas']
    # (pref_code, siteArea) -> hsaCode
    key2hsa = {}
    for m in master:
        if m.get('siteArea'):
            key2hsa[(m['pref_code'], m['siteArea'])] = m['code']

    # 施設集計: hsaCode -> mcode -> aggregate
    areas = defaultdict(lambda: defaultdict(lambda: {
        'name': '', 'code': '',
        'funcBeds': {k: 0 for k in FUNC_KEYS},
        'beds': 0, 'wards': 0,
        'staff': {k: 0.0 for k in STAFF_COLS},
        'admFees': defaultdict(int),
    }))
    # 入退棟経路(#56) 病床機能グループ別・年間集計(R6=2024)。カルテ#56の2024列と一致。
    # 入棟前の場所: 院内他病棟149/家庭162/他院175/介護(施設188+医療院201)/出生214/その他227
    # 退棟先の場所: 院内他病棟253/家庭266/他院279/介護(老健292+特養305+医療院318+社福有料331)/死亡等344/その他357
    ADMIT_COLS = {'院内他病棟': [149], '家庭': [162], '他院': [175], '介護': [188, 201], '出生': [214], 'その他': [227]}
    DISCH_COLS = {'院内他病棟': [253], '家庭': [266], '他院': [279], '介護': [292, 305, 318, 331], '死亡等': [344], 'その他': [357]}
    route = defaultdict(lambda: defaultdict(lambda: {'admit': defaultdict(int), 'discharge': defaultdict(int)}))
    unmatched_areas = set()
    total_rows = 0

    for fn in REGION_FILES:
        path = RAW / fn
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb['Sheet1']
        for i, row in enumerate(ws.iter_rows(min_row=DATA_START, values_only=True)):
            mname = row[C_MNAME] if len(row) > C_MNAME else None
            if not mname or str(mname).strip() in ('', '必須項目'):
                continue
            pc = pref2(row[C_PREF])
            area_name = str(row[C_AREANAME]).strip() if row[C_AREANAME] else None
            if not pc or not area_name:
                continue
            hsa = key2hsa.get((pc, area_name))
            if not hsa:
                unmatched_areas.add((pc, area_name))
                continue
            total_rows += 1
            fac = areas[hsa][str(row[C_MCODE])]
            fac['name'] = str(mname).strip()
            fac['code'] = str(row[C_MCODE])
            fac['wards'] += 1
            beds = num(row[C_GEN_BEDS]) + num(row[C_RYO_BEDS])
            fac['beds'] += beds
            fnc = norm_func(row[C_FUNC])
            if fnc:
                fac['funcBeds'][fnc] += beds
            fee = row[C_ADM_FEE]
            if fee and str(fee).strip() not in ('', '-'):
                fac['admFees'][str(fee).strip()] += beds
            for role, col in STAFF_COLS.items():
                fac['staff'][role] += num(row[col] if len(row) > col else 0)
            # 入退棟経路(#56) 病床機能グループ別に年間集計
            fg = func_group(row[C_FUNC])
            if fg:
                for cat, cols in ADMIT_COLS.items():
                    route[hsa][fg]['admit'][cat] += sum(num(row[c] if len(row) > c else 0) for c in cols)
                for cat, cols in DISCH_COLS.items():
                    route[hsa][fg]['discharge'][cat] += sum(num(row[c] if len(row) > c else 0) for c in cols)
        wb.close()
        print(f"[etl] {fn} 完了 (累計行 {total_rows})", flush=True)

    # 整形出力
    out_areas = {}
    for hsa, facs in areas.items():
        m = next((x for x in master if x['code'] == hsa), None)
        fac_list = []
        totals = {'beds': 0, 'wards': 0, 'hospitals': 0, 'funcBeds': {k: 0 for k in FUNC_KEYS},
                  'staff': {k: 0.0 for k in STAFF_COLS}}
        for mc, f in facs.items():
            f['admFees'] = dict(f['admFees'])
            f['staff'] = {k: round(v, 1) for k, v in f['staff'].items()}
            fac_list.append(f)
            totals['beds'] += f['beds']; totals['wards'] += f['wards']; totals['hospitals'] += 1
            for k in FUNC_KEYS: totals['funcBeds'][k] += f['funcBeds'][k]
            for k in STAFF_COLS: totals['staff'][k] += f['staff'][k]
        totals['staff'] = {k: round(v, 1) for k, v in totals['staff'].items()}
        fac_list.sort(key=lambda x: -x['beds'])
        rt = route.get(hsa)
        routes = None
        if rt:
            routes = {}
            for fgk in FUNC_GROUPS:
                d = rt.get(fgk)
                if d and (sum(d['admit'].values()) or sum(d['discharge'].values())):
                    routes[fgk] = {'admit': dict(d['admit']), 'discharge': dict(d['discharge'])}
        out_areas[hsa] = {
            'pref': m['pref'] if m else '', 'area': m['area'] if m else '',
            'facilities': fac_list, 'totals': totals,
            'routes': routes,
        }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({
            'source': '厚労省 令和6年度病床機能報告 様式1_病棟票 (2024年7月1日時点)',
            'published': '2025-09-30',
            'note': '医療機能は施設の自己申告（2024/7/1時点）。許可病床=一般+療養。職員数は常勤のみ集計。',
            'areaCount': len(out_areas),
            'areas': out_areas,
        }, f, ensure_ascii=False)

    print(f"[etl] 完了 areas={len(out_areas)} out={OUT.name} size={OUT.stat().st_size/1e6:.1f}MB")
    if unmatched_areas:
        print(f"[etl] 未突合圏域 {len(unmatched_areas)}: {sorted(unmatched_areas)[:12]}")


if __name__ == '__main__':
    main()
