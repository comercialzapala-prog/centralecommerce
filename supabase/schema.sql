-- Supabase SQL Schema for Central E-commerce V1

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES
CREATE TABLE profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    role TEXT DEFAULT 'USER' CHECK (role IN ('ADMIN', 'USER')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. CATEGORIES
CREATE TABLE categories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ENTRADA', 'SAIDA', 'APORTE', 'ESTORNO', 'INVESTIMENTO')),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. SUBCATEGORIES
CREATE TABLE subcategories (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. TRANSACTIONS
CREATE TABLE transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    transaction_date DATE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ENTRADA', 'SAIDA', 'APORTE', 'ESTORNO')),
    category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
    subcategory_id UUID REFERENCES subcategories(id) ON DELETE RESTRICT,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PAGO', 'PENDENTE', 'CANCELADO')),
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. INVESTMENTS
CREATE TABLE investments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    investment_date DATE NOT NULL,
    category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PAGO', 'PENDENTE', 'CANCELADO')),
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. SETTINGS
CREATE TABLE settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    operation_name TEXT DEFAULT 'Central E-commerce',
    currency TEXT DEFAULT 'BRL',
    start_date DATE,
    initial_balance DECIMAL(12,2) DEFAULT 0,
    break_even_target DECIMAL(12,2) DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Basic Policies (allowing all authenticated users for now, to be restricted later)
CREATE POLICY "Allow all authenticated users to read and write" ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated users to read and write" ON subcategories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated users to read and write" ON transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated users to read and write" ON investments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all authenticated users to read and write" ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow profiles read for authenticated" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow user to update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Seed Categories
INSERT INTO categories (name, type) VALUES 
('Venda de Mercadoria', 'ENTRADA'),
('Frete Cobrado', 'ENTRADA'),
('Outras Receitas', 'ENTRADA'),
('Operacional', 'SAIDA'),
('Marketing', 'SAIDA'),
('Materiais', 'SAIDA'),
('Tecnologia', 'SAIDA'),
('Logística', 'SAIDA'),
('Educação', 'SAIDA'),
('Pessoas', 'SAIDA'),
('Fiscal', 'SAIDA'),
('Mercadoria', 'SAIDA'),
('Financeiro', 'SAIDA'),
('Reforma', 'INVESTIMENTO'),
('Móveis', 'INVESTIMENTO'),
('Marketing inicial', 'INVESTIMENTO');
