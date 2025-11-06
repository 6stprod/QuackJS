/*
quackjs — lightweight real-time notification library
Version: 1.0.6
Author: 6stPROD
License: MIT

Features:
 - WebSocket first, with SSE & polling fallback
 - Automatic reconnect with exponential backoff
 - Queueing, dedup, grouping, rate-limiting
 - Browser native notifications support (permission handling)
 - Simple DOM toast UI + CSS (mount into any container)
 - EventEmitter-style API + Promise helpers
 - Works as ESM or UMD (see usage examples below)

Usage: see the bottom of this file for examples.
*/

;(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory()
  } else if (typeof define === 'function' && define.amd) {
    define([], factory)
  } else {
    global.Quack = factory()
  }
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict'

  // --- Utilities ---
  const noop = () => {}

  function extend(a, b) {
    return Object.assign({}, a, b)
  }

  function now() {
    return Date.now()
  }

  function parseJSONSafe(s) {
    try {
      return JSON.parse(s)
    } catch (e) {
      return null
    }
  }

  // tiny EventEmitter
  class Emitter {
    constructor() {
      this._listeners = new Map()
    }
    on(event, fn) {
      if (!this._listeners.has(event)) this._listeners.set(event, [])
      this._listeners.get(event).push(fn)
      return () => this.off(event, fn)
    }
    off(event, fn) {
      if (!this._listeners.has(event)) return
      const list = this._listeners.get(event).filter(x => x !== fn)
      this._listeners.set(event, list)
    }
    emit(event, ...args) {
      const list = this._listeners.get(event) || []
      for (const fn of list.slice()) {
        try {
          fn(...args)
        } catch (e) {
          console.error('Quack event handler error', e)
        }
      }
    }
  }
  

  // --- Default CSS ---
  const CSS = `
.quack-container{position:fixed;right:16px;top:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;width:330px}
.quack-toast{position:relative;backdrop-filter:blur(4px);transition:.3s cubic-bezier(.2, .9, .3, 1.5);background:rgba(255,255,255,.7);padding:15px 15px 15px 20px;border-radius:10px;box-shadow:0 0 12px #999;color:#fff;opacity:.97;display:flex;flex-direction:column;gap:8px}
.quack-toast:hover{transform:scale(1.02)}
.quack-toast .quack-title{opacity:.95;font-weight:500;font-size:1.1rem;color:#324179}
.quack-toast .quack-body{opacity:.9;font-weight:400;font-size:.9rem;color:#122771;word-wrap:break-word}
.quack-actions{position:absolute;right:1.2em;top:.9em}
.quack-btn{padding:0 4px 0 0;z-index:3;background:0 0;border:0;-webkit-appearance:none;color:#acacac!important;font-size:17px;font-weight:700;-webkit-text-shadow:0 1px 0 #fff;text-shadow:0 1px 0 #fff;opacity:.8;line-height:1;cursor:pointer}
.quack-btn:hover{text-decoration:none;opacity:.7;color:#647eda!important}
`;

  function injectCSS() {
    if (typeof document === 'undefined') return
    if (document.getElementById('quack-css')) return
    const s = document.createElement('style')
    s.id = 'quack-css'
    s.innerHTML = CSS
    document.head.appendChild(s)
  }

  // --- Quack class ---
  class Quack extends Emitter {
    /**
     * opts:
     *  - transport: 'ws'|'sse'|'poll'|'auto'
     *  - url: websocket/url for sse/poll
     *  - reconnect: true|false
     *  - reconMaxInterval: ms
     *  - reconMinInterval: ms
     *  - backoffFactor: number
     *  - container: DOM element or selector to mount UI
     *  - native: true|false (allow browser Notification API)
     *  - rateLimit: ms between shown toasts
     *  - maxToasts: number
     */
    constructor(opts = {}) {
      super()
      this.opts = extend({
        transport: 'auto',
        url: null,
        reconnect: true,
        reconMinInterval: 1000,
        reconMaxInterval: 30000,
        backoffFactor: 1.8,
        container: null,
        native: true,
        rateLimit: 400,
        maxToasts: 5,
        dedupWindow: 5000
      }, opts)

      this._state = {
        connected: false,
        transport: null,
        ws: null,
        sse: null,
        pollTimer: null,
        lastShownAt: 0,
        reconInterval: this.opts.reconMinInterval,
        closing: false,
        queue: [],
        recentIds: new Map() // id->timestamp for dedup
      }

      // UI
      injectCSS()
      this._mount(this.opts.container)

      if (this.opts.url) {
        // lazy connect: user must call connect(), or we can auto connect
      }

      // expose public methods binding
      this.connect = this.connect.bind(this)
      this.disconnect = this.disconnect.bind(this)
      this.send = this.send.bind(this)
      this.show = this.show.bind(this)
      this.requestPermission = this.requestPermission.bind(this)
    }

    _mount(container) {
      if (typeof document === 'undefined') return
      if (container) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container
      }
      if (!this.container) {
        this.container = document.createElement('div')
        this.container.className = 'quack-container'
        document.body.appendChild(this.container)
      } else {
        if (!this.container.classList.contains('quack-container')) this.container.classList.add('quack-container')
      }
    }

    _addToast(node) {
      if (!this.container) return
      // enforce maxToasts
      while (this.container.children.length >= this.opts.maxToasts) {
        this.container.removeChild(this.container.lastChild)
      }
      this.container.insertBefore(node, this.container.firstChild)
    }

    _makeToast(notification) {
      const el = document.createElement('div')
      el.className = 'quack-toast'
      el.setAttribute('role', 'status')

      const content = document.createElement('div')

      const title = document.createElement('div')
      title.className = 'quack-title'
      title.textContent = notification.title || 'Notification'

      const body = document.createElement('div')
      body.className = 'quack-body'
      body.textContent = notification.body || ''

      content.appendChild(title)
      content.appendChild(body)

      el.appendChild(content)

      const actions = document.createElement('div')
      actions.className = 'quack-actions'

      if (notification.actions && Array.isArray(notification.actions)) {
        for (const a of notification.actions) {
          const btn = document.createElement('button')
          btn.className = 'quack-btn'
          btn.textContent = a.label || 'OK'
          btn.onclick = (e) => {
            try {
              if (typeof a.onClick === 'function') a.onClick(notification)
              this.emit('action', a.action || null, notification)
            } catch (err) {}
          }
          actions.appendChild(btn)
        }
      }

      const closeBtn = document.createElement('button')
      closeBtn.className = 'quack-btn quack-muted'
      closeBtn.textContent = '✕'
      closeBtn.onclick = () => el.remove()
      actions.appendChild(closeBtn)

      el.appendChild(actions)

      // auto-dismiss
      const duration = (notification.duration === undefined) ? 7000 : notification.duration
      if (duration > 0) setTimeout(() => el.remove(), duration)

      return el
    }

    _shouldShowToast(notification) {
      const nowT = now()
      if (nowT - this._state.lastShownAt < this.opts.rateLimit) return false
      // dedup by id
      if (notification.id) {
        const prev = this._state.recentIds.get(notification.id)
        if (prev && nowT - prev < this.opts.dedupWindow) return false
        this._state.recentIds.set(notification.id, nowT)
        // cleanup map keys older than dedupWindow
        for (const [k, t] of this._state.recentIds) {
          if (nowT - t > this.opts.dedupWindow) this._state.recentIds.delete(k)
        }
      }
      this._state.lastShownAt = nowT
      return true
    }

    async show(notification = {}) {
      // accept string shorthand
      if (typeof notification === 'string') notification = { body: notification }

      // native notification
      const nativeAllowed = this.opts.native && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
      try {
        if (nativeAllowed) {
          const n = new Notification(notification.title || '', { body: notification.body || '', data: notification })
          n.onclick = () => this.emit('click', notification)
        }
      } catch (e) {
        // ignore
      }

      // DOM toast
      if (!this._shouldShowToast(notification)) return false
      const node = this._makeToast(notification)
      this._addToast(node)
      this.emit('show', notification)
      return true
    }

    requestPermission() {
      if (typeof window === 'undefined' || !('Notification' in window)) return Promise.resolve('unsupported')
      if (Notification.permission === 'granted') return Promise.resolve('granted')
      if (Notification.permission === 'denied') return Promise.resolve('denied')
      return Notification.requestPermission()
    }

    // --- Transport management ---
    connect(url, opts = {}) {
      if (!url && !this.opts.url) throw new Error('Quack: missing url')
      this.opts.url = url || this.opts.url
      this.opts = extend(this.opts, opts)
      this._state.closing = false
      this._chooseTransportAndConnect()
    }

    disconnect() {
      this._state.closing = true
      this.opts.reconnect = false
      this._state.recentIds.clear()
      if (this._state.ws) {
        try { this._state.ws.close() } catch (e) {}
        this._state.ws = null
      }
      if (this._state.sse) {
        try { this._state.sse.close() } catch (e) {}
        this._state.sse = null
      }
      if (this._state.pollTimer) {
        clearInterval(this._state.pollTimer)
        this._state.pollTimer = null
      }
      this._state.connected = false
      this.emit('disconnect')
    }

    send(obj) {
      if (this._state.ws && this._state.connected) {
        try { this._state.ws.send(JSON.stringify(obj)) } catch (e) { console.warn('send failed', e) }
      } else {
        console.warn('Quack: not connected, cannot send')
      }
    }

    _chooseTransportAndConnect() {
      const t = this.opts.transport
      if (t === 'auto') {
        // try WebSocket first
        this._connectWS()
      } else if (t === 'ws') {
        this._connectWS()
      } else if (t === 'sse') {
        this._connectSSE()
      } else if (t === 'poll') {
        this._connectPoll()
      } else {
        this._connectWS()
      }
    }

    _connectWS() {
	  if (typeof WebSocket === 'undefined') {
		// fallback
		return this._connectSSE()
	  }
	  try {
		const ws = new WebSocket(this.opts.url)
		this._state.ws = ws

		ws.onopen = () => {
		  //console.log('Connected to Quack Server')
		  this._state.connected = true
		  this._state.transport = 'ws'
		  this._state.reconInterval = this.opts.reconMinInterval
		  this.emit('connect', { transport: 'ws' })

		  // 🔐 Отправляем токен, если есть
		  if (this.opts.login) {
			ws.send(JSON.stringify({
			  type: 'auth',
			  login: this.opts.login
			}))
			//console.log('🔑 login sent:', this.opts.login)
		  }
		}

		ws.onmessage = (ev) => this._handleIncoming(ev.data)

		ws.onclose = () => {
		  this._state.connected = false
		  this.emit('disconnect')
		  this._state.ws = null
		  if (this.opts.reconnect && !this._state.closing)
			this._reconnectWithBackoff(this._connectWS.bind(this))
		}

		ws.onerror = (e) => {
		  this.emit('error', e)
		}

	  } catch (e) {
		this.emit('error', e)
		this._connectSSE()
	  }
	}


    _connectSSE() {
      if (typeof EventSource === 'undefined') return this._connectPoll()
      try {
        const sse = new EventSource(this.opts.url)
        this._state.sse = sse
        sse.onopen = () => {
          this._state.connected = true
          this._state.transport = 'sse'
          this._state.reconInterval = this.opts.reconMinInterval
          this.emit('connect', { transport: 'sse' })
        }
        sse.onmessage = (ev) => this._handleIncoming(ev.data)
        sse.onerror = (e) => {
          this._state.connected = false
          this.emit('error', e)
          if (this.opts.reconnect && !this._state.closing) this._reconnectWithBackoff(this._connectSSE.bind(this))
        }
      } catch (e) {
        this.emit('error', e)
        this._connectPoll()
      }
    }

    _connectPoll() {
      // pull-based fallback — url expected to return JSON array of notifications
      if (this._state.pollTimer) clearInterval(this._state.pollTimer)
      const fn = async () => {
        try {
          const res = await fetch(this.opts.url)
          if (!res.ok) throw new Error('poll failed')
          const data = await res.json()
          if (Array.isArray(data)) {
            for (const item of data) this._handleIncoming(item)
          } else if (data) {
            this._handleIncoming(data)
          }
          this._state.connected = true
          this._state.transport = 'poll'
          this.emit('connect', { transport: 'poll' })
        } catch (e) {
          this._state.connected = false
          this.emit('error', e)
        }
      }
      // first call immediately, then interval
      fn()
      this._state.pollTimer = setInterval(fn, Math.max(2000, this.opts.reconMinInterval))
    }

    _reconnectWithBackoff(fn) {
      const t = Math.min(this._state.reconInterval * this.opts.backoffFactor, this.opts.reconMaxInterval)
      const when = this._state.reconInterval
      setTimeout(() => fn(), when)
      this._state.reconInterval = Math.min(t, this.opts.reconMaxInterval)
      // note: exponential growth, reset when successful
    }

    _handleIncoming(raw) {
      let obj = raw
      if (typeof raw === 'string') {
        // try parse JSON; if fails, treat as text
        const parsed = parseJSONSafe(raw)
        obj = parsed || { body: raw }
      }

      // if poll returns array
      if (Array.isArray(obj)) {
        for (const item of obj) this._onNotification(item)
      } else {
        this._onNotification(obj)
      }
    }

    _onNotification(notification) {
      // support server-sent canonical shape: { id, title, body, data, actions, silent, duration }
      // allow string body
      if (!notification) return
      if (typeof notification === 'string') notification = { body: notification }

      // enqueue or show immediately depending on throttle
      if (this._state.queue.length > 0) {
        this._state.queue.push(notification)
      } else {
        const shown = this.show(notification)
        if (!shown) this._state.queue.push(notification)
      }

      // attempt to flush queue periodically
      this._tryFlushQueue()

      this.emit('notification', notification)
    }

    _tryFlushQueue() {
      if (this._state._flushTimer) return
      this._state._flushTimer = setTimeout(() => {
        this._state._flushTimer = null
        const q = this._state.queue.slice()
        this._state.queue = []
        for (const n of q) this.show(n)
      }, this.opts.rateLimit)
    }
  }

  // Expose a helper to create UMD/ESM friendly default
  return Quack
});

