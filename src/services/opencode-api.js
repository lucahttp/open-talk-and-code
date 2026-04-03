/**
 * OpenCode API Client
 * HTTP client for OpenCode server REST API
 */

const BASE_URL = 'http://localhost:4096'

class OpenCodeAPI {
  constructor(baseUrl = BASE_URL) {
    this.baseUrl = baseUrl
    this.eventSource = null
    this.eventListeners = new Map()
  }

  // Health check
  async health() {
    const res = await fetch(`${this.baseUrl}/global/health`)
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
    return res.json()
  }

  // Sessions
  async listSessions() {
    const res = await fetch(`${this.baseUrl}/session`)
    if (!res.ok) throw new Error(`Failed to list sessions: ${res.status}`)
    return res.json()
  }

  async createSession({ parentID, title } = {}) {
    const res = await fetch(`${this.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentID, title })
    })
    if (!res.ok) throw new Error(`Failed to create session: ${res.status}`)
    return res.json()
  }

  async getSession(id) {
    const res = await fetch(`${this.baseUrl}/session/${id}`)
    if (!res.ok) throw new Error(`Failed to get session: ${res.status}`)
    return res.json()
  }

  // Messages
  async sendMessage(sessionId, { message, model, agent, system, tools, parts }) {
    console.log('[OpenCode API] POST /session/' + sessionId + '/message', { message: message?.substring(0, 50), parts })
    const res = await fetch(`${this.baseUrl}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, model, agent, system, tools, parts })
    })
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      console.error('[OpenCode API] sendMessage failed:', res.status, errorText)
      throw new Error(`Failed to send message: ${res.status} - ${errorText}`)
    }
    const data = await res.json()
    console.log('[OpenCode API] sendMessage response:', data)
    return data
  }

  async executeCommand(sessionId, { command, arguments: args, agent, model, messageID }) {
    const res = await fetch(`${this.baseUrl}/session/${sessionId}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, arguments: args, agent, model, messageID })
    })
    if (!res.ok) throw new Error(`Failed to execute command: ${res.status}`)
    return res.json()
  }

  async listMessages(sessionId, limit = 50) {
    const res = await fetch(`${this.baseUrl}/session/${sessionId}/message?limit=${limit}`)
    if (!res.ok) throw new Error(`Failed to list messages: ${res.status}`)
    return res.json()
  }

  // TUI Control
  async appendPrompt(text) {
    const res = await fetch(`${this.baseUrl}/tui/append-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
    if (!res.ok) throw new Error(`Failed to append prompt: ${res.status}`)
    return res.json()
  }

  async submitPrompt() {
    const res = await fetch(`${this.baseUrl}/tui/submit-prompt`, { method: 'POST' })
    if (!res.ok) throw new Error(`Failed to submit prompt: ${res.status}`)
    return res.json()
  }

  async executeTUICommand(command) {
    const res = await fetch(`${this.baseUrl}/tui/execute-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    })
    if (!res.ok) throw new Error(`Failed to execute TUI command: ${res.status}`)
    return res.json()
  }

  async showToast({ title, message, variant = 'info', duration = 5000 }) {
    const res = await fetch(`${this.baseUrl}/tui/show-toast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, variant, duration })
    })
    if (!res.ok) throw new Error(`Failed to show toast: ${res.status}`)
    return res.json()
  }

  // Global Events (SSE)
  connectEvents() {
    if (this.eventSource) {
      this.eventSource.close()
    }

    this.eventSource = new EventSource(`${this.baseUrl}/global/event`)

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this._emit(data.type, data)
      } catch (err) {
        console.error('Failed to parse SSE event:', err)
      }
    }

    this.eventSource.onerror = (err) => {
      console.error('SSE error:', err)
      this._emit('error', err)
    }

    this.eventSource.onopen = () => {
      console.log('SSE connected')
      this._emit('connected', {})
    }
  }

  disconnectEvents() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }

  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event).add(callback)
  }

  off(event, callback) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).delete(callback)
    }
  }

  _emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(cb => cb(data))
    }
    // Also emit to wildcard listeners
    if (this.eventListeners.has('*')) {
      this.eventListeners.get('*').forEach(cb => cb(event, data))
    }
  }

  // Config
  async getConfig() {
    const res = await fetch(`${this.baseUrl}/config`)
    if (!res.ok) throw new Error(`Failed to get config: ${res.status}`)
    return res.json()
  }

  async updateConfig(config) {
    const res = await fetch(`${this.baseUrl}/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    if (!res.ok) throw new Error(`Failed to update config: ${res.status}`)
    return res.json()
  }

  // Commands
  async listCommands() {
    const res = await fetch(`${this.baseUrl}/command`)
    if (!res.ok) throw new Error(`Failed to list commands: ${res.status}`)
    return res.json()
  }
}

// Singleton instance
const api = new OpenCodeAPI()

export default api
export { OpenCodeAPI }
