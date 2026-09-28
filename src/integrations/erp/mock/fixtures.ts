/**
 * DADOS FALSOS -- APENAS DESENVOLVIMENTO
 *
 * Isolado nesta pasta de proposito (secao 1: "nao espalhar mocks pelo projeto").
 * Somente MockErpProvider importa daqui, e o provider so e escolhido quando
 * ERP_PROVIDER=mock ou NODE_ENV !== 'production'. Nenhuma tela, hook, action ou
 * modulo de dominio conhece este arquivo.
 *
 * Os registros NAO sao aleatorios: cada um existe para acionar uma regra do
 * auditor e cobrir os casos da secao 40.
 *
 *   MOCK-001  saudavel, margem boa, giro estavel      -> nenhum alerta
 *   MOCK-002  cobertura menor que o lead time         -> ruptura proxima
 *   MOCK-003  custo maior que o preco                 -> margem negativa
 *   MOCK-004  sem custo, sem NCM, sem peso            -> cadastro incompleto
 *   MOCK-005  saldo negativo                          -> divergencia de estoque
 *   MOCK-006  SKU repetido de MOCK-001                -> SKU duplicado
 *   MOCK-007  fisico 100 / virtual 95 (5 reservados)  -> reserva visivel
 *   MOCK-008  giro 7d muito acima do 30d              -> aceleracao de vendas
 *   MOCK-009  estoque parado, sem venda               -> estoque parado
 */

import type {
  ErpOrder,
  ErpProduct,
  ErpProductSupplier,
  ErpStock,
  ErpSupplier,
  ErpWarehouse,
} from '@/integrations/erp/types'

/** Base fixa: mock com `new Date()` gera teste que falha em dia diferente. */
export const MOCK_TODAY = '2026-09-28'

function daysBefore(days: number): string {
  const base = Date.parse(`${MOCK_TODAY}T00:00:00Z`)
  return new Date(base - days * 86_400_000).toISOString().slice(0, 10)
}

function product(partial: Partial<ErpProduct> & Pick<ErpProduct, 'externalId' | 'name'>): ErpProduct {
  return {
    sku: null,
    price: null,
    cost: null,
    active: true,
    ncm: '39241000',
    gtin: null,
    weightKg: 0.5,
    dimensions: { lengthCm: 20, widthCm: 15, heightCm: 10 },
    unit: 'UN',
    brand: 'Marca Mock',
    parentExternalId: null,
    updatedAt: `${MOCK_TODAY}T12:00:00.000Z`,
    ...partial,
  }
}

export const MOCK_PRODUCTS: ErpProduct[] = [
  product({ externalId: '1001', sku: 'MOCK-001', name: 'Organizador Dobrável 30L', price: 89.9, cost: 38.5 }),
  product({ externalId: '1002', sku: 'MOCK-002', name: 'Cesto Aramado Branco', price: 129.9, cost: 61.2 }),
  product({ externalId: '1003', sku: 'MOCK-003', name: 'Kit Potes Herméticos 6un', price: 74.9, cost: 82.0 }),
  // Cadastro incompleto: o auditor tem de acusar custo, NCM e peso ausentes.
  product({
    externalId: '1004',
    sku: 'MOCK-004',
    name: 'Suporte de Parede Ajustável',
    price: 45.0,
    cost: null,
    ncm: null,
    weightKg: null,
    dimensions: null,
  }),
  product({ externalId: '1005', sku: 'MOCK-005', name: 'Prateleira Modular 60cm', price: 159.9, cost: 70.0 }),
  // SKU repetido de propósito (mesmo codigo de 1001, id externo diferente).
  product({ externalId: '1006', sku: 'MOCK-001', name: 'Organizador Dobrável 30L (duplicado)', price: 89.9, cost: 38.5 }),
  product({ externalId: '1007', sku: 'MOCK-007', name: 'Caixa Organizadora Transparente', price: 39.9, cost: 16.4 }),
  product({ externalId: '1008', sku: 'MOCK-008', name: 'Cabideiro Extensor (viral)', price: 29.9, cost: 9.8 }),
  product({ externalId: '1009', sku: 'MOCK-009', name: 'Divisor de Gaveta Bambu', price: 64.9, cost: 27.3 }),
]

/**
 * Saldos. Todos com source LOCAL: o mock nao inventa estoque Full, porque Full
 * so pode vir da integracao com o Mercado Livre (secao 22).
 */
function balance(
  productExternalId: string,
  physical: number,
  reserved = 0,
): ErpStock {
  return {
    productExternalId,
    source: 'LOCAL',
    warehouseExternalId: 'DEP-1',
    warehouseName: 'Depósito Principal',
    physicalQuantity: physical,
    virtualQuantity: physical - reserved,
    reservedQuantity: reserved,
    updatedAt: `${MOCK_TODAY}T11:30:00.000Z`,
  }
}

export const MOCK_STOCKS: ErpStock[] = [
  balance('1001', 220),
  balance('1002', 18), // cobertura curta contra lead time de 6 dias
  balance('1003', 40),
  balance('1004', 12),
  balance('1005', -3), // divergencia: saldo negativo nao deveria existir
  balance('1006', 5),
  balance('1007', 100, 5), // fisico 100, virtual 95
  balance('1008', 24),
  balance('1009', 340), // muito estoque, nenhuma venda
]

