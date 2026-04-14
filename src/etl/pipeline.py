#!/usr/bin/env python3
"""
Medical Intelligence Platform — Master ETL Pipeline
====================================================
Processes 7 government open data sources into a unified analytical database.
All data sourced from public government statistics (厚労省/総務省/社人研).
Zero proprietary data dependencies.
"""
import pandas as pd
import numpy as np
import os, json, sys
from pathlib import Path
from datetime import datetime

RAW = Path(os.path.expanduser("~/Downloads/01_投資・定量分析/MedicalCRM_Data"))
OUT = Path(os.path.expanduser("~/Projects/medical-intelligence/data/processed"))
OUT.mkdir(parents=True, exist_ok=True)

PREF_MAP = {
    "01":"北海道","02":"青森県","03":"岩手県","04":"宮城県","05":"秋田県",
    "06":"山形県","07":"福島県","08":"茨城県","09":"栃木県","10":"群馬県",
    "11":"埼玉県","12":"千葉県","13":"東京都","14":"神奈川県","15":"新潟県",
    "16":"富山県","17":"石川県","18":"福井県","19":"山梨県","20":"長野県",
    "21":"岐阜県","22":"静岡県","23":"愛知県","24":"三重県","25":"滋賀県",
    "26":"京都府","27":"大阪府","28":"兵庫県","29":"奈良県","30":"和歌山県",
    "31":"鳥取県","32":"島根県","33":"岡山県","34":"広島県","35":"山口県",
    "36":"徳島県","37":"香川県","38":"愛媛県","39":"高知県","40":"福岡県",
    "41":"佐賀県","42":"長崎県","43":"熊本県","44":"大分県","45":"宮崎県",
    "46":"鹿児島県","47":"沖縄県"
}

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

# ============================================================
# ETL 1: Medical Facilities Master (97,024 records)
# ============================================================
def etl_facilities():
    log("ETL-1: Medical Facilities Master")
    src = RAW / "01_医療機関マスタ/scraper/output/latest/all_med_inst_cd.csv"
    df = pd.read_csv(src, header=None, encoding='utf-8',
                     names=['facility_code_10','facility_code_7','facility_name','zip_code','address'], dtype={'facility_code_10': str, 'facility_code_7': str, 'zip_code': str})
    df['prefecture_code'] = df['facility_code_10'].str[:2]
    df['prefecture_name'] = df['prefecture_code'].map(PREF_MAP)
    df['facility_type'] = np.where(df['facility_code_10'].str[2] == '1', 'hospital', 'clinic')
    out = OUT / "facilities.csv"
    df.to_csv(out, index=False, encoding='utf-8')
    log(f"  → {len(df):,} facilities → {out.name} ({out.stat().st_size//1024}KB)")
    return df

# ============================================================
# ETL 2: Municipality Demographics (1,741 records × 125 items)
# ============================================================
def etl_demographics():
    log("ETL-2: Municipality Demographics (SSDSE-A)")
    src = RAW / "03_人口動態_SSDSE/SSDSE-A-2025.csv"
    df = pd.read_csv(src, encoding='cp932')
    
    # Extract header rows
    code_row = list(df.columns)
    name_row = df.iloc[1].tolist()
    
    # Skip metadata rows, use data from row index 2 onward
    data = df.iloc[2:].copy()
    data.columns = code_row
    data = data.rename(columns={
        'SSDSE-A-2025': 'region_code',
        'Prefecture': 'prefecture',
        'Municipality': 'municipality'
    })
    
    # Key demographic columns
    key_cols = {
        'A1101': 'total_population',
        'A1301': 'population_under_15',
        'A1303': 'population_65_plus',
        'A1419': 'population_75_plus',
        'A1700': 'foreign_population',
        'A4101': 'births',
        'A4200': 'deaths',
        'A7101': 'households',
        'A710101': 'general_households',
        'I510120': 'hospitals',
        'I5102': 'clinics',
        'I5103': 'dental_clinics',
        'I6100': 'physicians',
        'I6200': 'dentists',
        'I6300': 'pharmacists',
        'B1101': 'total_area_km2',
        'B1103': 'habitable_area_km2',
    }
    
    rename_map = {}
    for code, name in key_cols.items():
        if code in data.columns:
            rename_map[code] = name
    
    # Select and rename
    cols_to_keep = ['region_code', 'prefecture', 'municipality'] + list(rename_map.keys())
    existing = [c for c in cols_to_keep if c in data.columns]
    result = data[existing].copy()
    result = result.rename(columns=rename_map)
    
    # Convert numeric columns
    for col in result.columns[3:]:
        result[col] = pd.to_numeric(result[col], errors='coerce')
    
    # Calculated fields
    if 'total_population' in result.columns and 'population_65_plus' in result.columns:
        result['aging_rate'] = (result['population_65_plus'] / result['total_population'] * 100).round(1)
    if 'births' in result.columns and 'deaths' in result.columns:
        result['natural_change'] = result['births'] - result['deaths']
    
    out = OUT / "demographics.csv"
    result.to_csv(out, index=False, encoding='utf-8')
    log(f"  → {len(result):,} municipalities → {out.name} ({out.stat().st_size//1024}KB)")
    return result

