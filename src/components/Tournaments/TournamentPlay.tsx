import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Check, RefreshCw, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useModal } from '../../context/ModalContext';
import { generateAmericanoRound, generateMexicanoRound, type TournamentParticipant } from '../../lib/tournament-logic';
import { PiTennisBallFill } from "react-icons/pi";
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

type TournamentPlayProps = {
    tournament: any;
};

export default function TournamentPlay({ tournament }: TournamentPlayProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { alert, confirm } = useModal();
    const [viewRound, setViewRound] = useState(tournament.current_round_number);
    const [scores, setScores] = useState<Record<number, { s1: number, s2: number }>>({});
    const [isCreator, setIsCreator] = useState(false);

    // Check if current user is the creator
    useEffect(() => {
        const checkCreator = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user && tournament.created_by === user.id) {
                setIsCreator(true);
            }
        };
        checkCreator();
    }, [tournament.created_by]);

    // Update viewRound if tournament updates (e.g. next round generated)
    useEffect(() => {
        setViewRound(tournament.current_round_number);
    }, [tournament.current_round_number]);

    // 1. Fetch Matches for VIEW Round
    const { data: matches = [], isLoading: matchesLoading } = useQuery({
        queryKey: ['matches', tournament.id, viewRound],
        queryFn: async () => {
            const { data } = await supabase
                .from('tournament_matches')
                .select('*')
                .eq('tournament_id', tournament.id)
                .eq('round_number', viewRound)
                .order('court_number', { ascending: true });
            return data || [];
        }
    });

    // 2. Fetch Participants
    const { data: participants = [] } = useQuery({
        queryKey: ['participants', tournament.id],
        queryFn: async () => {
            // 1. Fetch participants
            const { data: participantsData, error: partError } = await supabase
                .from('tournament_participants')
                .select('*')
                .eq('tournament_id', tournament.id)
                .order('score', { ascending: false }) // Highest score first
                .order('matches_played', { ascending: true }) // Fewer matches = better efficiency
                .order('display_name', { ascending: true }); // Alphabetical for consistency

            if (partError) throw partError;
            if (!participantsData) return [];

            // 2. Fetch profiles for these participants
            const playerIds = participantsData
                .map((p: any) => p.player_id)
                .filter((id: any) => id); // Filter nulls

            if (playerIds.length === 0) return participantsData;

            const { data: profilesData } = await supabase
                .from('profiles')
                .select('id, username')
                .in('id', playerIds);

            // 3. Merge profiles
            const participantsWithProfiles = participantsData.map((p: any) => {
                const profile = profilesData?.find((prof: any) => prof.id === p.player_id);
                return {
                    ...p,
                    profiles: profile || null
                };
            });

            return participantsWithProfiles;
        }
    });

    // Helper to get display name (username if available, else display_name)
    const getPlayerName = (playerId: string | null, fallbackText: string) => {
        if (!playerId) return fallbackText;
        const p = participants.find((p: any) => p.player_id === playerId);
        return p?.profiles?.username || p?.display_name || fallbackText;
    };

    // Helper: Recalculate ALL scores from match history
    const recalculateAllScores = async () => {
        const { error } = await supabase.rpc('recalculate_tournament_scores', {
            t_id: tournament.id
        });

        if (error) {
            console.error('Error recalculating scores:', error);
            // Fallback (optional) or throw
            throw error;
        }
    };

    // Mutations
    const saveRoundMutation = useMutation({
        mutationFn: async () => {
            const total = tournament.settings?.pointsPerMatch || 24;
            const defaultScore = total / 2;

            const updatePromises = matches.map((m: any) => {
                let s;

                if (scores[m.id]) {
                    // Score exists in state, use it (includes 0-0 if set)
                    s = scores[m.id];
                } else if (m.completed) {
                    // Match already completed, use stored scores
                    s = { s1: m.score_team1, s2: m.score_team2 };
                } else {
                    // New match, use default 50/50 split
                    s = { s1: defaultScore, s2: defaultScore };
                }

                return supabase
                    .from('tournament_matches')
                    .update({
                        score_team1: s.s1,
                        score_team2: s.s2,
                        completed: true
                    })
                    .eq('id', m.id);
            });

            const results = await Promise.all(updatePromises);

            // Check for any errors in the batch
            const firstError = results.find(r => r.error)?.error;
            if (firstError) throw firstError;

            await recalculateAllScores();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['matches', tournament.id] });
            queryClient.invalidateQueries({ queryKey: ['participants'] });
            alert({
                title: t('tournaments.play.success', { defaultValue: 'Success' }),
                message: t('tournaments.play.round_saved', { defaultValue: 'Round results saved!' }),
                type: 'success',
                autoCloseDuration: 1000,
                hideButtons: true
            });
        },
        onError: (err) => {
            alert({ title: t('error', { defaultValue: 'Error' }), message: err.message, type: 'danger' });
        }
    });

    const handleSaveRound = () => {
        saveRoundMutation.mutate();
    };

    const handleFinish = async () => {
        const confirmed = await confirm({
            title: t('tournaments.play.finish_confirm_title', { defaultValue: 'Finish Tournament?' }),
            message: t('tournaments.play.finish_confirm_message', { defaultValue: 'Are you sure you want to finish this tournament? Once finished, you cannot edit matches or add new rounds.' }),
            confirmText: t('tournaments.play.finish_yes', { defaultValue: 'Yes, Finish' }),
            cancelText: t('tournaments.play.finish_no', { defaultValue: 'Cancel' })
        });

        if (confirmed) {
            finishTournamentMutation.mutate();
        }
    };


    const nextRoundMutation = useMutation({
        mutationFn: async () => {
            // Check for Cycle Completion (Americano)
            const maxRounds = participants.length % 2 === 0 ? participants.length - 1 : participants.length;

            if (tournament.current_round_number >= maxRounds && tournament.mode === 'americano') {
                const finish = await confirm({
                    title: t('tournaments.play.cycle_complete_title', { defaultValue: 'Cycle Complete!' }),
                    message: t('tournaments.play.cycle_complete_message', { current: tournament.current_round_number, max: maxRounds, defaultValue: 'Everyone has played everyone! (Round {{current}} / {{max}}).\n\nDo you want to finish the tournament now?' }),
                    confirmText: t('tournaments.play.finish_tournament_btn', { defaultValue: 'Finish Tournament' }),
                    cancelText: t('tournaments.play.continue_playing', { defaultValue: 'Continue Playing' })
                });

                if (finish) {
                    await supabase.rpc('finish_tournament_with_verification', {
                        tournament_id_param: tournament.id
                    });
                    return; // Stop generation
                }
            }

            // Proceed to generate next round
            const { data: updatedParticipants } = await supabase
                .from('tournament_participants')
                .select('*')
                .eq('tournament_id', tournament.id);

            // Fetch match history for Mexicano partner tracking
            const { data: allMatches } = await supabase
                .from('tournament_matches')
                .select('*')
                .eq('tournament_id', tournament.id);

            // Check for Cycle Completion (Mexicano)
            if (tournament.mode === 'mexicano' && allMatches && allMatches.length > 0) {
                // Build partnership matrix
                const partnershipMatrix: Record<string, Set<string>> = {};

                updatedParticipants?.forEach((p: any) => {
                    partnershipMatrix[p.display_name] = new Set();
                });

                // Track all partnerships
                allMatches.forEach(match => {
                    const t1p1 = match.team1_p1_text;
                    const t1p2 = match.team1_p2_text;
                    const t2p1 = match.team2_p1_text;
                    const t2p2 = match.team2_p2_text;

                    if (t1p1 && t1p2) {
                        partnershipMatrix[t1p1]?.add(t1p2);
                        partnershipMatrix[t1p2]?.add(t1p1);
                    }
                    if (t2p1 && t2p2) {
                        partnershipMatrix[t2p1]?.add(t2p2);
                        partnershipMatrix[t2p2]?.add(t2p1);
                    }
                });

                // Check if everyone has partnered with everyone at least once
                const totalPlayers = updatedParticipants?.length || 0;
                const allPartneredWithEveryone = Object.values(partnershipMatrix).every(
                    partners => partners.size >= totalPlayers - 1
                );

                if (allPartneredWithEveryone) {
                    const finish = await confirm({
                        title: t('tournaments.play.mexicano_cycle_title', { defaultValue: 'Mexicano Cycle Complete!' }),
                        message: t('tournaments.play.mexicano_cycle_message', { current: tournament.current_round_number, defaultValue: 'Difficult, but it happened. Everyone has partnered with everyone at least once! (Round {{current}}).\n\nDo you want to finish the tournament now?' }),
                        confirmText: t('tournaments.play.finish_tournament_btn', { defaultValue: 'Finish Tournament' }),
                        cancelText: t('tournaments.play.continue_playing', { defaultValue: 'Continue Playing' })
                    });

                    if (finish) {
                        await supabase.rpc('finish_tournament_with_verification', {
                            tournament_id_param: tournament.id
                        });
                        return; // Stop generation
                    }
                }
            }

            // 2. Generate Next Round
            const nextRoundNum = tournament.current_round_number + 1;
            let newMatches = [];

            if (tournament.mode === 'americano') {
                newMatches = generateAmericanoRound(nextRoundNum, updatedParticipants as TournamentParticipant[], tournament.id);
            } else {
                // Pass match history to Mexicano for smart partner rotation
                newMatches = generateMexicanoRound(nextRoundNum, updatedParticipants as TournamentParticipant[], tournament.id, allMatches || []);
            }

            if (newMatches.length > 0) {
                const { error } = await supabase.from('tournament_matches').insert(newMatches);
                if (error) throw error;

                await supabase.from('tournaments')
                    .update({ current_round_number: nextRoundNum })
                    .eq('id', tournament.id);
            } else {
                throw new Error('Could not generate more matches.');
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['matches'] });
            queryClient.invalidateQueries({ queryKey: ['participants'] });
            queryClient.invalidateQueries({ queryKey: ['tournament'] });
            queryClient.invalidateQueries({ queryKey: ['tournament-rankings'] });
        },
        onError: (err) => {
            alert({ title: t('error', { defaultValue: 'Error' }), message: err.message, type: 'danger' });
        }
    });

    const finishTournamentMutation = useMutation({
        mutationFn: async () => {
            // Call the new RPC function that handles verification workflow
            const { data, error } = await supabase
                .rpc('finish_tournament_with_verification', {
                    tournament_id_param: tournament.id
                });

            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['tournament'] });
            queryClient.invalidateQueries({ queryKey: ['participants'] });
            queryClient.invalidateQueries({ queryKey: ['matches'] });
            queryClient.invalidateQueries({ queryKey: ['tournament-rankings'] });

            // Show appropriate message based on tournament visibility
            if (data?.status === 'pending_verification') {
                alert({
                    title: t('tournaments.play.verification_pending_title', { defaultValue: 'Submitted for Verification' }),
                    message: t('tournaments.play.verification_pending_message', { defaultValue: 'Your tournament has been submitted for admin verification. You will be notified once it is approved.' }),
                    type: 'success'
                });
            } else {
                alert({
                    title: t('tournaments.play.tournament_completed_title', { defaultValue: 'Tournament Completed!' }),
                    message: t('tournaments.play.tournament_completed_message', { defaultValue: 'Your tournament has been completed successfully.' }),
                    type: 'success'
                });
            }
        },
    });

    // Delete tournament mutation (for creator to cancel friends tournaments)
    const deleteTournamentMutation = useMutation({
        mutationFn: async () => {
            const { error } = await supabase
                .from('tournaments')
                .delete()
                .eq('id', tournament.id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tournaments'] });
            alert({
                title: t('tournaments.play.tournament_deleted_title', { defaultValue: 'Tournament Deleted' }),
                message: t('tournaments.play.tournament_deleted_message', { defaultValue: 'The tournament has been cancelled and deleted.' }),
                type: 'success'
            });
            navigate('/tournaments');
        },
        onError: (err: any) => {
            alert({
                title: t('error', { defaultValue: 'Error' }),
                message: err.message,
                type: 'danger'
            });
        }
    });

    const handleDeleteTournament = async () => {
        const confirmed = await confirm({
            title: t('tournaments.play.delete_confirm_title', { defaultValue: 'Cancel Tournament?' }),
            message: t('tournaments.play.delete_confirm_message', { defaultValue: 'Are you sure you want to cancel and delete this tournament? This action cannot be undone.' }),
            confirmText: t('tournaments.play.delete_yes', { defaultValue: 'Yes, Delete' }),
            cancelText: t('cancel', { defaultValue: 'Cancel' })
        });

        if (confirmed) {
            deleteTournamentMutation.mutate();
        }
    };

    if (matchesLoading) return <div>{t('tournaments.play.loading_matches', { defaultValue: 'Loading matches...' })}</div>;

    // Determine if we can proceed
    const isCurrentRound = viewRound === tournament.current_round_number;
    const allCompleted = matches.length > 0 && matches.every((m: any) => m.completed);

    return (
        <div className="space-y-6 pb-20">
            {/* Round Header & Navigation */}
            <div className="flex justify-between items-center px-2 bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
                <button
                    onClick={() => setViewRound((r: number) => Math.max(1, r - 1))}
                    disabled={viewRound === 1}
                    className="p-2 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                >
                    <ChevronLeft size={24} />
                </button>

                <div className="text-center">
                    <h2 className="text-xl font-bold text-white">{t('tournaments.play.round', { number: viewRound, defaultValue: 'Round {{number}}' })}</h2>
                    <div className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                        {isCurrentRound ? t('tournaments.play.current_round', { defaultValue: 'Current Round' }) : t('tournaments.play.past_round', { defaultValue: 'Past Round' })}
                    </div>
                </div>

                <button
                    onClick={() => setViewRound((r: number) => Math.min(tournament.current_round_number, r + 1))}
                    disabled={viewRound === tournament.current_round_number}
                    className="p-2 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 transition-colors"
                >
                    <ChevronRight size={24} />
                </button>
            </div>

            {/* Matches Grid */}
            <div className="space-y-4">
                {matches.map((match: any) => (
                    <div key={match.id} className={`relative bg-slate-800/60 rounded-xl border ${match.completed ? 'border-green-500/30' : 'border-slate-700'} p-4 transition-all`}>
                        <div className="absolute top-2  right-2 text-xs font-bold text-slate-500 bg-slate-900/50 px-2 py-0.5 rounded">
                            {tournament.settings?.courtNames?.[match.court_number - 1] || t('tournaments.play.court', { number: match.court_number, defaultValue: 'Court {{number}}' })}
                        </div>

                        {/* Slider UI */}
                        {/* Slider UI */}
                        {(() => {
                            const total = tournament.settings?.pointsPerMatch || 24;
                            const defaultScore = total / 2;

                            // Get current scores
                            const s1Raw = scores[match.id]?.s1;
                            const s2Raw = scores[match.id]?.s2;

                            let s1, s2, ballPosition;

                            // Check if this is a 0-0 "not played" match
                            if (s1Raw === 0 && s2Raw === 0) {
                                s1 = 0;
                                s2 = 0;
                                ballPosition = 50; // Center the ball
                            } else if (s1Raw !== undefined) {
                                // Score exists in state, use it
                                s1 = s1Raw;
                                s2 = total - s1; // Derived from slider
                                ballPosition = (s1 / total) * 100;
                            } else if (match.completed) {
                                // Match completed, use stored scores
                                s1 = match.score_team1;
                                s2 = match.score_team2;
                                ballPosition = s1 + s2 > 0 ? (s1 / (s1 + s2)) * 100 : 50;
                            } else {
                                // New match, default to center
                                s1 = defaultScore;
                                s2 = defaultScore;
                                ballPosition = 50;
                            }

                            // Determine Colors
                            let fillClass = 'bg-slate-500';
                            if (s1 > s2) fillClass = 'bg-green-500';
                            else if (s1 < s2) fillClass = 'bg-red-500';

                            let trackClass = 'bg-slate-700';
                            if (s2 > s1) trackClass = 'bg-green-500/30';
                            else if (s2 < s1) trackClass = 'bg-red-500/30';

                            if (s1 === s2) {
                                fillClass = 'bg-slate-700';
                                trackClass = 'bg-slate-700';
                            }

                            return (
                                <div className="w-full px-4 mb-2 mt-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className={`text-2xl font-bold w-12 text-center ${s1 > s2 ? 'text-green-400' : s1 < s2 ? 'text-red-400' : 'text-slate-200'}`}>
                                            {s1}
                                        </span>
                                        <div className="flex-1 mx-4 relative h-8 flex items-center">
                                            {/* Track (Background) */}
                                            <div className={`absolute left-0 right-0 h-3 rounded-full overflow-hidden transition-colors ${trackClass}`}>
                                                {/* Fill (Foreground) */}
                                                <div
                                                    className={`h-full transition-all duration-300 ${fillClass}`}
                                                    style={{ width: `${(s1 / total) * 100}%` }}
                                                />
                                                {/* Center Marker */}
                                                <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/20 -translate-x-1/2 z-10" />
                                            </div>

                                            {/* Padel Ball Indicator */}
                                            <div
                                                className="absolute top-1/2 -translate-y-1/2 transition-all duration-100 pointer-events-none z-10 text-2xl drop-shadow-lg"
                                                style={{ left: `calc(${ballPosition}% - 12px)` }}
                                            >
                                                <PiTennisBallFill className='text-yellow-500' size={28} />
                                            </div>

                                            <input
                                                type="range"
                                                min="0"
                                                max={total}
                                                step="1"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                value={s1}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    setScores(prev => ({
                                                        ...prev,
                                                        [match.id]: { s1: val, s2: total - val }
                                                    }));
                                                }}
                                                disabled={tournament.status === 'completed'}
                                            />
                                        </div>
                                        <span className={`text-2xl font-bold w-12 text-center ${s2 > s1 ? 'text-green-400' : s2 < s1 ? 'text-red-400' : 'text-slate-200'}`}>
                                            {s2}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs text-slate-500 font-medium px-1">
                                        <span className={s1 > s2 ? 'text-green-500' : ''}>{t('tournaments.play.team_1', { defaultValue: 'Team 1' })}</span>
                                        <button
                                            onClick={() => {
                                                setScores(prev => ({
                                                    ...prev,
                                                    [match.id]: { s1: 0, s2: 0 }
                                                }));
                                            }}
                                            className="text-[10px] text-slate-400 hover:text-orange-400 transition-colors px-2 py-0.5 rounded hover:bg-slate-700/50"
                                            disabled={tournament.status === 'completed'}
                                        >
                                            {t('tournaments.play.not_played', { defaultValue: 'Not Played (0-0)' })}
                                        </button>
                                        <span className={s2 > s1 ? 'text-green-500' : ''}>{t('tournaments.play.team_2', { defaultValue: 'Team 2' })}</span>
                                    </div>
                                </div>
                            );
                        })()}


                        {/* Participants Names */}
                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-700/50 text-xs text-slate-300">
                            <div className="flex gap-2">
                                <span className="bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">{getPlayerName(match.team1_p1_id, match.team1_p1_text)}</span>
                                <span className="bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">{getPlayerName(match.team1_p2_id, match.team1_p2_text)}</span>
                            </div>
                            <div className="flex gap-2 text-right">
                                <span className="bg-slate-700 px-2 py-0.5 rounded">{getPlayerName(match.team2_p1_id, match.team2_p1_text)}</span>
                                <span className="bg-slate-700 px-2 py-0.5 rounded">{getPlayerName(match.team2_p2_id, match.team2_p2_text)}</span>
                            </div>
                        </div>
                    </div >
                ))
                }
            </div >

            {/* Actions (Only show for current round) */}
            {/* Actions */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
                {/* Save - Always visible unless completed */}
                {tournament.status !== 'completed' && (
                    <button
                        onClick={handleSaveRound}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
                    >
                        <Check size={20} />
                        {t('tournaments.play.save_round', { defaultValue: 'Save Round Results' })}
                    </button>
                )}

                {/* Next/Finish - Only for current round */}
                {isCurrentRound && tournament.status !== 'completed' && (
                    <>
                        <button
                            onClick={() => nextRoundMutation.mutate()}
                            disabled={!allCompleted}
                            className="w-full py-4 bg-green-500 disabled:bg-slate-800 disabled:text-slate-600 text-slate-900 font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <RefreshCw size={20} className={nextRoundMutation.isPending ? "animate-spin" : ""} />
                            {nextRoundMutation.isPending ? t('tournaments.play.generating', { defaultValue: 'Generating...' }) : t('tournaments.play.next_round', { defaultValue: 'Next Round' })}
                        </button>

                        <button
                            onClick={handleFinish}
                            className="w-full py-3 bg-slate-800 text-slate-400 hover:text-white font-bold rounded-xl transition-colors border border-slate-700"
                        >
                            {t('tournaments.play.finish_tournament', { defaultValue: 'Finish Tournament' })}
                        </button>
                    </>
                )}

                {/* Delete Tournament - Only for creator in friends tournaments */}
                {isCreator && tournament.visibility === 'friends' && tournament.status === 'playing' && (
                    <button
                        onClick={handleDeleteTournament}
                        disabled={deleteTournamentMutation.isPending}
                        className="w-full py-3 bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 font-bold rounded-xl transition-colors border border-red-600/30 flex items-center justify-center gap-2"
                    >
                        <Trash2 size={18} />
                        {deleteTournamentMutation.isPending
                            ? t('tournaments.play.deleting', { defaultValue: 'Deleting...' })
                            : t('tournaments.play.cancel_tournament', { defaultValue: 'Cancel Tournament' })
                        }
                    </button>
                )}
            </div>
        </div >
    );
}