export const MOCK_WAREHOUSES: ErpWarehouse[] = [
  { externalId: 'DEP-1', name: 'Depósito Principal', active: true, kind: 'OWN' },
  { externalId: 'DEP-2', name: 'Depósito Secundário', active: true, kind: 'OWN' },
]

export const MOCK_SUPPLIERS: ErpSupplier[] = [
  {
    externalId: 'F-01',
    name: 'Distribuidora Casa & Ordem',
    document: '12345678000190',
    email: 'comercial@exemplo.invalid',
    phone: '1130000000',
    active: true,
  },
  {
    externalId: 'F-02',
    name: 'Importadora Lar Prático',
    document: '98765432000155',
    email: 'pedidos@exemplo.invalid',
    phone: '1140000000',
    active: true,
  },
]

export const MOCK_PRODUCT_SUPPLIERS: ErpProductSupplier[] = [
  { productExternalId: '1001', supplierExternalId: 'F-01', supplierSku: 'CO-30L', cost: 38.5, leadTimeDays: 8, primary: true },
  { productExternalId: '1002', supplierExternalId: 'F-01', supplierSku: 'CA-BR', cost: 61.2, leadTimeDays: 6, primary: true },
  { productExternalId: '1003', supplierExternalId: 'F-02', supplierSku: 'KP-6', cost: 82.0, leadTimeDays: 15, primary: true },
  { productExternalId: '1007', supplierExternalId: 'F-02', supplierSku: 'CX-TR', cost: 16.4, leadTimeDays: 10, primary: true },
  { productExternalId: '1008', supplierExternalId: 'F-01', supplierSku: 'CB-EX', cost: 9.8, leadTimeDays: 12, primary: true },
  // 1004, 1005, 1006 e 1009 sem fornecedor: o auditor acusa "fornecedor ausente"
  // e a inteligencia cai no prazo default configuravel (secao 26).
]

/**
 * Pedidos. Formam o historico de venda que gera as velocidades 7/30/60 (secao 25).
 * MOCK-008 concentra venda nos ultimos 7 dias -- e o caso de aceleracao.
 */
function order(
  externalId: string,
  daysAgo: number,
  items: { productExternalId: string; quantity: number; unitPrice: number; unitCost: number }[],
): ErpOrder {
  const gross = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

  return {
    externalId,
    number: externalId,
    date: daysBefore(daysAgo),
    status: 'CONCLUIDO',
    channelName: 'Mercado Livre',
    customerName: 'Cliente Mock',
    grossAmount: gross,
    discountAmount: 0,
    shippingCharged: 0,
    totalAmount: gross,
    items: items.map((item) => ({
      productExternalId: item.productExternalId,
      sku: MOCK_PRODUCTS.find((p) => p.externalId === item.productExternalId)?.sku ?? null,
      description: MOCK_PRODUCTS.find((p) => p.externalId === item.productExternalId)?.name ?? 'Item',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
    })),
    updatedAt: `${daysBefore(daysAgo)}T18:00:00.000Z`,
  }
}

export const MOCK_ORDERS: ErpOrder[] = [
  // MOCK-001: giro estavel, ~2/dia.
  ...Array.from({ length: 12 }, (_, index) =>
    order(`P-1001-${index}`, index * 2 + 1, [
      { productExternalId: '1001', quantity: 4, unitPrice: 89.9, unitCost: 38.5 },
    ]),
  ),
  // MOCK-002: ~4,2/dia -> 18 unidades cobrem menos de 5 dias, lead time 6.
  ...Array.from({ length: 10 }, (_, index) =>
    order(`P-1002-${index}`, index * 3 + 1, [
      { productExternalId: '1002', quantity: 13, unitPrice: 129.9, unitCost: 61.2 },
    ]),
  ),
  // MOCK-003: vende com margem negativa.
  ...Array.from({ length: 4 }, (_, index) =>
    order(`P-1003-${index}`, index * 7 + 2, [
      { productExternalId: '1003', quantity: 2, unitPrice: 74.9, unitCost: 82.0 },
    ]),
  ),
  // MOCK-008: nada nos 30 dias anteriores, explosao nos ultimos 7.
  ...Array.from({ length: 7 }, (_, index) =>
    order(`P-1008-${index}`, index, [
      { productExternalId: '1008', quantity: 9, unitPrice: 29.9, unitCost: 9.8 },
    ]),
  ),
  order('P-1008-old', 45, [{ productExternalId: '1008', quantity: 2, unitPrice: 29.9, unitCost: 9.8 }]),
  // MOCK-007 e MOCK-005 vendem devagar; MOCK-009 nao vende.
  order('P-1007-0', 5, [{ productExternalId: '1007', quantity: 3, unitPrice: 39.9, unitCost: 16.4 }]),
  order('P-1007-1', 22, [{ productExternalId: '1007', quantity: 2, unitPrice: 39.9, unitCost: 16.4 }]),
  order('P-1005-0', 12, [{ productExternalId: '1005', quantity: 1, unitPrice: 159.9, unitCost: 70.0 }]),
]
