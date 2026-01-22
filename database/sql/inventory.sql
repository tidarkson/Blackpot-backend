
-- ===============================
-- PHASE A5 — INVENTORY & WINE CELLAR
-- ===============================

CREATE TABLE suppliers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  contact TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  current_stock NUMERIC NOT NULL,
  min_stock NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  inventory_item_id UUID REFERENCES inventory_items(id),
  type TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  performed_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE wine_details (
  id UUID PRIMARY KEY,
  inventory_item_id UUID UNIQUE REFERENCES inventory_items(id),
  vintage TEXT,
  region TEXT,
  varietal TEXT,
  bin_location TEXT,
  tasting_notes TEXT,
  pairing_notes TEXT
);
