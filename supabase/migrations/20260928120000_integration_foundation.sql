-- ============================================================================
-- FASE A -- FUNDACAO DE INTEGRACAO ERP  (Bling-ready, SEM conectar ao Bling)
--
-- Migration ADITIVA por contrato:
--   - nenhum DROP TABLE, nenhum DELETE, nenhum dado perdido;
--   - nenhuma policy existente e alterada (o modo de acesso aberto da V2
--     continua exatamente como esta em 20260924130003_open_access_policies.sql);
--   - nada aqui dispara chamada externa. E somente estrutura.
--
-- REGRA DE ESCRITA DAS TABELAS DE INTEGRACAO (secoes 8, 35 e 36):
--   anon/authenticated -> SOMENTE SELECT (a interface le).
--   INSERT/UPDATE/DELETE -> SOMENTE service_role, que roda apenas no servidor
--   (webhook, jobs, reconciliacao). O navegador nunca escreve aqui.
--
-- TOKENS (secoes 12, 13 e 36): erp_connections nao tem policy nenhuma para
--   anon/authenticated e tem os grants revogados. A tabela e inalcancavel pelo
--   navegador. O painel le v_erp_connection_status, que expoe status e datas --
--   nunca o token.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. ORGANIZACOES (secao 35 -- toda tabela nova nasce com organization_id)
-- ============================================================================
create table if not exists organizations (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    slug       text not null unique,
    active     boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists organization_members (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    user_id         uuid not null references auth.users(id) on delete cascade,
    role            text not null default 'MEMBER'
        check (role in ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')),
    created_at      timestamptz not null default now(),
    unique (organization_id, user_id)
);

create index if not exists idx_org_members_user on organization_members (user_id);

-- Organizacao unica da operacao atual. O sistema roda hoje sem login; quando o
-- login entrar, esta linha e a organizacao do dono.
insert into organizations (name, slug)
select 'Central E-commerce', 'default'
 where not exists (select 1 from organizations where slug = 'default');

-- SECURITY DEFINER de proposito. Esta funcao e usada como DEFAULT de coluna em
-- 13 tabelas: se rodasse com a permissao de quem insere, bastaria a RLS de
-- `organizations` nao liberar a linha para o default virar NULL em silencio --
-- exatamente a inconsistencia silenciosa que a secao 40 proibe. Ela nao recebe
-- parametro e nao revela nada alem do id da organizacao, entao definir e seguro.
create or replace function default_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
    select id from organizations order by created_at limit 1;
$fn$;

revoke all on function default_organization_id() from public;
grant execute on function default_organization_id() to anon, authenticated, service_role;

comment on function default_organization_id() is
    'Organizacao corrente enquanto a operacao e single-tenant. Ponto unico de troca quando login/multi-org entrar.';

-- Predicado de RLS reutilizavel (secao 35).
create or replace function is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $fn$
    select exists (
        select 1 from organization_members m
         where m.organization_id = p_organization_id
           and m.user_id = auth.uid()
    );
$fn$;

-- ============================================================================
-- 2. organization_id NAS TABELAS EXISTENTES
--    Coluna NULLABLE com default e backfill: nenhuma query atual quebra e
--    nenhuma policy atual muda. Prepara o fechamento por organizacao (Fase B).
--    As views da V2 listam colunas explicitamente, entao nada nelas muda.
-- ============================================================================
do $backfill_org$
declare
    t text;
begin
    foreach t in array array[
        'categories','subcategories','transactions','investments','settings',
        'cost_centers','suppliers','products','orders','order_items',
        'stock_movements','channels','payment_methods'
    ] loop
        execute format(
            'alter table %I add column if not exists organization_id uuid references organizations(id)', t);
        execute format(
            'alter table %I alter column organization_id set default default_organization_id()', t);
        execute format(
            'update %I set organization_id = default_organization_id() where organization_id is null', t);
        execute format(
            'create index if not exists idx_%s_organization on %I (organization_id)', t, t);
    end loop;
end $backfill_org$;

-- ============================================================================
-- 3. PARAMETROS DA INTEGRACAO (secoes 15, 18, 26, 9, 11 -- nada hardcode)
-- ============================================================================
create table if not exists integration_settings (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    provider        text not null default 'BLING' check (provider in ('BLING')),

    -- Secao 15: nivel de automacao. Comeca sempre no mais conservador.
    automation_mode text not null default 'READ_ONLY'
        check (automation_mode in ('READ_ONLY', 'APPROVAL_REQUIRED', 'AUTOMATIC')),

    -- Secao 18: faixas de protecao de preco, em % de variacao.
    price_auto_max_percent     numeric(6,3) not null default 2,
    price_review_max_percent   numeric(6,3) not null default 5,
    price_approval_max_percent numeric(6,3) not null default 15,

    -- Secao 26: usados quando o produto/fornecedor nao tem prazo proprio.
    default_supplier_lead_days integer not null default 7 check (default_supplier_lead_days >= 0),
    default_safety_days        integer not null default 5 check (default_safety_days >= 0),

    -- Secao 25: janelas de velocidade de venda.
    velocity_short_days  integer not null default 7  check (velocity_short_days > 0),
    velocity_medium_days integer not null default 30 check (velocity_medium_days > 0),
    velocity_long_days   integer not null default 60 check (velocity_long_days > 0),

    -- Secoes 27 e 28: limiares do auditor. Os defaults sao ponto de partida --
    -- ajuste ao negocio. O que NAO pode e o numero morar no codigo (secao 18).
    target_margin_percent  numeric(6,3) not null default 25,
    min_margin_percent     numeric(6,3) not null default 5,
    -- Horizonte de cobertura que a compra sugerida deve cobrir (secao 26).
    purchase_coverage_days integer not null default 15 check (purchase_coverage_days > 0),
    -- Cobertura acima disto = capital parado em estoque.
    excess_coverage_days   integer not null default 120 check (excess_coverage_days > 0),
    -- Dias sem nenhuma venda para o produto ser considerado parado.
    stagnant_days          integer not null default 60  check (stagnant_days > 0),
    -- Cobertura minima no Full antes de acusar reposicao (secao 22).
    full_low_coverage_days integer not null default 10  check (full_low_coverage_days > 0),
    -- Aceleracao (velocidade curta vs media) que merece aviso, em %.
    acceleration_alert_percent numeric(6,3) not null default 50,

    -- Secao 9: teto de requisicoes. O limite diario fica NULL de proposito --
    -- preencher com o numero real do contrato, nunca com um palpite.
    api_requests_per_second integer not null default 3 check (api_requests_per_second > 0),
    api_daily_request_limit integer,

    -- Secao 11: circuit breaker.
    circuit_breaker_threshold        integer not null default 5   check (circuit_breaker_threshold > 0),
    circuit_breaker_cooldown_seconds integer not null default 300 check (circuit_breaker_cooldown_seconds > 0),

    -- Secao 5: webhooks nascem DESLIGADOS.
    webhooks_enabled boolean not null default false,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, provider)
);

insert into integration_settings (organization_id, provider)
select default_organization_id(), 'BLING'
 where not exists (
    select 1 from integration_settings
     where organization_id = default_organization_id() and provider = 'BLING'
 );

-- ============================================================================
-- 4. CONEXAO COM O ERP (secao 12) -- tokens cifrados, jamais no frontend
-- ============================================================================
create table if not exists erp_connections (
    id                  uuid primary key default gen_random_uuid(),
    organization_id     uuid not null references organizations(id) on delete cascade,
    provider            text not null default 'BLING' check (provider in ('BLING')),
    status              text not null default 'NOT_CONFIGURED'
        check (status in ('NOT_CONFIGURED', 'CONNECTED', 'TOKEN_EXPIRED', 'ERROR', 'DISCONNECTED')),

    external_company_id text,

    -- Secao 13: conteudo cifrado pela aplicacao (AES-256-GCM). O banco nunca ve
    -- o token em claro e a chave vive so no secret da Vercel.
    access_token_encrypted  text,
    refresh_token_encrypted text,
    access_token_expires_at timestamptz,

    -- Booleanos DERIVADOS do proprio token, mantidos pelo banco.
    -- Existem para que o painel saiba se ha token sem precisar de permissao de
    -- leitura sobre a coluna cifrada: ler uma coluna gerada exige privilegio
    -- sobre ELA, nao sobre a coluna de origem. E isso que permite a view de
    -- status ser security_invoker (RLS de verdade) em vez de SECURITY DEFINER.
    has_access_token  boolean generated always as (access_token_encrypted is not null) stored,
    has_refresh_token boolean generated always as (refresh_token_encrypted is not null) stored,

    -- Secao 14: escopos concedidos, sempre o minimo necessario.
    scopes text[] not null default '{}',

    -- Secao 11: saude da integracao / circuit breaker.
    health               text not null default 'UNKNOWN'
        check (health in ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'DOWN')),
    consecutive_failures integer not null default 0,
    degraded_until       timestamptz,

    last_successful_sync   timestamptz,
    last_reconciliation_at timestamptz,
    last_webhook_at        timestamptz,
    last_error             text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (organization_id, provider)
);

