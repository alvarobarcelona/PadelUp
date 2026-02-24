import { MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ChatButtonProps {
    onClick: () => void;
    unreadCount?: number;
}

const ChatButton = ({ onClick, unreadCount = 0 }: ChatButtonProps) => {
    const { t } = useTranslation();
    return (
        <button
            onClick={onClick}
            className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center opacity-40 rounded-full bg-green-500 text-slate-900 shadow-lg transition-transform hover:scale-110 active:scale-95 animate-bounce-in"
            aria-label={t('chat.open_chat')}
        >
            <MessageCircle size={28} />
            {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-sm animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </button>
    );
};

export default ChatButton;
