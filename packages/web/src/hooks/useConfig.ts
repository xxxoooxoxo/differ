import { useState, useCallback, useEffect } from 'react'
import {
  getConfig as apiGetConfig,
  setConfig as apiSetConfig,
  isTauri,
  selectDirectory,
  setRepoPath,
  type DifferConfig,
} from '../lib/api'

export type EditorType = 'vscode' | 'cursor' | 'zed' | 'sublime' | 'webstorm' | 'idea'
export type DiffStyle = 'split' | 'unified'

export type { DifferConfig }

// Injected by server into HTML - available synchronously (web mode only)
declare global {
  interface Window {
    __DIFFY__?: {
      config: DifferConfig
      repoPath: string
    }
  }
}

// Default config for dev mode (when not served by diffy server)
const DEFAULT_CONFIG: DifferConfig = {
  editor: 'vscode',
  diffStyle: 'split',
  port: 0,
  autoOpen: true,
  largeFileThreshold: 50000,
}

// Read initial state synchronously from injected data (web mode)
function getInitialState() {
  if (isTauri()) {
    return {
      config: DEFAULT_CONFIG,
      repoPath: null as string | null,
    }
  }
  const injected = window.__DIFFY__
  return {
    config: injected?.config ?? DEFAULT_CONFIG,
    repoPath: injected?.repoPath ?? null,
  }
}

export function useConfig() {
  const initial = getInitialState()
  const [config, setConfig] = useState<DifferConfig>(initial.config)
  const [repoPath, setRepoPathState] = useState<string | null>(initial.repoPath)
  const [loading, setLoading] = useState(isTauri())

  // Load config from Tauri on mount
  useEffect(() => {
    if (isTauri()) {
      apiGetConfig()
        .then(setConfig)
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [])

  // Update config (saves to server/Tauri)
  const updateConfig = useCallback(
    async (updates: Partial<DifferConfig>, saveGlobal = false) => {
      // Optimistically update local state
      setConfig((prev) => ({ ...prev, ...updates }))

      try {
        if (isTauri()) {
          await apiSetConfig(updates)
          return { config: { ...config, ...updates } }
        } else {
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
        }
      } catch (err) {
        // Revert on error
        setConfig(initial.config)
        throw err
      }
    },
    [config, initial.config]
  )

  // Select repository directory (Tauri only)
  const selectRepo = useCallback(async () => {
    if (!isTauri()) {
      console.warn('selectRepo is only available in Tauri mode')
      return null
    }

    const path = await selectDirectory()
    if (path) {
      await setRepoPath(path)
      setRepoPathState(path)
    }
    return path
  }, [])

  return {
    config,
    repoPath,
    loading,
    updateConfig,
    selectRepo,
  }
}
