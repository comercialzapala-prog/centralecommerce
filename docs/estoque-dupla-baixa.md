# `order_items_sync_stock`: onde ele age e como sair dele sem dupla baixa

O trigger **fica como está por agora.** Este documento existe para que a remoção
seja uma decisão informada e cirúrgica, não uma limpeza no escuro.

Definido em `supabase/migrations/20260924130001_v2_views_and_rollups.sql`, seção 3.

## O que ele faz

`AFTER INSERT OR UPDATE ON order_items` → cria (ou atualiza) **um**
`stock_movements` do tipo `VENDA`, com `order_item_id` apontando de volta para o
item. Um item de pedido, um movimento de estoque.

## Fluxos em que ele participa

Levantamento completo de quem escreve em `order_items` hoje:

| # | Origem | Arquivo | Efeito no estoque |
|---|---|---|---|
| 1 | Criar pedido com itens | `src/app/vendas/actions.ts` → `createOrder` | 1 movimento `VENDA` por item |
| 2 | Adicionar item a pedido existente | `src/app/vendas/actions.ts` → `addOrderItem` | 1 movimento `VENDA` |
| 3 | Remover item | `src/app/vendas/actions.ts` → `removeOrderItem` | movimento **desaparece** (FK `ON DELETE CASCADE`) |
| 4 | Apagar pedido | `orders` → CASCADE em `order_items` → CASCADE em `stock_movements` | movimentos desaparecem |
| 5 | Mudar a data do pedido | `updateOrder` → trigger `orders_sync_stock_date` | `movement_date` dos movimentos acompanha |
| 6 | Cancelar pedido | `setOrderStatus` | movimento **permanece**; `v_product_stats` o ignora via `orders.status <> 'CANCELADO'` |

Cadeia de triggers disparada por um único `insert` em `order_items`:

```
insert order_items
  ├─ BEFORE  trg_order_items_totals        → recalcula gross_total / cost_total
  ├─ AFTER   trg_order_items_sync_parent   → recalcula orders.gross_amount
  │                                            └─ BEFORE trg_orders_totals → total_amount
  └─ AFTER   trg_order_items_sync_stock    → cria stock_movements VENDA   ← este
```

Quem **consome** o resultado: `v_product_stats.stock_balance` (soma de
`signed_quantity`, excluindo movimentos de pedido cancelado), a página
`/produtos`, a `/movimentacoes` e o dashboard.

A movimentação manual (`/movimentacoes` → `createStockMovement`) é independente
do trigger, e `deleteStockMovement` já se protege com
`.is('order_item_id', null)` — movimento gerado por pedido não é apagável pela
tela. Esse cuidado já está certo e não muda.

## Onde está o risco de dupla baixa

**Não** é aritmético em `inventory_balances`. O Bling manda **saldo absoluto**,
não delta: gravar duas vezes o mesmo saldo dá o mesmo saldo. Esse lado é seguro
por construção.

O risco real é outro, e é mais difícil de ver:

### Risco A — a mesma venda contada duas vezes (o grave)

Pedido lançado à mão hoje + o mesmo pedido importado do Bling amanhã = **duas**
linhas em `orders`/`order_items`. Consequência dupla:

- `v_product_stats` gera **dois** movimentos `VENDA` → estoque baixa em dobro;
- `v_sales_fact` conta **receita em dobro** → todo BI fica errado, e errado para
  cima, que é o jeito que ninguém desconfia.

### Risco B — dois números de estoque sem vencedor declarado

Depois da Fase 1 existirão dois saldos para o mesmo produto:

- `v_product_stats.stock_balance` — derivado dos movimentos locais;
- `inventory_balances(source='LOCAL')` — o que o Bling diz.

Eles **vão** divergir. Sem uma regra de quem manda, cada tela escolhe um e o
usuário vê números diferentes para a mesma pergunta.

### Risco C — movimento local virando ruído

Depois que o Bling for dono do estoque, cada `VENDA` criada pelo trigger é um
registro que não corresponde a nenhuma operação nossa.

