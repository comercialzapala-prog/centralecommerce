# Source of Truth por domínio

Princípio, e ele decide todo empate abaixo:

> **Bling = ERP operacional oficial.**
> **Central E-commerce = BI, inteligência, auditoria, precificação, alertas e apoio à decisão.**

A Central lê e interpreta. Ela não executa operação, e não guarda uma segunda
cópia editável do que o Bling executa.

Teste prático para qualquer dúvida futura: *se os dois discordarem, qual dos dois
está errado por definição?* Esse é o que **não** é fonte da verdade.

## Tabela de decisão

| Domínio | Fonte da verdade | A Central... | Onde mora na Central |
|---|---|---|---|
| **Pedidos** | **Bling** | lê para BI. Não cria, não fatura, não muda status. | `erp_snapshots(ORDER)` → `v_sales_fact` |
| **Estoque (local)** | **Bling** | lê saldo físico/virtual/reservado por depósito. Não movimenta. | `inventory_balances(source='LOCAL')` |
| **Estoque Full** | **Mercado Livre** | lê. Nunca deriva do Bling. | `inventory_balances(source='FULL_MERCADO_LIVRE')` |
| **Produtos (cadastro)** | **Bling** | lê e **audita** (SKU, NCM, peso, dimensão). Não cadastra. | `erp_snapshots(PRODUCT)` + `products` como espelho |
| **Preços** | **Bling** | **recomenda** e propõe alteração com aprovação. Só escreve na Fase C. | `integration_actions`, `recommendations` |
| **Custos** | **Bling** | lê. Usa para margem e preço mínimo. Não define custo. | `erp_snapshots(PRODUCT/PRODUCT_SUPPLIER)` |
| **Fornecedores (de mercadoria)** | **Bling** | lê, e o que importa é o `leadTimeDays`. | `erp_snapshots(SUPPLIER, PRODUCT_SUPPLIER)` |
| **Fornecedores (para quem se paga)** | **Central** | é dona. Conceito financeiro, não existe no ERP assim. | `suppliers` + `v_supplier_stats` |
| **Vendas (fato analítico)** | **Central** | é dona do *dataset derivado*. O fato bruto é do canal. | `v_sales_fact` |
| **Financeiro de gestão** | **Central** | é dona. Aporte, centro de custo, break-even 0/50. | `transactions`, `investments`, `cost_centers` |
| **Financeiro fiscal (NF-e, contas a pagar)** | **Bling** | não recria. Nem lê, por enquanto. | — |
| **Canais** | **Central** (nomes) / **canal** (ids) | é dona da lista; o id externo vem do canal. | `channels`, `product_channels` |
| **Alertas e recomendações** | **Central** | é dona. Não existem no Bling. | `alerts`, `recommendations` |

## Os três casos que geram confusão

### 1. `suppliers` tem dois significados

A `suppliers` de hoje é **financeira**: `v_supplier_stats` soma `transactions`
para responder "quanto pagamos à Jadlog". O fornecedor do Bling é **de
mercadoria**: "de quem compramos o organizador 30L".

São conceitos diferentes com o mesmo nome. A sincronização **não** deve
sobrescrever `suppliers`. O fornecedor do Bling entra em `erp_snapshots`, e
ligar um ao outro é decisão do usuário — não casamento automático por nome.

### 2. `products` continua existindo, mas vira espelho

A Central precisa de um `products.id` (UUID) para pendurar `alerts`,
`recommendations`, `inventory_balances` e `product_channels`. Isso não faz dela
dona do cadastro.

Regra: quem tem linha em `product_channels(channel='BLING')` tem o cadastro
governado pelo Bling. `products` guarda o mínimo para referência e a Central
nunca escreve `sale_price`/`unit_cost` desses produtos por conta própria.

Produto **sem** vínculo continua 100% local — é o caso de hoje.

### 3. Estoque tem três números, não um

| | Significado | Pode vender? |
|---|---|---|
| `physical_quantity` | o que está no depósito | não necessariamente |
| `virtual_quantity` | disponível de verdade | **sim, é este** |
| `reserved_quantity` | comprometido com pedido não expedido | não |

`LOCAL` e `FULL_MERCADO_LIVRE` **nunca somam** num número operacional. O total
somado existe (`totalEconomicStock`) e é honesto como resposta a "quantas
unidades eu tenho no mundo" — nunca como base de reposição, porque não se
despacha do Full o que se vende no site.

## O que a Central nunca vai fazer

Emissão fiscal · contas a pagar/receber · NF-e · pedido de compra operacional ·
cadastro operacional de produto · movimentação de estoque operacional ·
separação e expedição.

Se o Bling faz, a Central **lê e interpreta**. O exemplo da seção 38 é o padrão:

> Bling: "Estoque = 18"
> Central: "18 unidades são 3,8 dias de estoque, e seu fornecedor leva 6."

## Ligado a isto

- `docs/estoque-dupla-baixa.md` — o conflito concreto entre o estoque local de
  hoje e o do Bling, e a transição sem dupla baixa.
- `src/integrations/README.md` — como a camada de integração está montada.
