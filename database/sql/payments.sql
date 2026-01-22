
-- phase4_payments.sql
-- Payments, Split Bills, Tips & Financial Integrity

CREATE TYPE payment_method AS ENUM ('CASH', 'CARD', 'TRANSFER', 'VOUCHER');
CREATE TYPE payment_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    order_id UUID NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    method payment_method NOT NULL,
    status payment_status NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_payment_order FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE tips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    order_id UUID NOT NULL,
    server_id UUID NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fk_tip_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_tip_server FOREIGN KEY (server_id) REFERENCES users(id)
);
