-- ============================================================================
-- CENTRAL E-COMMERCE -- CONTROL CENTER V2
-- Script consolidado para rodar no SQL Editor do Supabase.
-- Incremental e NAO destrutivo: nenhum DROP TABLE, nenhum DELETE.
-- Pode ser executado mais de uma vez (idempotente).
-- ============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>> 20260924130000_v2_control_center.sql <<<<<<<<<<<<<<<<<<<<<<<<

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

-- >>>>>>>>>>>>>>>>>>>>>>>> 20260924130001_v2_views_and_rollups.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- V2 CONTROL CENTER -- triggers, views de agregacao, RPC de drill-down, indices
-- ============================================================================

-- ============================================================================
-- 1. AUDITORIA -- updated_at automatico
-- ============================================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
    new.updated_at := now();
    return new;
end $fn$;

do $touch$
declare
    t text;
begin
    foreach t in array array[
        'categories','subcategories','transactions','investments','settings',
        'cost_centers','suppliers','products','orders','channels','payment_methods'
    ] loop
        execute format('drop trigger if exists trg_%s_updated_at on %I', t, t);
        execute format(
            'create trigger trg_%s_updated_at before update on %I for each row execute function set_updated_at()',
            t, t);
    end loop;
end $touch$;

-- ============================================================================
-- 2. PEDIDOS -- totais sempre consistentes (secao 18/19)
--    total_amount = bruto - desconto + frete cobrado
--    gross_amount = soma dos itens
-- ============================================================================
create or replace function orders_apply_totals()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
    new.total_amount := round(
        coalesce(new.gross_amount, 0)
      - coalesce(new.discount_amount, 0)
      + coalesce(new.shipping_charged, 0), 2);
    return new;
end $fn$;

drop trigger if exists trg_orders_totals on orders;
create trigger trg_orders_totals
    before insert or update on orders
    for each row execute function orders_apply_totals();

create or replace function order_items_apply_totals()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
    new.gross_total := round(new.quantity * new.unit_price, 2);
    new.cost_total  := round(new.quantity * new.unit_cost, 2);
    return new;
end $fn$;

drop trigger if exists trg_order_items_totals on order_items;
create trigger trg_order_items_totals
    before insert or update on order_items
    for each row execute function order_items_apply_totals();

create or replace function order_items_sync_parent()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
    v_order uuid := coalesce(new.order_id, old.order_id);
begin
    update orders o
       set gross_amount = coalesce(
             (select sum(oi.gross_total) from order_items oi where oi.order_id = v_order), 0)
     where o.id = v_order;
    return coalesce(new, old);
end $fn$;

drop trigger if exists trg_order_items_sync_parent on order_items;
create trigger trg_order_items_sync_parent
    after insert or update or delete on order_items
    for each row execute function order_items_sync_parent();

-- ============================================================================
-- 3. SECAO 23 -- a venda gera o pedido E a saida de mercadoria.
--    Cada order_item mantem o seu proprio stock_movement do tipo VENDA.
--    Excluir o item remove o movimento (FK on delete cascade).
-- ============================================================================
create or replace function order_items_sync_stock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
    v_date date;
begin
    select order_date into v_date from orders where id = new.order_id;

    update stock_movements
       set product_id    = new.product_id,
           quantity      = abs(new.quantity),
           movement_date = coalesce(v_date, movement_date),
           order_id      = new.order_id
     where order_item_id = new.id;

    if not found then
        insert into stock_movements
            (product_id, type, quantity, movement_date, order_id, order_item_id, reason)
        values
            (new.product_id, 'VENDA', abs(new.quantity), coalesce(v_date, current_date),
             new.order_id, new.id, 'Saida automatica gerada pelo pedido');
    end if;

    return new;
end $fn$;

drop trigger if exists trg_order_items_sync_stock on order_items;
create trigger trg_order_items_sync_stock
    after insert or update on order_items
    for each row execute function order_items_sync_stock();