// --------------------
// Usage examples (copy to your app):
// ESM
// import Quack from './quack.js' // or from CDN
// const q = new Quack({ url: 'wss://example.com/notifications', transport: 'auto' })
// q.connect()
// q.on('connect', info => console.log('connected', info))
// q.on('notification', n => console.log('got', n))
// q.show({ title:'Hi', body:'Hello world' })

// UMD (browser):
// <script src="quack.js"></script>
// <script>
//   const q = new window.Quack({ url: 'wss://example.com/notifications' })
//   q.connect()
//   q.on('notification', n => q.show(n))
// </script>

// --- Simple Node.js WebSocket server example (server should send messages as JSON) ---
// const WebSocket = require('ws')
// const wss = new WebSocket.Server({ port: 8080 })
// wss.on('connection', function connection(ws) {
//   console.log('client connected')
//   setInterval(() => {
//     const msg = JSON.stringify({ id: String(Math.random()), title: 'New message', body: 'Notification ' + new Date().toLocaleTimeString() })
//     ws.send(msg)
//   }, 10000)
// })

/*
API Reference
 - new Quack(opts)
   - opts.url (string) — WebSocket/SSE/poll URL
   - opts.transport: 'auto'|'ws'|'sse'|'poll'
   - opts.reconnect: boolean
   - opts.reconMinInterval, reconMaxInterval, backoffFactor
   - opts.container: selector or DOM element
   - opts.native: enable browser Notification API
   - opts.rateLimit: ms between toasts
   - opts.maxToasts: number

 - q.connect(url, opts) — connect to a server (url optional if provided in constructor)
 - q.disconnect() — disconnect transports
 - q.send(obj) — send object to server over websocket (if connected)
 - q.show(notification) — show a local notification object or string
 - q.requestPermission() — ask user for native notification permission

Events:
 - 'connect' => { transport }
 - 'disconnect'
 - 'error' => Error
 - 'notification' => raw notification object received from server
 - 'show' => notification just shown in UI
 - 'click' => user clicked native notification
 - 'action' => (actionId, notification)

Notification shape (recommended):
 { id?: string, title?: string, body?: string, data?: any, actions?: [{ label, action, onClick }], silent?: boolean, duration?: ms }
*/
