
-- =======================================
-- PHASE A6 — SHIFTS, TIPS & STAFF OPS
-- =======================================

CREATE TABLE shifts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tips (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  shift_id UUID REFERENCES shifts(id),
  amount NUMERIC NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

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
