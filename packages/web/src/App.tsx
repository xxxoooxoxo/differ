import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { CurrentChanges } from './pages/CurrentChanges'
import { HistoryPage } from './pages/HistoryPage'
import { CommitView } from './pages/CommitView'
import { CompareView } from './pages/CompareView'
import { PRListPage } from './pages/PRListPage'
import { PRView } from './pages/PRView'
import { WelcomePage } from './pages/WelcomePage'
import { TabProvider } from './contexts/TabContext'
import { TabBar } from './components/TabBar'
import { CommandPaletteProvider, CommandPalette } from './components/CommandPalette'
import { isTauri, selectDirectory, setRepoPath as setRepoPathApi } from './lib/api'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<CurrentChanges />} />
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/commit/:sha" element={<CommitView />} />
      <Route path="/compare" element={<CompareView />} />
      <Route path="/prs" element={<PRListPage />} />
      <Route path="/prs/:number" element={<PRView />} />
    </Routes>
  )
}

// Wrapper for routes - pages handle tab switching via useEffect
function KeyedRoutes() {
  return (
    <div className="h-full">
      <AppRoutes />
    </div>
  )
}

export function App() {
  const [repoPath, setRepoPath] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(!isTauri())

  useEffect(() => {
    // In Tauri mode, check if we have a last opened repo
    if (isTauri()) {
      const lastRepo = localStorage.getItem('diffy:lastRepo')
      if (lastRepo) {
        // Try to open the last used repo
        setRepoPathApi(lastRepo)
          .then(() => {
            setRepoPath(lastRepo)
            setInitialized(true)
          })
          .catch(() => {
            // Repo no longer exists or is invalid
            localStorage.removeItem('diffy:lastRepo')
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
    localStorage.setItem('diffy:lastRepo', path)
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
      <TabProvider initialRepoPath={repoPath || undefined}>
        <CommandPaletteProvider>
          <div className="flex h-screen flex-col">
            <TabBar />
            <div className="flex-1 min-h-0">
              <KeyedRoutes />
            </div>
          </div>
          <CommandPalette />
        </CommandPaletteProvider>
      </TabProvider>
    </BrowserRouter>
  )
}