create or replace function orders_sync_stock_date()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
    if new.order_date is distinct from old.order_date then
        update stock_movements
           set movement_date = new.order_date
         where order_id = new.id and order_item_id is not null;
    end if;
    return new;
end $fn$;

drop trigger if exists trg_orders_sync_stock_date on orders;
create trigger trg_orders_sync_stock_date
    after update of order_date on orders
    for each row execute function orders_sync_stock_date();

-- ============================================================================
-- 4. VIEW -- hierarquia de centros de custo (niveis ilimitados, secao 4)
-- ============================================================================
drop view if exists v_cost_center_totals cascade;
drop view if exists v_cost_center_hierarchy cascade;

create view v_cost_center_hierarchy
with (security_invoker = true) as
with recursive tree as (
    select c.id,
           c.name,
           c.parent_id,
           c.active,
           c.active            as path_active,
           1                   as depth,
           c.name::text        as path,
           array[c.id]         as ancestor_ids,
           c.id                as root_id,
           c.name::text        as root_name
      from cost_centers c
     where c.parent_id is null
    union all
    select c.id,
           c.name,
           c.parent_id,
           c.active,
           (t.path_active and c.active) as path_active,
           t.depth + 1,
           t.path || ' > ' || c.name,
           t.ancestor_ids || c.id,
           t.root_id,
           t.root_name
      from cost_centers c
      join tree t on c.parent_id = t.id
)
select * from tree;

-- ============================================================================
-- 5. VIEW -- lancamento financeiro completo (usada em listas, filtros e busca)
--    signed_amount        = impacto no CAIXA
--    operational_revenue  = receita operacional (aporte NAO entra, secao 11)
--    operational_expense  = despesa operacional (estorno abate a despesa)
-- ============================================================================
drop view if exists v_transaction_full cascade;

create view v_transaction_full
with (security_invoker = true) as
select tr.id,
       tr.transaction_date,
       tr.type,
       tr.amount,
       case when tr.status = 'CANCELADO' then 0
            when tr.type = 'SAIDA' then -tr.amount
            else tr.amount end                                    as signed_amount,
       case when tr.status = 'CANCELADO' then 0
            when tr.type = 'ENTRADA' then tr.amount
            else 0 end                                            as operational_revenue,
       case when tr.status = 'CANCELADO' then 0
            when tr.type = 'SAIDA'   then tr.amount
            when tr.type = 'ESTORNO' then -tr.amount
            else 0 end                                            as operational_expense,
       case when tr.status = 'CANCELADO' then 0
            when tr.type = 'APORTE' then tr.amount
            else 0 end                                            as contribution_amount,
       tr.description,
       tr.notes,
       tr.status,
       tr.payment_method,
       tr.category_id,
       cat.name                                                   as category_name,
       tr.cost_center_id,
       cc.name                                                    as cost_center_name,
       cc.path                                                    as cost_center_path,
       cc.root_id                                                 as cost_center_root_id,
       cc.root_name                                               as cost_center_root_name,
       cc.ancestor_ids                                            as cost_center_ancestor_ids,
       tr.supplier_id,
       sup.name                                                   as supplier_name,
       tr.channel_id,
       ch.name                                                    as channel_name,
       tr.payment_method_id,
       pm.name                                                    as payment_method_name,
       tr.responsible_id,
       prof.full_name                                             as responsible_name,
       tr.created_at,
       tr.updated_at,
       tr.created_by
  from transactions tr
  left join categories             cat  on cat.id  = tr.category_id
  left join v_cost_center_hierarchy cc  on cc.id   = tr.cost_center_id
  left join suppliers              sup  on sup.id  = tr.supplier_id
  left join channels               ch   on ch.id   = tr.channel_id
  left join payment_methods        pm   on pm.id   = tr.payment_method_id
  left join profiles               prof on prof.id = tr.responsible_id;

