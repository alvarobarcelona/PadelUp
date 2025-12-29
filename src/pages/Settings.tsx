import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import {
    ChevronLeft,
    User,
    Bell,
    Moon,
    Shield,
    LogOut,
    ChevronRight,
    HelpCircle,
    Check,
    X,
    Loader2
} from 'lucide-react';

const Settings = () => {
    const navigate = useNavigate();
    const [profile, setProfile] = useState<{ username: string, email: string } | null>(null);
    const [loading, setLoading] = useState(false);

    // Editing State
    const [isEditing, setIsEditing] = useState(false);
    const [newUsername, setNewUsername] = useState('');

    // Preferences
    const [notifications, setNotifications] = useState(true);
    const [darkMode, setDarkMode] = useState(true);

    useEffect(() => {
        getProfile();
        loadPreferences();
    }, []);

    const loadPreferences = () => {
        const storedNotifs = localStorage.getItem('padelup_notifications');
        const storedDarkMode = localStorage.getItem('padelup_dark_mode');

        if (storedNotifs !== null) setNotifications(JSON.parse(storedNotifs));

        // Default to true if not set, as app is dark by default
        if (storedDarkMode !== null) {
            const isDark = JSON.parse(storedDarkMode);
            setDarkMode(isDark);
            toggleTheme(isDark);
        }
    };

    const getProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('profiles')
                .select('username')
                .eq('auth_id', user.id)
                .single();

            setProfile({
                username: data?.username || '',
                email: user.email || ''
            });
            setNewUsername(data?.username || '');
        }
    };

    const toggleTheme = (isDark: boolean) => {
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    const handleNotificationToggle = () => {
        const newState = !notifications;
        setNotifications(newState);
        localStorage.setItem('padelup_notifications', JSON.stringify(newState));
    };

    const handleDarkModeToggle = () => {
        const newState = !darkMode;
        setDarkMode(newState);
        localStorage.setItem('padelup_dark_mode', JSON.stringify(newState));
        toggleTheme(newState);
    };

    const handleUpdateProfile = async () => {
        if (!profile || !newUsername.trim()) return;

        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) throw new Error('No user found');

            const { error } = await supabase
                .from('profiles')
                .update({ username: newUsername })
                .eq('auth_id', user.id);

            if (error) throw error;

            setProfile({ ...profile, username: newUsername });
            setIsEditing(false);
        } catch (error: any) {
            console.error('Error updating profile:', error);

            // Check for Postgres Unique Violation (code 23505)
            if (error?.code === '23505') {
                alert('That username is already taken. Please choose another one.');
            } else {
                alert(`Error updating profile: ${error.message || 'Unknown error'}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/auth');
    };

    return (
        <div className="min-h-screen bg-slate-900 pb-20 animate-fade-in">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center gap-4 bg-slate-900/95 p-4 backdrop-blur-sm border-b border-slate-800">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                    <ChevronLeft className="text-white" size={24} />
                </Button>
                <h1 className="text-xl font-bold text-white">Settings</h1>
            </div>

            <div className="p-4 space-y-6 max-w-lg mx-auto">
                {/* Profile Section */}
                <div className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Account</h2>
                    <div className="rounded-xl bg-slate-800 border border-slate-700/50 overflow-hidden">

                        {/* Username Edit Row */}
                        <div className="w-full flex items-center justify-between p-4 border-b border-slate-700/50">
                            <div className="flex items-center gap-3 flex-1">
                                <div className="p-2 rounded-full bg-blue-500/10 text-blue-400">
                                    <User size={20} />
                                </div>
                                <div className="text-left flex-1">
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={newUsername}
                                            onChange={(e) => setNewUsername(e.target.value)}
                                            className="w-full bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500"
                                            autoFocus
                                        />
                                    ) : (
                                        <>
                                            <p className="font-medium text-white">{profile?.username || 'Loading...'}</p>
                                            <p className="text-xs text-slate-400">{profile?.email}</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Edit Actions */}
                            <div className="flex items-center gap-2">
                                {isEditing ? (
                                    <>
                                        <button
                                            onClick={handleUpdateProfile}
                                            disabled={loading}
                                            className="p-2 text-green-400 hover:bg-green-500/10 rounded-full transition-colors"
                                        >
                                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsEditing(false);
                                                setNewUsername(profile?.username || '');
                                            }}
                                            className="p-2 text-red-400 hover:bg-red-500/10 rounded-full transition-colors"
                                        >
                                            <X size={18} />
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="text-xs font-medium text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-full hover:bg-blue-500/10 transition-colors"
                                    >
                                        Edit
                                    </button>
                                )}
                            </div>
                        </div>

                        <button className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-orange-500/10 text-orange-400">
                                    <Shield size={20} />
                                </div>
                                <span className="font-medium text-white">Security & Password</span>
                            </div>
                            <ChevronRight size={18} className="text-slate-500" />
                        </button>
                    </div>
                </div>

                {/* Preferences */}
                <div className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Preferences</h2>
                    <div className="rounded-xl bg-slate-800 border border-slate-700/50 overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-purple-500/10 text-purple-400">
                                    <Bell size={20} />
                                </div>
                                <span className="font-medium text-white">Notifications</span>
                            </div>
                            <div
                                onClick={handleNotificationToggle}
                                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${notifications ? 'bg-green-500' : 'bg-slate-600'}`}
                            >
                                <div className={`absolute top-1 left-1 bg-white h-4 w-4 rounded-full transition-transform ${notifications ? 'translate-x-5' : ''}`} />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-indigo-500/10 text-indigo-400">
                                    <Moon size={20} />
                                </div>
                                <span className="font-medium text-white">Dark Mode</span>
                            </div>
                            <div
                                onClick={handleDarkModeToggle}
                                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${darkMode ? 'bg-green-500' : 'bg-slate-600'}`}
                            >
                                <div className={`absolute top-1 left-1 bg-white h-4 w-4 rounded-full transition-transform ${darkMode ? 'translate-x-5' : ''}`} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Support */}
                <div className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Support</h2>
                    <div className="rounded-xl bg-slate-800 border border-slate-700/50 overflow-hidden">
                        <button className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-emerald-500/10 text-emerald-400">
                                    <HelpCircle size={20} />
                                </div>
                                <span className="font-medium text-white">Help & Feedback</span>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Logout */}
                <Button
                    variant="danger"
                    className="w-full h-12 gap-2 mt-8 text-red-400 border-red-500/20 bg-red-500/10 hover:bg-red-500/20"
                    onClick={handleLogout}
                >
                    <LogOut size={18} />
                    Log Out
                </Button>

                <div className="text-center pt-4">
                    <p className="text-xs text-slate-600">PadelUp v1.2.1</p>
                    <p className="text-[10px] text-slate-700 mt-1">Built with ❤️ for Padel Lovers</p>
                </div>
            </div>
        </div>
    );
};

export default Settings;
