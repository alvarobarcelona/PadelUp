
import { t } from 'i18next';
import { Share } from 'lucide-react';

const IOSInstallGuide = () => {
    return (
        <div className="fixed inset-x-0 bottom-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 p-6 pb-7 safe-area-bottom rounded-t-2xl shadow-2xl animate-slide-up z-50">
            <div className="flex flex-col gap-6 max-w-md mx-auto">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">{t('install_prompt.title')}</h3>
                </div>

                <div className="space-y-4">
                    <div className="flex items-start gap-4">
                        <div className="bg-slate-800 p-2 rounded-lg text-blue-400">
                            <Share size={24} />
                        </div>
                        <div>
                            <p className="text-slate-300">{t('install_prompt.ios_instruction')}</p>
                        </div>
                    </div>
                </div>

                <div className="text-center text-sm text-slate-500 pt-2">
                    {t('install_prompt.ios_instruction_footer')}
                </div>
            </div>
        </div>
    );
};

export default IOSInstallGuide;
