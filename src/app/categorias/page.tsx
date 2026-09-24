import { Eye, EyeOff } from 'lucide-react'

import { ConfirmActionButton } from '@/components/FormDialog'
import { EmptyState, PageHeader } from '@/components/PageHeader'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getCategories } from '@/lib/data'
import { CATEGORY_TYPES } from '@/lib/types'
import { cn } from '@/lib/utils'

import { setCategoryActive } from './actions'
import { CategoryForm } from './CategoryForm'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  APORTE: 'Aporte',
  ESTORNO: 'Estorno',
  INVESTIMENTO: 'Investimento',
}

export default async function CategoriesPage() {
  const categories = await getCategories()

  return (
    <>
      <PageHeader
        title="Categorias"
        description="“O que é esse gasto?” — Frete, Embalagem, Energia, Marketing, Imposto. Não confundir com centro de custo, que responde qual área consumiu."
        actions={<CategoryForm />}
      />

      {categories.length === 0 ? (
        <EmptyState title="Nenhuma categoria cadastrada" action={<CategoryForm />} />
      ) : (
        <div className="space-y-4">
          {CATEGORY_TYPES.map((type) => {
            const group = categories.filter((category) => category.type === type)
            if (group.length === 0) return null

            return (
              <section key={type} className="overflow-hidden rounded-xl border bg-card">
                <h2 className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {TYPE_LABEL[type]}
                  <span className="ml-2 font-normal normal-case">({group.length})</span>
                </h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead className="w-[110px]">Status</TableHead>
                      <TableHead className="w-[90px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.map((category) => (
                      <TableRow
                        key={category.id}
                        className={cn(!category.active && 'opacity-55')}
                      >
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[11px] font-medium',
                              category.active
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-muted text-muted-foreground',
                            )}
                          >
                            {category.active ? 'Ativa' : 'Inativa'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end">
                            <CategoryForm category={category} />
                            <ConfirmActionButton
                              action={setCategoryActive}
                              fields={{
                                id: category.id,
                                active: category.active ? 'false' : 'true',
                              }}
                              label=""
                              size="icon-sm"
                              icon={category.active ? <EyeOff /> : <Eye />}
                              confirmMessage={
                                category.active
                                  ? `Desativar "${category.name}"? Ela some dos formulários, mas os lançamentos antigos continuam intactos.`
                                  : `Reativar "${category.name}"?`
                              }
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
