import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { User, Trophy, Flame, Shield, Swords, Award, TrendingUp, TrendingDown, ArrowLeft, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getLevelFromElo } from '../lib/elo';
import { cn } from '../components/ui/Button';


interface Profile {
    id: string;
    username: string;
    avatar_url: string | null;
    first_name?: string;
    last_name?: string;
    elo: number;
    subscription_end_date?: string;
    main_club_id: {
        id: string;
        name: string;
    };
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

interface TopPartner {
    id: string;
    username: string;
    avatar_url: string | null;
    matches: number;
    wins: number;
    winRate: number;
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
    const [synergy, setSynergy] = useState({
        matchesPlayed: 0,
        winRate: 0
    });
    const [topPartners, setTopPartners] = useState<TopPartner[]>([]);

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
                .select('*, main_club_id(*)')
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
                calculateSynergy(user.id, id!);
            } else if (user && user.id === id) {
                // Viewing own profile
                fetchTopPartners(user.id);
            }

        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    }

    async function calculateSynergy(myId: string, partnerId: string) {
        // Fetch matches where both participated
        const { data: matches, error } = await supabase
            .from('matches')
            .select('*')
            .or(`team1_p1.eq.${myId},team1_p2.eq.${myId},team2_p1.eq.${myId},team2_p2.eq.${myId}`)
            .eq('status', 'confirmed');

        if (error || !matches) return;

        // Filter for matches where they were on the SAME team
        const partnershipMatches = matches.filter((m: Match) => {
            const team1 = [m.team1_p1, m.team1_p2];
            const team2 = [m.team2_p1, m.team2_p2];

            const onTeam1 = team1.includes(myId) && team1.includes(partnerId);
            const onTeam2 = team2.includes(myId) && team2.includes(partnerId);

            return onTeam1 || onTeam2;
        });

        const played = partnershipMatches.length;
        let wins = 0;

        partnershipMatches.forEach((m: Match) => {
            const myTeam = [m.team1_p1, m.team1_p2].includes(myId) ? 1 : 2;
            if (m.winner_team === myTeam) wins++;
        });

        setSynergy({
            matchesPlayed: played,
            winRate: played > 0 ? Math.round((wins / played) * 100) : 0
        });
    }

    async function fetchTopPartners(myId: string) {
        // Fetch all confirmed matches for me
        const { data: matches, error } = await supabase
            .from('matches')
            .select(`
                *,
                t1p1:team1_p1(id, username, avatar_url),
                t1p2:team1_p2(id, username, avatar_url),
                t2p1:team2_p1(id, username, avatar_url),
                t2p2:team2_p2(id, username, avatar_url)
            `)
            .or(`team1_p1.eq.${myId},team1_p2.eq.${myId},team2_p1.eq.${myId},team2_p2.eq.${myId}`)
            .eq('status', 'confirmed');

        if (error || !matches) return;

        const partners: Record<string, { wins: number, matches: number, user: any }> = {};

        matches.forEach((m: any) => {
            // Identify my team and my partner
            let myTeam = 0;
            let partner = null;

            if (m.team1_p1 === myId) { myTeam = 1; partner = m.t1p2; }
            else if (m.team1_p2 === myId) { myTeam = 1; partner = m.t1p1; }
            else if (m.team2_p1 === myId) { myTeam = 2; partner = m.t2p2; }
            else if (m.team2_p2 === myId) { myTeam = 2; partner = m.t2p1; }

            if (partner && partner.id) { // Ensure partner exists (not deleted user)
                if (!partners[partner.id]) {
                    partners[partner.id] = { wins: 0, matches: 0, user: partner };
                }
                partners[partner.id].matches++;
                if (m.winner_team === myTeam) {
                    partners[partner.id].wins++;
                }
            }
        });

        // Convert to array and sort
        const result = Object.values(partners).map(p => ({
            id: p.user.id,
            username: p.user.username,
            avatar_url: p.user.avatar_url,
            matches: p.matches,
            wins: p.wins,
            winRate: Math.round((p.wins / p.matches) * 100)
        }));

        // Filter: at least 3 matches to be relevant? Or just show top.
        // Let's Sort by Win Rate (Weighted?) -> Simple Win Rate for now, but tie-break with matches.
        result.sort((a, b) => {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return b.matches - a.matches;
        });

        setTopPartners(result.slice(0, 6)); // Top 6
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
    const subscriptionExpired = !profile.subscription_end_date || profile.subscription_end_date < new Date().toISOString();

    return (
        <div className="max-w-4xl mx-auto pb-20">
            {/* Header Profile */}
            <div className="flex items-center gap-4 mb-4">
                <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <span className="text-white font-bold text-xl flex justify-center w-full mr-6"> {t('profile.user_profile')}</span>
            </div>
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
                {subscriptionExpired && (
                    <p className="text-red-500 text-sm mt-1">{t('profile.subscription_expired')}</p>
                )}
                <p className="text-slate-400 text-sm mt-1 gap-2">{t('profile.main_club')} : <span className="text-white">{profile.main_club_id?.name ?? "-"}</span></p>
            </div>


            {/* Rivalry & Synergy Section (Only if not viewing own profile) */}
            {!isMe && currentUser && (
                <div className="mt-8 space-y-8">
                    {/* RIVALRY SECTION */}
                    <div>
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
                                        <div className="text-white font-bold text-sm">{t('profile.rivalry.unknown_title')}</div>
                                        <div className="text-slate-500 text-[10px]">{t('profile.rivalry.unknown_desc')}</div>
                                    </>
                                ) : stats.winRate >= 65 ? (
                                    <>
                                        <Award className="w-10 h-10 text-yellow-500 mb-2" />
                                        <div className="text-yellow-400 font-bold text-sm">{t('profile.rivalry.client_title')}</div>
                                        <div className="text-slate-400 text-[10px]">{t('profile.rivalry.client_desc')}</div>
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
                            <div className="bg-slate-800/50 flex items-center justify-center p-6 rounded-xl border border-slate-700/50 backdrop-blur-sm flex flex-col justify-center">
                                <div className="text-slate-400 text-xs mb-2">{t('profile.current_run')} </div>
                                {stats.streak > 0 ? (
                                    <div className="flex flex-col items-center">
                                        <div className="flex items-center gap-2">
                                            <div className="text-2xl font-bold text-green-400">{t(Math.abs(stats.streak) === 1 ? 'profile.streak_win' : 'profile.streak_wins', { count: Math.abs(stats.streak) })}</div>
                                            <TrendingUp className="w-4 h-4 text-green-500 shrink-0" />
                                        </div>
                                        <div className="text-[10px] text-green-500/80 mt-1">{t('profile.streak_wins_desc')}</div>
                                    </div>
                                ) : stats.streak < 0 ? (
                                    <div className="flex flex-col items-center">
                                        <div className="flex items-center gap-2">
                                            <div className="text-2xl font-bold text-red-400">{t(Math.abs(stats.streak) === 1 ? 'profile.streak_losses' : 'profile.streak_losses_plural', { count: Math.abs(stats.streak) })}</div>
                                            <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
                                        </div>
                                        <div className="text-[10px] text-red-500/80 mt-1">{t('profile.streak_losses_desc')}</div>
                                    </div>
                                ) : (
                                    <div className="text-slate-500 text-sm">{t('profile.no_streak')}</div>
                                )}
                            </div>
                        </div>
                    </div>


                    {/* SYNERGY SECTION */}
                    <div>
                        <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-4">
                            <Users size={24} className="text-blue-400" />
                            {t('profile.synergy.title')}
                        </h2>

                        <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 backdrop-blur-sm flex flex-col justify-center items-center text-center">
                            {synergy.matchesPlayed > 0 ? (
                                <>
                                    <div className="text-4xl font-black text-blue-400 mb-2">{synergy.winRate}%</div>
                                    <div className="text-sm text-slate-400 uppercase tracking-widest font-bold">{t('profile.synergy.win_rate')}</div>
                                    <div className="mt-4 text-lg font-bold text-white">
                                        {synergy.winRate >= 80 ? t('profile.synergy.perfect') :
                                            synergy.winRate >= 60 ? t('profile.synergy.good') :
                                                synergy.winRate >= 40 ? t('profile.synergy.average') :
                                                    t('profile.synergy.bad')}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">{synergy.matchesPlayed} {t('profile.synergy.matches')}</div>
                                </>
                            ) : (
                                <div className="text-slate-500 italic py-4">{t('profile.synergy.unknown_desc')}</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Top Partners Section (Only if viewing own profile) */}
            {isMe && topPartners.length > 0 && (
                <div className="mt-8">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Users className="w-6 h-6 text-blue-400" />
                        {t('profile.top_partners')}
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {topPartners.map((partner) => (
                            <div key={partner.id} onClick={() => navigate(`/user/${partner.id}`)} className="flex items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 hover:bg-slate-800 transition-all cursor-pointer group">
                                <div className="flex items-center gap-3">
                                    <div className="relative">

                                        {partner.avatar_url ? (
                                            <img src={partner.avatar_url} alt={partner.username} className="w-10 h-10 rounded-full object-cover bg-slate-700" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white border border-slate-600">
                                                {partner.username.substring(0, 2).toUpperCase()}
                                            </div>
                                        )}
                                        <div className={cn("absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-slate-800 flex items-center justify-center text-[8px] font-bold text-white",
                                            partner.winRate >= 60 ? "bg-green-500" : partner.winRate <= 40 ? "bg-red-500" : "bg-yellow-500"
                                        )}>
                                            {partner.winRate >= 60 ? "W" : "-"}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="font-bold text-white group-hover:text-blue-400 transition-colors">{partner.username}</div>
                                        <div className="text-xs text-slate-500">{partner.matches} {t('profile.synergy.matches')}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className={cn("text-xl font-bold",
                                        partner.winRate >= 75 ? "text-purple-400" :
                                            partner.winRate >= 60 ? "text-green-400" :
                                                partner.winRate >= 45 ? "text-yellow-400" : "text-red-400"
                                    )}>
                                        {partner.winRate}%
                                    </div>
                                    <div className="text-[10px] text-slate-500 uppercase">{t('profile.synergy.win_rate')}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );

}
