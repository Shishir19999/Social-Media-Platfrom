import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useSentinel } from '../hooks/useInfinite'
import PostCard from './PostCard'
import { EmptyState, ErrorState, FeedSkeleton, Spinner } from './States'

/**
 * Paged list of posts with infinite scroll. `query` is {scope, tag, author, saved}; the feed reloads
 * when it changes. `reloadKey` forces a reload; `prepend` shows a just-created post at the top.
 */
export default function Feed({ query, empty, reloadKey = 0, prepend = null, onLoaded }) {
  const [state, setState] = useState({ posts: [], page: 0, pages: 1, loading: true, more: false, error: '' })
  const token = useRef(0)
  const qKey = JSON.stringify(query)

  const load = useCallback(async (page) => {
    const mine = ++token.current
    setState((s) => (page === 1 ? { posts: [], page: 0, pages: 1, loading: true, more: false, error: '' } : { ...s, more: true, error: '' }))
    try {
      const data = await api.listPosts({ ...JSON.parse(qKey), page })
      if (mine !== token.current) return
      setState((s) => {
        const seen = new Set(page === 1 ? [] : s.posts.map((p) => p.id))
        const fresh = data.posts.filter((p) => !seen.has(p.id))
        return { posts: page === 1 ? fresh : [...s.posts, ...fresh], page: data.page, pages: data.pages, loading: false, more: false, error: '' }
      })
      onLoaded?.(data)
    } catch (err) {
      if (mine === token.current) setState((s) => ({ ...s, loading: false, more: false, error: err.message || 'Could not load posts.' }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qKey])

  useEffect(() => { load(1) }, [load, reloadKey])

  useEffect(() => {
    if (!prepend) return
    setState((s) => (s.posts.some((p) => p.id === prepend.id) ? s : { ...s, posts: [prepend, ...s.posts] }))
  }, [prepend])

  const hasMore = state.page < state.pages
  const next = () => { if (!state.loading && !state.more && !state.error && hasMore) load(state.page + 1) }
  const sentinel = useSentinel(next, hasMore && !state.error)

  const onChange = useCallback((post) => setState((s) => ({ ...s, posts: s.posts.map((p) => (p.id === post.id ? post : p)) })), [])
  const onRemove = useCallback((id) => setState((s) => ({ ...s, posts: s.posts.filter((p) => p.id !== id) })), [])

  if (state.loading) return <FeedSkeleton />
  if (state.error && !state.posts.length) return <ErrorState message={state.error} onRetry={() => load(1)} />
  if (!state.posts.length) return empty || <EmptyState title="Nothing here yet">Posts will show up here.</EmptyState>

  return (
    <div className="feed">
      {state.posts.map((p) => <PostCard key={p.id} post={p} onChange={onChange} onRemove={onRemove} />)}
      {state.error && <ErrorState message={state.error} onRetry={() => load(state.page + 1)} />}
      {hasMore && !state.error && (
        <div ref={sentinel} className="feed-more">
          {state.more ? <Spinner label="Loading more posts" /> : <button type="button" className="btn btn-secondary" onClick={next}>Load more</button>}
        </div>
      )}
      {!hasMore && state.posts.length > 5 && <p className="feed-end muted">You are all caught up.</p>}
    </div>
  )
}
