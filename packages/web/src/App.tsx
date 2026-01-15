import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { CurrentChanges } from './pages/CurrentChanges'
import { HistoryPage } from './pages/HistoryPage'
import { CommitView } from './pages/CommitView'
import { CompareView } from './pages/CompareView'
import { WelcomePage } from './pages/WelcomePage'
import { isTauri } from './lib/api'

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
    // In Tauri mode, check if we have injected repo path
    if (isTauri()) {
      // Could also check localStorage for last opened repo
      const lastRepo = localStorage.getItem('differ:lastRepo')
      if (lastRepo) {
        // Try to open the last used repo
        import('./lib/api').then(({ setRepoPath: setRepo }) => {
          setRepo(lastRepo)
            .then(() => {
              setRepoPath(lastRepo)
              setInitialized(true)
            })
            .catch(() => {
              // Repo no longer exists or is invalid
              localStorage.removeItem('differ:lastRepo')
              setInitialized(true)
            })
        })
      } else {
        setInitialized(true)
      }
    }
  }, [])

  const handleRepoSelected = (path: string) => {
    setRepoPath(path)
    // Remember the repo for next launch
    localStorage.setItem('differ:lastRepo', path)
  }

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
