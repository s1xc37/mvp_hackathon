import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MapPage from './pages/MapPage';
import { SimClockProvider } from './sim/SimClock';

export default function App() {
  return (
    <SimClockProvider>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<MapPage />} />
        </Routes>
      </BrowserRouter>
    </SimClockProvider>
  );
}
