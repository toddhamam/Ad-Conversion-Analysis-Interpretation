import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './components/MainLayout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Channels from './pages/Channels';
import MetaAds from './pages/MetaAds';
import Concepts from './pages/Concepts';
import Products from './pages/Products';
import Insights from './pages/Insights';
import AdGenerator from './pages/AdGenerator';
import AdPublisher from './pages/AdPublisher';
import SalesLanding from './pages/SalesLanding';
import Login from './pages/Login';
import Register from './pages/Register';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes - no authentication required */}
        <Route path="/" element={<SalesLanding />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Register />} />

        {/* Protected App Routes - authentication required */}
        <Route path="/*" element={
          <ProtectedRoute>
            <MainLayout>
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/channels" element={<Channels />} />
                <Route path="/channels/meta-ads" element={<MetaAds />} />
                <Route path="/creatives" element={<AdGenerator />} />
                <Route path="/publish" element={<AdPublisher />} />
                <Route path="/concepts" element={<Concepts />} />
                <Route path="/products" element={<Products />} />
                <Route path="/insights" element={<Insights />} />
              </Routes>
            </MainLayout>
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}

export default App;
