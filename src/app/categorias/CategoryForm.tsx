'use client'

import { Pencil, Plus } from 'lucide-react'

import { Field } from '@/components/FormControls'
import { FormDialog } from '@/components/FormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { CATEGORY_TYPES, type Category } from '@/lib/types'

import { createCategory, updateCategory } from './actions'

const TYPE_LABEL: Record<string, string> = {
  ENTRADA: 'Entrada (receita)',
  SAIDA: 'Saída (despesa)',
  APORTE: 'Aporte',
  ESTORNO: 'Estorno',
  INVESTIMENTO: 'Investimento',
}

export function CategoryForm({ category }: { category?: Category }) {
  const editing = Boolean(category)

  return (
    <FormDialog
      trigger={
        editing ? (
          <Button variant="ghost" size="icon-sm" aria-label="Editar categoria">
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Nova categoria
          </Button>
        )
      }
      title={editing ? `Editar ${category?.name}` : 'Nova categoria'}
      description="Categoria responde “o que é esse gasto?” — é independente do centro de custo."
      action={editing ? updateCategory : createCategory}
    >
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <Field label="Nome" htmlFor="cat-name">
        <Input
          id="cat-name"
          name="name"
          required
          autoFocus
          placeholder="Ex.: Embalagem"
          defaultValue={category?.name ?? ''}
        />
      </Field>

      <Field label="Tipo" hint="Define em quais lançamentos esta categoria aparece.">
        <NativeSelect name="type" defaultValue={category?.type ?? 'SAIDA'}>
          {CATEGORY_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABEL[type]}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </FormDialog>
  )
}
