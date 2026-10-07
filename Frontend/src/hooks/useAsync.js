import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Runs `fn` on mount and whenever `deps` change. Returns {data, loading, error, reload, setData}.
 * `loading` is derived from the request key, so a dependency change shows the loading state at once.
 */
export function useAsync(fn, deps) {
  const [tick, setTick] = useState(0)
  const [state, setState] = useState({ key: null, data: null, error: '' })
  const fnRef = useRef(fn)
  useEffect(() => { fnRef.current = fn })
  const key = JSON.stringify([tick, ...deps])

  useEffect(() => {
    let live = true
    fnRef.current()
      .then((data) => { if (live) setState({ key, data, error: '' }) })
      .catch((err) => { if (live) setState({ key, data: null, error: err.message || 'Something went wrong.' }) })
    return () => { live = false }
  }, [key])

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), [])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const ready = state.key === key
  return { data: ready || state.key !== null ? state.data : null, loading: !ready, error: ready ? state.error : '', reload, setData }
}
