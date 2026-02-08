import { cn } from '../lib/utils'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from './ui/tooltip'

interface FileMinimapProps {
  files: Array<{ path: string; status: string }>
  onSelectFile: (path: string) => void
  selectedFile?: string | null
}

const statusColors: Record<string, string> = {
  added: 'bg-emerald-500',
  modified: 'bg-amber-400',
  deleted: 'bg-red-400',
  renamed: 'bg-blue-400',
  untracked: 'bg-purple-400',
}

export function FileMinimap({ files, onSelectFile, selectedFile }: FileMinimapProps) {
  return (
    <div className="group fixed right-0 top-14 bottom-0 z-40 hidden md:flex items-center">
      {/* Panel - bars peek out, full panel slides in on hover */}
      <div
        className={cn(
          'translate-x-[calc(100%-8px)] group-hover:translate-x-0',
          'transition-all duration-200 ease-out',
          'bg-background/95 backdrop-blur-sm border-l border-y rounded-l-lg shadow-lg',
          'py-2 pl-2 max-h-[calc(100vh-5rem)] overflow-y-auto'
        )}
      >
        <TooltipProvider delayDuration={100}>
          <div className="flex flex-col gap-1">
            {files.map((file) => (
              <Tooltip key={file.path}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onSelectFile(file.path)}
                    className={cn(
                      'w-8 h-2 rounded-full transition-all',
                      statusColors[file.status] || 'bg-muted',
                      selectedFile === file.path && 'ring-2 ring-foreground ring-offset-1 ring-offset-background',
                      'hover:scale-110 hover:brightness-110'
                    )}
                    aria-label={`Navigate to ${file.path}`}
                  />
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={8}>
                  <span className="font-mono text-xs">{file.path}</span>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      </div>
    </div>
  )
}
