

import { BrowserRouter, Routes, Route } from 'react-router-dom';
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

import PendingApproval from './pages/PendingApproval';
import Subscription from './pages/Subscription';
import Banned from './pages/Banned';
import ResetPassword from './pages/ResetPassword';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/pending" element={<PendingApproval />} />
        <Route path="/subscription" element={<Subscription />} />
        <Route path="/banned" element={<Banned />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="rankings" element={<Rankings />} />
          <Route path="new-match" element={<NewMatch />} />
          <Route path="history" element={<History />} />
          <Route path="players" element={<Players />} />
          <Route path="profile" element={<Profile />} />
          <Route path="admin" element={<Admin />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
