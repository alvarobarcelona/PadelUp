import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Send, Loader2, ArrowLeft, MessageSquarePlus, Trash2, ShieldCheck, MailPlus, Megaphone, Check, CheckCheck } from 'lucide-react';
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
    is_read?: boolean;
    deleted_by_sender?: boolean;
    deleted_by_receiver?: boolean;
    type?: string;
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
    initialMessage?: string;
}

const ChatDrawer = ({ isOpen, onClose, activeUserId, onActiveUserChange, initialMessage }: ChatDrawerProps) => {
    const { t } = useTranslation();
    const { confirm, alert } = useModal();
    const [view, setView] = useState<'list' | 'chat'>('list');
    const [activeChatUser, setActiveChatUser] = useState<ConversationUser | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [conversations, setConversations] = useState<ConversationUser[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadingConversations, setLoadingConversations] = useState(true);
    const [sending, setSending] = useState(false);

    // Admin features
    const [isAdmin, setIsAdmin] = useState(false);
    const [showAdminSearch, setShowAdminSearch] = useState(false);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [clubs, setClubs] = useState<{ id: number, name: string }[]>([]);
    const [selectedClubFilter, setSelectedClubFilter] = useState<string>('all');
    const [adminSearchQuery, setAdminSearchQuery] = useState('');
    const [isBroadcastMode, setIsBroadcastMode] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Scroll to bottom
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, view]);

    // Initialize user and handle external activeUserId prop
    const [currentUserProfile, setCurrentUserProfile] = useState<ConversationUser | null>(null);

    // Initialize user and handle external activeUserId prop
    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            setCurrentUser(user);
            if (user) {
                // Fetch full profile for self (avatar_url source of truth)
                supabase.from('profiles')
                    .select('id, username, avatar_url, is_admin')
                    .eq('id', user.id)
                    .single()
                    .then(({ data }) => {
                        if (data) {
                            setIsAdmin(data.is_admin || false);
                            setCurrentUserProfile(data as any);
                        }
                    });
            }
        });
    }, []);

    // Watch for external trigger to open a specific chat
    useEffect(() => {
        if (isOpen && activeUserId) {
            loadUserForChat(activeUserId);
            if (initialMessage) {
                setNewMessage(initialMessage);
            }
        } else if (isOpen && !activeUserId) {
            setView('list');
            setActiveChatUser(null);
            fetchConversations();
        }
    }, [isOpen, activeUserId, initialMessage]);

    // Auto-resize textarea logic
    const adjustTextareaHeight = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
        }
    };

    // Trigger resize on content change or view switch
    useEffect(() => {
        if (isOpen && view === 'chat') {
            // Use requestAnimationFrame or setTimeout to ensure the DOM is painted
            const timer = setTimeout(adjustTextareaHeight, 0);
            return () => clearTimeout(timer);
        }
    }, [isOpen, view, newMessage]);

    const { markAsRead } = useChat();

    const loadUserForChat = async (userId: string) => {
        setLoading(true);
        setView('chat');
        setShowAdminSearch(false); // Close admin search if open

        // Clear draft if switching users (unless it's the exact same user)
        // This prevents dispute messages or drafts from leaking between chats.
        if (activeChatUser?.id !== userId) {
            setNewMessage('');
        }

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
            fetchMessages(userId, data);
        }
        setLoading(false);
    };

    const fetchConversations = async () => {
        setLoadingConversations(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        try {
            // Updated to use Server-Side RPC (Decrypted)
            // This is much faster and secure.
            const { data, error } = await supabase.rpc('get_my_conversations');

            if (error) throw error;

            if (data) {
                const convos: ConversationUser[] = data.map((c: any) => ({
                    id: c.user_id,
                    username: c.username,
                    avatar_url: c.avatar_url,
                    last_message: c.last_message,
                    last_message_time: c.last_message_time,
                    has_unread: c.has_unread
                }));
                setConversations(convos);
            } else {
                setConversations([]);
            }

        } catch (error) {
            console.error('Error loading conversations', error);
        } finally {
            setLoadingConversations(false);
        }
    };

    // for admin: Fetch all users when search is opened
    const fetchAllUsersForAdmin = async () => {
        if (allUsers.length > 0) return; // Cached in state

        const { data: usersData } = await supabase
            .from('profiles')
            .select('id, username, main_club_id')
            .neq('id', currentUser?.id) // Don't chat with self
            .eq('is_admin', false)
            .order('username')
            ;

        if (usersData) setAllUsers(usersData);

        const { data: clubsData } = await supabase.from('clubs').select('id, name').order('name');
        if (clubsData) setClubs(clubsData);
    };


    const fetchMessages = async (otherUserId: string, targetProfile?: ConversationUser) => {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Use RPC to get decrypted messages
        const { data, error } = await supabase
            .rpc('get_chat_messages', { other_user_id: otherUserId });

        if (!error && data) {
            // We need to attach sender info manually since RPC doesn't join yet
            // optimization: we already know activeChatUser and currentUser
            // FIX: Use targetProfile if available to avoid stale state (React state updates are async)
            const chatPartner = targetProfile || activeChatUser;

            const mappedMessages = data.map((msg: any) => {
                const isMe = msg.sender_id === user.id;
                return {
                    ...msg,
                    sender: isMe ?
                        { username: currentUserProfile?.username || currentUser?.username, avatar_url: currentUserProfile?.avatar_url } : // Use profile table
                        { username: chatPartner?.username, avatar_url: chatPartner?.avatar_url }
                };
            });
            setMessages(mappedMessages);
        } else {
            console.error('Error fetching messages:', error);
        }
        setLoading(false);
    };

    // Realtime Subscription (unchanged)
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
                    const newMsgRaw = payload.new as any;
                    const { data: { user } } = await supabase.auth.getUser();

                    if (!user) return;

                    // Fetch the decrypted message content
                    const { data: decryptedData, error } = await supabase
                        .rpc('get_message_by_id', { message_id: newMsgRaw.id });

                    if (error || !decryptedData || decryptedData.length === 0) return;

                    const newMessage = decryptedData[0];

                    // If viewing list, refresh list to show new message/time
                    if (view === 'list') {
                        fetchConversations();
                    }

                    // If inside a chat
                    if (view === 'chat' && activeChatUser) {
                        // Only add if it belongs to this conversation
                        const isRelevant =
                            (newMessage.sender_id === user.id && newMessage.receiver_id === activeChatUser.id) ||
                            (newMessage.sender_id === activeChatUser.id && newMessage.receiver_id === user.id);

                        if (isRelevant) {
                            // Determine sender info
                            const isMe = newMessage.sender_id === user.id;
                            const senderData = isMe ?
                                { username: currentUserProfile?.username || currentUser?.username, avatar_url: currentUserProfile?.avatar_url } :
                                { username: activeChatUser.username, avatar_url: activeChatUser.avatar_url };

                            setMessages((prev) => {
                                if (prev.some(m => m.id === newMessage.id)) return prev;
                                return [...prev, { ...newMessage, sender: senderData }];
                            });
                            scrollToBottom();
                        }
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'messages',
                },
                (payload) => {
                    const updatedMsg = payload.new as any;
                    // Update the message in the state if it exists
                    setMessages((prev) => prev.map(msg =>
                        msg.id === updatedMsg.id ? { ...msg, is_read: updatedMsg.is_read } : msg
                    ));
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

        // Reset height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        setSending(true);
        try {
            const { error } = await supabase
                .rpc('send_chat_message', {
                    receiver_id: activeChatUser.id,
                    content: newMessage.trim()
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

    const handleBroadcast = async () => {
        if (!adminSearchQuery.trim()) {
            // If broadcast mode, search query is the message content
            // Wait, let's look at UI. 
            // If Broadcast Mode -> Input becomes the Broadcast Message Content
            // And we use the Filter to determine recipients
            return;
        }

        const messageContent = adminSearchQuery.trim();

        // Determine recipients
        const recipients = allUsers.filter(u => {
            return selectedClubFilter === 'all' || u.main_club_id === Number(selectedClubFilter);
        });

        if (recipients.length === 0) {
            alert({ title: 'Error', message: 'No users found to broadcast to', type: 'danger' });
            return;
        }

        const confirmed = await confirm({
            title: 'Send Broadcast?',
            message: `You are about to send this message to ${recipients.length} users. This cannot be undone.`,
            type: 'danger',
            confirmText: `Send to ${recipients.length} Users`
        });

        if (!confirmed) return;

        setSending(true);

        try {
            const messagesToInsert = recipients.map(u => ({
                content: messageContent,
                sender_id: currentUser.id,
                receiver_id: u.id
            }));

            const { error } = await supabase.from('messages').insert(messagesToInsert);

            if (error) throw error;

            alert({ title: 'Success', message: 'Broadcast sent successfully', type: 'success' });
            setShowAdminSearch(false);
            setAdminSearchQuery('');
            setIsBroadcastMode(false);
            setView('list');
            fetchConversations();

        } catch (error) {
            console.error('Broadcast error:', error);
            alert({ title: 'Error', message: 'Failed to send broadcast', type: 'danger' });
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

    // Filtered users for Admin Search
    const filteredAdminUsers = allUsers.filter(u => {
        const matchesClub = selectedClubFilter === 'all' || u.main_club_id === Number(selectedClubFilter);
        const matchesSearch = !adminSearchQuery || u.username.toLowerCase().includes(adminSearchQuery.toLowerCase());
        return matchesClub && matchesSearch;
    });

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
                            {view === 'list' ? (
                                showAdminSearch ? t('chat.new_message') : t('chat.title')
                            ) : activeChatUser?.username}
                            {isAdmin && view === 'list' && (
                                <ShieldCheck size={16} className="text-blue-400" />
                            )}
                        </h2>
                    </div>

                    <div className="flex gap-2">
                        {isAdmin && view === 'list' && !showAdminSearch && (
                            <button
                                onClick={() => {
                                    setShowAdminSearch(true);
                                    fetchAllUsersForAdmin();
                                    setIsBroadcastMode(false);
                                }}
                                className="p-2 text-blue-400 hover:text-white rounded-lg hover:bg-slate-800/50 transition-colors"
                                title="Admin: New Message"
                            >
                                <MailPlus size={24} />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/50 transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Admin User Search / Selector */}
                {showAdminSearch && view === 'list' && (
                    <div className="p-4 bg-slate-800/50 border-b border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-400">
                                {isBroadcastMode ? t('chat.broadcast_message') : t('chat.select_user')}
                            </span>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => {
                                        setIsBroadcastMode(!isBroadcastMode);
                                        setAdminSearchQuery('');
                                    }}
                                    className={`text-xs font-bold transition-colors ${isBroadcastMode ? 'text-green-400' : 'text-slate-500 hover:text-slate-300'}`}
                                >
                                    {isBroadcastMode ? t('chat.switch_search') : t('chat.broadcast_mode')}
                                </button>
                                <button onClick={() => setShowAdminSearch(false)} className="text-xs text-red-400 hover:text-red-300">{t('common.cancel')}</button>
                            </div>
                        </div>

                        {/* Club Filter (Used for both) */}
                        <select
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                            value={selectedClubFilter}
                            onChange={(e) => setSelectedClubFilter(e.target.value)}
                        >
                            <option value="all">
                                {isBroadcastMode ? t('chat.send_all') : t('chat.check_all_clubs')}
                            </option>
                            {clubs.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>

                        {/* Broadcast: Message Input / Search: User Input */}
                        {isBroadcastMode ? (
                            <div className="space-y-2">
                                <textarea
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-green-500/50 outline-none resize-none min-h-[100px]"
                                    placeholder="Type your broadcast message here..."
                                    value={adminSearchQuery} // Reuse state for message content
                                    onChange={(e) => setAdminSearchQuery(e.target.value)}
                                />
                                <button
                                    onClick={handleBroadcast}
                                    disabled={sending || !adminSearchQuery.trim()}
                                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {sending ? <Loader2 className="animate-spin" size={18} /> : <Megaphone size={18} />}
                                    Send Broadcast ({filteredAdminUsers.length} Users)
                                </button>
                            </div>
                        ) : (
                            <>
                                <input
                                    type="text"
                                    placeholder="Type to search user..."
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none"
                                    value={adminSearchQuery}
                                    onChange={(e) => setAdminSearchQuery(e.target.value)}
                                />

                                {/* User List Result */}
                                <div className="max-h-40 overflow-y-auto border border-slate-800 rounded-lg bg-slate-900">
                                    {filteredAdminUsers.length === 0 ? (
                                        <div className="p-3 text-xs text-slate-500 text-center">No users found</div>
                                    ) : (
                                        filteredAdminUsers.map(u => (
                                            <button
                                                key={u.id}
                                                onClick={() => loadUserForChat(u.id)}
                                                className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white flex items-center justify-between group"
                                            >
                                                <span>{u.username}</span>
                                                <ArrowLeft size={14} className="opacity-0 group-hover:opacity-100 rotate-180 transition-opacity text-blue-400" />
                                            </button>
                                        ))
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}


                {/* View: Conversation List */}
                {view === 'list' && !showAdminSearch && (
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
                                        <div className="flex justify-between items-center mb-1">
                                            <h3 className="font-semibold text-white truncate pr-2">{conv.username}</h3>
                                            {conv.last_message_time && (
                                                <span className="text-slate-500 text-[10px] whitespace-nowrap flex-shrink-0">
                                                    {new Date(conv.last_message_time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex justify-between items-center gap-2">
                                            <p className={cn(
                                                "text-sm truncate",
                                                conv.has_unread ? "text-white font-medium" : "text-slate-400"
                                            )}>
                                                {conv.last_message}
                                            </p>
                                            {conv.has_unread && (
                                                <span className="bg-green-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm flex-shrink-0">
                                                    {t('chat.new_message')}
                                                </span>
                                            )}
                                        </div>
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

                                    // Calculate sender info at render time to ensure it updates when profiles load from notifications
                                    const senderInfo = isMe ?
                                        {
                                            username: currentUserProfile?.username || currentUser?.username,
                                            avatar_url: currentUserProfile?.avatar_url
                                        } :
                                        {
                                            username: activeChatUser?.username,
                                            avatar_url: activeChatUser?.avatar_url
                                        };

                                    // Handle System Messages
                                    if (msg.type === 'system') {
                                        return (
                                            <div key={msg.id} className="flex justify-center my-4 px-4">
                                                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-xs text-slate-400 text-center max-w-[85%]">
                                                    <ShieldCheck size={16} className="mx-auto mb-1 text-purple-400" />
                                                    {msg.content}
                                                    <span className="block mt-1 text-[10px] opacity-60">
                                                        {new Date(msg.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div
                                            key={msg.id}
                                            className={cn(
                                                "flex gap-3",
                                                isMe ? "flex-row-reverse" : "flex-row"
                                            )}
                                        >
                                            <Avatar
                                                src={senderInfo.avatar_url}
                                                fallback={senderInfo.username || '?'}
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
                                                <div className="flex items-center gap-1 justify-end mt-1 px-1">
                                                    <span className="text-[10px] text-slate-600">
                                                        {new Date(msg.created_at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {isMe && (
                                                        <span title={msg.is_read ? t('chat.read') : t('chat.sent')}>
                                                            {msg.is_read ? (
                                                                <CheckCheck size={14} className="text-green-500" />
                                                            ) : (
                                                                <Check size={14} className="text-slate-500" />
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
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
                                    name='message'
                                    ref={textareaRef}
                                    value={newMessage}
                                    onChange={(e) => {
                                        setNewMessage(e.target.value);
                                        adjustTextareaHeight();
                                    }}
                                    placeholder={t('chat.type_message')}
                                    rows={1}
                                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-3 pl-4 pr-12 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all resize-none min-h-[50px] overflow-hidden"
                                />
                                <div className="text-[10px] text-slate-500 text-center mt-1 select-none whitespace-pre-line">
                                    {t('chat.cleanup_disclaimer') || 'Messages older than 90 days may be deleted for security.'}
                                </div>

                                <button
                                    type="submit"
                                    disabled={sending || !newMessage.trim()}
                                    className="absolute right-2 top-6 -translate-y-1/2 p-2 text-green-500 hover:text-green-400 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
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
