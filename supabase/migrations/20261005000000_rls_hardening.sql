-- ============================================================================
-- HARDENING DA RLS -- authenticated -> organization_members -> organization_id
--
-- >>> ESTE ARQUIVO NAO ESTA EM supabase/migrations/ DE PROPOSITO. <<<
-- Enquanto ele mora em supabase/pending/, `supabase db push` NAO o aplica.
-- Ativar = mover para supabase/migrations/ e rodar o push.
--
-- ============================================================================
-- LEIA ANTES DE MOVER: ESTA MIGRATION DERRUBA O APLICATIVO SE APLICADA HOJE
-- ============================================================================
-- Ela tira todo o acesso de `anon`. Hoje a Central roda SEM LOGIN e todas as
-- consultas saem como anon. Verificado no projeto linkado: `profiles` tem 0
-- linhas -- nao existe um unico usuario.
--
-- Aplicar agora resulta em: toda pagina vazia ou com erro de permissao.
--
-- PRE-REQUISITOS, na ordem:
--   1. Tela de login funcionando (Supabase Auth) e middleware de sessao.
--   2. Um usuario criado.
--   3. Uma linha em organization_members ligando esse usuario a organizacao
--      (ver "BOOTSTRAP" no fim deste arquivo).
--   4. Desligar o cadastro publico no painel do Supabase (Auth -> Sign Up), ou
--      qualquer pessoa cria conta -- e conta sem vinculo nao ve nada, mas e ruido.
--   5. SOMENTE DEPOIS: mover este arquivo e aplicar.
--
-- MUDANCA DE CODIGO OBRIGATORIA JUNTO COM ESTA MIGRATION:
--   src/integrations/organization.ts guarda o organization_id num cache de
--   modulo (`cachedId`). Com uma organizacao isso e inofensivo; com duas, o
--   primeiro request aquece o cache e os requests seguintes de OUTRO usuario
--   recebem a organizacao errada. Antes de multi-tenant, remova o cache ou
--   passe a chavea-lo por usuario.
--
-- ROLLBACK: guarde 20260924130003_open_access_policies.sql. Reaplicar aquele
-- arquivo devolve o modo aberto. Esta migration nao apaga dado nenhum, entao o
-- rollback e so de permissao.
-- ============================================================================

-- ============================================================================
-- 1. RESOLVEDORES DE IDENTIDADE
--
--    Todos SECURITY DEFINER com search_path travado, e por dois motivos
--    tecnicos, nao por comodidade:
--
--    (a) RECURSAO: um predicado de RLS que consulta organization_members
--        dispararia a RLS de organization_members, que por sua vez chamaria o
--        predicado. Definer corta o ciclo.
--    (b) DESEMPENHO: predicado SECURITY INVOKER que le tabela com RLS e
--        reavaliado por linha. Definer + `(select ...)` no predicado deixa o
--        Postgres calcular uma vez por comando (initPlan).
--
--    Nenhuma delas aceita "de quem?" como parametro -- elas so respondem sobre
--    auth.uid(). Nao ha como usa-las para espiar o vinculo de outra pessoa.
-- ============================================================================

-- Organizacao do usuario corrente.
create or replace function current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
    select coalesce(
        (select m.organization_id
           from organization_members m
          where m.user_id = auth.uid()
          order by m.created_at
          limit 1),
        -- PONTE SINGLE-ORG: sem vinculo, cai na unica organizacao existente.
        -- Isto NAO e um furo: o INSERT ainda passa pelo WITH CHECK
        -- is_org_member(organization_id), que recusa quem nao e membro. Serve
        -- para o default de coluna nao virar NULL durante a transicao.
        -- QUANDO ENTRAR A SEGUNDA ORGANIZACAO, REMOVA ESTE COALESCE.
        (select id from organizations order by created_at limit 1)
    );
$fn$;

-- Substitui a versao SECURITY INVOKER criada em 20260928120000.
create or replace function is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
    select exists (
        select 1 from organization_members m
         where m.organization_id = p_organization_id
           and m.user_id = auth.uid()
    );
