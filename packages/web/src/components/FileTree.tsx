import { memo } from 'react'
import { cn } from '../lib/utils'
import { ScrollArea } from './ui/scroll-area'

interface FileDiffInfo {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed'
  additions: number
  deletions: number
}

interface FileTreeProps {
  files: FileDiffInfo[]
  selectedFile: string | null
  onSelectFile: (path: string) => void
}

const statusColors = {
  added: 'bg-emerald-500',
  deleted: 'bg-red-400',
  modified: 'bg-amber-400',
  renamed: 'bg-blue-400',
}

export const FileTree = memo(function FileTree({ files, selectedFile, onSelectFile }: FileTreeProps) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <p className="text-sm">No changed files</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-1">
        {files.map((file) => (
          <div
            key={file.path}
            className={cn(
              'group flex cursor-pointer items-center gap-2 px-3 py-1.5 mx-1 rounded-md transition-colors',
              selectedFile === file.path
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
            onClick={() => onSelectFile(file.path)}
          >
            <span className={cn('size-1.5 shrink-0 rounded-full', statusColors[file.status])} />
            <span className="flex-1 truncate font-mono text-xs" title={file.path}>
              {file.path}
            </span>
            <span className="flex gap-1 font-mono text-[10px] opacity-60 group-hover:opacity-100">
              {file.additions > 0 && (
                <span className="text-emerald-500">+{file.additions}</span>
              )}
              {file.deletions > 0 && (
                <span className="text-red-400">-{file.deletions}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
})
