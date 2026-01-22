
-- ===============================
-- GOVERNANCE & OPERATIONAL TABLES
-- Phase A4 — Governance
-- ===============================

CREATE TABLE business_days (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL,
  opened_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);

CREATE TABLE end_of_day_closes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  business_day_id UUID REFERENCES business_days(id),
  closed_by_user_id UUID NOT NULL,
  total_sales NUMERIC NOT NULL,
  cash_expected NUMERIC NOT NULL,
  cash_actual NUMERIC NOT NULL,
  discrepancy NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE activity_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
