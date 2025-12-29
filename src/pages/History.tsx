
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/ui/Avatar';
import { Loader2, Calendar, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Match {
    id: number;
    created_at: string;
    score: any;
    winner_team: number;
    // Raw foreign key objects (Supabase returns them nested under column name usually)
    team1_p1: { username: string } | null;
    team1_p2: { username: string } | null;
    team2_p1: { username: string } | null;
    team2_p2: { username: string } | null;
}

const History = () => {
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        fetchMatches();
    }, []);

    const fetchMatches = async () => {
        try {
            setLoading(true);
            setErrorMsg(null);

            // We simply select the relation using the column name.
            // Supabase (PostgREST) maps this to the relation.
            // Note: We are NOT using aliases ("t1p1:...") to reduce complexity/risk of error.
            const { data, error } = await supabase
                .from('matches')
                .select(`
          id,
          created_at,
          score,
          winner_team,
          team1_p1(username),
          team1_p2(username),
          team2_p1(username),
          team2_p2(username)
        `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Map the data to our interface if needed, but the structure 
            // team1_p1: { username: '...' } is what Supabase returns by default.
            setMatches(data as any || []);

        } catch (error: any) {
            console.error('Error fetching matches:', error);
            setErrorMsg(error.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-green-500" /></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <header>
                <h1 className="text-3xl font-bold text-white">Match History</h1>
            </header>

            {errorMsg && (
                <div className="rounded-xl bg-red-500/10 p-4 border border-red-500/50 text-red-500 flex items-center gap-2">
                    <AlertCircle size={20} />
                    <span>Error loading matches: {errorMsg}</span>
                </div>
            )}

            {!loading && !errorMsg && matches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
                    <p className="text-slate-500">No matches recorded yet.</p>
                    <Link to="/new-match" className="mt-4 inline-block text-green-400 hover:underline">Record first match</Link>
                </div>
            ) : (
                <div className="space-y-4">
                    {matches.map((match) => (
                        <MatchCard key={match.id} match={match} />
                    ))}
                </div>
            )}
        </div>
    );
};

const MatchCard = ({ match }: { match: Match }) => {
    const date = new Date(match.created_at).toLocaleDateString();

    // Safety check for score
    const scoreList = Array.isArray(match.score) ? match.score : [];
    const scoreStr = scoreList.map((s: any) => `${s.t1}-${s.t2}`).join('  ');

    // Extract Usernames safely (in case join returned null)
    // Supabase returns object { username: '...' } or null
    const getUsername = (obj: any) => obj?.username || 'Unknown';

    return (
        <div className="relative overflow-hidden rounded-xl bg-slate-800 border border-slate-700 shadow-md">
            {/* Header / Date */}
            <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/50 px-4 py-2 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                    <Calendar size={12} />
                    {date}
                </div>
                <span>Match #{match.id}</span>
            </div>

            <div className="flex items-center justify-between p-4">
                {/* Team 1 */}
                <div className={`flex flex-col items-center w-5/12 ${match.winner_team === 1 ? 'opacity-100' : 'opacity-60 grayscale'}`}>
                    <div className="flex -space-x-3 mb-2">
                        <Avatar fallback={getUsername(match.team1_p1)} />
                        <Avatar fallback={getUsername(match.team1_p2)} />
                    </div>
                    <span className={`text-xs font-bold truncate max-w-full text-center ${match.winner_team === 1 ? 'text-green-400' : 'text-slate-400'}`}>
                        {getUsername(match.team1_p1)} & {getUsername(match.team1_p2)}
                    </span>
                </div>

                {/* Score */}
                <div className="flex flex-col items-center justify-center">
                    <div className="text-xl font-black text-white whitespace-pre font-mono">{scoreStr.replaceAll('  ', '\n')}</div>
                </div>

                {/* Team 2 */}
                <div className={`flex flex-col items-center w-5/12 ${match.winner_team === 2 ? 'opacity-100' : 'opacity-60 grayscale'}`}>
                    <div className="flex -space-x-3 mb-2">
                        <Avatar fallback={getUsername(match.team2_p1)} />
                        <Avatar fallback={getUsername(match.team2_p2)} />
                    </div>
                    <span className={`text-xs font-bold truncate max-w-full text-center ${match.winner_team === 2 ? 'text-blue-400' : 'text-slate-400'}`}>
                        {getUsername(match.team2_p1)} & {getUsername(match.team2_p2)}
                    </span>
                </div>
            </div>

            {/* Winner Indicator Stripe */}
            <div className={`h-1 w-full ${match.winner_team === 1 ? 'bg-gradient-to-r from-green-500 to-transparent' : 'bg-gradient-to-l from-blue-500 to-transparent'}`}></div>
        </div>
    );
};

export default History;
