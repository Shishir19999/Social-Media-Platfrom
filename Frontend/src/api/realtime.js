// Live updates (new messages, typing hints, notification pings).
// Real mode: a Socket.IO connection to the API. Live preview: a BroadcastChannel, so two tabs of the
// same browser talk to each other. Both expose the same small interface: connect, disconnect, on, emit.
import { API_URL } from '../config'

const listeners = new Map()

function dispatch(event, payload) {
  for (const cb of listeners.get(event) || []) {
    try { cb(payload) } catch { /* a faulty listener must not break the others */ }
  }
}

/** Subscribe to an event; returns the unsubscribe function. */
export function on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event).add(cb)
  return () => listeners.get(event)?.delete(cb)
}

let socket = null
let channel = null

/** Called by the Live preview backend when something happens that other tabs should hear about. */
export function publishLocal(event, payload) {
  if (channel) channel.postMessage({ event, payload })
  // the sending tab also hears it, like a socket room that includes the sender
  dispatch(event, payload)
}

export async function connect(token, userId) {
  disconnect()
  if (__DEMO__) {
    if (typeof BroadcastChannel === 'undefined') return
    channel = new BroadcastChannel('orbit-live-preview')
    channel.onmessage = (e) => dispatch(e.data.event, e.data.payload)
    return
  }
  const { io } = await import('socket.io-client')
  socket = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'] })
  for (const event of ['message:new', 'message:read', 'typing', 'notification:new']) socket.on(event, (p) => dispatch(event, p))
  socket.userId = userId
}

export function disconnect() {
  if (channel) { channel.close(); channel = null }
  if (socket) { socket.close(); socket = null }
}

/** Typing hint for the person at `to` (a user id). */
export function emit(event, payload) {
  if (__DEMO__) { if (channel) channel.postMessage({ event, payload }); return }
  if (socket && event === 'typing') socket.emit('typing', payload.to)
}
