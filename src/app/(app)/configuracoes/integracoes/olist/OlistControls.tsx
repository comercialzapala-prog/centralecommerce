'use client'

import {
  CheckCircle2,
  Copy,
  KeyRound,
  PackageSearch,
  PlugZap,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OlistPublicConfig } from '@/integrations/erp/olist/client'

import {
  saveOlistConfigurationAction,
  syncOlistOrdersNowAction,
  syncOlistProductsNowAction,
  testOlistConnectionAction,
} from './actions'

export function OlistControls({
  config,
  webhookUrl,
}: {
  config: OlistPublicConfig
  webhookUrl: string
}) {
  const router = useRouter()
  const [apiToken, setApiToken] = useState('')
  const [autoSyncOrders, setAutoSyncOrders] = useState(config.autoSyncOrders)
  const [createMissingProducts, setCreateMissingProducts] = useState(config.createMissingProducts)
  const [days, setDays] = useState(7)
  const [syncStock, setSyncStock] = useState(true)
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      const res = await saveOlistConfigurationAction({
        apiToken: apiToken.trim() || undefined,
        autoSyncOrders,
        createMissingProducts,
      })
      if (!res.ok) {
        setFeedback({ tone: 'err', text: res.error })
        return
      }
      setApiToken('')
      setFeedback({
        tone: 'ok',
        text: res.data?.accountName
          ? `Conectado com sucesso à conta: ${res.data.accountName}`
          : 'Configurações do Olist ERP salvas com sucesso.',
      })
      router.refresh()
    })
  }

  function handleTestConnection() {
    setFeedback(null)
    startTransition(async () => {
      const res = await testOlistConnectionAction()
      if (!res.ok) {
        setFeedback({ tone: 'err', text: res.error })
        return
      }
      setFeedback({
        tone: 'ok',
        text: `Conexão ativa com Olist ERP: ${res.data?.accountName ?? 'OK'}${res.data?.accountCnpj ? ` (CNPJ: ${res.data.accountCnpj})` : ''}`,
      })
      router.refresh()
    })
  }

  function handleSyncOrders() {
    setFeedback(null)
    startTransition(async () => {
      const res = await syncOlistOrdersNowAction(days)
      if (!res.ok) {
        setFeedback({ tone: 'err', text: res.error })
        return
      }
      setFeedback({ tone: 'ok', text: res.data?.message ?? 'Pedidos sincronizados.' })
      router.refresh()
    })
  }

  function handleSyncProducts() {
    setFeedback(null)
    startTransition(async () => {
      const res = await syncOlistProductsNowAction(syncStock)
      if (!res.ok) {
        setFeedback({ tone: 'err', text: res.error })
        return
      }
      setFeedback({ tone: 'ok', text: res.data?.message ?? 'Catálogo sincronizado.' })
      router.refresh()
    })
  }

  async function handleCopyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Coluna 1: Credenciais e Webhook */}
      <form
        onSubmit={handleSaveConfig}
        className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-5"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="size-4 text-primary" />
                Credencial da API Olist ERP (Tiny)
              </h2>
              <p className="text-xs text-muted-foreground">
                No painel do Olist ERP / Tiny, acesse{' '}
                <span className="font-medium text-foreground">
                  Configurações → Geral → Token API
                </span>{' '}
                e cole o token abaixo.
              </p>
            </div>
            {config.configured && (
              <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                Token ativo ({config.tokenSource === 'ENV' ? 'Variável ENV' : 'Criptografado'})
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="olist-token">
              {config.configured
                ? `Substituir Token atual (${config.maskedToken ?? 'configurado'})`
                : 'Token da API Olist ERP'}
            </Label>
            <Input
              id="olist-token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={
                config.configured
                  ? 'Deixe em branco para manter o token atual...'
                  : 'Cole aqui o token de 32/64 caracteres da API do Olist...'
              }
            />
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-xs">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={autoSyncOrders}
                onChange={(e) => setAutoSyncOrders(e.target.checked)}
                className="size-4 rounded border"
              />
              <span>
                Sincronizar pedidos automaticamente em tempo real via Webhook (com baixa de estoque
                e sacolas)
              </span>
            </label>

            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={createMissingProducts}
                onChange={(e) => setCreateMissingProducts(e.target.checked)}
                className="size-4 rounded border"
              />
              <span>
                Cadastrar automaticamente o SKU na Central caso um pedido contenha produto ainda não
                cadastrado
              </span>
            </label>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              URL de Webhook para colar no Olist ERP (Configurações → Integrações → Webhooks)
            </Label>
            <div className="flex items-center gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopyWebhook}
                className="shrink-0"
              >
                {copied ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || !config.configured}
            onClick={handleTestConnection}
          >
            <PlugZap className="size-3.5" />
            Testar conexão
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            Salvar configuração Olist
          </Button>
        </div>
      </form>

      {/* Coluna 2: Ações de Sincronização Imediata */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border bg-card p-5">
        <div className="space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <RefreshCw className="size-4 text-primary" />
              Sincronização Manual e Automação de Sacolas
            </h2>
            <p className="text-xs text-muted-foreground">
              Ao puxar os pedidos de venda do Olist ERP, a Central registra o pedido, calcula o CMV
              e os custos do produto e desconta automaticamente o estoque do produto e da{' '}
              <span className="font-medium text-foreground">sacola vinculada</span>.
            </p>
          </div>

          {/* Card de Sincronizar Pedidos */}
          <div className="space-y-3 rounded-lg border bg-emerald-500/5 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <ShoppingBag className="size-3.5 text-emerald-600" />
                  1. Puxar Pedidos de Venda do Olist
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Importa vendas, atualiza cancelamentos e baixa estoque + sacolas P/M/G.
                </p>
              </div>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <option value={3}>Últimos 3 dias</option>
                <option value={7}>Últimos 7 dias</option>
                <option value={15}>Últimos 15 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={60}>Últimos 60 dias</option>
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={pending || !config.configured}
              onClick={handleSyncOrders}
            >
              <RefreshCw className={pending ? 'size-3.5 animate-spin' : 'size-3.5'} />
              Sincronizar Pedidos Agora (com baixa de estoque e sacola)
            </Button>
          </div>

          {/* Card de Sincronizar Produtos */}
          <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <PackageSearch className="size-3.5 text-primary" />
                  2. Puxar Catálogo de Produtos e Saldos do Olist
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Importa SKUs, preços, custos, EAN, NCM e pesos sem alterar suas sacolas internas.
                </p>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={syncStock}
                onChange={(e) => setSyncStock(e.target.checked)}
                className="size-3.5 rounded border"
              />
              <span>Importar também o saldo de estoque inicial para produtos novos/zerados</span>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={pending || !config.configured}
              onClick={handleSyncProducts}
            >
              <PackageSearch className="size-3.5" />
              Sincronizar Produtos do Olist
            </Button>
          </div>
        </div>

        {feedback && (
          <div
            className={
              feedback.tone === 'ok'
                ? 'rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200'
                : 'rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive'
            }
          >
            {feedback.text}
          </div>
        )}
      </div>
    </div>
  )
}
