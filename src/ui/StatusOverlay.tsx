export type LoadState =
  | { kind: 'loading-catalog' }
  | { kind: 'preparing'; count: number }
  | { kind: 'ready' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

const num = new Intl.NumberFormat('en-US')

export function StatusOverlay({ state }: { state: LoadState }) {
  if (state.kind === 'ready') return null

  if (state.kind === 'missing') {
    return (
      <div className="status status-block" role="alert">
        <h2>Element catalog not available</h2>
        <p>Download the CelesTrak GP elements from the project folder, then reload the page:</p>
        <pre>npm run fetch-data</pre>
        <p className="status-note">Needs a network connection. Downloads are cached for 2 hours, CelesTrak's update interval.</p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="status status-block" role="alert">
        <h2>Could not load the catalog</h2>
        <p>{state.message}</p>
      </div>
    )
  }

  return (
    <div className="status" role="status" aria-live="polite">
      <span className="status-pulse" aria-hidden />
      {state.kind === 'loading-catalog' ? 'Loading element catalog' : `Initializing SGP4 for ${num.format(state.count)} objects`}
    </div>
  )
}
