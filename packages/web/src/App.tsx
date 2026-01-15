import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { CurrentChanges } from './pages/CurrentChanges'
import { HistoryPage } from './pages/HistoryPage'
import { CommitView } from './pages/CommitView'
import { CompareView } from './pages/CompareView'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CurrentChanges />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/commit/:sha" element={<CommitView />} />
        <Route path="/compare" element={<CompareView />} />
      </Routes>
    </BrowserRouter>
  )
}