## Estratégia de transição

Quatro fases. Nenhuma delas começa apagando o trigger.

### Fase 0 — hoje

Trigger ativo e **autoritativo**. `inventory_balances` vazia. Nada a fazer.

### Fase 1 — Bling em leitura

Importa para `erp_snapshots` e `inventory_balances(LOCAL)`. O trigger continua.

Regra que resolve o Risco B, e ela é de leitura, não de escrita:

> **Produto com vínculo em `product_channels(channel='BLING')` → o estoque exibido
> vem de `inventory_balances`. Sem vínculo → vem de `v_product_stats`.**

E a divergência entre os dois **não é escondida, é alerta**: é exatamente a regra
`STOCK_NEGATIVE`/divergência de saldo prevista na seção 27. Divergência é sinal
de sincronização quebrada, e vale mais como alerta do que como número corrigido
em silêncio.

Nesta fase o trigger não causa dupla baixa porque **ainda não importamos
pedidos**.

### Fase 2 — Bling passa a ser dono dos pedidos

É aqui que o Risco A aparece, e ele precisa de duas coisas **antes** do primeiro
import de pedido:

**1. Marcar a origem do pedido.**

```sql
alter table orders
    add column if not exists origin text not null default 'MANUAL'
        check (origin in ('MANUAL', 'BLING')),
    add column if not exists external_id text;

-- Import idempotente: reimportar o mesmo pedido não cria outro.
create unique index if not exists ux_orders_external
    on orders (organization_id, origin, external_id)
    where external_id is not null;
```

**2. Uma guarda no trigger — não um `drop`.**

```sql
create or replace function order_items_sync_stock()
returns trigger language plpgsql
set search_path = public, pg_temp
as $fn$
declare
    v_date   date;
    v_origin text;
begin
    select order_date, origin into v_date, v_origin
      from orders where id = new.order_id;

    -- Pedido vindo do Bling já teve o estoque baixado LÁ. Criar movimento aqui
    -- seria a segunda baixa.
    if v_origin = 'BLING' then
        return new;
    end if;

    -- ... corpo atual, inalterado ...
    return new;
end $fn$;
```

Uma linha de guarda, comportamento antigo intacto para pedido manual. É
reversível e testável: inserir um item em pedido `MANUAL` e outro em pedido
`BLING`, e conferir que só o primeiro gerou movimento.

`v_sales_fact` também precisa decidir: enquanto as duas origens coexistirem, ela
deve ler **uma** delas por período, não a soma. Recomendação: filtrar por
`origin` e adotar a data de corte da migração como fronteira.

### Fase 3 — desativação

Só depois que **todos** os produtos ativos tiverem vínculo `BLING` e a
reconciliação rodar N dias sem divergência. Então:

1. `drop trigger trg_order_items_sync_stock on order_items;`
2. Manter os `stock_movements` históricos — eles são o registro de como o estoque
   se comportou antes do Bling. Apagar seria perder a série.
3. `v_product_stats.stock_balance` passa a ser indicador histórico; o saldo
   corrente vem de `inventory_balances`.

## Critérios de saída

Não avance de fase sem:

- **1 → 2:** todo produto ativo com vínculo em `product_channels`; divergência
  entre `v_product_stats` e `inventory_balances` explicada para cada produto.
- **2 → 3:** reconciliação diária limpa; nenhum pedido `MANUAL` criado por 30
  dias; `ux_orders_external` provando que nenhum pedido foi importado duas vezes.

## Decisões que ficaram abertas

1. **Pedido histórico manual:** os pedidos já lançados à mão ficam como
   `MANUAL` para sempre, ou tentamos casá-los com os do Bling? Recomendo deixar
   `MANUAL` — casamento retroativo por número/valor erra e o erro é silencioso.
2. **Data de corte:** a partir de que dia o Bling é dono da venda. Precisa ser
   uma data, não "quando terminar", senão o período de sobreposição conta duas
   vezes no BI.
