
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/ui/Avatar';
import { Loader2, UserPlus } from 'lucide-react';
import { getLevelFromElo } from '../lib/elo';

interface Player {
    id: string;
    username: string;
    elo: number;
    avatar_url: string | null;
}

const Players = () => {
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPlayers();
    }, []);

    const fetchPlayers = async () => {
        const { data } = await supabase.from('profiles').select('*').eq('approved', true).order('username');
        if (data) setPlayers(data);
        setLoading(false);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <header>
                <h1 className="text-3xl font-bold text-white">Community</h1>
                <p className="text-slate-400">All registered players</p>
            </header>

            {/* Info Banner */}
            <div className="rounded-xl bg-blue-500/10 p-4 border border-blue-500/20 flex gap-3 text-blue-300">
                <UserPlus className="shrink-0" />
                <p className="text-sm">
                    Only registered users appear here. <br />
                    Tell your friends to <strong>Sign Up</strong> to join the ranking!
                </p>
            </div>

            <div className="space-y-2">
                {loading ? (
                    <div className="text-center py-10 text-slate-500"><Loader2 className="animate-spin inline mr-2" /> Loading...</div>
                ) : players.length === 0 ? (
                    <div className="text-center py-10 text-slate-500">No players found yet.</div>
                ) : (
                    players.map(player => (
                        <div key={player.id} className="flex items-center justify-between rounded-lg bg-slate-800/50 p-3 hover:bg-slate-800 transition-colors">
                            <div className="flex items-center gap-3">
                                <Avatar fallback={player.username} src={player.avatar_url} />
                                <div>
                                    <span className="font-semibold text-slate-200 block">{player.username}</span>
                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest">Player</span>
                                </div>
                            </div>
                            <span className="text-sm font-mono font-bold text-green-400">ELO {player.elo}</span>
                            <span className="text-sm font-mono font-bold text-green-400">Lvl {getLevelFromElo(player.elo).level}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Players;
