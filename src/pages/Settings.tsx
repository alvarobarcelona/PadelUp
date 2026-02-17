import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import {
    ChevronLeft,
    User,
    Shield,
    LogOut,
    ChevronRight,
    HelpCircle,
    Check,
    X,
    Loader2,
    Globe,
    ShoppingCart,
    MapPin,
    Bell,
    FileText,
    Flag,
} from 'lucide-react';
import { countries } from '../lib/countries';
import { logActivity } from '../lib/logger';
import { APP_FULL_VERSION } from '../lib/constants';
import { useTranslation } from 'react-i18next';
import { useModal } from '../context/ModalContext';
import { useQueryClient } from '@tanstack/react-query';

import { usePushNotifications } from '../hooks/usePushNotifications';

const Settings = () => {
    const { alert, confirm } = useModal();

    const { subscribeToPush, unsubscribeFromPush, loading: pushLoading } = usePushNotifications();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const [isPushEnabled, setIsPushEnabled] = useState(false);
    const queryClient = useQueryClient();

    useEffect(() => {
        const checkPushStatus = async () => {
            if ('serviceWorker' in navigator) {
                try {
                    const registration = await navigator.serviceWorker.ready;
                    const subscription = await registration.pushManager.getSubscription();

                    if (!subscription) {
                        setIsPushEnabled(false);
                        return;
                    }

                    // Permission check
                    if (Notification.permission !== 'granted') {
                        setIsPushEnabled(false);
                        return;
                    }

                    // Database check: Is THIS subscription in the DB?
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        const { data } = await supabase
                            .from('push_subscriptions')
                            .select('id')
                            .eq('user_id', user.id)
                            .contains('subscription', { endpoint: subscription.endpoint })
                            .maybeSingle();

                        // If we found a matching record in DB, then it's truly enabled.
                        setIsPushEnabled(!!data);
                    }
                } catch (error) {
                    console.error("Error checking push status:", error);
                    setIsPushEnabled(false);
                }
            }
        };

        checkPushStatus();
    }, [pushLoading]);
    const [profile, setProfile] = useState<{ username: string, first_name: string, last_name: string, email: string, subscription_end_date: string | null, main_club_id: number | null, nationality: string | null, racket: string | null } | null>(null);
    const [clubs, setClubs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const currentYear = new Date().getFullYear();

    // Editing State
    const [isEditing, setIsEditing] = useState(false);
    const [newUsername, setNewUsername] = useState('');
    const [newFirstName, setNewFirstName] = useState('');
    const [newLastName, setNewLastName] = useState('');
    const [newDescClub, setNewDescClub] = useState<number | string>('');
    const [newNationality, setNewNationality] = useState('');
    const [newRacket, setNewRacket] = useState('');

    // Password Change State
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Preferences
    /* const [notifications, setNotifications] = useState(true); */

    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

    useEffect(() => {
        const fetchClubs = async () => {
            const { data } = await supabase.from('clubs').select('*').order('id', { ascending: true });
            if (data) setClubs(data);
        };

        getProfile();
        fetchClubs();


        const handleBeforeInstallPrompt = (e: any) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);

        // We've used the prompt, and can't use it again, throw it away
        setDeferredPrompt(null);
    };

    const getProfile = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data } = await supabase
                .from('profiles')
                .select('username, first_name, last_name, notifications_enabled, subscription_end_date, main_club_id, nationality, racket')
                .eq('id', user.id)
                .single();

            setProfile({
                username: data?.username || '',
                first_name: data?.first_name || '',
                last_name: data?.last_name || '',
                email: user.email || '',
                subscription_end_date: data?.subscription_end_date || null,
                main_club_id: data?.main_club_id || null,
                nationality: data?.nationality || null,
                racket: data?.racket || null
            });
            setNewDescClub(data?.main_club_id || '');
            setNewUsername(data?.username || '');
            setNewFirstName(data?.first_name || '');
            setNewLastName(data?.last_name || '');
            setNewNationality(data?.nationality || '');
            setNewRacket(data?.racket || '');

            /*   setNewUsername(data?.username || '');
              if (data?.notifications_enabled !== undefined) {
                  setNotifications(data.notifications_enabled);
              } */
        }
    };

    /*  const handleNotificationToggle = async () => {
         const newState = !notifications;
         setNotifications(newState); // Optimistic update
 
         try {
             const { data: { user } } = await supabase.auth.getUser();
             if (user) {
                 await supabase
                     .from('profiles')
                     .update({ notifications_enabled: newState })
                     .eq('id', user.id);
             }
         } catch (error) {
             console.error('Failed to save notification preference', error);
             // Revert on error? For now, keep optimistic.
         }
     }; */

    const normalizeUsername = (str: string) => {
        // Basic normalization: lowercase and remove accents
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    };


    const handleUpdateProfile = async () => {
        if (!profile || !newUsername.trim()) return;

        if (normalizeUsername(newUsername) === normalizeUsername(profile.username) &&
            newFirstName === profile.first_name &&
            newLastName === profile.last_name &&
            newNationality === (profile.nationality || '') &&
            newRacket === (profile.racket || '') &&
            (newDescClub ? Number(newDescClub) : null) === profile.main_club_id) {

            await alert({
                title: t("settings.no_changes"),
                message: t("settings.no_changes_desc") || "This name is already taken.",
                type: 'info'
            });
            return;
        }


        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) throw new Error('No user found');

            // Check if username exists (case-insensitive)
            const { data: existingUser } = await supabase
                .from('profiles')
                .select('id')
                .ilike('username', newUsername)
                .neq('id', user.id)
                .maybeSingle();

            if (existingUser) {
                await alert({
                    title: t("settings.usernameTakenTitle"),
                    message: t("settings.usernameTakenMessage"),
                    type: 'warning'
                });
                return;
            }

            const { error } = await supabase
                .from('profiles')
                .update({
                    username: newUsername,
                    first_name: newFirstName,
                    last_name: newLastName,
                    main_club_id: newDescClub ? Number(newDescClub) : null,
                    nationality: newNationality || null,
                    racket: newRacket || null
                })
                .eq('id', user.id);

            if (error) throw error;

            setProfile({
                ...profile,
                username: newUsername,
                first_name: newFirstName,
                last_name: newLastName,
                main_club_id: newDescClub ? Number(newDescClub) : null,
                nationality: newNationality || null,
                racket: newRacket || null
            });
            setIsEditing(false);

            // LOG PROFILE UPDATE
            logActivity('PROFILE_UPDATE', user.id, { username: newUsername });

        } catch (error: any) {
            console.error('Error updating profile:', error);

            // Check for Postgres Unique Violation (code 23505)
            if (error?.code === '23505') {
                await alert({
                    title: t("settings.usernameTakenTitle"),
                    message: t("settings.usernameTakenMessage"),
                    type: 'warning'
                });
            } else {
                await alert({
                    title: t("settings.error"),
                    message: t("settings.errorUpdatingProfile"),
                    type: 'danger'
                });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (newPassword !== confirmPassword) {
            await alert({
                title: 'Password Mismatch',
                message: 'Passwords do not match',
                type: 'warning'
            });
            return;
        }
        if (newPassword.length < 6) {
            await alert({
                title: 'Weak Password',
                message: 'Password must be at least 6 characters',
                type: 'warning'
            });
            return;
        }

        try {
            setLoading(true);
            const { error } = await supabase.auth.updateUser({ password: newPassword });

            if (error) throw error;

            await alert({
                title: 'Success',
                message: 'Password updated successfully!',
                type: 'success'
            });
            setIsChangingPassword(false);
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            console.error('Error updating password:', error);
            await alert({
                title: 'Error',
                message: `Error updating password: ${error.message}`,
                type: 'danger'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        const confirmed1 = await confirm({
            title: t('settings.delete_account'),
            message: t("settings.delete_account_desc") || "Are you absolutely sure? This action CANNOT be undone.",
            type: "danger",
            confirmText: t("settings.delete_account_confirm_text") || "Yes, Delete",
            cancelText: t("settings.delete_account_cancel_text") || "Cancel"
        });
        if (!confirmed1) return;

        const confirmed2 = await confirm({
            title: t("settings.delete_account_final_title") || "Final Confirmation",
            message: t("settings.delete_account_final_desc") || "Are you absolutely sure? This action CANNOT be undone.",
            type: "danger",
            confirmText: t("settings.delete_account_final_confirm_text") || "Permanently Delete",
            cancelText: t("settings.delete_account_final_cancel_text") || "Back"
        });
        if (!confirmed2) return;

        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                await alert({ title: 'Error', message: 'No user found.', type: 'danger' });
                return;
            }

            // 1. Delete Account via Edge Function
            // This ensures Auth User + Profile are deleted, while keeping Matches (via Ghost Player migration)
            const { error } = await supabase.functions.invoke('delete-user', {
                body: { user_id: user.id }
            });

            if (error) throw new Error(error.message || 'Failed to delete account');

            // 2. Sign Out
            await supabase.auth.signOut();
            await alert({
                title: 'Account Deleted',
                message: 'Your account has been deleted.',
                type: 'info'
            });
            navigate('/auth');

        } catch (error: any) {
            console.error('Error deleting account:', error);
            await alert({
                title: 'Error',
                message: `Error deleting account: ${error.message}`,
                type: 'danger'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        // Clear all caches to prevent next user from seeing previous user's data
        queryClient.removeQueries();
        await supabase.auth.signOut();
        navigate('/auth');
    };

    const changeLanguage = async (lng: string) => {
        i18n.changeLanguage(lng);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase.from('profiles').update({ language: lng }).eq('id', user.id);
            }
        } catch (error) {
            console.error('Error updating language preference:', error);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 pb-20 animate-fade-in">
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center gap-4 bg-slate-900/95 p-4 backdrop-blur-sm border-b border-slate-800">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                    <ChevronLeft className="text-white" size={24} />
                </Button>
                <h1 className="text-xl font-bold text-white">{t('settings.title')}</h1>
            </div>

            <div className="p-4 space-y-6 max-w-lg mx-auto">
                {/* Profile Section */}
                <div className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">{t('settings.account')}</h2>
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
                                            <p className="font-medium text-white">{profile?.username || t('common.loading')}</p>
                                            <p className="text-xs text-slate-400">{t('settings.username')}</p>
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
                                                setNewFirstName(profile?.first_name || '');
                                                setNewLastName(profile?.last_name || '');
                                                setNewNationality(profile?.nationality || '');
                                                setNewRacket(profile?.racket || '');
                                                setNewDescClub(profile?.main_club_id || '');
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
                                        {t('settings.edit')}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* First Name Edit Row */}
                        <div className="w-full flex items-center justify-between p-4 border-b border-slate-700/50">
                            <div className="flex items-center gap-3 flex-1">
                                <div className="p-2 rounded-full bg-blue-500/10 text-blue-400">
                                    <User size={20} />
                                </div>
                                <div className="text-left flex-1">
                                    {isEditing ? (
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase text-slate-500 font-bold">{t('auth.first_name')}</label>
                                            <input
                                                type="text"
                                                value={newFirstName}
                                                onChange={(e) => setNewFirstName(e.target.value)}
                                                className="w-full bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <p className="font-medium text-white">{profile?.first_name || '-'}</p>
                                            <p className="text-xs text-slate-400">{t('auth.first_name')}</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Last Name Edit Row */}
                        <div className="w-full flex items-center justify-between p-4 border-b border-slate-700/50">
                            <div className="flex items-center gap-3 flex-1">
                                <div className="p-2 rounded-full bg-blue-500/10 text-blue-400">
                                    <User size={20} />
                                </div>
                                <div className="text-left flex-1">
                                    {isEditing ? (
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase text-slate-500 font-bold">{t('auth.last_name')}</label>
                                            <input
                                                type="text"
                                                value={newLastName}
                                                onChange={(e) => setNewLastName(e.target.value)}
                                                className="w-full bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <p className="font-medium text-white">{profile?.last_name || '-'}</p>
                                            <p className="text-xs text-slate-400">{t('auth.last_name')}</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Nationality Edit Row */}
                        <div className="w-full flex items-center justify-between p-4 border-b border-slate-700/50">
                            <div className="flex items-center gap-3 flex-1">
                                <div className="p-2 rounded-full bg-blue-500/10 text-blue-400">
                                    <Flag size={20} />
                                </div>
                                <div className="text-left flex-1">
                                    {isEditing ? (
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase text-slate-500 font-bold">{t('settings.nationality')}</label>
                                            <select
                                                value={newNationality}
                                                onChange={(e) => setNewNationality(e.target.value)}
                                                className="w-full bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                            >
                                                <option value="">{t('settings.select_country')}</option>
                                                {countries.map((c) => (
                                                    <option key={c.code} value={c.code}>
                                                        {c.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="font-medium text-white flex items-center gap-2">
                                                {profile?.nationality ? (
                                                    <>
                                                        <img
                                                            src={`https://flagcdn.com/w40/${profile.nationality.toLowerCase()}.png`}
                                                            srcSet={`https://flagcdn.com/w80/${profile.nationality.toLowerCase()}.png 2x`}
                                                            width="24"
                                                            alt={countries.find(c => c.code === profile.nationality)?.name}
                                                            className="rounded-sm"
                                                        />
                                                        <span>{countries.find(c => c.code === profile.nationality)?.name}</span>
                                                    </>
                                                ) : '-'}
                                            </p>
                                            <p className="text-xs text-slate-400">{t('settings.nationality')}</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Racket Edit Row */}
                        <div className="w-full flex items-center justify-between p-4 border-b border-slate-700/50">
                            <div className="flex items-center gap-3 flex-1">
                                <div className="p-2 rounded-full bg-blue-500/10 text-blue-400">
                                    <img src="/pala-padel-profile.png" alt=" Pala Padel" width="20" height="20" />
                                </div>
                                <div className="text-left flex-1">
                                    {isEditing ? (
                                        <div className="space-y-1">
                                            <label className="text-[10px] uppercase text-slate-500 font-bold">{t('settings.racket')}</label>
                                            <input
                                                type="text"
                                                value={newRacket}
                                                onChange={(e) => setNewRacket(e.target.value)}
                                                placeholder={t('settings.enter_racket') || 'e.g. NOX AT10 Luxury Genius'}
                                                className="w-full bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                            />
                                        </div>
                                    ) : (
                                        <>
                                            <p className="font-medium text-white">{profile?.racket || '-'}</p>
                                            <p className="text-xs text-slate-400">{t('settings.racket')}</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Club Row */}
                        <div className="w-full flex items-center justify-between p-4 bg-slate-800/50">
                            <div className="flex items-center gap-3 flex-1">
                                <div className="p-2 rounded-full bg-green-500/10 text-green-400">
                                    <MapPin size={20} />
                                </div>
                                <div className="text-left flex-1">
                                    {isEditing ? (
                                        <select
                                            value={newDescClub}
                                            onChange={(e) => setNewDescClub(e.target.value)}
                                            className="w-full bg-slate-900 text-white border border-slate-600 rounded px-2 py-1 text-sm focus:outline-none focus:border-green-500 transition-colors"
                                        >
                                            <option value="">{t('clubs.select_club_if_you_wish') || 'Select Club'}</option>
                                            {clubs.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <>
                                            <p className="font-medium text-white">
                                                {profile?.main_club_id
                                                    ? clubs.find(c => c.id === profile.main_club_id)?.name || 'Unknown Club'
                                                    : (t('clubs.no_club_selected') || 'No Club Selected')
                                                }
                                            </p>
                                            <p className="text-xs text-slate-400">{t('clubs.main_club') || 'Main Club'}</p>
                                        </>
                                    )}
                                </div>
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
                                    <span className="font-medium text-white">{t('settings.security')}</span>
                                </div>
                                {isChangingPassword ? <ChevronLeft size={18} className="text-slate-500 -rotate-90" /> : <ChevronRight size={18} className="text-slate-500" />}
                            </button>

                            {/* Password Change Form */}
                            {isChangingPassword && (
                                <div className="p-4 pt-0 space-y-3 bg-slate-800/50">
                                    <input
                                        type="password"
                                        placeholder={t('settings.new_password')}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full bg-slate-900 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                                    />
                                    <input
                                        type="password"
                                        placeholder={t('settings.confirm_password')}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full bg-slate-900 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
                                    />
                                    <div className="flex justify-end gap-2 pt-2 pb-4 border-b border-slate-700/50">
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
                                            {t('settings.cancel')}
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={handleUpdatePassword}
                                            disabled={loading || !newPassword || !confirmPassword}
                                            className="bg-orange-500 hover:bg-orange-600 text-white"
                                        >
                                            {loading ? <Loader2 size={16} className="animate-spin" /> : t('settings.update_password')}
                                        </Button>
                                    </div>

                                    {/* Danger Zone */}
                                    <div className="pt-2">
                                        <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider mb-2">{t('settings.danger_zone')}</p>
                                        <Button
                                            variant="danger"
                                            className="w-full text-xs h-9 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border-red-500/20"
                                            onClick={handleDeleteAccount}
                                        >
                                            {t('settings.delete_account')}
                                        </Button>
                                        <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                                            {t('settings.delete_account_desc')}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Subscriptions */}
                        <div className="space-y-2">

                            <div className="border-t border-slate-700/50">
                                <div className="flex items-center justify-between p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-full bg-indigo-500/10 text-indigo-400">
                                            <ShoppingCart size={20} />
                                        </div>
                                        <span className="font-medium text-white">{t('settings.subscription')}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-sm text-slate-400 font-mono">
                                            {profile?.subscription_end_date
                                                ? new Date(profile.subscription_end_date).toLocaleDateString()
                                                : '-'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>




                    </div>


                </div>


                {/* Preferences */}
                <div className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">{t('settings.preferences')}</h2>
                    <div className="rounded-xl bg-slate-800 border border-slate-700/50 overflow-hidden divide-y divide-slate-700/50">
                        {/* Language */}
                        <div className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-indigo-500/10 text-indigo-400">
                                    <Globe size={20} />
                                </div>
                                <span className="font-medium text-white">{t('settings.language')}</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => changeLanguage('en')}
                                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${i18n.language.startsWith('en') ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                >
                                    EN
                                </button>
                                <button
                                    onClick={() => changeLanguage('es')}
                                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${i18n.language.startsWith('es') ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                >
                                    ES
                                </button>
                                <button
                                    onClick={() => changeLanguage('de')}
                                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${i18n.language.startsWith('de') ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                >
                                    DE
                                </button>
                            </div>
                        </div>

                        {/* por ahora las dejamos comentadas y sin uso a pesar de haber creado ya en la DB la columna. 
                        Posible desarrollo futuro. */}

                        {/* Notifications */}
                        {/* Notifications */}
                        {/* Push Notifications Toggle */}
                        <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-purple-500/10 text-purple-400">
                                    <Bell size={20} />
                                </div>
                                <div className="flex flex-col text-left">
                                    <span className="font-medium text-white">{t('settings.push_notifications') || 'Push Notifications'}</span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-500">
                                            {isPushEnabled ? (t('common.active') || 'Active') : (t('common.inactive') || 'Inactive')}
                                        </span>
                                        <div className="text-[10px] text-slate-500">({t('settings.push_notifications_only_for_messages') || 'Only for messages'})</div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={async () => {
                                    if (isPushEnabled) {
                                        await unsubscribeFromPush();
                                    } else {
                                        try {
                                            await subscribeToPush();
                                            setIsPushEnabled(true);
                                        } catch (error: any) {
                                            console.error("Failed to enable push:", error);
                                            window.alert("Failed to enable push: " + (error.message || error));
                                            setIsPushEnabled(false);
                                        }
                                    }
                                }}
                                disabled={pushLoading}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${isPushEnabled ? 'bg-purple-600' : 'bg-slate-700'}`}
                            >
                                <span
                                    className={`${isPushEnabled ? 'translate-x-6' : 'translate-x-1'
                                        } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                                />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Support */}
                <div className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">{t('settings.support')}</h2>
                    <div className="rounded-xl bg-slate-800 border border-slate-700/50 overflow-hidden shadow-none transition-colors duration-300">
                        <button
                            onClick={() => window.location.href = 'mailto:padeluppadeleros@gmail.com?subject=Feedback and support%20for%20PadelUp'}
                            className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-emerald-500/10 text-emerald-400">
                                    <HelpCircle size={20} />
                                </div>
                                <span className="font-medium text-white">{t('settings.help')}</span>
                            </div>
                            <ChevronRight size={18} className="text-slate-500" />
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-500 px-2 leading-relaxed">
                        {t('settings.support_desc')}
                    </p>
                </div>

                {/* Legal Section */}
                <div className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">Legal</h2>
                    <div className="rounded-xl bg-slate-800 border border-slate-700/50 overflow-hidden shadow-none transition-colors duration-300">
                        <button
                            onClick={() => navigate('/privacy-policy')}
                            className="w-full flex items-center justify-between p-4 border-b border-slate-700/50 hover:bg-slate-700/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-slate-500/10 text-slate-400">
                                    <FileText size={20} />
                                </div>
                                <span className="font-medium text-white">{t('legal.privacy_policy')}</span>
                            </div>
                            <ChevronRight size={18} className="text-slate-500" />
                        </button>
                        <button
                            onClick={() => navigate('/impressum')}
                            className="w-full flex items-center justify-between p-4 border-b border-slate-700/50 hover:bg-slate-700/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-slate-500/10 text-slate-400">
                                    <FileText size={20} />
                                </div>
                                <span className="font-medium text-white">{t('legal.impressum')}</span>
                            </div>
                            <ChevronRight size={18} className="text-slate-500" />
                        </button>
                        <button
                            onClick={() => navigate('/terms')}
                            className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-slate-500/10 text-slate-400">
                                    <FileText size={20} />
                                </div>
                                <span className="font-medium text-white">{t('legal.terms')}</span>
                            </div>
                            <ChevronRight size={18} className="text-slate-500" />
                        </button>
                    </div>
                </div>

                {/* ELO Info */}
                <div className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 ml-1">{t('settings.how_it_works')}</h2>
                    <div className="rounded-xl bg-slate-800 border border-slate-700/50 p-4 space-y-3">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 rounded-full bg-blue-500/10 text-blue-400">
                                <Shield size={20} />
                            </div>
                            <span className="font-medium text-white">{t('settings.dynamic_elo')}</span>
                        </div>
                        <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
                            <p dangerouslySetInnerHTML={{ __html: t('settings.elo_desc').replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-300">$1</strong>') }} />
                            <ul className="list-disc pl-4 space-y-1">
                                <li>
                                    {t('settings.elo_placement')}
                                </li>
                                <li>
                                    {t('settings.elo_standard')}
                                </li>
                                <li>
                                    {t('settings.elo_stable')}
                                </li>
                            </ul>
                            <p className="mt-2 text-[10px] text-slate-500 italic">
                                <span dangerouslySetInnerHTML={{ __html: t('settings.elo_note').replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-300">$1</strong>') }} />
                            </p>
                        </div>
                    </div>
                </div>

                {/* Logout */}
                <Button
                    variant="danger"
                    className="w-full h-12 gap-2 mt-8 text-red-400 border-red-500/20 bg-red-500/10 hover:bg-red-500/20"
                    onClick={handleLogout}
                >
                    <LogOut size={18} />
                    {t('settings.logout')}
                </Button>

                {/* PWA Install Button (Only visible if installable) */}
                {deferredPrompt && (
                    <div className="pt-4">
                        <Button
                            onClick={handleInstallClick}
                            className="w-full h-12 gap-2 bg-green-500 hover:bg-green-600 text-slate-900 font-bold"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></svg>
                            {t('settings.install_app')}
                        </Button>
                        <p className="text-[10px] text-center text-slate-500 mt-2">
                            {t('settings.install_app_desc')}
                        </p>
                    </div>
                )}

                <div className="text-center pt-4">
                    <p className="text-xs text-slate-500">{APP_FULL_VERSION}</p>
                    <p className="text-[10px] text-slate-500 mt-1">Built with ❤️ for Padel Lovers</p>
                    <p className="text-[10px] text-slate-500 mt-1">{currentYear} By Alvaro Barcelona Peralta</p>
                </div>
            </div>
        </div>
    );
};


export default Settings;
