import { useEffect, useState } from 'react';
import { Plus, History as HistoryIcon, User, Check, X, Clock} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getLevelFromElo } from '../lib/elo';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../components/ui/Button';
import { WelcomeModal } from '../components/WelcomeModal';

interface Profile {
    id: string;
    username: string;
    elo: number;
    avatar_url: string | null;
}

interface MatchPreview {
    id: number;
    created_at: string;
    winner_team: number;
    commentary?: string | null;
    status: 'pending' | 'confirmed' | 'rejected';
    created_by?: string | null;
    score?: any[];
    // We only need basic info for the feed
    t1p1: { username: string };
    t1p2: { username: string };
    t2p1: { username: string };
    t2p2: { username: string };
    team1_p1: string;
    team1_p2: string;
    team2_p1: string;
    team2_p2: string;
}

const Home = () => {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [suggestions, setSuggestions] = useState<Profile[]>([]);
    const [recentMatches, setRecentMatches] = useState<MatchPreview[]>([]);
    const [pendingMatches, setPendingMatches] = useState<MatchPreview[]>([]);
    const [recentForm, setRecentForm] = useState<{ id: number, won: boolean, points: number | null }[]>([]);
    const [, setLoading] = useState(true);
    const [showWelcome, setShowWelcome] = useState(false);

    useEffect(() => {
        loadDashboardData();
        // Auto-process expired matches on mount (Lazy Cron)
        supabase.rpc('process_expired_matches').then(({ error }) => {
            if (error) console.error('Error auto-processing matches:', error);
        });

        // Check if user has seen welcome modal this session
        const hasSeenWelcome = sessionStorage.getItem('padelup_welcome_seen_session');
        if (!hasSeenWelcome) {
            setShowWelcome(true);
        }
    }, []);

    const handleCloseWelcome = () => {
        setShowWelcome(false);
        sessionStorage.setItem('padelup_welcome_seen_session', 'true');
    };

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            // 1. Get Current User (if logged in)
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (profileData) {
                    setProfile(profileData);

                    // Fetch user's last 6 matches (to calc diff for 5)
                    const { data: userMatches } = await supabase
                        .from('matches')
                        .select('id, winner_team, team1_p1, team1_p2, team2_p1, team2_p2, elo_snapshot')
                        .or(`team1_p1.eq.${profileData.id},team1_p2.eq.${profileData.id},team2_p1.eq.${profileData.id},team2_p2.eq.${profileData.id}`)
                        .eq('status', 'confirmed')
                        .order('created_at', { ascending: false })
                        .limit(6);

                    if (userMatches) {
                        const form = [];
                        // We iterate up to 5 (or less if fewer matches)
                        const count = Math.min(5, userMatches.length);

                        for (let i = 0; i < count; i++) {
                            const m = userMatches[i];
                            const isTeam1 = m.team1_p1 === profileData.id || m.team1_p2 === profileData.id;
                            const isTeam2 = m.team2_p1 === profileData.id || m.team2_p2 === profileData.id;
                            const won = (isTeam1 && m.winner_team === 1) || (isTeam2 && m.winner_team === 2);

                            // Calculate points
                            let points = null;
                            if (m.elo_snapshot) {
                                // Determine user's position key (t1p1, t1p2, etc.)
                                let posKey = '';
                                if (m.team1_p1 === profileData.id) posKey = 't1p1';
                                else if (m.team1_p2 === profileData.id) posKey = 't1p2';
                                else if (m.team2_p1 === profileData.id) posKey = 't2p1';
                                else if (m.team2_p2 === profileData.id) posKey = 't2p2';

                                const currentElo = (m.elo_snapshot as any)[posKey];

                                // Get previous ELO
                                let prevElo = 1150; // DEFAULT
                                // If there is a "next" match (which is older in time), get its snapshot
                                if (i + 1 < userMatches.length) {
                                    const olderMatch = userMatches[i + 1];
                                    if (olderMatch.elo_snapshot) {
                                        // Find pos in older match
                                        let olderPosKey = '';
                                        if (olderMatch.team1_p1 === profileData.id) olderPosKey = 't1p1';
                                        else if (olderMatch.team1_p2 === profileData.id) olderPosKey = 't1p2';
                                        else if (olderMatch.team2_p1 === profileData.id) olderPosKey = 't2p1';
                                        else if (olderMatch.team2_p2 === profileData.id) olderPosKey = 't2p2';

                                        prevElo = (olderMatch.elo_snapshot as any)[olderPosKey] || prevElo;
                                    }
                                } else if (i === userMatches.length - 1 && userMatches.length < 6) {
                                    // This is the absolute first match found, and no older match exists.
                                    // Use default start rating 1150.
                                    prevElo = 1150;
                                }

                                if (currentElo !== undefined && prevElo !== undefined) {
                                    points = currentElo - prevElo;
                                }
                            }
                            form.push({ id: m.id, won, points });
                        }
                        setRecentForm(form.reverse()); // Show old -> new, or new -> old? Usually L -> R is Old -> New in a graph. But dots...
                        // Reversing makes index 0 the oldest.
                        // The UI "Recent Form" usually shows Left=Oldest, Right=Newest.
                        // So reversing is correct if userMatches is Newest First.
                    }

                    // Fetch Matchmaking Suggestions
                    // Strategy: Get all approved profiles, filter client side for ELO range.
                    // For a large app, this should be an RPC or filtered query, but for < 1000 users this is fine.
                    const { data: candidates } = await supabase
                        .from('profiles')
                        .select('id, username, elo, avatar_url')
                        .neq('id', user.id)
                        .eq('approved', true);

                    if (candidates) {
                        const minElo = profileData.elo - 100;
                        const maxElo = profileData.elo + 100;
                        const filtered = candidates.filter(p => p.elo >= minElo && p.elo <= maxElo);
                        // Sort by closeness to user's ELO
                        filtered.sort((a, b) => Math.abs(a.elo - profileData.elo) - Math.abs(b.elo - profileData.elo));
                        setSuggestions(filtered.slice(0, 5)); // Top 5
                    }


                    // Fetch Pending Matches for User
                    const { data: pending } = await supabase
                        .from('matches')
                        .select(`
                            id, created_at, winner_team, commentary, status, created_by, score,
                            team1_p1, team1_p2, team2_p1, team2_p2,
                            t1p1:team1_p1(username),
                            t1p2:team1_p2(username),
                            t2p1:team2_p1(username),
                            t2p2:team2_p2(username)
                        `)
                        .eq('status', 'pending')
                        .or(`team1_p1.eq.${profileData.id},team1_p2.eq.${profileData.id},team2_p1.eq.${profileData.id},team2_p2.eq.${profileData.id}`)
                        .order('created_at', { ascending: false });

                    if (pending) setPendingMatches(pending as any);
                }
            }

            // 2. Fetch Recent Matches (Global Feed - OK only CONFIRMED)
            const { data: matchesData } = await supabase
                .from('matches')
                .select(`
                id, created_at, winner_team, commentary, status, score,
                t1p1:team1_p1(username),
                t1p2:team1_p2(username),
                t2p1:team2_p1(username),
                t2p2:team2_p2(username)
            `)
                .eq('status', 'confirmed')
                .order('created_at', { ascending: false })
                .limit(5);

            if (matchesData) {
                setRecentMatches(matchesData as any);
            }

        } catch (error) {
            console.error('Error loading dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async (matchId: number) => {
        if (!confirm('Confirm this match result? This will update ELO ratings.')) return;
        try {
            const { error } = await supabase.rpc('confirm_match', { match_id: matchId });
            if (error) throw error;
            loadDashboardData(); // Refresh UI
        } catch (error: any) {
            alert('Error confirming match: ' + error.message);
        }
    };

    const handleReject = async (matchId: number) => {
        if (!confirm('Reject this game? It will be deleted. You can always create a new one. But remember that rejecting it to avoid a drop in your ELO rating may result in a temporary suspension.')) return;
        try {
            const { error } = await supabase.rpc('reject_match', { match_id: matchId });
            if (error) throw error;
            loadDashboardData();
        } catch (error: any) {
            alert('Error rejecting match: ' + error.message);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in relative z-10 pb-20">
            <WelcomeModal isOpen={showWelcome} onClose={handleCloseWelcome} />
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">PadelUp</h1>
                    <p className="text-slate-400 font-medium">
                        {profile ? `Welcome back, ${profile.username}` : 'Welcome Guest'}
                    </p>
                </div>
                <Link to="/profile">
                    <Avatar src={profile?.avatar_url} fallback={profile?.username || 'G'} className="ring-2 ring-slate-700/50" />
                </Link>
            </header>

            {/* Hero Stats Card (Only if logged in with a profile) */}
            {/* Profile */}
            {profile && (
                <div className="grid grid-cols-2 gap-4">
                    <Link to="/levels" className="block rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 border border-slate-700/50 shadow-lg hover:border-slate-500 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Current Level</p>
                                <p className="text-3xl font-black text-white">
                                    {getLevelFromElo(profile.elo).level}

                                </p>
                            </div>

                            <div className="text-right">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Elo</p>
                                <p className="text-lg font-bold text-green-400">{profile.elo}</p>
                            </div>


                        </div>
                        <div>
                            <span className="text-sm font-normal text-slate-400 ml-2">{getLevelFromElo(profile.elo).label}</span>
                        </div>

                        {/* Progress Bar (Visual flair) */}
                        <div className="w-full h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
                            <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${Math.min(100, Math.max(0, ((profile.elo - getLevelFromElo(profile.elo).min) / (getLevelFromElo(profile.elo).max - getLevelFromElo(profile.elo).min)) * 100))}%` }}
                            />
                        </div>
                        <p className="text-[10px] text-green-500/80 mt-1.5 font-medium text-right">
                            {getLevelFromElo(profile.elo).max - profile.elo} pts to next level
                        </p>
                    </Link>

                    {/* Recent played */}
                    <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 border border-slate-700/50 shadow-lg">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Recent Played</p>
                        <div className="flex flex-col gap-2 mt-2">
                            {recentForm.length === 0 ? (
                                <span className="text-xs text-slate-500">No matches yet</span>
                            ) : (
                                recentForm.map((item, i) => (
                                    <div key={i} className="flex items-center space-x-5 bg-white/5 p-0.5  rounded-lg">
                                        <span className="text-[10px] text-slate-500 font-mono leading-none">Id: {item.id}</span>
                                        <div className="flex items-center gap-2">
                                            <div
                                                className={`h-2 w-2 rounded-full shadow-sm ${item.won ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500/50'}`}
                                            />
                                            <span className={`text-[10px] font-bold leading-none ${item.won ? 'text-green-500' : 'text-red-500'}`}>
                                                {item.won ? "WIN" : "LOSS"}
                                            </span>
                                        </div>
                                        <span className={`text-xs font-bold leading-none ${item.won ? 'text-green-500' : 'text-red-500'}`}>
                                            {item.points !== null ? (item.points > 0 ? `+${item.points}` : item.points) : '-'}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 font-medium">Last 5 matches</p>
                    </div>
                </div>

            )}

            {/* PENDING VERIFICATION SECTION */}
            {pendingMatches.length > 0 && (
                <div className="animate-pulse-slow">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-sm font-bold text-yellow-500 flex items-center gap-2">
                            <Clock size={16} />
                            Pending Verification
                        </h2>
                    </div>
                    <div className="space-y-3">
                        {pendingMatches.map((match) => {
                            const isUserTeam1 = match.team1_p1 === profile?.id || match.team1_p2 === profile?.id;
                            const isCreatorTeam1 = match.created_by && (match.team1_p1 === match.created_by || match.team1_p2 === match.created_by);
                            const isCreatorTeam2 = match.created_by && (match.team2_p1 === match.created_by || match.team2_p2 === match.created_by);

                            // User can verify ONLY if they are NOT on the creating team
                            // If created_by is null (legacy), allow everyone to verify (or no one? Let's allow for now to unblock)
                            const canVerify = match.created_by
                                ? (isUserTeam1 && !isCreatorTeam1) || (!isUserTeam1 && !isCreatorTeam2)
                                : true;


                            const scoreList = Array.isArray(match.score) ? match.score : [];


                            return (
                                <div key={match.id} className="relative flex flex-col gap-1 rounded-xl bg-yellow-500/10 p-4 border border-yellow-500/30">
                                    {/* Header: Time and Auto-Accept */}
                                    <div className="flex justify-between items-center pb-2 border-b border-yellow-500/10">
                                        <p className="text-[10px] text-yellow-500 flex items-center gap-1 font-medium">
                                            <Clock size={12} /> Auto-accepts in 24h
                                        </p>
                                        <p className="text-[10px] text-yellow-500 flex items-center gap-1 font-medium">
                                            Match number: {match.id}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-medium">
                                            {new Date(match.created_at).toLocaleString()}
                                        </p>
                                    </div>

                                    {/* Main Content: Teams vs Score */}
                                    <div className="flex items-center justify-between gap-3">
                                        {/* Teams Column */}
                                        <div className="flex flex-col gap-2 overflow-hidden flex-1">
                                            {/* Team 1 */}
                                            <div className={cn("flex items-center justify-center gap-2 text-sm font-semibold px-2 py-1.5 rounded-lg bg-slate-900/40", match.winner_team === 1 ? "text-green-400 ring-1 ring-green-500/30 bg-green-500/10" : "text-slate-300")}>
                                                <div className={match.winner_team === 1 ? "bg-green-500" : "bg-slate-500"} />
                                                <span className="truncate">{match.t1p1?.username} & {match.t1p2?.username}</span>
                                            </div>
                                            <span className="flex justify-center items-center text-slate-600 text-[10px]">VS</span>
                                            {/* Team 2 */}
                                            <div className={cn("flex items-center justify-center gap-2 text-sm font-semibold px-2 py-1.5 rounded-lg bg-slate-900/40", match.winner_team === 2 ? "text-green-400 ring-1 ring-green-500/30 bg-green-500/10" : "text-slate-300")}>
                                                <div className={match.winner_team === 2 ? "bg-green-500" : "bg-slate-500"} />
                                                <span className="truncate">{match.t2p1?.username} & {match.t2p2?.username}</span>
                                            </div>
                                        </div>

                                        {/* Score Column */}
                                        <div className="flex flex-col items-center justify-center bg-slate-900/60 p-2 rounded-lg border border-slate-700/50 min-w-[80px]">
                                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Score</span>
                                            <div className="flex flex-col gap-0.5">
                                                {scoreList.map((s: any, i: number) => (
                                                    <span key={i} className="font-mono text-white font-bold text-sm text-center">
                                                        {s.t1} - {s.t2}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {canVerify ? (
                                        <div className="flex gap-2 mt-1">
                                            <button
                                                onClick={() => handleConfirm(match.id)}
                                                className="flex-1 bg-green-500/20 hover:bg-green-500 text-green-500 hover:text-white py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1">
                                                <Check size={14} /> Confirm
                                            </button>
                                            <button
                                                onClick={() => handleReject(match.id)}
                                                className="flex-1 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1">
                                                <X size={14} /> Reject
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="mt-1 p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center">
                                            <p className="text-xs text-slate-400 italic flex items-center justify-center gap-2">
                                                <Clock size={12} /> Waiting for opponent confirmation...
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}


            {/* Main Action - Floating/Prominent */}
            <Link
                to="/new-match"
                className="group relative flex items-center justify-center gap-3 rounded-2xl bg-green-500 py-5 font-bold text-slate-900 shadow-xl shadow-green-500/20 active:scale-95 transition-all hover:bg-green-400 overflow-hidden"
            >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <Plus size={28} strokeWidth={3} />
                <span className="text-lg tracking-tight">Record New Match</span>
            </Link>

            {/* Matchmaking Suggestions */}
            {suggestions.length > 0 && (
                <div>
                    <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                        <User size={18} className="text-blue-400" />
                        Player Suggestions
                        <span className="text-xs font-normal text-slate-500 ml-auto border border-slate-700 px-2 py-0.5 rounded-full">ELO +/- 100</span>
                    </h2>
                    <div className="flex flex-col gap-3">
                        {suggestions.map(s => {
                            const diff = s.elo - (profile?.elo || 0);
                            const diffColor = diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-slate-400";
                            const diffText = diff > 0 ? `+${diff}` : diff;


                            return (
                                <div key={s.id} className="relative flex items-center p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:bg-slate-800 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <Avatar src={s.avatar_url} fallback={s.username} size="md" />
                                        <div>
                                            {s.username}
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="text-slate-400 font-bold">{s.elo} ELO</span>
                                                <span className={cn("font-medium", diffColor)}>diff of ({diffText})</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => window.dispatchEvent(new CustomEvent('openChat', { detail: s.id }))}
                                        className="absolute top-2 right-2 px-2 py-0.5 bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white rounded transition-colors font-bold text-[9px] uppercase tracking-wider border border-blue-500/20"
                                    >
                                        Get <br />in <br />touch </button>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Recent Activity Feed */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <HistoryIcon size={18} className="text-slate-400" />
                        Latest Activity
                    </h2>
                    <Link to="/history" className="text-xs font-medium text-green-400 hover:text-green-300">Match history</Link>
                </div>

                <div className="space-y-3">
                    {recentMatches.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 text-sm bg-slate-800/30 rounded-xl border border-dashed border-slate-800">
                            No recent confirmed matches found.
                        </div>
                    ) : (
                        recentMatches.map((match) => (
                            <div key={match.id} className="group flex flex-col gap-2 rounded-xl bg-slate-800/60 p-4 border border-slate-800 hover:border-slate-600 transition-all">
                                <div className=" flex justify-between text-xs text-slate-500">
                                    <span className="text-[10px] text-slate-500">
                                        {new Date(match.created_at).toLocaleDateString()}
                                    </span>
                                    <span>Match: {match.id}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                                            <span className={cn(match.winner_team === 1 ? "text-green-400" : "text-slate-400")}>
                                                {match.t1p1?.username} & {match.t1p2?.username}
                                            </span>
                                            <span className="text-slate-600 text-[10px]">VS</span>
                                            <span className={cn(match.winner_team === 2 ? "text-green-400" : "text-slate-400")}>
                                                {match.t2p1?.username} & {match.t2p2?.username}
                                            </span>

                                        </div>
                                        <div className="flex gap-2">
                                            {Array.isArray(match.score) && match.score.map((s: any, i: number) => (
                                                <span key={i} className="text-slate-400 font-mono text-xs">
                                                    {s.t1}-{s.t2}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center group-hover:bg-slate-600 transition-colors">
                                        <HistoryIcon size={14} className="text-slate-400" />
                                    </div>
                                </div>
                                {match.commentary && (
                                    <div className="mt-1 flex gap-2 pl-2 border-l-2 border-slate-700">
                                        <p className="text-xs text-slate-400 italic leading-relaxed line-clamp-2">"{match.commentary}"</p>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default Home;
