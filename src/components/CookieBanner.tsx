import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';

const CookieBanner = () => {
    const { t } = useTranslation();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const consent = localStorage.getItem('cookie_consent');
        if (!consent) {
            setIsVisible(true);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem('cookie_consent', 'accepted');
        setIsVisible(false);
    };

    const handleDecline = () => {
        localStorage.setItem('cookie_consent', 'declined');
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 p-4 z-50 shadow-lg animate-in slide-in-from-bottom duration-500">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-gray-300 text-sm text-center sm:text-left">
                    {t('legal.cookie_banner.text')}
                </p>
                <div className="flex gap-4">
                    <button
                        onClick={handleDecline}
                        className="text-gray-400 hover:text-white text-sm font-medium transition-colors"
                    >
                        {t('legal.cookie_banner.decline')}
                    </button>
                    <Button
                        onClick={handleAccept}
                        className="whitespace-nowrap bg-emerald-500 hover:bg-emerald-600 text-white"
                        size="sm"
                    >
                        {t('legal.cookie_banner.accept')}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default CookieBanner;
