import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext.jsx';
import TopScreen from './components/top/TopScreen.jsx';
import ScheduleScreen from './components/schedule/ScheduleScreen.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<TopScreen />} />
          <Route path="/schedule" element={<ScheduleScreen />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
