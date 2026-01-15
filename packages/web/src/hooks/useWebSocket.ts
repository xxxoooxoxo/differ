import { useEffect, useRef, useState } from 'react'
import { subscribeToFileChanges, isTauri } from '../lib/api'

interface UseWebSocketReturn {
  isConnected: boolean
}

export function useWebSocket(onFileChange?: () => void): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false)
  const onFileChangeRef = useRef(onFileChange)

  // Keep callback ref updated without causing reconnects
  useEffect(() => {
    onFileChangeRef.current = onFileChange
  }, [onFileChange])

  useEffect(() => {
    let mounted = true
    let unsubscribe: (() => void) | null = null

    const connect = async () => {
      if (!mounted) return

      try {
        unsubscribe = await subscribeToFileChanges(() => {
          if (mounted && onFileChangeRef.current) {
            onFileChangeRef.current()
          }
        })

        if (mounted) {
          setIsConnected(true)
        }
      } catch {
        // Connection failed
        if (mounted) {
          setIsConnected(false)
        }
      }
    }

    connect()

    return () => {
      mounted = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [])

  return { isConnected }
}
