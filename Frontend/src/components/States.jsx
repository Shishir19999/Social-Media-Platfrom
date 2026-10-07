import Icon from './Icon'

export function EmptyState({ icon = 'sparkles', title, children, action }) {
  return (
    <div className="state state-empty">
      <span className="state-icon"><Icon name={icon} size={28} /></span>
      <h3 className="state-title">{title}</h3>
      {children && <p className="state-text">{children}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message = 'Something went wrong.', onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <span className="state-icon"><Icon name="alert" size={28} /></span>
      <h3 className="state-title">{message}</h3>
      <p className="state-text">Check your connection and try again.</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          <Icon name="refresh" size={16} /> Try again
        </button>
      )}
    </div>
  )
}

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status" aria-label={label} />
}

export function PostSkeleton() {
  return (
    <div className="card post-card skeleton-card" aria-hidden="true">
      <div className="row">
        <span className="skeleton sk-avatar" />
        <div className="grow">
          <span className="skeleton sk-line sk-w40" />
          <span className="skeleton sk-line sk-w25" />
        </div>
      </div>
      <span className="skeleton sk-line sk-w100" />
      <span className="skeleton sk-line sk-w80" />
      <span className="skeleton sk-block" />
    </div>
  )
}

export function FeedSkeleton({ count = 3 }) {
  return (
    <div role="status" aria-label="Loading posts">
      {Array.from({ length: count }, (_, i) => <PostSkeleton key={i} />)}
    </div>
  )
}

export function ListSkeleton({ count = 4 }) {
  return (
    <div role="status" aria-label="Loading" className="stack-sm">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="row" aria-hidden="true">
          <span className="skeleton sk-avatar" />
          <div className="grow">
            <span className="skeleton sk-line sk-w60" />
            <span className="skeleton sk-line sk-w40" />
          </div>
        </div>
      ))}
    </div>
  )
}
