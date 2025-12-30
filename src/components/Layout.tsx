
import { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Trophy, PlusCircle, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import clsx from 'clsx';

const Layout = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const checkAccess = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/auth');
                return;
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('approved, subscription_end_date, is_admin')
                .eq('auth_id', user.id)
                .single();

            if (profile) {
                if (profile.approved === false) {
                    navigate('/pending');
                    return;
                }

                // Admins bypass subscription check
                if (profile.is_admin) return;

                const isExpired = !profile.subscription_end_date || new Date(profile.subscription_end_date) < new Date();

                // Allow access to subscription page if expired
                if (isExpired && window.location.pathname !== '/subscription') {
                    navigate('/subscription');
                }
            }
        };

        checkAccess();
    }, [navigate]);

    return (
        <div className="mx-auto min-h-screen max-w-md bg-slate-900 text-slate-100 shadow-2xl transition-colors duration-300">
            <main className="min-h-[calc(100vh-80px)] p-4 pb-24">
                <Outlet />
            </main>

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 mx-auto max-w-md border-t border-slate-800 bg-slate-900/95 backdrop-blur-sm px-2 py-4 z-50 transition-colors duration-300">
                <ul className="flex items-center justify-around">
                    <li>
                        <NavLink to="/" className={({ isActive }) => clsx("flex flex-col items-center gap-1 transition-colors", isActive ? "text-green-400" : "text-slate-500 hover:text-slate-300")}>
                            <Home size={22} />
                            <span className="text-[10px] font-medium">Home</span>
                        </NavLink>
                    </li>
                    <li>
                        <NavLink to="/players" className={({ isActive }) => clsx("flex flex-col items-center gap-1 transition-colors", isActive ? "text-green-400" : "text-slate-500 hover:text-slate-300")}>
                            <Users size={22} />
                            <span className="text-[10px] font-medium">Community</span>
                        </NavLink>
                    </li>
                    <li>
                        <NavLink to="/new-match" className={({ isActive }) => clsx("flex flex-col items-center gap-1 transition-colors", isActive ? "text-green-400" : "text-slate-500 hover:text-slate-300")}>
                            <PlusCircle size={36} className="-mt-8 text-green-500 bg-slate-900 rounded-full p-1 shadow-lg shadow-green-500/20 transition-colors duration-300" />
                        </NavLink>
                    </li>
                    <li>
                        <NavLink to="/rankings" className={({ isActive }) => clsx("flex flex-col items-center gap-1 transition-colors", isActive ? "text-green-400" : "text-slate-500 hover:text-slate-300")}>
                            <Trophy size={22} />
                            <span className="text-[10px] font-medium">Rank</span>
                        </NavLink>
                    </li>
                </ul>
            </nav>
        </div>
    );
};

export default Layout;
