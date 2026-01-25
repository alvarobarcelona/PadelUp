

import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Rankings from './pages/Rankings';
import NewMatch from './pages/NewMatch';
import History from './pages/History';
import Profile from './pages/Profile';
import Auth from './pages/Auth';
import Players from './pages/Players';
import Admin from './pages/Admin';
import Settings from './pages/Settings';
import Levels from './pages/Levels';

import PendingApproval from './pages/PendingApproval';
import Subscription from './pages/Subscription';
import Banned from './pages/Banned';
import ResetPassword from './pages/ResetPassword';
import Install from './pages/Install';

import { useEffect } from 'react';
import { supabase } from './lib/supabase';

import { ChatProvider } from './context/ChatContext';
import CookieBanner from './components/CookieBanner';

import UserProfile from './pages/UserProfile';

import PrivacyPolicy from './pages/PrivacyPolicy';
import Impressum from './pages/Impressum';
import Terms from './pages/Terms';

function AppRoutes() {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, _session) => {
      // Listen for PASSWORD_RECOVERY event to redirect to reset page
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password');
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <ChatProvider>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/install" element={<Install />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pending" element={<PendingApproval />} />
        <Route path="/subscription" element={<Subscription />} />
        <Route path="/banned" element={<Banned />} />

        {/* Legal Routes */}
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/impressum" element={<Impressum />} />
        <Route path="/terms" element={<Terms />} />

        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="rankings" element={<Rankings />} />
          <Route path="new-match" element={<NewMatch />} />
          <Route path="history" element={<History />} />
          <Route path="players" element={<Players />} />
          <Route path="profile" element={<Profile />} />
          <Route path="user/:id" element={<UserProfile />} />
          <Route path="admin" element={<Admin />} />
          <Route path="settings" element={<Settings />} />
          <Route path="levels" element={<Levels />} />
        </Route>
      </Routes>
      <CookieBanner />
    </ChatProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
