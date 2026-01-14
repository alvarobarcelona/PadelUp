import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { logActivity } from '../lib/logger';
import { useTranslation } from 'react-i18next';
import { useModal } from '../context/ModalContext';

const Auth = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { alert } = useModal();
    const [loading, setLoading] = useState(false);
    const [isLogin, setIsLogin] = useState(true);
    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [clubs, setClubs] = useState<any[]>([]);
    const [selectedClubId, setSelectedClubId] = useState<number | string>(''); // Default empty or first club

    useEffect(() => {
        const fetchClubs = async () => {
            const { data } = await supabase.from('clubs').select('*').order('id', { ascending: true });
            if (data) {
                setClubs(data);
                setClubs(data);
                // Default to empty (no club selected)
                // if (data.length > 0) setSelectedClubId(data[0].id);
            }
        };
        fetchClubs();
    }, []);

    const getFriendlyErrorMessage = (msg: string) => {
        if (msg.includes('Invalid login credentials')) return t('auth.errors.incorrect_credentials');
        if (msg.includes('Password should be at least')) return t('auth.errors.password_short');
        if (msg.includes('User already registered')) return t('auth.errors.user_registered');
        return msg;
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data: profileCheck, error: profileCheckError } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', email)
                .single();

            if (profileCheckError || !profileCheck) {

                if (profileCheckError?.code === 'PGRST116' || !profileCheck) {
                    throw new Error(t('auth.errors.email_not_found'));
                }

            }


            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password', // or just root
            });
            if (error) throw error;

            logActivity('USER_RESET_PASSWORD', null, { email });

            await alert({
                title: 'Success',
                message: t('auth.success.reset_sent'),
                type: 'success'
            });
            setIsForgotPassword(false);
            setIsLogin(true);
        } catch (err: any) {
            setError(getFriendlyErrorMessage(err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isForgotPassword) {
            await handleResetPassword(e);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            if (isLogin) {
                // Pre-check for email existence to provide specific error message
                const { data: userExists } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('email', email)
                    .maybeSingle();

                if (!userExists) {
                    throw new Error(t('auth.errors.email_not_found_signup'));
                }

                const { error, data } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) {
                    // Since email exists, this is likely a password error
                    if (error.message.includes('Invalid login credentials')) {
                        throw new Error(t('auth.errors.incorrect_password'));
                    }
                    throw error;
                }

                // LOG LOGIN
                if (data.user) {
                    logActivity('USER_LOGIN', data.user.id, { email });
                }

                navigate('/');
            } else {
                // Check if user already exists in profiles
                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select('email, username')
                    .or(`email.eq.${email},username.eq.${username}`)
                    .maybeSingle();

                if (existingProfile) {
                    if (existingProfile.email === email) {
                        throw new Error(t('auth.errors.email_registered'));
                    }
                    if (existingProfile.username === username) {
                        throw new Error(t('auth.errors.username_taken'));
                    }
                }

                const { error, data } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: window.location.origin,
                        data: {
                            username: username,
                            email: email
                        }
                    }
                });
                if (error) throw error;

                // UPDATE PROFILE WITH CLUB
                if (data.user && selectedClubId) {
                    await supabase.from('profiles').update({ main_club_id: selectedClubId }).eq('id', data.user.id);
                }

                // LOG REGISTER
                if (data.user) {
                    logActivity('USER_REGISTER', data.user.id, { username, email });

                    // Notify Admin
                    supabase.functions.invoke('notify-admin', {
                        body: {
                            record: {
                                username: username,
                                id: data.user.id,
                                email: email
                            }
                        }
                    }).then(({ error }) => {
                        if (error) console.error('Failed to notify admin:', error);
                    });
                }

                await alert({
                    title: 'Success',
                    message: t('auth.success.signup_confirm'),
                    type: 'success'
                });
            }
        } catch (err: any) {
            setError(getFriendlyErrorMessage(err.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-4">
            <div className="w-full max-w-sm space-y-8">
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-green-400">PadelUp</h1>
                    <p className="mt-2 text-slate-400">
                        {isForgotPassword ? t('auth.reset_password_title') : (isLogin ? t('auth.welcome_back') : t('auth.join_club'))}
                    </p>
                </div>

                <form onSubmit={handleAuth} className="space-y-4">
                    {!isLogin && !isForgotPassword && (
                        <div>
                            <label className="block text-sm font-medium text-slate-400">{t('auth.username')}</label>
                            <input
                                type="text"
                                required
                                className="mt-1 block w-full rounded-lg bg-slate-800 border-transparent focus:border-green-500 focus:bg-slate-700 focus:ring-0 text-white p-3 transition-colors"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-400">{t('auth.email')}</label>
                        <input
                            type="email"
                            required
                            className="mt-1 block w-full rounded-lg bg-slate-800 border-transparent focus:border-green-500 focus:bg-slate-700 focus:ring-0 text-white p-3 transition-colors"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    {/* Club Selection */}
                    {!isLogin && (
                        <div>
                            <label className="block text-sm font-medium text-slate-400">{t('clubs.select_club_if_you_wish')}</label>
                            <select
                                className="mt-1 block w-full rounded-lg bg-slate-800 border-transparent focus:border-green-500 focus:bg-slate-700 focus:ring-0 text-white p-3 transition-colors"
                                value={selectedClubId}
                                onChange={(e) => setSelectedClubId(Number(e.target.value))}
                            >
                                <option value="">{t('clubs.no_club_selected')}</option>
                                {clubs.map(club => (
                                    <option key={club.id} value={club.id}>
                                        {club.name} ({club.location})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Password Field - Hide in Forgot Password Mode */}
                    {!isForgotPassword && (
                        <div>
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-medium text-slate-400">{t('auth.password')}</label>
                                {isLogin && (
                                    <button
                                        type="button"
                                        onClick={() => setIsForgotPassword(true)}
                                        className="text-xs text-green-400 hover:text-green-300"
                                    >
                                        {t('auth.forgot_password')}
                                    </button>
                                )}
                            </div>
                            <div className="relative mt-1">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required={!isForgotPassword}
                                    className="block w-full rounded-lg bg-slate-800 border-transparent focus:border-green-500 focus:bg-slate-700 focus:ring-0 text-white p-3 pr-10 transition-colors"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-white"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="w-full" isLoading={loading}>
                        {isForgotPassword ? t('auth.send_reset_link') : (isLogin ? t('auth.sign_in') : t('auth.create_account'))}
                    </Button>

                    {isForgotPassword && (
                        <div className="text-center mt-2">
                            <button
                                type="button"
                                onClick={() => setIsForgotPassword(false)}
                                className="text-sm text-slate-500 hover:text-white transition-colors"
                            >
                                {t('auth.back_to_login')}
                            </button>
                        </div>
                    )}

                    <div className="text-center">
                        <button
                            type="button"
                            onClick={() => {
                                setIsLogin(!isLogin);
                                setIsForgotPassword(false);
                            }}
                            className="text-sm text-slate-500 hover:text-green-400 transition-colors"
                        >
                            {isLogin ? t('auth.no_account') : t('auth.has_account')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


export default Auth;
