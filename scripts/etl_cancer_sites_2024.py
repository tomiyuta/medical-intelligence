#!/usr/bin/env python3
"""
Phase 4-3 Cancer Sites ETL
出典: 国立がん研究センター がん情報サービス
URL : https://ganjoho.jp/reg_stat/statistics/data/dl/index.html
File: pref_CancerSite_mortalityASR75(1995-2024).xls (3.4 MB)
基準: 1985年昭和60年モデル人口、75歳未満年齢調整死亡率 (人口10万対)

抽出: 5大がん部位 + 全部位 (compare 用)
- 胃        (02103, C16)
- 大腸      (02145, C18-C20)
- 肝・肝内胆管 (02106, C22)
- 肺        (02110, C33-C34)
- 乳房 (女性) (02112, C50)
- 前立腺 (男) (02115, C61)
- 全部位     (02100, C00-C97)

最新年: 2024 を中心に、5年移動平均も計算。
"""
import xlrd
import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/raw_cancer/pref_CancerSite_mortalityASR75_1995-2024.xls'

SITE_CODES = {
    '02100': {'name': '全部位', 'icd': 'C00-C97', 'short': 'all'},
    '02103': {'name': '胃', 'icd': 'C16', 'short': 'stomach'},
    '02145': {'name': '大腸', 'icd': 'C18-C20', 'short': 'colorectal'},
    '02106': {'name': '肝・肝内胆管', 'icd': 'C22', 'short': 'liver'},
    '02110': {'name': '肺・気管', 'icd': 'C33-C34', 'short': 'lung'},
    '02112': {'name': '乳房', 'icd': 'C50', 'short': 'breast', 'sex_only': '女'},
    '02115': {'name': '前立腺', 'icd': 'C61', 'short': 'prostate', 'sex_only': '男'},
}
TARGET_YEAR = 2024
PREFS_47 = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県']

def main():
    wb = xlrd.open_workbook(str(SOURCE))
    ws = wb.sheet_by_name('asr75')
    
    # ヘッダから year 列の index を取得
    header = [ws.cell(0, c).value for c in range(ws.ncols)]
    year_cols = {}
    for c in range(5, ws.ncols):
        v = header[c]
        if isinstance(v, (int, float)) and v >= 1995:
            year_cols[int(v)] = c
    print(f"検出年: {sorted(year_cols.keys())[0]}~{sorted(year_cols.keys())[-1]} ({len(year_cols)} 年)")
    
    # 5 部位 + 全部位 を抽出
    output = {
        '_phase': 'Phase 4-3 Cancer Sites ETL',
        '_source': '国立がん研究センター がん情報サービス',
        '_source_url': 'https://ganjoho.jp/reg_stat/statistics/data/dl/index.html',
        '_source_file': 'pref_CancerSite_mortalityASR75(1995-2024).xls',
        '_basis': '1985年昭和60年モデル人口、75歳未満年齢調整死亡率',
        '_unit': '人口10万対',
        '_year': TARGET_YEAR,
        '_generated_at': '2026-04-30',
        '_sites': SITE_CODES,
        'national': {},
        'prefectures': {},
        'recent5y_avg': {},  # 2020-2024 の 5 年平均
    }
    
    # 5 年平均用 (2020-2024)
    avg_years = [2020, 2021, 2022, 2023, 2024]
    
    for r in range(1, ws.nrows):
        code = str(ws.cell(r, 0).value).strip()
        site = ws.cell(r, 1).value.strip()
        pref = ws.cell(r, 3).value.strip()
        sex = ws.cell(r, 4).value.strip()
        
        if code not in SITE_CODES: continue
        if pref not in PREFS_47 and pref != '全国': continue
        
        site_short = SITE_CODES[code]['short']
        
        # 最新年 (2024) の値
        year_col = year_cols.get(TARGET_YEAR)
        if year_col is None: continue
        try:
            v = ws.cell(r, year_col).value
            if not isinstance(v, (int, float)) or v == '':
                v = None
            else:
                v = round(float(v), 2)
        except: v = None
        
        # 5 年平均 (2020-2024)
        recent_vals = []
        for y in avg_years:
            yc = year_cols.get(y)
            if yc:
                try:
                    yv = ws.cell(r, yc).value
                    if isinstance(yv, (int, float)) and yv != '':
                        recent_vals.append(float(yv))
                except: pass
        avg5y = round(statistics.mean(recent_vals), 2) if recent_vals else None
        
        # store
        target = output['national'] if pref == '全国' else output['prefectures'].setdefault(pref, {})
        target.setdefault(site_short, {})[sex] = v
        
        # 5 年平均
        avg_target = output['recent5y_avg'].setdefault(pref, {})
        avg_target.setdefault(site_short, {})[sex] = avg5y
    
    # 出力
    out_path = ROOT / 'data/static/cancer_sites_mortality_2024.json'
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2))
    print(f"[OK] {out_path} ({out_path.stat().st_size} bytes)")
    
    # 検証
    print(f"\n=== 検証: 47 県 × 7 部位 (全+5+乳/前) × 3 性 ===")
    print(f"national keys: {list(output['national'].keys())}")
    print(f"prefectures count: {len(output['prefectures'])}")
    sample = list(output['prefectures'].keys())[0]
    print(f"sample [{sample}]: {list(output['prefectures'][sample].keys())}")
    print(f"\n=== 全国 全部位 (2024) ===")
    print(f"  男女計: {output['national']['all'].get('男女計')}")
    print(f"  男:    {output['national']['all'].get('男')}")
    print(f"  女:    {output['national']['all'].get('女')}")

main()
