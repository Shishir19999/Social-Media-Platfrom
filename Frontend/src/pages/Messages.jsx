import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { emit, on } from '../api/realtime'
import { useAuth, useNotifications, useToast } from '../context/contexts'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import { EmptyState, ErrorState, ListSkeleton } from '../components/States'
import { fullDate, timeAgo } from '../lib/format'
import { validateMessage } from '../lib/rules'
import { MESSAGE_LIMIT } from '../lib/validate'

function NewMessage({ onClose }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  useEffect(() => {
    let live = true
    const t = setTimeout(() => { api.searchUsers(q).then((l) => { if (live) setPeople(l) }).catch(() => {}) }, 150)
    return () => { live = false; clearTimeout(t) }
  }, [q])
  return (
    <Modal title="New message" onClose={onClose} size="sm">
      <div className="field">
        <label htmlFor="nm-q">Find a person</label>
        <input id="nm-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or username" autoComplete="off" data-initial-focus />
      </div>
      <ul className="stack-sm pick-list" aria-label="People">
        {people.map((p) => (
          <li key={p.id}>
            <button type="button" className="pick-row" onClick={() => { onClose(); navigate(`/messages/${p.username}`) }}>
              <Avatar user={p} size={36} />
              <span className="grow min0"><strong>{p.displayName}</strong><br /><span className="muted">@{p.username}</span></span>
            </button>
          </li>
        ))}
        {people.length === 0 && <li className="muted">No one found.</li>}
      </ul>
    </Modal>
  )
}

