import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../components/ui/Button';
import { Medal, Loader2, Search, Trophy, Plus, Crown } from 'lucide-react';
import { normalizeForSearch } from '../lib/utils';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { PullToRefresh } from '../components/ui/PullToRefresh';

interface TournamentPlayerStats {
    player_id: string;
    username: string;
    first_name?: string;
    last_name?: string;
    avatar_url: string | null;
    tournaments_played: number;
    total_wins: number;
    podium_finishes: number;
    total_points: number;
    avg_position: number;
}

const TournamentRankings = () => {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'americano' | 'mexicano'>('americano');
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    // Fetch Tournament Rankings
    const { data: rankings = [], isLoading: loading } = useQuery({
        queryKey: ['tournament-rankings', activeTab],
        queryFn: async () => {
            // Get all participants from completed public tournaments
            const { data: participants, error } = await supabase
                .from('tournament_participants')
                .select(`
                    player_id,
                    display_name,
                    score,
                    tournament_id,
                    tournaments!inner (
                        id,
                        visibility,
                        status,
                        created_at,
                        mode
                    )
                `)
                .eq('tournaments.visibility', 'public')
                .eq('tournaments.status', 'completed')
                .eq('tournaments.mode', activeTab)
                .not('player_id', 'is', null);

            if (error) throw error;
            if (!participants || participants.length === 0) return [];

            // Get unique player IDs
            const playerIds = [...new Set(participants.map(p => p.player_id).filter(Boolean))];

            // Fetch player profiles
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, first_name, last_name, avatar_url')
                .in('id', playerIds);

            if (!profiles) return [];

            // Group participants by tournament to determine rankings
            const tournamentGroups: Record<string, any[]> = {};
            participants.forEach(p => {
                const tournamentId = p.tournament_id;
                if (!tournamentGroups[tournamentId]) {
                    tournamentGroups[tournamentId] = [];
                }
                tournamentGroups[tournamentId].push(p);
            });

            // Sort each tournament's participants by score
            Object.keys(tournamentGroups).forEach(tournamentId => {
                tournamentGroups[tournamentId].sort((a, b) => b.score - a.score);
            });

            // Calculate stats for each player
            const playerStatsMap: Record<string, {
                tournaments_played: number;
                total_wins: number;
                podium_finishes: number;
                total_points: number;
                positions: number[];
            }> = {};

            Object.values(tournamentGroups).forEach(tournamentParticipants => {
                tournamentParticipants.forEach((participant, index) => {
                    const playerId = participant.player_id;
                    if (!playerId) return;

                    if (!playerStatsMap[playerId]) {
                        playerStatsMap[playerId] = {
                            tournaments_played: 0,
                            total_wins: 0,
                            podium_finishes: 0,
                            total_points: 0,
                            positions: []
                        };
                    }

                    const position = index + 1;
                    playerStatsMap[playerId].tournaments_played++;
                    playerStatsMap[playerId].total_points += participant.score;
                    playerStatsMap[playerId].positions.push(position);

                    if (position === 1) playerStatsMap[playerId].total_wins++;
                    if (position <= 3) playerStatsMap[playerId].podium_finishes++;
                });
            });

            // Combine with profile data
            const rankingsData: TournamentPlayerStats[] = profiles.map(profile => {
                const stats = playerStatsMap[profile.id] || {
                    tournaments_played: 0,
                    total_wins: 0,
                    podium_finishes: 0,
                    total_points: 0,
                    positions: []
                };

                const avg_position = stats.positions.length > 0
                    ? stats.positions.reduce((a, b) => a + b, 0) / stats.positions.length
                    : 0;

                return {
                    player_id: profile.id,
                    username: profile.username,
                    first_name: profile.first_name,
                    last_name: profile.last_name,
                    avatar_url: profile.avatar_url,
                    tournaments_played: stats.tournaments_played,
                    total_wins: stats.total_wins,
                    podium_finishes: stats.podium_finishes,
                    total_points: stats.total_points,
                    avg_position
                };
            });

            // Sort by wins (descending), then by total points (descending)
            return rankingsData.sort((a, b) => {
                if (b.total_wins !== a.total_wins) {
                    return b.total_wins - a.total_wins;
                }
                return b.total_points - a.total_points;
            });
        },
        staleTime: 1000 * 60 * 5 // 5 minutes
    });

    const filteredRankings = rankings.filter((player: TournamentPlayerStats) => {
        const matchesSearch = normalizeForSearch(player.username).includes(normalizeForSearch(searchQuery)) ||
            normalizeForSearch(`${player.first_name || ''} ${player.last_name || ''}`).includes(normalizeForSearch(searchQuery));
        return matchesSearch;
    });

    const handleRefresh = async () => {
        await queryClient.refetchQueries({ queryKey: ['tournament-rankings'] });
    };

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="space-y-6 animate-fade-in">
                <header className="flex flex-col gap-4">
                    <div className="flex flex-col items-center">
                        <h1 className="text-3xl font-bold text-white">{t('tournament_rankings.title') || 'Tournament Rankings'}</h1>
                        <p className="text-slate-400">{t('tournament_rankings.subtitle') || 'Top players from only public tournaments'} </p>
                        <button
                            onClick={() => navigate('/tournaments')}
                            className="text-white mt-4 flex justify-center items-center gap-2 bg-orange-500 rounded-2xl px-6 py-3 font-bold shadow-lg shadow-orange-500/40 hover:scale-110 active:scale-95 active:brightness-90 transition-all duration-300 animate-float animate-pulse-orange"
                        >
                            {t('tournament_rankings.create_tournament') || 'Create Tournament'}
                            <Plus size={24} strokeWidth={3} />
                        </button>
                    </div>

                    {/* Mode Tabs */}
                    <div className="flex p-1 bg-slate-800/50 rounded-xl">
                        <button
                            onClick={() => setActiveTab('americano')}
                            className={cn(
                                "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                                activeTab === 'americano'
                                    ? "bg-slate-700 text-white shadow"
                                    : "text-slate-400 hover:text-white"
                            )}
                        >
                            {t('tournaments.modes.americano') || 'Americano'}
                        </button>
                        <button
                            onClick={() => setActiveTab('mexicano')}
                            className={cn(
                                "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
                                activeTab === 'mexicano'
                                    ? "bg-slate-700 text-white shadow"
                                    : "text-slate-400 hover:text-white"
                            )}
                        >
                            {t('tournaments.modes.mexicano') || 'Mexicano'}
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder={t('rankings.search_placeholder') || 'Search players...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1"><Crown size={12} className="text-yellow-500" />{t('tournament_rankings.wins') || 'Wins'}</span>
                        <span>🏆{t('tournament_rankings.podiums') || 'Podiums'}</span>
                        <span>🎯{t('tournament_rankings.tournaments_played') || 'Tournaments'}</span>
                    </div>
                </header>

                <div className="space-y-3">
                    {loading ? (
                        <div className="text-center py-10 text-slate-500">
                            <Loader2 className="animate-spin inline mr-2" /> {t('common.loading') || 'Loading...'}
                        </div>
                    ) : filteredRankings.length === 0 ? (
                        <div className="text-center py-10 text-slate-500">
                            {searchQuery
                                ? t('rankings.no_results') || 'No players found'
                                : t('tournament_rankings.no_data') || 'No public tournament data yet'}
                        </div>
                    ) : (
                        filteredRankings.map((player: TournamentPlayerStats, index: number) => {
                            const rank = index + 1;
                            const isTop = rank <= 3;

                            return (


                                <Link

                                    to={`/user/${player.player_id}`}
                                    key={player.player_id}
                                    className={cn(
                                        "group relative flex items-center gap-4 rounded-xl border p-4 transition-all hover:scale-[1.02]",
                                        isTop
                                            ? "border-slate-700 bg-slate-800/80 shadow-lg"
                                            : "border-transparent bg-slate-900/50 hover:bg-slate-800"
                                    )}
                                >


                                    {/* Rank Badge or Medal */}
                                    <div className={cn(
                                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold",
                                        rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
                                            rank === 2 ? "bg-slate-400/20 text-slate-300" :
                                                rank === 3 ? "bg-amber-700/20 text-amber-600" :
                                                    "bg-slate-800 text-slate-500"
                                    )}>
                                        {isTop ? <Medal size={20} /> : rank}
                                    </div>

                                    {/* Player Info */}
                                    <Avatar src={player.avatar_url} fallback={player.username} />

                                    <div className="flex-1 min-w-0">
                                        <h3 className={cn("truncate font-semibold", isTop ? "text-white" : "text-slate-300")}>
                                            {player.username}
                                        </h3>
                                        <div className="flex gap-3 text-xs text-slate-500 mt-1">
                                            <span className="flex items-center gap-1">
                                                <Crown size={12} className="text-yellow-500" />
                                                {player.total_wins} {t('tournament_rankings.win') || 'W'}
                                            </span>
                                            <span>🏆 {player.podium_finishes} {t('tournament_rankings.podium') || 'P'}</span>
                                            <span>🎯 {player.tournaments_played} {t('tournament_rankings.tournament') || 'T'}</span>
                                        </div>
                                    </div>

                                    {/* Total Points */}
                                    <div className="text-right">
                                        <div className={cn("text-lg font-bold", isTop ? "text-green-400" : "text-white")}>
                                            {player.total_points}
                                        </div>
                                        <div className="text-xs text-slate-500 font-medium">
                                            {t('tournament_rankings.total_points') || 'points'}
                                        </div>
                                    </div>

                                    {/* Crown for #1 */}
                                    {rank === 1 && (
                                        <div className="absolute -top-2 -right-2 rotate-12 text-yellow-400">
                                            <Trophy size={24} fill="currentColor" />
                                        </div>
                                    )}
                                </Link>
                            );
                        })
                    )}
                </div>
            </div>
        </PullToRefresh>
    );
};

export default TournamentRankings;
