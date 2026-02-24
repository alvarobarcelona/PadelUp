import { Bot } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AiChatButtonProps {
    onClick: () => void;
}

const AiChatButton = ({ onClick }: AiChatButtonProps) => {
    const { t } = useTranslation();
    return (
        <button
            onClick={onClick}
            className="fixed bottom-36 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600  opacity-40 text-white shadow-lg shadow-purple-500/30 transition-all hover:scale-110 active:scale-95 hover:shadow-purple-500/50 animate-bounce-in"
            aria-label={t('ai_assistant.title')}
        >
            <Bot size={24} />
        </button>
    );
};

export default AiChatButton;
