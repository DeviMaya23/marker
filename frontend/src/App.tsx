import { Route, Routes } from 'react-router'
import { BookmarkPage } from './pages/BookmarkPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SavePage } from './pages/SavePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/save" element={<SavePage />} />
      <Route path="/bookmarks/:id" element={<BookmarkPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
