import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import Channels from './pages/Channels';
import MetaAds from './pages/MetaAds';
import Concepts from './pages/Concepts';
import Products from './pages/Products';
import Insights from './pages/Insights';
import './App.css';

function App() {
  return (
    <Router>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/channels" replace />} />
          <Route path="/channels" element={<Channels />} />
          <Route path="/channels/meta-ads" element={<MetaAds />} />
          <Route path="/creatives" element={<div className="page"><h1 className="page-title">Creatives</h1><p className="page-subtitle">Coming soon</p></div>} />
          <Route path="/concepts" element={<Concepts />} />
          <Route path="/products" element={<Products />} />
          <Route path="/insights" element={<Insights />} />
        </Routes>
      </MainLayout>
    </Router>
  );
}

export default App;
