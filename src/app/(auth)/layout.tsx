/**
 * Moldura das telas de autenticacao.
 *
 * Sem sidebar e sem cabecalho de propósito: quem esta aqui ainda nao entrou, e
 * mostrar a navegacao do sistema por tras do formulario sugere acesso que nao
 * existe.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
