import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Send, Loader2, ArrowLeft, MessageSquarePlus, Trash2 } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { cn } from '../ui/Button';
import { useChat } from '../../context/ChatContext';
import { useModal } from '../../context/ModalContext';
import { useTranslation } from 'react-i18next';

interface Message {
    id: string;
    content: string;
    created_at: string;
    sender_id: string;
    receiver_id: string;
    sender?: {
        username: string;
        avatar_url: string | null;
    };
    deleted_by_sender?: boolean;
    deleted_by_receiver?: boolean;
}

interface ConversationUser {
    id: string;
    username: string;
    avatar_url: string | null;
    last_message?: string;
    last_message_time?: string;
    has_unread?: boolean;
}

interface ChatDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    activeUserId?: string | null; // If provided, opens chat with this user directly
    onActiveUserChange?: (userId: string | null) => void;
}

const ChatDrawer = ({ isOpen, onClose, activeUserId, onActiveUserChange }: ChatDrawerProps) => {
    const { t } = useTranslation();
    const { confirm } = useModal();
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [activeChatUser, setActiveChatUser] = useState<ConversationUser | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [conversations, setConversations] = useState<ConversationUser[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingConversations, setLoadingConversations] = useState(true);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, view]);

    // Initialize user and handle external activeUserId prop
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            setCurrentUser(user);
        });
    }, []);

    // Watch for external trigger to open a specific chat
    useEffect(() => {
        if (isOpen && activeUserId) {
            loadUserForChat(activeUserId);
        } else if (isOpen && !activeUserId) {
            setView('list');
            setActiveChatUser(null);
            fetchConversations();
        }
    }, [isOpen, activeUserId]);

    const { markAsRead } = useChat();

    const loadUserForChat = async (userId: string) => {
        setLoading(true);
        setView('chat');

        // Mark as read immediately when opening chat
        markAsRead(userId);

        // Fetch user details
        const { data } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .eq('id', userId)
            .single();

        if (data) {
            setActiveChatUser(data);
            fetchMessages(userId);
        }
        setLoading(false);
    };

    const fetchConversations = async () => {
        setLoadingConversations(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        try {
            // Fetch unique users we've messaged with
            // This is a bit tricky with simple SQL query in generic client, 
            // usually better with a distinct RPC or view, but we'll specific queries

            // 1. Get IDs of people who sent us messages
            const { data: incoming } = await supabase
                .from('messages')
                .select('sender_id, created_at, content, is_read, deleted_by_receiver')
                .eq('receiver_id', user.id)
                .order('created_at', { ascending: false });

            // 2. Get IDs of people we sent messages to
            const { data: outgoing } = await supabase
                .from('messages')
                .select('receiver_id, created_at, content, deleted_by_sender')
                .eq('sender_id', user.id)
                .order('created_at', { ascending: false });

            const interactionMap = new Map<string, { last_msg: string, time: string }>();

            incoming?.forEach(msg => {
                if (msg.deleted_by_receiver) return; // Skip deleted
                if (!interactionMap.has(msg.sender_id)) {
                    interactionMap.set(msg.sender_id, { last_msg: msg.content, time: msg.created_at });
                }
            });

            outgoing?.forEach(msg => {
                if (msg.deleted_by_sender) return; // Skip deleted
                const existing = interactionMap.get(msg.receiver_id);
                // If no existing or this message is newer
                if (!existing || new Date(msg.created_at) > new Date(existing.time)) {
                    interactionMap.set(msg.receiver_id, { last_msg: t('chat.you') + msg.content, time: msg.created_at });
                }
            });

            const userIds = Array.from(interactionMap.keys());

            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url')
                    .in('id', userIds);

                if (profiles) {
                    const unreadSenders = new Set(incoming?.filter((m: any) => !m.is_read).map((m: any) => m.sender_id));

                    const convos = profiles.map(p => ({
                        ...p,
                        last_message: interactionMap.get(p.id)?.last_msg,
                        last_message_time: interactionMap.get(p.id)?.time,
                        has_unread: unreadSenders.has(p.id)
                    })).sort((a, b) => new Date(b.last_message_time!).getTime() - new Date(a.last_message_time!).getTime());

                    setConversations(convos);
                }
            } else {
                setConversations([]);
            }

        } catch (error) {
            console.error('Error loading conversations', error);
        } finally {
            setLoadingConversations(false);
        }
    };

    const fetchMessages = async (otherUserId: string) => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('messages')
            .select(`
                *,
                sender:profiles!sender_id(username, avatar_url)
            `)
            .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
            .order('created_at', { ascending: true })
            .limit(50);

        if (!error && data) {
            const mappedMessages = data.filter((msg: any) => {
                if (msg.sender_id === user.id && msg.deleted_by_sender) return false;
                if (msg.receiver_id === user.id && msg.deleted_by_receiver) return false;
                return true;
            }).map((msg: any) => ({
                ...msg,
                sender: msg.sender
            }));
            setMessages(mappedMessages);
        }
        setLoading(false);
    };

    // Realtime Subscription
    useEffect(() => {
        const channel = supabase
            .channel('public:messages')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                },
                async (payload) => {
                    const newMessage = payload.new as Message;
                    const { data: { user } } = await supabase.auth.getUser();

                    if (!user) return;

                    // If viewing list, refresh list to show new message/time
                    if (view === 'list') {
                        // Debounce? or just simple refresh
                        fetchConversations();
                    }

                    // If inside a chat
                    if (view === 'chat' && activeChatUser) {
                        // Only add if it belongs to this conversation
                        const isRelevant =
                            (newMessage.sender_id === user.id && newMessage.receiver_id === activeChatUser.id) ||
                            (newMessage.sender_id === activeChatUser.id && newMessage.receiver_id === user.id);

                        if (isRelevant) {
                            // Fetch sender details just in case
                            const { data: senderData } = await supabase
                                .from('profiles')
                                .select('username, avatar_url')
                                .eq('id', newMessage.sender_id)
                                .single();

                            setMessages((prev) => {
                                if (prev.some(m => m.id === newMessage.id)) return prev;
                                return [...prev, { ...newMessage, sender: senderData || undefined }];
                            });
                            scrollToBottom();
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [view, activeChatUser]);


    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentUser || !activeChatUser) return;

        setSending(true);
        try {
            const { error } = await supabase
                .from('messages')
                .insert({
                    content: newMessage.trim(),
                    sender_id: currentUser.id,
                    receiver_id: activeChatUser.id
                });

            if (error) throw error;
            setNewMessage('');
            // Optimistic update handled by realtime or we can add manually here if realtime is slow
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            setSending(false);
        }
    };

    const handleBackToList = () => {
        setView('list');
        setActiveChatUser(null);
        if (onActiveUserChange) onActiveUserChange(null);
        fetchConversations();
    };

    const deleteConversation = async (e: React.MouseEvent, otherUserId: string) => {
        e.stopPropagation();

        const confirmed = await confirm({
            title: t('chat.delete_conversation'),
            message: t('chat.confirm_delete_conversation'),
            type: 'danger',
            confirmText: t('common.confirm'),
            cancelText: t('common.cancel')
        });

        if (!confirmed) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Mark sent messages as deleted
        await supabase
            .from('messages')
            .update({ deleted_by_sender: true })
            .eq('sender_id', user.id)
            .eq('receiver_id', otherUserId);

        // Mark received messages as deleted
        await supabase
            .from('messages')
            .update({ deleted_by_receiver: true })
            .eq('receiver_id', user.id)
            .eq('sender_id', otherUserId);

        fetchConversations();
        if (activeChatUser?.id === otherUserId) {
            handleBackToList();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Drawer */}
            <div className="relative w-full max-w-md flex flex-col h-full bg-slate-900 border-l border-slate-800 shadow-2xl animate-slide-in-right">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
                    <div className="flex items-center gap-3">
                        {view === 'chat' && (
                            <button onClick={handleBackToList} className="text-slate-400 hover:text-white transition-colors">
                                <ArrowLeft size={24} />
                            </button>
                        )}
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            {view === 'list' ? t('chat.title') : activeChatUser?.username}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/50 transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* View: Conversation List */}
                {view === 'list' && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {loadingConversations ? (
                            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-500" /></div>
                        ) : conversations.length === 0 ? (
                            <div className="text-center py-10 text-slate-500 flex flex-col items-center gap-3">
                                <MessageSquarePlus size={48} className="text-slate-700" />
                                <p>{t('chat.no_conversations')}</p>
                                <p className="text-sm">{t('chat.start_chatting_hint')}</p>
                            </div>
                        ) : (
                            conversations.map(conv => (

                                <div
                                    key={conv.id}
                                    className="group relative flex items-center gap-4 p-4 rounded-xl bg-slate-800/30 border border-transparent hover:border-slate-700 hover:bg-slate-800/80 cursor-pointer transition-all"
                                    onClick={() => loadUserForChat(conv.id)}
                                >
                                    <Avatar src={conv.avatar_url} fallback={conv.username} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-baseline mb-1">
                                            <h3 className="font-semibold text-white truncate">{conv.username}</h3>
                                            {conv.has_unread && conv.last_message_time && <span className="text-[10px] text-green-400 font-medium">
                                                {t('chat.new_message')}
                                            </span>
                                            }
                                            {conv.last_message_time && <span className="ml-2 text-slate-500 text-[10px]">{new Date(conv.last_message_time).toLocaleString()}</span>}
                                        </div>
                                        <p className="text-sm text-slate-400 truncate">{conv.last_message}</p>

                                    </div>

                                    <button
                                        onClick={(e) => deleteConversation(e, conv.id)}
                                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                        title={t('chat.delete_conversation')}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* View: Chat Thread */}
                {view === 'chat' && (
                    <>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {loading ? (
                                <div className="flex items-center justify-center h-full text-slate-500">
                                    <Loader2 className="animate-spin mr-2" /> {t('chat.loading_chat')}
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                                    <Avatar src={activeChatUser?.avatar_url} fallback={activeChatUser?.username || '?'} size="lg" />
                                    <p>{t('chat.start_conversation', { name: activeChatUser?.username })}</p>
                                </div>
                            ) : (
                                messages.map((msg) => {
                                    const isMe = msg.sender_id === currentUser?.id;

                                    return (
                                        <div
                                            key={msg.id}
                                            className={cn(
                                                "flex gap-3",
                                                isMe ? "flex-row-reverse" : "flex-row"
                                            )}
                                        >
                                            <Avatar
                                                src={msg.sender?.avatar_url}
                                                fallback={msg.sender?.username || '?'}
                                                size="sm"
                                            />
                                            <div className={cn(
                                                "flex flex-col max-w-[75%]",
                                                isMe ? "items-end" : "items-start"
                                            )}>
                                                <div className={cn(
                                                    "rounded-2xl px-4 py-2 text-sm",
                                                    isMe
                                                        ? "bg-green-600 text-white rounded-tr-none"
                                                        : "bg-slate-800 text-slate-200 rounded-tl-none"
                                                )}>
                                                    {msg.content}
                                                </div>
                                                <span className="text-[10px] text-slate-600 mt-1 px-1">
                                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <form onSubmit={handleSend} className="p-4 border-t border-slate-800 bg-slate-900/95 backdrop-blur">
                            <div className="relative">
                                <textarea
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder={t('chat.type_message')}
                                    rows={1}
                                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-3 pl-4 pr-12 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all resize-none min-h-[50px] max-h-[150px]"
                                />
                                <button
                                    type="submit"
                                    disabled={sending || !newMessage.trim()}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-green-500 hover:text-green-400 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                                >
                                    {sending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                                </button>
                            </div>
                        </form>
                    </>
                )}
            </div>
        </div >
    );
};

export default ChatDrawer;
