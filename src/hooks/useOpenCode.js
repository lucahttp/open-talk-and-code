import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/opencode-api'

export function useOpenCode() {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [sessions, setSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [messages, setMessages] = useState([])
  const eventUnsubscribeRef = useRef(null)
  const selectedSessionRef = useRef(null)
  
  // Keep ref in sync with state for event handlers
  useEffect(() => {
    selectedSessionRef.current = selectedSession
  }, [selectedSession])

  // Connect to OpenCode server
  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)
    
    try {
      // Health check
      const health = await api.health()
      console.log('OpenCode server:', health)
      
      // Load sessions
      const sessionList = await api.listSessions()
      setSessions(sessionList)
      
      // Connect to SSE
      api.connectEvents()
      
      // Listen for events
      const handleEvent = (type, data) => {
        // Handle both (type, data) and (data) signatures
        const event = data || type;
        const eventType = data ? type : event?.type;
        
        if (!event || !eventType) {
          return;
        }
        
        console.log('SSE Event:', eventType, event)
        
        // Get current session from ref (not stale closure)
        const currentSession = selectedSessionRef.current
        
        // Handle different event types
        switch (eventType) {
          case 'message.created':
          case 'message.updated':
            // Check if message belongs to current session
            const sessionID = event.properties?.sessionID || event.properties?.info?.sessionID
            if (sessionID === currentSession?.id) {
              setMessages(prev => {
                const msgId = event.properties?.info?.id || event.properties?.id
                const existingIndex = prev.findIndex(m => m.id === msgId)
                
                const newMessage = {
                  id: msgId,
                  role: event.properties?.info?.role || event.properties?.role,
                  content: event.properties?.info?.content || event.properties?.content || '',
                  parts: event.properties?.parts || event.properties?.info?.parts || [],
                  time: event.properties?.info?.time || event.properties?.time || { created: Date.now() }
                }
                
                if (existingIndex >= 0) {
                  // Update existing message
                  const newMessages = [...prev]
                  newMessages[existingIndex] = { ...newMessages[existingIndex], ...newMessage }
                  return newMessages
                } else {
                  // Add new message
                  return [...prev, newMessage]
                }
              })
            }
            break
            
          case 'session.created':
            setSessions(prev => {
              const exists = prev.find(s => s.id === event.properties?.info?.id)
              if (exists) return prev
              return [...prev, event.properties?.info]
            })
            break
            
          case 'session.updated':
            setSessions(prev => prev.map(s => 
              s.id === event.properties?.info?.id 
                ? { ...s, ...event.properties?.info }
                : s
            ))
            break
            
          case 'session.status':
            // Update session status if needed
            break
            
          case 'session.idle':
            // Session completed
            break
        }
      }
      
      api.on('*', handleEvent)
      eventUnsubscribeRef.current = () => api.off('*', handleEvent)
      
      setConnected(true)
    } catch (err) {
      console.error('Failed to connect:', err)
      setError(err.message)
      setConnected(false)
    } finally {
      setConnecting(false)
    }
  }, []) // No dependencies - uses ref for current session

  // Disconnect
  const disconnect = useCallback(() => {
    if (eventUnsubscribeRef.current) {
      eventUnsubscribeRef.current()
    }
    api.disconnectEvents()
    setConnected(false)
    setSessions([])
    setSelectedSession(null)
    setMessages([])
  }, [])

  // Create new session
  const createSession = useCallback(async (title) => {
    try {
      const session = await api.createSession({ title })
      setSessions(prev => [...prev, session])
      setSelectedSession(session)
      
      // Load messages for new session
      const msgs = await api.listMessages(session.id)
      setMessages(msgs)
      
      return session
    } catch (err) {
      console.error('Failed to create session:', err)
      throw err
    }
  }, [])

  // Select session
  const selectSession = useCallback(async (sessionId) => {
    const session = sessions.find(s => s.id === sessionId)
    if (session) {
      setSelectedSession(session)
      
      // Load messages
      try {
        const msgs = await api.listMessages(sessionId)
        setMessages(msgs)
      } catch (err) {
        console.error('Failed to load messages:', err)
      }
    }
  }, [sessions])

  // Send message to session
  const sendMessage = useCallback(async (content) => {
    if (!selectedSession) {
      throw new Error('No session selected')
    }
    
    try {
      // Add user message to UI immediately (optimistic update)
      const tempId = `temp_${Date.now()}`
      const userMsg = {
        id: tempId,
        role: 'user',
        content,
        time: { created: Date.now() }
      }
      setMessages(prev => [...prev, userMsg])
      
      // Send to OpenCode
      await api.sendMessage(selectedSession.id, {
        message: content,
        parts: [{ type: 'text', text: content }]
      })
      
      // The real message will arrive via SSE and replace/update the temp one
      // We keep the temp message so the UI doesn't flicker
      
    } catch (err) {
      console.error('Failed to send message:', err)
      // Remove temp message on error
      setMessages(prev => prev.filter(m => m.id !== tempId))
      throw err
    }
  }, [selectedSession])

  // Execute slash command
  const executeCommand = useCallback(async (command, args = {}) => {
    if (!selectedSession) {
      throw new Error('No session selected')
    }
    
    try {
      const response = await api.executeCommand(selectedSession.id, {
        command,
        arguments: args
      })
      
      return response
    } catch (err) {
      console.error('Failed to execute command:', err)
      throw err
    }
  }, [selectedSession])

  // Auto-connect on mount
  useEffect(() => {
    connect()
    
    return () => {
      disconnect()
    }
  }, []) // Only on mount

  return {
    connected,
    connecting,
    error,
    sessions,
    selectedSession,
    messages,
    connect,
    disconnect,
    createSession,
    selectSession,
    sendMessage,
    executeCommand
  }
}
