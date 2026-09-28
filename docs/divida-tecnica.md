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
