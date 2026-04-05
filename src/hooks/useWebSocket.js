import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for WebSocket connection with auto-reconnect
 */
export function useWebSocket(url) {
    const [connected, setConnected] = useState(false);
    const [messages, setMessages] = useState([]);
    const [error, setError] = useState(null);
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const messageBufferRef = useRef([]);

    const connect = useCallback(() => {
        if (!url) {
            console.log('[WebSocket] No URL provided, skipping connection');
            return;
        }
        
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        try {
            console.log('[WebSocket] Connecting to:', url);
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('[WebSocket] Connected');
                setConnected(true);
                setError(null);
                
                // Send any buffered messages
                while (messageBufferRef.current.length > 0) {
                    const msg = messageBufferRef.current.shift();
                    ws.send(msg);
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('[WebSocket] Received:', data);
                    setMessages((prev) => [...prev, { ...data, timestamp: Date.now() }]);
                } catch (e) {
                    // If not JSON, treat as plain text
                    console.log('[WebSocket] Received (text):', event.data);
                    setMessages((prev) => [...prev, { 
                        text: event.data, 
                        timestamp: Date.now(),
                        type: 'text'
                    }]);
                }
            };

            ws.onerror = (err) => {
                console.error('[WebSocket] Error:', err);
                setError('WebSocket error occurred');
            };

            ws.onclose = () => {
                console.log('[WebSocket] Disconnected');
                setConnected(false);
                wsRef.current = null;
                
                // Auto-reconnect after 3 seconds
                reconnectTimeoutRef.current = setTimeout(() => {
                    console.log('[WebSocket] Attempting to reconnect...');
                    connect();
                }, 3000);
            };
        } catch (err) {
            console.error('[WebSocket] Failed to connect:', err);
            setError(err.message);
        }
    }, [url]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setConnected(false);
    }, []);

    const send = useCallback((data) => {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(message);
        } else {
            // Buffer the message for when connection is established
            messageBufferRef.current.push(message);
            console.log('[WebSocket] Message buffered (not connected)');
        }
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
    }, []);

    // Connect on mount, disconnect on unmount
    useEffect(() => {
        connect();
        
        return () => {
            disconnect();
        };
    }, [connect, disconnect]);

    return {
        connected,
        messages,
        error,
        connect,
        disconnect,
        send,
        clearMessages,
    };
}