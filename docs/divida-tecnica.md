# Dívida técnica

Itens conhecidos, com decisão registrada de **não** resolver agora. Cada um traz
o que quebra, quando passa a importar e qual é a correção.

## Antes de multi-tenant real

Os três primeiros são inofensivos com **uma** organização e errados com duas.
Nenhum deles é furo de segurança hoje — a RLS barra o acesso em todos eles.

### 1. Cache de módulo em `organization.ts`

`src/integrations/organization.ts` guarda o `organization_id` em `cachedId`, uma
variável de módulo compartilhada entre requests do mesmo processo.

**Quebra quando:** existir a segunda organização. O primeiro request aquece o
cache e os seguintes recebem a organização errada.

**Por que é tolerável agora:** o módulo só serve infraestrutura (webhook, jobs),
e a resposta é a mesma para todos — a organização da instalação, não a do
usuário. A tela nunca usa esse caminho: ela tira a organização de
`requireMembership()`.

**Correção:** remover o cache, ou chavear por usuário.

### 2. Ponte single-org em `current_organization_id()`

A função tem um `coalesce` que, na falta de vínculo, cai na única organização
existente.

**Não é bypass, e isso está provado:** `npm run test:rls` verifica que um
não-membro inserindo **sem** informar `organization_id` — ou seja, recebendo esse
default — é recusado pelo `WITH CHECK is_org_member()`. O default resolve um
valor; quem autoriza é a policy.

**Quebra quando:** existir a segunda organização — aí o default passa a apontar
para a organização errada em inserts sem `organization_id` explícito.

**Correção:** remover o `coalesce` (o comentário na migration marca o ponto).

### 3. `profiles.role`

Coluna `ADMIN`/`USER` herdada do V1. **Não é lida em lugar nenhum** do código
(verificado por grep). O papel que vale é `organization_members.role`.

**Risco:** alguém assumir que ela autoriza algo. Hoje ela não autoriza nada.

**Correção:** remover a coluna, ou passar a usá-la de propósito. Não as duas.

## Autorização

### 4. `DELETE` liberado para qualquer membro

As 13 tabelas de negócio têm `org_delete` com `is_org_member`. Qualquer membro
apaga qualquer registro da organização.

**Decisão:** mantido nesta etapa, por acordo.

**Próxima melhoria:** revisar entidade por entidade o que exige `OWNER`/`ADMIN`.
A policy já está isolada numa linha por tabela em
`20261005000000_rls_hardening.sql` — trocar `is_org_member` por `is_org_admin` na
linha de `org_delete` é a alteração inteira. Candidatas a exigir admin:
`transactions`, `investments`, `orders`, `cost_centers` (histórico financeiro e
hierarquia). Candidatas a seguir em membro: `channels`, `payment_methods`,
`categories` (cadastros de apoio).

## Identidade dos clients Supabase

A regra, verificada por `npm run test:boundaries`:

| uso | client | identidade |
|---|---|---|
| dado de negócio | `createAuthedClient()` | cookie do usuário, passa pela RLS |
| infraestrutura sem usuário | `createInfraClient()` | service role |
| navegador | `@/lib/supabase/client` | anon, só o que a RLS permitir |

Em 2026-09-29, ao investigar o `permission denied for table products` da produção,
apareceram duas armadilhas latentes — nenhuma era a causa do incidente (aquele foi
deploy antigo contra banco novo), mas as duas o teriam disfarçado:

- **`src/lib/supabase.ts`** — client anon em escopo de módulo, com
  `|| 'placeholder'` nas credenciais. Não era importado por ninguém. **Removido.**
- **`createInfraClient()` caía para o client de cookie** quando a service role não
  estava configurada. A justificativa escrita na própria função era "é aceitável
  porque hoje `anon` ainda lê essas tabelas" — premissa que o hardening apagou.
  Num contexto sem sessão (webhook, cron) essa queda resolvia para **anon**.
  **Removida:** agora a falta da chave é `ServiceRoleNotConfiguredError`.

Teste de permissão no banco não pegaria nenhuma das duas: o banco estava correto
nos dois casos. O que estava errado era **quem a aplicação mandava perguntar** —
por isso metade de `test-client-boundaries.mjs` lê o código-fonte, não o banco.

## Deploy

### 5. `SUPABASE_SERVICE_ROLE_KEY` na Vercel

**Requisito de deploy, não dívida opcional.** Sem ela em produção:

- o webhook do Bling e a futura fila falham — `createInfraClient()` cai no client
  de cookie, que depois do hardening não tem permissão;
- a execução do auditor em `/hoje` falha ao gravar em `alerts`.

Regras: nome exatamente `SUPABASE_SERVICE_ROLE_KEY`, **nunca** com prefixo
`NEXT_PUBLIC_`, escopo apenas de servidor.

A falha é explícita (`ServiceRoleNotConfiguredError`), não silenciosa.

Verificação de que ela não vaza para o cliente: `npm run test:auth` varre
`.next/static` e o HTML servido a cada execução.

**Estado:** configurada em Production na Vercel em 2026-09-29, como *Sensitive*.

### 6. `CRON_SECRET` na Vercel

Também **requisito de deploy**, pelo mesmo motivo de existir: `GET
/api/cron/auditor` roda a análise de *todas* as organizações. Sem segredo ela
seria um botão público de carga para quem descobrisse o caminho.

Sem a variável a rota responde **503 e não executa nada** — recusar é a falha
segura; rodar sem saber quem chamou não é.

O Vercel envia `Authorization: Bearer $CRON_SECRET` sozinho quando a variável
existe no projeto, então não há nada a configurar do lado do agendador.

**Estado:** configurada em Production em 2026-09-29, valor diferente do usado em
`.env.local`.

### 7. Frequência do cron

`vercel.json` agenda `0 10 * * *` — 10:00 UTC, **07:00 de Brasília**, uma vez por
dia. Duas decisões embutidas:

- **Uma vez por dia** é o que todo plano do Vercel aceita, o Hobby inclusive.
  Se o projeto estiver em Pro e você quiser a análise mais de uma vez, é só mudar
  a expressão — o código não muda.
- **07:00**, antes do expediente, para a página já estar atualizada quando você
  abrir. No Hobby o disparo pode atrasar até uma hora; por isso o horário tem
  folga em vez de ser colado no início do dia.

O cron só dispara em deployment de **produção**. Preview não executa — e isso é
desejável: dois ambientes analisando o mesmo banco brigariam pela reconciliação.

O botão "Atualizar análise" continua existindo para a execução sob demanda, com
o cooldown de 30s. O cron tem a própria guarda, de 5 minutos, contra disparo
duplicado.
