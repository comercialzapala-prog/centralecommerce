-- V2 Schema Update

-- 1. COST CENTERS (Hierarchical)
CREATE TABLE cost_centers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES cost_centers(id) ON DELETE RESTRICT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. SUPPLIERS
CREATE TABLE suppliers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    document TEXT,
    email TEXT,
    phone TEXT,
    active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. PRODUCTS
CREATE TABLE products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sku TEXT,
    name TEXT NOT NULL,
    category TEXT,
    unit_cost DECIMAL(12,2) DEFAULT 0,
    sale_price DECIMAL(12,2) DEFAULT 0,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. ORDERS
CREATE TABLE orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_number TEXT NOT NULL,
    order_date DATE NOT NULL,
    channel_id TEXT,
    customer_name TEXT,
    gross_amount DECIMAL(12,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    shipping_charged DECIMAL(12,2) DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,
    status TEXT DEFAULT 'COMPLETED',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. ORDER ITEMS
CREATE TABLE order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    unit_cost DECIMAL(12,2) NOT NULL,
    gross_total DECIMAL(12,2) NOT NULL,
    cost_total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. STOCK MOVEMENTS
CREATE TABLE stock_movements (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    type TEXT NOT NULL CHECK (type IN ('ENTRADA', 'VENDA', 'DEVOLUCAO', 'PERDA', 'AVARIA', 'AJUSTE')),
    quantity INTEGER NOT NULL,
    movement_date DATE NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    reason TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. ALTER TRANSACTIONS
ALTER TABLE transactions 
ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id) ON DELETE RESTRICT,
ADD COLUMN supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
ADD COLUMN channel_id TEXT;

-- INDICES
CREATE INDEX idx_trans_date ON transactions(transaction_date);
CREATE INDEX idx_trans_cc ON transactions(cost_center_id);
CREATE INDEX idx_trans_supp ON transactions(supplier_id);
CREATE INDEX idx_orders_date ON orders(order_date);
CREATE INDEX idx_stock_prod ON stock_movements(product_id);

-- RLS
ALTER TABLE cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read and write" ON cost_centers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated users to read and write" ON suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated users to read and write" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated users to read and write" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated users to read and write" ON order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated users to read and write" ON stock_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- SEED COST CENTERS
INSERT INTO cost_centers (id, name) VALUES 
('11111111-1111-1111-1111-111111111111', 'Operação Logística'),
('22222222-2222-2222-2222-222222222222', 'Marketing'),
('33333333-3333-3333-3333-333333333333', 'Administrativo'),
('44444444-4444-4444-4444-444444444444', 'Tecnologia'),
('55555555-5555-5555-5555-555555555555', 'Comercial');

INSERT INTO cost_centers (name, parent_id) VALUES 
('Entregas', '11111111-1111-1111-1111-111111111111'),
('Expedição', '11111111-1111-1111-1111-111111111111'),
('Armazenagem', '11111111-1111-1111-1111-111111111111'),
('Tráfego Pago', '22222222-2222-2222-2222-222222222222'),
('Conteúdo', '22222222-2222-2222-2222-222222222222'),
('Estrutura', '33333333-3333-3333-3333-333333333333'),
('Pessoas', '33333333-3333-3333-3333-333333333333');\n