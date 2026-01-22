-- indexes.sql
-- Tenant isolation performance indexes

CREATE INDEX IF NOT EXISTS idx_restaurants_active ON restaurants(is_active);

CREATE INDEX IF NOT EXISTS idx_locations_tenant ON locations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

CREATE INDEX idx_tables_tenant ON tables(tenant_id);

CREATE INDEX idx_orders_tenant ON orders(tenant_id);

CREATE INDEX idx_orders_table ON orders(table_id);

CREATE INDEX idx_courses_order ON order_courses(order_id);

-- Phase 4


CREATE INDEX idx_payments_tenant ON payments(tenant_id);

CREATE INDEX idx_payments_order ON payments(order_id);

CREATE INDEX idx_payments_created_at ON payments(created_at);

CREATE INDEX idx_tips_server ON tips(server_id);

CREATE INDEX idx_tips_order ON tips(order_id);
