import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Users, X, Trophy, Loader2, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateTeamAverage, calculateExpectedScore, calculateNewRating, getKFactor, getLevelFromElo } from '../lib/elo';
import { logActivity } from '../lib/logger';
import { useTranslation } from 'react-i18next';
import { useModal } from '../context/ModalContext';

interface Player {
    id: string;
    username: string;
    avatar_url: string | null;
    elo: number;
    subscription_end_date?: string | null;
}

const NewMatch = () => {
    const { alert } = useModal();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [step, setStep] = useState<1 | 2>(1); // 1: Players, 2: Score
    const [loading, setLoading] = useState(false);
    const [fetchingPlayers, setFetchingPlayers] = useState(true);
    const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);

    const [selectedPlayers, setSelectedPlayers] = useState<{ t1p1: Player | null, t1p2: Player | null, t2p1: Player | null, t2p2: Player | null }>({
        t1p1: null, t1p2: null,
        t2p1: null, t2p2: null
    });

    const [sets, setSets] = useState([{ t1: 0, t2: 0 }, { t1: 0, t2: 0 }, { t1: 0, t2: 0 }]);
    const [commentary, setCommentary] = useState('');

    // Selection Modal State
    const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
    const [activePosition, setActivePosition] = useState<keyof typeof selectedPlayers | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchPlayers();
    }, []);

    const fetchPlayers = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, username, avatar_url, elo, subscription_end_date')
                .eq('approved', true) // Only select approved players
                .eq('is_admin', false)
                .order('username');
            if (error) throw error;

            // Filter Expired Subscriptions
            const validPlayers = data?.filter(p => {
                if (!p.subscription_end_date) return false;
                return new Date(p.subscription_end_date) >= new Date();
            }) || [];

            setAvailablePlayers(validPlayers);
        } catch (error) {
            console.error('Error fetching players:', error);
        } finally {
            setFetchingPlayers(false);
        }
    };

    const openSelection = (position: keyof typeof selectedPlayers) => {
        setActivePosition(position);
        setSearchQuery('');
        setIsSelectionModalOpen(true);
    };

    const selectPlayer = async (player: Player) => {
        if (activePosition) {
            // Prevent selecting same player twice
            const isAlreadySelected = Object.values(selectedPlayers).some(p => p?.id === player.id);
            if (isAlreadySelected) {
                await alert({
                    title: 'Already Selected',
                    message: t('new_match.player_already_selected'),
                    type: 'warning'
                });
                return;
            }

            setSelectedPlayers(prev => ({ ...prev, [activePosition]: player }));
            setIsSelectionModalOpen(false);
            setActivePosition(null);
        }
    };

    const updateScore = (setIndex: number, team: 't1' | 't2', value: number) => {
        const newSets = [...sets];
        const val = Math.max(0, Math.min(7, value));

        // Prevent 7-7
        const otherTeam = team === 't1' ? 't2' : 't1';
        if (val === 7 && newSets[setIndex][otherTeam] === 7) {
            // If trying to set 7 and other is 7, don't allow it (or clamp other? No, just don't set this to 7? 
            // Better: Allow setting 7, but clamp other to 6 if it was 7?
            // User: "un set no puede introducirse 7-7 nunca". 
            // Let's strictly prevent the update if it results in 7-7? 
            // Actually, if I have 6-7 and I try to make it 7-7.
            // Let's just block the input if it creates 7-7.
            return;
        }

        newSets[setIndex][team] = val;
        setSets(newSets);
    };

    const validateScore = () => {
        // Validate each played set
        // Rules:
        // Valid: 6-0 to 6-4
        // Valid: 7-5, 7-6
        // Invalid: 7-0 to 7-4, 6-5, 6-6, 7-7, anything < 6 (unless incomplete? No, must finish set)

        for (let i = 0; i < sets.length; i++) {
            const { t1, t2 } = sets[i];
            const total = t1 + t2;
            if (total === 0) continue; // Empty set (assuming trailing sets can be 0-0)

            // One must be >= 6
            if (t1 < 6 && t2 < 6) {
                return t('new_match.invalid_set_score') || `Set ${i + 1}: Someone must reach 6 or 7 games.`;
            }

            // If 7, other must be 5 or 6
            if (t1 === 7 && t2 < 5) return t('new_match.invalid_7_score') || `Set ${i + 1}: 7-${t2} is not valid. Winner needs 5 or 6 games.`;
            if (t2 === 7 && t1 < 5) return t('new_match.invalid_7_score') || `Set ${i + 1}: ${t1}-7 is not valid. Winner needs 5 or 6 games.`;

            // If 6, other must be < 5 (because 6-5 -> 7-5, 6-6 -> mean not done)
            if (t1 === 6 && t2 >= 5) return t('new_match.invalid_6_score') || `Set ${i + 1}: 6-${t2} is not valid. Play to 7.`;
            if (t2 === 6 && t1 >= 5) return t('new_match.invalid_6_score') || `Set ${i + 1}: ${t1}-6 is not valid. Play to 7.`;

            // 7-7 handled by input but good to double check
            if (t1 === 7 && t2 === 7) return t('new_match.invalid_7_7') || `Set ${i + 1}: 7-7 is not valid.`;
        }
        return null;
    };

    const handleSave = async () => {
        if (!selectedPlayers.t1p1 || !selectedPlayers.t1p2 || !selectedPlayers.t2p1 || !selectedPlayers.t2p2) return;

        // Validation: Check if at least one game has been played
        const totalGames = sets.reduce((acc, s) => acc + s.t1 + s.t2, 0);
        if (totalGames === 0) {
            await alert({ title: 'Validation Error', message: t('new_match.enter_valid_result'), type: 'warning' });
            return;
        }

        // Deep Score Validation
        const scoreError = validateScore();
        if (scoreError) {
            await alert({ title: 'Invalid Score', message: scoreError, type: 'warning' });
            return;
        }

        setLoading(true);
        try {
            // 0. Check for duplicates (last 2 hours)
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            const { data: recentMatches } = await supabase
                .from('matches')
                .select('team1_p1, team1_p2, team2_p1, team2_p2')
                .gte('created_at', twoHoursAgo);

            if (recentMatches) {
                const currentIds = new Set([selectedPlayers.t1p1.id, selectedPlayers.t1p2.id, selectedPlayers.t2p1.id, selectedPlayers.t2p2.id]);
                const isDuplicate = recentMatches.some(m => {
                    const matchIds = new Set([m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2]);
                    return matchIds.size === currentIds.size && [...currentIds].every(id => matchIds.has(id));
                });

                if (isDuplicate) {
                    await alert({ title: 'Duplicate Match', message: t('new_match.duplicate_match'), type: 'warning' });
                    setLoading(false);
                    return;
                }
            }

            // Calculate Winner
            let t1Sets = 0;
            let t2Sets = 0;
            sets.forEach(s => {
                if (s.t1 > s.t2) t1Sets++;
                if (s.t2 > s.t1) t2Sets++;
            });

            if (t1Sets === t2Sets) {
                await alert({ title: 'Draw', message: t('new_match.cannot_be_draw') || "Match cannot end in a draw.", type: 'warning' });
                setLoading(false);
                return;
            }

            const winnerTeam = t1Sets > t2Sets ? 1 : 2;

            // --- ELO CALCULATION START ---

            // 1. Fetch match counts for K-Factor determination

            // We need to count matches for each player. 
            // Optimal way without new RPC: Parallel count queries.
            const fetchMatchCount = async (pid: string) => {
                const { count } = await supabase
                    .from('matches')
                    .select('id', { count: 'exact', head: true })
                    .or(`team1_p1.eq.${pid},team1_p2.eq.${pid},team2_p1.eq.${pid},team2_p2.eq.${pid}`);
                return count || 0;
            };

            const [count1, count2, count3, count4] = await Promise.all([
                fetchMatchCount(selectedPlayers.t1p1.id),
                fetchMatchCount(selectedPlayers.t1p2.id),
                fetchMatchCount(selectedPlayers.t2p1.id),
                fetchMatchCount(selectedPlayers.t2p2.id)
            ]);

            const k1 = getKFactor(count1);
            const k2 = getKFactor(count2);
            const k3 = getKFactor(count3);
            const k4 = getKFactor(count4);

            console.log('Match Counts:', { count1, count2, count3, count4 });
            console.log('K-Factors:', { k1, k2, k3, k4 });

            const t1Avg = calculateTeamAverage(selectedPlayers.t1p1.elo, selectedPlayers.t1p2.elo);
            const t2Avg = calculateTeamAverage(selectedPlayers.t2p1.elo, selectedPlayers.t2p2.elo);

            const t1Score = winnerTeam === 1 ? 1 : 0;
            const t2Score = winnerTeam === 2 ? 1 : 0;

            const t1Expected = calculateExpectedScore(t1Avg, t2Avg);
            const t2Expected = calculateExpectedScore(t2Avg, t1Avg);

            // Calculate new individual ratings with Dynamic K
            const newRatings = {
                t1p1: calculateNewRating(selectedPlayers.t1p1.elo, t1Score, t1Expected, k1),
                t1p2: calculateNewRating(selectedPlayers.t1p2.elo, t1Score, t1Expected, k2),
                t2p1: calculateNewRating(selectedPlayers.t2p1.elo, t2Score, t2Expected, k3),
                t2p2: calculateNewRating(selectedPlayers.t2p2.elo, t2Score, t2Expected, k4),
            };
            // --- ELO CALCULATION END ---

            // 1. Prepare Match Data
            const { data: { user } } = await supabase.auth.getUser();
            const eloSnapshot = {
                t1p1: newRatings.t1p1,
                t1p2: newRatings.t1p2,
                t2p1: newRatings.t2p1,
                t2p2: newRatings.t2p2
            };

            const { data: newMatch, error: matchError } = await supabase.from('matches').insert({
                team1_p1: selectedPlayers.t1p1.id,
                team1_p2: selectedPlayers.t1p2.id,
                team2_p1: selectedPlayers.t2p1.id,
                team2_p2: selectedPlayers.t2p2.id,
                score: sets,
                winner_team: winnerTeam,
                commentary: commentary.trim() || null,
                status: 'pending', // Explicitly pending
                elo_snapshot: eloSnapshot,
                created_by: user?.id
            }).select().single();

            if (matchError) throw matchError;

            // Log Activity
            if (newMatch) {
                logActivity('MATCH_CREATE', newMatch.id.toString(), {
                    winner: winnerTeam,
                    t1: [selectedPlayers.t1p1.username, selectedPlayers.t1p2.username],
                    t2: [selectedPlayers.t2p1.username, selectedPlayers.t2p2.username]
                });
            }

            // Note: We do NOT update profiles or achievements here anymore.
            // This happens on confirmation.

            await alert({ title: 'Success', message: t('new_match.success_alert'), type: 'success' });
            navigate('/');
        } catch (error: any) {
            console.error('Error saving match:', error);
            await alert({ title: 'Error', message: t('common.error') + ': ' + error.message, type: 'danger' });
        } finally {
            setLoading(false);
        }
    };

    // --- RENDER HELPERS ---

    if (fetchingPlayers) {
        return <div className="flex h-64 items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;
    }

    // PLAYER SELECTION MODAL
    if (isSelectionModalOpen) {
        const filteredPlayers = availablePlayers.filter(p =>
            p.username.toLowerCase().includes(searchQuery.toLowerCase())
        );

        return (
            <div className="space-y-6 animate-fade-in pb-20 relative">
                <header className="flex flex-col gap-4 mb-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-white">{t('new_match.select_player')}</h2>
                        <Button variant="ghost" size="icon" onClick={() => setIsSelectionModalOpen(false)}><X /></Button>
                    </div>
                    {/* Search Input */}
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-slate-500" size={18} />
                        <input
                            type="text"
                            placeholder="Search player..."
                            className="w-full bg-slate-800 border-slate-700 rounded-lg pl-10 pr-3 py-3 text-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-all placeholder-slate-500"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}

                        />
                    </div>
                </header>
                <div className="grid grid-cols-2 gap-4 overflow-y-auto pb-10">
                    {filteredPlayers.map(player => (
                        <div
                            key={player.id}
                            onClick={() => selectPlayer(player)}
                            className="flex flex-col items-center gap-2 rounded-xl bg-slate-800 p-4 active:bg-slate-700 active:scale-95 transition-all"
                        >
                            <Avatar fallback={player.username} src={player.avatar_url} />
                            <span className="text-sm font-medium text-slate-200">{player.username}</span>
                            <span className="text-[10px] text-slate-500">ELO {player.elo}</span>
                            <span className="text-[10px] text-slate-500">Level {getLevelFromElo(player.elo).level}</span>
                        </div>
                    ))}
                    {availablePlayers.length === 0 && (
                        <div className="col-span-2 text-center text-slate-500 py-10">
                            {t('new_match.invite_friends')}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // STEP 1: SELECT PLAYERS
    if (step === 1) {
        return (
            <div className="space-y-6 animate-fade-in">
                <header className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-white">{t('new_match.title')}</h1>
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><X size={24} /></Button>
                </header>

                <section className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase text-green-400 tracking-wider">{t('new_match.team_1')}</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <PlayerSelector
                            label={t('new_match.player_1')}
                            player={selectedPlayers.t1p1}
                            onClick={() => openSelection('t1p1')}
                        />
                        <PlayerSelector
                            label={t('new_match.player_2')}
                            player={selectedPlayers.t1p2}
                            onClick={() => openSelection('t1p2')}
                        />
                    </div>
                </section>

                <section className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase text-blue-400 tracking-wider">{t('new_match.team_2')}</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <PlayerSelector
                            label={t('new_match.player_1')}
                            player={selectedPlayers.t2p1}
                            onClick={() => openSelection('t2p1')}
                        />
                        <PlayerSelector
                            label={t('new_match.player_2')}
                            player={selectedPlayers.t2p2}
                            onClick={() => openSelection('t2p2')}
                        />
                    </div>
                </section>

                <div className="pt-8">
                    <Button
                        className="w-full"
                        size="lg"
                        disabled={!selectedPlayers.t1p1 || !selectedPlayers.t1p2 || !selectedPlayers.t2p1 || !selectedPlayers.t2p2}
                        onClick={() => setStep(2)}
                    >
                        {t('new_match.next_step')}
                    </Button>
                </div>
            </div>
        );
    }

    // STEP 2: SCORE
    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <header className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => setStep(1)}><X size={24} /></Button>
                <h1 className="text-2xl font-bold text-white">{t('new_match.match_result')}</h1>
            </header>

            {/* Teams Summary */}
            <div className="flex justify-between items-center rounded-xl bg-slate-800 p-4 border border-slate-700">
                <div className="text-center w-5/12">
                    <span className="block text-xs text-green-400 font-bold mb-1">{t('new_match.team_1').toUpperCase()}</span>
                    <div className="flex justify-center -space-x-2 mb-1">
                        <Avatar fallback={selectedPlayers.t1p1?.username || ''} src={selectedPlayers.t1p1?.avatar_url} size="sm" className="ring-2 ring-slate-800" />
                        <Avatar fallback={selectedPlayers.t1p2?.username || ''} src={selectedPlayers.t1p2?.avatar_url} size="sm" className="ring-2 ring-slate-800" />
                    </div>
                    <span className="text-xs font-semibold text-slate-300 truncate block">
                        {selectedPlayers.t1p1?.username} & {selectedPlayers.t1p2?.username}
                    </span>
                </div>
                <div className="text-slate-500 font-bold text-lg">VS</div>
                <div className="text-center w-5/12">
                    <span className="block text-xs text-blue-400 font-bold mb-1">{t('new_match.team_2').toUpperCase()}</span>
                    <div className="flex justify-center -space-x-2 mb-1">
                        <Avatar fallback={selectedPlayers.t2p1?.username || ''} src={selectedPlayers.t2p1?.avatar_url} size="sm" className="ring-2 ring-slate-800" />
                        <Avatar fallback={selectedPlayers.t2p2?.username || ''} src={selectedPlayers.t2p2?.avatar_url} size="sm" className="ring-2 ring-slate-800" />
                    </div>
                    <span className="text-xs font-semibold text-slate-300 truncate block">
                        {selectedPlayers.t2p1?.username} & {selectedPlayers.t2p2?.username}
                    </span>
                </div>
            </div>

            {/* Fair Play Disclaimer */}
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
                <p className="text-xs text-yellow-500 font-medium leading-relaxed">
                    {t('new_match.fair_play')}
                </p>
            </div>

            {/* Score Inputs */}
            <div className="space-y-4">
                <h3 className="text-center text-slate-400 text-sm tracking-widest uppercase">{t('new_match.set_scores')}</h3>
                {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center justify-center gap-6">
                        <input
                            type="number"
                            min="0" max="7"
                            className="w-16 h-16 rounded-xl bg-slate-800 text-center text-3xl font-bold text-white focus:bg-slate-700 focus:ring-2 ring-green-500 outline-none transition-all placeholder-slate-600"
                            value={sets[i].t1.toString()}
                            onChange={(e) => updateScore(i, 't1', parseInt(e.target.value) || 0)}
                        />
                        <span className="text-slate-600 font-bold text-xl">-</span>
                        <input
                            type="number"
                            min="0" max="7"
                            className="w-16 h-16 rounded-xl bg-slate-800 text-center text-3xl font-bold text-white focus:bg-slate-700 focus:ring-2 ring-blue-500 outline-none transition-all placeholder-slate-600"
                            value={sets[i].t2.toString()}
                            onChange={(e) => updateScore(i, 't2', parseInt(e.target.value) || 0)}
                        />
                    </div>
                ))}
                <p className="text-center text-xs text-slate-500 italic px-4">
                    {t('new_match.score_hint')}
                </p>
            </div>

            {/* Commentary Input */}
            <div className="space-y-2 px-1">
                <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                    {t('new_match.match_notes')}
                </label>
                <textarea
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                    rows={3}
                    placeholder={t('new_match.match_notes_placeholder')}
                    value={commentary}
                    onChange={(e) => setCommentary(e.target.value)}
                />
            </div>

            <div className="pt-8 space-y-3">
                <Button className="w-full gap-2" size="lg" onClick={handleSave} isLoading={loading} confirm={t('home.confirm_prompt') || "Are you sure?"}>
                    <Trophy size={20} />
                    {t('new_match.finish_match')}
                </Button>
                <p className="text-center text-xs text-slate-500">
                    {t('new_match.verification_note')}
                </p>
            </div>
        </div>
    );
};

const PlayerSelector = ({ label, player, onClick }: { label: string, player: Player | null, onClick: () => void }) => {
    return (
        <div
            onClick={onClick}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-700 bg-slate-800/30 p-4 transition-all hover:bg-slate-800 hover:border-slate-500 cursor-pointer active:scale-95 h-32"
        >
            {player ? (
                <>
                    <Avatar fallback={player.username} src={player.avatar_url} className="bg-green-500/20 text-green-400" />
                    <span className="text-xs font-medium text-slate-300 truncate w-full text-center">{player.username}</span>
                    <span className="text-[10px] text-slate-500">ELO {player.elo}</span>
                    <span className="text-[10px] text-slate-500">Level {getLevelFromElo(player.elo).level}</span>
                </>
            ) : (
                <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-500 group-hover:bg-slate-700">
                        <Users size={20} />
                    </div>
                    <span className="text-xs text-slate-500">{label}</span>
                </>
            )}
        </div>
    );
};

export default NewMatch;
