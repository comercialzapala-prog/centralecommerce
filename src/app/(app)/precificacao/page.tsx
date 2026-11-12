import { OlistPullButton } from '@/app/(app)/produtos/OlistPullButton'
import { BubbleWrapLinkDialog } from '@/app/(app)/produtos/BubbleWrapLinkDialog'
import { PackagingLinkDialog } from '@/app/(app)/produtos/PackagingLinkDialog'
import { ProductForm, type PackagingOption } from '@/app/(app)/produtos/ProductForm'
import { PageHeader } from '@/components/PageHeader'
import { RouteTabs } from '@/components/RouteTabs'
import { getProductStats } from '@/lib/data'

import { PricingSpreadsheet } from './PricingSpreadsheet'

export const dynamic = 'force-dynamic'

export default async function PricingPage() {
  const products = await getProductStats()

  const saleProducts = products.filter((p) => p.item_kind !== 'INSUMO')
  const packagingProducts = products.filter((p) => p.item_kind === 'INSUMO')

  const packagingOptions: PackagingOption[] = packagingProducts.map((bag) => ({
    id: bag.product_id,
    name: bag.name,
    sku: bag.sku,
    unit_cost: bag.unit_cost,
    stock_balance: bag.stock_balance,
  }))

  const bubbleWrapInsumo = packagingProducts.find(
    (p) => p.name.toUpperCase().includes('BOLHA') || p.sku?.toUpperCase().includes('BOLHA'),
  )
  const bubbleWrapOption: PackagingOption | null = bubbleWrapInsumo
    ? {
        id: bubbleWrapInsumo.product_id,
        name: bubbleWrapInsumo.name,
        sku: bubbleWrapInsumo.sku,
        unit_cost: bubbleWrapInsumo.unit_cost,
        stock_balance: bubbleWrapInsumo.stock_balance,
      }
    : null

  const bubbleProducts = saleProducts.map((p) => ({
    id: p.product_id,
    name: p.name,
    sku: p.sku,
    category: p.category,
    sale_price: p.sale_price,
    unit_cost: p.unit_cost,
    packaging_cost: p.packaging_cost,
    linked_packaging_name: p.linked_packaging_name,
    linked_packaging_sku: p.linked_packaging_sku,
    linked_packaging_unit_cost: p.linked_packaging_unit_cost,
    use_bubble_wrap: p.use_bubble_wrap,
    linked_bubble_wrap_qty: p.linked_bubble_wrap_qty,
  }))

  const linkableProducts = saleProducts.map((prod) => ({
    id: prod.product_id,
    name: prod.name,
    sku: prod.sku,
    sale_price: prod.sale_price,
    unit_cost: prod.unit_cost,
    gross_weight_grams: prod.gross_weight_grams,
    shipping_cost: prod.shipping_cost,
    linked_packaging_product_id: prod.linked_packaging_product_id,
    linked_packaging_name: prod.linked_packaging_name,
    linked_packaging_qty: prod.linked_packaging_qty,
  }))

  return (
    <>
      <PageHeader
        title="Planilha de Precificação (Mercado Livre)"
        description="Simule margens na hora com custo de aquisição, impostos da NF, comissões do Mercado Livre (Clássico vs Premium), taxa fixa (< R$ 79) e frete."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BubbleWrapLinkDialog
              products={bubbleProducts}
              bubbleWrapInsumo={bubbleWrapOption}
              triggerLabel="🫧 Plástico Bolha"
            />
            <OlistPullButton />
            <PackagingLinkDialog
              products={linkableProducts}
              packagingOptions={packagingOptions}
            />
            <ProductForm
              packagingOptions={packagingOptions}
              linkableProducts={linkableProducts}
            />
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

      <PricingSpreadsheet products={saleProducts} />
    </>
  )
}
