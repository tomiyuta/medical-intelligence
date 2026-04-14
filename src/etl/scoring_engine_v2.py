#!/usr/bin/env python3
"""
Medical Intelligence Platform — Scoring Engine v2
===================================================
Enhanced with facility-level differentiation:
  - DPC bed count (病床数)
  - Hospital classification (DPC参加 vs 出来高算定)
  - Ward complexity (病棟数 from bed function report)

Score = w1*Market + w2*FacilityScale + w3*Demand + w4*Competition + w5*DPCEnrich

6-factor composite:
  Factor 1: MarketPotential    (prefecture population)
  Factor 2: FacilityScale      (hospital vs clinic base)  
  Factor 3: HealthcareDemand   (aging rate)
  Factor 4: CompetitionGap     (physician scarcity)
  Factor 5: BedScale           (total bed count — facility level)
  Factor 6: DPCClassification  (DPC参加=high / 出来高=mid / none=low)
"""
import sqlite3, pandas as pd, numpy as np, re
from pathlib import Path

DB = Path(__file__).parent.parent.parent / "data" / "medical_intelligence.db"

# ─── Name normalization for DPC JOIN ───
STRIP_RE = re.compile(
    r'(医療法人社団|医療法人財団|医療法人|社会医療法人|社会福祉法人|'
    r'独立行政法人|国立大学法人|公立大学法人|地方独立行政法人|'
    r'一般社団法人|一般財団法人|公益社団法人|公益財団法人|'
    r'学校法人|宗教法人|特定医療法人|日本赤十字社)\s*'
)
PREF_FULL = {
    "北海道":"北海道","青森":"青森県","岩手":"岩手県","宮城":"宮城県","秋田":"秋田県",
    "山形":"山形県","福島":"福島県","茨城":"茨城県","栃木":"栃木県","群馬":"群馬県",
    "埼玉":"埼玉県","千葉":"千葉県","東京":"東京都","神奈川":"神奈川県","新潟":"新潟県",
    "富山":"富山県","石川":"石川県","福井":"福井県","山梨":"山梨県","長野":"長野県",
    "岐阜":"岐阜県","静岡":"静岡県","愛知":"愛知県","三重":"三重県","滋賀":"滋賀県",
    "京都":"京都府","大阪":"大阪府","兵庫":"兵庫県","奈良":"奈良県","和歌山":"和歌山県",
    "鳥取":"鳥取県","島根":"島根県","岡山":"岡山県","広島":"広島県","山口":"山口県",
    "徳島":"徳島県","香川":"香川県","愛媛":"愛媛県","高知":"高知県","福岡":"福岡県",
    "佐賀":"佐賀県","長崎":"長崎県","熊本":"熊本県","大分":"大分県","宮崎":"宮崎県",
    "鹿児島":"鹿児島県","沖縄":"沖縄県",
}
# Add full→full mapping
for v in list(PREF_FULL.values()):
    PREF_FULL[v] = v

def norm_name(name):
    if pd.isna(name): return ""
    s = str(name).strip().replace('（','(').replace('）',')').replace('　',' ')
    s = STRIP_RE.sub('', s)
    return re.sub(r'\s+', '', s)

def minmax(s):
    mn, mx = s.min(), s.max()
    return ((s - mn) / (mx - mn) * 100).round(1) if mx > mn else pd.Series(50, index=s.index)


