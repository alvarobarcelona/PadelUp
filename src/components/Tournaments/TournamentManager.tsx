import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Trophy, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getFriends } from '../../lib/friends';

import Setup from './Setup';
import TournamentPlay from './TournamentPlay';
import TournamentResults from './TournamentResults';

export default function TournamentManager() {
    const { id } = useParams();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [currentMode, setCurrentMode] = useState<'americano' | 'mexicano' | null>(null);
    const [hasAccess, setHasAccess] = useState<boolean | null>(null);

    const { data: tournament, isLoading } = useQuery({
        queryKey: ['tournament', id],
        queryFn: async () => {
            const { data: tournamentData, error } = await supabase
                .from('tournaments')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            // Fetch creator profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', tournamentData.created_by)
                .single();
            return {
                ...tournamentData,
                creator_username: profile?.username
            };
        },
        enabled: !!id
    });

    useEffect(() => {
        if (!tournament) return;

        const checkAccess = async () => {
            const { data: { user } } = await supabase.auth.getUser();

            // 1. Check if tournament is in setup status - only creator and admin can access
            if (tournament.status === 'setup') {
                if (!user) {
                    setHasAccess(false);
                    return;
                }

                // Check if user is admin
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('is_admin')
                    .eq('id', user.id)
                    .single();

                if (profile?.is_admin || tournament.created_by === user.id) {
                    setHasAccess(true);
                } else {
                    setHasAccess(false);
                }
                return;
            }

            // 2. Not logged in
            if (!user) {
                setHasAccess(tournament.visibility === 'public');
                return;
            }

            // 3. Admin (Global access)
            const { data: profile } = await supabase
                .from('profiles')
                .select('is_admin')
                .eq('id', user.id)
                .single();

            if (profile?.is_admin) {
                setHasAccess(true);
                return;
            }

            // 4. Creator (Owner access)
            if (tournament.created_by === user.id) {
                setHasAccess(true);
                return;
            }

            // 5. Visibility Rules
            if (tournament.visibility === 'public') {
                setHasAccess(true);
            } else if (tournament.visibility === 'friends') {
                // Check if friend of creator
                const { data: creatorFriends } = await getFriends(tournament.created_by);
                const isFriend = creatorFriends?.includes(user.id) || false;

                // OR Participant
                const { data: participants } = await supabase
                    .from('tournament_participants')
                    .select('player_id')
                    .eq('tournament_id', tournament.id)
                    .eq('player_id', user.id);

                const isParticipant = participants && participants.length > 0;
                setHasAccess(isFriend || isParticipant);
            } else if (tournament.visibility === 'private') {
                // Only Participants can view
                const { data: participants } = await supabase
                    .from('tournament_participants')
                    .select('player_id')
                    .eq('tournament_id', tournament.id)
                    .eq('player_id', user.id);

                setHasAccess(participants && participants.length > 0);
            } else {
                setHasAccess(false);
            }
        };

        checkAccess();
    }, [tournament]);

    if (isLoading) {
        return <div className="text-center py-20 text-slate-500 animate-pulse">{t("tournaments.loading")}</div>;
    }

    if (!tournament) {
        return <div className="text-center py-20 text-red-500">{t("tournaments.notFound")}</div>;
    }

    if (hasAccess === false) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
                <div className="bg-slate-800 p-6 rounded-full">
                    <Lock className="text-slate-400" size={48} />
                </div>
                <div className="text-center">
                    <h2 className="text-xl font-bold text-white mb-2">
                        {t('tournaments.results.access_denied_title', { defaultValue: 'Access Denied' })}
                    </h2>
                    <p className="text-slate-400 text-sm">
                        {t('tournaments.results.access_denied_message', { defaultValue: 'You do not have permission to view this tournament.' })}
                    </p>
                    <button
                        onClick={() => navigate('/')}
                        className="mt-6 px-6 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-400 transition-colors"
                    >
                        {t('common.go_home', { defaultValue: 'Go Home' })}
                    </button>
                </div>
            </div>
        );
    }

    if (hasAccess === null) {
        return <div className="text-center py-20 text-slate-500 animate-pulse">{t("tournaments.loading")}</div>;
    }

    const displayMode = currentMode || tournament.mode;
    const modeDescription = displayMode === 'americano'
        ? `🔄 ${t('tournaments.modes.americano_short', { defaultValue: 'Rotating partners' })}`
        : `📊 ${t('tournaments.modes.mexicano_short', { defaultValue: 'Performance-based' })}`;

    return (
        <div className="pb-20 animate-fade-in relative min-h-screen">
            <header className="mb-6 sticky top-0 bg-slate-900/90 backdrop-blur-md z-20 py-4 -mx-4 px-4 border-b border-slate-800/50">
                <div className="flex items-center gap-3">

                    <div>
                        <button onClick={() => {
                            if (tournament?.visibility) {
                                navigate(`/tournaments?tab=${tournament.visibility}`);
                            } else {
                                navigate(-1);
                            }
                        }}>
                            <ChevronLeft size={20} className="text-white" />
                        </button>
                    </div>
                    <div className="bg-yellow-500/20 p-2 rounded-lg">
                        <Trophy size={20} className="text-yellow-500" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white leading-tight">{tournament.name}</h1>
                        <p className="text-xs text-slate-400 capitalize bg-slate-800 px-2 py-0.5 rounded-full inline-block mt-1">
                            {displayMode} {tournament.status === 'setup' && `• ${modeDescription}`} {tournament.status !== 'setup' && `• ${t(`tournaments.status.${tournament.status}`, { defaultValue: tournament.status })}`}
                        </p>
                    </div>
                    {tournament.status === 'playing' && <span className="ml-auto text-xs text-slate-400">{t('tournaments.created_by')} {tournament.creator_username}</span>}
                </div>
            </header>

            {tournament.status === 'setup' && <Setup tournament={tournament} onModeChange={setCurrentMode} />}
            {tournament.status === 'playing' && <TournamentPlay tournament={tournament} />}
            {(tournament.status === 'completed' || tournament.status === 'pending_verification' || tournament.status === 'rejected') && <TournamentResults tournament={tournament} />}
        </div>
    );
}
