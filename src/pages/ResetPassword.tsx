
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useModal } from '../context/ModalContext';

const ResetPassword = () => {
    const { t } = useTranslation();
    const { alert } = useModal();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Check if we have a session (the link should have logged us in)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                // If no session, maybe the link expired or didn't work. Redirect to auth.
                navigate('/auth');
            }
        });
    }, [navigate]);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            setError(t('auth.password_mismatch'));
            return;
        }

        if (password.length < 6) {
            setError(t('auth.password_short'));
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) throw error;

            await alert({
                title: 'Success',
                message: t('auth.password_updated'),
                type: 'success'
            });
            navigate('/');
        } catch (err: any) {
            setError(err.message);
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
                        {t('auth.set_new_password')}
                    </p>
                </div>

                <form onSubmit={handleUpdatePassword} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400">{t('auth.new_password')}</label>
                        <input
                            type="password"
                            required
                            className="mt-1 block w-full rounded-lg bg-slate-800 border-transparent focus:border-green-500 focus:bg-slate-700 focus:ring-0 text-white p-3 transition-colors"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400">{t('auth.confirm_password')}</label>
                        <input
                            type="password"
                            required
                            className="mt-1 block w-full rounded-lg bg-slate-800 border-transparent focus:border-green-500 focus:bg-slate-700 focus:ring-0 text-white p-3 transition-colors"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="w-full" isLoading={loading}>
                        {t('auth.update_password')}
                    </Button>
                </form>
            </div>
        </div>
    );
};

export default ResetPassword;
