import { useState } from 'react'
import { FolderGit2, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { selectDirectory, setRepoPath } from '../lib/api'

interface WelcomePageProps {
  onRepoSelected: (path: string) => void
}

export function WelcomePage({ onRepoSelected }: WelcomePageProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelectRepo = async () => {
    try {
      setLoading(true)
      setError(null)

      const path = await selectDirectory()
      if (path) {
        await setRepoPath(path)
        onRepoSelected(path)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open repository')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-3">
          <FolderGit2 className="h-12 w-12 text-primary" />
          <h1 className="text-4xl font-bold">Differ</h1>
        </div>

        <p className="max-w-md text-muted-foreground">
          A beautiful git diff viewer. Select a repository to get started.
        </p>

        <Button
          size="lg"
          onClick={handleSelectRepo}
          disabled={loading}
          className="mt-4"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Opening...
            </>
          ) : (
            <>
              <FolderGit2 className="mr-2 h-4 w-4" />
              Open Repository
            </>
          )}
        </Button>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  )
}
