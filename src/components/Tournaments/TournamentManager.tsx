
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Trophy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

import Setup from './Setup';
import TournamentPlay from './TournamentPlay';
import TournamentResults from './TournamentResults';

export default function TournamentManager() {
    const { id } = useParams();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [currentMode, setCurrentMode] = useState<'americano' | 'mexicano' | null>(null);

    const { data: tournament, isLoading } = useQuery({
        queryKey: ['tournament', id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('tournaments')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: !!id
    });

    if (isLoading) {
        return <div className="text-center py-20 text-slate-500 animate-pulse">{t("tournaments.loading")}</div>;
    }

    if (!tournament) {
        return <div className="text-center py-20 text-red-500">{t("tournaments.notFound")}</div>;
    }

    const displayMode = currentMode || tournament.mode;
    const modeDescription = displayMode === 'americano'
        ? `🔄 ${t('tournaments.modes.americano_short', { defaultValue: 'Rotating partners' })}`
        : `📊 ${t('tournaments.modes.mexicano_short', { defaultValue: 'Performance-based' })}`;

    return (
        <div className="pb-20 animate-fade-in relative min-h-screen">
            <header className="mb-6 sticky top-0 bg-slate-900/90 backdrop-blur-md z-10 py-4 -mx-4 px-4 border-b border-slate-800/50">
                <div className="flex items-center gap-3">

                    <div><button onClick={() => navigate(-1)}><ChevronLeft size={20} className="text-white" /></button></div>
                    <div className="bg-yellow-500/20 p-2 rounded-lg">
                        <Trophy size={20} className="text-yellow-500" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white leading-tight">{tournament.name}</h1>
                        <p className="text-xs text-slate-400 capitalize bg-slate-800 px-2 py-0.5 rounded-full inline-block mt-1">
                            {displayMode} {tournament.status === 'setup' && `• ${modeDescription}`} {tournament.status !== 'setup' && `• ${t(`tournaments.status.${tournament.status}`, { defaultValue: tournament.status })}`}
                        </p>
                    </div>

                </div>
            </header>

            {tournament.status === 'setup' && <Setup tournament={tournament} onModeChange={setCurrentMode} />}
            {tournament.status === 'playing' && <TournamentPlay tournament={tournament} />}
            {tournament.status === 'completed' && <TournamentResults tournament={tournament} />}
        </div>
    );
}
