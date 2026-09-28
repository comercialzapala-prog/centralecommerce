import type { Metadata } from 'next'
import { Geist } from 'next/font/google'

import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'

/**
 * Layout raiz -- SOMENTE o documento.
 *
 * A moldura da aplicacao (sidebar, cabecalho, area de conteudo) mora agora em
 * `(app)/layout.tsx`. Ela saiu daqui quando o login entrou: o layout raiz envolve
 * TODAS as rotas, e a tela de login nao pode aparecer dentro da moldura de um
 * sistema em que a pessoa ainda nao entrou.
 *
 * `(app)` e `(auth)` sao grupos de rota: segmentos de organizacao que NAO
 * aparecem na URL. `/dashboard` continua sendo `/dashboard`.
 */

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Control Center | Central E-commerce',
  description: 'Gestão financeira, comercial e operacional do e-commerce',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={cn('font-sans', geist.variable)}>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
