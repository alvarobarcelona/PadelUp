import { useTranslation } from 'react-i18next';

const BetaBanner = () => {
    const { t } = useTranslation();

    return (
        <div className="bg-yellow-400 text-yellow-900 px-4 py-2 text-center text-sm font-medium shadow-sm">
            <p>{t('common.beta_message')}</p>
        </div>
    );
};

export default BetaBanner;
