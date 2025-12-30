import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import {
    ChevronLeft,
    User,
    Bell,
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

    // Password Change State
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Preferences
    const [notifications, setNotifications] = useState(true);

    useEffect(() => {
        getProfile();
    }, []);

    const getProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('profiles')
                .select('username, notifications_enabled')
                .eq('auth_id', user.id)
                .single();

            setProfile({
                username: data?.username || '',
                email: user.email || ''
            });
            setNewUsername(data?.username || '');
            if (data?.notifications_enabled !== undefined) {
                setNotifications(data.notifications_enabled);
            }
        }
    };

    const handleNotificationToggle = async () => {
        const newState = !notifications;
        setNotifications(newState); // Optimistic update

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase
                    .from('profiles')
                    .update({ notifications_enabled: newState })
                    .eq('auth_id', user.id);
            }
        } catch (error) {
            console.error('Failed to save notification preference', error);
            // Revert on error? For now, keep optimistic.
        }
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

    const handleUpdatePassword = async () => {
        if (newPassword !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }
        if (newPassword.length < 6) {
            alert('Password must be at least 6 characters');
            return;
        }

        try {
            setLoading(true);
            const { error } = await supabase.auth.updateUser({ password: newPassword });

            if (error) throw error;

            alert('Password updated successfully!');
            setIsChangingPassword(false);
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            console.error('Error updating password:', error);
            alert(`Error updating password: ${error.message}`);
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
                    <div className="rounded-xl bg-slate-800 border border-slate-700/50 overflow-hidden shadow-none transition-colors duration-300">

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
                                            className="w-full bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 transition-colors"
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

                        {/* Security Section */}
                        <div className="border-t border-slate-700/50">
                            <button
                                onClick={() => setIsChangingPassword(!isChangingPassword)}
                                className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-full bg-orange-500/10 text-orange-400">
                                        <Shield size={20} />
                                    </div>
                                    <span className="font-medium text-white">Security & Password</span>
                                </div>
                                {isChangingPassword ? <ChevronLeft size={18} className="text-slate-500 -rotate-90" /> : <ChevronRight size={18} className="text-slate-500" />}
                            </button>

                            {/* Password Change Form */}
                            {isChangingPassword && (
                                <div className="p-4 pt-0 space-y-3 bg-slate-800/50">
                                    <input
                                        type="password"
                                        placeholder="New Password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full bg-slate-900 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                                    />
                                    <input
                                        type="password"
                                        placeholder="Confirm Password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full bg-slate-900 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                                    />
                                    <div className="flex justify-end gap-2 pt-2">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                setIsChangingPassword(false);
                                                setNewPassword('');
                                                setConfirmPassword('');
                                            }}
                                            className="text-slate-400 hover:text-white"
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={handleUpdatePassword}
                                            disabled={loading || !newPassword || !confirmPassword}
                                            className="bg-orange-500 hover:bg-orange-600 text-white"
                                        >
                                            {loading ? <Loader2 size={16} className="animate-spin" /> : 'Update Password'}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Preferences */}
                <div className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Preferences</h2>
                    <div className="rounded-xl bg-slate-800 border border-slate-700/50 overflow-hidden">
                        <div className="flex items-center justify-between p-4">
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
                    </div>
                </div>

                {/* Support */}
                <div className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Support</h2>
                    <div className="rounded-xl bg-slate-800 border border-slate-700/50 overflow-hidden shadow-none transition-colors duration-300">
                        <button
                            onClick={() => window.location.href = 'mailto:support@padelup.com?subject=Feedback%20for%20PadelUp'}
                            className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-emerald-500/10 text-emerald-400">
                                    <HelpCircle size={20} />
                                </div>
                                <span className="font-medium text-white">Help & Feedback</span>
                            </div>
                            <ChevronRight size={18} className="text-slate-500" />
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
                    <p className="text-xs text-slate-500">PadelUp v1.2.1</p>
                    <p className="text-[10px] text-slate-500 mt-1">Built with ❤️ for Padel Lovers</p>
                </div>
            </div>
        </div>
    );
};

export default Settings;
