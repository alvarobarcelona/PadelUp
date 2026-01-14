
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/ui/Avatar';
import { Loader2, UserPlus, MessageCircle } from 'lucide-react';
import { getLevelFromElo } from '../lib/elo';
import { useTranslation } from 'react-i18next';
import { useModal } from '../context/ModalContext';

interface Player {
    id: string;
    username: string;
    elo: number;
    avatar_url: string | null;
    main_club_id: number | null;
}

const Players = () => {
    const { t } = useTranslation();
    const { alert, confirm } = useModal();
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const [friendMap, setFriendMap] = useState<Record<string, 'friend' | 'pending_incoming' | 'pending_outgoing' | 'none'>>({});
    const [friendshipIds, setFriendshipIds] = useState<Record<string, number>>({});
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'community' | 'friends'>('community');
    const [searchQuery, setSearchQuery] = useState('');
    const [clubs, setClubs] = useState<any[]>([]);
    const [selectedClubId, setSelectedClubId] = useState<number | string>('all');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Get Current User
            const { data: { user } } = await supabase.auth.getUser();
            setCurrentUserId(user?.id || null);

            // 2. Fetch All Players
            const { data: allPlayers } = await supabase
                .from('profiles')
                .select('*')
                .eq('approved', true)
                .eq('is_admin', false)
                .order('username');

            if (allPlayers) setPlayers(allPlayers);

            // Fetch Clubs
            const { data: c } = await supabase.from('clubs').select('*').order('name');
            if (c) setClubs(c);

            // 3. Fetch Friendships if logged in
            if (user) {
                const { data: friendships } = await supabase
                    .from('friendships')
                    .select('*')
                    .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`);

                if (friendships) {
                    const statusMap: Record<string, any> = {};
                    const idMap: Record<string, number> = {};

                    friendships.forEach(f => {
                        const otherId = f.user_id_1 === user.id ? f.user_id_2 : f.user_id_1;
                        idMap[otherId] = f.id;

                        if (f.status === 'accepted') {
                            statusMap[otherId] = 'friend';
                        } else if (f.user_id_1 === user.id) {
                            statusMap[otherId] = 'pending_outgoing';
                        } else {
                            statusMap[otherId] = 'pending_incoming';
                        }
                    });
                    setFriendMap(statusMap);
                    setFriendshipIds(idMap);
                }
            }

        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSendRequest = async (targetId: string) => {
        if (!currentUserId) return;

        // Optimistic UI
        setFriendMap(prev => ({ ...prev, [targetId]: 'pending_outgoing' }));

        const { error } = await supabase
            .from('friendships')
            .insert({ user_id_1: currentUserId, user_id_2: targetId, status: 'pending' });

        if (error) {
            await alert({ title: 'Error', message: t('common.error'), type: 'danger' });
            loadData(); // Revert on error
        } else {
            loadData(); // Refresh to get ID
        }
    };

    const handleAccept = async (targetId: string) => {
        const friendshipId = friendshipIds[targetId];
        if (!friendshipId) return;

        setFriendMap(prev => ({ ...prev, [targetId]: 'friend' }));

        const { error } = await supabase
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('id', friendshipId);

        if (error) loadData();
    };

    const handleReject = async (targetId: string) => {
        const friendshipId = friendshipIds[targetId];
        if (!friendshipId) return;

        setFriendMap(prev => ({ ...prev, [targetId]: 'none' }));

        const { error } = await supabase
            .from('friendships')
            .delete()
            .eq('id', friendshipId);

        if (error) loadData();
    };

    // Alias for Revoke/Unfriend - same DB action
    const handleRemove = handleReject;

    const filteredPlayers = players.filter(player => {


        // Tab Filtering
        if (activeTab === 'friends') {
            if (friendMap[player.id] !== 'friend') return false;
        }

        // Search Filtering
        const matchesSearch = !searchQuery.trim() || player.username.toLowerCase().includes(searchQuery.toLowerCase());

        // Club Filtering
        const matchesClub = selectedClubId === 'all' || player.main_club_id === Number(selectedClubId);

        return matchesSearch && matchesClub;
    });

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <header className="flex flex-col gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('community.title')}</h1>
                    <p className="text-slate-400">{t('community.subtitle')}</p>
                </div>

                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder={t('community.search_placeholder')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                    />
                    {clubs.length > 0 && (
                        <select
                            value={selectedClubId}
                            onChange={(e) => setSelectedClubId(e.target.value)}
                            className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                        >
                            <option value="all">{t('clubs.all_clubs') || 'All Clubs'}</option>
                            {clubs.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    )}
                </div>

                <div className="flex p-1 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <button
                        onClick={() => setActiveTab('community')}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'community' ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
                    >
                        {t('community.tab_community')}
                    </button>
                    <button
                        onClick={() => setActiveTab('friends')}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'friends' ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"}`}
                    >
                        {t('community.tab_friends')}
                    </button>
                </div>
            </header>

            <div className="space-y-2">
                {loading ? (
                    <div className="text-center py-10 text-slate-500"><Loader2 className="animate-spin inline mr-2" /> {t('common.loading')}</div>
                ) : filteredPlayers.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">
                        {activeTab === 'friends' ? t('community.no_friends') : t('community.no_players')}
                    </div>
                ) : (
                    filteredPlayers.map(player => {
                        const status = friendMap[player.id] || 'none';

                        return (
                            <div key={player.id} className="flex items-center justify-between rounded-xl bg-slate-800/50 p-4 border border-slate-700/30 hover:bg-slate-800 transition-colors">
                                <div className="flex items-center gap-3">
                                    <Avatar fallback={player.username} src={player.avatar_url} />
                                    <div>
                                        <span className="font-semibold text-slate-200 block">{player.username}</span>
                                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                                            ELO {player.elo} • Lvl {getLevelFromElo(player.elo).level}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Action Logic based on Status and Tab */}
                                    {status === 'friend' && (
                                        activeTab === 'friends' ? (
                                            <button
                                                onClick={async () => {
                                                    const confirmed = await confirm({
                                                        title: 'Remove Friend',
                                                        message: t('community.confirm_remove'),
                                                        type: 'danger',
                                                        confirmText: 'Remove'
                                                    });
                                                    if (confirmed) handleRemove(player.id);
                                                }}
                                                className="text-xs font-bold text-red-400 px-3 py-1.5 bg-red-500/10 rounded-lg hover:bg-red-500/20 transition-colors"
                                            >
                                                {t('community.unfriend')}
                                            </button>
                                        ) : (
                                            <span className="text-xs font-bold text-green-500 px-3 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                                                {t('community.friend')}
                                            </span>
                                        )
                                    )}

                                    {
                                        status === 'pending_outgoing' && (
                                            <button
                                                onClick={() => handleRemove(player.id)}
                                                className="text-xs font-bold text-slate-400 px-3 py-1 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                                            >
                                                {t('community.revoke')}
                                            </button>
                                        )
                                    }

                                    {
                                        status === 'pending_incoming' && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleAccept(player.id)}
                                                    className="text-xs font-bold bg-green-500 text-slate-900 px-3 py-1.5 rounded-lg hover:bg-green-400 transition-colors"
                                                >
                                                    {t('community.accept')}
                                                </button>
                                                <button
                                                    onClick={() => handleReject(player.id)}
                                                    className="text-xs font-bold bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition-colors"
                                                >
                                                    {t('community.reject')}
                                                </button>
                                            </div>
                                        )
                                    }
                                    <div className="flex items-center gap-2"    >

                                        {status === 'none' && (
                                            player.id === currentUserId ? (
                                                <span className="text-xs font-bold text-slate-500 px-3 py-1 bg-slate-800 rounded-full border border-slate-700">
                                                    {t('community.you')}
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => handleSendRequest(player.id)}
                                                    className="text-xs font-bold bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-500 transition-colors flex items-center gap-1"
                                                >
                                                    <UserPlus size={14} /> {t('community.add')}
                                                </button>
                                            )
                                        )}

                                        {/* Message Button for everyone except self */}
                                        {player.id !== currentUserId && (
                                            <button
                                                onClick={() => window.dispatchEvent(new CustomEvent('openChat', { detail: player.id }))}
                                                className="ml-2 text-xs font-bold text-slate-400 p-1.5 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                                                title="Send Message"
                                            >
                                                <MessageCircle size={18} />
                                            </button>
                                        )}

                                    </div>


                                </div >
                            </div >
                        );
                    })
                )}
            </div >
        </div >
    );
};

export default Players;