-- ============================================================================
-- 6. VIEW -- resultado por pedido (secao 19)
-- ============================================================================
drop view if exists v_order_result cascade;

create view v_order_result
with (security_invoker = true) as
select o.id,
       o.order_number,
       o.order_date,
       o.customer_name,
       o.status,
       o.channel_id,
       ch.name                                as channel_name,
       o.gross_amount,
       o.discount_amount,
       o.shipping_charged,
       o.total_amount,
       coalesce(i.cogs_amount, 0)             as cogs_amount,
       coalesce(i.items_quantity, 0)          as items_quantity,
       o.marketplace_fee,
       o.gateway_fee,
       o.tax_amount,
       o.shipping_cost,
       o.packaging_cost,
       o.marketing_cost,
       o.other_costs,
       (o.marketplace_fee + o.gateway_fee + o.tax_amount + o.shipping_cost
        + o.packaging_cost + o.marketing_cost + o.other_costs)    as extra_costs,
       round(o.total_amount
             - coalesce(i.cogs_amount, 0)
             - (o.marketplace_fee + o.gateway_fee + o.tax_amount + o.shipping_cost
                + o.packaging_cost + o.marketing_cost + o.other_costs), 2) as result_amount,
       case when o.total_amount > 0 then
            round(100 * (o.total_amount
                  - coalesce(i.cogs_amount, 0)
                  - (o.marketplace_fee + o.gateway_fee + o.tax_amount + o.shipping_cost
                     + o.packaging_cost + o.marketing_cost + o.other_costs)) / o.total_amount, 2)
            else 0 end                                            as result_percent,
       o.notes,
       o.created_at,
       o.updated_at
  from orders o
  left join channels ch on ch.id = o.channel_id
  left join (
        select oi.order_id,
               sum(oi.cost_total) as cogs_amount,
               sum(oi.quantity)   as items_quantity
          from order_items oi
         group by oi.order_id
  ) i on i.order_id = o.id;

-- ============================================================================
-- 7. VIEW -- estoque e resultado por produto (secao 24)
--    Movimentos de pedidos CANCELADOS nao contam.
-- ============================================================================
drop view if exists v_product_stats cascade;

create view v_product_stats
with (security_invoker = true) as
select p.id                                   as product_id,
       p.sku,
       p.name,
       p.category,
       p.unit_cost,
       p.sale_price,
       p.active,
       coalesce(m.stock_balance, 0)           as stock_balance,
       coalesce(m.qty_in, 0)                  as qty_in,
       coalesce(m.qty_sold, 0)                as qty_sold,
       coalesce(m.qty_returned, 0)            as qty_returned,
       coalesce(m.qty_lost, 0)                as qty_lost,
       coalesce(m.qty_damaged, 0)             as qty_damaged,
       coalesce(m.qty_adjusted, 0)            as qty_adjusted,
       coalesce(s.revenue_amount, 0)          as revenue_amount,
       coalesce(s.cogs_amount, 0)             as cogs_amount,
       coalesce(s.revenue_amount, 0) - coalesce(s.cogs_amount, 0) as margin_amount,
       case when coalesce(s.revenue_amount, 0) > 0
            then round(100 * (s.revenue_amount - s.cogs_amount) / s.revenue_amount, 2)
            else 0 end                                            as margin_percent,
       coalesce(s.orders_count, 0)            as orders_count
  from products p
  left join (
        select sm.product_id,
               sum(sm.signed_quantity)                                                  as stock_balance,
               sum(case when sm.type = 'ENTRADA'   then abs(sm.quantity) else 0 end)    as qty_in,
               sum(case when sm.type = 'VENDA'     then abs(sm.quantity) else 0 end)    as qty_sold,
               sum(case when sm.type = 'DEVOLUCAO' then abs(sm.quantity) else 0 end)    as qty_returned,
               sum(case when sm.type = 'PERDA'     then abs(sm.quantity) else 0 end)    as qty_lost,
               sum(case when sm.type = 'AVARIA'    then abs(sm.quantity) else 0 end)    as qty_damaged,
               sum(case when sm.type = 'AJUSTE'    then sm.quantity      else 0 end)    as qty_adjusted
          from stock_movements sm
          left join orders o on o.id = sm.order_id
         where coalesce(o.status, 'CONCLUIDO') <> 'CANCELADO'
         group by sm.product_id
  ) m on m.product_id = p.id
  left join (
        select oi.product_id,
               sum(oi.gross_total)          as revenue_amount,
               sum(oi.cost_total)           as cogs_amount,
               count(distinct oi.order_id)  as orders_count
          from order_items oi
          join orders o on o.id = oi.order_id
         where o.status <> 'CANCELADO'
         group by oi.product_id
  ) s on s.product_id = p.id;

