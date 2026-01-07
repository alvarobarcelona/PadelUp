import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useTranslation } from 'react-i18next';
import { useModal } from '../context/ModalContext';

const Subscription = () => {
    const { t } = useTranslation();
    const { alert } = useModal();
    const [loading, setLoading] = useState(false);

    const handlePaymentConfirmation = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No user found');

            // Add 30 days to current time
            const nextMonth = new Date();
            nextMonth.setDate(nextMonth.getDate() + 30);

            const { data, error } = await supabase
                .from('profiles')
                .update({
                    subscription_end_date: nextMonth.toISOString()
                })
                .eq('id', user.id)
                .select();

            if (error) throw error;
            if (!data || data.length === 0) {
                throw new Error('Update failed - possibly restricted by server policies.');
            }

            await alert({
                title: 'Success',
                message: t('subscription.success'),
                type: 'success'
            });
            // Force reload to clear any cached states or re-run layout checks
            window.location.href = '/';
        } catch (error) {
            console.error('Error renewing subscription:', error);
            await alert({
                title: 'Error',
                message: t('subscription.error'),
                type: 'danger'
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900">
            <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 border border-slate-700 shadow-2xl text-center">
                <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle size={32} className="text-yellow-500" />
                </div>

                <h1 className="text-2xl font-bold text-white mb-2">{t('subscription.title')}</h1>
                <p className="text-slate-400 mb-8">
                    {t('subscription.message')}
                </p>

                <div className="bg-slate-900/50 rounded-xl p-6 mb-8 text-left border border-slate-700">
                    <div className="flex items-center gap-3 mb-4">
                        <CreditCard className="text-green-400" size={20} />
                        <span className="text-white font-medium">{t('subscription.monthly_fee')}: <span className="text-green-400 font-bold">3.00€</span></span>
                    </div>

                    <div className="space-y-2 text-sm text-slate-400">
                        <p>{t('subscription.payment_instructions')}</p>
                        <p className="text-white font-mono bg-slate-800 p-2 rounded text-center border border-slate-600 select-all">
                            camase1990@gmail.com
                            <p>Alvaro Barcelona Peralta</p>
                        </p>
                        <p className="text-xs text-center mt-1">{t('subscription.as_friend')}</p>
                        <p className="text-xs text-center mt-1">{t('subscription.contribution_note')}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <Button
                        onClick={handlePaymentConfirmation}
                        disabled={loading}
                        className="w-full bg-green-500 hover:bg-green-600 text-white font-bold h-12"
                    >
                        {loading ? t('subscription.processing') : t('subscription.confirm_payment')}
                    </Button>

                    <p className="text-xs text-slate-500">
                        {t('subscription.disclaimer')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Subscription;
