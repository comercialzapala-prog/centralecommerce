import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Category = {
  id: string
  name: string
  type: 'ENTRADA' | 'SAIDA' | 'APORTE' | 'ESTORNO' | 'INVESTIMENTO'
  active: boolean
}

export type Subcategory = {
  id: string
  category_id: string
  name: string
  active: boolean
}

export type Transaction = {
  id: string
  date: string
  type: 'ENTRADA' | 'SAIDA' | 'APORTE' | 'ESTORNO' | 'INVESTIMENTO'
  category_id: string
  subcategory_id?: string
  description: string
  amount: number
  payment_method: string
  status: 'PAGO' | 'PENDENTE' | 'CANCELADO'
}

export type Settings = {
  operationName: string
  breakEvenTarget: number
}

interface AppState {
  categories: Category[]
  subcategories: Subcategory[]
  transactions: Transaction[]
  settings: Settings
  addCategory: (cat: Omit<Category, 'id'>) => void
  updateCategory: (id: string, cat: Partial<Category>) => void
  addTransaction: (tx: Omit<Transaction, 'id'>) => void
  updateSettings: (settings: Partial<Settings>) => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      categories: [
        { id: '1', name: 'Venda de Mercadoria', type: 'ENTRADA', active: true },
        { id: '2', name: 'Operacional', type: 'SAIDA', active: true },
        { id: '3', name: 'Marketing', type: 'SAIDA', active: true },
        { id: '4', name: 'Reforma', type: 'INVESTIMENTO', active: true },
      ],
      subcategories: [],
      transactions: [],
      settings: {
        operationName: 'Central E-commerce',
        breakEvenTarget: 0,
      },
      addCategory: (cat) => set((state) => ({ 
        categories: [...state.categories, { ...cat, id: Math.random().toString(36).substring(7) }] 
      })),
      updateCategory: (id, cat) => set((state) => ({
        categories: state.categories.map(c => c.id === id ? { ...c, ...cat } : c)
      })),
      addTransaction: (tx) => set((state) => ({
        transactions: [...state.transactions, { ...tx, id: Math.random().toString(36).substring(7) }]
      })),
      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),
    }),
    {
      name: 'centralecommerce-storage',
    }
  )
)
