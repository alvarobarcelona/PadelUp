import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Camera, Settings, LogOut, BarChart3, Medal, Trophy, Loader2, ShieldCheck, Flame, Swords, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLevelFromElo } from '../lib/elo';
import { checkAchievements } from '../lib/achievements';
import { useNavigate } from 'react-router-dom';
import { AchievementModal } from '../components/Modals/AchievementModal';
import { APP_FULL_VERSION } from '../lib/constants';
import { useTranslation } from 'react-i18next';
import { useModal } from '../context/ModalContext';

const iconMap: Record<string, any> = {
    'Trophy': Trophy,
    'Medal': Medal,
    'Flame': Flame,
    'Camera': Camera,
    'Sword': Swords
};

const Profile = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { alert } = useModal();
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [allAchievements, setAllAchievements] = useState<any[]>([]);
    const [userAchievementIds, setUserAchievementIds] = useState<Set<string>>(new Set());
    const [selectedAchievement, setSelectedAchievement] = useState<any | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const currentYear = new Date().getFullYear();

    // Data Strings
    const [profile, setProfile] = useState<{
        id: string;
        username: string;
        email: string;
        elo: number;
        avatar_url: string | null;
        is_admin?: boolean;
    } | null>(null);

    const [allMatches, setAllMatches] = useState<any[]>([]);
    const [years, setYears] = useState<number[]>([]);
    const [selectedYear, setSelectedYear] = useState<number | 'all'>('all');

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            setLoading(true);
            const { data: { user: authUser } } = await supabase.auth.getUser();

            if (!authUser) {
                navigate('/auth');
                return;
            }

            // 1. Fetch Profile
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', authUser.id)
                .single();

            if (profileError) throw profileError;

            setProfile({
                id: profileData.id,
                username: profileData.username,
                email: authUser.email || '',
                elo: profileData.elo,
                avatar_url: profileData.avatar_url,
                is_admin: profileData.is_admin
            });

            // 2. Achievements
            await checkAchievements(profileData.id);
            const { data: myAchievements } = await supabase
                .from('user_achievements')
                .select('achievement_id')
                .eq('user_id', profileData.id);

            const unlockedIds = new Set(myAchievements?.map((ua: any) => ua.achievement_id) || []);
            setUserAchievementIds(unlockedIds);

            const { data: availableAchievements } = await supabase
                .from('achievements')
                .select('*')
                .order('point_value', { ascending: true });

            setAllAchievements(availableAchievements || []);

            // 3. Fetch Matches
            const { data: matches } = await supabase
                .from('matches')
                .select('winner_team, team1_p1, team1_p2, team2_p1, team2_p2, created_at, score, elo_snapshot')
                .or(`team1_p1.eq.${profileData.id},team1_p2.eq.${profileData.id},team2_p1.eq.${profileData.id},team2_p2.eq.${profileData.id}`)
                .eq('status', 'confirmed')
                .order('created_at', { ascending: false }); // Newest first

            if (matches) {
                setAllMatches(matches);
                // Extract unique years
                const uniqueYears = Array.from(new Set(matches.map(m => new Date(m.created_at).getFullYear()))).sort((a, b) => b - a);
                setYears(uniqueYears);
            }

        } catch (error) {
            console.error('Error loading profile:', error);
        } finally {
            setLoading(false);
        }
    };

    // Derived Stats with Memoization
    const stats = useMemo(() => {
        if (!profile) return null;

        // Default empty stats
        const defaultStats = {
            matchesPlayed: 0,
            winRate: 0,
            wins: 0,
            losses: 0,
            setsWon: 0,
            gamesWon: 0,
            eloHistory: [] as any[],
            bestStreak: 0
        };

        if (allMatches.length === 0) return defaultStats;

        // 1. Calculate Full ELO History (Chronological) for ALL matches to generate accurate curve
        const chronological = [...allMatches].reverse();
        let simulatedElo = 1150;
        const fullEloHistory: { elo: number, delta: number, date: string, id: string }[] = [];

        chronological.forEach(m => {
            const isTeam1 = m.team1_p1 === profile.id || m.team1_p2 === profile.id;
            const won = (isTeam1 && m.winner_team === 1) || (!isTeam1 && m.winner_team === 2);

            let delta = 0;
            let newElo = simulatedElo;

            if (m.elo_snapshot && typeof m.elo_snapshot === 'object') {
                let myKey = '';
                if (m.team1_p1 === profile.id) myKey = 't1p1';
                else if (m.team1_p2 === profile.id) myKey = 't1p2';
                else if (m.team2_p1 === profile.id) myKey = 't2p1';
                else if (m.team2_p2 === profile.id) myKey = 't2p2';

                if (myKey && m.elo_snapshot[myKey]) {
                    newElo = m.elo_snapshot[myKey];
                    // Re-align delta
                    delta = newElo - simulatedElo;
                } else {
                    delta = won ? 16 : -16;
                    newElo = simulatedElo + delta;
                }
            } else {
                delta = won ? 15 : -15;
                newElo = simulatedElo + delta;
            }

            fullEloHistory.push({ elo: newElo, delta, date: m.created_at, id: m.id });
            simulatedElo = newElo;
        });

        // 2. Filter Matches based on Selection
        let filteredMatches = allMatches;
        let filteredEloHistory = fullEloHistory;

        if (selectedYear !== 'all') {
            filteredMatches = allMatches.filter(m => new Date(m.created_at).getFullYear() === selectedYear);
            filteredEloHistory = fullEloHistory.filter(h => new Date(h.date).getFullYear() === selectedYear);
        }

        // 3. Compute Stats for Filtered Selection
        let wins = 0;
        let losses = 0;
        let bestStreak = 0;
        let tempStreak = 0;
        let totalSetsWon = 0;
        let totalGamesWon = 0;

        // Calculate stats on the filtered set (Newest -> Oldest for structure, but Streak usually calc'd chronologically or reverse-check)
        // Let's iterate Filtered Reverse (Chronological) for stats like Streak
        const filteredChronological = [...filteredMatches].reverse();

        filteredChronological.forEach(m => {
            const isTeam1 = m.team1_p1 === profile.id || m.team1_p2 === profile.id;
            const won = (isTeam1 && m.winner_team === 1) || (!isTeam1 && m.winner_team === 2);

            if (won) {
                wins++;
                tempStreak++;
            } else {
                losses++;
                tempStreak = 0;
            }
            if (tempStreak > bestStreak) bestStreak = tempStreak;

            if (m.score && Array.isArray(m.score)) {
                m.score.forEach((set: { t1: number, t2: number }) => {
                    const myScore = isTeam1 ? set.t1 : set.t2;
                    const oppScore = isTeam1 ? set.t2 : set.t1;
                    totalGamesWon += myScore;
                    if (myScore > oppScore) totalSetsWon++;
                });
            }
        });

        const totalMatchesCount = filteredMatches.length;
        const winRate = totalMatchesCount > 0 ? Math.round((wins / totalMatchesCount) * 100) : 0;

        return {
            matchesPlayed: totalMatchesCount,
            winRate,
            wins,
            losses,
            setsWon: totalSetsWon,
            gamesWon: totalGamesWon,
            eloHistory: filteredEloHistory,
            bestStreak // Note: 'Current Streak' is tricky in historical view. Let's just show Best Streak for that period.
        };

    }, [profile, allMatches, selectedYear]);

    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            if (!event.target.files || event.target.files.length === 0) return;
            if (!profile) return;

            setUploading(true);
            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${profile.id}/${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', profile.id);

            if (updateError) throw updateError;

            setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : null);

        } catch (error) {
            console.error('Error uploading avatar:', error);
            await alert({
                title: 'Error',
                message: t('profile.upload_error'),
                type: 'danger'
            });
        } finally {
            setUploading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/auth');
    };

    const renderMatchGraph = (history: { elo: number, delta: number }[]) => {
        const height = 150;
        const width = 300;
        const padding = { top: 20, right: 20, bottom: 20, left: 30 };

        if (!history || history.length < 2) {
            return (
                <div className="h-[120px] flex items-center justify-center text-xs text-slate-500 italic bg-slate-900/40 rounded-lg border border-slate-700/30">
                    {history.length === 0 ? "No matches in this period" : "Not enough data for graph"}
                </div>
            );
        }

        // For Year View: Show ALL matches in that year (or last 30 if too many?)
        // If 'All Time', stick to last 20.
        // Let's try flexible slicing.
        let displayHistory = history;
        if (selectedYear === 'all' && history.length > 20) {
            displayHistory = history.slice(-20);
        }

        const elos = displayHistory.map(h => h.elo);
        let minElo = Math.min(...elos);
        let maxElo = Math.max(...elos);
        const paddingRange = 20;
        minElo -= paddingRange;
        maxElo += paddingRange;
        const range = maxElo - minElo;

        const graphWidth = width - padding.left - padding.right;
        const graphHeight = height - padding.top - padding.bottom;
        const stepX = graphWidth / (Math.max(1, displayHistory.length - 1));

        const getY = (val: number) => {
            const normalized = (val - minElo) / range;
            return padding.top + graphHeight - (normalized * graphHeight);
        };
        const getX = (index: number) => padding.left + (index * stepX);

        const pathData = displayHistory.map((p, i) =>
            `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.elo)}`
        ).join(' ');

        const areaPath = `
            ${pathData} 
            L ${getX(displayHistory.length - 1)} ${padding.top + graphHeight} 
            L ${padding.left} ${padding.top + graphHeight} 
            Z
        `;

        return (
            <div className="w-full h-[150px] select-none">
                <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible text-xs">
                    <defs>
                        <linearGradient id="graphGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {[minElo, (minElo + maxElo) / 2, maxElo].map((tick, i) => (
                        <g key={i}>
                            <line x1={padding.left} y1={getY(tick)} x2={width - padding.right} y2={getY(tick)} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />
                            {i !== 1 && (
                                <text x={padding.left - 5} y={getY(tick)} fill="#64748b" fontSize="8" textAnchor="end" alignmentBaseline="middle">{Math.round(tick)}</text>
                            )}
                        </g>
                    ))}

                    <path d={areaPath} fill="url(#graphGradient)" stroke="none" />
                    <path d={pathData} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                    {displayHistory.map((p, i) => (
                        <g key={i} className="group">
                            <text x={getX(i)} y={getY(p.elo) + (p.delta > 0 ? -12 : 18)} fill={p.delta > 0 ? "#4ade80" : "#f87171"} fontSize="9" fontWeight="bold" textAnchor="middle" className="opacity-80 group-hover:opacity-100 transition-opacity">
                                {p.delta > 0 ? '+' : ''}{Math.round(p.delta)}
                            </text>
                            <circle cx={getX(i)} cy={getY(p.elo)} r="3" className={`${p.delta > 0 ? "fill-green-400" : "fill-red-400"} hover:fill-white transition-colors`} stroke="#0f172a" strokeWidth="1.5" />
                        </g>
                    ))}

                    {/* X Axis Labels */}
                    <text x={padding.left} y={height + 5} fill="#64748b" fontSize="9" textAnchor="start">
                        {selectedYear === 'all' ? `${displayHistory.length} matches ago` : 'Jan'}
                    </text>
                    <text x={width - padding.right} y={height + 5} fill="#64748b" fontSize="9" textAnchor="end">
                        {selectedYear === 'all' ? 'Now' : 'Dec'}
                    </text>
                </svg>
            </div>
        );
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-green-500" /></div>;
    if (!profile) return <div className="text-center p-10 text-slate-400">{t('profile.not_found')}</div>;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* Header */}
            <header className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">{t('profile.title')}</h1>
                <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
                    <Settings size={22} className="text-slate-400" />
                </Button>
            </header>

            {/* Profile Header */}
            <div className="flex flex-col items-center space-y-4 rounded-2xl bg-slate-800 p-6 shadow-lg">
                <div className="relative">
                    <Avatar fallback={profile.username} src={profile.avatar_url} size="xl" className="h-24 w-24 border-4 border-slate-700 shadow-xl" />

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="absolute bottom-0 right-0 rounded-full bg-green-500 p-2 text-slate-900 shadow-md hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleAvatarUpload} className="hidden" accept="image/*" />
                </div>
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
                        {profile.username}
                        {profile.is_admin && (
                            <span title="Admin" className="flex items-center">
                                <ShieldCheck size={18} className="text-blue-400" />
                            </span>
                        )}
                    </h2>
                    <p className="text-sm font-medium text-slate-400">{profile.email}</p>
                </div>
                <div className="rounded-full bg-slate-700/50 px-4 py-1.5 text-sm font-bold border border-green-500/20 text-white flex items-center gap-2">
                    <span className="text-green-400">{t('profile.level')} {getLevelFromElo(profile.elo).level}</span>
                    <span className="text-slate-500">|</span>
                    <span className="text-slate-300">{t(`levels.names.${getLevelFromElo(profile.elo).key}`)}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                    ELO: {profile.elo}
                </div>
            </div>

            {/* Admin Button */}
            {profile.is_admin && (
                <Button
                    variant="outline"
                    className="w-full border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 gap-2"
                    onClick={() => navigate('/admin')}
                >
                    <ShieldCheck size={18} />
                    {t('profile.admin_console')}
                </Button>
            )}

            {/* Stats Filter */}
            {years.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    <button
                        onClick={() => setSelectedYear('all')}
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${selectedYear === 'all'
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                            }`}
                    >
                        {t('profile.full_stats')}
                    </button>
                    {years.map(year => (
                        <button
                            key={year}
                            onClick={() => setSelectedYear(year)}
                            className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors border ${selectedYear === year
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                }`}
                        >
                            {year}
                        </button>
                    ))}
                </div>
            )}

            {/* Stats Grid */}
            {stats && (
                <div className="grid grid-cols-2 gap-4">
                    {/* Win Rate */}
                    <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                        <div className="flex items-center gap-2 text-slate-400 mb-2">
                            <BarChart3 size={18} />
                            <span className="text-xs font-semibold uppercase tracking-wider">{t('profile.win_rate')}</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats.winRate}%</p>
                        <p className="text-xs text-slate-500 mt-1">{t('profile.average')}</p>
                    </div>
                    {/* Total Matches */}
                    <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                        <div className="flex items-center gap-2 text-slate-400 mb-2">
                            <Medal size={18} />
                            <span className="text-xs font-semibold uppercase tracking-wider">{t('profile.matches')}</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats.matchesPlayed}</p>
                        <p className="text-xs text-slate-500 mt-1">{t('profile.played')}</p>
                    </div>

                    {/* Matches Won / Lost */}
                    <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-10">
                            <Trophy size={48} className="text-green-500" />
                        </div>
                        <div className="flex items-center gap-2 text-green-400 mb-2">
                            <span className="text-xs font-semibold uppercase tracking-wider">{t('profile.won')}</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats.wins}</p>
                        <p className="text-xs text-slate-500 mt-1">{t('profile.matches')}</p>
                    </div>
                    <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-10">
                            <X size={48} className="text-red-500" />
                        </div>
                        <div className="flex items-center gap-2 text-red-400 mb-2">
                            <span className="text-xs font-semibold uppercase tracking-wider">{t('profile.lost')}</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats.losses}</p>
                        <p className="text-xs text-slate-500 mt-1">{t('profile.matches')}</p>
                    </div>

                    {/* Sets & Games */}
                    <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                        <div className="flex items-center gap-2 text-blue-400 mb-2">
                            <Swords size={18} />
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('profile.sets')}</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats.setsWon}</p>
                        <p className="text-xs text-slate-500 mt-1">{t('profile.sets_won')}</p>
                    </div>
                    <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                        <div className="flex items-center gap-2 text-purple-400 mb-2">
                            <div className="h-4 w-4 bg-purple-500 rounded-full opacity-60"></div>
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('profile.games')}</span>
                        </div>
                        <p className="text-3xl font-bold text-white">{stats.gamesWon}</p>
                        <p className="text-xs text-slate-500 mt-1">{t('profile.games_won')}</p>
                    </div>
                </div>
            )}

            {/* MATCH JOURNEY GRAPH */}
            <div className="rounded-xl bg-slate-800/80 p-5 border border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                        <BarChart3 size={16} />
                        {t('profile.performance_trend')}
                    </h3>
                    <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                        {selectedYear === 'all' ? t('profile.last_20') : t('profile.year', { year: selectedYear })}
                    </span>
                </div>

                {stats && renderMatchGraph(stats.eloHistory)}
            </div>

            {/* Achievements */}
            <div className="rounded-xl bg-slate-800 p-5 border border-slate-700/50">
                <h3 className="mb-4 text-sm font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                    {t('profile.achievements')} <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full text-slate-300">{userAchievementIds.size} / {allAchievements.length}</span>
                    <span className="text-xs bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                        {allAchievements.filter(a => userAchievementIds.has(a.id)).reduce((acc, curr) => acc + (curr.point_value || 0), 0)} pts / {allAchievements.reduce((acc, curr) => acc + (curr.point_value || 0), 0)} pts
                    </span>
                </h3>

                {allAchievements.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-sm">
                        <p>{t('profile.no_achievements')}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-4 gap-4 overflow-x-auto pb-4 no-scrollbar">
                        {allAchievements
                            .sort((a, b) => {
                                const aOwned = userAchievementIds.has(a.id);
                                const bOwned = userAchievementIds.has(b.id);
                                if (aOwned && !bOwned) return -1;
                                if (!aOwned && bOwned) return 1;
                                return 0;
                            })
                            .map((badge: any) => {
                                const isUnlocked = userAchievementIds.has(badge.id);
                                const Icon = iconMap[badge.icon] || Trophy;

                                return (
                                    <button
                                        key={badge.id}
                                        onClick={() => setSelectedAchievement(badge)}
                                        className={`flex flex-col items-center flex-shrink-0 space-y-2 w-20 transition-all hover:scale-105 active:scale-95 ${isUnlocked ? '' : 'opacity-40 grayscale'}`}
                                    >
                                        <div className={`h-14 w-14 rounded-full p-[2px] shadow-lg ${isUnlocked ? 'bg-gradient-to-br from-yellow-400/20 to-orange-500/20 shadow-orange-500/10' : 'bg-slate-700/50 shadow-none'}`}>
                                            <div className={`flex h-full w-full items-center justify-center rounded-full border-2 ${isUnlocked ? 'bg-slate-800 border-slate-700' : 'bg-slate-800/50 border-slate-700/50'}`}>
                                                <Icon size={24} className={isUnlocked ? "text-yellow-500" : "text-slate-500"} />
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-300 text-center leading-tight line-clamp-2 min-h-[2.5em] flex items-center justify-center">{badge.name}</span>
                                    </button>
                                );
                            })}
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="pt-4">
                <Button variant="danger" className="w-full gap-2" onClick={handleLogout}>
                    <LogOut size={18} />
                    {t('profile.sign_out')}
                </Button>
            </div>
            <div className="text-center pt-4">
                <p className="text-xs text-slate-500">{APP_FULL_VERSION}</p>
                <p className="text-[10px] text-slate-500 mt-1">{t('profile.built_with')}</p>
                <p className="text-[10px] text-slate-500 mt-1">{t('profile.by_author', { year: currentYear })}</p>
            </div>

            <AchievementModal
                isOpen={!!selectedAchievement}
                onClose={() => setSelectedAchievement(null)}
                achievement={selectedAchievement}
                isUnlocked={selectedAchievement ? userAchievementIds.has(selectedAchievement.id) : false}
            />
        </div>
    );
};

export default Profile;
