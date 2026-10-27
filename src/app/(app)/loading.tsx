export default function AppLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded-md bg-muted" />
          <div className="h-4 w-80 max-w-full rounded-md bg-muted/60" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 rounded-lg bg-muted" />
          <div className="h-9 w-32 rounded-lg bg-muted" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="h-24 rounded-xl border bg-card/60 p-4" />
        <div className="h-24 rounded-xl border bg-card/60 p-4" />
        <div className="h-24 rounded-xl border bg-card/60 p-4" />
        <div className="h-24 rounded-xl border bg-card/60 p-4" />
      </div>

      <div className="h-80 rounded-xl border bg-card/60 p-4" />
    </div>
  )
}