# ============================================================
# ETL 3: Future Population Projections (IPSS 2020-2050)
# ============================================================
def etl_future_population():
    log("ETL-3: Future Population Projections (IPSS)")
    src = RAW / "04_将来推計人口_IPSS/結果表1_総人口.xlsx"
    try:
        df = pd.read_excel(src, header=None)
        # Find the data start row (look for region codes)
        start_row = None
        for i in range(min(20, len(df))):
            val = str(df.iloc[i, 0]) if pd.notna(df.iloc[i, 0]) else ''
            if val.startswith('0') and len(val) >= 4:
                start_row = i
                break
        
        if start_row is None:
            # Try alternative parsing
            df = pd.read_excel(src, skiprows=3)
            out = OUT / "future_population.csv"
            df.to_csv(out, index=False, encoding='utf-8')
            log(f"  → {len(df):,} rows (raw) → {out.name}")
            return df
        
        # Extract with proper header
        header_row = start_row - 1
        data = pd.read_excel(src, skiprows=header_row)
        out = OUT / "future_population.csv"
        data.to_csv(out, index=False, encoding='utf-8')
        log(f"  → {len(data):,} regions → {out.name} ({out.stat().st_size//1024}KB)")
        return data
    except Exception as e:
        log(f"  ✗ Error: {e}")
        return pd.DataFrame()

# ============================================================
# ETL 4: DPC Hospital Data
# ============================================================
def etl_dpc():
    log("ETL-4: DPC Hospital Data")
    src = RAW / "02_DPC/DPC_施設概要表.xlsx"
    try:
        df = pd.read_excel(src, header=None)
        # Find header row
        for i in range(min(10, len(df))):
            row_vals = [str(v) for v in df.iloc[i].tolist() if pd.notna(v)]
            if any('病院' in v or '施設' in v or '告示' in v for v in row_vals):
                df = pd.read_excel(src, skiprows=i)
                break
        out = OUT / "dpc_hospitals.csv"
        df.to_csv(out, index=False, encoding='utf-8')
        log(f"  → {len(df):,} DPC facilities → {out.name} ({out.stat().st_size//1024}KB)")
        return df
    except Exception as e:
        log(f"  ✗ Error: {e}")
        return pd.DataFrame()

# ============================================================
# ETL 5: Medical Area (二次医療圏) Master
# ============================================================
def etl_medical_areas():
    log("ETL-5: Medical Area Master (Wellness DB)")
    src_list = list((RAW / "05_医療圏").glob("*.xlsx")) + list((RAW / "05_医療圏").glob("*.xlsm"))
    # Use the comprehensive care version (most complete municipal mapping)
    src = None
    for f in src_list:
        if "地域包括ケア" in f.name:
            src = f
            break
    if src is None and src_list:
        src = src_list[0]
    
    if src:
        try:
            # Read first sheet to inspect structure
            xls = pd.ExcelFile(src)
            sheet_names = xls.sheet_names
            log(f"  Sheets: {sheet_names[:5]}")
            df = pd.read_excel(src, sheet_name=0, header=None)
            # Find header
            for i in range(min(15, len(df))):
                row_vals = [str(v) for v in df.iloc[i].tolist() if pd.notna(v)]
                if any('医療圏' in v or '都道府県' in v or '市区町村' in v for v in row_vals):
                    df = pd.read_excel(src, sheet_name=0, skiprows=i)
                    break
            out = OUT / "medical_areas.csv"
            df.to_csv(out, index=False, encoding='utf-8')
            log(f"  → {len(df):,} rows → {out.name} ({out.stat().st_size//1024}KB)")
            return df
        except Exception as e:
            log(f"  ✗ Error: {e}")
    return pd.DataFrame()

