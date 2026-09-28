-- ============================================================================
-- PROFILES AUTOMATICO A PARTIR DE auth.users
--
-- Migration ADITIVA. Nenhum DROP TABLE, nenhum DELETE, nenhuma policy alterada.
--
-- ESCOPO DELIBERADAMENTE MINIMO. O trigger cria o profile e MAIS NADA:
--   - nao cria organization_members;
--   - nao concede acesso a organizacao nenhuma;
--   - nao cria permissao;
--   - nao promove ninguem a ADMIN (o default da coluna e 'USER').
--
-- O motivo e de seguranca, nao de simplicidade: enquanto o cadastro publico
-- estiver habilitado, qualquer pessoa cria conta. Se o trigger vinculasse o
-- usuario a uma organizacao, "criar conta" passaria a significar "ganhar acesso
-- aos dados da empresa". Membership e explicito, sempre.
--
-- Ter profile, portanto, NAO da acesso a nada. Quem da acesso e
-- organization_members.
-- ============================================================================

-- ============================================================================
-- 1. FUNCAO
--
--    SECURITY DEFINER por necessidade: o trigger roda no contexto de quem
--    inseriu em auth.users (o GoTrue), que nao tem privilegio sobre
--    public.profiles. Definer + search_path travado e o padrao correto aqui.
--
--    search_path fixo tambem impede captura de nome: sem ele, um schema
--    malicioso no caminho poderia sequestrar `profiles`.
-- ============================================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
    -- Idempotente: `on conflict do nothing`. Reexecutar, reprocessar ou receber
    -- o evento duas vezes nao gera erro nem sobrescreve nome ja ajustado.
    insert into public.profiles (id, full_name)
    values (
        new.id,
        -- O nome vem do metadata quando o cadastro informou; senao fica null e
        -- o usuario preenche depois. Nao inventamos nome a partir do e-mail.
        nullif(trim(coalesce(
            new.raw_user_meta_data ->> 'full_name',
            new.raw_user_meta_data ->> 'name',
            ''
        )), '')
    )
    on conflict (id) do nothing;

    return new;
end $fn$;

comment on function handle_new_user() is
    'Cria public.profiles para cada novo auth.users. Nao concede acesso: membership e explicito em organization_members.';

-- ============================================================================
-- 2. TRIGGER
--
--    AFTER INSERT: o profile so nasce depois de o usuario existir de fato.
--    Nao depende da primeira visita do usuario ao app -- o profile existe a
--    partir do instante do cadastro, mesmo que a pessoa nunca abra a Central.
-- ============================================================================
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function handle_new_user();

-- ============================================================================
-- 3. BOOTSTRAP DO ESTADO EXISTENTE
--
--    Usuarios criados ANTES deste trigger nao tem profile. Corrige sem tocar em
--    quem ja tem (o `not exists` e o `on conflict` cobrem os dois sentidos).
--
--    Continua sem criar membership: um usuario preexistente ganha profile, nao
--    acesso.
-- ============================================================================
insert into public.profiles (id, full_name)
select u.id,
       nullif(trim(coalesce(
           u.raw_user_meta_data ->> 'full_name',
           u.raw_user_meta_data ->> 'name',
           ''
       )), '')
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ============================================================================
-- 4. VERIFICACAO
--    Denuncia na hora se sobrou usuario sem profile.
-- ============================================================================
do $verify$
declare
    v_orphans bigint;
    v_total   bigint;
begin
    select count(*) into v_orphans
      from auth.users u
     where not exists (select 1 from public.profiles p where p.id = u.id);

    select count(*) into v_total from auth.users;

    if v_orphans > 0 then
        raise exception 'Ainda ha % usuario(s) sem profile de um total de %.', v_orphans, v_total;
    end if;

    raise notice 'profiles em dia: % usuario(s), 0 orfao(s).', v_total;
end $verify$;
