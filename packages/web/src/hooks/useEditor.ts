import { useState, useCallback } from 'react'
import { useConfig, type EditorType } from './useConfig'
import { openInEditor as apiOpenInEditor, isTauri } from '../lib/api'

export type { EditorType } from './useConfig'

interface EditorConfig {
  name: string
  buildUrl: (absolutePath: string, line?: number, column?: number) => string
}

const EDITORS: Record<EditorType, EditorConfig> = {
  vscode: {
    name: 'VS Code',
    buildUrl: (path, line, col) => {
      const location = line ? `:${line}${col ? `:${col}` : ''}` : ''
      return `vscode://file${path}${location}`
    },
  },
  cursor: {
    name: 'Cursor',
    buildUrl: (path, line, col) => {
      const location = line ? `:${line}${col ? `:${col}` : ''}` : ''
      return `cursor://file${path}${location}`
    },
  },
  zed: {
    name: 'Zed',
    buildUrl: (path, line, col) => {
      const location = line ? `:${line}${col ? `:${col}` : ''}` : ''
      return `zed://file${path}${location}`
    },
  },
  sublime: {
    name: 'Sublime Text',
    buildUrl: (path, line) => {
      const params = new URLSearchParams({ url: `file://${path}` })
      if (line) params.set('line', String(line))
      return `subl://open?${params.toString()}`
    },
  },
  webstorm: {
    name: 'WebStorm',
    buildUrl: (path, line, col) => {
      const params = new URLSearchParams({ file: path })
      if (line) params.set('line', String(line))
      if (col) params.set('column', String(col))
      return `webstorm://open?${params.toString()}`
    },
  },
  idea: {
    name: 'IntelliJ IDEA',
    buildUrl: (path, line, col) => {
      const params = new URLSearchParams({ file: path })
      if (line) params.set('line', String(line))
      if (col) params.set('column', String(col))
      return `idea://open?${params.toString()}`
    },
  },
}

export function useEditor() {
  const { config, repoPath, updateConfig } = useConfig()
  const [localEditor, setLocalEditor] = useState<EditorType | null>(null)

  // Use local state if set, otherwise use config
  const editor = localEditor ?? (config?.editor as EditorType) ?? 'vscode'

  const setEditor = useCallback(
    (newEditor: EditorType) => {
      setLocalEditor(newEditor)
      // Save to server config
      updateConfig({ editor: newEditor }).catch(console.error)
    },
    [updateConfig]
  )

  const getEditorUrl = useCallback(
    (filePath: string, line?: number, column?: number): string | null => {
      if (!repoPath) return null
      const absolutePath = `${repoPath}/${filePath}`
      return EDITORS[editor].buildUrl(absolutePath, line, column)
    },
    [repoPath, editor]
  )

  const openInEditor = useCallback(
    async (filePath: string, line?: number, column?: number) => {
      if (isTauri()) {
        // Use Tauri command to open file in editor
        try {
          await apiOpenInEditor(filePath, editor)
        } catch (err) {
          console.error('Failed to open in editor:', err)
        }
      } else {
        // Web mode: use URL scheme
        const url = getEditorUrl(filePath, line, column)
        if (url) {
          window.location.href = url
        } else {
          console.error('Cannot open in editor: repoPath not available')
        }
      }
    },
    [getEditorUrl, editor]
  )

  return {
    editor,
    setEditor,
    editors: EDITORS,
    editorTypes: Object.keys(EDITORS) as EditorType[],
    getEditorUrl,
    openInEditor,
    repoPath,
  }
}
