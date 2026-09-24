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
