
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Trash2, ShieldAlert, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Admin = () => {
    const navigate = useNavigate();
    const [isAdmin, setIsAdmin] = useState(false);
    const [, setLoading] = useState(true);
    const [players, setPlayers] = useState<any[]>([]);
    const [matches, setMatches] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'pending' | 'players' | 'matches'>('pending');

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
        const { data: m } = await supabase.from('matches').select('id, created_at, winner_team').order('created_at', { ascending: false });

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

            // 3. Calculate points to revert (Approximation using current ELOs)
            // Function imported from elo.ts (Need to ensure imports)
            // For now, I'll inline the logic or rely on imports if I added them.
            // I need to add imports to the top of the file! 
            // I will assume I will add imports in a separate Edit or this one if I can. 
            // I can't edit multiple chunks easily here. 
            // I will use HARDCODED logic here to be safe and avoid import issues if I mess up line numbers.
            // Actually, I should use the library functions. I'll add imports in a separate step? 
            // No, I'll allow this step to assume imports exist, and I'll add imports in the NEXT step or PREVIOUS step?
            // The user prompt is to do sequential.
            // I will add imports FIRST in a separate tool call.
            // Wait, I am already in the tool call.
            // I will abort this tool call and add imports first.
            // But I can't abort. 
            // I will just use the logic inline to be robust.

            const K_FACTOR = 32;
            const getExpected = (a: number, b: number) => 1 / (1 + Math.pow(10, (b - a) / 400));

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

            // 4. Delete the match path
            const { error: deleteError } = await supabase.from('matches').delete().eq('id', id);
            if (deleteError) throw deleteError;

            alert(`Match deleted and ELO reverted (approx ${points} pts).`);
            fetchData();
        } catch (error: any) {
            console.error(error);
            alert('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
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

    const pendingUsers = players.filter(p => !p.approved);
    const activeUsers = players.filter(p => p.approved);

    if (!isAdmin) return <div className="p-10 text-center"><Loader2 className="animate-spin inline" /> Verifying privileges...</div>;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
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
                <div className="space-y-2">
                    {activeUsers.map(p => {
                        const isExpired = !p.subscription_end_date || new Date(p.subscription_end_date) < new Date();
                        const daysLeft = p.subscription_end_date ? Math.ceil((new Date(p.subscription_end_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : 0;

                        return (
                            <div key={p.id} className="flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="font-bold text-white">{p.username}</p>
                                        {p.is_admin && <ShieldAlert size={14} className="text-red-400" />} {p.is_admin && "admin"}
                                    </div>
                                    <div className="flex flex-col gap-1 mt-1">
                                        <p className="text-xs text-slate-500">ELO: {p.elo} | ID: ...{p.id.slice(-4)}</p>
                                        <p className={`text-xs font-mono flex items-center gap-1 ${isExpired ? 'text-red-400 font-bold' : 'text-green-400'}`}>
                                            {isExpired ? '⚠️ Expired' : '✅ Active'}
                                            {p.subscription_end_date ? ` (${new Date(p.subscription_end_date).toLocaleDateString()})` : ' (No Date)'}
                                            {!isExpired && <span className="text-slate-500 font-normal">[{daysLeft}d left]</span>}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="danger" onClick={() => handleDeletePlayer(p.id)}>
                                        <Trash2 size={16} />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* MATCHES TAB */}
            {activeTab === 'matches' && (
                <div className="space-y-2">
                    {matches.map(m => (
                        <div key={m.id} className="flex justify-between items-center bg-slate-800 p-3 rounded-lg">
                            <div>
                                <p className="font-bold text-white">Match #{m.id}</p>
                                <p className="text-xs text-slate-500">{new Date(m.created_at).toLocaleDateString()}</p>
                            </div>
                            <Button size="sm" variant="danger" onClick={() => handleDeleteMatch(m.id)}>
                                <Trash2 size={16} />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Admin;
