# supabase/pending

Migrations **escritas e revisadas, mas propositalmente fora de `migrations/`**.

`supabase db push` só olha `supabase/migrations/`. Enquanto um arquivo estiver
aqui, ele não é aplicado nem por acidente.

**Ativar uma migration = mover o arquivo para `supabase/migrations/` e rodar o
push.** Não copie o conteúdo para outro arquivo: o nome com timestamp é o que
define a ordem.

## Fila atual

### `20261005000000_rls_hardening.sql`

Fecha a RLS: `authenticated → organization_members → organization_id`. Acaba com
o acesso de `anon` aos dados da empresa.

**Bloqueada por pré-requisito, não por dúvida técnica.** Aplicar hoje derruba o
aplicativo: a Central roda sem login, toda consulta sai como `anon`, e o projeto
linkado tem **0 usuários** em `profiles`. O resultado seria toda página vazia.

Ordem para liberar:

1. Tela de login (Supabase Auth) + middleware de sessão.
2. Criar o usuário.
3. Inserir a linha em `organization_members` (SQL no fim do arquivo).
4. Desligar o cadastro público em Auth → Sign Up no painel do Supabase.
5. Mover o arquivo e aplicar.
6. Rodar `node scripts/test-rls.mjs` e conferir que os resultados viraram
   `anon: bloqueado`.

Também exige uma mudança de código junto: `src/integrations/organization.ts`
guarda o `organization_id` em cache de módulo — inofensivo com uma organização,
errado com duas.

Rollback: reaplicar `20260924130003_open_access_policies.sql` devolve o modo
aberto. Nenhum dado é apagado pelo hardening; o rollback é só de permissão.
