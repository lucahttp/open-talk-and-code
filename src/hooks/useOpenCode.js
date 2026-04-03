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
      const handleEvent = (event) => {
        console.log('SSE Event:', event.type, event)
        
        // Handle different event types
        switch (event.type) {
          case 'message.updated':
            if (event.properties?.sessionID === selectedSession?.id) {
              setMessages(prev => {
                // Check if message already exists
                const exists = prev.find(m => m.id === event.properties.info?.id)
                if (exists) {
                  return prev.map(m => m.id === event.properties.info?.id 
                    ? { ...m, ...event.properties.info }
                    : m
                  )
                }
                return [...prev, {
                  id: event.properties.info?.id,
                  role: event.properties.info?.role,
                  content: event.properties.info?.content || '',
                  parts: event.properties.parts || [],
                  time: event.properties.info?.time
                }]
              })
            }
            break
            
          case 'session.created':
            setSessions(prev => [...prev, event.properties.info])
            break
            
          case 'session.updated':
            setSessions(prev => prev.map(s => 
              s.id === event.properties.info?.id 
                ? { ...s, ...event.properties.info }
                : s
            ))
            break
            
          case 'session.status':
            // Update session status
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
  }, [selectedSession])

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
      // Add user message to UI immediately
      const userMsg = {
        id: `temp_${Date.now()}`,
        role: 'user',
        content,
        time: { created: Date.now() }
      }
      setMessages(prev => [...prev, userMsg])
      
      // Send to OpenCode
      const response = await api.sendMessage(selectedSession.id, {
        parts: [{ type: 'text', text: content }]
      })
      
      // Remove temp message and add real one when it arrives via SSE
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
      
      return response
    } catch (err) {
      console.error('Failed to send message:', err)
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
