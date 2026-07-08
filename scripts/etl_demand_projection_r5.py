#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
P4 ETL: 受療率法による将来患者数推計（医療需給総覧 #30 1日平均患者数 / #32-35 ICD別）
将来患者数(圏,年,傷病,入院/外来) = Σ_年齢[ 都道府県受療率(年齢,傷病) × 圏将来人口(年齢,年) ] / 10万
医療需給総覧は「受療率は都道府県のものを使用」と明記(#30注記)。

入力:
  患者調査 令和5年 都道府県編 第40表 その2(入院)/その3(外来) CSV(cp932)
    行: 都道府県ヘッダ(1列) → 総数 → ICD大分類(Ⅰ..) → 中分類(先頭全角空白)
    列(総数gender): col1=総数(全年齢), col2-11=年齢10区分(0-4,5-14,15-24,25-34,35-44,45-54,55-64,65-74,75-84,85+)
  population_r5.json: 圏×年×5歳階級18(bands)

出力: data/static/demand_projection_r5.json
"""
import csv, json, re
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parent.parent
BASE = Path('/Users/yutatomi/Downloads/01_投資・定量分析/MedicalCRM_Data/P4_将来推計')
CSV_IN = BASE / '受療率_都道府県_入院.csv'
CSV_OUT = BASE / '受療率_都道府県_外来.csv'
POP = ROOT / 'data' / 'static' / 'population_r5.json'
MASTER = ROOT / 'data' / 'hsa' / 'area_master.json'
OUT = ROOT / 'data' / 'static' / 'demand_projection_r5.json'

# 受療率の年齢10区分 → population 5歳階級bandインデックス
AGE_MAP = [[0], [1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17]]
RATE_COLS = list(range(2, 12))   # col2-11 = 年齢10区分の受療率(総数gender)
PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
         '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県',
         '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県',
         '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
         '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県']
# CSVは短縮県名(青森/京都/大阪、北海道のみ完全)。短縮→完全 の対応を作る
SHORT2FULL = {}
for p in PREFS:
    short = p if p == '北海道' else p[:-1]   # 県/都/府 を除去
    SHORT2FULL[short] = p
ROMAN = tuple('ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ')
# 疾患別推計(#46-49)用の中分類・再掲行 → 表示名
DISEASES = {
    '（悪性新生物＜腫瘍＞）（再掲）': 'がん',
    '（脳血管疾患）（再掲）': '脳卒中',
    '虚血性心疾患': '虚血性心疾患',
    '糖尿病': '糖尿病',
}


def num(v):
    v = str(v).strip()
    if v in ('', '-', '－', '…', '.', '·'):
        return 0.0
    try:
        return float(v.replace(',', ''))
    except ValueError:
        return 0.0


def parse_rates(path):
    """{都道府県: {傷病名: [10年齢区分の受療率]}}。傷病='総数'＋ICD大分類。"""
    rows = list(csv.reader(open(path, encoding='cp932')))
    out = defaultdict(dict)
    cur = None
    for r in rows:
        head = r[0].strip() if r else ''
        # 都道府県ヘッダ(先頭列のみ・短縮名 or 全国)
        if head in SHORT2FULL and all(not c.strip() for c in r[1:]):
            cur = SHORT2FULL[head]
            continue
        if head == '全国' and all(not c.strip() for c in r[1:]):
            cur = '全国'
            continue
        if cur is None or len(r) < 12:
            continue
        label = r[0].strip()
        if not label:
            continue
        # 総数 / ICD大分類(ローマ数字始まり) / 主要4疾患(#46-49)を捕捉。他の中分類は除外
        norm = re.sub(r'\s+', '', label)
        if label == '総数':
            key = '総数'
        elif label.startswith(ROMAN):
            key = re.sub(r'\s+', ' ', label)
        elif norm in {re.sub(r'\s+', '', k) for k in DISEASES}:
            # 疾患別(表示名で格納)
            dname = next(v for k, v in DISEASES.items() if re.sub(r'\s+', '', k) == norm)
            key = 'D:' + dname
        else:
            continue
        out[cur][key] = [num(r[c]) for c in RATE_COLS]
    return out


def project(rates_by_disease, pop_years, years):
    """圏の年次患者数を傷病別に推計。返り: {傷病: {年: 患者数}}"""
    res = {}
    for disease, rates in rates_by_disease.items():
        yr = {}
        for y in years:
            bands = pop_years[str(y)]['bands']
            total = 0.0
            for i, rate in enumerate(rates):
                pop_grp = sum(bands[b] for b in AGE_MAP[i])
                total += rate * pop_grp / 100000.0
            yr[str(y)] = round(total, 1)
        res[disease] = yr
    return res


def main():
    inp = parse_rates(CSV_IN)
    outp = parse_rates(CSV_OUT)
    print(f"[demand] 受療率 入院={len(inp)}都道府県 外来={len(outp)}都道府県", flush=True)

    popdata = json.load(open(POP, encoding='utf-8'))
    years = popdata['years']
    master = {m['code']: m for m in json.load(open(MASTER, encoding='utf-8'))['areas']}
    pref_of = {c: m['pref'] for c, m in master.items()}

    areas = {}
    for code, a in popdata['areas'].items():
        pref = pref_of.get(code)
        if not pref or pref not in inp:
            continue
        adm = project(inp[pref], a['years'], years)     # 入院(総数+ICD大分類+D:疾患)
        amb = project(outp.get(pref, {}), a['years'], years)  # 外来
        # 疾患別(#46-49)を分離: D:接頭辞 → {疾患: {入院:{年}, 外来:{年}}}
        diseases = {}
        for k in list(adm.keys()):
            if k.startswith('D:'):
                dn = k[2:]
                diseases[dn] = {'inpatient': adm.pop(k), 'outpatient': amb.pop(k, {})}
        for k in list(amb.keys()):
            if k.startswith('D:'):
                amb.pop(k)
        # 全国受療率ベースの総数推計(#31 受療率の比較 用・2023年受療率)
        national = None
        if '全国' in inp:
            nat_adm = project({'総数': inp['全国']['総数']}, a['years'], years)['総数'] if '総数' in inp['全国'] else {}
            nat_amb = project({'総数': outp['全国']['総数']}, a['years'], years)['総数'] if '全国' in outp and '総数' in outp['全国'] else {}
            national = {'inpatient': nat_adm, 'outpatient': nat_amb}
        areas[code] = {
            'pref': a['pref'], 'area': a['area'],
            'inpatient': adm, 'outpatient': amb, 'diseases': diseases,
            'national': national,
        }

    payload = {
        'source': '推計: 令和5年患者調査 都道府県別受療率(第40表) × 社人研 令和5年推計人口',
        'note': '受療率法。将来患者数=Σ_年齢[都道府県受療率×圏将来人口]/10万。受療率は都道府県値を使用(医療需給総覧#30準拠)。1日平均患者数。',
        'years': years, 'areaCount': len(areas), 'areas': areas,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    print(f"[demand] 圏={len(areas)} out={OUT.stat().st_size/1e6:.1f}MB")
    # 検証: 山城南 総数 入院/外来
    ya = areas.get('2606')
    if ya:
        print("[demand] 山城南 総数 入院1日平均:", {y: ya['inpatient']['総数'][y] for y in ['2020', '2030', '2040', '2050']})
        print("[demand] 山城南 総数 外来1日平均:", {y: ya['outpatient']['総数'][y] for y in ['2020', '2030', '2040', '2050']})


if __name__ == '__main__':
    main()
