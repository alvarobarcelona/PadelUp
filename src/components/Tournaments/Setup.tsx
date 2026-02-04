
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Users, Search, X, Globe, Lock } from 'lucide-react';
import { useModal } from '../../context/ModalContext';
import { generateAmericanoRound, generateMexicanoRound, type TournamentParticipant } from '../../lib/tournament-logic';

type SetupProps = {
    tournament: any;
    onModeChange?: (mode: 'americano' | 'mexicano') => void;
};

export default function Setup({ tournament, onModeChange }: SetupProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { alert } = useModal();
    const [searchQuery, setSearchQuery] = useState('');
    const [pointsPerMatch, setPointsPerMatch] = useState(24);
    const [mode, setMode] = useState<'americano' | 'mexicano'>(tournament.mode || 'americano');
    const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('public');
    const [courtNames, setCourtNames] = useState<string[]>([]);
    const [guestName, setGuestName] = useState('');

    // Notify parent when mode changes
    useEffect(() => {
        if (onModeChange) {
            onModeChange(mode);
        }
    }, [mode, onModeChange]);

    // Calculate time estimate helper
    const getEstimatedTime = (numPlayers: number, points: number) => {
        if (numPlayers < 4) return 0;
        // Formula derived from user heuristic: 8 players, 32 points -> 120 mins
        // K = 120 / (7 * 32) approx 0.535 mins per point per round
        const rounds = numPlayers - 1;
        const matchTime = points * 0.55; // Slightly padded factor
        return Math.round(rounds * matchTime);
    };

    // 1. Fetch Current Participants
    const { data: participants = [] } = useQuery({
        queryKey: ['participants', tournament.id],
        queryFn: async () => {
            const { data } = await supabase
                .from('tournament_participants')
                .select('*')
                .eq('tournament_id', tournament.id)
                .order('created_at', { ascending: true });
            return data || [];
        }
    });

    // 2. Add Participant Logic
    // Can search friends
    const { data: friends = [] } = useQuery({
        queryKey: ['friends_search', searchQuery],
        enabled: searchQuery.length > 1,
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return [];

            // Search profiles by username, firstname, lastname
            const { data } = await supabase
                .from('profiles')
                .select('id, username,first_name,last_name, avatar_url')
                .neq('is_admin', true)
                .eq('banned', false)
                .gte('subscription_end_date', new Date().toISOString())
                .or(`username.ilike.%${searchQuery}%,first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%`)
                .limit(5);
            return data || [];
        }
    });

    const addParticipantMutation = useMutation({
        mutationFn: async ({ id, firstName, lastName }: { id?: string, firstName?: string, lastName?: string }) => {
            const fullName = (firstName + ' ' + (lastName || '')).trim();
            const { error } = await supabase.from('tournament_participants').insert({
                tournament_id: tournament.id,
                display_name: fullName,
                player_id: id || null,
                score: 0,
                matches_played: 0,
                active: true
            });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['participants', tournament.id] });
            setSearchQuery('');
            setGuestName('');
        }
    });

    const removeParticipantMutation = useMutation({
        mutationFn: async (id: number) => {
            const { error } = await supabase.from('tournament_participants').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['participants', tournament.id] });
        }
    });

    const startTournamentMutation = useMutation({
        mutationFn: async () => {
            // 1. Generate Matches
            let matches = [];
            const currentParticipants = participants as TournamentParticipant[];

            if (currentParticipants.length < 4) {
                throw new Error('Need at least 4 players');
            }

            if (mode === 'americano') {
                if (currentParticipants.length % 4 !== 0) {

                }
                matches = generateAmericanoRound(1, currentParticipants, tournament.id);
            } else {
                matches = generateMexicanoRound(1, currentParticipants, tournament.id);
            }

            if (matches.length === 0) {
                throw new Error(t('tournaments.setup.invalid_player_count'));
            }

            // 1.5. Clean up any existing matches (in case of restart/retry)
            await supabase.from('tournament_matches').delete().eq('tournament_id', tournament.id);

            // 2. Insert Matches
            const { error: matchError } = await supabase
                .from('tournament_matches')
                .insert(matches);

            if (matchError) throw matchError;

            // 3. Update Tournament
            const { error: tourneyError } = await supabase.from('tournaments')
                .update({
                    status: 'playing',
                    mode: mode,
                    current_round_number: 1,
                    visibility: visibility,
                    settings: {
                        pointsPerMatch,
                        courtNames: courtNames
                    }
                })
                .eq('id', tournament.id);

            if (tourneyError) throw tourneyError;
        },
        onSuccess: () => {
            // Invalidate everything to refresh UI
            // Important: TournamentManager uses string ID from URL, so we must match that key
            queryClient.invalidateQueries({ queryKey: ['tournament', String(tournament.id)] });
            queryClient.invalidateQueries({ queryKey: ['matches', tournament.id] });
            queryClient.invalidateQueries({ queryKey: ['tournaments'] });
        },
        onError: (error: any) => {
            alert({ title: 'Error', message: error.message, type: 'danger' });
        }
    });

    const handleStart = async () => {
        if (participants.length < 4) return;

        // Verify creator is a participant
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const isCreatorParticipant = participants.some((p: any) => p.player_id === user.id);

        if (!isCreatorParticipant) {
            await alert({
                title: t('tournaments.setup.must_participate', { defaultValue: 'You must participate' }),
                message: t('tournaments.setup.must_participate_desc', { defaultValue: 'As the creator, you must be a participant in this tournament.' }),
                type: 'warning'
            });
            return;
        }

        startTournamentMutation.mutate();
    };

    return (
        <div className="space-y-6">
            {/* Players List */}
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Users size={16} /> {t('tournaments.setup.players', { defaultValue: 'Players' })} ({participants.length})
                    </h3>
                </div>

                {/* Search Input */}
                <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                        type="text"
                        placeholder={t('tournaments.setup.search_users')}
                        className="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
                            {friends.length > 0 ? (
                                friends.map((f: any) => {
                                    const isAdded = participants.some((p: any) => p.player_id === f.id);
                                    const isDisabled = isAdded || addParticipantMutation.isPending;
                                    return (
                                        <button
                                            key={f.id}
                                            disabled={isDisabled}
                                            onClick={() => !isDisabled && addParticipantMutation.mutate({ firstName: f.first_name, lastName: f.last_name, id: f.id })}
                                            className={`w-full text-left px-4 py-2 flex items-center gap-2 ${isDisabled ? 'opacity-50 cursor-not-allowed bg-slate-900' : 'hover:bg-slate-700'}`}
                                        >
                                            <div className="w-6 h-6 rounded-full bg-slate-600 overflow-hidden">
                                                {f.avatar_url && <img src={f.avatar_url} className="w-full h-full object-cover" />}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm text-slate-200">{f.first_name + ' ' + f.last_name}</span>
                                                {isAdded && <span className="text-[10px] text-green-500">{t('tournaments.setup.already_added', { defaultValue: 'Already added' })}</span>}
                                                {addParticipantMutation.isPending && !isAdded && <span className="text-[10px] text-yellow-500">{t('tournaments.setup.adding', { defaultValue: 'Adding...' })}</span>}
                                            </div>
                                        </button>
                                    );
                                })
                            ) : (
                                <div className="p-2 text-xs text-slate-500 text-center">{t('tournaments.setup.no_users', { defaultValue: 'No users found' })}</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Guest Input (Private Tournaments Only) */}
                {visibility === 'private' && (
                    <div className="mb-4 pt-4 border-t border-slate-700">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                            {t('tournaments.setup.add_guest', { defaultValue: 'Add Guest Player' })}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder={t('tournaments.setup.guest_name_placeholder', { defaultValue: 'Guest Name' })}
                                className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && guestName.trim() && !addParticipantMutation.isPending && addParticipantMutation.mutate({ firstName: guestName })}
                                disabled={addParticipantMutation.isPending}
                            />
                            <button
                                disabled={!guestName.trim() || addParticipantMutation.isPending}
                                onClick={() => addParticipantMutation.mutate({ firstName: guestName })}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors"
                            >
                                {addParticipantMutation.isPending ? t('tournaments.setup.adding', { defaultValue: 'Adding...' }) : t('add', { defaultValue: 'Add' })}
                            </button>
                        </div>
                    </div>
                )}

                {/* List */}
                <div className="space-y-2">
                    {participants.map((p: any) => (
                        <div key={p.id} className="flex justify-between items-center bg-slate-900/40 p-3 rounded-lg border border-slate-700/50">
                            <span className="font-medium text-slate-200">{p.display_name}</span>
                            <button
                                onClick={() => removeParticipantMutation.mutate(p.id)}
                                className="text-slate-500 hover:text-red-500 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    ))}
                    {participants.length === 0 && (
                        <div className="text-center py-4 text-slate-500 text-sm italic">
                            {t('tournaments.setup.add_players', { defaultValue: 'Add players to start' })}
                        </div>
                    )}
                </div>


            </div>

            {/* Tournament Settings Card */}
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 space-y-5">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">{t('tournaments.setup.settings', { defaultValue: 'Settings' })}</h3>

                {/* Tournament Mode */}
                <div className="space-y-3 pb-4 border-b border-slate-700">
                    <label className="text-sm font-medium text-slate-300 block mb-2">{t('tournaments.setup.tournament_mode', { defaultValue: 'Tournament Mode' })}</label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setMode('americano')}
                            className={`flex flex-col items-start justify-center p-4 rounded-xl border transition-all ${mode === 'americano' ? 'bg-green-500/20 border-green-500 text-green-400' : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                        >
                            <span className="text-sm font-bold mb-1">{t('tournaments.modes.americano', { defaultValue: 'Americano' })}</span>
                            <span className="text-[10px] text-slate-400 leading-tight">{t('tournaments.modes.americano_full', { defaultValue: 'Rotating partners. Play with everyone in the tournament.' })}</span>
                        </button>
                        <button
                            onClick={() => setMode('mexicano')}
                            className={`flex flex-col items-start justify-center p-4 rounded-xl border transition-all ${mode === 'mexicano' ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                        >
                            <span className="text-sm font-bold mb-1">{t('tournaments.modes.mexicano', { defaultValue: 'Mexicano' })}</span>
                            <span className="text-[10px] text-slate-400 leading-tight">{t('tournaments.modes.mexicano_full', { defaultValue: 'Performance-based pairing. Top scorers play together.' })}</span>
                        </button>
                    </div>
                    <div className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-lg">
                        {mode === 'americano'
                            ? t('tournaments.modes.americano_desc', { defaultValue: '🔄 Americano: Partners rotate each round so you play with every participant. Social and inclusive format.' })
                            : t('tournaments.modes.mexicano_desc', { defaultValue: '📊 Mexicano: Players are paired based on current rankings. Top performers face each other, creating competitive matches at all levels.' })}
                    </div>
                </div>

                {/* Visibility */}
                <div className="space-y-3 pb-4 border-b border-slate-700">
                    <label className="text-sm font-medium text-slate-300 block mb-2">{t('tournaments.setup.settings', { defaultValue: 'Visibility' })}</label>
                    <div className="grid grid-cols-3 gap-2">
                        <button
                            onClick={() => setVisibility('public')}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${visibility === 'public' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                        >
                            <Globe size={20} className="mb-1" />
                            <span className="text-xs font-bold">{t('tournaments.visibility.public', { defaultValue: 'Public' })}</span>
                            <span className="text-xs text-slate-400">{t('tournaments.visibility.public_desc', { defaultValue: 'Counts for ranking' })}</span>
                        </button>
                        <button
                            onClick={() => setVisibility('friends')}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${visibility === 'friends' ? 'bg-purple-500/20 border-purple-500 text-purple-400' : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:bg-slate-800'}`}

                        >
                            <Users size={20} className="mb-1" />
                            <span className="text-xs font-bold">{t('tournaments.visibility.friends', { defaultValue: 'Friends' })}</span>
                            <span className="text-xs text-slate-400">{t('tournaments.visibility.friends_desc', { defaultValue: 'Only friends can see it' })}</span>
                        </button>
                        <button
                            onClick={() => setVisibility('private')}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${visibility === 'private' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
                        >
                            <Lock size={20} className="mb-1" />
                            <span className="text-xs font-bold">{t('tournaments.visibility.private', { defaultValue: 'Private' })}</span>
                            <span className="text-xs text-slate-400">{t('tournaments.visibility.private_desc', { defaultValue: 'Only you can see it' })}</span>
                        </button>
                    </div>
                    <div className="text-xs text-red-400">{t('tournaments.visibility.public_note', { defaultValue: 'Only tournaments set as public will count towards the ranking.' })}</div>
                </div>

                {/* Points Per Match */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center mb-1">
                        <label className="text-sm font-medium text-slate-300">{t('tournaments.setup.points_per_match', { defaultValue: 'Points per Match' })}</label>
                        <span className="text-sm font-bold text-green-400 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded-lg">{pointsPerMatch} pts</span>
                    </div>
                    <div className="relative">
                        <input
                            type="range"
                            min="16"
                            max="48"
                            step="4"
                            value={pointsPerMatch}
                            onChange={(e) => setPointsPerMatch(Number(e.target.value))}
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                        />
                        <div className="relative text-[10px] text-slate-500 font-mono font-medium mt-2 h-6">
                            <span className="absolute left-0">16</span>
                            <span className="absolute left-[25%] -translate-x-1/2 text-center">24<br />({t('tournaments.setup.standard', { defaultValue: 'Standard' })})</span>
                            <span className="absolute left-[50%] -translate-x-1/2 text-center">32<br />({t('tournaments.setup.long', { defaultValue: 'Long' })})</span>
                            <span className="absolute right-0">48</span>
                        </div>
                    </div>
                </div>

                {/* Court Names */}
                {participants.length >= 4 && (
                    <div className="border-t border-slate-700 pt-4">
                        <label className="text-sm font-medium text-slate-300 block mb-3">{t('tournaments.setup.court_names', { defaultValue: 'Court Names' })}</label>
                        <div className="grid gap-3">
                            {Array.from({ length: Math.floor(participants.length / 4) }).map((_, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-500 w-16 uppercase tracking-wider">Court {i + 1}</span>
                                    <input
                                        type="text"
                                        placeholder={`e.g. Center Court`}
                                        className="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-green-500 outline-none transition-colors"
                                        value={courtNames[i] || ''}
                                        onChange={(e) => {
                                            const newNames = [...courtNames];
                                            newNames[i] = e.target.value;
                                            setCourtNames(newNames);
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Time Estimate */}
                <div className="border-t border-slate-700 pt-4 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-300">{t('tournaments.setup.estimated_duration', { defaultValue: 'Est. Duration' })}</span>
                        <span className="text-xs text-slate-500">{t('tournaments.setup.based_on_players', { count: participants.length, defaultValue: 'Based on {{count}} players' })}</span>
                    </div>
                    <div className="text-right">
                        <span className="text-xl font-bold text-white block leading-none">
                            {Math.floor(getEstimatedTime(participants.length, pointsPerMatch) / 60)}h {getEstimatedTime(participants.length, pointsPerMatch) % 60}m
                        </span>
                    </div>
                </div>

            </div>

            {/* Start Button */}
            <button
                onClick={handleStart}
                disabled={participants.length < 4}
                className="w-full py-4 bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold rounded-xl shadow-lg shadow-green-500/20 active:scale-95 transition-all text-lg tracking-tight hover:bg-green-400"
            >
                {t('tournaments.setup.start_tournament', { defaultValue: 'Start Tournament' })}
            </button>
        </div>
    );

}
