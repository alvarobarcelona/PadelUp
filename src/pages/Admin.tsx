
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { Trash2, ShieldAlert, Loader2, Pencil, X, Search, Save, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getMatchPointsFromHistory } from '../lib/elo';
import { MatchFormAdmin as MatchForm } from '../components/Admin/MatchFormAdmin';
import { logActivity, ACTIVITY_ACTIONS, type ActivityAction } from '../lib/logger';
import { useTranslation } from 'react-i18next';
import { useModal } from '../context/ModalContext';

// Helper for ELO
// const getExpected = (a: number, b: number) => 1 / (1 + Math.pow(10, (b - a) / 400));
// const K_FACTOR = 32;

const Admin = () => {
    const { alert, confirm } = useModal();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [players, setPlayers] = useState<any[]>([]);
    const [matches, setMatches] = useState<any[]>([]);
    const [logs, setLogs] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'pending' | 'players' | 'matches' | 'direct_match' | 'activity'>('pending');

    // Search State
    const [memberSearch, setMemberSearch] = useState('');
    const [matchSearch, setMatchSearch] = useState('');
    const [logSearch, setLogSearch] = useState('');

    // Edit State
    const [editingPlayer, setEditingPlayer] = useState<any | null>(null);

    // Activity Filter State
    const [selectedActions, setSelectedActions] = useState<ActivityAction[]>([...ACTIVITY_ACTIONS]);
    const [showLogFilters, setShowLogFilters] = useState(false);


    useEffect(() => {
        checkAdmin();
    }, []);

    const checkAdmin = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { navigate('/'); return; }

        const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();

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
        const { data: m } = await supabase.from('matches').select('*').order('created_at', { ascending: false });

        // Fetch Logs (last 50)
        const { data: l } = await supabase
            .from('activity_logs')
            .select(`
                *,
                actor:actor_id(username, avatar_url)
            `)
            .order('created_at', { ascending: false })
            .limit(50);

        if (p) setPlayers(p);
        if (m) setMatches(m);
        if (l) setLogs(l);
        setLoading(false);
    };

    const handleDeletePlayer = async (id: string) => {
        const confirmed = await confirm({
            title: t('admin.delete_player_title') || 'Delete Player',
            message: t('admin.confirm_delete_player'),
            type: 'danger',
            confirmText: 'Delete'
        });
        if (!confirmed) return;

        setLoading(true);
        try {
            const { error }: any = await supabase.functions.invoke('delete-user', {
                body: { user_id: id }
            });

            if (error) throw new Error(error.message || 'Failed to delete user');

            // LOG ADMIN DELETE USER
            logActivity('ADMIN_DELETE_USER', id, { deleted_id: id });

            await alert({ title: 'Success', message: 'User deleted permanently.', type: 'success' });
            fetchData();
        } catch (error: any) {
            console.error(error);
            await alert({ title: 'Error', message: error.message, type: 'danger' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMatch = async (id: number) => {
        const confirmed = await confirm({
            title: t('admin.delete_match_title') || 'Delete Match',
            message: t('admin.confirm_delete_match'),
            type: 'danger',
            confirmText: 'Delete'
        });
        if (!confirmed) return;

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

            // LOG ADMIN DELETE MATCH
            logActivity('ADMIN_DELETE_MATCH', id.toString(), {
                original_match: match
            });

            await alert({
                title: 'Match Deleted',
                message: 'Match deleted and ELO reverted.',
                type: 'success'
            });
            fetchData();
        } catch (error: any) {
            console.error(error);
            await alert({
                title: 'Error',
                message: 'Error: ' + error.message,
                type: 'danger'
            });
        } finally {
            setLoading(false);
        }
    };

    const revertEloForMatch = async (match: any) => {
        // Use History Replay to find exact points exchanged
        const replayData = getMatchPointsFromHistory(matches, match.id);

        if (!replayData) {
            throw new Error('Could not calculate historic match points. Aborting.');
        }

        const { points } = replayData;

        // Fetch CURRENT profiles to update
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

        if (match.winner_team === 1) {
            // T1 won, so they gained points. We must SUBTRACT.
            // T2 lost, so they lost points. We must ADD.
            await Promise.all([
                supabase.from('profiles').update({ elo: p1.elo - points }).eq('id', p1.id),
                supabase.from('profiles').update({ elo: p2.elo - points }).eq('id', p2.id),
                supabase.from('profiles').update({ elo: p3.elo + points }).eq('id', p3.id),
                supabase.from('profiles').update({ elo: p4.elo + points }).eq('id', p4.id)
            ]);
        } else {
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
        const confirmed = await confirm({
            title: 'Approve User',
            message: `Approve access for ${username}?`,
            type: 'confirm',
            confirmText: 'Approve'
        });
        if (!confirmed) return;

        const { error } = await supabase
            .from('profiles')
            .update({ approved: true })
            .eq('id', id);

        if (error) {
            await alert({ title: 'Error', message: `Error: ${error.message}`, type: 'danger' });
        } else {
            // LOG ADMIN APPROVE
            logActivity('ADMIN_APPROVE_USER', id, { username });

            await alert({ title: 'Success', message: `${username} Approved!`, type: 'success' });
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
                    banned: editingPlayer.banned, // Update Banned Status
                    banned_until: editingPlayer.banned_until // Update Temporary Ban
                })
                .eq('id', editingPlayer.id);

            if (error) throw error;

            // LOG ADMIN EDIT
            logActivity('ADMIN_EDIT_USER', editingPlayer.id, {
                changes: {
                    username: editingPlayer.username,
                    elo: editingPlayer.elo,
                    is_admin: editingPlayer.is_admin,
                    approved: editingPlayer.approved,
                    banned: editingPlayer.banned
                }
            });

            await alert({ title: 'Success', message: 'Player updated successfully!', type: 'success' });
            setEditingPlayer(null);
            fetchData();
        } catch (error: any) {
            console.error(error);
            await alert({ title: 'Error', message: 'Error updating player: ' + error.message, type: 'danger' });
        } finally {
            setLoading(false);
        }
    };





    if (!isAdmin) return <div className="p-10 text-center flex flex-col items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin text-green-500" /> Verifying privileges...</div>;

    if (loading) return <div className="p-10 text-center flex flex-col items-center justify-center gap-2 text-slate-500"><Loader2 className="animate-spin text-green-500" /> {t('common.loading')}</div>;

    return (
        <div className="space-y-6 animate-fade-in pb-20 relative">
            {/* ... Existing Reader ... */}
            <header className="flex items-center justify-between text-red-400">
                <div className="flex items-center gap-2 justify-between w-full">
                    <ShieldAlert />
                    <h1 className="text-2xl font-bold"> {t('admin.title')}</h1>
                    <button onClick={() => navigate('/profile')} className="text-slate-500 hover:text-slate-300 transition-colors"><X className="w-6 h-6" /></button>
                </div>

            </header>

            <div className="flex gap-2 border-b border-slate-700 pb-2 overflow-x-auto no-scrollbar">
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`px-4 py-2 font-bold whitespace-nowrap ${activeTab === 'pending' ? 'text-white border-b-2 border-yellow-500' : 'text-slate-500'}`}
                >
                    {t('admin.tab_requests')} ({pendingUsers.length})
                </button>
                <button
                    onClick={() => setActiveTab('players')}
                    className={`px-4 py-2 font-bold whitespace-nowrap ${activeTab === 'players' ? 'text-white border-b-2 border-green-500' : 'text-slate-500'}`}
                >
                    {t('admin.tab_members')} ({activeUsers.length})
                </button>
                <button
                    onClick={() => setActiveTab('matches')}
                    className={`px-4 py-2 font-bold whitespace-nowrap ${activeTab === 'matches' ? 'text-white border-b-2 border-green-500' : 'text-slate-500'}`}
                >
                    {t('admin.tab_matches')} ({filteredMatches.length})
                </button>
                <button
                    onClick={() => setActiveTab('direct_match')}
                    className={`px-4 py-2 font-bold whitespace-nowrap ${activeTab === 'direct_match' ? 'text-white border-b-2 border-red-500' : 'text-slate-500'}`}
                >
                    {t('admin.tab_add_match')}
                </button>
                <button
                    onClick={() => setActiveTab('activity')}
                    className={`px-4 py-2 font-bold whitespace-nowrap ${activeTab === 'activity' ? 'text-white border-b-2 border-blue-500' : 'text-slate-500'}`}
                >
                    {t('admin.tab_activity')}
                </button>
            </div>

            {/* DIRECT MATCH TAB */}
            {activeTab === 'direct_match' && (
                <div className="pt-4">
                    <MatchForm
                        onSuccess={() => {
                            setActiveTab('matches');
                            fetchData();
                        }}
                        onCancel={() => setActiveTab('players')}
                    />
                </div>
            )}


            {/* PENDING TAB */}
            {activeTab === 'pending' && (
                <div className="space-y-4">
                    {pendingUsers.length === 0 ? (
                        <p className="text-slate-500 text-center py-10">{t('admin.no_pending')}</p>
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
                                    <p className="text-xs text-slate-500 font-mono">{p.email}</p>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <Button size="sm" className="flex-1 sm:flex-none bg-green-600 hover:bg-green-500" onClick={() => handleApprovePlayer(p.id, p.username)}>
                                        {t('admin.approve')}
                                    </Button>
                                    <Button size="sm" variant="danger" className="flex-1 sm:flex-none" onClick={() => handleDeletePlayer(p.id)}>
                                        {t('admin.reject')}
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
                            placeholder={t('admin.search_placeholder')}
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
                                            {(p.banned) && <span className='text-[10px] bg-red-500 text-white px-1 rounded uppercase font-bold'>BANNED</span>}
                                            {(p.banned_until) && <span className='text-[10px] bg-red-500 text-white px-1 rounded uppercase font-bold'>BANNED UNTIL {p.banned_until ? (new Date(p.banned_until).toLocaleString()) : 'No Date'}</span>}
                                        </div>
                                        <div className="flex flex-col gap-1 mt-1">
                                            <p className="text-xs text-slate-500">ELO: {p.elo} | AuthId: {p.id}</p>
                                            <p className='text-xs text-slate-500'>Member-Id: {p.member_id}</p>
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
                        {activeUsers.length === 0 && <p className="text-center text-slate-500 py-4">{t('admin.no_members')}</p>}
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
                            placeholder={t('admin.search_match_placeholder')}
                            className="w-full bg-slate-800 text-white rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-green-500 border border-slate-700"
                            value={matchSearch}
                            onChange={(e) => setMatchSearch(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        {filteredMatches.map(m => {
                            const p1 = players.find(p => p.id === m.team1_p1)?.username || 'Unknown';
                            const p2 = players.find(p => p.id === m.team1_p2)?.username || 'Unknown';
                            const p3 = players.find(p => p.id === m.team2_p1)?.username || 'Unknown';
                            const p4 = players.find(p => p.id === m.team2_p2)?.username || 'Unknown';

                            const scoreList = Array.isArray(m.score) ? m.score : [];

                            return (
                                <div key={m.id} className="relative bg-slate-800 p-3 rounded-lg border border-slate-700 overflow-hidden group">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="font-bold text-white flex items-center gap-2 text-sm">
                                                Match #{m.id}
                                                <span className="text-[10px] font-normal text-slate-500 bg-slate-900/50 px-2 py-0.5 rounded-full">
                                                    {new Date(m.created_at).toLocaleString()}
                                                </span>
                                            </p>
                                        </div>
                                        <Button size="sm" variant="danger" className='h-6 w-6 px-0' onClick={() => handleDeleteMatch(m.id)}>
                                            <Trash2 size={14} />
                                        </Button>
                                    </div>

                                    <div className="flex items-center justify-between gap-2 mt-1 text-xs bg-slate-900/40 p-2 rounded-lg">
                                        {/* Team 1 */}
                                        <div className={`flex-1 min-w-0 ${m.winner_team === 1 ? 'font-bold text-green-400' : 'text-slate-400'}`}>
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Team 1 {m.winner_team === 1 && '👑'}</p>
                                            <p className="truncate">{p1}</p>
                                            <p className="truncate">{p2}</p>
                                        </div>

                                        {/* Score */}
                                        <div className="flex flex-col items-center justify-center px-2 py-1 font-mono font-bold text-white text-sm bg-slate-800/50 rounded min-w-[60px] shrink-0 mx-1">
                                            {scoreList.length > 0 ? (
                                                scoreList.map((s: any, i: number) => (
                                                    <div key={i} className="whitespace-nowrap">
                                                        {s.t1}-{s.t2}
                                                    </div>
                                                ))
                                            ) : (
                                                <span className="text-slate-600">-</span>
                                            )}
                                        </div>

                                        {/* Team 2 */}
                                        <div className={`flex-1 min-w-0 text-right ${m.winner_team === 2 ? 'font-bold text-blue-400' : 'text-slate-400'}`}>
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Team 2 {m.winner_team === 2 && '👑'}</p>
                                            <p className="truncate">{p3}</p>
                                            <p className="truncate">{p4}</p>
                                        </div>
                                    </div>

                                    {/* Winner Strip */}
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${m.winner_team === 1 ? 'bg-green-500' : 'bg-blue-500'}`} />
                                </div>
                            );
                        })}
                        {filteredMatches.length === 0 && <p className="text-center text-slate-500 py-4">{t('admin.no_matches')}</p>}
                    </div>
                </div>
            )}

            {/* ACTIVITY FEED TAB */}
            {activeTab === 'activity' && (
                <div className="space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-3 text-slate-500" size={18} />
                        <input
                            type="text"
                            placeholder={t('admin.search_log_placeholder')}
                            className="w-full bg-slate-800 text-white rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 border border-slate-700"
                            value={logSearch}
                            onChange={(e) => setLogSearch(e.target.value)}
                        />
                    </div>

                    {/* Filters Toggle */}
                    <div className="flex gap-2 items-center">
                        <Button
                            variant={showLogFilters ? "primary" : "ghost"}
                            size="sm"
                            className="flex items-center gap-2"
                            onClick={() => setShowLogFilters(!showLogFilters)}
                        >
                            <Filter size={16} />
                            {t('admin.filters')}
                        </Button>
                        {selectedActions.length !== ACTIVITY_ACTIONS.length && (
                            <span className="text-xs text-yellow-500">
                                ({selectedActions.length} / {ACTIVITY_ACTIONS.length} active)
                            </span>
                        )}
                    </div>

                    {/* Filter Checkboxes */}
                    {showLogFilters && (
                        <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700 animate-fade-in grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            <div className="col-span-full flex gap-2 pb-2 border-b border-slate-700/50 mb-2">
                                <button
                                    onClick={() => setSelectedActions([...ACTIVITY_ACTIONS])}
                                    className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                                >
                                    {t('admin.select_all')}
                                </button>
                                <button
                                    onClick={() => setSelectedActions([])}
                                    className="text-xs text-slate-500 hover:text-slate-300 hover:underline"
                                >
                                    {t('admin.clear_all')}
                                </button>
                            </div>
                            {ACTIVITY_ACTIONS.map(action => (
                                <label key={action} className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-offset-0 focus:ring-blue-500"
                                        checked={selectedActions.includes(action)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setSelectedActions([...selectedActions, action]);
                                            } else {
                                                setSelectedActions(selectedActions.filter(a => a !== action));
                                            }
                                        }}
                                    />
                                    <span className={`text-xs ${selectedActions.includes(action) ? 'text-white' : 'text-slate-500'} group-hover:text-blue-300 transition-colors`}>
                                        {action.replace(/_/g, ' ')}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}

                    <div className="space-y-2">
                        {logs
                            .filter(l => selectedActions.includes(l.action as ActivityAction))
                            .filter(l => JSON.stringify(l).toLowerCase().includes(logSearch.toLowerCase()))
                            .map(log => {
                                const isError = log.action.includes('REJECT') || log.action.includes('DELETE');
                                const isCreate = log.action.includes('CREATE') || log.action.includes('REGISTER');
                                const isUpdate = log.action.includes('UPDATE') || log.action.includes('EDIT');

                                let badgeColor = 'bg-slate-700 text-slate-300';
                                if (isError) badgeColor = 'bg-red-500/20 text-red-400';
                                if (isCreate) badgeColor = 'bg-green-500/20 text-green-400';
                                if (isUpdate) badgeColor = 'bg-blue-500/20 text-blue-400';

                                return (
                                    <div key={log.id} className="flex flex-col gap-1 bg-slate-800/80 p-3 rounded-lg border border-slate-700 text-sm">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${badgeColor}`}>
                                                    {log.action.replace(/_/g, ' ')}
                                                </span>
                                                <span className="text-slate-400 text-xs">{new Date(log.created_at).toLocaleString()}</span>
                                            </div>
                                            {log.actor && (
                                                <span className="text-xs text-slate-500 font-mono">
                                                    By: {log.actor?.username || 'Unknown'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="pl-1">
                                            {log.target_id && <p className="text-xs text-slate-500 font-mono mb-1">Target ID: {log.target_id}</p>}
                                            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-900/50 p-2 rounded">
                                                {JSON.stringify(log.details, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                );
                            })}
                        {logs.length === 0 && <p className="text-center text-slate-500 py-4">{t('admin.no_activity')}</p>}
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
                        <h2 className="text-xl font-bold text-white mb-6">{t('admin.edit_player')}</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-400 block mb-1">{t('auth.username')}</label>
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
                                <label className="text-xs text-slate-400 block mb-1">{t('admin.subscription_end')}</label>
                                <input
                                    type="date"
                                    className="w-full bg-slate-800 border-slate-700 rounded p-2 text-white"
                                    value={editingPlayer.subscription_end_date ? editingPlayer.subscription_end_date.split('T')[0] : ''}
                                    onChange={(e) => setEditingPlayer({ ...editingPlayer, subscription_end_date: e.target.value })}
                                />
                            </div>
                            <div className="flex items-center gap-3 py-2">
                                <label className="text-sm text-slate-300">{t('admin.is_admin')}</label>
                                <input
                                    type="checkbox"
                                    className="h-5 w-5 rounded border-slate-700 bg-slate-800 text-green-500 focus:ring-green-500"
                                    checked={editingPlayer.is_admin}
                                    onChange={(e) => setEditingPlayer({ ...editingPlayer, is_admin: e.target.checked })}
                                />
                            </div>
                            <div className="flex items-center gap-3 py-2 border-t border-slate-800">
                                <label className="text-sm text-slate-300">{t('admin.approved_user')}</label>
                                <input
                                    type="checkbox"
                                    className="h-5 w-5 rounded border-slate-700 bg-slate-800 text-green-500 focus:ring-green-500"
                                    checked={editingPlayer.approved}
                                    onChange={(e) => setEditingPlayer({ ...editingPlayer, approved: e.target.checked })}
                                />
                            </div>
                            <div className="flex flex-col gap-3 py-2 border-t border-slate-800 bg-red-500/5 p-3 rounded">
                                <label className="text-sm text-red-400 font-bold">Ban Status</label>
                                <div className="flex gap-2">
                                    <button
                                        className={`flex-1 py-1.5 px-2 rounded text-xs font-bold transition-colors ${!editingPlayer.banned && !editingPlayer.banned_until ? 'bg-green-500 text-slate-900' : 'bg-slate-800 text-slate-400'}`}
                                        onClick={() => setEditingPlayer({ ...editingPlayer, banned: false, banned_until: null })}
                                    >
                                        Active
                                    </button>
                                    <button
                                        className={`flex-1 py-1.5 px-2 rounded text-xs font-bold transition-colors ${editingPlayer.banned ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}
                                        onClick={() => setEditingPlayer({ ...editingPlayer, banned: true, banned_until: null })}
                                    >
                                        Permanent
                                    </button>
                                    <button
                                        className={`flex-1 py-1.5 px-2 rounded text-xs font-bold transition-colors ${!editingPlayer.banned && editingPlayer.banned_until ? 'bg-orange-500 text-white' : 'bg-slate-800 text-slate-400'}`}
                                        onClick={() => {
                                            const tomorrow = new Date();
                                            tomorrow.setDate(tomorrow.getDate() + 1);
                                            setEditingPlayer({ ...editingPlayer, banned: false, banned_until: tomorrow.toISOString() });
                                        }}
                                    >
                                        Temporary
                                    </button>
                                </div>

                                {!editingPlayer.banned && editingPlayer.banned_until && (
                                    <div className="animate-fade-in space-y-2 mt-2">
                                        <label className="text-xs text-slate-400">Ban Until</label>
                                        <div className="flex gap-2">
                                            {[1, 3, 7, 30].map(days => (
                                                <button
                                                    key={days}
                                                    className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-1 rounded text-[10px]"
                                                    onClick={() => {
                                                        const date = new Date();
                                                        date.setDate(date.getDate() + days);
                                                        setEditingPlayer({ ...editingPlayer, banned_until: date.toISOString() });
                                                    }}
                                                >
                                                    {days}d
                                                </button>
                                            ))}
                                        </div>
                                        <input
                                            type="datetime-local"
                                            className="w-full bg-slate-800 border-slate-700 rounded p-2 text-white text-xs"
                                            value={editingPlayer.banned_until ? new Date(editingPlayer.banned_until).toISOString().slice(0, 16) : ''}
                                            onChange={(e) => setEditingPlayer({ ...editingPlayer, banned_until: new Date(e.target.value).toISOString() })}
                                        />
                                    </div>
                                )}
                            </div>

                            <Button onClick={handleSavePlayer} className="w-full mt-4 flex items-center justify-center gap-2">
                                <Save size={18} />
                                {t('admin.save_changes')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}



        </div>
    );
};

export default Admin;
