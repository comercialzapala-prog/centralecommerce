'use client'

import { DownloadCloud, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { syncOlistProductsNowAction } from '@/app/(app)/configuracoes/integracoes/olist/actions'
import { Button } from '@/components/ui/button'

export function OlistPullButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  function handlePull() {
    setMessage(null)
    startTransition(async () => {
      const res = await syncOlistProductsNowAction(true)
      if (!res.ok) {
        setMessage({ ok: false, text: res.error })
        return
      }
      setMessage({
        ok: true,
        text: res.data?.message ?? 'Catálogo importado do Olist ERP com sucesso.',
      })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={handlePull}
        title="Puxa todos os produtos, preços, custos, pesos, EAN, NCM e saldos de estoque cadastrados no Olist ERP"
      >
        {pending ? (
          <RefreshCw className="size-3.5 animate-spin" />
        ) : (
          <DownloadCloud className="size-3.5 text-primary" />
        )}
        {pending ? 'Puxando do Olist...' : 'Puxar Catálogo do Olist'}
      </Button>
      {message && (
        <span
          className={
            message.ok
              ? 'text-[11px] font-medium text-emerald-700 dark:text-emerald-300'
              : 'text-[11px] font-medium text-destructive'
          }
        >
          {message.text}
        </span>
      )}
    </div>
  )
}
