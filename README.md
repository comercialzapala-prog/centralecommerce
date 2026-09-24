# Central E-commerce — Control Center (V2)

Sistema interno de gestão do e-commerce: financeiro, comercial e operacional,
tratado como operação independente da importadora.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 ·
shadcn/ui · Supabase (PostgreSQL) · Recharts · Vercel

## Rodando

```bash
npm install
npm run dev
```

`.env.local` precisa de:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

A service role **nunca** entra no navegador nem neste arquivo.

## Banco

```bash
npx supabase db push    # aplica as migrations pendentes
npm run test:v2         # valida os cenários da seção 49 contra o banco real
```

Para aplicar pelo painel, `supabase/V2_COMPLETO.sql` traz as quatro migrations
consolidadas, na ordem certa, em script idempotente (pode rodar de novo sem
duplicar nada).

## Os quatro conceitos que não se misturam

| Conceito | Pergunta que responde | Onde mora |
|---|---|---|
| **Categoria** | O que é esse gasto? | `categories` |
| **Centro de custo** | Qual área consumiu o recurso? | `cost_centers` (recursiva, `parent_id`) |
| **Fornecedor** | Para quem o dinheiro foi pago? | `suppliers` |
| **Canal** | Onde a venda aconteceu? | `channels` |

Um lançamento guarda **apenas `cost_center_id`**. A hierarquia inteira
("Operação Logística > Expedição > Sacolas") sai da relação `parent_id` pela
view `v_cost_center_hierarchy` — sem colunas `centro`/`subcentro`/`subsubcentro`.

## Regras de cálculo

Todas em `src/lib/finance.ts`, sem duplicação em componente nenhum:

- **Aporte** entra no caixa e **não** é receita nem resultado.
- **Estorno** entra no caixa e **abate** a despesa do centro de custo.
- **Cancelado** não conta em nada (zerado já na view `v_transaction_full`).
- **Investimento** não é despesa do mês: forma o total a recuperar.
- `Resultado acumulado = receitas − despesas − investimentos`
- `Caixa = saldo inicial + entradas + aportes + estornos − saídas − investimentos`

### O indicador 0/50

**50 é a escala do indicador, nunca um valor em reais.** Com R$ 25.000
investidos e R$ 10.000 recuperados o sistema mostra `20 / 50`, `40% do caminho`,
`R$ 10.000 recuperados`, `R$ 15.000 restantes` — e em lugar nenhum
"R$ 20.000 de R$ 50.000". Quando o resultado acumulado chega a zero: `50 / 50`.

## Estrutura

```
src/lib/finance.ts        cálculos (fonte única da verdade)
src/lib/data.ts           leitura do Supabase (Server Components)
src/lib/actions.ts        validação e contrato das Server Actions
src/app/*/actions.ts      escritas, uma por módulo
supabase/migrations/      migrations incrementais
scripts/test-v2.mjs       validação dos cenários contra o banco real
```

## Auditoria

Registros financeiros carregam `created_at`, `created_by`, `updated_at`,
`updated_by`. Nada é apagado fisicamente: usa-se `active = false` ou
`status = 'CANCELADO'`.

## Deploy na Vercel

Conecte o repositório e configure `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_ANON_KEY` nas variáveis de ambiente do projeto.
