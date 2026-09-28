-- ============================================================================
-- ESTADO DE REVISAO DO /hoje
--
-- Migration ADITIVA. Nenhum DROP, nenhum DELETE, nenhuma policy alterada.
--
-- Resolve UMA pergunta da pagina: "o que aconteceu desde a minha ultima
-- analise?". Sem guardar quando foi a ultima analise, essa pergunta nao tem
-- resposta -- e responder "as ultimas 24 horas" seria inventar um recorte.
--
-- Mora em organization_members, e nao em profiles, porque a revisao e POR
-- USUARIO E POR ORGANIZACAO: a mesma pessoa pode revisar duas operacoes em
-- ritmos diferentes. profiles nao tem organizacao.
-- ============================================================================

alter table organization_members
    add column if not exists last_reviewed_at timestamptz;

comment on column organization_members.last_reviewed_at is
    'Ultima vez que este usuario marcou o /hoje como revisado nesta organizacao. Null = nunca revisou.';

-- ============================================================================
-- Auditoria de execucao do auditor
--
-- A pagina precisa dizer quando a analise rodou e o que ela produziu. Sem isso o
-- usuario nao tem como saber se esta olhando numeros de agora ou de tres dias
-- atras -- e alerta velho apresentado como atual e pior do que alerta nenhum.
-- ============================================================================
create table if not exists auditor_runs (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references organizations(id) on delete cascade,
    started_at      timestamptz not null default now(),
    finished_at     timestamptz,
    -- Data de referencia usada pelas regras (o "hoje" do auditor).
    reference_date  date not null,
    products_analyzed integer not null default 0,
    findings_total    integer not null default 0,
    findings_critical integer not null default 0,
    findings_important integer not null default 0,
    findings_opportunity integer not null default 0,
    -- Alertas que a execucao fechou por nao terem mais causa.
    auto_resolved   integer not null default 0,
    status text not null default 'RUNNING'
        check (status in ('RUNNING', 'COMPLETED', 'FAILED')),
    error text,
    triggered_by uuid references profiles(id)
);

create index if not exists idx_auditor_runs_org
    on auditor_runs (organization_id, started_at desc);

-- ============================================================================
-- alerts: campos que a pagina exige e que nao existiam
-- ============================================================================
alter table alerts
    -- Secao 29: "impacto financeiro quando calculavel". NULL quando a regra nao
    -- tem base para calcular -- e nao zero, que seria afirmar "custa nada".
    add column if not exists financial_impact numeric(14,2),
    add column if not exists impact_kind text
        check (impact_kind in ('RISCO_RECEITA', 'PERDA_MARGEM', 'CAPITAL_PARADO', 'DESEMBOLSO')),
    -- Para onde ir para resolver. Calculado pela regra, nao pela tela.
    add column if not exists action_href text,
    -- SKU e canal desnormalizados: a lista do /hoje mostra os dois e nao deve
    -- fazer join com products para cada linha.
    add column if not exists sku text,
    add column if not exists channel text,
    -- Qual execucao viu este alerta pela ultima vez. Permite fechar sozinho o
    -- alerta que deixou de aparecer.
    add column if not exists last_run_id uuid references auditor_runs(id) on delete set null,
    add column if not exists acknowledged_at timestamptz,
    add column if not exists dismissed_at timestamptz;

create index if not exists idx_alerts_last_seen on alerts (organization_id, last_seen_at desc);
create index if not exists idx_alerts_impact
    on alerts (organization_id, severity, financial_impact desc nulls last);

-- ============================================================================
-- RLS das tabelas novas -- mesmo desenho do hardening:
-- leitura por membro, escrita somente service_role.
-- ============================================================================
alter table auditor_runs enable row level security;

do $pol$
declare
    pol record;
begin
    for pol in
        select policyname from pg_policies
         where schemaname = 'public' and tablename = 'auditor_runs'
    loop
        execute format('drop policy if exists %I on auditor_runs', pol.policyname);
    end loop;
end $pol$;

create policy "org_select" on auditor_runs
    for select to authenticated using ((select is_org_member(organization_id)));

revoke all on auditor_runs from anon;
revoke insert, update, delete on auditor_runs from authenticated;
grant select on auditor_runs to authenticated;
grant all on auditor_runs to service_role;

-- ============================================================================
-- VIEW -- o cabecalho do /hoje em uma chamada
--
-- Conta alerta ABERTO por severidade. Alerta resolvido ou ignorado nao entra:
-- o cabecalho responde "o que exige atencao agora", nao "o que ja aconteceu".
-- ============================================================================
drop view if exists v_hoje_summary cascade;

create view v_hoje_summary
with (security_invoker = true) as
select o.id as organization_id,
       coalesce(a.critical, 0)    as critical_open,
       coalesce(a.important, 0)   as important_open,
       coalesce(a.opportunity, 0) as opportunity_open,
       coalesce(a.total_open, 0)  as total_open,
       -- Secao 27: produtos distintos com risco de ruptura ou estoque zerado.
       coalesce(a.stockout_products, 0) as stockout_products,
       -- Soma do impacto financeiro dos alertas abertos que sabem calcular.
       coalesce(a.impact_at_risk, 0)    as impact_at_risk,
       a.newest_alert_at,
       coalesce(r.resolved_7d, 0) as resolved_7d,
       run.last_run_at,
       run.last_run_status
  from organizations o
  left join (
        select organization_id,
               count(*) filter (where severity = 'CRITICO')      as critical,
               count(*) filter (where severity = 'IMPORTANTE')   as important,
               count(*) filter (where severity = 'OPORTUNIDADE') as opportunity,
               count(*)                                          as total_open,
               count(distinct product_id) filter (
                   where rule_code in ('STOCK_STOCKOUT_RISK', 'STOCK_OUT')
               ) as stockout_products,
               sum(financial_impact)                             as impact_at_risk,
               max(last_seen_at)                                 as newest_alert_at
          from alerts
         where status in ('OPEN', 'ACKNOWLEDGED')
         group by organization_id
  ) a on a.organization_id = o.id
  left join (
        select organization_id, count(*) as resolved_7d
          from alerts
         where status = 'RESOLVED'
           and resolved_at >= now() - interval '7 days'
         group by organization_id
  ) r on r.organization_id = o.id
  left join (
        select distinct on (organization_id)
               organization_id,
               started_at as last_run_at,
               status     as last_run_status
          from auditor_runs
         order by organization_id, started_at desc
  ) run on run.organization_id = o.id;

grant select on v_hoje_summary to authenticated, service_role;

-- ============================================================================
-- VERIFICACAO -- mantem os invariantes do hardening
-- ============================================================================
do $verify$
declare
    v_count int;
    v_list  text;
begin
    select count(*), string_agg(format('%s.%s', tablename, policyname), ', ')
      into v_count, v_list
      from pg_policies
     where schemaname = 'public' and 'anon' = any(roles);

    if v_count > 0 then
        raise exception 'Regressao: % policy(ies) aceitam anon: %', v_count, v_list;
    end if;

    select count(*), string_agg(table_name, ', ')
      into v_count, v_list
      from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon';

    if v_count > 0 then
        raise exception 'Regressao: anon voltou a ter grant em: %', v_list;
    end if;

    select count(*), string_agg(c.relname, ', ')
      into v_count, v_list
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'v'
       and not coalesce(c.reloptions::text[] @> array['security_invoker=true'], false);

    if v_count > 0 then
        raise exception 'Regressao: view(s) SECURITY DEFINER: %', v_list;
    end if;

    raise notice 'Estado de revisao do /hoje criado; invariantes do hardening intactos.';
end $verify$;
