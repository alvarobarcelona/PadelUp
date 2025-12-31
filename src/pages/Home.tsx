
import { useEffect, useState } from 'react';
import { Plus, Trophy, History as HistoryIcon, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getLevelFromElo } from '../lib/elo';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../components/ui/Button';

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
    // We only need basic info for the feed
    t1p1: { username: string };
    t1p2: { username: string };
    t2p1: { username: string };
    t2p2: { username: string };
}

const Home = () => {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [recentMatches, setRecentMatches] = useState<MatchPreview[]>([]);
    const [recentForm, setRecentForm] = useState<boolean[]>([]);
    const [, setLoading] = useState(true);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            // 1. Get Current User (if logged in)
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('auth_id', user.id)
                    .single();

                if (profileData) {
                    setProfile(profileData);

                    // Fetch user's last 5 matches for form
                    const { data: userMatches } = await supabase
                        .from('matches')
                        .select('winner_team, team1_p1, team1_p2, team2_p1, team2_p2')
                        .or(`team1_p1.eq.${profileData.id},team1_p2.eq.${profileData.id},team2_p1.eq.${profileData.id},team2_p2.eq.${profileData.id}`)
                        .order('created_at', { ascending: false })
                        .limit(5);

                    if (userMatches) {
                        const form = userMatches.map(m => {
                            const isTeam1 = m.team1_p1 === profileData.id || m.team1_p2 === profileData.id;
                            const isTeam2 = m.team2_p1 === profileData.id || m.team2_p2 === profileData.id;
                            return (isTeam1 && m.winner_team === 1) || (isTeam2 && m.winner_team === 2);
                        });
                        setRecentForm(form.reverse()); // Show oldest to newest left to right? Or newest left? usually newest right. Let's keep newest right.
                    }
                }
            }

            // 2. Fetch Recent Matches (Global Feed)
            const { data: matchesData } = await supabase
                .from('matches')
                .select(`
                id, created_at, winner_team,
                t1p1:team1_p1(username),
                t1p2:team1_p2(username),
                t2p1:team2_p1(username),
                t2p2:team2_p2(username)
            `)
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

    return (
        <div className="space-y-6 animate-fade-in relative z-10">
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
            {profile ? (
                <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 border border-slate-700/50 shadow-lg">
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
                    </div>

                    <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 border border-slate-700/50 shadow-lg">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Recent Form</p>
                        <div className="flex gap-1.5 mt-1">
                            {recentForm.length === 0 ? (
                                <span className="text-xs text-slate-500">No matches yet</span>
                            ) : (
                                recentForm.map((won, i) => (
                                    <div
                                        key={i}
                                        className={`h-3 w-3 rounded-full shadow-sm ${won ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500/50'}`}
                                        title={won ? 'Win' : 'Loss'}
                                    />
                                ))
                            )}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 font-medium">Last 5 matches</p>
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl bg-slate-800 p-6 text-center border border-slate-700">
                    <p className="text-slate-300 mb-4">Join the club to track your stats!</p>
                    <Link to="/auth" className="inline-block rounded-xl bg-green-500 px-6 py-2 font-bold text-slate-900 shadow-lg hover:bg-green-400 transition-colors">
                        Login / Register
                    </Link>
                    <div className="mt-4 text-xs text-slate-500">
                        Or just record matches as guest below
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

            {/* Quick Nav Grid */}
            <div className="grid grid-cols-2 gap-4">
                <Link to="/rankings" className="flex items-center gap-3 rounded-xl bg-slate-800/80 p-4 border border-slate-700/50 hover:bg-slate-800 hover:border-slate-600 transition-all group">
                    <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500 group-hover:bg-yellow-500 group-hover:text-slate-900 transition-colors">
                        <Trophy size={20} />
                    </div>
                    <span className="font-semibold text-slate-200">Rankings</span>
                </Link>
                <Link to="/players" className="flex items-center gap-3 rounded-xl bg-slate-800/80 p-4 border border-slate-700/50 hover:bg-slate-800 hover:border-slate-600 transition-all group">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                        <User size={20} />
                    </div>
                    <div>
                        <span className="font-semibold text-slate-200 block">Community</span>
                        <span className="text-[10px] text-slate-500">View Players</span>
                    </div>
                </Link>
            </div>

            {/* Recent Activity Feed */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <HistoryIcon size={18} className="text-slate-400" />
                        Latest Activity
                    </h2>
                    <Link to="/history" className="text-xs font-medium text-green-400 hover:text-green-300">View All</Link>
                </div>

                <div className="space-y-3">
                    {recentMatches.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 text-sm bg-slate-800/30 rounded-xl border border-dashed border-slate-800">
                            No recent matches found.
                        </div>
                    ) : (
                        recentMatches.map((match) => (
                            <div key={match.id} className="group flex items-center justify-between rounded-xl bg-slate-800/60 p-4 border border-slate-800 hover:border-slate-600 transition-all">
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
                                    <span className="text-[10px] text-slate-500">
                                        {new Date(match.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center group-hover:bg-slate-600 transition-colors">
                                    <HistoryIcon size={14} className="text-slate-400" />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default Home;
