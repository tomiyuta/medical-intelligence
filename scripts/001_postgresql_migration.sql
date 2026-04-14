-- PostgreSQL Migration for Supabase
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE facilities (
    facility_code_10 VARCHAR(10) PRIMARY KEY,
    facility_code_7 VARCHAR(7),
    facility_name TEXT NOT NULL,
    zip_code VARCHAR(10),
    address TEXT,
    prefecture_code VARCHAR(2),
    prefecture_name VARCHAR(10),
    facility_type VARCHAR(10)
);

CREATE TABLE facility_scores (
    facility_code_10 VARCHAR(10) PRIMARY KEY REFERENCES facilities(facility_code_10),
    priority_score DECIMAL(5,1) NOT NULL,
    rank INTEGER,
    tier VARCHAR(1),
    total_beds INTEGER,
    case_count INTEGER,
    avg_los DECIMAL(4,1),
    case_growth DECIMAL(6,1),
    dpc_type TEXT,
    is_dpc_participant BOOLEAN DEFAULT FALSE,
    f1_market DECIMAL(5,1), f2_base_scale DECIMAL(5,1), f3_demand DECIMAL(5,1),
    f4_competition DECIMAL(5,1), f5_bed_scale DECIMAL(5,1), f6_dpc_class DECIMAL(5,1),
    f7_case_volume DECIMAL(5,1), f8_case_growth DECIMAL(5,1), f9_complexity DECIMAL(5,1)
);

CREATE TABLE crm_members (
    member_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL, email TEXT UNIQUE, role VARCHAR(10) DEFAULT 'rep',
    territory TEXT, active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crm_accounts (
    account_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility_code_10 VARCHAR(10) REFERENCES facilities(facility_code_10),
    status VARCHAR(15) DEFAULT 'prospect',
    owner_member_id UUID REFERENCES crm_members(member_id),
    last_contact_at TIMESTAMPTZ, next_action TEXT, deal_value DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crm_activities (
    activity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES crm_accounts(account_id),
    member_id UUID REFERENCES crm_members(member_id),
    activity_type VARCHAR(10), activity_date TIMESTAMPTZ DEFAULT NOW(),
    subject TEXT, body TEXT, outcome VARCHAR(15), next_step TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fs_score ON facility_scores(priority_score DESC);
CREATE INDEX idx_fs_tier ON facility_scores(tier);
ALTER TABLE crm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
