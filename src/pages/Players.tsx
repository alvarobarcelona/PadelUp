import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/ui/Avatar';
import { Loader2, UserPlus, MessageCircle } from 'lucide-react';
import { GiMuscleUp } from "react-icons/gi";
import { MdEventAvailable } from "react-icons/md";
import { getLevelFromElo } from '../lib/elo';
import { normalizeForSearch } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { useModal } from '../context/ModalContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Player {
    id: string;
    username: string;
    first_name: string;
    last_name: string;
    elo: number;
    avatar_url: string | null;
    main_club_id: number | null;
    nationality: string | null;
}

const Players = () => {
    const { t } = useTranslation();
    const { alert, confirm } = useModal();
    const queryClient = useQueryClient();

    // UI State
    const [activeTab, setActiveTab] = useState<'community' | 'friends'>('community');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedClubId, setSelectedClubId] = useState<number | string>('all');
    const [hasSetDefaultClub, setHasSetDefaultClub] = useState(false);

    // --- QUERIES ---

    // 1. User
    const { data: user } = useQuery({
        queryKey: ['user'],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            return user;
        },
        staleTime: Infinity
    });

    // 1.1 Profile (for default club)
    const { data: profile } = useQuery({
        queryKey: ['profile', user?.id],
        enabled: !!user,
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select('main_club_id')
                .eq('id', user?.id)
                .single();
            return data;
        },
        staleTime: Infinity
    });


    // 2. All Players
    const { data: players = [], isLoading: loading } = useQuery({
        queryKey: ['allPlayers'],
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('approved', true)
                .eq('is_admin', false)
                .order('username');
            return (data || []) as Player[];
        },
        staleTime: 1000 * 60 * 5 // 5 minutes
    });

    // 3. Clubs
    const { data: clubs = [] } = useQuery({
        queryKey: ['clubs'],
        queryFn: async () => {
            const { data } = await supabase.from('clubs').select('*').order('name');
            return data || [];
        },
        staleTime: 1000 * 60 * 60 // 1 hour
    });

    // 4. Friendships (Complex Map Return)
    const { data: friendshipData = { statusMap: {}, idMap: {} } } = useQuery({
        queryKey: ['friendships', user?.id],
        enabled: !!user,
        queryFn: async () => {
            if (!user) return { statusMap: {}, idMap: {} };

            const { data: friendships } = await supabase
                .from('friendships')
                .select('*')
                .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`);

            const statusMap: Record<string, 'friend' | 'pending_incoming' | 'pending_outgoing' | 'none'> = {};
            const idMap: Record<string, number> = {};

            if (friendships) {
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
            }
            return { statusMap, idMap };
        }
    });

    const friendMap = friendshipData.statusMap;
    const friendshipIds = friendshipData.idMap;

    // --- EFFECT: Set Default Club ---
    useEffect(() => {
        if (profile?.main_club_id && !hasSetDefaultClub) {
            setSelectedClubId(profile.main_club_id);
            setHasSetDefaultClub(true);
        }
    }, [profile, hasSetDefaultClub]);


    // --- MUTATIONS ---

    const sendRequestMutation = useMutation({
        mutationFn: async (targetId: string) => {
            if (!user) throw new Error("Not logged in");
            const { error } = await supabase
                .from('friendships')
                .insert({ user_id_1: user.id, user_id_2: targetId, status: 'pending' });
            if (error) throw error;
            return targetId;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['friendships'] });
        },
        onError: () => {
            alert({ title: 'Error', message: t('common.error'), type: 'danger' });
        }
    });

    // 5. Activity Stats (Last 30 Days)
    const { data: activityStartMap = {} } = useQuery({
        queryKey: ['activityStats'],
        queryFn: async () => {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const { data: recentMatches } = await supabase
                .from('matches')
                .select('team1_p1, team1_p2, team2_p1, team2_p2')
                .eq('status', 'confirmed')
                .gte('created_at', thirtyDaysAgo.toISOString());

            if (!recentMatches) return {};

            const counts: Record<string, number> = {};
            recentMatches.forEach(m => {
                [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].forEach(pid => {
                    if (pid) counts[pid] = (counts[pid] || 0) + 1;
                });
            });
            return counts;
        },
        staleTime: 1000 * 60 * 60 // 1 hour
    });

    const acceptMutation = useMutation({
        mutationFn: async (friendshipId: number) => {
            const { error } = await supabase
                .from('friendships')
                .update({ status: 'accepted' })
                .eq('id', friendshipId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['friendships'] });
            // Also invalidate rankings if we are in friends view there (global dependency potentially)
            queryClient.invalidateQueries({ queryKey: ['rankings'] });
        }
    });

    const removeMutation = useMutation({
        mutationFn: async (friendshipId: number) => {
            const { error } = await supabase
                .from('friendships')
                .delete()
                .eq('id', friendshipId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['friendships'] });
            queryClient.invalidateQueries({ queryKey: ['rankings'] });
        }
    });


    // --- HANDLERS ---

    const handleSendRequest = (targetId: string) => {
        sendRequestMutation.mutate(targetId);
    };

    const handleAccept = (targetId: string) => {
        const friendshipId = friendshipIds[targetId];
        if (friendshipId) acceptMutation.mutate(friendshipId);
    };

    const handleReject = (targetId: string) => {
        const friendshipId = friendshipIds[targetId];
        if (friendshipId) removeMutation.mutate(friendshipId);
    };

    const handleRemove = async (targetId: string) => {
        // UI already handles confirmation before calling this if needed, or we do it here?
        // In original code, confirm was inside the onClick for activeTab === 'friends'
        // But here handleRemove is aliased to handleReject in original.
        // Let's keep it simple.
        handleReject(targetId);
    };


    const filteredPlayers = players.filter(player => {
        // Tab Filtering
        if (activeTab === 'friends') {
            if (friendMap[player.id] !== 'friend') return false;
        }

        // Search Filtering
        const matchesSearch = !searchQuery.trim() || normalizeForSearch(player.username).includes(normalizeForSearch(searchQuery)) ||
            normalizeForSearch(`${player.first_name || ''} ${player.last_name || ''}`).includes(normalizeForSearch(searchQuery));

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

                {/* Search Bar & Club Filter - Matches Rankings.tsx style */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </div>
                        <input
                            type="text"
                            placeholder={t('community.search_placeholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                        />
                    </div>
                    {clubs.length > 0 && (
                        <select
                            value={selectedClubId}
                            onChange={(e) => setSelectedClubId(e.target.value)}
                            className="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 text-white focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                        >
                            <option value="all">{t('clubs.all_clubs') || 'All Clubs'}</option>
                            {clubs.map((c: any) => (
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

                {/* Legend */}
                <div className="flex justify-center gap-4 mt-2">
                    <div className="flex items-center gap-1.5 opacity-80">
                        <GiMuscleUp size={16} className="text-amber-500" />
                        <span className="text-[10px] uppercase font-bold text-slate-400">{t('badges.heavy_hitter')}</span>
                    </div>
                        <div className="flex items-center gap-1.5 opacity-80">
                            <MdEventAvailable size={16} className="text-blue-400" />
                            <span className="text-[10px] uppercase font-bold text-slate-400">{t('badges.regular')}</span>
                        </div>
                    </div>
                    <div className="text-center text-xs opacity-80"> {t('badges.info')}</div>
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
                        const matchCount = activityStartMap[player.id] || 0;
                        let BadgeIcon = null;
                        let badgeColor = "";
                        let badgeLabel = "";

                        if (matchCount >= 8) {
                            BadgeIcon = GiMuscleUp;
                            badgeColor = "text-amber-500";
                            badgeLabel = t('badges.heavy_hitter');
                        } else if (matchCount >= 4) {
                            BadgeIcon = MdEventAvailable;
                            badgeColor = "text-blue-400";
                            badgeLabel = t('badges.regular');
                        }

                        return (
                            <div key={player.id} className="flex items-center justify-between rounded-xl bg-slate-800/50 p-4 border border-slate-700/30 hover:bg-slate-800 transition-colors">
                                <div className="flex items-center gap-3">
                                    <Link to={`/user/${player.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                                        <Avatar fallback={player.username} src={player.avatar_url} />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-slate-200 block">{player.username}</span>
                                                 {player.nationality && (
                                                                        <div className="flex items-center gap-2 bg-slate-700/30 px-3 py-1 rounded-full border border-slate-700/50">
                                                                            <img
                                                                                src={`https://flagcdn.com/w40/${player.nationality.toLowerCase()}.png`}
                                                                                srcSet={`https://flagcdn.com/w80/${player.nationality.toLowerCase()}.png 2x`}
                                                                                width="20"
                                                                                alt={player.nationality}
                                                                                className="rounded-sm"
                                                                            />                                          
                                                                        </div>
                                                                    )}
                                                {BadgeIcon && (
                                                    <BadgeIcon size={16} className={badgeColor} title={badgeLabel} />
                                                )}
                                            </div>
                                            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold block mt-0.5">
                                                PTS {player.elo} • Lvl {getLevelFromElo(player.elo).level}
                                            </span>
                                        </div>
                                    </Link>
                                </div>

                                <div className='flex flex-col '>
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
                                                className="text-xs font-bold text-slate-400 px-2 py-1 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
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
                                            // Ensure not attempting to friend self (though usually filtered out or UI handled, safe to check user?.id)
                                            player.id === user?.id ? (
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
                                    </div>

                                    {/* Message Button for everyone except self */}
                                    {player.id !== user?.id && (
                                        <button
                                            onClick={() => window.dispatchEvent(new CustomEvent('openChat', { detail: player.id }))}
                                            className=" mt-0.5 flex justify-end text-xs font-bold text-slate-400 p-1.5 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                                            title="Send Message"
                                        >
                                            <MessageCircle size={18} />
                                        </button>
                                    )}

                                </div>
                            </div >
                        );
                    })
                )}
            </div >
        </div >
    );
};

export default Players;
