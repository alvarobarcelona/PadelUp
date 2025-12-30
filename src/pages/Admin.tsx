
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Trash2, ShieldAlert, Loader2, Pencil, X, Save, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
// Helper for ELO
const getExpected = (a: number, b: number) => 1 / (1 + Math.pow(10, (b - a) / 400));

const Admin = () => {
    const navigate = useNavigate();
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [players, setPlayers] = useState<any[]>([]);
    const [matches, setMatches] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'pending' | 'players' | 'matches'>('pending');

    // Search State
    const [memberSearch, setMemberSearch] = useState('');
    const [matchSearch, setMatchSearch] = useState('');

    // Edit State
    const [editingPlayer, setEditingPlayer] = useState<any | null>(null);
    const [editingMatch, setEditingMatch] = useState<any | null>(null);

    useEffect(() => {
        checkAdmin();
    }, []);

    const checkAdmin = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigate('/'); return; }

        const { data } = await supabase.from('profiles').select('is_admin').eq('auth_id', user.id).single();

        if (data?.is_admin) {
            setIsAdmin(true);
            fetchData();
        } else {
            navigate('/'); // Kick out non-admins
        }
    };

    const fetchData = async () => {
        setLoading(true);
        // Fetch all profiles
        const { data: p } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        // Fetch matches
        const { data: m } = await supabase.from('matches').select('id, created_at, winner_team, team1_p1, team1_p2, team2_p1, team2_p2').order('created_at', { ascending: false });

        if (p) setPlayers(p);
        if (m) setMatches(m);
        setLoading(false);
    };

    const handleDeletePlayer = async (id: string) => {
        if (!confirm('Are you sure? This might break matches linked to this player!')) return;

        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) alert(error.message);
        else fetchData();
    };

    const handleDeleteMatch = async (id: number) => {
        if (!confirm('This will DELETE the match and REVERT ELO points for all players. Are you sure?')) return;

        setLoading(true);
        try {
            // 1. Fetch match data with player IDs
            const { data: match, error: matchError } = await supabase
                .from('matches')
                .select('*')
                .eq('id', id)
                .single();

            if (matchError) throw matchError;

            await revertEloForMatch(match);

            // 4. Delete the match path
            const { error: deleteError } = await supabase.from('matches').delete().eq('id', id);
            if (deleteError) throw deleteError;

            alert(`Match deleted and ELO reverted.`);
            fetchData();
        } catch (error: any) {
            console.error(error);
            alert('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const revertEloForMatch = async (match: any) => {
        // 2. Fetch current player profiles
        const playerIds = [match.team1_p1, match.team1_p2, match.team2_p1, match.team2_p2];
        const { data: currentPlayers, error: playersError } = await supabase
            .from('profiles')
            .select('id, elo')
            .in('id', playerIds);

        if (playersError) throw playersError;

        const p1 = currentPlayers.find(p => p.id === match.team1_p1);
        const p2 = currentPlayers.find(p => p.id === match.team1_p2);
        const p3 = currentPlayers.find(p => p.id === match.team2_p1);
        const p4 = currentPlayers.find(p => p.id === match.team2_p2);

        if (!p1 || !p2 || !p3 || !p4) throw new Error('Could not find all players to revert ELO.');

        const K_FACTOR = 32;
        const t1Avg = Math.round((p1.elo + p2.elo) / 2);
        const t2Avg = Math.round((p3.elo + p4.elo) / 2);

        let points = 0;
        if (match.winner_team === 1) {
            const expected = getExpected(t1Avg, t2Avg);
            points = Math.round(K_FACTOR * (1 - expected));
            // T1 won, so they gained points. We must SUBTRACT.
            // T2 lost, so they lost points. We must ADD.
            await Promise.all([
                supabase.from('profiles').update({ elo: p1.elo - points }).eq('id', p1.id),
                supabase.from('profiles').update({ elo: p2.elo - points }).eq('id', p2.id),
                supabase.from('profiles').update({ elo: p3.elo + points }).eq('id', p3.id),
                supabase.from('profiles').update({ elo: p4.elo + points }).eq('id', p4.id)
            ]);
        } else {
            const expected = getExpected(t2Avg, t1Avg);
            points = Math.round(K_FACTOR * (1 - expected));
            // T2 won, gained points. SUBTRACT.
            // T1 lost, lost points. ADD.
            await Promise.all([
                supabase.from('profiles').update({ elo: p1.elo + points }).eq('id', p1.id),
                supabase.from('profiles').update({ elo: p2.elo + points }).eq('id', p2.id),
                supabase.from('profiles').update({ elo: p3.elo - points }).eq('id', p3.id),
                supabase.from('profiles').update({ elo: p4.elo - points }).eq('id', p4.id)
            ]);
        }
        return points;
    };

    const handleApprovePlayer = async (id: string, username: string) => {
        if (!confirm(`Approve access for ${username}?`)) return;

        const { error } = await supabase
            .from('profiles')
            .update({ approved: true })
            .eq('id', id);

        if (error) alert(`Error: ${error.message}`);
        else {
            alert(`${username} Approved!`);
            fetchData();
        }
    };

    // Filtering
    const pendingUsers = players.filter(p => !p.approved);

    // Filter Active Users
    const activeUsers = players.filter(p => {
        if (!p.approved) return false;
        if (!memberSearch) return true;
        const search = memberSearch.toLowerCase();
        return p.username.toLowerCase().includes(search) || p.id.includes(search);
    });

    // Filter Matches
    const filteredMatches = matches.filter(m => {
        if (!matchSearch) return true;
        return m.id.toString().includes(matchSearch);
    });


    const handleSavePlayer = async () => {
        if (!editingPlayer) return;
        setLoading(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    username: editingPlayer.username,
                    elo: parseInt(editingPlayer.elo), // Ensure ELO is a number
                    is_admin: editingPlayer.is_admin,
                    subscription_end_date: editingPlayer.subscription_end_date || null,
                    approved: editingPlayer.approved,
                    banned: editingPlayer.banned // Update Banned Status
                })
                .eq('id', editingPlayer.id);

            if (error) throw error;
            alert('Player updated successfully!');
            setEditingPlayer(null);
            fetchData();
        } catch (error: any) {
            console.error(error);
            alert('Error updating player: ' + error.message);
        } finally {
            setLoading(false);
        }
    };



    const handleSaveMatch = async () => {
        if (!editingMatch) return;

        // Find the ORIGINAL match data from the 'matches' state to compare
        const originalMatch = matches.find(m => m.id === editingMatch.id);
        if (!originalMatch) return;

        if (originalMatch.winner_team === editingMatch.winner_team) {
            // No winner change, just maybe date?
            // For now only winner change is critical. 
            // If date changed, just update match row.
            const { error } = await supabase.from('matches').update({ created_at: editingMatch.created_at }).eq('id', editingMatch.id);
            if (error) alert(error.message);
            else {
                alert("Match updated.");
                setEditingMatch(null);
                fetchData();
            }
            return;
        }

        // Winner CHANGED! complex logic.
        if (!confirm("Changing the winner will REVERT the old ELO changes and APPLY NEW ONES. This affects 4 players. Proceed?")) return;

        setLoading(true);
        try {
            // 1. Revert Old ELO
            await revertEloForMatch(originalMatch);

            // 2. Apply NEW ELO
            // We need to fetch FRESH player data because revertEloForMatch just updated them!
            const playerIds = [originalMatch.team1_p1, originalMatch.team1_p2, originalMatch.team2_p1, originalMatch.team2_p2];
            const { data: currentPlayers, error: playersError } = await supabase
                .from('profiles')
                .select('id, elo')
                .in('id', playerIds);

            if (playersError) throw playersError;

            const p1 = currentPlayers.find(p => p.id === originalMatch.team1_p1);
            const p2 = currentPlayers.find(p => p.id === originalMatch.team1_p2);
            const p3 = currentPlayers.find(p => p.id === originalMatch.team2_p1);
            const p4 = currentPlayers.find(p => p.id === originalMatch.team2_p2);

            if (!p1 || !p2 || !p3 || !p4) throw new Error('Could not find all players to apply new ELO.');

            const K_FACTOR = 32;
            const t1Avg = Math.round((p1.elo + p2.elo) / 2);
            const t2Avg = Math.round((p3.elo + p4.elo) / 2);

            // Calculate for the NEW winner
            const newWinner = parseInt(editingMatch.winner_team);
            let points = 0;
            if (newWinner === 1) {
                const expected = getExpected(t1Avg, t2Avg);
                points = Math.round(K_FACTOR * (1 - expected));
                // T1 Wins (Add), T2 Loses (Sub)
                await Promise.all([
                    supabase.from('profiles').update({ elo: p1.elo + points }).eq('id', p1.id),
                    supabase.from('profiles').update({ elo: p2.elo + points }).eq('id', p2.id),
                    supabase.from('profiles').update({ elo: p3.elo - points }).eq('id', p3.id),
                    supabase.from('profiles').update({ elo: p4.elo - points }).eq('id', p4.id)
                ]);
            } else {
                const expected = getExpected(t2Avg, t1Avg);
                points = Math.round(K_FACTOR * (1 - expected));
                // T2 Wins (Add), T1 Loses (Sub)
                await Promise.all([
                    supabase.from('profiles').update({ elo: p1.elo - points }).eq('id', p1.id),
                    supabase.from('profiles').update({ elo: p2.elo - points }).eq('id', p2.id),
                    supabase.from('profiles').update({ elo: p3.elo + points }).eq('id', p3.id),
                    supabase.from('profiles').update({ elo: p4.elo + points }).eq('id', p4.id)
                ]);
            }

            // 3. Update Match Record
            const { error: updateError } = await supabase
                .from('matches')
                .update({
                    winner_team: newWinner,
                    created_at: editingMatch.created_at
                })
                .eq('id', editingMatch.id);

            if (updateError) throw updateError;

            alert(`Match updated! ELO corrected (approx ${points} pts adjusted).`);
            setEditingMatch(null);
            fetchData();
        } catch (error: any) {
            console.error(error);
            alert('Error updating match: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isAdmin) return <div className="p-10 text-center"><Loader2 className="animate-spin inline" /> Verifying privileges...</div>;

    return (
        <div className="space-y-6 animate-fade-in pb-20 relative">
            {/* ... Existing Reader ... */}
            <header className="flex items-center justify-between text-red-400">
                <div className="flex items-center gap-2">
                    <ShieldAlert />
                    <h1 className="text-2xl font-bold">Admin Console</h1>
                </div>
                {pendingUsers.length > 0 && (
                    <span className="bg-yellow-500 text-slate-900 text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                        {pendingUsers.length} Pending
                    </span>
                )}
            </header>

            <div className="flex gap-2 border-b border-slate-700 pb-2 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`px-4 py-2 font-bold whitespace-nowrap ${activeTab === 'pending' ? 'text-white border-b-2 border-yellow-500' : 'text-slate-500'}`}
                >
                    Requests ({pendingUsers.length})
                </button>
                <button
                    onClick={() => setActiveTab('players')}
                    className={`px-4 py-2 font-bold whitespace-nowrap ${activeTab === 'players' ? 'text-white border-b-2 border-green-500' : 'text-slate-500'}`}
                >
                    Members
                </button>
                <button
                    onClick={() => setActiveTab('matches')}
                    className={`px-4 py-2 font-bold whitespace-nowrap ${activeTab === 'matches' ? 'text-white border-b-2 border-green-500' : 'text-slate-500'}`}
                >
                    Matches
                </button>
            </div>

            {/* PENDING TAB */}
            {activeTab === 'pending' && (
                <div className="space-y-4">
                    {pendingUsers.length === 0 ? (
                        <p className="text-slate-500 text-center py-10">No pending requests.</p>
                    ) : (
                        pendingUsers.map(p => (
                            <div key={p.id} className="flex flex-col sm:flex-row justify-between items-center bg-slate-800/50 border border-yellow-500/20 p-4 rounded-lg gap-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-white text-lg">{p.username}</p>
                                        <span className="text-[10px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded">PENDING</span>
                                    </div>
                                    <p className="text-sm text-slate-400">Signed up: {new Date(p.created_at).toLocaleDateString()}</p>
                                    <p className="text-xs text-slate-500 font-mono">{p.id}</p>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <Button size="sm" className="flex-1 sm:flex-none bg-green-600 hover:bg-green-500" onClick={() => handleApprovePlayer(p.id, p.username)}>
                                        Approve
                                    </Button>
                                    <Button size="sm" variant="danger" className="flex-1 sm:flex-none" onClick={() => handleDeletePlayer(p.id)}>
                                        Reject
                                    </Button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* PLAYERS TAB */}
            {activeTab === 'players' && (
                <div className="space-y-4">
                    {/* Search Bar */}
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-slate-500" size={18} />
                        <input
                            type="text"
                            placeholder="Search by username or ID..."
                            className="w-full bg-slate-800 text-white rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-green-500 border border-slate-700"
                            value={memberSearch}
                            onChange={(e) => setMemberSearch(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        {activeUsers.map(p => {
                            const isExpired = !p.subscription_end_date || new Date(p.subscription_end_date) < new Date();
                            const daysLeft = p.subscription_end_date ? Math.ceil((new Date(p.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : 0;

                            return (
                                <div key={p.id} className="flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
                                    <div className='flex-1 pr-2'>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-white">{p.username}</p>
                                            {p.is_admin && <ShieldAlert size={14} className="text-red-400" />}
                                            {p.is_admin && <span className='text-[10px] text-red-400 uppercase'>Admin</span>}
                                            {p.banned && <span className='text-[10px] bg-red-500 text-white px-1 rounded uppercase font-bold'>BANNED</span>}
                                        </div>
                                        <div className="flex flex-col gap-1 mt-1">
                                            <p className="text-xs text-slate-500">ELO: {p.elo} | ID: {p.id}</p>
                                            <p className="text-xs text-slate-400">{p.email}</p>
                                            <p className={`text-xs font-mono flex items-center gap-1 ${isExpired ? 'text-red-400 font-bold' : 'text-green-400'}`}>
                                                {isExpired ? '⚠️ Expired' : '✅ Active'}
                                                {p.subscription_end_date ? ` (${new Date(p.subscription_end_date).toLocaleDateString()})` : ' (No Date)'}
                                                {!isExpired && <span className="text-slate-500 font-normal">[{daysLeft}d left]</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="ghost" className="text-blue-400 hover:bg-blue-500/10" onClick={() => setEditingPlayer(p)}>
                                            <Pencil size={16} />
                                        </Button>
                                        <Button size="sm" variant="danger" onClick={() => handleDeletePlayer(p.id)}>
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                        {activeUsers.length === 0 && <p className="text-center text-slate-500 py-4">No members found.</p>}
                    </div>
                </div>
            )}

            {/* MATCHES TAB */}
            {activeTab === 'matches' && (
                <div className="space-y-4">
                    {/* Search Bar */}
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-slate-500" size={18} />
                        <input
                            type="number"
                            placeholder="Filter by Match ID..."
                            className="w-full bg-slate-800 text-white rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-green-500 border border-slate-700"
                            value={matchSearch}
                            onChange={(e) => setMatchSearch(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        {filteredMatches.map(m => (
                            <div key={m.id} className="flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
                                <div>
                                    <p className="font-bold text-white">Match #{m.id}</p>
                                    <p className="text-xs text-slate-500">{new Date(m.created_at).toLocaleDateString()} | Winner: Team {m.winner_team}</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="ghost" className="text-blue-400 hover:bg-blue-500/10" onClick={() => setEditingMatch(m)}>
                                        <Pencil size={16} />
                                    </Button>
                                    <Button size="sm" variant="danger" onClick={() => handleDeleteMatch(m.id)}>
                                        <Trash2 size={16} />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {filteredMatches.length === 0 && <p className="text-center text-slate-500 py-4">No matches found.</p>}
                    </div>
                </div>
            )}

            {/* EDIT PLAYER MODAL */}
            {editingPlayer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl relative">
                        <button onClick={() => setEditingPlayer(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                            <X size={24} />
                        </button>
                        <h2 className="text-xl font-bold text-white mb-6">Edit Player</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Username</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-800 border-slate-700 rounded p-2 text-white"
                                    value={editingPlayer.username}
                                    onChange={(e) => setEditingPlayer({ ...editingPlayer, username: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">ELO Rating</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-800 border-slate-700 rounded p-2 text-white"
                                    value={editingPlayer.elo}
                                    onChange={(e) => setEditingPlayer({ ...editingPlayer, elo: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Subscription End Date</label>
                                <input
                                    type="date"
                                    className="w-full bg-slate-800 border-slate-700 rounded p-2 text-white"
                                    value={editingPlayer.subscription_end_date ? editingPlayer.subscription_end_date.split('T')[0] : ''}
                                    onChange={(e) => setEditingPlayer({ ...editingPlayer, subscription_end_date: e.target.value })}
                                />
                            </div>
                            <div className="flex items-center gap-3 py-2">
                                <label className="text-sm text-slate-300">Is Admin?</label>
                                <input
                                    type="checkbox"
                                    className="h-5 w-5 rounded border-slate-700 bg-slate-800 text-green-500 focus:ring-green-500"
                                    checked={editingPlayer.is_admin}
                                    onChange={(e) => setEditingPlayer({ ...editingPlayer, is_admin: e.target.checked })}
                                />
                            </div>
                            <div className="flex items-center gap-3 py-2 border-t border-slate-800">
                                <label className="text-sm text-slate-300">Approved User?</label>
                                <input
                                    type="checkbox"
                                    className="h-5 w-5 rounded border-slate-700 bg-slate-800 text-green-500 focus:ring-green-500"
                                    checked={editingPlayer.approved}
                                    onChange={(e) => setEditingPlayer({ ...editingPlayer, approved: e.target.checked })}
                                />
                            </div>
                            <div className="flex items-center gap-3 py-2 border-t border-slate-800 bg-red-500/10 p-2 rounded">
                                <label className="text-sm text-red-400 font-bold">Ban User?</label>
                                <input
                                    type="checkbox"
                                    className="h-5 w-5 rounded border-red-500 bg-slate-800 text-red-500 focus:ring-red-500"
                                    checked={editingPlayer.banned || false}
                                    onChange={(e) => setEditingPlayer({ ...editingPlayer, banned: e.target.checked })}
                                />
                            </div>

                            <Button onClick={handleSavePlayer} className="w-full mt-4 flex items-center justify-center gap-2">
                                <Save size={18} />
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT MATCH MODAL */}
            {editingMatch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl relative">
                        <button onClick={() => setEditingMatch(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                            <X size={24} />
                        </button>
                        <h2 className="text-xl font-bold text-white mb-6">Edit Match #{editingMatch.id}</h2>

                        <div className="bg-yellow-500/10 border border-yellow-500/20 p-3 rounded mb-4">
                            <p className="text-xs text-yellow-500 flex items-start gap-2">
                                <ShieldAlert size={14} className="min-w-[14px] mt-0.5" />
                                Warning: Changing the winner will recalculate ELO for all 4 players based on their CURRENT ranking.
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Date</label>
                                <input
                                    type="datetime-local"
                                    className="w-full bg-slate-800 border-slate-700 rounded p-2 text-white"
                                    value={editingMatch.created_at ? new Date(editingMatch.created_at).toISOString().slice(0, 16) : ''}
                                    onChange={(e) => setEditingMatch({ ...editingMatch, created_at: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">Winner Team</label>
                                <select
                                    className="w-full bg-slate-800 border-slate-700 rounded p-2 text-white"
                                    value={editingMatch.winner_team}
                                    onChange={(e) => setEditingMatch({ ...editingMatch, winner_team: parseInt(e.target.value) })}
                                >
                                    <option value={1}>Team 1 (Won)</option>
                                    <option value={2}>Team 2 (Won)</option>
                                </select>
                            </div>

                            <Button onClick={handleSaveMatch} className="w-full mt-4 flex items-center justify-center gap-2">
                                <Save size={18} />
                                {loading ? <Loader2 className="animate-spin" /> : 'Save & Recalculate'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Admin;
