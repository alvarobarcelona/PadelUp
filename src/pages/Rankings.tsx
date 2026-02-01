import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { getLevelFromElo } from '../lib/elo';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../components/ui/Button';
import { Crown, TrendingUp, Loader2, Search } from 'lucide-react';
import { normalizeForSearch } from '../lib/utils';
import { useTranslation } from 'react-i18next';

interface Player {
    id: string;
    username: string;
    first_name?: string;
    last_name?: string;
    avatar_url: string | null;
    elo: number;
    main_club_id: number | null;
}

const Rankings = () => {
    const { t } = useTranslation();
    const [view, setView] = useState<'global' | 'friends'>('friends');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedClubId, setSelectedClubId] = useState<number | string>('all');

    // Fetch User (needed for friends view logic)
    const { data: user } = useQuery({
        queryKey: ['user'],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            return user;
        },
        staleTime: Infinity
    });

    // Fetch Clubs
    const { data: clubs = [] } = useQuery({
        queryKey: ['clubs'],
        queryFn: async () => {
            const { data } = await supabase.from('clubs').select('*').order('name');
            return data || [];
        },
        staleTime: 1000 * 60 * 60 // 1 hour
    });

    // Fetch Rankings
    const { data: players = [], isLoading: loading } = useQuery({
        queryKey: ['rankings', view, user?.id],
        queryFn: async () => {
            if (view === 'global') {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('approved', true)
                    .eq('is_admin', false)
                    .order('elo', { ascending: false });

                if (error) throw error;
                return data || [];
            } else if (view === 'friends' && user) {
                // 1. Get Friends IDs
                const { data: friendships, error: friendsError } = await supabase
                    .from('friendships')
                    .select('user_id_1, user_id_2, status')
                    .eq('status', 'accepted')
                    .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`);

                if (friendsError) throw friendsError;

                const friendIds = friendships
                    .filter((f: any) => f.status === 'accepted')
                    .map((f: any) => f.user_id_1 === user.id ? f.user_id_2 : f.user_id_1);

                // Include self in friends ranking
                friendIds.push(user.id);

                // 2. Fetch Profiles for these IDs
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .in('id', friendIds)
                    .order('elo', { ascending: false });

                if (error) throw error;
                return data || [];
            }
            return [];
        },
        enabled: view === 'global' || !!user // Only run if we have user for friends view
    });


    // Fetch Streaks (Optimized: Fetch last 500 matches and calc in memory)
    const { data: streaks = {} } = useQuery({
        queryKey: ['streaks'],
        queryFn: async () => {
            const { data } = await supabase
                .from('matches')
                .select('winner_team, team1_p1, team1_p2, team2_p1, team2_p2')
                .eq('status', 'confirmed')
                .order('created_at', { ascending: false })
                .limit(200);

            if (!data) return {};

            const streakMap: Record<string, number> = {};


            // We iterate from newest to oldest to find "current" streaks
            // Actually, to count consecutive, we just need to see if they won the LAST N games.
            // But complex interweaving of matches makes this tricky. 
            // Simpler: Maintain a counter for everyone. If we see a loss, we stop counting for that person.
            // Since we iterate newest -> oldest (descending):
            // 1. If we see a WIN for player X, and we haven't seen a LOSS yet, increment streak.
            // 2. If we see a LOSS for player X, mark as "streak broken" (or just stop incrementing).

            // "broken" set to track who already lost a recent game
            const brokenStreaks = new Set<string>();

            for (const m of data) {
                const t1 = [m.team1_p1, m.team1_p2].filter(Boolean);
                const t2 = [m.team2_p1, m.team2_p2].filter(Boolean);

                const winners = m.winner_team === 1 ? t1 : t2;
                const losers = m.winner_team === 1 ? t2 : t1;

                // Process Winners
                for (const pid of winners) {
                    if (!brokenStreaks.has(pid)) {
                        streakMap[pid] = (streakMap[pid] || 0) + 1;
                    }
                }

                // Process Losers
                for (const pid of losers) {
                    brokenStreaks.add(pid); // Their streak ends here (going backwards)
                }
            }

            return streakMap;
        },
        staleTime: 1000 * 60 * 5 // 5 minutes
    });

    const filteredPlayers = players.filter((player: Player) => {
        const matchesSearch = normalizeForSearch(player.username).includes(normalizeForSearch(searchQuery)) ||
            normalizeForSearch(`${player.first_name || ''} ${player.last_name || ''}`).includes(normalizeForSearch(searchQuery));
        const matchesClub = selectedClubId === 'all' || player.main_club_id === Number(selectedClubId);
        return matchesSearch && matchesClub;
    });

    return (
        <div className="space-y-6 animate-fade-in">
            <header className="flex flex-col gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('rankings.title')}</h1>
                    <p className="text-slate-400">{t('rankings.subtitle')}</p>
                    <p className="text-xs text-slate-500 mt-2 italic flex items-center gap-1">
                        <TrendingUp size={12} /> {t('rankings.click_hint')}
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex p-1 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <button
                        onClick={() => setView('global')}
                        className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-all", view === 'global' ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200")}
                    >
                        {t('rankings.global')}
                    </button>
                    <button
                        onClick={() => setView('friends')}
                        className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-all", view === 'friends' ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200")}
                    >
                        {t('rankings.friends')}
                    </button>
                </div>

                {/* Search Bar & Club Filter */}
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder={t('rankings.search_placeholder')}
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
            </header>
            
            <div className='text-center text-slate-400'>{t('rankings.fire_motivation')}</div>

            <div className="space-y-3">
                {loading ? (
                    <div className="text-center py-10 text-slate-500"><Loader2 className="animate-spin inline mr-2" /> {t('common.loading')} </div>
                ) : filteredPlayers.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">
                        {searchQuery
                            ? t('rankings.no_results')
                            : view === 'friends'
                                ? t('rankings.no_friends')
                                : t('rankings.no_players')}
                    </div>
                ) : (
                    filteredPlayers.map((player: Player, index: number) => {
                        const rank = index + 1;
                        const isTop = rank <= 3;
                        const streak = streaks[player.id] || 0;
                        const isOnFire = streak >= 3;

                        return (

                            <Link
                                to={`/user/${player.id}`}
                                key={player.id}
                                className={cn(
                                    "group relative flex items-center gap-4 rounded-xl border p-4 transition-all hover:scale-[1.02]",
                                    isTop
                                        ? "border-slate-700 bg-slate-800/80 shadow-lg"
                                        : "border-transparent bg-slate-900/50 hover:bg-slate-800"
                                )}
                            >
                                {/* Rank Badge */}
                                <div className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold",
                                    rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
                                        rank === 2 ? "bg-slate-400/20 text-slate-300" :
                                            rank === 3 ? "bg-amber-700/20 text-amber-600" :
                                                "bg-slate-800 text-slate-500"
                                )}>
                                    {rank}
                                </div>

                                {/* Player Info  head to head*/}
                                <Avatar src={player.avatar_url} fallback={player.username} isOnFire={isOnFire} />

                                <div className="flex-1 min-w-0">
                                    <h3 className={cn("truncate font-semibold flex items-center gap-2", isTop ? "text-white" : "text-slate-300")}>
                                        {player.username}
                                        {isOnFire && <span className="text-xs animate-pulse">🔥</span>}
                                    </h3>
                                </div>

                                {/* Level & Elo */}
                                <div className="text-right">
                                    <div className={cn("text-lg font-bold", isTop ? "text-green-400" : "text-white")}>
                                        Lvl {getLevelFromElo(player.elo).level}
                                    </div>
                                    <div className="text-xs text-slate-500 font-medium">
                                        {player.elo} elo
                                    </div>
                                    {/* Visual flair for top player */}
                                    {index === 0 && <TrendingUp size={12} className="ml-auto text-green-500 mt-1" />}
                                </div>

                                {/* Crown for #1 */}
                                {
                                    rank === 1 && (
                                        <div className="absolute -top-2 -right-2 rotate-12 text-yellow-400">
                                            <Crown size={24} fill="currentColor" />
                                        </div>
                                    )
                                }
                            </Link>
                        );
                    })
                )}
            </div>
        </div >
    );
};

export default Rankings;
