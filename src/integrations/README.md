# Camada de integração ERP

Estado atual: **Fase A — nenhuma conexão com o Bling.** Nada aqui envia
requisição para fora. Sem as variáveis de ambiente e sem os caminhos de endpoint
preenchidos, tudo responde `NOT_CONFIGURED` ou `NOT_IMPLEMENTED`.

## Regra de ouro

```
Bling → ERPProvider → IntegrationService → Supabase → telas
```

A interface **nunca** chama o ERP. Ela lê as tabelas que o `IntegrationService`
alimenta. Por isso a tela de status abre igual com o Bling fora do ar.

Nenhuma `page`, `component`, `hook` ou server action importa de
`integrations/erp/bling/*`. Quem precisa de dado do ERP usa `getErpProvider()`.

## Mapa

| Caminho | Papel |
|---|---|
| `erp/types.ts` | Tipos neutros. Não conhecem o Bling. |
| `erp/provider.ts` | Interface `ERPProvider` + `getErpProvider()`. |
| `erp/service.ts` | **Toda escrita** no nosso banco passa aqui. |
| `erp/settings.ts` | Limiares vindos de `integration_settings`. Nada hardcode. |
| `erp/errors.ts` | Taxonomia de erro; decide o que é recuperável. |
| `erp/rate-limit.ts` | Token bucket, backoff, circuit breaker. |
| `erp/mock/` | Dados falsos, isolados. Só o `MockErpProvider` importa. |
| `erp/bling/config.ts` | **Único arquivo a editar na Fase B.** |
| `erp/bling/client.ts` | O único lugar com `fetch`. |
| `erp/bling/mapper.ts` | Payload do Bling → tipos neutros. |
| `crypto.ts` | AES-256-GCM dos tokens. |
| `organization.ts` | Organização corrente (single-tenant hoje). |

A inteligência (`src/domain/intelligence`) e o auditor (`src/domain/auditor`) não
importam nada desta pasta — a dependência corre no sentido contrário.

## Checklist da Fase B

A tela `/configuracoes/integracoes/bling` mostra este checklist calculado ao
vivo. Em ordem:

1. `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`, `BLING_API_BASE_URL`
2. `BLING_OAUTH_AUTHORIZE_URL`, `BLING_OAUTH_TOKEN_URL`, `BLING_REDIRECT_URI`
3. Preencher o mapa `ENDPOINTS` em `erp/bling/config.ts` com os caminhos da
   documentação oficial (todos estão `null` — nenhum endpoint foi inventado).
4. Conferir os nomes de campo em `FIELDS` de `erp/bling/mapper.ts` contra um
   payload real. O mapper **falha alto** quando o campo obrigatório não aparece:
   isso é intencional, para que suposição errada apareça na hora em vez de virar
   "produto sem custo" no auditor.
5. Implementar `exchangeAuthorizationCode` e `refreshAccessToken` em
   `erp/bling/auth.ts`. A gravação cifrada (`saveTokenSet`) já funciona.
6. `BLING_WEBHOOK_SECRET` + confirmar o formato de `X-Bling-Signature-256`.
7. `INTEGRATION_ENCRYPTION_KEY` (32 bytes base64) e `SUPABASE_SERVICE_ROLE_KEY`.
8. Ligar `integration_settings.webhooks_enabled` — só depois de 6.

## Coisas que parecem bug e não são

- **Endpoints `null`.** Não temos a conta; uma URL chutada pareceria funcionar.
- **OAuth lança `NOT_IMPLEMENTED`.** O método de autenticação do cliente e os
  nomes dos campos precisam sair da documentação, não de palpite.
- **O mock não aplica escritas.** Um mock que "aplica" dá a falsa sensação de
  que a escrita está pronta. Ele valida a proposta e a guarda contra preço
  desatualizado — que é o que precisa de teste.
- **`source` do estoque é sempre `LOCAL` no mapper do Bling.** Estoque Full só
  pode vir da integração com o Mercado Livre.
- **Rate limit é por instância.** Ver a nota em `erp/rate-limit.ts`.
