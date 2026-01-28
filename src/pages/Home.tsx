import { useEffect, useState } from 'react';
import { Plus, History as HistoryIcon, User, Check, X, Clock, Trophy, Info, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getLevelFromElo } from '../lib/elo';
import { Avatar } from '../components/ui/Avatar';
import { cn } from '../components/ui/Button';
import { WelcomeModal } from '../components/Modals/WelcomeModal';
import { InfoModal } from '../components/Modals/InfoModal';
import { logActivity } from '../lib/logger';
import { useTranslation } from 'react-i18next';
import { useModal } from '../context/ModalContext';
import { MatchHistoryModal } from '../components/Modals/MatchHistoryModal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PullToRefresh } from '../components/ui/PullToRefresh';

interface Profile {
    id: string;
    username: string;
    elo: number;
    avatar_url: string | null;
    subscription_end_date?: string;
    is_admin?: boolean;
}

interface MatchPreview {
    id: number;
    created_at: string;
    winner_team: number;
    commentary?: string | null;
    status: 'pending' | 'confirmed' | 'rejected';
    created_by?: string | null;
    creator?: { username: string } | null;
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
    const { alert, confirm } = useModal();
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    // UI State
    const [showWelcome, setShowWelcome] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // --- QUERIES ---

    // 1. User
    const { data: user } = useQuery({
        queryKey: ['user'],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            return user;
        },
        staleTime: Infinity
    });

    // 2. Profile
    const { data: profile } = useQuery({
        queryKey: ['profile', user?.id],
        enabled: !!user,
        queryFn: async () => {
            if (!user) return null;
            const { data } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            return data as Profile;
        }
    });

    // 3. Recent Form (Personal)
    const { data: recentForm = [] } = useQuery({
        queryKey: ['matchForm', user?.id],
        enabled: !!profile,
        queryFn: async () => {
            if (!profile) return [];
            const { data: userMatches } = await supabase
                .from('matches')
                .select('id, winner_team, team1_p1, team1_p2, team2_p1, team2_p2, elo_snapshot, created_at')
                .or(`team1_p1.eq.${profile.id},team1_p2.eq.${profile.id},team2_p1.eq.${profile.id},team2_p2.eq.${profile.id}`)
                .eq('status', 'confirmed')
                .order('created_at', { ascending: false })
                .limit(6);

            if (!userMatches) return [];

            const form = [];
            const count = Math.min(5, userMatches.length);

            for (let i = 0; i < count; i++) {
                const m = userMatches[i];
                const isTeam1 = m.team1_p1 === profile.id || m.team1_p2 === profile.id;
                const isTeam2 = m.team2_p1 === profile.id || m.team2_p2 === profile.id;
                const won = (isTeam1 && m.winner_team === 1) || (isTeam2 && m.winner_team === 2);

                let points = null;
                if (m.elo_snapshot) {
                    let posKey = '';
                    if (m.team1_p1 === profile.id) posKey = 't1p1';
                    else if (m.team1_p2 === profile.id) posKey = 't1p2';
                    else if (m.team2_p1 === profile.id) posKey = 't2p1';
                    else if (m.team2_p2 === profile.id) posKey = 't2p2';

                    const currentElo = (m.elo_snapshot as any)[posKey];
                    let prevElo = 1150;

                    if (i + 1 < userMatches.length) {
                        const olderMatch = userMatches[i + 1];
                        if (olderMatch.elo_snapshot) {
                            let olderPosKey = '';
                            if (olderMatch.team1_p1 === profile.id) olderPosKey = 't1p1';
                            else if (olderMatch.team1_p2 === profile.id) olderPosKey = 't1p2';
                            else if (olderMatch.team2_p1 === profile.id) olderPosKey = 't2p1';
                            else if (olderMatch.team2_p2 === profile.id) olderPosKey = 't2p2';
                            prevElo = (olderMatch.elo_snapshot as any)[olderPosKey] || prevElo;
                        }
                    } else if (i === userMatches.length - 1 && userMatches.length < 6) {
                        prevElo = 1150;
                    }

                    if (currentElo !== undefined && prevElo !== undefined) {
                        points = currentElo - prevElo;
                        if (won && points < 0) points = 0;
                        if (!won && points > 0) points = 0;
                    }
                }
                form.push({ id: m.id, won, points });
            }
            return form.reverse();
        }
    });

    // 4. Suggestions
    const { data: suggestions = [] } = useQuery({
        queryKey: ['suggestions', user?.id, profile?.elo],
        enabled: !!user && !!profile,
        staleTime: 1000 * 60 * 5, // 5 minutes
        queryFn: async () => {
            if (!user || !profile) return [];
            // Optimistic approach: fetch all approved, filter locally. 
            // In a larger app, using RPC or DB function is better.
            const { data: candidates } = await supabase
                .from('profiles')
                .select('id, username, elo, avatar_url')
                .neq('id', user.id)
                .eq('approved', true)
                .eq('is_admin', false);

            if (!candidates) return [];

            const minElo = profile.elo - 100;
            const maxElo = profile.elo + 100;
            const filtered = candidates.filter(p => p.elo >= minElo && p.elo <= maxElo);
            filtered.sort((a, b) => Math.abs(a.elo - profile.elo) - Math.abs(b.elo - profile.elo));
            return filtered.slice(0, 5);
        }
    });

    // 5. Pending Matches
    const { data: pendingMatches = [] } = useQuery({
        queryKey: ['pendingMatches', user?.id],
        enabled: !!user && !!profile,
        queryFn: async () => {
            if (!profile) return [];
            const { data: pending } = await supabase
                .from('matches')
                .select(`
                    id, created_at, winner_team, commentary, status, score, created_by,
                    team1_p1, team1_p2, team2_p1, team2_p2,
                    t1p1:team1_p1(username),
                    t1p2:team1_p2(username),
                    t2p1:team2_p1(username),
                    t2p2:team2_p2(username)
                `)
                .eq('status', 'pending')
                .or(`team1_p1.eq.${profile.id},team1_p2.eq.${profile.id},team2_p1.eq.${profile.id},team2_p2.eq.${profile.id}`)
                .order('created_at', { ascending: false });

            if (!pending) return [];

            // Helper to get creator names
            const creatorIds = [...new Set(pending.map(m => m.created_by).filter(Boolean))];
            let creatorsMap: Record<string, string> = {};
            if (creatorIds.length > 0) {
                const { data: creators } = await supabase.from('profiles').select('id, username').in('id', creatorIds);
                creators?.forEach(c => creatorsMap[c.id] = c.username);
            }

            return pending.map((m: any) => ({
                ...m,
                creator: m.created_by ? { username: creatorsMap[m.created_by] || t('common.deleted_user') } : null
            })) as unknown as MatchPreview[];
        }
    });

    // 6. Global Recent Matches
    const { data: recentMatches = [] } = useQuery({
        queryKey: ['recentGlobalMatches'],
        queryFn: async () => {
            const { data } = await supabase
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
            return (data || []) as unknown as MatchPreview[];
        }
    });

    // --- EFFECTS ---

    useEffect(() => {
        // Auto-process expired matches on mount
        supabase.rpc('process_expired_matches').then(({ error }) => {
            if (error) console.error('Error auto-processing matches:', error);
        });
    }, []);

    useEffect(() => {
        if (user) checkWelcomeStatus();
    }, [user]);

    const checkWelcomeStatus = async () => {
        if (!user) return;
        const hasSeenSession = sessionStorage.getItem('padelup_welcome_seen_session');
        if (hasSeenSession) return;

        const currentCount = user.user_metadata?.welcome_views_count || 0;
        if (currentCount < 5) {
            setShowWelcome(true);
            const newCount = currentCount + 1;
            const { error } = await supabase.auth.updateUser({
                data: { welcome_views_count: newCount }
            });
            if (!error) {
                sessionStorage.setItem('padelup_welcome_seen_session', 'true');
            }
        }
    };

    const handleCloseWelcome = () => {
        setShowWelcome(false);
        sessionStorage.setItem('padelup_welcome_seen_session', 'true');
    };


    // --- MUTATIONS ---

    const confirmMutation = useMutation({
        mutationFn: async (matchId: number) => {
            const { error } = await supabase.rpc('confirm_match', { match_id: matchId });
            if (error) throw error;
            return matchId;
        },
        onSuccess: () => {
            // Find match for logging before invalidating - tricky since we invalidated but maybe we can find it in cache
            // Actually logActivity is side effect, let's do it here
            // We need match details.

            // Invalidate to refresh UI
            queryClient.invalidateQueries({ queryKey: ['pendingMatches'] });
            queryClient.invalidateQueries({ queryKey: ['recentGlobalMatches'] }); // It moves to global
            queryClient.invalidateQueries({ queryKey: ['matchForm'] }); // User form updates
            queryClient.invalidateQueries({ queryKey: ['profile'] }); // Elo updates

            // Re-fetch rankings too if we want, but fine to let it be stale till user visits
        },
        onError: (error: any) => {
            alert({ title: 'Error', message: 'Error rejecting match: ' + error.message, type: 'danger' });
        }
    });

    const rejectMutation = useMutation({
        mutationFn: async ({ matchId, reason }: { matchId: number, reason: string }) => {
            const { error } = await supabase.rpc('reject_match', { match_id: matchId, reason: reason });
            if (error) throw error;
            return { matchId, reason };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['pendingMatches'] });
        },
        onError: (error: any) => {
            alert({ title: 'Error', message: 'Error rejecting match: ' + error.message, type: 'danger' });
        }
    });


    const handleConfirm = async (matchId: number) => {
        const confirmed = await confirm({
            title: t('home.confirm_title') || 'Confirm Match',
            message: t('home.confirm_prompt'),
            type: 'confirm',
            confirmText: 'Confirm'
        });
        if (!confirmed) return;

        // Log before mutation or inside?
        // We have recentMatches in scope (actually pendingMatches)
        const match = pendingMatches.find(m => m.id === matchId);

        confirmMutation.mutate(matchId, {
            onSuccess: () => {
                if (match) {
                    logActivity('MATCH_CONFIRM', matchId.toString(), {
                        match_snapshot: match || 'Match details not found'
                    });
                }
            }
        });
    };

    const handleReject = async (matchId: number) => {
        const reason = prompt(t('home.reject_reason_prompt'));
        if (reason === null) return;
        if (reason.trim() === '') {
            await alert({ title: 'Warning', message: t('home.reject_reason_required'), type: 'warning' });
            return;
        }

        const confirmed = await confirm({
            title: t('home.reject_title') || 'Reject Match',
            message: t('home.reject_confirm'),
            type: 'danger',
            confirmText: 'Reject'
        });
        if (!confirmed) return;

        const match = pendingMatches.find(m => m.id === matchId);

        rejectMutation.mutate({ matchId, reason }, {
            onSuccess: () => {
                if (match) {
                    logActivity('MATCH_REJECT', matchId.toString(), {
                        reason: reason.trim(),
                        match_snapshot: match || 'Match details not found'
                    });
                }
            }
        });
    };


    const handleRefresh = async () => {
        await Promise.all([
            queryClient.refetchQueries({ queryKey: ['user'] }),
            queryClient.refetchQueries({ queryKey: ['profile'] }),
            queryClient.refetchQueries({ queryKey: ['matchForm'] }),
            queryClient.refetchQueries({ queryKey: ['suggestions'] }),
            queryClient.refetchQueries({ queryKey: ['pendingMatches'] }),
            queryClient.refetchQueries({ queryKey: ['recentGlobalMatches'] })
        ]);
    };

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="space-y-6 animate-fade-in relative z-10 pb-20">
                <WelcomeModal isOpen={showWelcome} onClose={handleCloseWelcome} />
                <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} />
                <MatchHistoryModal isOpen={showHistoryModal} onClose={() => setShowHistoryModal(false)} userId={profile?.id} />
                <header className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-3xl font-bold text-white tracking-tight">PadelUp</h1>
                            <button
                                onClick={() => setShowInfo(true)}
                                className="p-1 text-slate-400 hover:text-white transition-colors rounded-full hover:bg-slate-800"
                            >
                                <Info size={20} />
                            </button>
                        </div>
                        <p className="text-slate-400 font-medium">
                            {profile ? t('home.welcome_user', { name: profile.username }) : t('home.welcome_guest')}
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
                        <div className="relative block rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 border border-slate-700/50 shadow-lg hover:border-slate-500 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">{t('home.current_level')}</p>
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
                                <span className="text-sm font-normal text-slate-400 ">{t(`levels.names.${getLevelFromElo(profile.elo).key}`)}</span>
                            </div>

                            {/* Progress Bar (Visual flair) */}
                            <div className="w-full h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
                                <div
                                    className="h-full bg-green-500 rounded-full"
                                    style={{ width: `${Math.min(100, Math.max(0, ((profile.elo - getLevelFromElo(profile.elo).min) / (getLevelFromElo(profile.elo).max - getLevelFromElo(profile.elo).min)) * 100))}%` }}
                                />
                            </div>
                            <p className="text-[10px] text-green-500/80 mt-1.5 font-medium text-right">
                                {t('home.pts_next_level', { points: getLevelFromElo(profile.elo).max - profile.elo })}
                            </p>

                            {/* Info Button - Bottom Left */}
                            <Link to="/levels" className="absolute bottom-2 left-3 p-1 text-slate-500 hover:text-white transition-colors bg-slate-800/50 rounded-full">
                                <Info size={20} />
                            </Link>
                        </div>

                        {/* Recent played */}
                        <div
                            onClick={() => setShowHistoryModal(true)}
                            className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-5 border border-slate-700/50 shadow-lg cursor-pointer hover:border-slate-500 transition-colors group"
                        >
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">{t('home.recent_played')}</p>
                            <div className="flex flex-col gap-2 mt-2">
                                {recentForm.length === 0 ? (
                                    <span className="text-xs text-slate-500">{t('home.no_matches')}</span>
                                ) : (
                                    recentForm.map((item, i) => (
                                        <div key={i} className="flex items-center space-x-2 bg-white/5 p-0.5  rounded-lg">
                                            <span className="text-[10px] text-slate-500 font-mono leading-none">Id: {item.id}</span>
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className={`h-2 w-2 rounded-full shadow-sm ${item.won ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500/50'}`}
                                                />
                                                <span className={`text-[10px] font-bold leading-none ${item.won ? 'text-green-500' : 'text-red-500'}`}>
                                                    {item.won ? t('home.win') : t('home.loss')}
                                                </span>
                                            </div>
                                            <span className={`text-xs font-bold leading-none ${item.won ? 'text-green-500' : 'text-red-500'}`}>
                                                {item.points !== null ? (item.points > 0 ? `+${item.points}` : item.points) : '-'}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className=" flex items-center justify-between mt-2">
                                <p className="text-[10px] text-slate-500 font-medium group-hover:text-green-400 transition-colors flex items-center justify-between">
                                    {t('home.last_5')}</p>
                                <p className="text-[10px] text-slate-500 font-medium group-hover:text-green-400 transition-colors flex items-center justify-between"><Info size={20} /></p>
                            </div>

                        </div>
                    </div>

                )}

                {/* PENDING VERIFICATION SECTION */}
                {pendingMatches.length > 0 && (
                    <div className="animate-pulse-slow">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-sm font-bold text-yellow-500 flex items-center gap-2">
                                <Clock size={16} />
                                {t('home.pending_verification')}
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
                                        <div className="flex justify-between pb-1 border-b border-yellow-500/10">

                                            <span className="text-[10px] text-yellow-500 flex items-center gap-1 font-medium">
                                                <Clock size={12} /> {t('home.auto_accept')}
                                            </span>

                                            <span className="text-[10px] text-slate-500 font-mono">{t('home.match_number', { id: match.id })}</span>
                                        </div>
                                        <div className="flex justify-end pb-2 border-b border-yellow-500/10">

                                            <p className="text-[10px] text-slate-400 font-medium">
                                                {match.creator?.username && (
                                                    <span className="mr-2 text-slate-500">
                                                        {t('home.by')} {match.creator.username}
                                                    </span>
                                                )}
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
                                                    <Check size={14} /> {t('home.confirm')}
                                                </button>
                                                <button
                                                    onClick={() => handleReject(match.id)}
                                                    className="flex-1 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1">
                                                    <X size={14} /> {t('home.reject')}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="mt-1 p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center">
                                                <p className="text-xs text-slate-400 italic flex items-center justify-center gap-2">
                                                    <Clock size={12} /> {t('home.waiting_opponent')}
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
                    className="group relative flex items-center justify-center gap-3 rounded-2xl bg-green-500 py-5 font-bold text-slate-900 shadow-xl shadow-green-500/20 active:scale-95 transition-all hover:bg-green-400 overflow-hidden touch-none select-none"
                    style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                    <Plus size={28} strokeWidth={3} />
                    <span className="text-lg tracking-tight">{t('home.record_match')}</span>
                </Link>

                {/* Tournaments Link */}
                <button
                    onClick={() => {
                        const isAdmin = profile?.is_admin;

                        if (isAdmin) {
                            window.open("https://padel-tournaments-sepia.vercel.app", "_blank", "noopener,noreferrer");
                            return;
                        }

                        const isExpired = !profile?.subscription_end_date || new Date(profile.subscription_end_date) < new Date();

                        if (isExpired) {
                            confirm({
                                title: t('subscription.title'),
                                message: t('home.subscription_expired_alert'),
                                type: 'warning'
                            });
                            return;
                        }

                        window.open("https://padel-tournaments-sepia.vercel.app", "_blank", "noopener,noreferrer");
                    }}
                    className="w-full group relative flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-4 font-bold text-white shadow-xl shadow-orange-500/20 active:scale-95 transition-all hover:from-amber-400 hover:to-orange-500 overflow-hidden"
                >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                    <Trophy size={24} strokeWidth={2} />
                    <span className="text-lg tracking-tight">{t('home.tournaments')}</span>
                </button>

                {/* Player Suggestions */}
                {suggestions.length > 0 && (
                    <div>
                        <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                            <User size={18} className="text-blue-400" />
                            {t('home.suggestions')}
                            <span className="text-xs text-center font-normal text-slate-500 ml-auto border border-slate-700 px-2 py-0.5 rounded-full">{t('home.elo_range', { defaultValue: 'ELO +/- 100' })}</span>
                        </h2>
                        <span className="text-xs font-normal text-slate-500 mb-3 border border-slate-700 px-2 py-0.5 rounded-full">{t('home.suggestions_limit', { defaultValue: 'Max 10 suggestions' })}</span>
                        <div className="flex flex-col gap-3 mt-3">
                            {suggestions.slice(0, 10).map((s: any) => {
                                const diff = s.elo - (profile?.elo || 0);
                                const diffColor = diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-slate-400";
                                const diffText = diff > 0 ? `+${diff}` : diff;


                                return (
                                    <div key={s.id} className="relative flex justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 hover:bg-slate-800 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <Avatar src={s.avatar_url} fallback={s.username} size="md" />
                                            <div>
                                                {s.username}
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="text-slate-400 font-bold">{s.elo} ELO</span>
                                                    <span className={cn("font-medium", diffColor)}>{t('home.diff_of', { diff: diffText, defaultValue: `diff of (${diffText})` })}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Message Button */}
                                        <button
                                            onClick={() => window.dispatchEvent(new CustomEvent('openChat', { detail: s.id }))}
                                            className="ml-2 text-xs font-bold text-slate-400 p-1.5 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                                            title="Send Message"
                                        >
                                            <MessageCircle size={18} />
                                        </button>

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
                            {t('home.latest_activity')}
                        </h2>
                        <Link to="/history" className="text-xs font-medium text-green-400 hover:text-green-300">{t('home.match_history')}</Link>
                    </div>

                    <div className="space-y-3">
                        {recentMatches.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 text-sm bg-slate-800/30 rounded-xl border border-dashed border-slate-800">
                                {t('home.no_confirmed_matches')}
                            </div>
                        ) : (
                            recentMatches.slice(0, 10).map((match) => (
                                <div key={match.id} className="group flex flex-col gap-2 rounded-xl bg-slate-800/60 p-4 border border-slate-800 hover:border-slate-600 transition-all">
                                    <div className=" flex justify-between text-xs text-slate-500">
                                        <span className="text-[10px] text-slate-500">
                                            {new Date(match.created_at).toLocaleDateString()}
                                        </span>
                                        <span>{t('home.match_label', { id: match.id })}</span>
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
        </PullToRefresh>
    );
};

export default Home;
