import { LogOut, Clock, Shield, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';

const PendingApproval = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        setChecking(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/auth');
                return;
            }

            const { data: profile } = await supabase
                .from('profiles')
                .select('approved, is_admin')
                .eq('id', user.id)
                .single();

            if (profile && (profile.approved || profile.is_admin)) {
                navigate('/');
            }
        } catch (error) {
            console.error('Error checking status:', error);
        } finally {
            setChecking(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/auth');
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-900 text-center animate-fade-in relative z-10">
            <div className="mb-6 rounded-full bg-yellow-500/10 p-6 relative">
                <Clock size={48} className="text-yellow-500" />
                {checking && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 rounded-full">
                        <RefreshCw className="animate-spin text-white" size={24} />
                    </div>
                )}
            </div>

            <h1 className="mb-2 text-2xl font-bold text-white">{t('pending.title')}</h1>

            <p className="mb-8 max-w-sm text-slate-400">
                {t('pending.message')}
            </p>

            <div className="flex flex-col gap-3 w-full max-w-xs mb-8">
                <Button
                    onClick={checkStatus}
                    isLoading={checking}
                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500"
                >
                    <RefreshCw size={18} className={checking ? 'animate-spin' : ''} />
                    {t('pending.check_status') || 'Check Status'}
                </Button>

                <Button variant="outline" onClick={handleLogout} className="w-full gap-2 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800">
                    <LogOut size={18} />
                    {t('pending.sign_out')}
                </Button>
            </div>

            <div className="mb-8 rounded-lg bg-slate-800 p-4 border border-slate-700 max-w-sm w-full">
                <div className="flex items-center gap-3 mb-2">
                    <Shield size={20} className="text-green-400" />
                    <span className="font-semibold text-white">{t('pending.what_happens')}</span>
                </div>
                <p className="text-sm text-slate-400 text-left">
                    {t('pending.what_happens_desc')}
                </p>
            </div>
        </div>
    );
};

export default PendingApproval;
