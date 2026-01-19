import { useEffect, useState } from 'react';
import { X, Trophy, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';
import { cn } from '../../components/ui/Button';

interface MatchHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string | undefined;
}

interface MatchHistoryItem {
    id: number;
    created_at: string;
    status: 'confirmed' | 'rejected';
    winner_team: number;
    score: { t1: number; t2: number }[];
    reason?: string;
    team1_p1: string;
    team1_p2: string;
    team2_p1: string;
    team2_p2: string;
    actor_id?: string;
}

export const MatchHistoryModal = ({ isOpen, onClose, userId }: MatchHistoryModalProps) => {
    const { t } = useTranslation();
    const [matches, setMatches] = useState<MatchHistoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [playerNames, setPlayerNames] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isOpen && userId) {
            fetchHistory();
        }
    }, [isOpen, userId]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            // 1. Fetch matches via RPC
            const { data, error } = await supabase.rpc('get_player_match_history', {
                id_input: userId,
                limit_count: 10
            });

            if (error) {
                console.error('Error fetching history:', error);
                // Fallback or empty
                setMatches([]);
                return;
            }

            if (data) {
                const matchesData = data as MatchHistoryItem[];
                setMatches(matchesData);

                // 2. Collect all unique player IDs
                const allPlayerIds = new Set<string>();
                matchesData.forEach(m => {
                    if (m.team1_p1) allPlayerIds.add(m.team1_p1);
                    if (m.team1_p2) allPlayerIds.add(m.team1_p2);
                    if (m.team2_p1) allPlayerIds.add(m.team2_p1);
                    if (m.team2_p2) allPlayerIds.add(m.team2_p2);
                    if (m.actor_id) allPlayerIds.add(m.actor_id);
                });

                // 3. Fetch Usernames
                if (allPlayerIds.size > 0) {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, username')
                        .in('id', Array.from(allPlayerIds));

                    if (profiles) {
                        const nameMap: Record<string, string> = {};
                        profiles.forEach(p => {
                            nameMap[p.id] = p.username;
                        });
                        setPlayerNames(nameMap);
                    }
                }
            }
        } catch (error) {
            console.error('Error in fetchHistory:', error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 animate-fade-in overflow-y-auto">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl transition-all animate-scale-in flex flex-col max-h-[85vh]">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Trophy size={18} className="text-yellow-500" />
                        {t('history.recent_activity', { defaultValue: 'Recent Activity' })}
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <style>{`
                    .no-scrollbar::-webkit-scrollbar {
                        display: none;
                    }
                    .no-scrollbar {
                        -ms-overflow-style: none;
                        scrollbar-width: none;
                    }
                `}</style>
                <div className="p-4 overflow-y-auto space-y-3 flex-1 no-scrollbar">
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">{t('common.loading', { defaultValue: 'Loading...' })}</div>
                    ) : matches.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 italic">
                            {t('history.no_recent_matches', { defaultValue: 'No recent matches found.' })}
                        </div>
                    ) : (
                        matches.map((match) => {
                            const isRejected = match.status === 'rejected';
                            const isWin = match.status === 'confirmed' && (
                                (match.winner_team === 1 && (match.team1_p1 === userId || match.team1_p2 === userId)) ||
                                (match.winner_team === 2 && (match.team2_p1 === userId || match.team2_p2 === userId))
                            );

                            return (
                                <div key={`${match.status}-${match.id}`} className={cn(
                                    "relative rounded-xl border p-3 transition-colors",
                                    isRejected
                                        ? "bg-red-500/10 border-red-500/30"
                                        : "bg-slate-800/60 border-slate-700 hover:border-slate-500"
                                )}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <span className={cn(
                                                "text-[10px] font-bold uppercase tracking-wider mb-0.5",
                                                isRejected ? "text-red-400" : (isWin ? "text-green-400" : "text-slate-400")
                                            )}>
                                                {isRejected ? t('history.rejected', { defaultValue: 'Rejected' }) : (isWin ? t('history.victory', { defaultValue: 'Victory' }) : t('history.defeat', { defaultValue: 'Defeat' }))}
                                            </span>
                                            <span className="text-[10px] text-slate-500">
                                                {new Date(match.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-slate-600 font-mono">Id: {match.id}</span>
                                    </div>

                                    {/* Teams */}
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="flex flex-col gap-1 w-full">
                                            {/* Team 1 */}
                                            <div className={cn("px-2 py-1 rounded bg-slate-900/50 flex justify-between items-center", match.winner_team === 1 && !isRejected && "ring-1 ring-green-500/30")}>
                                                <span className={cn("text-xs font-medium", match.winner_team === 1 && !isRejected ? "text-green-400" : "text-slate-300")}>
                                                    {playerNames[match.team1_p1] || 'Unknown'} & {playerNames[match.team1_p2] || 'Unknown'}
                                                </span>
                                            </div>
                                            {/* Team 2 */}
                                            <div className={cn("px-2 py-1 rounded bg-slate-900/50 flex justify-between items-center", match.winner_team === 2 && !isRejected && "ring-1 ring-green-500/30")}>
                                                <span className={cn("text-xs font-medium", match.winner_team === 2 && !isRejected ? "text-green-400" : "text-slate-300")}>
                                                    {playerNames[match.team2_p1] || 'Unknown'} & {playerNames[match.team2_p2] || 'Unknown'}
                                                </span>
                                            </div>
                                        </div>
                                        {/* Score */}
                                        <div className="flex flex-col gap-0.5 min-w-[50px] items-center justify-center">
                                            {Array.isArray(match.score) && match.score.map((s, i) => (
                                                <span key={i} className="text-xs font-mono font-bold text-slate-400">
                                                    {s.t1}-{s.t2}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Actor Info */}
                                    {match.actor_id && playerNames[match.actor_id] && (
                                        <div className="mt-2 pt-2 border-t border-slate-700/50 flex justify-end">
                                            <span className="text-[10px] text-slate-500 italic">
                                                {isRejected ? t('history.rejected_by') : t('history.confirmed_by')} {playerNames[match.actor_id]}
                                            </span>
                                        </div>
                                    )}

                                    {/* Rejection Reason */}
                                    {isRejected && match.reason && (
                                        <div className="mt-2 text-xs text-red-300 bg-red-500/10 p-2 rounded-lg border border-red-500/20 flex gap-2">
                                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                            <div>
                                                <span className="font-bold block text-[10px] uppercase opacity-70 mb-0.5">{t('history.rejection_reason', { defaultValue: 'Reason' })}:</span>
                                                {match.reason}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
                <div className="p-4 border-t border-slate-700 bg-slate-800/50">
                    <button
                        onClick={onClose}
                        className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors text-sm"
                    >
                        {t('history.close', { defaultValue: 'Close' })}
                    </button>
                </div>
            </div>
        </div>
    );
};
