import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLevelFromElo } from '../lib/elo';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../components/ui/Button';
import { Crown, TrendingUp, Loader2, Search } from 'lucide-react';

interface Player {
    id: string;
    username: string;
    avatar_url: string | null;
    elo: number;
}

const Rankings = () => {
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'global' | 'friends'>('global');
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchRankings();
    }, [view]);

    const fetchRankings = async () => {
        try {
            setLoading(true);
            setPlayers([]);

            const { data: { user } } = await supabase.auth.getUser();

            if (view === 'global') {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('approved', true)
                    .order('elo', { ascending: false });

                if (error) throw error;
                setPlayers(data || []);
            } else if (view === 'friends' && user) {
                // 1. Get Friends IDs
                const { data: friendships, error: friendsError } = await supabase
                    .from('friendships')
                    .select('user_id_1, user_id_2, status')
                    .eq('status', 'accepted')
                    .or(`user_id_1.eq.${user.id},user_id_2.eq.${user.id}`);

                if (friendsError) throw friendsError;

                const friendIds = friendships
                    .filter(f => f.status === 'accepted')
                    .map(f => f.user_id_1 === user.id ? f.user_id_2 : f.user_id_1);

                // Include self in friends ranking
                friendIds.push(user.id);

                // 2. Fetch Profiles for these IDs
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .in('id', friendIds)
                    .order('elo', { ascending: false });

                if (error) throw error;
                setPlayers(data || []);
            }

        } catch (error) {
            console.error('Error fetching rankings:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredPlayers = players.filter(player =>
        player.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <header className="flex flex-col gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
                    <p className="text-slate-400">Top players this season</p>
                </div>

                {/* Tabs */}
                <div className="flex p-1 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <button
                        onClick={() => setView('global')}
                        className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-all", view === 'global' ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200")}
                    >
                        Global
                    </button>
                    <button
                        onClick={() => setView('friends')}
                        className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition-all", view === 'friends' ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200")}
                    >
                        Friends Only
                    </button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search players..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all"
                    />
                </div>
            </header>

            <div className="space-y-3">
                {loading ? (
                    <div className="text-center py-10 text-slate-500"><Loader2 className="animate-spin inline mr-2" /> Loading... </div>
                ) : filteredPlayers.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">
                        {searchQuery
                            ? "No players found matching your search."
                            : view === 'friends'
                                ? "No friends found. Go to 'Community' to add some!"
                                : "No players found."}
                    </div>
                ) : (
                    filteredPlayers.map((player, index) => {
                        const rank = index + 1;
                        const isTop = rank <= 3;

                        return (
                            <div
                                key={player.id}
                                className={cn(
                                    "group relative flex items-center gap-4 rounded-xl border p-4 transition-all",
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

                                {/* Player Info */}
                                <Avatar src={player.avatar_url} fallback={player.username} />

                                <div className="flex-1 min-w-0">
                                    <h3 className={cn("truncate font-semibold", isTop ? "text-white" : "text-slate-300")}>
                                        {player.username}
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
                                {rank === 1 && (
                                    <div className="absolute -top-2 -right-2 rotate-12 text-yellow-400">
                                        <Crown size={24} fill="currentColor" />
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default Rankings;
