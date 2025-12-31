
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLevelFromElo } from '../lib/elo';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../components/ui/Button';
import { Crown, TrendingUp } from 'lucide-react';

interface Player {
    id: string;
    username: string;
    avatar_url: string | null;
    elo: number;
}

const Rankings = () => {
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchRankings();
    }, []);

    const fetchRankings = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('approved', true) // Only show approved users
                .order('elo', { ascending: false });

            if (error) throw error;
            setPlayers(data || []);
        } catch (error) {
            console.error('Error fetching rankings:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <header>
                <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
                <p className="text-slate-400">Top players this season</p>
            </header>

            <div className="space-y-3">
                {players.length === 0 && !loading && (
                    <div className="text-center py-10 text-slate-500">
                        No players found. Go to 'Players' to add some!
                    </div>
                )}

                {players.map((player, index) => {
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
                })}
            </div>
        </div>
    );
};

export default Rankings;
