#!/usr/bin/env python3
"""
Medical Intelligence Platform — Facility Priority Scoring Engine
================================================================
Calculates a composite "Visit Priority Score" for each medical facility,
combining market potential, facility scale, and regional healthcare demand.

Score = w1*MarketPotential + w2*FacilityScale + w3*HealthcareDemand + w4*CompetitionGap

All scores normalized to 0-100 scale.
"""
import sqlite3, pandas as pd, numpy as np
from pathlib import Path

DB = Path(__file__).parent.parent.parent / "data" / "medical_intelligence.db"

def minmax(series):
    """Min-max normalize to 0-100"""
    mn, mx = series.min(), series.max()
    if mx == mn: return pd.Series(50, index=series.index)
    return ((series - mn) / (mx - mn) * 100).round(1)

def compute_scores(weights=None):
    """
    Compute priority scores for all facilities.
    
    Default weights: Market=0.30, Scale=0.25, Demand=0.25, Competition=0.20
    """
    if weights is None:
        weights = {"market": 0.30, "scale": 0.25, "demand": 0.25, "competition": 0.20}
    
    conn = sqlite3.connect(str(DB))
    
    # --- Load data ---
    fac = pd.read_sql("SELECT * FROM facilities", conn)
    demo = pd.read_sql("SELECT * FROM demographics", conn)
    pref_sum = pd.read_sql("SELECT * FROM prefecture_summary", conn)
    
    print(f"Loaded: {len(fac):,} facilities, {len(demo):,} municipalities, {len(pref_sum)} prefectures")
    
    # --- Factor 1: Market Potential (prefecture-level population & growth) ---
    pref_market = pref_sum[['prefecture_code','prefecture_name','total_pop','aging_rate_pref','physicians_per_100k']].copy()
    pref_market['market_score'] = minmax(pref_market['total_pop'].fillna(0))
    
    # --- Factor 2: Facility Scale (hospital vs clinic) ---
    fac['scale_score'] = np.where(fac['facility_type'] == 'hospital', 80, 30)
    
    # --- Factor 3: Healthcare Demand (aging rate → higher demand) ---
    pref_market['demand_score'] = minmax(pref_market['aging_rate_pref'].fillna(0))
    
    # --- Factor 4: Competition Gap (fewer physicians per capita → bigger gap) ---
    # Invert: lower physicians_per_100k = higher opportunity
    pref_market['competition_score'] = minmax(
        pref_market['physicians_per_100k'].max() - pref_market['physicians_per_100k'].fillna(0)
    )
    
    # --- Merge scores to facility level ---
    scored = fac.merge(
        pref_market[['prefecture_code','market_score','demand_score','competition_score']],
        on='prefecture_code', how='left'
    )
    
    # Fill NaN
    for col in ['market_score','demand_score','competition_score']:
        scored[col] = scored[col].fillna(50)
    
    # --- Composite Score ---
    scored['priority_score'] = (
        weights['market'] * scored['market_score'] +
        weights['scale'] * scored['scale_score'] +
        weights['demand'] * scored['demand_score'] +
        weights['competition'] * scored['competition_score']
    ).round(1)
    
    # --- Rank ---
    scored['rank'] = scored['priority_score'].rank(ascending=False, method='min').astype(int)
    
    # --- Save to DB ---
    scored.to_sql('facility_scores', conn, index=False, if_exists='replace')
    conn.execute("CREATE INDEX IF NOT EXISTS idx_scores_rank ON facility_scores(rank)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_scores_pref ON facility_scores(prefecture_code)")
    conn.commit()
    
    # --- Summary ---
    print(f"\n{'='*60}")
    print(f"Priority Scoring Complete")
    print(f"{'='*60}")
    print(f"Scored facilities: {len(scored):,}")
    print(f"Score range: {scored['priority_score'].min():.1f} - {scored['priority_score'].max():.1f}")
    print(f"Mean score: {scored['priority_score'].mean():.1f}")
    print(f"Median score: {scored['priority_score'].median():.1f}")
    
    print(f"\n--- Top 20 Priority Facilities ---")
    top = scored.nlargest(20, 'priority_score')[['rank','facility_name','prefecture_name','facility_type','priority_score','market_score','demand_score','competition_score']]
    for _, r in top.iterrows():
        print(f"  #{r['rank']:>5} | {r['priority_score']:>5.1f} | {r['facility_type']:<8} | {r['prefecture_name']:<6} | {r['facility_name']}")
    
    print(f"\n--- Score Distribution by Type ---")
    for ft in ['hospital','clinic']:
        subset = scored[scored['facility_type']==ft]
        print(f"  {ft:<10}: mean={subset['priority_score'].mean():.1f}, median={subset['priority_score'].median():.1f}, top={subset['priority_score'].max():.1f}")
    
    print(f"\n--- Top 5 Prefectures by Avg Score ---")
    pref_avg = scored.groupby('prefecture_name')['priority_score'].mean().nlargest(5)
    for name, score in pref_avg.items():
        print(f"  {name}: {score:.1f}")
    
    conn.close()
    print(f"\n✅ Scores saved to facility_scores table")
    return scored

if __name__ == "__main__":
    compute_scores()
