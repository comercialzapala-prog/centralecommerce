import { Eye, EyeOff } from 'lucide-react'

import { BoxGrid } from '@/components/BoxGrid'
import { ConfirmActionButton } from '@/components/FormDialog'
import { PageHeader } from '@/components/PageHeader'
import { getChannels, getPaymentMethods, getSettings } from '@/lib/data'
import { cn } from '@/lib/utils'

import {
  createChannel,
  createPaymentMethod,
  setChannelActive,
  setPaymentMethodActive,
} from './actions'
import { SettingsForm } from './SettingsForm'
import { SimpleListForm } from './SimpleListForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [settings, channels, paymentMethods] = await Promise.all([
    getSettings(),
    getChannels(),
    getPaymentMethods(),
  ])

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Parâmetros da operação e cadastros de apoio."
      />

      <SettingsForm settings={settings} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListCard
          title="Canais"
          description="Onde a venda ou a operação aconteceu."
          items={channels}
          toggleAction={setChannelActive}
          form={
            <SimpleListForm
              action={createChannel}
              title="Novo canal"
              description="Site, Mercado Livre, Shopee, Amazon, WhatsApp..."
              triggerLabel="Novo canal"
              placeholder="Ex.: Shopee"
            />
          }
        />

        <ListCard
          title="Formas de pagamento"
          description="Usadas nos lançamentos financeiros."
          items={paymentMethods}
          toggleAction={setPaymentMethodActive}
          form={
            <SimpleListForm
              action={createPaymentMethod}
              title="Nova forma de pagamento"
              triggerLabel="Nova forma"
              placeholder="Ex.: Cartão corporativo"
            />
          }
        />
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">
          Como o sistema separa os conceitos
        </h2>
        <BoxGrid
          columns={2}
          items={[
            {
              label: 'Categoria',
              value: 'O que é esse gasto',
              hint: 'Ex.: Frete, Embalagem, Energia, Imposto',
              tone: 'accent',
            },
            {
              label: 'Centro de custo',
              value: 'Qual área consumiu o recurso',
              hint: 'Ex.: Operação Logística > Expedição > Sacolas',
              tone: 'accent',
            },
            {
              label: 'Fornecedor',
              value: 'Para quem o dinheiro foi pago',
              hint: 'Ex.: Jadlog, Meta, Correios, Petrus',
            },
            {
              label: 'Canal',
              value: 'Onde a venda aconteceu',
              hint: 'Ex.: Site, Shopee, Mercado Livre, Amazon',
            },
            {
              label: 'Aporte vs. Investimento (Indicador 0/50)',
              value: 'Aporte entra no caixa; Investimento forma o total a recuperar',
              hint: 'No indicador 0/50, 50 é sempre a escala visual do progresso de break-even, nunca um valor em reais.',
              tone: 'positive',
              span: 2,
            },
          ]}
        />
      </section>
    </>
  )
}

function ListCard({
  title,
  description,
  items,
  toggleAction,
  form,
}: {
  title: string
  description: string
  items: { id: string; name: string; active: boolean }[]
  toggleAction: (formData: FormData) => Promise<void>
  form: React.ReactNode
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {form}
      </div>

      {items.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">Nada cadastrado ainda.</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                'flex items-center justify-between gap-2 py-1.5 text-sm',
                !item.active && 'opacity-55',
              )}
            >
              <span>
                {item.name}
                {!item.active ? (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    inativo
                  </span>
                ) : null}
              </span>
              <ConfirmActionButton
                action={toggleAction}
                fields={{ id: item.id, active: item.active ? 'false' : 'true' }}
                label=""
                size="icon-sm"
                icon={item.active ? <EyeOff /> : <Eye />}
                title={item.active ? `Desativar "${item.name}"?` : `Reativar "${item.name}"?`}
                confirmMessage={
                  item.active
                    ? `Desativar "${item.name}"? O histórico é preservado.`
                    : `Reativar "${item.name}"?`
                }
                details={[
                  {
                    label: title,
                    value: item.name,
                    tone: 'accent',
                  },
                  {
                    label: 'Status após confirmação',
                    value: item.active ? 'Inativo' : 'Ativo',
                    tone: item.active ? 'warning' : 'positive',
                  },
                  {
                    label: 'Histórico operacional',
                    value: 'Vendas e lançamentos antigos preservados',
                    hint: 'Apenas novos cadastros deixam de exibir este item quando inativo.',
                    tone: 'positive',
                    span: 2,
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