$fn$;

create or replace function is_org_admin(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
    select exists (
        select 1 from organization_members m
         where m.organization_id = p_organization_id
           and m.user_id = auth.uid()
           and m.role in ('OWNER', 'ADMIN')
    );
$fn$;

-- Duas pessoas compartilham organizacao? Usado pela policy de `profiles`, que
-- nao tem organization_id proprio.
create or replace function shares_organization(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
    select exists (
        select 1
          from organization_members mine
          join organization_members other
            on other.organization_id = mine.organization_id
         where mine.user_id  = auth.uid()
           and other.user_id = p_user_id
    );
$fn$;

do $grants$
declare
    fn text;
begin
    foreach fn in array array[
        'current_organization_id()',
        'is_org_member(uuid)',
        'is_org_admin(uuid)',
        'shares_organization(uuid)'
    ] loop
        execute format('revoke all on function %s from public, anon', fn);
        execute format('grant execute on function %s to authenticated, service_role', fn);
    end loop;
end $grants$;

-- default_organization_id() serve apenas a seeds do servidor a partir daqui.
revoke all on function default_organization_id() from public, anon, authenticated;
grant execute on function default_organization_id() to service_role;

-- ============================================================================
-- 2. organization_id VIRA OBRIGATORIO NAS TABELAS DE NEGOCIO
--
--    Isto NAO e capricho de modelagem, e requisito de correcao: o predicado
--    is_org_member(organization_id) com organization_id NULL avalia para NULL,
--    que a RLS trata como falso. Uma linha sem organizacao viraria invisivel
--    para todo mundo, inclusive para o dono -- dado que existe e nao aparece.
--
--    O bloco ABORTA se encontrar NULL, em vez de "consertar" chutando uma
--    organizacao.
-- ============================================================================
do $enforce_org$
declare
    t       text;
    v_nulls bigint;
begin
    foreach t in array array[
        'categories','subcategories','transactions','investments','settings',
        'cost_centers','suppliers','products','orders','order_items',
        'stock_movements','channels','payment_methods'
    ] loop
        execute format('select count(*) from %I where organization_id is null', t) into v_nulls;

        if v_nulls > 0 then
            raise exception
                'Tabela %: % linha(s) com organization_id NULL. Resolva antes do hardening -- '
                'fechar a RLS agora tornaria essas linhas invisiveis.', t, v_nulls;
        end if;

        execute format('alter table %I alter column organization_id set not null', t);
        -- O default deixa de ser "a primeira organizacao" e passa a ser "a
        -- organizacao de quem esta inserindo".
        execute format(
            'alter table %I alter column organization_id set default current_organization_id()', t);
    end loop;
end $enforce_org$;

-- ============================================================================
-- 3. TABELAS DE NEGOCIO -- fim do acesso anonimo
--
--    Substitui a policy "control_center_access" de 20260924130003, que dava
--    FOR ALL para anon e authenticated com USING(true).
--
--    Quatro policies separadas em vez de uma FOR ALL: fica explicito no
--    pg_policies o que cada comando permite, e permite restringir DELETE a
--    administradores depois sem reescrever o resto.
--
--    `(select is_org_member(...))` -- o SELECT em volta nao e enfeite: ele faz o
--    Postgres avaliar o predicado uma vez por comando em vez de uma vez por
--    linha.
-- ============================================================================
do $harden_business$
declare
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

        for pol in
            select policyname from pg_policies where schemaname = 'public' and tablename = t
        loop
            execute format('drop policy if exists %I on %I', pol.policyname, t);
        end loop;

        execute format(
            'create policy "org_select" on %I for select to authenticated '
            'using ((select is_org_member(organization_id)))', t);

        execute format(
            'create policy "org_insert" on %I for insert to authenticated '
            'with check ((select is_org_member(organization_id)))', t);

        execute format(
            'create policy "org_update" on %I for update to authenticated '
            'using ((select is_org_member(organization_id))) '
            'with check ((select is_org_member(organization_id)))', t);

        -- Para exigir OWNER/ADMIN no DELETE, troque is_org_member por
        -- is_org_admin nesta linha (e somente nesta).
        execute format(
            'create policy "org_delete" on %I for delete to authenticated '
            'using ((select is_org_member(organization_id)))', t);

        -- anon perde tudo. A chave anon continua podendo viver no frontend: ela
        -- so serve para carregar o JWT do usuario, nao para acessar dado.
        execute format('revoke all on %I from anon', t);
        execute format('grant select, insert, update, delete on %I to authenticated', t);
        execute format('grant all on %I to service_role', t);
    end loop;
end $harden_business$;

-- ============================================================================
-- 4. TABELAS DE INTEGRACAO -- leitura por membro, escrita so por service_role
--
--    Mantem a regra de 20260928120000: a interface le, quem escreve e o webhook
--    e a fila (servidor). O que muda e quem pode ler -- deixa de ser anon.
-- ============================================================================
do $harden_integration$
declare
    v_tables constant text[] := array[
        'integration_settings','integration_events','integration_jobs',
        'integration_actions','product_channels','inventory_balances',
        'erp_snapshots','alerts','recommendations','recommendation_outcomes'
    ];
    t   text;
    pol record;
begin
    foreach t in array v_tables loop
        execute format('alter table %I enable row level security', t);

        for pol in
            select policyname from pg_policies where schemaname = 'public' and tablename = t
        loop
            execute format('drop policy if exists %I on %I', pol.policyname, t);
        end loop;

        execute format(
            'create policy "org_select" on %I for select to authenticated '
            'using ((select is_org_member(organization_id)))', t);

        -- Sem policy de escrita: a RLS nega, e a service_role (BYPASSRLS, so no
        -- servidor) continua escrevendo.
        execute format('revoke all on %I from anon', t);
        execute format('revoke insert, update, delete on %I from authenticated', t);
        execute format('grant select on %I to authenticated', t);
        execute format('grant all on %I to service_role', t);
    end loop;
end $harden_integration$;

-- ============================================================================
-- 5. organizations / organization_members
-- ============================================================================
alter table organizations enable row level security;
drop policy if exists "integration_read" on organizations;
drop policy if exists "org_self_read" on organizations;

create policy "org_self_read" on organizations
    for select to authenticated using ((select is_org_member(id)));

revoke all on organizations from anon;
revoke insert, update, delete on organizations from authenticated;
grant select on organizations to authenticated;
grant all on organizations to service_role;

alter table organization_members enable row level security;
drop policy if exists "org_members_read_own" on organization_members;

-- Cada um ve os vinculos da propria organizacao (precisa disso para saber quem
-- e responsavel por um lancamento). Escrita continua fora do navegador.
create policy "org_members_read" on organization_members
    for select to authenticated using ((select is_org_member(organization_id)));

revoke all on organization_members from anon;
revoke insert, update, delete on organization_members from authenticated;
grant select on organization_members to authenticated;
grant all on organization_members to service_role;

-- ============================================================================
-- 6. profiles
--    Nao tem organization_id: o vinculo e via organization_members.
-- ============================================================================
alter table profiles enable row level security;
drop policy if exists "profiles_read" on profiles;
drop policy if exists "profiles_update_own" on profiles;
drop policy if exists "profiles_read_org" on profiles;
drop policy if exists "profiles_insert_own" on profiles;

create policy "profiles_read_org" on profiles
    for select to authenticated
    using (id = auth.uid() or (select shares_organization(id)));

create policy "profiles_insert_own" on profiles
    for insert to authenticated with check (id = auth.uid());

create policy "profiles_update_own" on profiles
    for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke all on profiles from anon;
grant select, insert, update on profiles to authenticated;
grant all on profiles to service_role;

-- ============================================================================
-- 7. erp_connections -- continua sem coluna cifrada para ninguem, agora por org
-- ============================================================================
alter table erp_connections enable row level security;
drop policy if exists "erp_connections_read_status" on erp_connections;

create policy "erp_connections_read_status" on erp_connections
    for select to authenticated using ((select is_org_member(organization_id)));

revoke all on erp_connections from anon, authenticated;

-- Mesma lista da secao 14 de 20260928120000, menos o anon. As colunas
-- *_encrypted continuam fora -- nao as adicione aqui.
grant select (
    id, organization_id, provider, status, health, external_company_id, scopes,
    consecutive_failures, degraded_until,
    has_access_token, has_refresh_token, access_token_expires_at,
    last_successful_sync, last_reconciliation_at, last_webhook_at, last_error,
    created_at, updated_at
) on erp_connections to authenticated;

grant all on erp_connections to service_role;

-- ============================================================================
-- 8. VIEWS E RPC
--
--    Todas as views do projeto sao security_invoker = true, entao elas ja
--    herdam a RLS das tabelas de base -- nao ha policy a escrever. O que falta e
--    tirar o GRANT de anon: sem isso anon receberia "permissao negada" da tabela
--    de base, mas o certo e ele nao alcancar nem a view.
-- ============================================================================
do $views$
declare
    v text;
begin
    foreach v in array array[
        'v_cost_center_hierarchy','v_cost_center_totals','v_transaction_full',
        'v_order_result','v_product_stats','v_supplier_stats',
        'v_erp_connection_status','v_integration_queue_health','v_sales_fact'
    ] loop
        execute format('revoke all on %I from anon', v);
        execute format('grant select on %I to authenticated, service_role', v);
    end loop;
end $views$;

-- O RPC de drill-down e SECURITY INVOKER e le v_transaction_full, entao ja
-- respeita a RLS. Ainda assim anon nao deve poder invoca-lo.
revoke execute on function cost_center_report(date, date, uuid, uuid, uuid, uuid, text, uuid, text)
    from public, anon;
grant execute on function cost_center_report(date, date, uuid, uuid, uuid, uuid, text, uuid, text)
    to authenticated, service_role;

-- ============================================================================
-- 9. TODA VIEW PASSA A SER security_invoker
--
--    Nao basta verificar: aqui se GARANTE. View definer roda com a permissao do
--    dono e ignora a RLS das tabelas de base -- e o jeito mais facil de furar
--    tudo o que esta acima sem ninguem notar, porque a view continua "funcionando".
--
--    Enforcar antes de assertar tambem evita que a migration aborte por causa de
--    uma view antiga criada sem a opcao.
-- ============================================================================
do $views_invoker$
declare
    v record;
begin
    for v in
        select table_name from information_schema.views where table_schema = 'public'
    loop
        execute format('alter view %I set (security_invoker = true)', v.table_name);
    end loop;
end $views_invoker$;

-- ============================================================================
-- 9b. REDE DE SEGURANCA: anon perde TUDO em public, de uma vez
--
--     As secoes acima revogam tabela por tabela. Este bloco nao confia nessa
--     enumeracao: se um objeto novo tiver escapado da lista, ele cai aqui. A
--     afirmacao "anon nao acessa dado de negocio" passa a valer por construcao, e
--     nao por eu ter lembrado de listar tudo.
-- ============================================================================
revoke all on all tables in schema public from anon;
revoke all on all routines in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Tabela criada DEPOIS desta migration nao deve nascer acessivel a anon.
-- Ressalva honesta: ALTER DEFAULT PRIVILEGES so afeta os defaults definidos pelo
-- papel que roda o comando. Se o grant original do Supabase foi definido por
-- outro papel (supabase_admin), esta linha e inofensiva e nao surte efeito -- por
-- isso a assercao (c) abaixo continua sendo a verificacao que vale.
alter default privileges in schema public revoke all on tables from anon;

-- ============================================================================
-- 10. TRAVA CONTRA REGRESSAO -- ASSERCOES DURAS
--
--     Este bloco e a PROVA da migration. Qualquer invariante violada levanta
--     excecao e a transacao inteira volta atras: nao existe estado
--     "parcialmente endurecido".
-- ============================================================================
do $verify$
declare
    v_business constant text[] := array[
        'categories','subcategories','transactions','investments','settings',
        'cost_centers','suppliers','products','orders','order_items',
        'stock_movements','channels','payment_methods'
    ];
    v_count int;
    v_list  text;
begin
    -- (a) Nenhuma policy aceita anon, em tabela nenhuma do schema public.
    select count(*), string_agg(format('%s.%s', tablename, policyname), ', ')
      into v_count, v_list
      from pg_policies
     where schemaname = 'public' and 'anon' = any(roles);

    if v_count > 0 then
        raise exception 'Hardening incompleto: % policy(ies) ainda aceitam anon: %', v_count, v_list;
    end if;

    -- (b) Nenhuma policy de tabela de negocio usa USING(true) -- o modo aberto.
    select count(*), string_agg(format('%s.%s', tablename, policyname), ', ')
      into v_count, v_list
      from pg_policies
     where schemaname = 'public'
       and tablename = any(v_business)
       and (qual = 'true' or with_check = 'true');

    if v_count > 0 then
        raise exception 'Ainda existe policy permissiva (USING/WITH CHECK true): %', v_list;
    end if;

    -- (c) anon nao tem privilegio de tabela nenhum sobre negocio nem integracao.
    select count(*), string_agg(format('%s:%s', table_name, privilege_type), ', ')
      into v_count, v_list
      from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee = 'anon';

    if v_count > 0 then
        raise exception 'anon ainda tem % grant(s) em public: %', v_count, v_list;
    end if;

    -- (d) organization_id NOT NULL nas 13 tabelas de negocio.
    select count(*), string_agg(table_name, ', ')
      into v_count, v_list
      from information_schema.columns
     where table_schema = 'public'
       and table_name = any(v_business)
       and column_name = 'organization_id'
       and is_nullable = 'YES';

    if v_count > 0 then
        raise exception 'organization_id ainda aceita NULL em: %', v_list;
    end if;

    -- Confere tambem que a coluna EXISTE nas 13 -- a ausencia seria pior que o NULL.
    select count(*) into v_count
      from information_schema.columns
     where table_schema = 'public'
       and table_name = any(v_business)
       and column_name = 'organization_id';

    if v_count <> array_length(v_business, 1) then
        raise exception 'organization_id presente em apenas % das % tabelas de negocio.',
            v_count, array_length(v_business, 1);
    end if;

    -- (e) Nenhuma view SECURITY DEFINER. reloptions sem security_invoker=true
    --     significa definer (o default do Postgres).
    select count(*), string_agg(c.relname, ', ')
      into v_count, v_list
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and not coalesce(c.reloptions::text[] @> array['security_invoker=true'], false);

    if v_count > 0 then
        raise exception 'View(s) SECURITY DEFINER encontradas: %', v_list;
    end if;

    -- (f) Toda tabela de negocio com RLS habilitada.
    select count(*), string_agg(c.relname, ', ')
      into v_count, v_list
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any(v_business)
       and c.relrowsecurity = false;

    if v_count > 0 then
        raise exception 'RLS desabilitada em: %', v_list;
    end if;

    raise notice 'Hardening da RLS concluido: 6 invariantes verificadas.';
end $verify$;

-- ============================================================================
-- BOOTSTRAP -- rode UMA VEZ, com service role, DEPOIS de criar o usuario.
--
-- Nao esta automatizado de proposito. Um trigger em auth.users que vinculasse
-- todo novo usuario a organizacao transformaria "criar conta" em "ganhar acesso
-- aos dados da empresa".
--
--   insert into organization_members (organization_id, user_id, role)
--   select o.id, u.id, 'OWNER'
--     from organizations o, auth.users u
--    where o.slug = 'default'
--      and u.email = 'SEU-EMAIL-AQUI'
--   on conflict (organization_id, user_id) do nothing;
--
-- Confira depois:
--   select u.email, o.name, m.role
--     from organization_members m
--     join organizations o on o.id = m.organization_id
--     join auth.users    u on u.id = m.user_id;
-- ============================================================================
