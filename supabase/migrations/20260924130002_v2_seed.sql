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
