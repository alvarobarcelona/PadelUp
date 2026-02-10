import { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Bot, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { askAssistant } from '../../lib/ai-chat';

interface AiMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface AiChatDrawerProps {
    isOpen: boolean;
    onClose: () => void;
}

const AiChatDrawer = ({ isOpen, onClose }: AiChatDrawerProps) => {
    const { t } = useTranslation();
    const [messages, setMessages] = useState<AiMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    const suggestions = [
        { key: 'performance', label: t('ai_assistant.suggestions.performance', { defaultValue: 'Mi rendimiento este mes' }) },
        { key: 'best_partner', label: t('ai_assistant.suggestions.best_partner', { defaultValue: 'Mejor pareja' }) },
        { key: 'current_streak', label: t('ai_assistant.suggestions.current_streak', { defaultValue: 'Racha actual' }) },
        { key: 'win_rate', label: t('ai_assistant.suggestions.win_rate', { defaultValue: 'Mi win rate' }) },
    ];

    const handleSend = async (text?: string) => {
        const messageText = (text || input).trim();
        if (!messageText || isLoading) return;

        const userMessage: AiMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: messageText,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        // Reset textarea height
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
        }

        try {
            const reply = await askAssistant(messageText);
            const assistantMessage: AiMessage = {
                id: `ai-${Date.now()}`,
                role: 'assistant',
                content: reply,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, assistantMessage]);
        } catch (err: any) {
            const errorMessage: AiMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: t('ai_assistant.error', { defaultValue: 'No pude procesar tu pregunta. Inténtalo de nuevo.' }),
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, errorMessage]);
            console.error('AI error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const adjustTextareaHeight = () => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col animate-fade-in">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Drawer Panel */}
            <div className="relative ml-auto h-full w-full max-w-md bg-slate-900 shadow-2xl flex flex-col animate-slide-in-right">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-gradient-to-r from-indigo-900/40 to-purple-900/40">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                            <Bot size={20} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white">{t('ai_assistant.title', { defaultValue: 'PadelUp Assistant' })}</h3>
                            <p className="text-[10px] text-purple-300/80 flex items-center gap-1">
                                <Sparkles size={10} />
                                Powered by AI
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700/50 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    {/* Welcome message if no messages */}
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-4">
                            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-purple-500/20 flex items-center justify-center">
                                <Bot size={32} className="text-purple-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white mb-1">
                                    {t('ai_assistant.title', { defaultValue: 'PadelUp Assistant' })}
                                </h3>
                                <p className="text-sm text-slate-400 leading-relaxed">
                                    {t('ai_assistant.welcome', { defaultValue: '¡Hola! Soy tu asistente PadelUp. Pregúntame sobre tus estadísticas, rendimiento o torneos.' })}
                                </p>
                            </div>

                            {/* Suggestion Chips */}
                            <div className="flex flex-wrap gap-2 justify-center mt-2">
                                {suggestions.map((s) => (
                                    <button
                                        key={s.key}
                                        onClick={() => handleSend(s.label)}
                                        className="px-3 py-1.5 text-xs font-medium rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:border-purple-400/50 transition-all active:scale-95"
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Message Bubbles */}
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === 'user'
                                    ? 'bg-green-500 text-slate-900 rounded-br-md'
                                    : 'bg-gradient-to-br from-indigo-600/30 to-purple-600/30 border border-purple-500/20 text-slate-100 rounded-bl-md'
                                    }`}
                            >
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-green-800' : 'text-purple-300/50'}`}>
                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    ))}

                    {/* Loading indicator */}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-gradient-to-br from-indigo-600/30 to-purple-600/30 border border-purple-500/20 rounded-2xl rounded-bl-md px-4 py-3">
                                <div className="flex items-center gap-2 text-purple-300">
                                    <Loader2 size={14} className="animate-spin" />
                                    <span className="text-xs">{t('ai_assistant.thinking', { defaultValue: 'Analizando...' })}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Suggestion Chips — always visible */}
                {!isLoading && (
                    <div className="border-t border-slate-700/30 px-4 py-2 bg-slate-900/80">
                        <div className="flex flex-wrap gap-1.5">
                            {suggestions.map((s) => (
                                <button
                                    key={s.key}
                                    onClick={() => handleSend(s.label)}
                                    className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:border-purple-400/50 transition-all active:scale-95"
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input Bar */}
                <div className="border-t border-slate-700/50 px-4 py-3 bg-slate-900/95">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            handleSend();
                        }}
                        className="flex items-end gap-2"
                    >
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value);
                                adjustTextareaHeight();
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder={t('ai_assistant.placeholder', { defaultValue: 'Pregúntame algo...' })}
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors resize-none max-h-[120px]"
                            rows={1}
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="h-10 w-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-purple-500/20 transition-all active:scale-95"
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AiChatDrawer;
