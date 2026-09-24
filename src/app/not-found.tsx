import Link from 'next/link'
import { FileQuestion } from 'lucide-react'

import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <FileQuestion className="mx-auto size-8 text-muted-foreground" />
      <h1 className="mt-3 text-lg font-semibold">Registro não encontrado</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        O item que você tentou abrir não existe mais ou o link está incorreto.
      </p>
      <Button className="mt-4" size="sm" render={<Link href="/dashboard">Ir para o dashboard</Link>} />
    </div>
  )
}
