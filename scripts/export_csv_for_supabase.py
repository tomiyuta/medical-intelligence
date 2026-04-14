#!/usr/bin/env python3
import sqlite3, pandas as pd, os
conn = sqlite3.connect('data/medical_intelligence.db')
out = 'data/supabase_export'
os.makedirs(out, exist_ok=True)
for t in ['facilities','facility_scores','demographics','dpc_hospitals','prefecture_summary']:
    df = pd.read_sql(f'SELECT * FROM {t}', conn)
    df.to_csv(f'{out}/{t}.csv', index=False)
    print(f'{t}: {len(df):,} → {out}/{t}.csv')
conn.close()
