


import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Plus, Trophy, ChevronRight, Calendar, Trash2, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PullToRefresh } from '../components/ui/PullToRefresh';
import { useModal } from '../context/ModalContext';
import { getFriends } from '../lib/friends';

export default function Tournaments() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { confirm, alert } = useModal();
    const [isAdmin, setIsAdmin] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'public' | 'friends' | 'private'>('public');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newTournamentName, setNewTournamentName] = useState('');

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserId(user.id);
                const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
                if (data?.is_admin) setIsAdmin(true);
            }
        };
        checkUser();
    }, []);

    const { data: tournaments = [], isLoading } = useQuery({
        queryKey: ['tournaments', isAdmin, activeTab], // Add activeTab to key
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return [];

            let query = supabase
                .from('tournaments')
                .select('*');

            // Filter by Tab
            if (activeTab === 'public') {
                query = query.eq('visibility', 'public');
            }
            else if (activeTab === 'friends') {
                // Fetch friends list first
                const { data: friendsData } = await getFriends(user.id);
                // Create a mutable copy or a new array. getFriends returns data or null.
                // We want to include ourselves so we see our own "Friends Only" tournaments.
                const friendIds = friendsData ? [...friendsData] : [];
                friendIds.push(user.id);

                query = query
                    .eq('visibility', 'friends')
                    .in('created_by', friendIds);
            }
            else if (activeTab === 'private') {
                // Private: Only show my own
                query = query
                    .eq('visibility', 'private')
                    .eq('created_by', user.id);
            }

            const { data } = await query.order('created_at', { ascending: false });
            return data || [];
        }
    });

    const createMutation = useMutation({
        mutationFn: async (name: string) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const { data, error } = await supabase
                .from('tournaments')
                .insert({
                    name,
                    created_by: user.id,
                    mode: 'americano',
                    status: 'setup',
                    visibility: 'public' // Default to public
                })
                .select()
                .single();

            if (error) throw error;

            // Auto-add creator as participant
            // We need display_name as it is NOT NULL in schema
            const { data: profile } = await supabase
                .from('profiles')
                .select('username, first_name, last_name')
                .eq('id', user.id)
                .single();

            const displayName = profile?.username || profile?.first_name || 'Creator';

            const { error: participatError } = await supabase
                .from('tournament_participants')
                .insert({
                    tournament_id: data.id,
                    player_id: user.id,
                    display_name: displayName
                });

            if (participatError) {
                console.error('Failed to add creator as participant', participatError);
                // We don't throw here to avoid failing the whole creation if just participant add fails,
                // but usually this should succeed.
            }

            return data;
        },
        onSuccess: (newTournament) => {
            queryClient.invalidateQueries({ queryKey: ['tournaments'] });
            setShowCreateModal(false);
            setNewTournamentName('');
            navigate(`/tournaments/${newTournament.id}`);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            const { error } = await supabase.from('tournaments').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tournaments'] });
            // alert({ title: 'Success', message: 'Tournament deleted', type: 'success' });
        },
        onError: (err) => {
            alert({ title: 'Error', message: err.message, type: 'danger' });
        }
    });

    const handleCreateClick = () => {
        setShowCreateModal(true);
    };

    const submitCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (newTournamentName.trim()) {
            createMutation.mutate(newTournamentName.trim());
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: number) => {
        e.preventDefault(); // Prevent navigation
        e.stopPropagation(); // Stop bubbling to Link

        const confirmed = await confirm({
            title: 'Delete Tournament?',
            message: 'This will delete the tournament and all its matches permanently.',
            type: 'danger',
            confirmText: 'Delete'
        });

        if (confirmed) {
            deleteMutation.mutate(id);
        }
    };

    const handleRefresh = async () => {
        await queryClient.refetchQueries({ queryKey: ['tournaments'] });
    };

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="space-y-6 pb-20 animate-fade-in relative">
                {/* Create Modal */}
                {showCreateModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="absolute right-4 top-4 text-slate-500 hover:text-white"
                            >
                                <X size={20} />
                            </button>

                            <div className="text-center mb-6">
                                <div className="mx-auto w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mb-3">
                                    <Trophy size={24} className="text-green-500" />
                                </div>
                                <h3 className="text-xl font-bold text-white">{t('tournaments.new_tournament', { defaultValue: 'New Tournament' })}</h3>
                                <p className="text-sm text-slate-400">{t('tournaments.enter_name', { defaultValue: 'Enter a name for your event' })}</p>
                            </div>

                            <form onSubmit={submitCreate} className="space-y-4">
                                <input
                                    type="text"
                                    placeholder={t('tournaments.placeholder_name', { defaultValue: 'e.g. Saturday Padel Cup' })}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-500 transition-colors"
                                    value={newTournamentName}
                                    onChange={(e) => setNewTournamentName(e.target.value)}
                                    autoFocus
                                />
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowCreateModal(false)}
                                        className="flex-1 py-3 bg-slate-800 text-slate-300 font-bold rounded-xl hover:bg-slate-700 transition-colors"
                                    >
                                        {t('tournaments.cancel', { defaultValue: 'Cancel' })}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!newTournamentName.trim() || createMutation.isPending}
                                        className="flex-1 py-3 bg-green-500 text-slate-900 font-bold rounded-xl hover:bg-green-400 transition-colors shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {createMutation.isPending ? t('tournaments.creating', { defaultValue: 'Creating...' }) : t('tournaments.create', { defaultValue: 'Create' })}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <header className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">{t('tournaments.title', { defaultValue: 'Tournaments' })}</h1>
                        <p className="text-slate-400 font-medium">
                            {t('tournaments.subtitle', { defaultValue: 'Manage your Americano & Mexicano events' })}
                        </p>
                    </div>
                    {/* Add Button */}
                    <button
                        onClick={handleCreateClick}
                        className="p-2 bg-green-500 rounded-full text-slate-900 shadow-lg shadow-green-500/20 hover:scale-105 transition-transform"
                    >
                        <Plus size={24} strokeWidth={3} />
                    </button>
                </header>

                {/* Tabs */}
                <div className="flex p-1 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <button
                        onClick={() => setActiveTab('public')}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'public' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        {t('tournaments.public', { defaultValue: 'Public' })}
                    </button>
                    <button
                        onClick={() => setActiveTab('friends')}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'friends' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        {t('tournaments.friends', { defaultValue: 'Friends' })}
                    </button>
                    <button
                        onClick={() => setActiveTab('private')}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'private' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        {t('tournaments.private', { defaultValue: 'Private' })}
                    </button>
                </div>

                <div className="grid gap-4">
                    {isLoading ? (
                        <div className="text-center py-10 text-slate-500">Loading...</div>
                    ) : tournaments.length === 0 ? (
                        <div className="text-center py-12 bg-slate-800/30 rounded-2xl border border-dashed border-slate-700">
                            <Trophy size={48} className="mx-auto text-slate-600 mb-4" />
                            <p className="text-slate-400 font-medium">
                                {activeTab === 'public' ? t('tournaments.no_public', { defaultValue: 'No public tournaments' }) :
                                    activeTab === 'friends' ? t('tournaments.no_friends', { defaultValue: 'No tournaments from friends' }) :
                                        t('tournaments.no_tournaments', { defaultValue: 'No tournaments found' })}
                            </p>
                            {activeTab === 'private' && (
                                <button
                                    onClick={handleCreateClick}
                                    className="mt-4 text-green-400 font-bold hover:underline"
                                >
                                    {t('tournaments.create_first', { defaultValue: 'Create your first tournament' })}
                                </button>
                            )}
                        </div>
                    ) : (
                        tournaments.map((tournament: any) => (
                            <Link
                                key={tournament.id}
                                to={`/tournaments/${tournament.id}`}
                                className="block group relative overflow-hidden rounded-xl bg-slate-800/60 border border-slate-700/50 p-5 hover:bg-slate-800 hover:border-slate-600 transition-all"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-lg font-bold text-white group-hover:text-green-400 transition-colors">
                                        {tournament.name}
                                    </h3>
                                    <div className="flex gap-2 items-center">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${tournament.status === 'completed' ? 'bg-slate-700 text-slate-400' :
                                            tournament.status === 'playing' ? 'bg-green-500/20 text-green-400 animate-pulse' :
                                                'bg-yellow-500/20 text-yellow-500'
                                            }`}>
                                            {t(`tournaments.status.${tournament.status}`, { defaultValue: tournament.status })}
                                        </span>

                                        {/* Delete Button (Admin Only or Creator) */}
                                        {(isAdmin || tournament.created_by === userId) && (
                                            <button
                                                onClick={(e) => handleDelete(e, tournament.id)}
                                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700/50 rounded-lg transition-colors z-10"
                                                title="Delete Tournament"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 text-xs text-slate-400">
                                    <span className="flex items-center gap-1">
                                        <Trophy size={14} />
                                        <span className="capitalize">{tournament.mode}</span>
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Calendar size={14} />
                                        {new Date(tournament.created_at).toLocaleDateString()}
                                    </span>
                                    {isAdmin && (
                                        <span className="text-[10px] bg-slate-700 px-1.5 rounded text-slate-300">
                                            {tournament.created_by === userId ? 'Yours' : 'User'}
                                        </span>
                                    )}
                                </div>

                                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                            </Link>
                        ))
                    )}
                </div>
            </div>
        </PullToRefresh>
    );
}
