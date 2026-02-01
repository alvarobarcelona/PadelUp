
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useModal } from '../../context/ModalContext';

interface SuspiciousUser {
    player_id: string;
    username: string;
    avatar_url: string | null;
    elo: number;
    total_matches: number;
    total_wins: number;
    win_rate: number;
    unique_opponents: number;
    diversity_score: number;
    suspicion_level: 'CRITICAL' | 'HIGH' | 'MODERATE';
}

const SuspiciousUsers = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { confirm, alert } = useModal();
    const [users, setUsers] = useState<SuspiciousUser[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSuspiciousUsers();
    }, []);

    const fetchSuspiciousUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_suspicious_activity_report');

            if (error) throw error;
            setUsers(data || []);
        } catch (error: any) {
            console.error('Error fetching suspicious users:', error);
            await alert({
                title: t('common.error'),
                message: error.message || 'Failed to load report',
                type: 'danger'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleBanUser = async (user: SuspiciousUser) => {
        const isConfirmed = await confirm({
            title: t('admin.ban_user_title') || 'Ban User',
            message: `Are you sure you want to ban ${user.username}? This action will prevent them from logging in.`,
            type: 'danger',
            confirmText: 'Ban User',
            cancelText: t('common.cancel')
        });

        if (!isConfirmed) return;

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ banned: true })
                .eq('id', user.player_id);

            if (error) throw error;

            await alert({
                title: t('common.success'),
                message: `User ${user.username} has been banned.`,
                type: 'success'
            });
            fetchSuspiciousUsers(); // Refresh list
        } catch (error: any) {
            console.error('Error banning user:', error);
            await alert({
                title: t('common.error'),
                message: error.message,
                type: 'danger'
            });
        }
    };

    const getSuspicionColor = (level: string) => {
        switch (level) {
            case 'CRITICAL': return 'text-red-500 bg-red-500/10 border-red-500/20';
            case 'HIGH': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
            default: return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            <header className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
                    <ArrowLeft size={24} />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ShieldAlert className="text-red-500" />
                        {t('admin.suspicious_activity') || 'Suspicious Activity'}
                    </h1>
                    <p className="text-sm text-slate-400">
                        {t('admin.suspicious_desc') || 'Users with high win rates and low opponent diversity.'}
                    </p>
                </div>
            </header>

            {loading ? (
                <div className="text-center py-10 text-slate-500">Loading analysis...</div>
            ) : users.length === 0 ? (
                <div className="text-center py-20 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
                    <ShieldAlert size={48} className="mx-auto text-green-500 mb-4 opacity-50" />
                    <h3 className="text-lg font-medium text-white">No suspicious activity detected</h3>
                    <p className="text-slate-500 text-sm mt-1">All players seem to be behaving normally.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {users.map((user) => (
                        <div key={user.player_id} className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Avatar src={user.avatar_url || undefined} fallback={user.username} size="lg" />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-white text-lg">{user.username}</h3>
                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${getSuspicionColor(user.suspicion_level)}`}>
                                            {user.suspicion_level}
                                        </span>
                                    </div>
                                    <div className="flex gap-4 mt-2 text-xs text-slate-400">
                                        <div>
                                            <span className="block font-bold text-white">{user.win_rate}%</span>
                                            <span>Win Rate</span>
                                        </div>
                                        <div>
                                            <span className="block font-bold text-white">{user.total_wins} / {user.total_matches}</span>
                                            <span>Wins</span>
                                        </div>
                                        <div>
                                            <span className="block font-bold text-white text-red-400">{user.unique_opponents}</span>
                                            <span>Unique Rivals</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 w-full md:w-auto">
                                <Button
                                    className="flex-1 md:flex-none gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20"
                                    size="sm"
                                    onClick={() => handleBanUser(user)}
                                >
                                    <Ban size={16} />
                                    Ban User
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SuspiciousUsers;
