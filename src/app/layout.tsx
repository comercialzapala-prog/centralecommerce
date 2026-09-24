import type { Metadata } from 'next'
import { Geist } from 'next/font/google'

import './globals.css'
import { Sidebar } from '@/components/Sidebar'
import { Topbar } from '@/components/Topbar'
import { Toaster } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'

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
        <div className="flex h-dvh overflow-hidden">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="mx-auto w-full max-w-[1400px] space-y-5">{children}</div>
            </main>
          </div>
        </div>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
