import Link from 'next/link'
import { Calculator, Package, ShoppingBag, Truck } from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { RouteTabs } from '@/components/RouteTabs'
import { buttonVariants } from '@/components/ui/button'
import { getProductStats } from '@/lib/data'

import { loadLogisticsConfig } from './actions'
import { LogisticsCalculator } from './LogisticsCalculator'

export const dynamic = 'force-dynamic'

export default async function LogisticaPage() {
  const [products, fleetConfig] = await Promise.all([
    getProductStats(),
    loadLogisticsConfig(),
  ])

  const saleProducts = products.filter((p) => p.item_kind !== 'INSUMO')
  const packagingProducts = products.filter((p) => p.item_kind === 'INSUMO')

  return (
    <>
      <PageHeader
        title="Logística &amp; Transporte"
        description="Controle e rateio mensal de custos do caminhão (combustível, viagens e frete diluído por caixa)."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/produtos"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Package className="size-3.5 text-sky-600" />
              Catálogo de Produtos
            </Link>
            <Link
              href="/precificacao"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Calculator className="size-3.5 text-amber-600" />
              Planilha ML
            </Link>
          </div>
        }
      />

      <RouteTabs
        items={[
          { href: '/produtos', label: 'Catálogo de Produtos', badge: saleProducts.length },
          {
            href: '/precificacao',
            label: 'Planilha de Precificação (ML)',
            badge: saleProducts.length,
          },
          { href: '/sacolas', label: 'Sacolas & Embalagens', badge: packagingProducts.length },
          { href: '/logistica', label: 'Logística & Frota' },
        ]}
      />

      <LogisticsCalculator initialConfig={fleetConfig} />
    </>
  )
}
