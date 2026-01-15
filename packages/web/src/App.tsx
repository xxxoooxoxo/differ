import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { CurrentChanges } from './pages/CurrentChanges'
import { HistoryPage } from './pages/HistoryPage'
import { CommitView } from './pages/CommitView'
import { CompareView } from './pages/CompareView'
import { WelcomePage } from './pages/WelcomePage'
import { isTauri, selectDirectory, setRepoPath as setRepoPathApi } from './lib/api'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<CurrentChanges />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/commit/:sha" element={<CommitView />} />
      <Route path="/compare" element={<CompareView />} />
    </Routes>
  )
}

export function App() {
  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(!isTauri())

  useEffect(() => {
    // In Tauri mode, check if we have a last opened repo
    if (isTauri()) {
      const lastRepo = localStorage.getItem('differ:lastRepo')
      if (lastRepo) {
        // Try to open the last used repo
        setRepoPathApi(lastRepo)
          .then(() => {
            setRepoPath(lastRepo)
            setInitialized(true)
          })
          .catch(() => {
            // Repo no longer exists or is invalid
            localStorage.removeItem('differ:lastRepo')
            setInitialized(true)
          })
      } else {
        setInitialized(true)
      }
    }
  }, [])

  const handleRepoSelected = useCallback((path: string) => {
    setRepoPath(path)
    // Remember the repo for next launch
    localStorage.setItem('differ:lastRepo', path)
  }, [])

  // Keyboard shortcut to change directory (Cmd/Ctrl+O) in Tauri mode
  useEffect(() => {
    if (!isTauri()) return

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (event.key === 'o' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        try {
          const path = await selectDirectory()
          if (path) {
            await setRepoPathApi(path)
            handleRepoSelected(path)
          }
        } catch (err) {
          console.error('Failed to change directory:', err)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleRepoSelected])

  // Show loading while initializing
  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // In Tauri mode without a selected repo, show welcome page
  if (isTauri() && !repoPath) {
    return <WelcomePage onRepoSelected={handleRepoSelected} />
  }

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
