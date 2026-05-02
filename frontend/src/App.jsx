import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext.jsx';
import TopScreen from './components/top/TopScreen.jsx';
import ScheduleScreen from './components/schedule/ScheduleScreen.jsx';
import ShareScreen from './components/schedule/ShareScreen.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<TopScreen />} />
          <Route path="/schedule" element={<ScheduleScreen />} />
          <Route path="/share/:token" element={<ShareScreen />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
