import { Trophy, Users, CheckCircle2 } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';

interface InfoModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const InfoModal = ({ isOpen, onClose }: InfoModalProps) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 animate-fade-in overflow-y-auto">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity overflow-y-auto"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl transition-all animate-scale-in">
                <div className="p-6">
                    <h2 className="text-2xl font-bold text-white mb-6 text-center">
                        {t('info_modal.title')}
                    </h2>

                    <div className="space-y-6">
                        {/* Step 1 */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0">
                                <div className="p-3 rounded-xl bg-green-500/10 text-green-500">
                                    <Trophy size={24} />
                                </div>
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-lg mb-1">{t('info_modal.step_1_title')}</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    {t('info_modal.step_1_desc')}
                                </p>
                            </div>
                        </div>

                        {/* Step 2 */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0">
                                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                                    <Users size={24} />
                                </div>
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-lg mb-1">{t('info_modal.step_2_title')}</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    <Trans i18nKey="info_modal.step_2_desc" components={{ b: <strong className="text-blue-400 font-bold" /> }} />
                                </p>
                            </div>
                        </div>

                        {/* Step 3 */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0">
                                <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
                                    <CheckCircle2 size={24} />
                                </div>
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-lg mb-1">{t('info_modal.step_3_title')}</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    {t('info_modal.step_3_desc')}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8">
                        <button
                            onClick={onClose}
                            className="w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
                        >
                            {t('common.back')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
