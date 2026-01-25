import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';

const Impressum = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const handleBack = () => {
        if (window.history.length > 2) {
            navigate(-1);
        } else {
            navigate('/');
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 text-white">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={handleBack} className="text-gray-400 hover:text-white">
                    <ChevronLeft size={24} />
                </Button>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-500 bg-clip-text text-transparent">
                    {t('legal.impressum')}
                </h1>
            </div>

            <div className="space-y-6 text-gray-300 text-justify">
                <section>
                    <h2 className="text-xl font-semibold text-white mb-2">{t('legal.impressum_content.section1_title')}</h2>
                    <p className="whitespace-pre-line">{t('legal.impressum_content.section1_text')}</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold text-white mb-2">{t('legal.impressum_content.section2_title')}</h2>
                    <p className="whitespace-pre-line">{t('legal.impressum_content.section2_text')}</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold text-white mb-2">{t('legal.impressum_content.section3_title')}</h2>
                    <p>{t('legal.impressum_content.section3_text')}</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold text-white mb-2">{t('legal.impressum_content.section4_title')}</h2>
                    <p>{t('legal.impressum_content.section4_text')}</p>
                </section>

                <section>
                    <h2 className="text-xl font-semibold text-white mb-2">{t('legal.impressum_content.section5_title')}</h2>
                    <p>{t('legal.impressum_content.section5_text')}</p>
                </section>
            </div>
        </div>
    );
};

export default Impressum;
