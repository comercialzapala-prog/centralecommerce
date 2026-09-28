import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  ListChecks,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react'

import { MetricCard, type MetricTone } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getErpConnectionStatus,
  getIntegrationQueueHealth,
  getRecentIntegrationEvents,
} from '@/lib/data'
import { formatDateTime, formatNumber, num } from '@/lib/format'
import { isIntegrationCryptoConfigured } from '@/integrations/crypto'
import { getBlingCredentials, getBlingOAuthUrls, getBlingWebhookSecret, hasEndpoint } from '@/integrations/erp/bling/config'
import { loadIntegrationSettings } from '@/integrations/erp/settings'
import { resolveProviderName } from '@/integrations/erp/provider'
import { findCurrentOrganizationId } from '@/integrations/organization'
import { isServiceRoleConfigured } from '@/lib/supabase/admin'

/**
 * OBSERVABILIDADE DA INTEGRACAO (secoes 33 e 41)
 *
 * Tudo aqui sai do NOSSO banco (secao 4): a pagina abre igual com o ERP fora do
 * ar. Nenhuma chamada ao Bling acontece ao renderizar.
 *
 * Na Fase A esta tela tem um segundo papel: dizer exatamente o que falta para
 * conectar. O checklist e calculado no servidor e expoe apenas BOOLEANOS --
 * nunca o valor de credencial nenhuma (secoes 12 e 34).
 */

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  NOT_CONFIGURED: 'Não configurado',
  CONNECTED: 'Conectado',
  TOKEN_EXPIRED: 'Autorização expirada',
  ERROR: 'Com erro',
  DISCONNECTED: 'Desconectado',
}

const STATUS_TONE: Record<string, MetricTone> = {
  NOT_CONFIGURED: 'neutral',
  CONNECTED: 'positive',
  TOKEN_EXPIRED: 'negative',
  ERROR: 'negative',
  DISCONNECTED: 'warning',
}

const MODE_LABEL: Record<string, string> = {
  READ_ONLY: 'Somente leitura',
  APPROVAL_REQUIRED: 'Exige aprovação',
  AUTOMATIC: 'Automático (regras autorizadas)',
}