# ============================================================
# ETL 6: Bed Function Report
# ============================================================
def etl_bed_function():
    log("ETL-6: Bed Function Report")
    src = RAW / "06_病床機能報告/data"
    hospital_file = None
    for f in src.glob("*病院*.xlsx"):
        hospital_file = f
        break
    if hospital_file:
        try:
            df = pd.read_excel(hospital_file, header=None)
            # Find header
            for i in range(min(10, len(df))):
                row_vals = [str(v) for v in df.iloc[i].tolist() if pd.notna(v)]
                if any('病院' in v or '施設' in v or '病床' in v for v in row_vals):
                    df = pd.read_excel(hospital_file, skiprows=i)
                    break
            out = OUT / "bed_function.csv"
            df.to_csv(out, index=False, encoding='utf-8')
            log(f"  → {len(df):,} hospitals → {out.name} ({out.stat().st_size//1024}KB)")
            return df
        except Exception as e:
            log(f"  ✗ Error: {e}")
    return pd.DataFrame()

# ============================================================
# ETL 7: Medical Equipment & Emergency Stats
# ============================================================
def etl_equipment():
    log("ETL-7: Medical Equipment & Emergency Stats")
    src = RAW / "07_救急在宅機器/R5_医療施設統計表.xlsx"
    try:
        xls = pd.ExcelFile(src)
        log(f"  Sheets: {xls.sheet_names[:8]}")
        results = {}
        for sheet in xls.sheet_names[:5]:
            df = pd.read_excel(src, sheet_name=sheet, header=None)
            results[sheet] = df
        
        # Save all sheets as combined
        out = OUT / "medical_equipment.csv"
        if results:
            first_key = list(results.keys())[0]
            first_df = results[first_key]
            first_df.to_csv(out, index=False, encoding='utf-8')
            log(f"  → {len(first_df):,} rows (sheet: {first_key}) → {out.name}")
        return results
    except Exception as e:
        log(f"  ✗ Error: {e}")
        return {}

# ============================================================
# ETL 8: Prefecture Summary (Aggregation)
# ============================================================
def etl_prefecture_summary(facilities_df, demographics_df):
    log("ETL-8: Prefecture Summary (Aggregation)")
    
    # Facility counts by prefecture
    fac_summary = facilities_df.groupby('prefecture_code').agg(
        facility_count=('facility_code_10', 'count'),
        hospital_count=('facility_type', lambda x: (x == 'hospital').sum()),
        clinic_count=('facility_type', lambda x: (x == 'clinic').sum()),
    ).reset_index()
    fac_summary['prefecture_name'] = fac_summary['prefecture_code'].map(PREF_MAP)
    
    # Demographics by prefecture
    if 'prefecture' in demographics_df.columns:
        demo_pref = demographics_df.groupby('prefecture').agg(
            total_pop=('total_population', 'sum'),
            pop_65_plus=('population_65_plus', 'sum'),
            total_births=('births', 'sum'),
            total_deaths=('deaths', 'sum'),
            total_physicians=('physicians', 'sum'),
        ).reset_index()
        demo_pref['aging_rate_pref'] = (demo_pref['pop_65_plus'] / demo_pref['total_pop'] * 100).round(1)
        demo_pref['physicians_per_100k'] = (demo_pref['total_physicians'] / demo_pref['total_pop'] * 100000).round(1)
    
    out = OUT / "prefecture_summary.csv"
    fac_summary.to_csv(out, index=False, encoding='utf-8')
    log(f"  → {len(fac_summary)} prefectures → {out.name}")
    
    if 'prefecture' in demographics_df.columns:
        out2 = OUT / "prefecture_demographics.csv"
        demo_pref.to_csv(out2, index=False, encoding='utf-8')
        log(f"  → {len(demo_pref)} prefectures → {out2.name}")
    
    return fac_summary

# ============================================================
# Main Pipeline
# ============================================================
def main():
    log("=" * 60)
    log("Medical Intelligence Platform — ETL Pipeline")
    log("=" * 60)
    
    # Core ETLs
    fac = etl_facilities()
    demo = etl_demographics()
    future = etl_future_population()
    dpc = etl_dpc()
    areas = etl_medical_areas()
    beds = etl_bed_function()
    equip = etl_equipment()
    
    # Aggregations
    if not fac.empty and not demo.empty:
        pref = etl_prefecture_summary(fac, demo)
    
    # Summary
    log("")
    log("=" * 60)
    log("Pipeline Complete — Output Files:")
    log("=" * 60)
    for f in sorted(OUT.glob("*.csv")):
        lines = sum(1 for _ in open(f)) - 1
        log(f"  {f.name}: {lines:,} rows ({f.stat().st_size//1024}KB)")
    
    total = sum(f.stat().st_size for f in OUT.glob("*.csv"))
    log(f"\nTotal processed: {total//1024//1024}MB")
    log("=" * 60)

if __name__ == "__main__":
    main()
