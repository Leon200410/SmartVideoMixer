import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { UploadPage } from './pages/UploadPage';
import { TemplatePage } from './pages/TemplatePage';
import { EditPage } from './pages/EditPage';
import { ResultPage } from './pages/ResultPage';
import { HistoryPage } from './pages/HistoryPage';
import './index.css';

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<UploadPage />} />
        <Route path="/video/:videoId/template" element={<TemplatePage />} />
        <Route path="/video/:videoId/edit" element={<EditPage />} />
        <Route path="/result/:generationId" element={<ResultPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
