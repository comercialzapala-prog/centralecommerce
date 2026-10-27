import Link from 'next/link'
import {
  CheckCircle2,
  Circle,
  Clock,
  ListChecks,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react'

import { BoxGrid } from '@/components/BoxGrid'
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
import { requireMembership } from '@/lib/auth'
import { isServiceRoleConfigured } from '@/lib/supabase/admin'

/**
 * OBSERVABILIDADE DA INTEGRACAO (secoes 33 e 41)
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
  const { membership } = await requireMembership()
  const organizationId = membership.organizationId

  const [connection, queue, events, settings] = await Promise.all([
    getErpConnectionStatus(organizationId),
    getIntegrationQueueHealth(organizationId),
    getRecentIntegrationEvents(organizationId, 15),
    loadIntegrationSettings(organizationId),
  ])

  const status = connection?.status ?? 'NOT_CONFIGURED'
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
        <BoxGrid
          columns={2}
          items={[
            {
              label: 'Disponibilidade do ERP',
              value: 'Bling temporariamente indisponível',
              hint: `${formatNumber(connection?.consecutive_failures ?? 0)} falha(s) consecutiva(s)`,
              tone: 'warning',
            },
            {
              label: 'Proteção de cota ativa',
              value: connection?.degraded_until
                ? `Sincronizações suspensas até ${formatDateTime(connection.degraded_until)}`
                : 'Sincronizações não críticas suspensas temporariamente',
              hint: 'Insistir durante a indisponibilidade apenas consome a cota diária de requisições.',
              tone: 'accent',
            },
          ]}
        />
      ) : null}

      {connection?.last_error ? (
        <BoxGrid
          columns={1}
          items={[
            {
              label: 'Último erro registrado na integração',
              value: connection.last_error,
              tone: 'negative',
            },
          ]}
        />
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
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Configuração atual</h2>
        <BoxGrid
          columns={3}
          items={[
            {
              label: 'Provider ativo',
              value: resolveProviderName(),
              tone: 'accent',
            },
            {
              label: 'Modo de automação',
              value: MODE_LABEL[settings.automationMode] ?? settings.automationMode,
            },
            {
              label: 'Webhooks',
              value: settings.webhooksEnabled ? 'Habilitados' : 'Desligados',
              tone: settings.webhooksEnabled ? 'positive' : 'warning',
            },
            {
              label: 'Escopos concedidos',
              value: connection?.scopes?.length ? connection.scopes.join(', ') : 'Nenhum',
            },
            {
              label: 'Token de acesso',
              value: connection?.has_access_token
                ? connection.access_token_expires_at
                  ? `Guardado · expira ${formatDateTime(connection.access_token_expires_at)}`
                  : 'Guardado'
                : 'Nenhum',
              tone: connection?.has_access_token ? 'positive' : 'neutral',
            },
            {
              label: 'Limite de requisições',
              value:
                `${formatNumber(settings.apiRequestsPerSecond)}/s · ` +
                (settings.apiDailyRequestLimit === null
                  ? 'diário não informado'
                  : `${formatNumber(settings.apiDailyRequestLimit)}/dia`),
            },
          ]}
        />
        <p className="border-t pt-3 text-xs text-muted-foreground">
          A contagem de requisições por dia passa a ser registrada quando a sincronização estiver
          ativa — hoje nenhuma requisição é enviada ao Bling.
        </p>
      </section>

      {/* ---------------- Secao 39: o que falta para conectar ---------------- */}
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
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

        <BoxGrid
          columns={2}
          items={checklist.map((item) => ({
            label: item.done ? 'Configurado' : 'Pendente',
            value: item.label,
            hint: item.hint,
            tone: item.done ? ('positive' as const) : ('warning' as const),
          }))}
        />

        <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
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

type ChecklistItem = { label: string; hint: string; done: boolean }

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
