import { useState, useCallback } from 'react'

export type EditorType = 'vscode' | 'cursor' | 'zed' | 'sublime' | 'webstorm' | 'idea'
export type DiffStyle = 'split' | 'unified'

export interface DifferConfig {
  editor: EditorType
  diffStyle: DiffStyle
  port: number
  autoOpen: boolean
  largeFileThreshold: number
}

// Injected by server into HTML - available synchronously
declare global {
  interface Window {
    __DIFFER__?: {
      config: DifferConfig
      repoPath: string
    }
  }
}

// Default config for dev mode (when not served by differ server)
const DEFAULT_CONFIG: DifferConfig = {
  editor: 'vscode',
  diffStyle: 'split',
  port: 0,
  autoOpen: true,
  largeFileThreshold: 50000,
}

// Read initial state synchronously from injected data
function getInitialState() {
  const injected = window.__DIFFER__
  return {
    config: injected?.config ?? DEFAULT_CONFIG,
    repoPath: injected?.repoPath ?? null,
  }
}

export function useConfig() {
  const initial = getInitialState()
  const [config, setConfig] = useState<DifferConfig>(initial.config)
  const repoPath = initial.repoPath // repoPath doesn't change at runtime

  // Update config (saves to server)
  const updateConfig = useCallback(
    async (updates: Partial<DifferConfig>, saveGlobal = false) => {
      // Optimistically update local state
      setConfig((prev) => ({ ...prev, ...updates }))

      try {
        const response = await fetch('/api/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates, global: saveGlobal }),
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to save config')
        }
        if (data.config) {
          setConfig(data.config)
        }
        return data
      } catch (err) {
        // Revert on error
        setConfig(initial.config)
        throw err
      }
    },
    [initial.config]
  )

  return {
    config,
    repoPath,
    updateConfig,
  }
}
