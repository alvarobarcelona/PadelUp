
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Users, X, Trophy, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calculateTeamAverage, calculateExpectedScore, calculateNewRating } from '../lib/elo';
import { checkAchievements } from '../lib/achievements';

interface Player {
    id: string;
    username: string;
    avatar_url: string | null;
    elo: number; // Added elo needed for calculation
}

const NewMatch = () => {
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
                .select('id, username, avatar_url, elo')
                .eq('approved', true) // Only select approved players
                .order('username');
            if (error) throw error;
            setAvailablePlayers(data || []);
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
            const t1Avg = calculateTeamAverage(selectedPlayers.t1p1.elo, selectedPlayers.t1p2.elo);
            const t2Avg = calculateTeamAverage(selectedPlayers.t2p1.elo, selectedPlayers.t2p2.elo);

            const t1Score = winnerTeam === 1 ? 1 : 0;
            const t2Score = winnerTeam === 2 ? 1 : 0;

            const t1Expected = calculateExpectedScore(t1Avg, t2Avg);
            const t2Expected = calculateExpectedScore(t2Avg, t1Avg);

            // Calculate new individual ratings
            // Team members share the same outcome and average opponent strength for now
            const newRatings = {
                t1p1: calculateNewRating(selectedPlayers.t1p1.elo, t1Score, t1Expected),
                t1p2: calculateNewRating(selectedPlayers.t1p2.elo, t1Score, t1Expected),
                t2p1: calculateNewRating(selectedPlayers.t2p1.elo, t2Score, t2Expected),
                t2p2: calculateNewRating(selectedPlayers.t2p2.elo, t2Score, t2Expected),
            };
            // --- ELO CALCULATION END ---

            // 1. Insert Match
            const { error: matchError } = await supabase.from('matches').insert({
                team1_p1: selectedPlayers.t1p1.id,
                team1_p2: selectedPlayers.t1p2.id,
                team2_p1: selectedPlayers.t2p1.id,
                team2_p2: selectedPlayers.t2p2.id,
                score: sets,
                winner_team: winnerTeam
            });

            if (matchError) throw matchError;

            // 2. Update Player Profiles
            // We use Promise.all to update all 4 in parallel.
            await Promise.all([
                supabase.from('profiles').update({ elo: newRatings.t1p1 }).eq('id', selectedPlayers.t1p1.id),
                supabase.from('profiles').update({ elo: newRatings.t1p2 }).eq('id', selectedPlayers.t1p2.id),
                supabase.from('profiles').update({ elo: newRatings.t2p1 }).eq('id', selectedPlayers.t2p1.id),
                supabase.from('profiles').update({ elo: newRatings.t2p2 }).eq('id', selectedPlayers.t2p2.id),
            ]);

            // 3. Check Achievements for all players
            await Promise.all([
                checkAchievements(selectedPlayers.t1p1.id),
                checkAchievements(selectedPlayers.t1p2.id),
                checkAchievements(selectedPlayers.t2p1.id),
                checkAchievements(selectedPlayers.t2p2.id),
            ]);

            navigate('/history');
        } catch (error: any) {
            console.error('Error saving match:', error);
            alert('Failed to save match: ' + error.message);
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
        return (
            <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 p-4">
                <header className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-white">Select Player</h2>
                    <Button variant="ghost" size="icon" onClick={() => setIsSelectionModalOpen(false)}><X /></Button>
                </header>
                <div className="grid grid-cols-2 gap-4 overflow-y-auto pb-10">
                    {availablePlayers.map(player => (
                        <div
                            key={player.id}
                            onClick={() => selectPlayer(player)}
                            className="flex flex-col items-center gap-2 rounded-xl bg-slate-800 p-4 active:bg-slate-700 active:scale-95 transition-all"
                        >
                            <Avatar fallback={player.username} src={player.avatar_url} />
                            <span className="text-sm font-medium text-slate-200">{player.username}</span>
                            <span className="text-[10px] text-slate-500">ELO {player.elo}</span>
                        </div>
                    ))}
                    {availablePlayers.length === 0 && (
                        <div className="col-span-2 text-center text-slate-500 py-10">
                            No players found. <br /> Invite friends to Sign Up!
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
                    <h1 className="text-2xl font-bold text-white">Select Players</h1>
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><X size={24} /></Button>
                </header>

                <section className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase text-green-400 tracking-wider">Team 1</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <PlayerSelector
                            label="Player 1"
                            player={selectedPlayers.t1p1}
                            onClick={() => openSelection('t1p1')}
                        />
                        <PlayerSelector
                            label="Player 2"
                            player={selectedPlayers.t1p2}
                            onClick={() => openSelection('t1p2')}
                        />
                    </div>
                </section>

                <section className="space-y-3">
                    <h2 className="text-sm font-semibold uppercase text-blue-400 tracking-wider">Team 2</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <PlayerSelector
                            label="Player 1"
                            player={selectedPlayers.t2p1}
                            onClick={() => openSelection('t2p1')}
                        />
                        <PlayerSelector
                            label="Player 2"
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
                        Next: Enter Score
                    </Button>
                </div>
            </div>
        );
    }

    // STEP 2: SCORE
    return (
        <div className="space-y-8 animate-fade-in">
            <header className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => setStep(1)}><X size={24} /></Button>
                <h1 className="text-2xl font-bold text-white">Match Result</h1>
            </header>

            {/* Teams Summary */}
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

            {/* Score Inputs */}
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
                <p className="text-center text-xs text-slate-500 italic px-4">
                    Enter the result in games (e.g., 6-3, 6-4). <br />
                    Use the third set if there is a tie. If it is decided by a tiebreak, record it as 7-6.
                </p>
            </div>


            <div className="pt-8 space-y-3">

                <Button className="w-full gap-2" size="lg" onClick={handleSave} isLoading={loading} confirm="Are you sure?">
                    <Trophy size={20} />
                    Finish Match
                </Button>
                <p className="text-center text-xs text-slate-500">
                    This will update player ratings and rankings immediately.
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
