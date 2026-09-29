'use client'

import { AlertTriangle, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Error boundary de toda a aplicacao.
 *
 * Substitui o try/catch que existia em cada pagina: try/catch em volta de JSX
 * nao captura erro de renderizacao, so o que acontece nos `await`. O boundary
 * captura os dois.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const message = error.message ?? 'Erro desconhecido.'

  // Em producao o Next esconde a mensagem real do servidor e deixa so o
  // digest -- e o texto que chega ao cliente vem MINIFICADO ("Minified React
  // error #441"), nao em ingles por extenso. Testar so por
  // /server components render/ nunca casava em producao e a tela ficava sem
  // nenhuma pista (incidente de 2026-09-29). Sem causa identificavel o aviso
  // aparece de todo jeito, apontando as duas hipoteses e o digest.
  const redacted = !error.digest
    ? false
    : /server components render|minified react error #441|react.dev.errors.441/i.test(message) ||
      message.trim() === ''

  const missingSchema =
    redacted ||
    /v_transaction_full|v_cost_center_hierarchy|v_order_result|v_product_stats|v_supplier_stats|cost_center_report|schema cache|does not exist|42P01|PGRST\d+/i.test(
      message,
    )

  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="min-w-0 space-y-3">
            <div>
              <h1 className="text-base font-semibold text-destructive">
                Não foi possível carregar esta página
              </h1>
              <p className="mt-1 break-words text-sm text-muted-foreground">{message}</p>
            </div>

            {missingSchema ? (
              <div className="rounded-lg border bg-card p-3 text-sm">
                <p className="font-medium">
                  {redacted
                    ? 'A mensagem real ficou no servidor. Procure a referência abaixo nos logs.'
                    : 'O banco está sem o schema da V2.'}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {redacted
                    ? 'Duas causas comuns: o banco sem as migrations, ou o deploy mais antigo que o banco (RLS endurecida contra código que ainda consulta como anon). Se for a segunda, o caminho é publicar o código, não mexer no banco. Se for a primeira:'
                    : 'Aplique as migrations e recarregue:'}
                </p>
                <pre className="mt-2 overflow-x-auto rounded bg-muted px-2 py-1.5 text-xs">
                  npx supabase db push
                </pre>
                <p className="mt-2 text-xs text-muted-foreground">
                  Ou cole <code className="font-mono">supabase/V2_COMPLETO.sql</code> no SQL Editor
                  do Supabase.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={reset} size="sm">
                <RotateCcw /> Tentar de novo
              </Button>
              {error.digest ? (
                <span className="text-xs text-muted-foreground">
                  Referência: {error.digest}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
