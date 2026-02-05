
import { useEffect, useState } from 'react';
import { Bell, BellRing, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { Button } from '../ui/Button';

export const PushNotificationPrompt = () => {
    const { t } = useTranslation();
    const { subscribeToPush, loading } = usePushNotifications();
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const checkStatus = () => {
            // 1. Check if browser supports notifications
            if (!("Notification" in window)) return;

            // 2. Check current permission
            if (Notification.permission === 'granted' || Notification.permission === 'denied') return;

            // 3. Check view count (Max 5 times)
            const count = parseInt(localStorage.getItem('push_prompt_count') || '0');
            if (count >= 1000) return;

            // 4. Show Prompt & Increment Count
            setIsOpen(true);
            localStorage.setItem('push_prompt_count', (count + 1).toString());
        };

        // Delay slightly to not overwhelm on initial load
        const timer = setTimeout(checkStatus, 3000);
        return () => clearTimeout(timer);
    }, []);

    const handleEnable = async () => {
        try {
            await subscribeToPush();
            setIsOpen(false);
        } catch (error) {
            setIsOpen(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-slide-up-fade">

            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl animate-scale-in">
                    <button
                        onClick={() => setIsOpen(false)}
                        className="absolute top-4 right-4 text-slate-500 hover:text-white"
                    >
                        <X size={24} />
                    </button>

                    <div className="flex flex-col items-center text-center gap-4">
                        <div className="p-4 bg-blue-500/10 rounded-full text-blue-400 animate-bounce-subtle">
                            <BellRing size={48} />
                        </div>

                        <div>
                            <h3 className="text-xl font-bold text-white mb-2">{t('push_prompt.title', 'Enable Notifications')}</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                {t('push_prompt.description', 'Don\'t miss out on match invitations and chat messages. Enable push notifications to stay updated!')}
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 w-full mt-2">
                            <Button
                                onClick={handleEnable}
                                disabled={loading}
                                className="w-full bg-blue-600 hover:bg-blue-500 py-6 text-lg flex items-center justify-center gap-2"
                            >
                                {loading ? <Bell size={20} className="animate-spin" /> : <BellRing size={20} />}
                                {t('push_prompt.enable_button', 'Turn On Notifications')}
                            </Button>

                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-slate-500 text-sm hover:text-slate-300 py-2"
                            >
                                {t('push_prompt.not_now', 'Maybe later')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
