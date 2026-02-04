

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Trophy, Medal, AlertTriangle, Lock, Share2 } from 'lucide-react';
import html2canvas from 'html2canvas';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useModal } from '../../context/ModalContext';
import { getFriends } from '../../lib/friends';

type ResultsProps = {
    tournament: any;
};

// Snapshot Component for Image Generation
const ResultsSnapshot = ({ tournament, winner, participants, rounds }: any) => {
    return (
        <div
            id="results-snapshot"
            className="absolute top-0 left-0 w-[1080px] h-auto bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8 pointer-events-none opacity-0 -z-50"
            style={{ fontFamily: 'Inter, sans-serif' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-8 border-b border-slate-700 pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-blue-400">
                        PadelUp
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">Tournament Results</p>
                </div>
                <div className="text-right">
                    <h2 className="text-xl font-bold text-white">{tournament.name}</h2>
                    <p className="text-slate-500 text-xs mt-1">
                        {new Date().toLocaleDateString()}
                    </p>
                </div>
            </div>

            {/* Winner Section */}
            {winner && (
                <div className="mb-8 flex flex-col items-center justify-center bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-2xl p-6">
                    <Trophy size={48} className="text-yellow-400 mb-2 drop-shadow-md" />
                    <h3 className="text-yellow-200 font-bold uppercase tracking-wider text-sm mb-1">Champion</h3>
                    <div className="text-3xl font-extrabold text-white mb-1">{winner.display_name}</div>
                    <div className="text-lg text-yellow-500 font-mono">{winner.score} PTS</div>
                </div>
            )}

            <div className="grid grid-cols-2 gap-8 items-start">
                {/* Rankings */}
                <div>
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Final Leaderboard</h3>
                    <div className="space-y-2">
                        {participants.slice(0, 8).map((p: any, i: number) => (
                            <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${i === 0 ? 'bg-yellow-500/10 border border-yellow-500/20' :
                                i === 1 ? 'bg-slate-700/50' :
                                    i === 2 ? 'bg-slate-800/50' : 'bg-transparent border-b border-slate-800'
                                }`}>
                                <div className="flex items-center gap-3 ">
                                    <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm pb-3 ${i === 0 ? 'bg-yellow-500 text-black' :
                                        i === 1 ? 'bg-slate-700 text-black' :
                                            i === 2 ? 'bg-slate-800 text-white' : 'bg-slate-800 text-slate-400'
                                        }`}>
                                        {i === 0 ? '🥇 ' :
                                            i === 1 ? '🥈' :
                                                i === 2 ? '🥉' :
                                                    (i + 1)}
                                    </div>
                                    <span className={`font-medium ${i === 0 ? 'text-yellow-100' : 'text-slate-200'}`}>
                                        {p.display_name}
                                    </span>
                                </div>
                                <span className="font-mono font-bold text-slate-400">{p.score} pts</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Match History */}
                {rounds && Object.keys(rounds).length > 0 && (
                    <div>
                        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Match History</h3>
                        <div className="space-y-6">
                            {Object.entries(rounds).map(([roundNum, roundMatches]: [string, any]) => (
                                <div key={roundNum}>
                                    <div className="inline-block px-3 py-1 bg-slate-800 rounded mb-2">
                                        <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">Round {roundNum}</span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        {roundMatches.map((m: any, idx: number) => (
                                            <div key={idx} className="bg-slate-800/40 p-3 rounded flex justify-between items-center text-sm border border-slate-700/50">
                                                <div className={`flex-1 text-right ${Number(m.score_team1) > Number(m.score_team2) ? 'text-green-400 font-bold' : 'text-slate-300'}`}>
                                                    {m.team1_p1_text} & {m.team1_p2_text}
                                                </div>
                                                <div className="px-3 font-mono font-bold text-white whitespace-nowrap">
                                                    {m.score_team1} - {m.score_team2}
                                                </div>
                                                <div className={`flex-1 text-left ${Number(m.score_team2) > Number(m.score_team1) ? 'text-green-400 font-bold' : 'text-slate-300'}`}>
                                                    {m.team2_p1_text} & {m.team2_p2_text}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
                <div>Play like a Pro, Count like a Legend</div>
                <div className="flex items-center gap-1">PadelUp Web-App</div>
                <div><img src="/apple-touch-icon.png" alt="PadelUp" className="w-6 h-6" /></div>
            </div>
        </div>
    );
};

export default function TournamentResults({ tournament }: ResultsProps) {
    const { t } = useTranslation();
    const { alert } = useModal();
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [hasAccess, setHasAccess] = useState<boolean | null>(null);

    useEffect(() => {
        const checkAccess = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                // Not logged in - only allow public tournaments
                setHasAccess(tournament.visibility === 'public');
                return;
            }

            setCurrentUserId(user.id);

            // Check if user is admin
            const { data: profile } = await supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', user.id)
                .single();

            if (profile?.is_admin) {
                setHasAccess(true);
                return;
            }

            // Check if user is creator
            if (tournament.created_by === user.id) {
                setHasAccess(true);
                return;
            }

            // Check visibility-based access
            if (tournament.visibility === 'public') {
                setHasAccess(true);
            } else if (tournament.visibility === 'friends') {
                // Check if user is friend of creator OR participant
                const { data: creatorFriends } = await getFriends(tournament.created_by);
                const isFriend = creatorFriends?.includes(user.id) || false;

                // Also check if user is a participant
                const { data: participants } = await supabase
                    .from('tournament_participants')
                    .select('player_id')
                    .eq('tournament_id', tournament.id)
                    .eq('player_id', user.id);

                const isParticipant = participants && participants.length > 0;
                setHasAccess(isFriend || isParticipant);
            } else if (tournament.visibility === 'private') {
                // Only participants can view
                const { data: participants } = await supabase
                    .from('tournament_participants')
                    .select('player_id')
                    .eq('tournament_id', tournament.id)
                    .eq('player_id', user.id);

                setHasAccess(participants && participants.length > 0);
            } else {
                setHasAccess(false);
            }
        };

        checkAccess();
    }, [tournament.id, tournament.visibility, tournament.created_by]);

    // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
    const { data: participants = [] } = useQuery({
        queryKey: ['participants', tournament.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tournament_participants')
                .select('*')
                .eq('tournament_id', tournament.id)
                .order('score', { ascending: false }) // Highest score first
                .order('matches_played', { ascending: true }) // Fewer matches = better efficiency
                .order('display_name', { ascending: true }); // Alphabetical for consistency
            if (error) throw error;
            return data || [];
        },
        enabled: hasAccess === true
    });

    const { data: matches = [] } = useQuery({
        queryKey: ['matches', tournament.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tournament_matches')
                .select('*')
                .eq('tournament_id', tournament.id)
                .order('round_number', { ascending: true })
                .order('court_number', { ascending: true });
            if (error) throw error;
            return data || [];
        },
        enabled: hasAccess === true
    });

    // Fetch Creator Profile
    const { data: creatorProfile } = useQuery({
        queryKey: ['creator-profile', tournament.created_by],
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', tournament.created_by)
                .single();
            return data;
        },
        enabled: !!tournament.created_by
    });

    // Fetch an Admin to chat with
    const { data: adminUser } = useQuery({
        queryKey: ['adminUser'],
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('is_admin', true)
                .limit(1)
                .single();
            return data;
        }
    });

    // NOW WE CAN DO CONDITIONAL RENDERING AFTER ALL HOOKS
    const isParticipant = currentUserId ? participants.some((p: any) => p.player_id === currentUserId) : false;

    // Access control check
    if (hasAccess === null) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-slate-400">{t('loading', { defaultValue: 'Loading...' })}</div>
            </div>
        );
    }

    if (hasAccess === false) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <Lock className="text-slate-600" size={64} />
                <div className="text-center">
                    <h2 className="text-xl font-bold text-white mb-2">
                        {t('tournaments.results.access_denied_title', { defaultValue: 'Access Denied' })}
                    </h2>
                    <p className="text-slate-400 text-sm">
                        {t('tournaments.results.access_denied_message', { defaultValue: 'You do not have permission to view this tournament.' })}
                    </p>
                </div>
            </div>
        );
    }

    // Group by Round
    const rounds = matches.reduce((acc: any, match: any) => {
        if (!acc[match.round_number]) acc[match.round_number] = [];
        acc[match.round_number].push(match);
        return acc;
    }, {});

    // Calculate Stats
    // Fix: Use display_name (text) as key because Guest players (for private tournaments only) have null player_id
    const playerStats = matches.reduce((acc: any, m: any) => {
        if (!m.completed) return acc;

        const processPlayer = (playerName: string, result: 'w' | 'l' | 'd') => {
            if (!playerName) return;
            if (!acc[playerName]) acc[playerName] = { mp: 0, w: 0, d: 0, l: 0 };
            acc[playerName].mp++;
            acc[playerName][result]++;
        };

        const s1 = Number(m.score_team1);
        const s2 = Number(m.score_team2);

        const result1 = s1 > s2 ? 'w' : s1 < s2 ? 'l' : 'd';
        const result2 = result1 === 'w' ? 'l' : result1 === 'l' ? 'w' : 'd';

        // Use _text fields (Names) instead of IDs
        processPlayer(m.team1_p1_text, result1);
        processPlayer(m.team1_p2_text, result1);
        processPlayer(m.team2_p1_text, result2);
        processPlayer(m.team2_p2_text, result2);

        return acc;
    }, {});

    const winner = participants[0];

    // Use the creator profile data fetched at the top
    const creatorName = creatorProfile?.username || 'Unknown';
    const createdDate = new Date(tournament.created_at).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
    });

    const handleReportIssue = async () => {
        if (!adminUser) {
            alert({ title: t('error', { defaultValue: 'Error' }), message: t('tournaments.results.no_admin', { defaultValue: 'No administrator available to contact.' }), type: 'danger' });
            return;
        }

        const message = `${t('tournaments.results.dispute_prefix', { defaultValue: 'Dispute for Tournament' })}: ${tournament.name}\n${t('tournaments.results.reason', { defaultValue: 'Reason' })}: `;

        const event = new CustomEvent('openChat', {
            detail: {
                userId: adminUser.id,
                initialMessage: message
            }
        });
        window.dispatchEvent(event);
    };

    return (
        <div className="space-y-6 pb-20 animate-fade-in">
            {/* Status tournament Banner */}
            {tournament.status === 'pending_verification' && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="text-yellow-500 shrink-0 mt-0.5" size={20} />
                    <div>
                        <h3 className="font-bold text-yellow-400 text-sm">{t('tournaments.verification_pending_title') || 'Verification Pending'}</h3>
                        <p className="text-xs text-yellow-500/80 mt-1">
                            {t('tournaments.verification_pending_desc') || 'This tournament is currently under review by administrators. Points will be awarded once verified.'}
                        </p>
                    </div>
                </div>
            )}

            {tournament.status === 'rejected' && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={20} />
                    <div>
                        <h3 className="font-bold text-red-400 text-sm">{t('tournaments.verification_rejected_title') || 'Tournament Rejected'}</h3>
                        <p className="text-xs text-red-500/80 mt-1">
                            {t('tournaments.verification_rejected_desc') || 'This tournament was rejected by administrators. No points will be awarded.'}
                        </p>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700/50 backdrop-blur-sm">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-1">{tournament.name}</h2>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${tournament.status === 'completed' ? 'bg-blue-500/20 text-blue-400' :
                                tournament.status === 'pending_verification' ? 'bg-yellow-500/20 text-yellow-400' :
                                    tournament.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                                        'bg-green-500/20 text-green-400'
                                }`}>
                                {t(`tournaments.status.${tournament.status}`, { defaultValue: tournament.status })}
                            </span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">{tournament.mode}</span>
                            <span className="text-xs text-slate-500">•</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${tournament.visibility === 'public' ? 'bg-indigo-500/20 text-indigo-400' :
                                tournament.visibility === 'friends' ? 'bg-purple-500/20 text-purple-400' :
                                    'bg-slate-500/20 text-slate-400'
                                }`}>
                                {t(`tournaments.visibility.${tournament.visibility}`, { defaultValue: tournament.visibility })}
                            </span>
                        </div>
                    </div>

                    {/* Report Issue Button (only for participants) */}
                    <div className="flex flex-col items-end justify-end gap-2">
                        {isParticipant && (tournament.status === 'completed' && tournament.visibility === 'public') && (
                            <button
                                onClick={handleReportIssue}
                                className="flex items-center gap-1 px-3 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-lg transition-colors border border-yellow-500/30 ml-2"
                            >
                                <AlertTriangle size={16} />
                                <span className="text-sm font-medium">{t('tournaments.results.report_issue', { defaultValue: 'Report Issue' })}</span>
                            </button>
                        )}

                        {/* Share Results Button */}
                        <button
                            onClick={() => {
                                const element = document.getElementById('results-snapshot');
                                if (!element) return;

                                html2canvas(element, {
                                    backgroundColor: null,
                                    scale: 2,
                                    useCORS: true,
                                    // Make sure we capture the FULL content height
                                    height: element.scrollHeight,
                                    windowHeight: element.scrollHeight,
                                    scrollY: 0, // Reset scroll so we start from top

                                    onclone: (clonedDoc) => {
                                        const el = clonedDoc.getElementById('results-snapshot');
                                        if (el) {
                                            el.style.opacity = '1';
                                            el.style.zIndex = '99999';
                                            el.style.position = 'absolute';
                                            el.style.top = '0';
                                            el.style.left = '0';
                                            el.style.height = 'auto'; // Force auto height to fit content
                                        }
                                    }
                                }).then(canvas => {
                                    canvas.toBlob(async (blob) => {
                                        if (!blob) return;

                                        const file = new File([blob], 'tournament-results-PadelUp.png', { type: 'image/png' });

                                        if (navigator.share) {
                                            try {
                                                await navigator.share({
                                                    files: [file],
                                                    title: 'PadelUp Results',
                                                });
                                            } catch (err) {
                                                console.error('Share failed', err);
                                            }
                                        } else {
                                            const link = document.createElement('a');
                                            link.download = `results-${tournament.name}-PadelUp.png`;
                                            link.href = canvas.toDataURL();
                                            link.click();
                                        }
                                    });
                                });
                            }}
                            className="p-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg transition-colors border border-green-500/30"
                            title={t('tournaments.results.share_results', { defaultValue: 'Share Results' })}
                        >
                            <Share2 size={20} />
                        </button>


                    </div>
                </div>
                <div className="flex justify-start gap-3 items-center mb-2">
                    <div className="text-xs text-slate-500 font-medium">{t('tournaments.created_by', { defaultValue: 'Created by:' })}</div>
                    <div className="text-sm text-slate-300 font-bold">{creatorName}</div>
                    <div className="text-xs text-slate-500 font-medium">{createdDate}</div>
                </div>
                {/* Hidden Snapshot Component */}
                <ResultsSnapshot
                    tournament={tournament}
                    winner={winner}
                    participants={participants}
                    rounds={rounds}
                />

                {/* Winner Card */}
                <div className="relative flex flex-col items-center justify-center p-8 text-center rounded-2xl overflow-hidden">
                    {/* Animated gradient background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/30 via-amber-600/20 to-orange-500/30 animate-gradient-xy"></div>
                    <div className="absolute inset-0 bg-gradient-to-tr from-yellow-400/10 via-transparent to-amber-500/10"></div>

                    {/* Glow effects */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-yellow-400/20 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-0 right-0 w-48 h-48 bg-amber-500/20 rounded-full blur-2xl"></div>

                    {/* Border glow */}
                    <div className="absolute inset-0 rounded-2xl ring-2 ring-yellow-500/50 shadow-[0_0_30px_rgba(234,179,8,0.3)]"></div>

                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="bg-gradient-to-br from-yellow-500/30 to-amber-600/30 p-5 rounded-full ring-4 ring-yellow-400/50 mb-5 shadow-[0_0_40px_rgba(234,179,8,0.4)] flex items-center justify-center">
                            <div className="animate-trophy-rotate">
                                <Trophy size={56} className="text-yellow-300 drop-shadow-[0_0_15px_rgba(253,224,71,0.8)]" />
                            </div>
                        </div>
                        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-yellow-300 to-amber-300 uppercase tracking-tight mb-2 drop-shadow-[0_2px_10px_rgba(234,179,8,0.5)]">
                            {winner?.display_name || 'No Winner Yet'}
                        </h2>
                        <p className="text-yellow-400 font-bold text-sm uppercase tracking-widest drop-shadow-[0_2px_8px_rgba(234,179,8,0.4)]">
                            {t('tournaments.results.winner', { defaultValue: 'Tournament Winner' })}
                        </p>
                    </div>
                </div>

                <div className="w-full max-w-md space-y-3 mt-8">
                    {participants.map((p: any, i: number) => {
                        const stats = playerStats[p.display_name] || { mp: 0, w: 0, d: 0, l: 0 };

                        // Medal colors for top 3
                        const getMedalColor = (position: number) => {
                            if (position === 0) return 'text-yellow-400'; // Gold
                            if (position === 1) return 'text-slate-300'; // Silver
                            if (position === 2) return 'text-amber-600'; // Bronze
                            return '';
                        };

                        return (
                            <div key={p.id} className={`flex flex-col p-4 rounded-xl border ${i === 0 ? 'bg-yellow-500/10 border-yellow-500/50' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 flex justify-center">
                                            {i < 3 ? (
                                                <Medal size={24} className={`${getMedalColor(i)} drop-shadow-lg`} />
                                            ) : (
                                                <span className="font-mono font-bold text-lg text-slate-500">#{i + 1}</span>
                                            )}
                                        </div>
                                        <span className="font-bold text-slate-200">{p.display_name}</span>
                                    </div>
                                    <div className="text-xl font-black text-white">{p.score} <span className="text-xs font-normal text-slate-500">pts</span></div>
                                </div>

                                {/* Stats Grid */}
                                <div className="grid grid-cols-4 gap-2 text-center text-xs bg-slate-900/30 p-2 rounded-lg">
                                    <div>
                                        <div className="text-slate-500 font-bold">MP</div>
                                        <div className="text-slate-300">{stats.mp}</div>
                                    </div>
                                    <div>
                                        <div className="text-green-500/70 font-bold">W</div>
                                        <div className="text-slate-300">{stats.w}</div>
                                    </div>
                                    <div>
                                        <div className="text-slate-500 font-bold">D</div>
                                        <div className="text-slate-300">{stats.d}</div>
                                    </div>
                                    <div>
                                        <div className="text-red-500/70 font-bold">L</div>
                                        <div className="text-slate-300">{stats.l}</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Rounds History */}
                {Object.keys(rounds).length > 0 && (
                    <div className="w-full max-w-md space-y-6 mt-8 pt-8 border-t border-slate-800">
                        <h3 className="text-xl font-bold text-slate-400 uppercase tracking-widest mb-4">{t('tournaments.results.round_history', { defaultValue: 'Round History' })}</h3>
                        {Object.entries(rounds).map(([roundNum, roundMatches]: [string, any]) => (
                            <div key={roundNum} className="space-y-2">
                                <div className="flex justify-center text-xs font-bold text-orange-500 uppercase tracking-wider text-left pl-2 bg-slate-800/50 py-1 rounded inline-block px-3">
                                    {t('tournaments.results.round', { number: roundNum, defaultValue: 'Round {{number}}' })}
                                </div>
                                {roundMatches.map((m: any) => (
                                    <div key={m.id} className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 relative overflow-hidden">
                                        {/* Court Name Badge */}
                                        <div className="absolute top-0 left-0 bg-slate-800 text-[10px] uppercase font-bold text-blue-500 px-2 py-0.5 rounded-br-lg">
                                            {tournament.settings?.courtNames?.[m.court_number - 1] || t('tournaments.play.court', { number: m.court_number, defaultValue: 'Court {{number}}' })}
                                        </div>

                                        <div className="flex items-center justify-between mt-3">
                                            {/* Team 1 */}
                                            <div className={`flex flex-col w-[40%] text-center ${Number(m.score_team1) > Number(m.score_team2) ? 'opacity-100' : 'opacity-60'}`}>
                                                <span className="text-sm font-bold text-slate-200 truncate">{m.team1_p1_text}</span>
                                                <span>&</span>
                                                <span className="text-sm font-bold text-slate-200 truncate">{m.team1_p2_text}</span>
                                                <span className={`text-2xl font-black mt-1 ${Number(m.score_team1) > Number(m.score_team2) ? 'text-green-500' : 'text-slate-600'}`}>
                                                    {m.score_team1}
                                                </span>
                                            </div>

                                            {/* VS */}
                                            <div className="w-[20%] flex flex-col items-center justify-center">
                                                <span className="text-xs font-black text-slate-600 italic">{t('tournaments.results.vs', { defaultValue: 'VS' })}</span>
                                            </div>

                                            {/* Team 2 */}
                                            <div className={`flex flex-col w-[40%] text-center ${Number(m.score_team2) > Number(m.score_team1) ? 'opacity-100' : 'opacity-60'}`}>
                                                <span className="text-sm font-bold text-slate-200 truncate">{m.team2_p1_text}</span>
                                                <span>&</span>
                                                <span className="text-sm font-bold text-slate-200 truncate">{m.team2_p2_text}</span>
                                                <span className={`text-2xl font-black mt-1 ${Number(m.score_team2) > Number(m.score_team1) ? 'text-green-500' : 'text-slate-600'}`}>
                                                    {m.score_team2}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}



            </div>
        </div>
    );
}