-- ============================================================================
-- 8. VIEW -- estatisticas por fornecedor (secao 13)
-- ============================================================================
drop view if exists v_supplier_stats cascade;

create view v_supplier_stats
with (security_invoker = true) as
select s.id                                    as supplier_id,
       s.name,
       s.document,
       s.email,
       s.phone,
       s.active,
       s.notes,
       coalesce(t.total_paid, 0)               as total_paid,
       coalesce(t.entries_count, 0)            as entries_count,
       case when coalesce(t.entries_count, 0) > 0
            then round(t.total_paid / t.entries_count, 2)
            else 0 end                         as average_amount,
       t.last_payment_date,
       t.top_cost_center_id,
       cc.name                                 as top_cost_center_name,
       cc.path                                 as top_cost_center_path
  from suppliers s
  left join (
        select tr.supplier_id,
               sum(tr.amount)          as total_paid,
               count(*)                as entries_count,
               max(tr.transaction_date) as last_payment_date,
               (select tr2.cost_center_id
                  from transactions tr2
                 where tr2.supplier_id = tr.supplier_id
                   and tr2.cost_center_id is not null
                   and tr2.status <> 'CANCELADO'
                 group by tr2.cost_center_id
                 order by sum(tr2.amount) desc
                 limit 1)              as top_cost_center_id
          from transactions tr
         where tr.type = 'SAIDA' and tr.status <> 'CANCELADO'
         group by tr.supplier_id
  ) t on t.supplier_id = s.id
  left join v_cost_center_hierarchy cc on cc.id = t.top_cost_center_id;

-- ============================================================================
-- 9. RPC -- drill-down de centro de custo com TODOS os filtros da secao 8.
--    direct_total = so o proprio centro
--    rollup_total = o centro + todos os descendentes (secao 7/49)
-- ============================================================================
drop function if exists cost_center_report(date, date, uuid, uuid, uuid, uuid, text, uuid, text);

