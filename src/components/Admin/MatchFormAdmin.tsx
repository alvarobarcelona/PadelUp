import { useState, useEffect } from 'react';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { Users, X, Trophy, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { calculateTeamAverage, calculateExpectedScore, calculateNewRating, getKFactor, getLevelFromElo } from '../../lib/elo';
import { logActivity } from '../../lib/logger';

interface Player {
    id: string;
    username: string;
    avatar_url: string | null;
    elo: number;
    subscription_end_date?: string | null;
}

interface MatchFormAdminProps {
    onSuccess: () => void;
    onCancel: () => void;
}

export const MatchFormAdmin = ({ onSuccess, onCancel }: MatchFormAdminProps) => {
    const [step, setStep] = useState<1 | 2>(1); // 1: Players, 2: Score
    const [loading, setLoading] = useState(false);
    const [fetchingPlayers, setFetchingPlayers] = useState(true);
    const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
    const [searchQuery, setSearchQuery] = useState('');

    const [selectedPlayers, setSelectedPlayers] = useState<{ t1p1: Player | null, t1p2: Player | null, t2p1: Player | null, t2p2: Player | null }>({
        t1p1: null, t1p2: null,
        t2p1: null, t2p2: null
    });

    const [sets, setSets] = useState([{ t1: 0, t2: 0 }, { t1: 0, t2: 0 }, { t1: 0, t2: 0 }]);
    const [commentary, setCommentary] = useState('');

    // Selection Modal State
    const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
    const [activePosition, setActivePosition] = useState<keyof typeof selectedPlayers | null>(null);

    useEffect(() => {
        fetchPlayers();
    }, []);

    const fetchPlayers = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, username, avatar_url, elo, subscription_end_date')
                .eq('approved', true)
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
        setIsSelectionModalOpen(true);
    };

    const selectPlayer = (player: Player) => {
        if (activePosition) {
            // Prevent selecting same player twice
            const isAlreadySelected = Object.values(selectedPlayers).some(p => p?.id === player.id);
            if (isAlreadySelected) {
                alert('Player already selected!');
                return;
            }

            setSelectedPlayers(prev => ({ ...prev, [activePosition]: player }));
            setIsSelectionModalOpen(false);
            setActivePosition(null);
        }
    };

    const updateScore = (setIndex: number, team: 't1' | 't2', value: number) => {
        const newSets = [...sets];
        newSets[setIndex][team] = Math.max(0, Math.min(7, value));
        setSets(newSets);
    };

    const handleSave = async () => {
        if (!selectedPlayers.t1p1 || !selectedPlayers.t1p2 || !selectedPlayers.t2p1 || !selectedPlayers.t2p2) return;

        // Validation: Check if at least one game has been played
        const totalGames = sets.reduce((acc, s) => acc + s.t1 + s.t2, 0);
        if (totalGames === 0) {
            alert('Please enter a valid result (at least one game played).');
            return;
        }

        setLoading(true);
        try {
            // Calculate Winner
            let t1Sets = 0;
            let t2Sets = 0;
            sets.forEach(s => {
                if (s.t1 > s.t2) t1Sets++;
                if (s.t2 > s.t1) t2Sets++;
            });

            const winnerTeam = t1Sets > t2Sets ? 1 : 2;

            // --- ELO CALCULATION START ---
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

            const t1Avg = calculateTeamAverage(selectedPlayers.t1p1.elo, selectedPlayers.t1p2.elo);
            const t2Avg = calculateTeamAverage(selectedPlayers.t2p1.elo, selectedPlayers.t2p2.elo);

            const t1Score = winnerTeam === 1 ? 1 : 0;
            const t2Score = winnerTeam === 2 ? 1 : 0;

            const t1Expected = calculateExpectedScore(t1Avg, t2Avg);
            const t2Expected = calculateExpectedScore(t2Avg, t1Avg);

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
                status: 'confirmed', // DIRECT MATCH
                elo_snapshot: eloSnapshot,
                created_by: user?.id
            }).select().single();

            if (matchError) throw matchError;

            // UPDATE PROFILES IMMEDIATELY
            await Promise.all([
                supabase.from('profiles').update({ elo: newRatings.t1p1 }).eq('id', selectedPlayers.t1p1.id),
                supabase.from('profiles').update({ elo: newRatings.t1p2 }).eq('id', selectedPlayers.t1p2.id),
                supabase.from('profiles').update({ elo: newRatings.t2p1 }).eq('id', selectedPlayers.t2p1.id),
                supabase.from('profiles').update({ elo: newRatings.t2p2 }).eq('id', selectedPlayers.t2p2.id),
            ]);

            // LOG ADMIN MATCH CREATE
            if (newMatch) {
                logActivity('ADMIN_MATCH_CREATE', newMatch.id.toString(), {
                    winner: winnerTeam,
                    t1: [selectedPlayers.t1p1.username, selectedPlayers.t1p2.username],
                    t2: [selectedPlayers.t2p1.username, selectedPlayers.t2p2.username]
                });
            }

            alert("Match created and confirmed! ELOs updated.");

            onSuccess();

        } catch (error: any) {
            console.error('Error saving match:', error);
            alert('Failed to save match: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (fetchingPlayers) {
        return <div className="flex h-64 items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;
    }

    if (isSelectionModalOpen) {
        const filteredPlayers = availablePlayers.filter(p =>
            p.username.toLowerCase().includes(searchQuery.toLowerCase())
        );

        return (

            <div className="space-y-6 animate-fade-in">
                <header className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">Select Player</h2>
                    <Button variant="ghost" size="icon" onClick={() => setIsSelectionModalOpen(false)}><X /></Button>
                </header>

                <div className="mb-4">
                    <input
                        type="search"
                        placeholder="Search player..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 placeholder-slate-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}

                    />
                </div>

                <div className="grid grid-cols-2 gap-4 overflow-y-auto flex-1 min-h-0 pb-10">
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
                    {filteredPlayers.length === 0 && (
                        <div className="col-span-2 text-center text-slate-500 py-10">
                            {searchQuery ? 'No players found matching your search.' : <>No players found. <br /> Invite friends to Sign Up!</>}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // STEP 1
    if (step === 1) {
        return (
            <div className="space-y-6 animate-fade-in">
                <header className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-white">Record Match (without confirmation)</h1>
                    <Button variant="ghost" size="icon" onClick={onCancel}><X size={24} /></Button>
                </header>

                <section className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase text-green-400 tracking-wider">Team 1</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <PlayerSelector label="Player 1" player={selectedPlayers.t1p1} onClick={() => openSelection('t1p1')} />
                        <PlayerSelector label="Player 2" player={selectedPlayers.t1p2} onClick={() => openSelection('t1p2')} />
                    </div>
                </section>

                <section className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase text-blue-400 tracking-wider">Team 2</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <PlayerSelector label="Player 1" player={selectedPlayers.t2p1} onClick={() => openSelection('t2p1')} />
                        <PlayerSelector label="Player 2" player={selectedPlayers.t2p2} onClick={() => openSelection('t2p2')} />
                    </div>
                </section>

                <div className="pt-8">
                    <Button
                        className="w-full"
                        size="lg"
                        disabled={!selectedPlayers.t1p1 || !selectedPlayers.t1p2 || !selectedPlayers.t2p1 || !selectedPlayers.t2p2}
                        onClick={() => setStep(2)}
                    >
                        Next: Enter Score
                    </Button>
                </div>
            </div>
        );
    }

    // STEP 2
    return (
        <div className="space-y-8 animate-fade-in pb-10">
            <header className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => setStep(1)}><X size={24} /></Button>
                <h1 className="text-2xl font-bold text-white">Match Result</h1>
            </header>

            <div className="flex justify-between items-center rounded-xl bg-slate-800 p-4 border border-slate-700">
                <div className="text-center w-5/12">
                    <span className="block text-xs text-green-400 font-bold mb-1">TEAM 1</span>
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
                    <span className="block text-xs text-blue-400 font-bold mb-1">TEAM 2</span>
                    <div className="flex justify-center -space-x-2 mb-1">
                        <Avatar fallback={selectedPlayers.t2p1?.username || ''} src={selectedPlayers.t2p1?.avatar_url} size="sm" className="ring-2 ring-slate-800" />
                        <Avatar fallback={selectedPlayers.t2p2?.username || ''} src={selectedPlayers.t2p2?.avatar_url} size="sm" className="ring-2 ring-slate-800" />
                    </div>
                    <span className="text-xs font-semibold text-slate-300 truncate block">
                        {selectedPlayers.t2p1?.username} & {selectedPlayers.t2p2?.username}
                    </span>
                </div>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                <p className="text-xs text-red-500 font-medium leading-relaxed">
                    DIRECT ENTRY: This match will be confirmed IMMEDIATELY and ELOs updated.
                </p>
            </div>

            <div className="space-y-4">
                <h3 className="text-center text-slate-400 text-sm tracking-widest uppercase">Set Scores</h3>
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
            </div>

            <div className="space-y-2 px-1">
                <label className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                    Match Notes (Optional)
                </label>
                <textarea
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                    rows={3}
                    placeholder="Describe the match..."
                    value={commentary}
                    onChange={(e) => setCommentary(e.target.value)}
                />
            </div>

            <div className="pt-8 space-y-3">
                <Button className="w-full gap-2" size="lg" onClick={handleSave} isLoading={loading} confirm="Are you sure?">
                    <Trophy size={20} />
                    Confirm & Update ELOs
                </Button>
                <p className="text-center text-xs text-slate-500">
                    Instant Action - No verification required.
                </p>
            </div>
        </div>
    );
};

const PlayerSelector = ({ label, player, onClick }: { label: string, player: Player | null, onClick: () => void }) => {
    return (
        <div onClick={onClick} className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-700 bg-slate-800/30 p-4 transition-all hover:bg-slate-800 hover:border-slate-500 cursor-pointer active:scale-95 h-32">
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
