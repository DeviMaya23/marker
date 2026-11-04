/** Placeholder rows while a page loads. */
export function ListSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="bookmark-row bookmark-row--skeleton" data-testid="skeleton-row" aria-hidden="true">
          <span className="skeleton skeleton--square" style={{ width: 18, height: 18 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="skeleton skeleton--line" style={{ width: '55%' }} />
            <span className="skeleton skeleton--line" style={{ width: '30%' }} />
          </div>
        </div>
      ))}
    </>
  )
}
