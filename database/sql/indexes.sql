-- indexes.sql
-- Tenant isolation performance indexes

CREATE INDEX IF NOT EXISTS idx_restaurants_active ON restaurants(is_active);

CREATE INDEX IF NOT EXISTS idx_locations_tenant ON locations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
