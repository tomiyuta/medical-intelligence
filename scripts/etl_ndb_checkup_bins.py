#!/usr/bin/env python3
"""
etl_ndb_checkup_bins.py — NDB第10回 特定健診 検査値階層別分布 ETL汎用化

入力: data/raw_ndb_checkup/{metric}_*.xlsx (Phase 1: 5項目)
出力: data/static/ndb_checkup_bins.json (階級分布保持)
       data/static/ndb_checkup_risk_rates.json (リスク率派生)

Phase 1 対象 (peer review 2026-04-28):
- BMI (≥25 リスク閾値)
- HbA1c (≥6.5%)
- 収縮期血圧 (≥140 mmHg)
- LDLコレステロール (≥140 mg/dL)
- CGA分類 or 尿蛋白 (1+以上)

NDBオープンデータ 階級分布Excel の標準レイアウト:
  row 0: タイトル
  row 1-3: ヘッダー (都道府県/性別/年齢階級/階級値)
  row 5-: データ (都道府県, 階級値, 男40-44, 男45-49, ..., 男70-74, 男中計, 女...)

注: ファイル個別の構造差異 (cols/rows/階級境界) を自動検出して処理。
    実装は Excel 入手後に raw データを見て確定する。
"""
import json
import openpyxl
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data' / 'raw_ndb_checkup'
OUT_BINS = ROOT / 'data' / 'static' / 'ndb_checkup_bins.json'
OUT_RATES = ROOT / 'data' / 'static' / 'ndb_checkup_risk_rates.json'

# Phase 1 リスク閾値定義
RISK_THRESHOLDS = {
    'BMI': {'risk_key': 'bmi_ge_25', 'threshold': 25.0, 'direction': '>='},
    'HbA1c': {'risk_key': 'hba1c_ge_6_5', 'threshold': 6.5, 'direction': '>='},
    '収縮期血圧': {'risk_key': 'sbp_ge_140', 'threshold': 140.0, 'direction': '>='},
    'LDLコレステロール': {'risk_key': 'ldl_ge_140', 'threshold': 140.0, 'direction': '>='},
    'LDL': {'risk_key': 'ldl_ge_140', 'threshold': 140.0, 'direction': '>='},
    '尿蛋白': {'risk_key': 'urine_protein_ge_1plus', 'threshold': '1+', 'direction': 'ordinal_ge'},
}

def detect_metric_from_filename(fname):
    """ファイル名から metric を推定"""
    for key in RISK_THRESHOLDS:
        if key in fname: return key
    return None

def parse_bin_label(label):
    """階級ラベル '6.5-6.9' '25.0未満' '30.0以上' 等から (min, max) を抽出"""
    if not label or not isinstance(label, str): return None, None
    label = label.replace('～', '-').replace(',', '').strip()
    m = re.match(r'([\d.]+)\s*[-]\s*([\d.]+)', label)
    if m: return float(m.group(1)), float(m.group(2))
    m = re.match(r'([\d.]+)\s*未満', label)
    if m: return None, float(m.group(1))
    m = re.match(r'([\d.]+)\s*以上', label)
    if m: return float(m.group(1)), None
    return None, None

def extract_bins_from_xlsx(xlsx_path, metric):
    """raw Excel から bin 別 県別 件数を抽出
    実装: Excel構造を見て調整 (Phase 1 取得後に確定)
    """
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    records = []
    last_pref = None
    for r in range(6, ws.max_row + 1):
        pref_cell = ws.cell(r, 1).value
        if pref_cell and pref_cell.strip():
            last_pref = pref_cell.strip()
        if not last_pref: continue
        bin_label = ws.cell(r, 2).value
        if not bin_label: continue
        # 男中計 = col 10, 女中計 = col 18 (NDB標準形式)
        male_total = ws.cell(r, 10).value if isinstance(ws.cell(r, 10).value, (int, float)) else 0
        female_total = ws.cell(r, 18).value if isinstance(ws.cell(r, 18).value, (int, float)) else 0
        bin_min, bin_max = parse_bin_label(str(bin_label))
        records.append({
            'pref': last_pref,
            'metric': metric,
            'bin_label': str(bin_label),
            'bin_min': bin_min,
            'bin_max': bin_max,
            'count_male': male_total,
            'count_female': female_total,
            'count_total': male_total + female_total,
        })
    wb.close()
    return records

def compute_risk_rate(records, metric):
    """各県の閾値超過率を計算"""
    if metric not in RISK_THRESHOLDS: return {}
    rt = RISK_THRESHOLDS[metric]
    threshold = rt['threshold']
    rates = {}
    by_pref = {}
    for rec in records:
        by_pref.setdefault(rec['pref'], []).append(rec)
    for pref, recs in by_pref.items():
        total = sum(r['count_total'] for r in recs)
        if total == 0: continue
        if rt['direction'] == '>=':
            ge_count = sum(r['count_total'] for r in recs if r['bin_min'] is not None and r['bin_min'] >= threshold)
        elif rt['direction'] == 'ordinal_ge':
            # 1+, 2+, 3+ 以上をカウント (尿蛋白)
            ge_count = sum(r['count_total'] for r in recs if r['bin_label'] and any(k in r['bin_label'] for k in ['1+', '2+', '3+', '4+']))
        else:
            ge_count = 0
        rates[pref] = {
            'rate': round(ge_count/total*1000)/10,
            'denominator': total,
            'numerator': ge_count,
        }
    return rates

def main():
    if not RAW.exists():
        print(f'ERROR: {RAW} not found. Place NDB checkup Excel files first.')
        sys.exit(1)
    
    all_bins = []
    all_rates = {}
    for xlsx in sorted(RAW.glob('*.xlsx')):
        metric = detect_metric_from_filename(xlsx.name)
        if not metric:
            print(f'  SKIP: {xlsx.name} (metric unrecognized)')
            continue
        print(f'  ETL: {xlsx.name} → metric={metric}')
        records = extract_bins_from_xlsx(xlsx, metric)
        all_bins.extend(records)
        rates = compute_risk_rate(records, metric)
        rt = RISK_THRESHOLDS[metric]
        all_rates[rt['risk_key']] = {
            'metric': metric,
            'threshold': rt['threshold'],
            'direction': rt['direction'],
            'by_pref': rates,
        }
    
    # 保存
    with open(OUT_BINS, 'w', encoding='utf-8') as f:
        json.dump({
            'source': 'NDB第10回オープンデータ 特定健診 検査値階層別分布 (令和4年度)',
            'data': all_bins,
        }, f, ensure_ascii=False, indent=2)
    print(f'\n保存: {OUT_BINS} ({len(all_bins)} records)')
    
    with open(OUT_RATES, 'w', encoding='utf-8') as f:
        json.dump({
            'source': 'NDB第10回オープンデータ 特定健診 リスク該当者率 (派生)',
            'risk_rates': all_rates,
        }, f, ensure_ascii=False, indent=2)
    print(f'保存: {OUT_RATES} ({len(all_rates)} risk metrics)')


if __name__ == '__main__':
    main()
