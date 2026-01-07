import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const Banned = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/auth');
    };

    const [banDetails, setBanDetails] = useState<{ until: string | null }>({ until: null });

    useEffect(() => {
        const getBanDetails = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase.from('profiles').select('banned_until').eq('id', user.id).single();
                if (data?.banned_until) {
                    setBanDetails({ until: data.banned_until });
                }
            }
        };
        getBanDetails();
    }, []);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 p-4 text-center">
            <div className="bg-red-500/10 p-6 rounded-full mb-6 animate-pulse">
                <ShieldAlert size={64} className="text-red-500" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">{t('banned.title')}</h1>
            <p className="text-slate-400 mb-8 max-w-xs">
                {banDetails.until ? (
                    <span className="block mb-4 text-yellow-500 font-bold">
                        Banned until: {new Date(banDetails.until).toLocaleString()}
                    </span>
                ) : null}
                {t('banned.message')} <br />
                {t('banned.reason_1')} <br />
                {t('banned.reason_2')} <br />
                {t('banned.reason_3')} <br />
                {t('banned.contact_admin')}
            </p>
            <Button onClick={handleLogout} variant="danger" className="w-full max-w-xs">
                {t('banned.sign_out')}
            </Button>
        </div>
    );
};

export default Banned;
