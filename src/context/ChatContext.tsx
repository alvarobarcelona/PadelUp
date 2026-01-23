import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLocation } from 'react-router-dom';

interface ChatContextType {
    unreadCount: number;
    markAsRead: (senderId: string) => Promise<void>;
    refreshUnreadCount: () => Promise<void>;
    notificationPermission: NotificationPermission;
    requestNotificationPermission: () => Promise<void>;
    isBadgeEnabled: boolean;
    toggleBadgeEnabled: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
    const [unreadCount, setUnreadCount] = useState(0);
    const location = useLocation();

    const fetchUnreadCount = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { count, error } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_id', user.id)
            .eq('is_read', false);

        if (!error && count !== null) {
            setUnreadCount(count);
        }
    };

    const markAsRead = async (senderId: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('receiver_id', user.id)
            .eq('sender_id', senderId)
            .eq('is_read', false); // Only update if needed

        // Optimistic / Fetch update
        fetchUnreadCount();
    };

    useEffect(() => {
        fetchUnreadCount();

        // Subscribe to NEW messages to increment counter
        const channel = supabase
            .channel('global_chat_notifications')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                },
                async (payload) => {
                    const newMessage = payload.new as any;
                    const { data: { user } } = await supabase.auth.getUser();

                    if (user && newMessage.receiver_id === user.id) {
                        setUnreadCount((prev) => prev + 1);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Re-fetch on route change just in case, though realtime handles most
    useEffect(() => {
        fetchUnreadCount();
    }, [location.pathname]);

    const [permission, setPermission] = useState<NotificationPermission>('default');

    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
        }
    }, []);

    const requestNotificationPermission = async () => {
        if (!('Notification' in window)) return;
        const result = await Notification.requestPermission();
        setPermission(result);
    };

    // Update App Badge
    useEffect(() => {
        if ('setAppBadge' in navigator) {
            // Badging API: Set if we have unread messages
            if (unreadCount > 0) {
                navigator.setAppBadge(unreadCount).catch(err => {
                    console.debug('Error setting app badge:', err);
                });
            } else {
                navigator.clearAppBadge().catch(err => {
                    console.debug('Error clearing app badge:', err);
                });
            }
        }
    }, [unreadCount]);

    return (
        <ChatContext.Provider value={{
            unreadCount,
            markAsRead,
            refreshUnreadCount: fetchUnreadCount,
            notificationPermission: permission,
            requestNotificationPermission,
            isBadgeEnabled: true, // Deprecated, always true now
            toggleBadgeEnabled: () => { } // Deprecated, no-op
        }}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (context === undefined) {
        throw new Error('useChat must be used within a ChatProvider');
    }
    return context;
};
