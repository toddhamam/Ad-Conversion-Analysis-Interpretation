import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import Dashboard from './pages/Dashboard';
import Channels from './pages/Channels';
import MetaAds from './pages/MetaAds';
import Concepts from './pages/Concepts';
import Products from './pages/Products';
import Insights from './pages/Insights';
import AdGenerator from './pages/AdGenerator';
import AdPublisher from './pages/AdPublisher';
import SalesLanding from './pages/SalesLanding';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* Sales Landing Page - standalone, no sidebar */}
        <Route path="/landing" element={<SalesLanding />} />

        {/* App Routes - with MainLayout sidebar */}
        <Route path="/*" element={
          <MainLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/channels" element={<Channels />} />
              <Route path="/channels/meta-ads" element={<MetaAds />} />
              <Route path="/creatives" element={<AdGenerator />} />
              <Route path="/publish" element={<AdPublisher />} />
              <Route path="/concepts" element={<Concepts />} />
              <Route path="/products" element={<Products />} />
              <Route path="/insights" element={<Insights />} />
            </Routes>
          </MainLayout>
        } />
      </Routes>
    </Router>
  );
}

export default App;
