
import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Trophy, Users, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import clsx from 'clsx';
import ChatButton from './Chat/ChatButton';
import ChatDrawer from './Chat/ChatDrawer';
import { useChat } from '../context/ChatContext';
import { useTranslation } from 'react-i18next';
import { InstallPrompt } from './InstallPrompt';

import BetaBanner from './BetaBanner';

const Layout = () => {
    const navigate = useNavigate();
    const { unreadCount } = useChat();
    const { t } = useTranslation();
    const [verifying, setVerifying] = useState(true);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatActiveUser, setChatActiveUser] = useState<string | null>(null);

    useEffect(() => {
        const handleOpenChat = (e: CustomEvent<string>) => {
            setChatActiveUser(e.detail);
            setIsChatOpen(true);
        };

        window.addEventListener('openChat' as any, handleOpenChat);
        return () => window.removeEventListener('openChat' as any, handleOpenChat);
    }, []);

    useEffect(() => {
        const checkAccess = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/auth');
                return;
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('approved, subscription_end_date, is_admin, banned, banned_until')
                .eq('id', user.id)
                .single();

            // Strict Access Control:
            // 1. If Banned -> /banned
            // 2. If NO Profile -> /pending (Assume new user waiting for trigger/approval)
            // 3. If Profile exists but NOT approved -> /pending

            if (profile) {
                if (profile.banned || (profile.banned_until && new Date(profile.banned_until) > new Date())) {
                    navigate('/banned');
                    return;
                }

                if (profile.approved === false) {
                    navigate('/pending');
                    return;
                }

                // Admins bypass subscription check
                if (profile.is_admin) {
                    setVerifying(false);
                    return;
                }

                const isExpired = !profile.subscription_end_date || new Date(profile.subscription_end_date) < new Date();

                // Allow access to subscription page if expired
                if (isExpired && window.location.pathname !== '/subscription') {
                    navigate('/subscription');
                }
            } else {
                // No profile found? Treat as pending/unregistered.
                navigate('/pending');
                return;
            }

            setVerifying(false);
        };

        checkAccess();
    }, [navigate]);

    if (verifying) {
        return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-green-500">
            <Loader2 className="animate-spin" size={48} />
        </div>;
    }

    return (
        <div className="mx-auto min-h-screen max-w-md bg-slate-900 text-slate-100 shadow-2xl transition-colors duration-300 relative">
            <BetaBanner />
            <main className="min-h-[calc(100vh-80px)] p-4 pb-24">
                <Outlet />
            </main>

            {/* Chat Components */}
            <ChatButton onClick={() => setIsChatOpen(true)} unreadCount={unreadCount} />
            <ChatDrawer
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                activeUserId={chatActiveUser}
                onActiveUserChange={setChatActiveUser}
            />

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 mx-auto max-w-md border-t border-slate-800 bg-slate-900/95 backdrop-blur-sm px-2 py-4 z-40 transition-colors duration-300">
                <ul className="flex items-center justify-around">
                    <li>
                        <NavLink to="/" className={({ isActive }) => clsx("flex flex-col items-center gap-1 transition-colors", isActive ? "text-green-400" : "text-slate-500 hover:text-slate-300")}>
                            <Home size={22} />
                            <span className="text-[10px] font-medium">{t('nav.home')}</span>
                        </NavLink>
                    </li>
                    <li>
                        <NavLink to="/players" className={({ isActive }) => clsx("flex flex-col items-center gap-1 transition-colors", isActive ? "text-green-400" : "text-slate-500 hover:text-slate-300")}>
                            <Users size={22} />
                            <span className="text-[10px] font-medium">{t('nav.community')}</span>
                        </NavLink>
                    </li>
                    <li>
                        <NavLink to="/rankings" className={({ isActive }) => clsx("flex flex-col items-center gap-1 transition-colors", isActive ? "text-green-400" : "text-slate-500 hover:text-slate-300")}>
                            <Trophy size={22} />
                            <span className="text-[10px] font-medium">{t('nav.rank')}</span>
                        </NavLink>
                    </li>
                </ul>
            </nav>

            <InstallPrompt />
        </div >
    );
};

export default Layout;
