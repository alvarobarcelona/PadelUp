import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';

interface TermsAcceptanceModalProps {
    onAccept: () => Promise<void>;
}

const TermsAcceptanceModal: React.FC<TermsAcceptanceModalProps> = ({ onAccept }) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [checked, setChecked] = useState(false);

    const handleAccept = async () => {
        if (!checked) return;
        setLoading(true);
        try {
            await onAccept();
        } catch (error) {
            console.error(error);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md bg-slate-800 rounded-xl shadow-2xl border border-slate-700 p-6 space-y-6">
                <div className="text-center space-y-2">
                    <h2 className="text-xl font-bold text-white">
                        {t('legal.terms_update_modal.title')}
                    </h2>
                    <p className="text-sm text-slate-400">
                        {t('legal.terms_update_modal.message')}
                    </p>
                </div>

                <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700/50">
                    <div className="flex items-start gap-3">
                        <input
                            type="checkbox"
                            id="accept-terms-modal"
                            checked={checked}
                            onChange={(e) => setChecked(e.target.checked)}
                            className="mt-1 h-5 w-5 rounded border-slate-600 bg-slate-800 text-green-500 focus:ring-green-500 cursor-pointer"
                        />
                        <label htmlFor="accept-terms-modal" className="text-xs text-slate-300 cursor-pointer select-none">
                            <span dangerouslySetInnerHTML={{
                                __html: t('legal.consent_checkbox', {
                                    terms: `<a href="/terms" target="_blank" class="text-green-400 hover:underline underline-offset-2">${t('legal.terms')}</a>`,
                                    privacy: `<a href="/privacy-policy" target="_blank" class="text-green-400 hover:underline underline-offset-2">${t('legal.privacy_policy')}</a>`
                                })
                            }} />
                        </label>
                    </div>
                </div>

                <Button
                    onClick={handleAccept}
                    disabled={!checked || loading}
                    isLoading={loading}
                    className="w-full"
                >
                    {t('legal.terms_update_modal.accept_button')}
                </Button>
            </div>
        </div>
    );
};

export default TermsAcceptanceModal;
