import { cn } from '@/lib/utils'

/**
 * Moldura padrao dos graficos.
 *
 * O `<details>` com a tabela nao e enfeite: garante que nenhum valor exista
 * so dentro de um tooltip ou so dentro de uma cor.
 */
export function ChartCard({
  title,
  description,
  children,
  table,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  table?: { columns: string[]; rows: (string | number)[][] }
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border bg-card p-4', className)}>
      <header className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </header>

      {children}

      {table && table.rows.length > 0 ? (
        <details className="mt-3 border-t pt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Ver dados em tabela
          </summary>
          <div className="mt-2 max-h-64 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-muted-foreground">
                  {table.columns.map((column, index) => (
                    <th
                      key={column}
                      className={cn('py-1 pr-3 font-medium', index > 0 && 'text-right')}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-border/50 last:border-0">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className={cn(
                          'py-1 pr-3',
                          cellIndex > 0 && 'text-right tabular-nums',
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  )
}

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  )
}