def run():
    conn = sqlite3.connect(str(DB))
    
    # ─── Load base data ───
    fac = pd.read_sql("SELECT * FROM facilities", conn)
    pref = pd.read_sql("SELECT * FROM prefecture_summary", conn)
    dpc = pd.read_sql("SELECT * FROM dpc_hospitals", conn)
    bed_raw = pd.read_sql("SELECT * FROM bed_function", conn)
    
    cn = dpc.columns
    print(f"Loaded: {len(fac):,} facilities | {len(dpc):,} DPC | {len(bed_raw):,} bed-function wards")
    
    # ═══════════════════════════════════════════════
    # STEP 1: DPC Enrichment via Name JOIN
    # ═══════════════════════════════════════════════
    print("\n[1/5] DPC Name JOIN...")
    
    dpc['norm_name'] = dpc[cn[4]].apply(norm_name)
    dpc['pref_full'] = dpc[cn[3]].str.strip().map(PREF_FULL)
    fac['norm_name'] = fac['facility_name'].apply(norm_name)
    
    dpc_join = dpc[['norm_name','pref_full',cn[6],cn[14],cn[5]]].copy()
    dpc_join.columns = ['norm_name','prefecture_name','dpc_beds','total_beds_dpc','dpc_type']
    dpc_join = dpc_join.dropna(subset=['norm_name','prefecture_name'])
    
    # Convert numeric
    dpc_join['dpc_beds'] = pd.to_numeric(dpc_join['dpc_beds'], errors='coerce')
    dpc_join['total_beds_dpc'] = pd.to_numeric(dpc_join['total_beds_dpc'], errors='coerce')
    
    # Classify DPC type
    dpc_join['is_dpc_participant'] = dpc_join['dpc_type'].str.contains('DPC参加', na=False)
    
    fac = fac.merge(dpc_join, on=['norm_name','prefecture_name'], how='left')
    fac = fac.drop_duplicates(subset='facility_code_10', keep='first')
    
    dpc_matched = fac['dpc_beds'].notna().sum()
    print(f"  DPC matched: {dpc_matched:,} facilities")
    
    # ═══════════════════════════════════════════════
    # STEP 2: Bed Function Report Enrichment
    # ═══════════════════════════════════════════════
    print("[2/5] Bed Function ward count...")
    
    bed_code = bed_raw.columns[0]
    bed_name = bed_raw.columns[1]
    
    # Extract valid rows and aggregate by facility
    valid_bed = bed_raw[bed_raw[bed_code].str.match(r'^\d{10}$', na=False)].copy()
    
    # Aggregate: ward count + unique facility name
    ward_agg = valid_bed.groupby(bed_code).agg(
        ward_count=(bed_code, 'count'),
        bed_facility_name=(bed_name, 'first'),
    ).reset_index()
    ward_agg.columns = ['bed_code', 'ward_count', 'bed_facility_name']
    
    # Normalize names for JOIN
    ward_agg['norm_name_bed'] = ward_agg['bed_facility_name'].apply(norm_name)
    
    # Try name-based JOIN (bed_function → facilities)
    fac['norm_name_for_bed'] = fac['norm_name']
    bed_join = fac.merge(
        ward_agg[['norm_name_bed','ward_count']].rename(columns={'norm_name_bed':'norm_name_for_bed'}),
        on='norm_name_for_bed', how='left'
    )
    bed_join = bed_join.drop_duplicates(subset='facility_code_10', keep='first')
    
    bed_matched = bed_join['ward_count'].notna().sum()
    print(f"  Bed function matched: {bed_matched:,} facilities")
    
    fac['ward_count'] = bed_join['ward_count'].values
    
    # ═══════════════════════════════════════════════
    # STEP 3: Compute 6-Factor Score
    # ═══════════════════════════════════════════════
    print("[3/5] Computing 6-factor composite score...")
    
    WEIGHTS = {
        "market": 0.20,       # Prefecture population
        "base_scale": 0.15,   # Hospital vs Clinic
        "demand": 0.15,       # Aging rate
        "competition": 0.10,  # Physician scarcity
        "bed_scale": 0.25,    # Bed count (facility-level)
        "dpc_class": 0.15,    # DPC classification
    }
    
    # F1: Market Potential (prefecture level)
    fac = fac.merge(
        pref[['prefecture_code','total_pop','aging_rate_pref','physicians_per_100k']],
        on='prefecture_code', how='left'
    )
    fac['f1_market'] = minmax(fac['total_pop'].fillna(0))
    
    # F2: Base Scale (hospital=70, clinic=20)
    fac['f2_base_scale'] = np.where(fac['facility_type']=='hospital', 70, 20)
    
    # F3: Healthcare Demand (aging rate)
    fac['f3_demand'] = minmax(fac['aging_rate_pref'].fillna(0))
    
    # F4: Competition Gap (physician scarcity)
    phys_max = fac['physicians_per_100k'].max()
    fac['f4_competition'] = minmax((phys_max - fac['physicians_per_100k'].fillna(phys_max)))
    
    # F5: Bed Scale (facility-level differentiation!)
    # Use DPC total_beds if available, else ward_count * estimated beds, else 0 for clinics
    fac['estimated_beds'] = fac['total_beds_dpc'].fillna(0)
    # For unmatched hospitals, estimate from ward count
    mask_hospital_no_beds = (fac['facility_type']=='hospital') & (fac['estimated_beds']==0) & (fac['ward_count'].notna())
    fac.loc[mask_hospital_no_beds, 'estimated_beds'] = fac.loc[mask_hospital_no_beds, 'ward_count'] * 30  # rough estimate
    # For hospitals with no data at all, use prefecture median
    mask_hospital_no_data = (fac['facility_type']=='hospital') & (fac['estimated_beds']==0)
    if mask_hospital_no_data.any():
        median_beds = fac.loc[fac['estimated_beds']>0, 'estimated_beds'].median()
        if pd.notna(median_beds):
            fac.loc[mask_hospital_no_data, 'estimated_beds'] = median_beds * 0.5  # conservative estimate
    
    fac['f5_bed_scale'] = minmax(fac['estimated_beds'].clip(0, 1500))
    
    # F6: DPC Classification
    # DPC参加=90, 出来高算定=60, DPCデータなし(hospital)=30, clinic=10
    fac['f6_dpc_class'] = 10  # default: clinic
    fac.loc[fac['facility_type']=='hospital', 'f6_dpc_class'] = 30  # hospital without DPC
    fac.loc[fac['dpc_beds'].notna() & ~fac['is_dpc_participant'].fillna(False), 'f6_dpc_class'] = 60  # 出来高算定
    fac.loc[fac['is_dpc_participant'].fillna(False), 'f6_dpc_class'] = 90  # DPC参加
    
    # ═══════════════════════════════════════════════
    # STEP 4: Composite Score
    # ═══════════════════════════════════════════════
    print("[4/5] Computing composite priority score...")
    
    fac['priority_score'] = (
        WEIGHTS['market']      * fac['f1_market'] +
        WEIGHTS['base_scale']  * fac['f2_base_scale'] +
        WEIGHTS['demand']      * fac['f3_demand'] +
        WEIGHTS['competition'] * fac['f4_competition'] +
        WEIGHTS['bed_scale']   * fac['f5_bed_scale'] +
        WEIGHTS['dpc_class']   * fac['f6_dpc_class']
    ).round(1)
    
    fac['rank'] = fac['priority_score'].rank(ascending=False, method='min').astype(int)
    
    # ═══════════════════════════════════════════════
    # STEP 5: Save & Report
    # ═══════════════════════════════════════════════
    print("[5/5] Saving to database...")
    
    save_cols = [
        'facility_code_10','facility_code_7','facility_name','zip_code','address',
        'prefecture_code','prefecture_name','facility_type',
        'dpc_beds','total_beds_dpc','dpc_type','is_dpc_participant','ward_count',
        'estimated_beds',
        'f1_market','f2_base_scale','f3_demand','f4_competition','f5_bed_scale','f6_dpc_class',
        'priority_score','rank'
    ]
    save_df = fac[[c for c in save_cols if c in fac.columns]]
    save_df.to_sql('facility_scores', conn, index=False, if_exists='replace')
    
    conn.execute("CREATE INDEX IF NOT EXISTS idx_fs_rank ON facility_scores(rank)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_fs_pref ON facility_scores(prefecture_code)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_fs_type ON facility_scores(facility_type)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_fs_score ON facility_scores(priority_score DESC)")
    conn.commit()
    
    # ═══════════════════════════════════════════════
    # REPORT
    # ═══════════════════════════════════════════════
    print(f"\n{'='*70}")
    print(f"  SCORING ENGINE v2 — RESULTS")
    print(f"{'='*70}")
    print(f"  Total scored:       {len(fac):,}")
    print(f"  Score range:        {fac['priority_score'].min():.1f} — {fac['priority_score'].max():.1f}")
    print(f"  Mean:               {fac['priority_score'].mean():.1f}")
    print(f"  Median:             {fac['priority_score'].median():.1f}")
    print(f"  Std:                {fac['priority_score'].std():.1f}")
    
    print(f"\n  --- Score Distribution ---")
    for threshold, label in [(70, "Tier S (≥70)"), (55, "Tier A (55-69)"), (40, "Tier B (40-54)"), (25, "Tier C (25-39)"), (0, "Tier D (<25)")]:
        if threshold == 0:
            count = (fac['priority_score'] < 25).sum()
        else:
            count = (fac['priority_score'] >= threshold).sum() if threshold == 70 else \
                    ((fac['priority_score'] >= threshold) & (fac['priority_score'] < threshold + 15)).sum()
        print(f"    {label:<20} {count:>7,} ({count/len(fac)*100:>5.1f}%)")
    
    print(f"\n  --- Top 20 Priority Facilities ---")
    top20 = fac.nlargest(20, 'priority_score')
    for _, r in top20.iterrows():
        beds = f"{r['total_beds_dpc']:.0f}" if pd.notna(r.get('total_beds_dpc')) else "?"
        dpc_label = "DPC" if r.get('is_dpc_participant') else "出来高" if pd.notna(r.get('dpc_type')) else "-"
        print(f"    #{r['rank']:>5} | {r['priority_score']:>5.1f}pt | beds={beds:>5} | {dpc_label:<4} | {r['prefecture_name']:<6} | {r['facility_name'][:35]}")
    
    print(f"\n  --- Score by Facility Type ---")
    for ft in ['hospital','clinic']:
        s = fac[fac['facility_type']==ft]['priority_score']
        print(f"    {ft:<10}: mean={s.mean():.1f}, median={s.median():.1f}, std={s.std():.1f}, range=[{s.min():.1f}, {s.max():.1f}]")
    
    print(f"\n  --- Score by DPC Classification ---")
    for label, mask in [
        ("DPC参加",    fac['is_dpc_participant'].fillna(False)),
        ("出来高算定",   fac['dpc_beds'].notna() & ~fac['is_dpc_participant'].fillna(False)),
        ("DPCデータなし(病院)", (fac['facility_type']=='hospital') & fac['dpc_beds'].isna()),
        ("診療所",      fac['facility_type']=='clinic'),
    ]:
        s = fac.loc[mask, 'priority_score']
        if len(s) > 0:
            print(f"    {label:<20}: n={len(s):>6,}, mean={s.mean():.1f}, median={s.median():.1f}")
    
    print(f"\n  --- Top 5 Prefectures by Avg Hospital Score ---")
    hosp = fac[fac['facility_type']=='hospital']
    pref_avg = hosp.groupby('prefecture_name')['priority_score'].mean().nlargest(5)
    for name, sc in pref_avg.items():
        print(f"    {name}: {sc:.1f}")
    
    conn.close()
    print(f"\n{'='*70}")
    print(f"  ✅ facility_scores table updated (v2, 6-factor, {len(fac):,} rows)")
    print(f"{'='*70}")

if __name__ == "__main__":
    run()
