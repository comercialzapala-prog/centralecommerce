import { Eye, EyeOff } from 'lucide-react'

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

      <section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Como o sistema separa os conceitos
        </h2>
        <ul className="space-y-1.5">
          <li>
            <strong className="text-foreground">Categoria</strong> — o que é esse gasto (Frete,
            Embalagem, Energia).
          </li>
          <li>
            <strong className="text-foreground">Centro de custo</strong> — qual área consumiu o
            recurso (Operação Logística &gt; Expedição &gt; Sacolas).
          </li>
          <li>
            <strong className="text-foreground">Fornecedor</strong> — para quem o dinheiro foi
            pago (Jadlog, Meta, Correios).
          </li>
          <li>
            <strong className="text-foreground">Canal</strong> — onde a venda aconteceu (Site,
            Shopee, Mercado Livre).
          </li>
        </ul>
        <p className="mt-3 border-t pt-3">
          Aporte entra no caixa mas não é receita nem resultado. Investimento não é despesa do
          mês: ele forma o total a recuperar no indicador 0/50, onde 50 é a escala do progresso,
          nunca um valor em reais.
        </p>
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
                confirmMessage={
                  item.active
                    ? `Desativar "${item.name}"? O histórico é preservado.`
                    : `Reativar "${item.name}"?`
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
