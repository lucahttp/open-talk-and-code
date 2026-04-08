import { useRef, useState, useEffect } from 'react';

export const ChatLog = ({ messages, isProcessing, activity, streamingContent }) => {
  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)
  const [expandedReasoning, setExpandedReasoning] = useState(new Set())

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages, streamingContent, activity])

  // Check if last message is from user (waiting for response)
  const lastMessageIsUser = messages.length > 0 && messages[messages.length - 1]?.role === 'user'

  // Check if we have a streaming message
  const lastMessage = messages[messages.length - 1]
  const isStreaming = lastMessage?.streaming || (isProcessing && streamingContent)

  // Get detailed status message
  const getStatusMessage = () => {
    if (activity) {
      return activity.message;
    }
    if (isProcessing || lastMessageIsUser) {
      return 'Processing request...';
    }
    return null;
  };

  const statusMessage = getStatusMessage();

  // Toggle reasoning visibility
  const toggleReasoning = (msgId) => {
    setExpandedReasoning(prev => {
      const newSet = new Set(prev)
      if (newSet.has(msgId)) {
        newSet.delete(msgId)
      } else {
        newSet.add(msgId)
      }
      return newSet
    })
  }

  // Extract reasoning text from parts
  const getReasoningText = (parts) => {
    if (!parts) return ''
    return parts
      .filter(p => p.type === 'reasoning')
      .map(p => p.reasoning || p.text || '')
      .join(' ')
  }

  return (
    <div
      ref={containerRef}
      className="border border-gray-600 p-2 mb-4 bg-black flex-1 overflow-y-auto min-h-0"
    >
      <div className="text-xs text-terminal mb-2 pb-1 border-b border-gray-600 sticky top-0 bg-black">
        ┌─ CHAT LOG ({messages.length} messages) ─┐
      </div>
      <div className="space-y-3">
        {messages.length === 0 ? (
          <div className="text-xs text-gray-500 italic text-center py-8">
            Say &quot;Hey Buddy&quot; to start a conversation
          </div>
        ) : (
          messages.map((m, i) => {
            const reasoningText = getReasoningText(m.parts)
            const hasReasoning = reasoningText.length > 0
            const isExpanded = expandedReasoning.has(m.id)
            const isWebSocket = m.source === 'websocket'

            return (
              <div
                key={m.id || `msg_${i}`}
                className="text-xs animate-in fade-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className={`font-bold ${m.role === 'user' ? 'text-terminal' : isWebSocket ? 'text-purple-400' : 'text-cyan-400'}`}>
                  {m.role === 'user' ? '> YOU' : isWebSocket ? '📡 LIVE:' : 'AI:'}
                </div>
                <div className={`pl-2 ${m.role === 'user' ? 'text-terminal' : isWebSocket ? 'text-purple-300' : 'text-gray-300'} whitespace-pre-wrap font-mono leading-relaxed`}>
                  {/* For the last assistant message during streaming, show streamingContent */}
                  {m.role === 'assistant' && i === messages.length - 1 && streamingContent && !isWebSocket
                    ? <>{streamingContent}<span className="animate-pulse">▌</span></>
                    : (m.content || '')
                  }
                </div>

                {/* Expandable reasoning section */}
                {hasReasoning && (
                  <div className="mt-1">
                    <button
                      onClick={() => toggleReasoning(m.id)}
                      className="pl-2 text-xs text-gray-500 hover:text-terminal flex items-center gap-1 transition-colors"
                    >
                      <span>{isExpanded ? '▼' : '▶'}</span>
                      <span className="italic">
                        {isExpanded ? 'Hide thinking process' : 'Show thinking process'}
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="ml-4 mt-1 pl-2 border-l-2 border-gray-600 text-gray-500 italic whitespace-pre-wrap">
                        {reasoningText}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
        
        {/* Status indicator */}
        {(isProcessing || isStreaming) && (
          <div className="border border-terminal/30 bg-terminal/5 p-2">
            <div className="text-xs text-terminal flex items-center gap-2">
               <span className="animate-pulse">⚡</span>
               <span className="font-mono">{statusMessage || 'Generating...'}</span>
               <span className="inline-flex">
                 <span className="animate-bounce">.</span>
                 <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
                 <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
               </span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