function ConversationList({ active }) {
  const [state, setState] = useState({ items: null, error: '' })
  const [composing, setComposing] = useState(false)
  const load = useCallback(() => {
    api.conversations().then((items) => setState({ items, error: '' })).catch((e) => setState((s) => ({ ...s, error: e.message })))
  }, [])
  useEffect(() => {
    load()
    const offs = [on('message:new', load), on('message:read', load)]
    return () => offs.forEach((off) => off())
  }, [load, active])

  return (
    <section className="card msg-list" aria-label="Conversations">
      <div className="msg-list-head">
        {active ? <h2 className="page-title">Messages</h2> : <h1 className="page-title">Messages</h1>}
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setComposing(true)}><Icon name="plus" size={16} /> New</button>
      </div>
      {state.error && !state.items && <ErrorState message={state.error} onRetry={load} />}
      {!state.items && !state.error && <ListSkeleton count={4} />}
      {state.items && state.items.length === 0 && <EmptyState icon="mail" title="No conversations yet">Start one with the New button, or from anyone&apos;s profile.</EmptyState>}
      {state.items && state.items.length > 0 && (
        <ul>
          {state.items.map((c) => (
            <li key={c.id}>
              <Link to={`/messages/${c.with.username}`} className={`conv ${active === c.with.username ? 'conv-active' : ''} ${c.unread ? 'conv-unread' : ''}`} aria-current={active === c.with.username ? 'page' : undefined}>
                <Avatar user={c.with} size={44} />
                <span className="grow min0">
                  <span className="conv-top"><strong className="ellipsis">{c.with.displayName}</strong><time className="muted" dateTime={c.last.at}>{timeAgo(c.last.at)}</time></span>
                  <span className="conv-last ellipsis">{c.last.mine ? 'You: ' : ''}{c.last.text}</span>
                </span>
                {c.unread > 0 && <span className="conv-badge">{c.unread}<span className="sr-only"> unread</span></span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {composing && <NewMessage onClose={() => setComposing(false)} />}
    </section>
  )
}

function Thread({ username }) {
  const { user } = useAuth()
  const toast = useToast()
  const { refreshDm } = useNotifications()
  const [state, setState] = useState({ loading: true, error: '', peer: null, messages: [], hasMore: false, otherRead: null })
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const [busy, setBusy] = useState(false)
  const log = useRef(null)
  const lastTyping = useRef(0)
  const typingTimer = useRef(null)
  const peerId = state.peer?.id

  const markRead = useCallback(() => {
    api.markThreadRead(username).then(refreshDm).catch(() => {})
  }, [username, refreshDm])

  useEffect(() => {
    let live = true
    api.thread(username)
      .then((data) => { if (live) { setState({ loading: false, error: '', peer: data.with, messages: data.messages, hasMore: data.hasMore, otherRead: data.otherRead }); markRead() } })
      .catch((err) => { if (live) setState((s) => ({ ...s, loading: false, error: err.message })) })
    return () => { live = false }
  }, [username, markRead])

  useEffect(() => {
    if (!peerId) return undefined
    const offNew = on('message:new', (p) => {
      if (!((p.from === peerId && p.to === user.id) || (p.from === user.id && p.to === peerId))) return
      setState((s) => (s.messages.some((m) => m.id === p.message.id) ? s : { ...s, messages: [...s.messages, p.message] }))
      if (p.from === peerId) { setTyping(false); markRead() }
    })
    const offRead = on('message:read', (p) => { if (p.from === peerId && (!p.to || p.to === user.id)) setState((s) => ({ ...s, otherRead: new Date().toISOString() })) })
    const offTyping = on('typing', (p) => {
      if (p.from !== peerId || (p.to && p.to !== user.id)) return
      setTyping(true)
      clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => setTyping(false), 3000)
    })
    return () => { offNew(); offRead(); offTyping(); clearTimeout(typingTimer.current) }
  }, [peerId, user.id, markRead])

  // keep the newest message in view
  const count = state.messages.length
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight }, [count, typing])

  const loadEarlier = async () => {
    try {
      const data = await api.thread(username, { before: state.messages[0].id })
      setState((s) => ({ ...s, messages: [...data.messages, ...s.messages], hasMore: data.hasMore }))
    } catch (err) { toast.error(err.message) }
  }

  const onType = (v) => {
    setText(v)
    if (peerId && Date.now() - lastTyping.current > 1500) { lastTyping.current = Date.now(); emit('typing', { to: peerId, from: user.id }) }
  }

  const send = async (e) => {
    e?.preventDefault()
    const body = text.trim()
    const bad = validateMessage(body)
    if (bad) { toast.error(bad); return }
    setBusy(true)
    try {
      const m = await api.sendMessage(username, body)
      setText('')
      setState((s) => (s.messages.some((x) => x.id === m.id) ? s : { ...s, messages: [...s.messages, m] }))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (state.loading) return <section className="card msg-thread"><h1 className="sr-only">Conversation</h1><ListSkeleton count={3} /></section>
  if (state.error && !state.peer) {
    return <section className="card msg-thread"><h1 className="sr-only">Conversation</h1><EmptyState icon="mail" title="Cannot open this conversation" action={<Link className="btn btn-primary" to="/messages">All messages</Link>}>{state.error}</EmptyState></section>
  }

  const lastMine = [...state.messages].reverse().find((m) => m.sender === user.id)
  const seen = lastMine && state.otherRead && new Date(state.otherRead) >= new Date(lastMine.createdAt)
  const left = MESSAGE_LIMIT - text.length

  return (
    <section className="card msg-thread" aria-label={`Conversation with ${state.peer.displayName}`}>
      <header className="msg-thread-head">
        <Link to="/messages" className="icon-btn msg-back" aria-label="Back to all messages"><Icon name="arrowLeft" /></Link>
        <Link to={`/u/${state.peer.username}`} className="row"><Avatar user={state.peer} size={40} /><div><h1 className="msg-peer">{state.peer.displayName}</h1><span className="muted">@{state.peer.username}</span></div></Link>
      </header>
      <div className="msg-log" ref={log} role="log" aria-live="polite" aria-label="Messages" tabIndex={0}>
        {state.hasMore && <button type="button" className="btn btn-ghost btn-sm msg-more" onClick={loadEarlier}>Load earlier messages</button>}
        {state.messages.length === 0 && <p className="muted msg-empty">Say hello to {state.peer.displayName}.</p>}
        {state.messages.map((m) => (
          <div key={m.id} className={`bubble ${m.sender === user.id ? 'bubble-mine' : 'bubble-theirs'}`}>
            <p>{m.text}</p>
            <time className="bubble-time" dateTime={m.createdAt} title={fullDate(m.createdAt)}>{timeAgo(m.createdAt)}</time>
          </div>
        ))}
        {seen && <p className="muted msg-seen">Seen</p>}
        {typing && <p className="muted msg-typing" role="status">{state.peer.displayName} is typing...</p>}
      </div>
      <form className="msg-form" onSubmit={send} noValidate>
        <label htmlFor="msg-text" className="sr-only">Message {state.peer.displayName}</label>
        <textarea
          id="msg-text"
          rows={1}
          value={text}
          placeholder="Write a message. Enter sends, Shift+Enter adds a line."
          onChange={(e) => onType(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          aria-invalid={left < 0}
        />
        <span className={`counter ${left < 0 ? 'counter-over' : ''}`}>{left < 100 ? left : ''}</span>
        <button type="submit" className="btn btn-primary" disabled={busy || !text.trim() || left < 0} aria-label="Send message"><Icon name="send" size={18} /><span className="btn-text"> Send</span></button>
      </form>
    </section>
  )
}

export default function Messages() {
  const { username } = useParams()
  return (
    <div className="container messages">
      <div className={`msg-layout ${username ? 'has-thread' : ''}`}>
        <ConversationList active={username} />
        {username
          ? <Thread key={username} username={username} />
          : <section className="card msg-thread msg-placeholder"><EmptyState icon="mail" title="Select a conversation">Pick someone on the left, or start a new message.</EmptyState></section>}
      </div>
    </div>
  )
}
