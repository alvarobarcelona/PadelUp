import { useState, useEffect } from 'react';
import { Share, MonitorSmartphone, X, MoreVertical, HardDriveDownload } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';

export const InstallPrompt = () => {
    const { t } = useTranslation();
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        // Check if already in standalone mode
        const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone ||
            document.referrer.includes('android-app://');

        setIsStandalone(isStandaloneMode);

        // Detect iOS
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
        setIsIOS(isIosDevice);

        // Check if previously dismissed
        const isDismissed = localStorage.getItem('pwa_install_dismissed');

        // Show prompt if not standalone and not dismissed (and on mobile ideally, but we show for all for now or check width)
        // Also good to wait a bit so it doesn't pop up immediately
        if (!isStandaloneMode && !isDismissed) {
            const timer = setTimeout(() => {
                setShowPrompt(true);
            }, 3000);
            return () => clearTimeout(timer);
        }

    }, []);

    const handleDismiss = () => {
        localStorage.setItem('pwa_install_dismissed', 'true');
        setShowPrompt(false);
    };

    if (!showPrompt || isStandalone) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 z-50 animate-slide-up-fade">
            <div className="bg-slate-900/95 backdrop-blur-md border border-green-500/30 shadow-2xl rounded-2xl p-4 max-w-md mx-auto relative overflow-hidden">
                {/* Background flair */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                <button
                    onClick={handleDismiss}
                    className="absolute top-2 right-2 text-slate-400 hover:text-white p-1"
                >
                    <X size={20} />
                </button>

                <div className="flex items-start gap-4 pr-6">
                    <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-3 rounded-xl shadow-lg shrink-0">
                        <MonitorSmartphone className="text-white" size={24} />
                    </div>

                    <div className="flex-1">
                        <h3 className="text-white font-bold text-lg mb-1">{t('install_prompt.title')}</h3>

                        <div className="text-slate-300 text-sm leading-relaxed space-y-2">
                            {isIOS ? (
                                <p>
                                    <Trans
                                        i18nKey="install_prompt.ios_instruction"
                                        components={{
                                            share_icon: <Share size={16} className="inline mx-1 text-blue-400" />,
                                            plus_icon: <span className='inline-flex items-center justify-center bg-slate-700 rounded px-1.5 py-0.5 text-xs text-white mx-1 border border-slate-600'>+</span>
                                        }}
                                    />
                                </p>
                            ) : (
                                <p>
                                    <Trans
                                        i18nKey="install_prompt.android_instruction"
                                        components={{
                                            menu_icon: <MoreVertical size={16} className="inline mx-1 text-slate-400" />,
                                            install_icon: <HardDriveDownload size={16} className="inline mx-1 text-green-400" />
                                        }}
                                    />
                                </p>
                            )}
                        </div>

                        <button
                            onClick={handleDismiss}
                            className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors font-medium"
                        >
                            {t('install_prompt.dismiss')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
