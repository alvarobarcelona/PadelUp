import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Trophy, Flame, Shield, Swords, Award, TrendingUp, TrendingDown, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getLevelFromElo } from '../lib/elo';


interface Profile {
    id: string;
    username: string;
    avatar_url: string | null;
    first_name?: string;
    last_name?: string;
    elo: number;
    level: number;
    created_at: string;
}

interface Match {
    id: number;
    winner_team: number; // 1 or 2
    team1_p1: string;
    team1_p2: string;
    team2_p1: string;
    team2_p2: string;
    created_at: string;
    score: any;
}

export default function UserProfile() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [currentUser, setCurrentUser] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        streak: 0, // >0 for win streak, <0 for loss streak
        winRate: 0,
    });

    useEffect(() => {
        fetchData();
    }, [id]);

    async function fetchData() {
        try {
            setLoading(true);

            // 1. Get Current User
            const { data: { user } } = await supabase.auth.getUser();
            setCurrentUser(user?.id || null);

            // 2. Get Target Profile
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', id)
                .single();

            if (profileError || !profileData) {
                console.error('Error fetching profile:', profileError);
                return; // Handle 404
            }

            setProfile(profileData);

            // 3. Calculate H2H if current user exists and is not the same as profile
            if (user && user.id !== id) {
                calculateH2H(user.id, id!);
            }

        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    }

    async function calculateH2H(myId: string, rivalId: string) {
        // Fetch matches where both participated
        const { data: matches, error } = await supabase
            .from('matches')
            .select('*')
            .or(`team1_p1.eq.${myId},team1_p2.eq.${myId},team2_p1.eq.${myId},team2_p2.eq.${myId}`)
            .eq('status', 'confirmed')
            .order('created_at', { ascending: false });

        if (error || !matches) return;

        let played = 0;
        let myWins = 0;
        let myLosses = 0;
        let currentStreak = 0;
        let streakBroken = false;

        // Filter for matches where rival also played
        const mutualMatches = matches.filter((m: Match) =>
            [m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].includes(rivalId)
        );

        // Further filter: MUST BE OPPONENTS. 
        // If they are strictly on same team (partner), it's not H2H (optional decision, usually H2H implies rivalry)
        // We check if they are on opposite teams.
        const rivalryMatches = mutualMatches.filter((m: Match) => {
            const myTeam = [m.team1_p1, m.team1_p2].includes(myId) ? 1 : 2;
            const rivalTeam = [m.team1_p1, m.team1_p2].includes(rivalId) ? 1 : 2;
            return myTeam !== rivalTeam;
        });

        rivalryMatches.forEach((m: Match) => {
            played++;
            const myTeam = [m.team1_p1, m.team1_p2].includes(myId) ? 1 : 2;
            const won = m.winner_team === myTeam;

            if (won) myWins++;
            else myLosses++;

            // Calculate streak
            if (!streakBroken) {
                if (currentStreak === 0) {
                    currentStreak = won ? 1 : -1;
                } else if (currentStreak > 0 && won) {
                    currentStreak++;
                } else if (currentStreak < 0 && !won) {
                    currentStreak--;
                } else {
                    streakBroken = true;
                }
            }
        });

        setStats({
            matchesPlayed: played,
            wins: myWins,
            losses: myLosses,
            streak: currentStreak,
            winRate: played > 0 ? Math.round((myWins / played) * 100) : 0
        });
    }

    if (loading) return <div className="p-8 text-center text-gray-400">{t('common.loading')}</div>;
    if (!profile) return <div className="p-8 text-center text-red-500">{t('profile.not_found')}</div>;

    const isMe = currentUser === profile.id;

    return (
        <div className="max-w-4xl mx-auto pb-20">
            {/* Header Profile */}
            <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white">
                <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="bg-slate-800/50 backdrop-blur-md p-8 rounded-2xl border border-slate-700/50 flex flex-col items-center shadow-xl">
                <div className="relative">

                    <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-slate-600 bg-slate-700 shadow-2xl">
                        {profile.avatar_url ? (
                            <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                                <User className="w-16 h-16 text-slate-500" />
                            </div>
                        )}
                    </div>
                    <div className="absolute -bottom-3 -right-3 bg-yellow-500 text-slate-900 font-bold px-3 py-1 rounded-full text-sm shadow-lg border-2 border-slate-800 flex items-center gap-1">
                        <Trophy className="w-3 h-3" />
                        {profile.elo}
                    </div>
                </div>

                <h1 className="mt-6 text-3xl font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                    {profile.username}
                </h1>
                {(profile.first_name || profile.last_name) && (
                    <p className="text-lg text-slate-300 font-medium mt-1">
                        {profile.first_name} {profile.last_name}
                    </p>
                )}
                <p className="text-slate-400 text-sm mt-1">{t('profile.level')} {getLevelFromElo(profile.elo).level}</p>
                <p className="text-slate-400 text-sm mt-1">{t('profile.joined', { date: new Date(profile.created_at).toLocaleDateString() })}</p>
            </div>

            {/* Rivalry Section (Only if not viewing own profile) */}
            {!isMe && currentUser && (
                <div className="mt-8">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Swords className="w-6 h-6 text-red-500" />
                        {t('profile.head_to_head')}
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Stats Card */}
                        <div className="bg-slate-800/50 flex flex-col items-center justify-center p-6 rounded-xl border border-slate-700/50 backdrop-blur-sm">
                            <div className="text-slate-400 text-sm mb-2">{t('profile.record_against', { name: profile.username })}</div>
                            <div className="flex items-end gap-2">
                                <span className="text-4xl font-bold text-green-400">{stats.wins}</span>
                                <span className="text-lg text-slate-500 mb-1">-</span>
                                <span className="text-4xl font-bold text-red-400">{stats.losses}</span>
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                                {t(stats.matchesPlayed === 1 ? 'profile.matches_total_wr_singular' : 'profile.matches_total_wr', { count: stats.matchesPlayed, wr: stats.winRate })}
                            </div>
                        </div>


                        {/* Badge/Status Card */}
                        <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 backdrop-blur-sm flex flex-col justify-center items-center text-center">
                            {stats.matchesPlayed < 3 ? (
                                <>
                                    <Shield className="w-8 h-8 text-slate-600 mb-2" />
                                    <div className="text-white font-bold">{t('profile.rivalry.unknown_title')}</div>
                                    <div className="text-slate-500 text-xs">{t('profile.rivalry.unknown_desc')}</div>
                                </>
                            ) : stats.winRate >= 65 ? (
                                <>
                                    <Award className="w-10 h-10 text-yellow-500 mb-2" />
                                    <div className="text-yellow-400 font-bold text-lg">{t('profile.rivalry.client_title')}</div>
                                    <div className="text-slate-400 text-xs">{t('profile.rivalry.client_desc')}</div>
                                </>
                            ) : stats.winRate <= 35 ? (
                                <>
                                    <Flame className="w-10 h-10 text-red-500 mb-2" />
                                    <div className="text-red-500 font-bold text-lg">{t('profile.rivalry.nemesis_title')}</div>
                                    <div className="text-slate-400 text-xs">{t('profile.rivalry.nemesis_desc')}</div>
                                </>
                            ) : (
                                <>
                                    <Swords className="w-10 h-10 text-blue-400 mb-2" />
                                    <div className="text-blue-400 font-bold text-lg">{t('profile.rivalry.even_title')}</div>
                                    <div className="text-slate-400 text-xs">{t('profile.rivalry.even_desc')}</div>
                                </>
                            )}
                        </div>

                        {/* Streak Card */}
                        <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 backdrop-blur-sm flex flex-col justify-center">
                            <div className="text-slate-400 text-sm mb-2">{t('profile.current_run')} </div>
                            {stats.streak > 0 ? (

                                <div className="flex flex-col items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="text-2xl font-bold text-green-400">{t(Math.abs(stats.streak) === 1 ? 'profile.streak_win' : 'profile.streak_wins', { count: Math.abs(stats.streak) })}</div>
                                        <TrendingUp className="w-5 h-5 text-green-500 shrink-0" />
                                    </div>
                                    <div className="text-xs text-green-500/80">{t('profile.streak_wins_desc')}</div>
                                </div>
                            ) : stats.streak < 0 ? (
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <div className="text-2xl font-bold text-red-400">{t(Math.abs(stats.streak) === 1 ? 'profile.streak_losses' : 'profile.streak_losses_plural', { count: Math.abs(stats.streak) })}</div>
                                        <TrendingDown className="w-5 h-5 text-red-500 shrink-0" />
                                    </div>
                                    <div className="text-xs text-red-500/80">{t('profile.streak_losses_desc')}</div>
                                </div>
                            ) : (
                                <div className="text-slate-500">{t('profile.no_streak')}</div>
                            )}
                        </div>
                    </div>

                </div>
            )
            }
        </div >
    );

}
