import { useEffect, useRef, useState, useCallback } from 'react'

interface WebSocketMessage {
  type: string
  event?: string
  file?: string
  timestamp?: number
}

interface UseWebSocketReturn {
  isConnected: boolean
}

export function useWebSocket(onFileChange?: () => void): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onFileChangeRef = useRef(onFileChange)

  // Keep callback ref updated without causing reconnects
  useEffect(() => {
    onFileChangeRef.current = onFileChange
  }, [onFileChange])

  useEffect(() => {
    let mounted = true

    const connect = () => {
      if (!mounted) return

      // Clear any existing connection
      if (wsRef.current) {
        wsRef.current.close()
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws`

      try {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          if (mounted) {
            setIsConnected(true)
          }
        }

        ws.onclose = () => {
          if (mounted) {
            setIsConnected(false)
            // Reconnect after 3 seconds
            reconnectTimeoutRef.current = setTimeout(connect, 3000)
          }
        }

        ws.onerror = () => {
          ws.close()
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as WebSocketMessage
            if (message.type === 'change' && onFileChangeRef.current) {
              onFileChangeRef.current()
            }
          } catch {
            // Ignore invalid messages
          }
        }
      } catch {
        // Connection failed, retry after delay
        if (mounted) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000)
        }
      }
    }

    connect()

    // Ping interval to keep connection alive
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)

    return () => {
      mounted = false
      clearInterval(pingInterval)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, []) // Empty deps - only run once on mount

  return { isConnected }
}
