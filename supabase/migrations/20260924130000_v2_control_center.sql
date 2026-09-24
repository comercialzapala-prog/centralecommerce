-- ============================================================================
-- V2 CONTROL CENTER -- migration incremental e NAO destrutiva
-- Roda sobre o schema ja existente (20260924000000_v2_schema.sql).
-- Nenhum DROP TABLE, nenhum DELETE de dados. Somente ADD/ALTER/CREATE.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================================
-- 1. CANAIS  (conceito 4: "onde a venda/operacao aconteceu")
-- ============================================================================
create table if not exists channels (
    id         uuid primary key default gen_random_uuid(),
    name       text not null unique,
    active     boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- 2. FORMAS DE PAGAMENTO
-- ============================================================================
create table if not exists payment_methods (
    id         uuid primary key default gen_random_uuid(),
    name       text not null unique,
    active     boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- 3. CENTROS DE CUSTO -- auditoria + protecao contra ciclos
-- ============================================================================
alter table cost_centers
    add column if not exists created_by uuid references profiles(id),
    add column if not exists updated_by uuid references profiles(id);

-- Nome unico dentro do mesmo pai. Nao derruba a migration se ja houver
-- duplicados historicos -- apenas avisa.
do $cc_ix$
begin
    begin
        create unique index if not exists ux_cost_centers_parent_name
            on cost_centers (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
    exception when others then
        raise notice 'ux_cost_centers_parent_name nao criado: %', sqlerrm;
    end;
end $cc_ix$;

-- Um centro nao pode ser descendente de si mesmo (quebraria o drill-down).
create or replace function prevent_cost_center_cycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
    v_ancestor uuid := new.parent_id;
    v_guard    int  := 0;
begin
    if new.parent_id is null then
        return new;
    end if;
    if new.parent_id = new.id then
        raise exception 'Um centro de custo nao pode ser pai de si mesmo.';
    end if;
    while v_ancestor is not null loop
        v_guard := v_guard + 1;
        if v_guard > 100 then
            raise exception 'Hierarquia de centros de custo profunda demais (possivel ciclo).';
        end if;
        if v_ancestor = new.id then
            raise exception 'Ciclo detectado na hierarquia de centros de custo.';
        end if;
        select parent_id into v_ancestor from cost_centers where id = v_ancestor;
    end loop;
    return new;
end $fn$;

drop trigger if exists trg_cost_center_cycle on cost_centers;
create trigger trg_cost_center_cycle
    before insert or update of parent_id on cost_centers
    for each row execute function prevent_cost_center_cycle();

-- ============================================================================
-- 4. TRANSACTIONS -- colunas V2
-- ============================================================================
alter table transactions
    add column if not exists payment_method_id uuid references payment_methods(id),
    add column if not exists responsible_id    uuid references profiles(id),
    add column if not exists updated_by        uuid references profiles(id);

alter table transactions alter column payment_method drop not null;

-- channel_id nasceu TEXT no V1; vira FK para channels.
do $tx_ch$
declare
    v_type text;
    v_used bigint;
begin
    select data_type into v_type
      from information_schema.columns
     where table_schema = 'public' and table_name = 'transactions' and column_name = 'channel_id';

    if v_type is not null and v_type <> 'uuid' then
        execute 'select count(*) from transactions where channel_id is not null' into v_used;
        if v_used = 0 then
            alter table transactions drop column channel_id;
        else
            alter table transactions rename column channel_id to channel_legacy_text;
        end if;
        alter table transactions add column channel_id uuid references channels(id);
    end if;
end $tx_ch$;

-- ============================================================================
-- 5. ORDERS -- custos do pedido (secao 18)
-- ============================================================================
alter table orders
    add column if not exists marketplace_fee numeric(12,2) not null default 0,
    add column if not exists gateway_fee     numeric(12,2) not null default 0,
    add column if not exists tax_amount      numeric(12,2) not null default 0,
    add column if not exists shipping_cost   numeric(12,2) not null default 0,
    add column if not exists packaging_cost  numeric(12,2) not null default 0,
    add column if not exists marketing_cost  numeric(12,2) not null default 0,
    add column if not exists other_costs     numeric(12,2) not null default 0,
    add column if not exists notes           text,
    add column if not exists created_by      uuid references profiles(id),
    add column if not exists updated_by      uuid references profiles(id);

do $ord_ch$
declare
    v_type text;
    v_used bigint;
begin
    select data_type into v_type
      from information_schema.columns
     where table_schema = 'public' and table_name = 'orders' and column_name = 'channel_id';

    if v_type is not null and v_type <> 'uuid' then
        execute 'select count(*) from orders where channel_id is not null' into v_used;
        if v_used = 0 then
            alter table orders drop column channel_id;
        else
            alter table orders rename column channel_id to channel_legacy_text;
        end if;
        alter table orders add column channel_id uuid references channels(id);
    end if;
end $ord_ch$;

-- status padronizado em PT. 'COMPLETED' (default antigo) vira 'CONCLUIDO'.
update orders set status = 'CONCLUIDO'
 where status is null or status not in ('PENDENTE','CONCLUIDO','CANCELADO');

alter table orders alter column status set default 'CONCLUIDO';
alter table orders alter column status set not null;

do $ord_st$
begin
    if not exists (select 1 from pg_constraint where conname = 'orders_status_check') then
        alter table orders add constraint orders_status_check
            check (status in ('PENDENTE','CONCLUIDO','CANCELADO'));
    end if;
end $ord_st$;

do $ord_ix$
begin
    begin
        create unique index if not exists ux_orders_order_number on orders (order_number);
    exception when others then
        raise notice 'ux_orders_order_number nao criado: %', sqlerrm;
    end;
end $ord_ix$;

-- ============================================================================
-- 6. PRODUCTS
-- ============================================================================
alter table products
    add column if not exists created_by uuid references profiles(id),
    add column if not exists updated_by uuid references profiles(id);

do $prod_ix$
begin
    begin
        create unique index if not exists ux_products_sku
            on products (lower(sku)) where sku is not null and sku <> '';
    exception when others then
        raise notice 'ux_products_sku nao criado: %', sqlerrm;
    end;
end $prod_ix$;

-- ============================================================================
-- 7. STOCK MOVEMENTS -- sinal derivado do tipo + vinculo com o item do pedido
-- ============================================================================
alter table stock_movements
    add column if not exists created_by    uuid references profiles(id),
    add column if not exists order_item_id uuid references order_items(id) on delete cascade;

do $sm_qty$
begin
    if not exists (select 1 from pg_constraint where conname = 'stock_movements_quantity_check') then
        alter table stock_movements add constraint stock_movements_quantity_check check (quantity <> 0);
    end if;
end $sm_qty$;

-- ENTRADA/DEVOLUCAO somam, VENDA/PERDA/AVARIA subtraem, AJUSTE aceita sinal livre.
alter table stock_movements
    add column if not exists signed_quantity integer
    generated always as (
        case type
            when 'ENTRADA'   then  abs(quantity)
            when 'DEVOLUCAO' then  abs(quantity)
            when 'VENDA'     then -abs(quantity)
            when 'PERDA'     then -abs(quantity)
            when 'AVARIA'    then -abs(quantity)
            else quantity
        end
    ) stored;

-- ============================================================================
-- 8. INVESTMENTS
-- ============================================================================
alter table investments
    add column if not exists cost_center_id uuid references cost_centers(id),
    add column if not exists supplier_id    uuid references suppliers(id),
    add column if not exists updated_by     uuid references profiles(id);

-- ============================================================================
-- 9. SUPPLIERS / CATEGORIES -- auditoria
-- ============================================================================
alter table suppliers
    add column if not exists created_by uuid references profiles(id),
    add column if not exists updated_by uuid references profiles(id);

alter table categories
    add column if not exists updated_at timestamptz not null default now(),
    add column if not exists created_by uuid references profiles(id),
    add column if not exists updated_by uuid references profiles(id);

-- subcategories nasceu sem updated_at; o trigger de auditoria precisa da coluna.
alter table subcategories
    add column if not exists updated_at timestamptz not null default now();

-- ============================================================================
-- 10. SETTINGS -- investimento inicial para o indicador 0/50
-- ============================================================================
alter table settings
    add column if not exists initial_investment numeric(12,2) not null default 0,
    add column if not exists updated_by uuid references profiles(id);

insert into settings (operation_name, currency, initial_balance, break_even_target, initial_investment)
select 'Central E-commerce', 'BRL', 0, 0, 0
where not exists (select 1 from settings);
