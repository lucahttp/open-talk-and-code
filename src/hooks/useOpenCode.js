import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/opencode-api'

export function useOpenCode() {
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)
  const [sessions, setSessions] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [activity, setActivity] = useState(null) // Current activity/status
  const [isProcessing, setIsProcessing] = useState(false)
  const [streamingContent, setStreamingContent] = useState('') // Accumulated streaming content
  const eventUnsubscribeRef = useRef(null)
  const selectedSessionRef = useRef(null)
  const streamingPartsRef = useRef({}) // Store parts per message ID
  
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

        // Get current session from ref (not stale closure)
        const currentSession = selectedSessionRef.current

        // Parse event according to OpenAPI schema: { type: "...", properties: { sessionID, info/part } }
        const props = event.properties || {}
        const sessionID = props.sessionID
        const isCurrentSession = sessionID === currentSession?.id

        // Only log for message-related events to reduce noise
        const isMessageEvent = eventType.startsWith('message.') || eventType.startsWith('session.')
        if (isMessageEvent) {
          console.log(`[OpenCode SSE] ${eventType}`, { sessionID, currentSession: currentSession?.id, match: isCurrentSession })
        }

        // Handle different event types
        switch (eventType) {
          case 'message.created':
            if (isCurrentSession) {
              setIsProcessing(true)
              setStreamingContent('') // Reset streaming
              streamingPartsRef.current = {} // Reset parts
              setActivity({
                type: 'thinking',
                message: 'Initializing response...',
                timestamp: Date.now()
              })
            }
            break

          case 'message.part.updated':
            // This is the main streaming event - individual part updates
            if (!isCurrentSession) break

            const part = props.part
            if (!part) {
              console.log('[OpenCode] message.part.updated - no part data')
              break
            }

            const msgId = part.messageID
            if (!msgId) {
              console.log('[OpenCode] message.part.updated - no messageID in part')
              break
            }

            console.log('[OpenCode] Part update:', part.type, 'for message:', msgId)

            // Initialize parts array for this message
            if (!streamingPartsRef.current[msgId]) {
              streamingPartsRef.current[msgId] = []
            }

            // Add or update the part
            const existingIndex = streamingPartsRef.current[msgId].findIndex(
              p => p.id === part.id
            )
            if (existingIndex >= 0) {
              // Update existing part
              streamingPartsRef.current[msgId][existingIndex] = part
            } else {
              // Add new part
              streamingPartsRef.current[msgId].push(part)
            }

            // Build streaming content from parts - show text as it arrives
            const streamingParts = streamingPartsRef.current[msgId]
            const accumulatedContent = streamingParts
              .filter(p => p.type === 'text' || p.type === 'reasoning')
              .map(p => p.text || '')
              .join('')

            // Update streaming content immediately for real-time display
            setStreamingContent(accumulatedContent)
            console.log('[OpenCode] Streaming content updated:', accumulatedContent.substring(0, 50) + '...')

            // Update activity based on part type
            switch (part.type) {
              case 'step-start':
                setActivity({ type: 'thinking', message: 'Starting to process...', timestamp: Date.now() })
                break
              case 'reasoning':
                setActivity({ type: 'thinking', message: 'Thinking...', timestamp: Date.now() })
                break
              case 'text':
                setActivity({ type: 'generating', message: 'Generating response...', timestamp: Date.now() })
                break
              case 'step-finish':
                setIsProcessing(false)
                setActivity(null)
                break
            }

            // Update the message in the list
            setMessages(prev => {
              const existingIndex = prev.findIndex(m => m.id === msgId)
              const content = streamingParts
                .filter(p => p.type === 'text' || p.type === 'reasoning')
                .map(p => p.text || '')
                .join('')

              const newMessage = {
                id: msgId,
                role: 'assistant',
                content,
                parts: streamingParts,
                streaming: part.type !== 'step-finish',
                time: { created: Date.now() }
              }

              if (existingIndex >= 0) {
                const newMessages = [...prev]
                newMessages[existingIndex] = { ...newMessages[existingIndex], ...newMessage }
                return newMessages
              } else {
                return [...prev, newMessage]
              }
            })
            break

          case 'message.updated':
            // Full message update - contains the complete message with all parts
            if (!isCurrentSession) break

            const msgInfo = props.info
            if (!msgInfo?.id) {
              console.log('[OpenCode] message.updated - no message info or ID')
              break
            }

            const fullMsgId = msgInfo.id
            console.log('[OpenCode] Full message update:', fullMsgId, 'role:', msgInfo.role, 'parts:', msgInfo.parts?.length || 0)

            // If the message has parts, sync our streaming parts
            if (msgInfo.parts && msgInfo.parts.length > 0) {
              streamingPartsRef.current[fullMsgId] = msgInfo.parts

              const fullContent = msgInfo.parts
                .filter(p => p.type === 'text' || p.type === 'reasoning')
                .map(p => p.text || '')
                .join('')

              setStreamingContent(fullContent)
            }

            // Check if message is finished
            if (msgInfo.finish || msgInfo.status === 'completed') {
              setIsProcessing(false)
              setActivity(null)
              setStreamingContent('')
            }

            // Update or add the message
            setMessages(prev => {
              const existingIndex = prev.findIndex(m => m.id === fullMsgId)
              const parts = streamingPartsRef.current[fullMsgId] || msgInfo.parts || []
              const content = parts
                .filter(p => p.type === 'text' || p.type === 'reasoning')
                .map(p => p.text || '')
                .join('')

              const newMessage = {
                id: fullMsgId,
                role: msgInfo.role || 'assistant',
                content,
                parts,
                streaming: !msgInfo.finish && msgInfo.status !== 'completed',
                time: msgInfo.time || { created: Date.now() },
                status: msgInfo.status,
                finish: msgInfo.finish
              }

              if (existingIndex >= 0) {
                const newMessages = [...prev]
                newMessages[existingIndex] = { ...newMessages[existingIndex], ...newMessage }
                return newMessages
              } else {
                return [...prev, newMessage]
              }
            })
            break
            
          case 'tool.execution.started':
            if (isCurrentSession) {
              const toolName = event.properties?.tool?.name || event.properties?.name
              setActivity({
                type: 'tool',
                message: `Running tool: ${toolName}...`,
                details: event.properties,
                timestamp: Date.now()
              })
            }
            break
            
          case 'tool.execution.completed':
          case 'tool.execution.failed':
            if (isCurrentSession) {
              const toolName = event.properties?.tool?.name || event.properties?.name
              const status = eventType === 'tool.execution.completed' ? 'completed' : 'failed'
              setActivity({
                type: 'tool',
                message: `Tool ${toolName} ${status}`,
                details: event.properties,
                timestamp: Date.now()
              })
            }
            break
            
          case 'command.execution.started':
            if (isCurrentSession) {
              const command = event.properties?.command || event.properties?.input?.command
              setActivity({
                type: 'command',
                message: `Executing: ${command}...`,
                details: event.properties,
                timestamp: Date.now()
              })
            }
            break
            
          case 'command.execution.completed':
            if (isCurrentSession) {
              const command = event.properties?.command || event.properties?.input?.command
              setActivity({
                type: 'command',
                message: `Command completed: ${command}`,
                details: event.properties,
                timestamp: Date.now()
              })
              // Keep showing for 2 seconds then clear
              setTimeout(() => {
                setActivity(prev => {
                  if (prev?.timestamp === Date.now() - 2000) return null
                  return prev
                })
              }, 2000)
            }
            break
            
          case 'session.status':
            const status = event.properties?.status
            if (status === 'processing') {
              setIsProcessing(true)
              setActivity({
                type: 'session',
                message: 'Processing request...',
                timestamp: Date.now()
              })
            } else if (status === 'idle') {
              setIsProcessing(false)
              setActivity(null)
              setStreamingContent('')
            }
            break
            
          case 'session.idle':
            setIsProcessing(false)
            setActivity(null)
            setStreamingContent('')
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
    setActivity(null)
    setIsProcessing(false)
    setStreamingContent('')
    streamingPartsRef.current = {}
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
      setActivity(null)
      setIsProcessing(false)
      setStreamingContent('')
      streamingPartsRef.current = {}
      
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
  const sendMessage = useCallback(async (content, options = {}) => {
    const targetSessionId = options.sessionId || selectedSession?.id
    
    if (!targetSessionId) {
      throw new Error('No session selected')
    }

    console.log('[OpenCode] Sending message to session:', targetSessionId, 'content:', content.substring(0, 50))

    const tempId = `temp_${Date.now()}`

    try {
      // Add user message to UI immediately (optimistic update)
      const userMsg = {
        id: tempId,
        role: 'user',
        content,
        time: { created: Date.now() }
      }
      setMessages(prev => [...prev, userMsg])

      // Set processing state
      setIsProcessing(true)
      setStreamingContent('') // Reset streaming
      streamingPartsRef.current = {} // Reset parts
      setActivity({
        type: 'sending',
        message: 'Sending message...',
        timestamp: Date.now()
      })

      // Send to OpenCode
      const response = await api.sendMessage(targetSessionId, {
        message: content,
        parts: [{ type: 'text', text: content }]
      })

      console.log('[OpenCode] Message sent successfully, response:', response)

    } catch (err) {
      console.error('[OpenCode] Failed to send message:', err)
      // Remove temp message on error
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setIsProcessing(false)
      setActivity(null)
      setStreamingContent('')
      throw err
    }
  }, [selectedSession])

  // Execute slash command
  const executeCommand = useCallback(async (command, args = {}) => {
    if (!selectedSession) {
      throw new Error('No session selected')
    }
    
    try {
      setIsProcessing(true)
      setActivity({
        type: 'command',
        message: `Executing ${command}...`,
        timestamp: Date.now()
      })
      
      const response = await api.executeCommand(selectedSession.id, {
        command,
        arguments: args
      })
      
      return response
    } catch (err) {
      console.error('Failed to execute command:', err)
      setIsProcessing(false)
      setActivity(null)
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
    activity,
    isProcessing,
    streamingContent,
    connect,
    disconnect,
    createSession,
    selectSession,
    sendMessage,
    executeCommand
  }
}