export default async function BlingIntegrationPage() {
  const organizationId = await findCurrentOrganizationId()

  // A fundacao de integracao ainda nao foi aplicada. Explica o que falta em vez
  // de estourar 500 -- esta tela e justamente onde se vai olhar quando algo da
  // integracao nao esta de pe.
  if (!organizationId) return <FoundationMissing />

  const [connection, queue, events, settings] = await Promise.all([
    getErpConnectionStatus(organizationId),
    getIntegrationQueueHealth(organizationId),
    getRecentIntegrationEvents(organizationId, 15),
    loadIntegrationSettings(organizationId),
  ])

  const status = connection?.status ?? 'NOT_CONFIGURED'
  // `is_degraded` vem calculado da view: comparar datas com o relogio durante a
  // renderizacao seria funcao impura.
  const degraded =
    connection?.health === 'DEGRADED' || connection?.health === 'DOWN' || connection?.is_degraded === true

  const checklist = buildChecklist()
  const pending = checklist.filter((item) => !item.done)

  return (
    <>
      <PageHeader
        title="Integração com o Bling"
        description="Status, fila e eventos. Enquanto a conta do Bling não existir, a Central opera sem ele."
        actions={
          <Badge variant={status === 'CONNECTED' ? 'default' : 'outline'}>
            {STATUS_LABEL[status] ?? status}
          </Badge>
        }
      />

      {degraded ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-medium">Bling temporariamente indisponível.</p>
            <p className="mt-1 text-muted-foreground">
              A integração acumulou {formatNumber(connection?.consecutive_failures ?? 0)} falhas
              consecutivas e as sincronizações não críticas estão suspensas
              {connection?.degraded_until
                ? ` até ${formatDateTime(connection.degraded_until)}`
                : ''}
              . Isso é intencional: insistir durante a indisponibilidade só consome a cota de
              requisições.
            </p>
          </div>
        </div>
      ) : null}

      {connection?.last_error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Último erro registrado</p>
          <p className="mt-1 text-sm text-muted-foreground">{connection.last_error}</p>
        </div>
      ) : null}

      {/* ---------------- Secao 33: os numeros do painel ---------------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Status"
          value={STATUS_LABEL[status] ?? status}
          tone={STATUS_TONE[status] ?? 'neutral'}
          icon={PlugZap}
          hint={
            connection?.external_company_id
              ? `Empresa ${connection.external_company_id}`
              : 'Nenhuma empresa vinculada.'
          }
        />
        <MetricCard
          title="Última sincronização"
          value={formatDateTime(connection?.last_successful_sync)}
          icon={RefreshCw}
          hint={
            connection?.last_reconciliation_at
              ? `Reconciliação: ${formatDateTime(connection.last_reconciliation_at)}`
              : 'Reconciliação ainda não executada.'
          }
        />
        <MetricCard
          title="Último webhook"
          value={formatDateTime(connection?.last_webhook_at)}
          icon={Clock}
          tone={settings.webhooksEnabled ? 'neutral' : 'warning'}
          hint={
            settings.webhooksEnabled
              ? `${formatNumber(num(queue?.events_today))} eventos hoje.`
              : 'Webhooks desligados (seção 5).'
          }
        />
        <MetricCard
          title="Fila"
          value={`${formatNumber(num(queue?.jobs_pending))} pendentes`}
          icon={ListChecks}
          tone={num(queue?.jobs_failed) > 0 ? 'negative' : 'neutral'}
          hint={
            `${formatNumber(num(queue?.jobs_retrying))} em retentativa · ` +
            `${formatNumber(num(queue?.jobs_failed))} falhas`
          }
        />
      </div>

      {/* ---------------- Configuracao corrente ---------------- */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Configuração atual</h2>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Provider ativo" value={resolveProviderName()} />
          <Field label="Modo de automação" value={MODE_LABEL[settings.automationMode] ?? settings.automationMode} />
          <Field label="Webhooks" value={settings.webhooksEnabled ? 'Habilitados' : 'Desligados'} />
          <Field
            label="Escopos concedidos"
            value={connection?.scopes?.length ? connection.scopes.join(', ') : 'Nenhum'}
          />
          <Field
            label="Token de acesso"
            value={
              connection?.has_access_token
                ? connection.access_token_expires_at
                  ? `Guardado · expira ${formatDateTime(connection.access_token_expires_at)}`
                  : 'Guardado'
                : 'Nenhum'
            }
          />
          <Field
            label="Limite de requisições"
            value={
              `${formatNumber(settings.apiRequestsPerSecond)}/s · ` +
              (settings.apiDailyRequestLimit === null
                ? 'diário não informado'
                : `${formatNumber(settings.apiDailyRequestLimit)}/dia`)
            }
          />
        </dl>
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
          A contagem de requisições por dia passa a ser registrada quando a sincronização estiver
          ativa — hoje nenhuma requisição é enviada ao Bling.
        </p>
      </section>

      {/* ---------------- Secao 39: o que falta para conectar ---------------- */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Pré-requisitos para conectar</h2>
            <p className="text-xs text-muted-foreground">
              {pending.length === 0
                ? 'Tudo pronto: a Fase B pode ser habilitada.'
                : `${pending.length} item(ns) pendente(s). Nenhum valor de credencial é exibido aqui.`}
            </p>
          </div>
          <Badge variant={pending.length === 0 ? 'default' : 'outline'}>
            {checklist.length - pending.length}/{checklist.length}
          </Badge>
        </div>

        <ul className="space-y-2">
          {checklist.map((item) => (
            <li key={item.label} className="flex items-start gap-2 text-sm">
              {item.done ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Circle size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
              )}
              <div>
                <span className={item.done ? '' : 'font-medium'}>{item.label}</span>
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-start gap-3 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" />
          <p>
            Os tokens ficam cifrados e a tabela <code>erp_connections</code> não é acessível pelo
            navegador — esta tela lê a view <code>v_erp_connection_status</code>, que não projeta
            nenhuma coluna de token.
          </p>
        </div>
      </section>

      {/* ---------------- Eventos ---------------- */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Últimos eventos recebidos</h2>

        {events.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Nenhum evento recebido. O endpoint <code>/api/webhooks/bling</code> existe e responde
            503 enquanto os webhooks estiverem desligados.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recebido</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tentativas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(event.received_at)}
                    </TableCell>
                    <TableCell>{event.event_type}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {event.external_event_id}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        {event.status === 'FAILED' ? (
                          <XCircle size={14} className="text-rose-600 dark:text-rose-400" />
                        ) : event.status === 'PROCESSED' ? (
                          <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Circle size={14} className="text-muted-foreground" />
                        )}
                        {event.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{event.attempts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        <Link href="/configuracoes" className="underline underline-offset-4">
          Voltar para Configurações
        </Link>
      </p>
    </>
  )
}

/** Estado da tela antes de a migration da fundacao ser aplicada. */
function FoundationMissing() {
  return (
    <>
      <PageHeader
        title="Integração com o Bling"
        description="A fundação de integração ainda não foi aplicada ao banco."
        actions={<Badge variant="outline">Indisponível</Badge>}
      />

      <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="text-sm">
          <p className="font-medium">Tabelas de integração ausentes.</p>
          <p className="mt-1 text-muted-foreground">
            Aplique{' '}
            <code>supabase/migrations/20260928120000_integration_foundation.sql</code> e recarregue.
            Nenhuma outra tela depende dessas tabelas — o resto do sistema continua funcionando
            normalmente.
          </p>
          <p className="mt-2 text-muted-foreground">
            Para conferir o estado atual do banco:{' '}
            <code>node scripts/db-inspect.mjs</code>
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        <Link href="/configuracoes" className="underline underline-offset-4">
          Voltar para Configurações
        </Link>
      </p>
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  )
}

type ChecklistItem = { label: string; hint: string; done: boolean }

/**
 * Checklist da Fase B.
 *
 * Retorna somente booleanos. Nenhuma funcao chamada aqui devolve o valor da
 * credencial -- `getBlingCredentials()` e usada apenas para saber se existe.
 */
function buildChecklist(): ChecklistItem[] {
  return [
    {
      label: 'Credenciais do aplicativo Bling',
      hint: 'BLING_CLIENT_ID, BLING_CLIENT_SECRET e BLING_API_BASE_URL no servidor (nunca NEXT_PUBLIC_).',
      done: getBlingCredentials() !== null,
    },
    {
      label: 'URLs de OAuth',
      hint: 'BLING_OAUTH_AUTHORIZE_URL, BLING_OAUTH_TOKEN_URL e BLING_REDIRECT_URI.',
      done: getBlingOAuthUrls() !== null,
    },
    {
      label: 'Caminhos de endpoint preenchidos',
      hint: 'Mapa ENDPOINTS em src/integrations/erp/bling/config.ts, a partir da documentação oficial.',
      done: hasEndpoint('products.list'),
    },
    {
      label: 'Segredo do webhook',
      hint: 'BLING_WEBHOOK_SECRET, usado no HMAC SHA-256 de X-Bling-Signature-256.',
      done: getBlingWebhookSecret() !== null,
    },
    {
      label: 'Chave de criptografia',
      hint: 'INTEGRATION_ENCRYPTION_KEY com 32 bytes em base64, só no servidor.',
      done: isIntegrationCryptoConfigured(),
    },
    {
      label: 'Service role do Supabase',
      hint: 'SUPABASE_SERVICE_ROLE_KEY: as tabelas de integração só aceitam escrita por ela.',
      done: isServiceRoleConfigured(),
    },
  ]
}