insert into erp_connections (organization_id, provider, status)
select default_organization_id(), 'BLING', 'NOT_CONFIGURED'
 where not exists (
    select 1 from erp_connections
     where organization_id = default_organization_id() and provider = 'BLING'
 );

-- ============================================================================
-- 5. EVENTOS RECEBIDOS (secoes 6 e 7) -- idempotencia por eventId
-- ============================================================================
create table if not exists integration_events (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references organizations(id) on delete cascade,
    provider          text not null default 'BLING',
    external_event_id text not null,
    event_type        text not null,
    payload           jsonb not null default '{}'::jsonb,
    status            text not null default 'PENDING'
        check (status in ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DISCARDED')),
    attempts          integer not null default 0,
    signature_valid   boolean,
    received_at       timestamptz not null default now(),
    processed_at      timestamptz,
    error             text,
    -- Secao 6: o Bling pode reenviar o mesmo evento. O reenvio bate aqui e nao
    -- gera processamento novo.
    --
    -- organization_id entra na chave porque em multi-tenant duas organizacoes com
    -- contas Bling diferentes podem receber eventos de mesmo id, e sem ele o
    -- evento da segunda seria descartado como duplicado. Dentro da organizacao a
    -- idempotencia continua exatamente a mesma.
    unique (organization_id, provider, external_event_id)
);

create index if not exists idx_integration_events_status on integration_events (status, received_at);
create index if not exists idx_integration_events_type   on integration_events (event_type);
create index if not exists idx_integration_events_org    on integration_events (organization_id);

-- ============================================================================
-- 6. FILA DE TRABALHO (secao 8) -- o webhook responde rapido, o job processa
-- ============================================================================
create table if not exists integration_jobs (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    provider        text not null default 'BLING',
    job_type        text not null,
    resource_type   text,
    resource_id     text,
    payload         jsonb not null default '{}'::jsonb,
    status          text not null default 'PENDING'
        check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING')),
    priority        integer not null default 100,
    attempts        integer not null default 0,
    max_attempts    integer not null default 5,
    next_attempt_at timestamptz not null default now(),
    -- Origem do job, quando nasceu de um webhook.
    event_id        uuid references integration_events(id) on delete set null,
    created_at      timestamptz not null default now(),
    started_at      timestamptz,
    processed_at    timestamptz,
    error           text
);

create index if not exists idx_integration_jobs_queue on integration_jobs (status, next_attempt_at, priority);
create index if not exists idx_integration_jobs_org   on integration_jobs (organization_id);

-- Nao acumular dois jobs identicos esperando pelo mesmo recurso.
--
-- ATENCAO PARA QUEM ESCREVER O PROCESSADOR DA FILA: este indice faz o segundo
-- evento do MESMO recurso nao gerar job novo (o insert bate em unique_violation e
-- o IntegrationService trata como ALREADY_QUEUED). A coalescencia e desejada -- a
-- secao 7 manda buscar o estado atual pela API em vez de aplicar evento por
-- evento em ordem. Mas cria uma obrigacao: ao concluir o job, marcar como
-- PROCESSED todos os eventos pendentes daquele recurso, nao apenas o que esta em
-- integration_jobs.event_id. Sem isso os eventos coalescidos ficam PENDING para
-- sempre e o alerta de fila acumulando dispara sem causa real.
create unique index if not exists ux_integration_jobs_pending
    on integration_jobs (
        organization_id, provider, job_type,
        coalesce(resource_type, ''), coalesce(resource_id, '')
    )
    where status in ('PENDING', 'RETRYING');

-- ============================================================================
-- 7. ESCRITAS PROPOSTAS (secoes 16 e 17) -- nenhuma alteracao silenciosa
-- ============================================================================
create table if not exists integration_actions (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    provider        text not null default 'BLING',
    action_type     text not null,
    resource_type   text not null,
    resource_id     text,
    product_id      uuid references products(id) on delete set null,
    status          text not null default 'PROPOSED'
        check (status in ('PROPOSED', 'APPROVED', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED')),

    -- Secao 16: antes / depois / motivo / impacto ficam gravados sempre.
    before_data    jsonb,
    proposed_data  jsonb,
    executed_data  jsonb,
    reason         text not null,
    impact_percent numeric(10,3),
    -- Secao 18: faixa de risco que a regra atribuiu a esta alteracao.
    risk_level     text check (risk_level in ('AUTO', 'REVIEW', 'APPROVAL', 'DOUBLE_CONFIRM')),

    requested_by uuid references profiles(id),
    approved_by  uuid references profiles(id),
    created_at   timestamptz not null default now(),
    approved_at  timestamptz,
    executed_at  timestamptz,
    error        text
);

create index if not exists idx_integration_actions_status on integration_actions (status, created_at desc);
create index if not exists idx_integration_actions_org    on integration_actions (organization_id);

-- ============================================================================
-- 8. VINCULO DE PRODUTO COM CANAIS EXTERNOS (secao 3)
--    Evita dezenas de colunas de id externo dentro de products.
-- ============================================================================
create table if not exists product_channels (
    id                  uuid primary key default gen_random_uuid(),
    organization_id     uuid not null references organizations(id) on delete cascade,
    product_id          uuid not null references products(id) on delete cascade,
    channel             text not null
        check (channel in ('BLING', 'MERCADO_LIVRE', 'SHOPEE', 'NUVEMSHOP')),
    external_product_id text not null,
    -- Vazio em vez de NULL de proposito: em indice unico dois NULL nao colidem,
    -- entao NULL permitiria a mesma variante duas vezes. String vazia tambem
    -- deixa o UNIQUE ser um constraint de verdade -- e `on_conflict` do
    -- PostgREST (usado no upsert do IntegrationService) exige constraint, nao
    -- indice por expressao.
    external_variant_id text not null default '',
    external_sku        text,
    active              boolean not null default true,
    last_synced_at      timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (organization_id, channel, external_product_id, external_variant_id)
);

create index if not exists idx_product_channels_product on product_channels (product_id);
create index if not exists idx_product_channels_channel on product_channels (channel, external_product_id);

-- ============================================================================
-- 9. SALDOS POR ORIGEM E DEPOSITO (secoes 20, 21 e 22)
--    estoque LOCAL e estoque FULL nunca se misturam: sao linhas diferentes.
-- ============================================================================
create table if not exists inventory_balances (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    product_id      uuid not null references products(id) on delete cascade,
    -- Secao 2: origem do saldo. LOCAL e o Bling; FULL_MERCADO_LIVRE e externo.
    source          text not null
        check (source in ('LOCAL', 'FULL_MERCADO_LIVRE', 'SHOPEE', 'OTHER')),
    -- Vazio em vez de NULL pelo mesmo motivo de product_channels: NULL nao
    -- colide em indice unico e `on_conflict` precisa de constraint.
    warehouse_external_id text not null default '',
    warehouse_name        text,
    -- Secao 21: fisico, virtual e reservado sao numeros diferentes.
    physical_quantity numeric(14,3) not null default 0,
    virtual_quantity  numeric(14,3) not null default 0,
    reserved_quantity numeric(14,3) not null default 0,
    updated_at        timestamptz not null default now(),
    synced_at         timestamptz,
    unique (organization_id, product_id, source, warehouse_external_id)
);

create index if not exists idx_inventory_balances_product on inventory_balances (product_id);
create index if not exists idx_inventory_balances_source  on inventory_balances (source);

-- ============================================================================
-- 10. SNAPSHOT DO ERP (secao 4)
--     Modelagem equivalente as tres tabelas sugeridas: um snapshot unico com
--     resource_type, porque o payload cru e sempre jsonb e assim a
--     reconciliacao (secao 32) varre uma tabela so.
-- ============================================================================
create table if not exists erp_snapshots (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    source          text not null default 'BLING',
    resource_type   text not null
        check (resource_type in (
            'PRODUCT', 'STOCK', 'ORDER', 'SUPPLIER', 'PRODUCT_SUPPLIER', 'INVOICE', 'WAREHOUSE'
        )),
    external_id     text not null,
    data            jsonb not null,
    -- Hash do payload: a reconciliacao compara sem reescrever linha igual.
    content_hash    text,
    last_synced_at  timestamptz not null default now(),
    deleted_at      timestamptz,
    unique (organization_id, source, resource_type, external_id)
);

create index if not exists idx_erp_snapshots_lookup
    on erp_snapshots (organization_id, resource_type, last_synced_at desc);

-- ============================================================================
-- 11. ALERTAS, RECOMENDACOES E RESULTADO (secoes 27, 29, 30, 31)
-- ============================================================================
create table if not exists alerts (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    -- Codigo da regra deterministica que gerou o alerta (secao 28).
    rule_code   text not null,
    domain      text not null
        check (domain in ('ESTOQUE', 'PRECO', 'CADASTRO', 'ADS', 'FULL', 'INTEGRACAO')),
    severity    text not null
        check (severity in ('CRITICO', 'IMPORTANTE', 'OPORTUNIDADE')),

    product_id    uuid references products(id) on delete cascade,
    resource_type text,
    resource_id   text,

    -- Secao 29: todo alerta explica o que aconteceu, por que importa, com quais
    -- numeros e o que fazer.
    title            text not null,
    what_happened    text not null,
    why_it_matters   text not null,
    data_points      jsonb not null default '{}'::jsonb,
    suggested_action text,

    status text not null default 'OPEN'
        check (status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
    -- Mesma regra + mesmo recurso nao gera alerta novo a cada execucao.
    fingerprint   text not null,
    first_seen_at timestamptz not null default now(),
    last_seen_at  timestamptz not null default now(),
    resolved_at   timestamptz,
    unique (organization_id, fingerprint)
);

create index if not exists idx_alerts_open    on alerts (organization_id, status, severity);
create index if not exists idx_alerts_product on alerts (product_id);

create table if not exists recommendations (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    alert_id        uuid references alerts(id) on delete set null,
    action_id       uuid references integration_actions(id) on delete set null,
    rule_code       text not null,
    product_id      uuid references products(id) on delete cascade,
    kind            text not null
        check (kind in ('PRICE', 'PURCHASE', 'FULL_RESTOCK', 'ADS', 'REGISTRY')),
    title           text not null,
    reason          text not null,
    current_value   numeric(14,4),
    proposed_value  numeric(14,4),
    expected_impact jsonb not null default '{}'::jsonb,
    status          text not null default 'OPEN'
        check (status in ('OPEN', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'APPLIED')),
    created_at timestamptz not null default now(),
    decided_at timestamptz,
    decided_by uuid references profiles(id)
);

create index if not exists idx_recommendations_status
    on recommendations (organization_id, status, created_at desc);

-- Secao 31: "a recomendacao foi boa?". Medicao depois de N dias.
create table if not exists recommendation_outcomes (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references organizations(id) on delete cascade,
    recommendation_id uuid not null references recommendations(id) on delete cascade,
    measured_at       timestamptz not null default now(),
    window_days       integer not null check (window_days > 0),
    before_metrics    jsonb not null default '{}'::jsonb,
    after_metrics     jsonb not null default '{}'::jsonb,
    verdict           text check (verdict in ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'INCONCLUSIVE')),
    notes             text,
    unique (recommendation_id, window_days)
);

-- ============================================================================
-- 12. TRIGGERS DE updated_at PARA AS TABELAS NOVAS
--     Reaproveita set_updated_at() de 20260924130001.
-- ============================================================================
do $touch_new$
declare
    t text;
begin
    foreach t in array array[
        'organizations','integration_settings','erp_connections',
        'product_channels','inventory_balances'
    ] loop
        execute format('drop trigger if exists trg_%s_updated_at on %I', t, t);
        execute format(
            'create trigger trg_%s_updated_at before update on %I for each row execute function set_updated_at()',
            t, t);
    end loop;
end $touch_new$;

-- ============================================================================
-- 13. RLS DAS TABELAS NOVAS (secoes 35 e 36)
--
--     Leitura: anon + authenticated (a operacao roda sem login hoje, igual ao
--     resto da V2). Escrita: NENHUMA policy -- a RLS nega, e somente a
--     service_role (que ignora RLS e nunca sai do servidor) escreve.
--
--     >>> COMO FECHAR POR ORGANIZACAO DEPOIS (2 linhas): troque
--     >>>     v_read_roles constant text := 'anon, authenticated';
--     >>>     v_predicate  constant text := 'true';
--     >>> por
--     >>>     v_read_roles constant text := 'authenticated';
--     >>>     v_predicate  constant text := 'is_org_member(organization_id)';
--     >>> em uma migration nova com este mesmo bloco.
-- ============================================================================
do $rls_new$
declare
    v_read_roles constant text := 'anon, authenticated';
    v_predicate  constant text := 'true';
    v_tables constant text[] := array[
        'organizations','integration_settings','integration_events','integration_jobs',
        'integration_actions','product_channels','inventory_balances','erp_snapshots',
        'alerts','recommendations','recommendation_outcomes'
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

        -- organizations nao tem coluna organization_id: o predicado dela e o id.
        execute format(
            'create policy "integration_read" on %I for select to %s using (%s)',
            t, v_read_roles,
            case when t = 'organizations' then 'true' else v_predicate end);

        -- Escrita fica fora do alcance do navegador (secao 36).
        execute format('revoke insert, update, delete on %I from anon, authenticated', t);
        execute format('grant all on %I to service_role', t);
    end loop;
end $rls_new$;

-- organization_members: cada um ve apenas os proprios vinculos.
alter table organization_members enable row level security;
drop policy if exists "org_members_read_own" on organization_members;
create policy "org_members_read_own" on organization_members
    for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on organization_members from anon, authenticated;
grant all on organization_members to service_role;

-- ============================================================================
-- 14. erp_connections -- A TABELA DOS SEGREDOS (secoes 12, 13, 36)
--
--     Estrategia: RLS de verdade + grant POR COLUNA.
--
--     As colunas cifradas ficam fora do grant, entao nem a interface nem o
--     PostgREST conseguem le-las -- `select *` por anon/authenticated falha com
--     permissao negada, e esse e o comportamento desejado. As colunas de status
--     ficam liberadas e passam pela policy normalmente.
--
--     Isto substitui a alternativa de publicar os dados por uma view
--     SECURITY DEFINER: aquela funcionaria, mas furaria a RLS da tabela e, em
--     multi-tenant, deixaria qualquer usuario ver o status (e a mensagem de erro)
--     da conexao de outra organizacao.
-- ============================================================================
alter table erp_connections enable row level security;

do $conn_pol$
declare
    pol record;
begin
    for pol in
        select policyname from pg_policies
         where schemaname = 'public' and tablename = 'erp_connections'
    loop
        execute format('drop policy if exists %I on erp_connections', pol.policyname);
    end loop;
end $conn_pol$;

create policy "erp_connections_read_status" on erp_connections
    for select to anon, authenticated using (true);

-- Tira tudo e devolve SOMENTE as colunas sem segredo.
revoke all on erp_connections from anon, authenticated;

grant select (
    id, organization_id, provider, status, health, external_company_id, scopes,
    consecutive_failures, degraded_until,
    has_access_token, has_refresh_token, access_token_expires_at,
    last_successful_sync, last_reconciliation_at, last_webhook_at, last_error,
    created_at, updated_at
) on erp_connections to anon, authenticated;

grant all on erp_connections to service_role;

comment on column erp_connections.access_token_encrypted is
    'AES-256-GCM aplicado pela aplicacao (src/integrations/crypto.ts). SEM grant de SELECT para anon/authenticated.';
comment on column erp_connections.refresh_token_encrypted is
    'AES-256-GCM aplicado pela aplicacao (src/integrations/crypto.ts). SEM grant de SELECT para anon/authenticated.';

-- ============================================================================
-- 15. VIEW DE STATUS DA CONEXAO (secao 33)
--     security_invoker = TRUE: a RLS de erp_connections continua valendo e a view
--     nao tem privilegio nenhum a mais do que quem a consulta. Ela funciona
--     porque toda coluna que projeta esta no grant por coluna da secao 14.
--
--     NAO troque para security_invoker = false e NAO adicione aqui coluna
--     cifrada: qualquer das duas coisas transforma esta view num furo de RLS.
-- ============================================================================
drop view if exists v_erp_connection_status cascade;

create view v_erp_connection_status
with (security_invoker = true) as
select c.id,
       c.organization_id,
       c.provider,
       c.status,
       c.health,
       c.external_company_id,
       c.scopes,
       c.consecutive_failures,
       c.degraded_until,
       -- Calculado aqui e nao na interface: comparar com o relogio durante a
       -- renderizacao e funcao impura (regra de pureza do React) e o banco ja
       -- sabe que horas sao.
       (c.degraded_until is not null and c.degraded_until > now()) as is_degraded,
       c.last_successful_sync,
       c.last_reconciliation_at,
       c.last_webhook_at,
       c.last_error,
       c.has_access_token,
       c.has_refresh_token,
       c.access_token_expires_at,
       case
           when c.access_token_expires_at is null then null
           else floor(extract(epoch from (c.access_token_expires_at - now())) / 60)::bigint
       end as token_expires_in_minutes,
       c.created_at,
       c.updated_at
  from erp_connections c;

-- ============================================================================
-- 16. VIEW DA FILA (secao 33) -- os numeros do painel em uma chamada
-- ============================================================================
drop view if exists v_integration_queue_health cascade;

create view v_integration_queue_health
with (security_invoker = true) as
select o.id as organization_id,
       coalesce(j.pending, 0)        as jobs_pending,
       coalesce(j.processing, 0)     as jobs_processing,
       coalesce(j.failed, 0)         as jobs_failed,
       coalesce(j.retrying, 0)       as jobs_retrying,
       j.oldest_pending_at,
       coalesce(e.events_pending, 0) as events_pending,
       coalesce(e.events_failed, 0)  as events_failed,
       coalesce(e.events_today, 0)   as events_today,
       e.last_event_at
  from organizations o
  left join (
        select organization_id,
               count(*) filter (where status = 'PENDING')    as pending,
               count(*) filter (where status = 'PROCESSING') as processing,
               count(*) filter (where status = 'FAILED')     as failed,
               count(*) filter (where status = 'RETRYING')   as retrying,
               min(next_attempt_at) filter (where status in ('PENDING', 'RETRYING')) as oldest_pending_at
          from integration_jobs
         group by organization_id
  ) j on j.organization_id = o.id
  left join (
        select organization_id,
               count(*) filter (where status in ('PENDING', 'PROCESSING'))     as events_pending,
               count(*) filter (where status = 'FAILED')                      as events_failed,
               count(*) filter (where received_at >= date_trunc('day', now())) as events_today,
               max(received_at) as last_event_at
          from integration_events
         group by organization_id
  ) e on e.organization_id = o.id;

-- ============================================================================
-- 17. DATASET ANALITICO DE VENDAS (secao 23)
--     View, nao tabela: a venda ja vive em orders/order_items e copia-la seria
--     criar o ERP paralelo que a secao 37 proibe. Quando Bling/ML/Shopee
--     passarem a alimentar a venda, esta view vira a leitura consolidada.
--     Os custos do pedido sao rateados pela participacao do item na receita.
-- ============================================================================
drop view if exists v_sales_fact cascade;

create view v_sales_fact
with (security_invoker = true) as
with item_share as (
    select oi.id          as order_item_id,
           oi.order_id,
           oi.product_id,
           oi.quantity,
           oi.gross_total,
           oi.cost_total,
           case when coalesce(o.gross_amount, 0) > 0
                then oi.gross_total / o.gross_amount
                else 0 end as share
      from order_items oi
      join orders o on o.id = oi.order_id
     where o.status <> 'CANCELADO'
)
select s.order_item_id,
       o.organization_id,
       o.id           as order_id,
       o.order_number,
       s.product_id,
       p.sku,
       o.channel_id,
       coalesce(ch.name, 'Sem canal')          as channel,
       o.order_date,
       s.quantity,
       s.gross_total                           as gross_revenue,
       round(o.discount_amount  * s.share, 2)  as discount,
       round(o.shipping_charged * s.share, 2)  as shipping_charged,
       round(o.shipping_cost    * s.share, 2)  as shipping_cost,
       round((o.marketplace_fee + o.gateway_fee) * s.share, 2) as fees,
       round(o.tax_amount       * s.share, 2)  as tax,
       round(o.packaging_cost   * s.share, 2)  as packaging,
       round(o.marketing_cost   * s.share, 2)  as ads_attributed,
       round(o.other_costs      * s.share, 2)  as other_costs,
       s.cost_total                            as cogs,
       round(
           s.gross_total
         - (o.discount_amount  * s.share)
         + (o.shipping_charged * s.share)
         - s.cost_total
         - ((o.marketplace_fee + o.gateway_fee + o.tax_amount + o.shipping_cost
             + o.packaging_cost + o.marketing_cost + o.other_costs) * s.share), 2) as net_revenue
  from item_share s
  join orders o         on o.id  = s.order_id
  left join products p  on p.id  = s.product_id
  left join channels ch on ch.id = o.channel_id;

-- ============================================================================
-- 18. GRANTS DAS VIEWS NOVAS
-- ============================================================================
grant select on v_erp_connection_status, v_integration_queue_health, v_sales_fact
      to anon, authenticated, service_role;
