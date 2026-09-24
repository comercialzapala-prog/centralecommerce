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
