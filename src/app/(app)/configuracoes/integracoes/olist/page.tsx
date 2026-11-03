import {
  Activity,
  CheckCircle2,
  Clock,
  PlugZap,
  ShoppingBag,
  Webhook,
} from 'lucide-react'
import { headers } from 'next/headers'
import Link from 'next/link'

import { MetricCard } from '@/components/MetricCard'
import { PageHeader } from '@/components/PageHeader'
import { RouteTabs } from '@/components/RouteTabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getOlistPublicConfig } from '@/integrations/erp/olist/client'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { createAdminClient } from '@/lib/supabase/admin'

import { OlistControls } from './OlistControls'

export const dynamic = 'force-dynamic'

const INTEGRATION_TABS = [
  { href: '/configuracoes/integracoes/olist', label: 'Olist ERP (Tiny)' },
  { href: '/configuracoes/integracoes/bling', label: 'Bling ERP' },
]

export default async function OlistIntegrationPage() {
  const config = await getOlistPublicConfig()
  const admin = createAdminClient()

  const hdrs = await headers()
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host') || 'localhost:3000'
  const proto = hdrs.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
  const webhookUrl = `${proto}://${host}/api/webhooks/olist${
    config.webhookSecret ? `?secret=${config.webhookSecret}` : ''
  }`

  const [olistOrdersRes, olistEventsRes] = await Promise.all([
    admin
      .from('v_order_result')
      .select('id, order_number, order_date, channel_name, customer_name, total_amount, packaging_cost, status')
      .ilike('order_number', 'OLIST-%')
      .order('order_date', { ascending: false })
      .limit(15),
    admin
      .from('integration_events')
      .select('id, event_type, resource_id, status, received_at')
      .eq('provider', 'OLIST')
      .order('received_at', { ascending: false })
      .limit(10),
  ])

  const recentOrders = olistOrdersRes.data ?? []
  const recentEvents = olistEventsRes.data ?? []

  return (
    <>
      <PageHeader
        title="Integração Olist ERP (Tiny)"
        description="Sincronize pedidos de venda, catálogo de produtos e dê baixa automática de estoque e sacolas vinculadas."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/sacolas"
              className="inline-flex h-8 items-center rounded-lg border bg-card px-3 text-xs font-medium hover:bg-muted"
            >
              Ver Sacolas Vinculadas
            </Link>
            <Link
              href="/vendas"
              className="inline-flex h-8 items-center rounded-lg border bg-card px-3 text-xs font-medium hover:bg-muted"
            >
              Ver Pedidos de Venda
            </Link>
          </div>
        }
      />

      <RouteTabs items={INTEGRATION_TABS} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Status Olist ERP"
          value={config.configured ? 'Conectado' : 'Aguardando Token'}
          hint={
            config.accountName
              ? `${config.accountName}${config.accountCnpj ? ` • ${config.accountCnpj}` : ''}`
              : 'Informe o Token API nas configurações abaixo'
          }
          tone={config.configured ? 'positive' : 'warning'}
          icon={config.configured ? CheckCircle2 : PlugZap}
        />

        <MetricCard
          title="Pedidos Sincronizados"
          value={formatNumber(recentOrders.length)}
          hint="Pedidos OLIST-* importados recentemente"
          tone="neutral"
          icon={ShoppingBag}
        />

        <MetricCard
          title="Automação Webhook"
          value={config.autoSyncOrders ? 'Ativa' : 'Manual'}
          hint={`${recentEvents.length} notificações recebidas em tempo real`}
          tone={config.autoSyncOrders ? 'positive' : 'neutral'}
          icon={Webhook}
        />

        <MetricCard
          title="Última Sincronização"
          value={
            config.lastOrderSyncAt
              ? new Date(config.lastOrderSyncAt).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Ainda não executada'
          }
          hint={config.lastSyncSummary?.message ?? 'Clique em Sincronizar Pedidos Agora'}
          tone="neutral"
          icon={Clock}
        />
      </div>

      <OlistControls config={config} webhookUrl={webhookUrl} />

      {/* Últimos Pedidos Sincronizados do Olist */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="size-4 text-primary" />
              Últimos Pedidos Importados do Olist ERP
            </h2>
            <p className="text-xs text-muted-foreground">
              Cada pedido importado calcula automaticamente o CMV, frete, comissões e desconta o
              estoque do produto e da sacola vinculada.
            </p>
          </div>
          <Link href="/vendas" className="text-xs font-medium text-primary hover:underline">
            Ver todos em Vendas →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Nenhum pedido sincronizado do Olist ainda. Configure o Token acima e clique em{' '}
            <span className="font-medium text-foreground">
              Sincronizar Pedidos Agora (com baixa de estoque e sacola)
            </span>
            .
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Canal / Marketplace</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Custo Sacola</TableHead>
                  <TableHead className="text-right">Total Pedido</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="whitespace-nowrap tabular-nums text-xs">
                      {formatDate(order.order_date)}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/vendas/${order.id}`} className="hover:underline">
                        {order.order_number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {order.channel_name ?? 'Olist ERP'}
                    </TableCell>
                    <TableCell className="text-xs">{order.customer_name ?? '--'}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {formatCurrency(Number(order.packaging_cost ?? 0))}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums text-xs">
                      {formatCurrency(Number(order.total_amount ?? 0))}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium">
                        {order.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  )
}