create function cost_center_report(
    p_start          date default null,
    p_end            date default null,
    p_root           uuid default null,
    p_category       uuid default null,
    p_supplier       uuid default null,
    p_channel        uuid default null,
    p_status         text default null,
    p_payment_method uuid default null,
    p_search         text default null
)
returns table (
    cost_center_id   uuid,
    cost_center_name text,
    parent_id        uuid,
    depth            int,
    path             text,
    active           boolean,
    direct_total     numeric,
    direct_count     bigint,
    rollup_total     numeric,
    rollup_count     bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
    with filtered as (
        select tr.cost_center_id, tr.operational_expense as amount
          from v_transaction_full tr
         where tr.cost_center_id is not null
           and tr.status <> 'CANCELADO'
           and tr.type in ('SAIDA', 'ESTORNO')
           and (p_start          is null or tr.transaction_date  >= p_start)
           and (p_end            is null or tr.transaction_date  <= p_end)
           and (p_category       is null or tr.category_id        = p_category)
           and (p_supplier       is null or tr.supplier_id        = p_supplier)
           and (p_channel        is null or tr.channel_id         = p_channel)
           and (p_status         is null or tr.status             = p_status)
           and (p_payment_method is null or tr.payment_method_id  = p_payment_method)
           and (p_search         is null or p_search = ''
                or tr.description  ilike '%' || p_search || '%'
                or coalesce(tr.notes, '')         ilike '%' || p_search || '%'
                or coalesce(tr.supplier_name, '') ilike '%' || p_search || '%')
    ),
    direct as (
        select f.cost_center_id, sum(f.amount) as total, count(*) as cnt
          from filtered f
         group by f.cost_center_id
    ),
    rollup_totals as (
        select h.id as cost_center_id,
               sum(f.amount) as total,
               count(*)      as cnt
          from filtered f
          join v_cost_center_hierarchy hf on hf.id = f.cost_center_id
          join v_cost_center_hierarchy h  on h.id = any(hf.ancestor_ids)
         group by h.id
    )
    select h.id,
           h.name,
           h.parent_id,
           h.depth,
           h.path,
           h.active,
           coalesce(d.total, 0),
           coalesce(d.cnt, 0),
           coalesce(r.total, 0),
           coalesce(r.cnt, 0)
      from v_cost_center_hierarchy h
      left join direct        d on d.cost_center_id = h.id
      left join rollup_totals r on r.cost_center_id = h.id
     where p_root is null or p_root = any(h.ancestor_ids)
     order by h.path;
$fn$;

-- ============================================================================
-- 10. VIEW -- totais por centro de custo sem filtro (atalho para o dashboard)
-- ============================================================================
create view v_cost_center_totals
with (security_invoker = true) as
select * from cost_center_report();

-- ============================================================================
-- 11. INDICES (secao 39)
-- ============================================================================
create index if not exists idx_transactions_date        on transactions (transaction_date);
create index if not exists idx_transactions_category    on transactions (category_id);
create index if not exists idx_transactions_cost_center on transactions (cost_center_id);
create index if not exists idx_transactions_supplier    on transactions (supplier_id);
create index if not exists idx_transactions_channel     on transactions (channel_id);
create index if not exists idx_transactions_payment     on transactions (payment_method_id);
create index if not exists idx_transactions_type_status on transactions (type, status);

create index if not exists idx_cost_centers_parent      on cost_centers (parent_id);

create index if not exists idx_orders_date              on orders (order_date);
create index if not exists idx_orders_channel           on orders (channel_id);
create index if not exists idx_orders_status            on orders (status);

create index if not exists idx_order_items_order        on order_items (order_id);
create index if not exists idx_order_items_product      on order_items (product_id);

create index if not exists idx_stock_product            on stock_movements (product_id);
create index if not exists idx_stock_date               on stock_movements (movement_date);
create index if not exists idx_stock_order              on stock_movements (order_id);
create unique index if not exists ux_stock_order_item   on stock_movements (order_item_id) where order_item_id is not null;

create index if not exists idx_investments_date         on investments (investment_date);
create index if not exists idx_investments_cost_center  on investments (cost_center_id);

-- ============================================================================
-- 12. GRANTS para o PostgREST enxergar views e RPC
-- ============================================================================
grant select on v_cost_center_hierarchy, v_cost_center_totals, v_transaction_full,
                v_order_result, v_product_stats, v_supplier_stats
      to anon, authenticated, service_role;

grant execute on function cost_center_report(date, date, uuid, uuid, uuid, uuid, text, uuid, text)
      to anon, authenticated, service_role;

-- >>>>>>>>>>>>>>>>>>>>>>>> 20260924130002_v2_seed.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- V2 CONTROL CENTER -- seed idempotente (secao 48).
-- Roda quantas vezes precisar sem duplicar nem apagar nada.
-- ============================================================================

-- ============================================================================
-- 1. CANAIS (secao 2 -- "onde a venda aconteceu")
-- ============================================================================
insert into channels (name) values
    ('Site'), ('Mercado Livre'), ('Shopee'), ('Amazon'), ('WhatsApp'), ('Loja Física')
on conflict (name) do nothing;

-- ============================================================================
-- 2. FORMAS DE PAGAMENTO
-- ============================================================================
insert into payment_methods (name) values
    ('PIX'), ('Cartão de Crédito'), ('Cartão de Débito'), ('Boleto'),
    ('Transferência'), ('Dinheiro'), ('Débito Automático')
on conflict (name) do nothing;

-- Migra o texto livre de payment_method (V1) para a FK, quando casar pelo nome.
update transactions tr
   set payment_method_id = pm.id
  from payment_methods pm
 where tr.payment_method_id is null
   and tr.payment_method is not null
   and lower(trim(tr.payment_method)) = lower(pm.name);

-- ============================================================================
-- 3. CATEGORIAS (secao 12) -- "o que e esse gasto?"
--    Sem unique index para nao arriscar conflito com dados historicos:
--    insere apenas o que ainda nao existe.
-- ============================================================================
insert into categories (name, type)
select v.name, v.type
  from (values
        ('Frete',            'SAIDA'),
        ('Embalagem',        'SAIDA'),
        ('Energia',          'SAIDA'),
        ('Água',             'SAIDA'),
        ('Internet',         'SAIDA'),
        ('Aluguel',          'SAIDA'),
        ('Condomínio',       'SAIDA'),
        ('Taxa Financeira',  'SAIDA'),
        ('Taxa Marketplace', 'SAIDA'),
        ('Imposto',          'SAIDA'),
        ('Salário',          'SAIDA'),
        ('Software',         'SAIDA'),
        ('Curso',            'SAIDA'),
        ('Mentoria',         'SAIDA'),
        ('Consultoria',      'SAIDA'),
        ('Contabilidade',    'SAIDA'),
        ('Manutenção',       'SAIDA'),
        ('Aporte de Sócio',  'APORTE'),
        ('Estorno',          'ESTORNO'),
        ('Equipamentos',     'INVESTIMENTO')
       ) as v(name, type)
 where not exists (
        select 1 from categories c
         where lower(c.name) = lower(v.name) and c.type = v.type
 );

-- ============================================================================
-- 4. CENTROS DE CUSTO HIERARQUICOS (secoes 3 e 48)
--    _cc_upsert caminha o path criando o que falta. Nunca duplica.
-- ============================================================================
create or replace function _cc_upsert(p_path text[])
returns uuid
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
    v_parent uuid := null;
    v_id     uuid;
    v_name   text;
begin
    foreach v_name in array p_path loop
        select id into v_id
          from cost_centers
         where lower(name) = lower(v_name)
           and parent_id is not distinct from v_parent
         limit 1;

        if v_id is null then
            insert into cost_centers (name, parent_id) values (v_name, v_parent)
            returning id into v_id;
        end if;

        v_parent := v_id;
    end loop;
    return v_id;
end $fn$;

do $seed$
declare
    v_paths text[][] := array[
        -- Operacao Logistica
        array['Operação Logística','Entregas','Transportadora'],
        array['Operação Logística','Entregas','Correios'],
        array['Operação Logística','Entregas','Motoboy'],
        array['Operação Logística','Expedição','Caixas'],
        array['Operação Logística','Expedição','Sacolas'],
        array['Operação Logística','Expedição','Etiquetas'],
        array['Operação Logística','Expedição','Fitas'],
        array['Operação Logística','Expedição','Proteção'],
        array['Operação Logística','Armazenagem', ''],
        array['Operação Logística','Logística Reversa', ''],
        -- Marketing
        array['Marketing','Tráfego Pago','Meta Ads'],
        array['Marketing','Tráfego Pago','Google Ads'],
        array['Marketing','Tráfego Pago','TikTok Ads'],
        array['Marketing','Tráfego Pago','Shopee Ads'],
        array['Marketing','Tráfego Pago','Mercado Livre Ads'],
        array['Marketing','Conteúdo','Fotografia'],
        array['Marketing','Conteúdo','Vídeo'],
        array['Marketing','Conteúdo','Design'],
        array['Marketing','Influenciadores', ''],
        array['Marketing','Branding', ''],
        -- Administrativo
        array['Administrativo','Estrutura','Aluguel'],
        array['Administrativo','Estrutura','Energia'],
        array['Administrativo','Estrutura','Água'],
        array['Administrativo','Estrutura','Internet'],
        array['Administrativo','Estrutura','Condomínio'],
        array['Administrativo','Pessoas', ''],
        array['Administrativo','Contabilidade', ''],
        -- Tecnologia
        array['Tecnologia','Software', ''],
        array['Tecnologia','Infraestrutura', ''],
        array['Tecnologia','Site', ''],
        -- Comercial
        array['Comercial','Atendimento', ''],
        array['Comercial','Pós-venda', ''],
        array['Comercial','Marketplaces', ''],
        -- Educacao
        array['Educação','Cursos', ''],
        array['Educação','Mentorias', ''],
        array['Educação','Consultorias', ''],
        -- Mercadoria
        array['Mercadoria','Compra de Produtos', ''],
        array['Mercadoria','Importação', ''],
        array['Mercadoria','Amostras', '']
    ];
    i int;
    v_path text[];
begin
    for i in 1 .. array_length(v_paths, 1) loop
        -- remove os nulls usados so para deixar a matriz retangular,
        -- preservando a ordem do caminho (raiz -> folha)
        select array_agg(u.x order by u.ord) into v_path
          from unnest(v_paths[i:i][1:3]) with ordinality as u(x, ord)
         where u.x is not null and u.x <> '';
        perform _cc_upsert(v_path);
    end loop;
end $seed$;

drop function if exists _cc_upsert(text[]);

-- >>>>>>>>>>>>>>>>>>>>>>>> 20260924130003_open_access_policies.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- ============================================================================
-- POLICIES DE ACESSO -- ARQUIVO ISOLADO DE PROPOSITO.
--
-- MODO ATUAL: ACESSO ABERTO (anon + authenticated), a pedido do dono do
-- projeto, para operar a V2 sem tela de login.
--
-- >>> COMO FECHAR O SISTEMA DEPOIS (1 linha): troque a linha abaixo
-- >>>     v_roles constant text := 'anon, authenticated';
-- >>> por
-- >>>     v_roles constant text := 'authenticated';
-- >>> crie uma nova migration com este arquivo alterado e rode db push.
--
-- RLS continua ATIVA em todas as tabelas -- o que muda e apenas quem a policy
-- aceita. A service_role NUNCA e exposta ao navegador (secao 40).
-- ============================================================================

do $policies$
declare
    v_roles constant text := 'anon, authenticated';
    v_tables constant text[] := array[
        'categories','subcategories','transactions','investments','settings',
        'cost_centers','suppliers','products','orders','order_items',
        'stock_movements','channels','payment_methods'
    ];
    t   text;
    pol record;
begin
    foreach t in array v_tables loop
        execute format('alter table %I enable row level security', t);

        -- remove policies anteriores da tabela para nao acumular regras soltas
        for pol in
            select policyname from pg_policies
             where schemaname = 'public' and tablename = t
        loop
            execute format('drop policy if exists %I on %I', pol.policyname, t);
        end loop;

        execute format(
            'create policy "control_center_access" on %I for all to %s using (true) with check (true)',
            t, v_roles);
    end loop;
end $policies$;

-- Perfis: leitura liberada, alteracao so do proprio registro.
alter table profiles enable row level security;

drop policy if exists "Allow profiles read for authenticated" on profiles;
drop policy if exists "Allow user to update own profile" on profiles;
drop policy if exists "profiles_read" on profiles;
drop policy if exists "profiles_update_own" on profiles;

create policy "profiles_read" on profiles
    for select to anon, authenticated using (true);

create policy "profiles_update_own" on profiles
    for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
