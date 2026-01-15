export type EditorType = 'vscode' | 'cursor' | 'zed' | 'sublime' | 'webstorm' | 'idea'
export type DiffStyle = 'split' | 'unified'

export interface DifferConfig {
  /** Default editor for "Open in Editor" feature */
  editor: EditorType
  /** Default diff view style */
  diffStyle: DiffStyle
  /** Server port (0 for auto-select) */
  port: number
  /** Open browser automatically on start */
  autoOpen: boolean
  /** Large file threshold in bytes (files above this are lazy-loaded) */
  largeFileThreshold: number
}

export const DEFAULT_CONFIG: DifferConfig = {
  editor: 'vscode',
  diffStyle: 'split',
  port: 1738,
  autoOpen: true,
  largeFileThreshold: 50000,
}
