
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeForSearch } from '../lib/utils';
import { Avatar } from '../components/ui/Avatar';
import { Loader2, Calendar, AlertCircle, Search, X, MapPin } from 'lucide-react';
import { cn } from '../components/ui/Button';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';



interface MatchPlayer {
    username: string;
    avatar_url: string | null;
}

interface Match {
    id: number;
    created_at: string;
    score: { t1: number, t2: number }[];
    winner_team: number;
    commentary: string | null;
    created_by: string | null;
    club_id: number | null;

    // Relation fields
    team1_p1: MatchPlayer | null;
    team1_p2: MatchPlayer | null;
    team2_p1: MatchPlayer | null;
    team2_p2: MatchPlayer | null;

    // Augmented fields
    creator_username?: string;
    club_name?: string;
}

const History = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [filterMyMatches, setFilterMyMatches] = useState(true);
    const [userId, setUserId] = useState<string | null>(null);
    const ITEMS_PER_PAGE = 10;


    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) setUserId(user.id);
        });
    }, []);

    useEffect(() => {
        if (userId || !filterMyMatches) {
            fetchMatches();
        }
    }, [userId, filterMyMatches]);

    const fetchMatches = async () => {
        try {
            setLoading(true);
            setErrorMsg(null);

            let query = supabase
                .from('matches')
                .select(`
                  id, created_at, score, winner_team, commentary, created_by, club_id,
                  team1_p1(username, avatar_url),
                  team1_p2(username, avatar_url),
                  team2_p1(username, avatar_url),
                  team2_p2(username, avatar_url)
                `)
                .eq('status', 'confirmed')
                .order('created_at', { ascending: false });

            if (filterMyMatches && userId) {
                query = query.or(`team1_p1.eq.${userId},team1_p2.eq.${userId},team2_p1.eq.${userId},team2_p2.eq.${userId}`);
            }

            const { data, error } = await query;

            if (error) throw error;

            let matchesWithCreators = data || [];

            // Fetch Clubs
            let clubMap: Record<number, string> = {};
            try {
                const { data: clubs } = await supabase.from('clubs').select('id, name');
                if (clubs) {
                    clubs.forEach(c => clubMap[c.id] = c.name);
                }
            } catch (err) {
                console.error("Error fetching clubs", err);
            }

            // Manual fetch for creators to avoid FK issues if they are not properly set up
            if (matchesWithCreators.length > 0) {
                const creatorIds = [...new Set(matchesWithCreators.map((m: any) => m.created_by).filter(Boolean))];

                if (creatorIds.length > 0) {
                    const { data: creators } = await supabase
                        .from('profiles')
                        .select('id, username')
                        .in('id', creatorIds);

                    const creatorsMap: Record<string, string> = {};
                    creators?.forEach((c: any) => {
                        creatorsMap[c.id] = c.username;
                    });

                    matchesWithCreators = matchesWithCreators.map((m: any) => ({
                        ...m,
                        creator_username: m.created_by ? creatorsMap[m.created_by] : undefined,
                        club_name: m.club_id ? clubMap[m.club_id] : undefined
                    }));
                } else {
                    matchesWithCreators = matchesWithCreators.map((m: any) => ({
                        ...m,
                        club_name: m.club_id ? clubMap[m.club_id] : undefined
                    }));
                }
            }

            // Map the data to our interface if needed
            setMatches(matchesWithCreators as any || []);

        } catch (error: any) {
            console.error('Error fetching matches:', error);
            setErrorMsg(error.message);
        } finally {
            setLoading(false);
        }
    };

    // Filter matches
    const filteredMatches = matches.filter(match => {
        const normalizedQuery = normalizeForSearch(searchQuery);
        const idMatch = match.id.toString().includes(normalizedQuery);
        const creatorMatch = match.creator_username && normalizeForSearch(match.creator_username).includes(normalizedQuery);
        const clubMatch = match.club_name && normalizeForSearch(match.club_name).includes(normalizedQuery);

        const checkPlayer = (player: any) => player?.username && normalizeForSearch(player.username).includes(normalizedQuery);

        return idMatch || creatorMatch || clubMatch ||
            checkPlayer(match.team1_p1) ||
            checkPlayer(match.team1_p2) ||
            checkPlayer(match.team2_p1) ||
            checkPlayer(match.team2_p2);
    });

    // Reset pagination when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filterMyMatches]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredMatches.length / ITEMS_PER_PAGE);
    const paginatedMatches = filteredMatches.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(prev => prev + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handlePrevPage = () => {
        if (currentPage > 1) {
            setCurrentPage(prev => prev - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    if (loading && !matches.length) return <div className="flex justify-center p-10"><Loader2 className="animate-spin text-green-500" /></div>;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <header className='flex justify-between items-center'>
                <h1 className="text-3xl font-bold text-white">{t('history.title')}</h1>
                <button onClick={() => navigate('/')} className="text-slate-500 hover:text-slate-300 transition-colors"><X className="w-6 h-6" /></button>
            </header>

            {/* Toggle Filter */}
            <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-700">
                <button
                    onClick={() => setFilterMyMatches(true)}
                    className={cn(
                        "flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all",
                        filterMyMatches ? "bg-slate-700 text-white shadow" : "text-slate-500 hover:text-slate-300"
                    )}
                >
                    {t('history.filter_my_matches', { defaultValue: 'My Matches' })}
                </button>
                <button
                    onClick={() => setFilterMyMatches(false)}
                    className={cn(
                        "flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-all",
                        !filterMyMatches ? "bg-shared-700 text-white shadow" : "text-slate-500 hover:text-slate-300",
                        !filterMyMatches && "bg-slate-700"
                    )}
                >
                    {t('rankings.global', { defaultValue: 'Global' })}
                </button>
            </div>

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
                    {paginatedMatches.map((match) => (
                        <MatchCard key={match.id} match={match} />
                    ))}
                </div>
            )}

            {/* Pagination Controls */}
            {filteredMatches.length > ITEMS_PER_PAGE && (
                <div className="flex flex-col items-center gap-2 mt-6 pt-4 border-t border-slate-800">
                    <span className="text-sm text-slate-500">
                        {t('history.page_info', { current: currentPage, total: totalPages })}
                    </span>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handlePrevPage}
                            disabled={currentPage === 1}
                            className="px-4 py-2 rounded-lg bg-slate-800 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors text-sm font-medium"
                        >
                            {t('history.previous')}
                        </button>

                        <button
                            onClick={handleNextPage}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2 rounded-lg bg-slate-800 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700 transition-colors text-sm font-medium"
                        >
                            {t('history.next')}
                        </button>
                    </div>
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
    const getUsername = (obj: any) => obj?.username || t('history.inactive');
    const getAvatar = (obj: any) => obj?.avatar_url || null;

    return (
        <div className="relative overflow-hidden rounded-xl bg-slate-800 border border-slate-700 shadow-md">

            {/* Header / Date */}
            {/* Header / Date - Simplified Layout */}
            <div className="flex flex-col border-b border-slate-700 bg-slate-800/50 px-4 py-2 text-xs text-slate-500 gap-1">
                {/* Top Row: Date - Creator - Match ID */}
                <div className="flex items-center justify-between w-full">
                    {/* Left: Date */}
                    <div className="flex items-center gap-1 shrink-0">
                        <Calendar size={12} />
                        {date}
                    </div>



                    {/* Right: Match ID */}
                    <div className="shrink-0">
                        <span>{t('history.match_num', { id: match.id })}</span>
                    </div>
                </div>
                <div className="flex items-center justify-between w-full">
                    {/* Bottom Row: Club Location */}
                    {match.club_name && (
                        <div className="flex items-center gap-1 text-slate-400">
                            <MapPin size={12} />
                            <span className="font-medium">{match.club_name}</span>
                        </div>
                    )}

                    {/* Center: Creator (Conditional) */}
                    {match.creator_username && (
                        <div className="flex items-center gap-1  overflow-hidden">
                            <span className="opacity-60 text-[10px]">{t('history.created_by')}</span>
                            <span className="font-medium text-slate-400 text-[10px] truncate">{match.creator_username}</span>
                        </div>
                    )}
                </div>
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
