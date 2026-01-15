import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CommitInfo {
  sha: string
  shortSha: string
  message: string
  author: string
  date: string
  stats: {
    additions: number
    deletions: number
    files: number
  }
}

interface CommitListProps {
  commits: CommitInfo[]
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60))
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
    }
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  }

  if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

export function CommitList({ commits, page, totalPages, onPageChange }: CommitListProps) {
  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No commits found
      </div>
    )
  }

  return (
    <>
      <div className="rounded-md border border-border overflow-hidden bg-card">
        {commits.map((commit, index) => (
          <Link
            key={commit.sha}
            to={`/commit/${commit.sha}`}
            className={`group flex items-center gap-4 px-3 py-2.5 transition-colors hover:bg-accent/30 ${
              index > 0 ? 'border-t border-border' : ''
            }`}
          >
            <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground">
              {commit.shortSha}
            </span>
            <span className="flex-1 truncate text-sm text-foreground">{commit.message}</span>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {commit.author} · {formatDate(commit.date)}
            </span>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-6">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="size-3.5" />
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </>
  )
}
