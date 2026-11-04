import { Route, Routes } from 'react-router'
import { BookmarkPage } from './pages/BookmarkPage'
import { BookmarksPage } from './pages/BookmarksPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { TrashPage } from './pages/TrashPage'
import { SavePage } from './pages/SavePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<BookmarksPage />} />
      <Route path="/trash" element={<TrashPage />} />
      <Route path="/save" element={<SavePage />} />
      <Route path="/bookmarks/:id" element={<BookmarkPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
