import { LogOut, Clock, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useTranslation } from 'react-i18next';

const PendingApproval = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/auth');
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-900 text-center animate-fade-in">
            <div className="mb-6 rounded-full bg-yellow-500/10 p-6">
                <Clock size={48} className="text-yellow-500" />
            </div>

            <h1 className="mb-2 text-2xl font-bold text-white">{t('pending.title')}</h1>

            <p className="mb-8 max-w-sm text-slate-400">
                {t('pending.message')}
            </p>

            <div className="mb-8 rounded-lg bg-slate-800 p-4 border border-slate-700 max-w-sm w-full">
                <div className="flex items-center gap-3 mb-2">
                    <Shield size={20} className="text-green-400" />
                    <span className="font-semibold text-white">{t('pending.what_happens')}</span>
                </div>
                <p className="text-sm text-slate-400 text-left">
                    {t('pending.what_happens_desc')}
                </p>
            </div>

            <Button variant="outline" onClick={handleLogout} className="gap-2 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800">
                <LogOut size={18} />
                {t('pending.sign_out')}
            </Button>
        </div>
    );
};

export default PendingApproval;
