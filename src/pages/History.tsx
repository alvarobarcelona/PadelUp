
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/ui/Avatar';
import { Loader2, Calendar, AlertCircle, Search, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface Match {
    id: number;
    created_at: string;
    score: any;
    winner_team: number;
    commentary: string;
    // Raw foreign key objects (Supabase returns them nested under column name usually)
    team1_p1: { username: string, avatar_url: string | null } | null;
    team1_p2: { username: string, avatar_url: string | null } | null;
    team2_p1: { username: string, avatar_url: string | null } | null;
    team2_p2: { username: string, avatar_url: string | null } | null;
}

const History = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');


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
          commentary,
          team1_p1(username, avatar_url),
          team1_p2(username, avatar_url),
          team2_p1(username, avatar_url),
          team2_p2(username, avatar_url)
        `)
                .eq('status', 'confirmed')
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

    const filteredMatches = matches.filter(match => {
        const lowerQuery = searchQuery.toLowerCase();
        const idMatch = match.id.toString().includes(lowerQuery);

        const checkPlayer = (player: any) => player?.username?.toLowerCase().includes(lowerQuery);

        return idMatch ||
            checkPlayer(match.team1_p1) ||
            checkPlayer(match.team1_p2) ||
            checkPlayer(match.team2_p1) ||
            checkPlayer(match.team2_p2);
    });

    if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-green-500" /></div>;

    return (
        <div className="space-y-6 animate-fade-in">
            <header className='flex justify-between items-center'>
                <h1 className="text-3xl font-bold text-white">{t('history.title')}</h1>
                <button onClick={() => navigate('/')} className="text-slate-500 hover:text-slate-300 transition-colors"><X className="w-6 h-6" /></button>
            </header>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                    type="text"
                    placeholder={t('history.search_placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl bg-slate-800 border border-slate-700 py-3 pl-10 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                />
            </div>

            {errorMsg && (
                <div className="rounded-xl bg-red-500/10 p-4 border border-red-500/50 text-red-500 flex items-center gap-2">
                    <AlertCircle size={20} />
                    <span>{t('history.error_loading')}: {errorMsg}</span>
                </div>
            )}

            {!loading && !errorMsg && matches.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
                    <p className="text-slate-500">{t('history.no_matches_recorded')}</p>
                    <Link to="/new-match" className="mt-4 inline-block text-green-400 hover:underline">{t('history.record_first')}</Link>
                </div>
            ) : filteredMatches.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                    {t('history.no_matches_found', { query: searchQuery })}
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredMatches.map((match) => (
                        <MatchCard key={match.id} match={match} />
                    ))}
                </div>
            )}
        </div>
    );
};

const MatchCard = ({ match }: { match: Match }) => {
    const { t } = useTranslation();
    const date = new Date(match.created_at).toLocaleDateString();

    // Safety check for score
    const scoreList = Array.isArray(match.score) ? match.score : [];
    const scoreStr = scoreList.map((s: any) => `${s.t1}-${s.t2}`).join('  ');

    // Extract Usernames safely (in case join returned null)
    // Supabase returns object { username: '...' } or null
    const getUsername = (obj: any) => obj?.username || t('history.unknown');
    const getAvatar = (obj: any) => obj?.avatar_url || null;

    return (
        <div className="relative overflow-hidden rounded-xl bg-slate-800 border border-slate-700 shadow-md">
            {/* Header / Date */}
            <div className="flex items-center justify-between border-b border-slate-700 bg-slate-800/50 px-4 py-2 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                    <Calendar size={12} />
                    {date}
                </div>
                <span>{t('history.match_num', { id: match.id })}</span>
            </div>

            <div className="flex items-center justify-between p-4">
                {/* Team 1 */}
                <div className={`flex flex-col items-center w-5/12 ${match.winner_team === 1 ? 'opacity-100' : 'opacity-60 grayscale'}`}>
                    <div className="flex -space-x-3 mb-2">
                        <Avatar fallback={getUsername(match.team1_p1)} src={getAvatar(match.team1_p1)} />
                        <Avatar fallback={getUsername(match.team1_p2)} src={getAvatar(match.team1_p2)} />
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
                        <Avatar fallback={getUsername(match.team2_p1)} src={getAvatar(match.team2_p1)} />
                        <Avatar fallback={getUsername(match.team2_p2)} src={getAvatar(match.team2_p2)} />
                    </div>
                    <span className={`text-xs font-bold truncate max-w-full text-center ${match.winner_team === 2 ? 'text-blue-400' : 'text-slate-400'}`}>
                        {getUsername(match.team2_p1)} & {getUsername(match.team2_p2)}
                    </span>
                </div>

            </div>
            <div className="flex w-full justify-center px-4">
                {match.commentary && (
                    <div className="text-xs mb-2 font-bold text-white whitespace-pre-wrap font-mono text-center break-words">
                        {t('history.note')}: {match.commentary}
                    </div>
                )}
            </div>

            {/* Winner Indicator Stripe */}
            <div className={`h-1 w-full ${match.winner_team === 1 ? 'bg-gradient-to-r from-green-500 to-transparent' : 'bg-gradient-to-l from-blue-500 to-transparent'}`}></div>
        </div>
    );
};

export default History;
