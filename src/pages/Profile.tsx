
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Camera, Settings, LogOut, BarChart3, Medal, Trophy, Loader2, ShieldCheck, Flame, Swords, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLevelFromElo } from '../lib/elo';
import { checkAchievements } from '../lib/achievements';
import { useNavigate } from 'react-router-dom';
import { AchievementModal } from '../components/AchievementModal';

const iconMap: Record<string, any> = {
    'Trophy': Trophy,
    'Medal': Medal,
    'Flame': Flame,
    'Camera': Camera,
    'Sword': Swords
};

const Profile = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [allAchievements, setAllAchievements] = useState<any[]>([]);
    const [userAchievementIds, setUserAchievementIds] = useState<Set<string>>(new Set());
    const [selectedAchievement, setSelectedAchievement] = useState<any | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [user, setUser] = useState<{
        id: string;
        username: string;
        email: string;
        elo: number;
        avatar_url: string | null;
        matchesPlayed: number;
        winRate: number;
        wins: number;
        losses: number;
        currentStreak: number;
        bestStreak: number;
        setsWon: number;
        gamesWon: number;
        matchHistory: number[]; // Array of result: 1 for win, -1 for loss
        is_admin?: boolean;
    } | null>(null);

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

            // Fetch Profile Data
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', authUser.id)
                .single();

            if (profileError) throw profileError;

            // Check & Fetch Achievements
            await checkAchievements(profileData.id);

            // 1. Fetch user's unlocked achievement IDs
            const { data: myAchievements } = await supabase
                .from('user_achievements')
                .select('achievement_id')
                .eq('user_id', profileData.id);

            const unlockedIds = new Set(myAchievements?.map((ua: any) => ua.achievement_id) || []);
            setUserAchievementIds(unlockedIds);

            // 2. Fetch ALL available achievements
            const { data: availableAchievements } = await supabase
                .from('achievements')
                .select('*')
                .order('point_value', { ascending: true });

            setAllAchievements(availableAchievements || []);

            // Calculate Stats
            const { data: matches } = await supabase
                .from('matches')
                .select('winner_team, team1_p1, team1_p2, team2_p1, team2_p2, created_at, score')
                .or(`team1_p1.eq.${profileData.id},team1_p2.eq.${profileData.id},team2_p1.eq.${profileData.id},team2_p2.eq.${profileData.id}`)
                .eq('status', 'confirmed')
                .order('created_at', { ascending: false }); // Newest first

            let wins = 0;
            let losses = 0;
            let currentStreak = 0;
            let bestStreak = 0;
            let tempStreak = 0;
            let totalSetsWon = 0;
            let totalGamesWon = 0;
            const matchHistory: number[] = [];

            if (matches) {
                // Calculate Current Streak (Newest -> Oldest)
                for (const m of matches) {
                    const isTeam1 = m.team1_p1 === profileData.id || m.team1_p2 === profileData.id;
                    const won = (isTeam1 && m.winner_team === 1) || (!isTeam1 && m.winner_team === 2);

                    if (won) {
                        currentStreak++;
                    } else {
                        break; // Streak broken
                    }
                }

                // Calculate Best Streak, Total Wins/Losses, Sets & Games
                // Iterate Oldest -> Newest (Chronological) for graph building
                const chronological = [...matches].reverse();

                chronological.forEach(m => {
                    const isTeam1 = m.team1_p1 === profileData.id || m.team1_p2 === profileData.id;
                    const won = (isTeam1 && m.winner_team === 1) || (!isTeam1 && m.winner_team === 2);

                    // History for Graph
                    matchHistory.push(won ? 1 : -1);

                    // Stats Calculation
                    if (won) {
                        wins++;
                        tempStreak++;
                    } else {
                        losses++;
                        tempStreak = 0;
                    }
                    if (tempStreak > bestStreak) bestStreak = tempStreak;

                    // Sets & Games Calculation
                    if (m.score && Array.isArray(m.score)) {
                        m.score.forEach((set: { t1: number, t2: number }) => {
                            const myScore = isTeam1 ? set.t1 : set.t2;
                            const oppScore = isTeam1 ? set.t2 : set.t1;

                            totalGamesWon += myScore;
                            if (myScore > oppScore) {
                                totalSetsWon++;
                            }
                        });
                    }
                });
            }

            const totalMatches = matches?.length || 0;
            const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

            setUser({
                id: profileData.id,
                username: profileData.username,
                email: authUser.email || '',
                elo: profileData.elo,
                avatar_url: profileData.avatar_url,
                matchesPlayed: totalMatches,
                winRate: winRate,
                wins,
                losses,
                currentStreak: currentStreak,
                bestStreak: bestStreak,
                setsWon: totalSetsWon,
                gamesWon: totalGamesWon,
                matchHistory,
                is_admin: profileData.is_admin
            });

        } catch (error) {
            console.error('Error loading profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        try {
            if (!event.target.files || event.target.files.length === 0) return;
            if (!user) return;

            setUploading(true);
            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/${Math.random()}.${fileExt}`;
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
                .eq('id', user.id);

            if (updateError) throw updateError;

            setUser(prev => prev ? { ...prev, avatar_url: publicUrl } : null);

        } catch (error) {
            console.error('Error uploading avatar:', error);
            alert('Error uploading avatar. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/auth');
    };

    // Helper for Graph
    const renderMatchGraph = (history: number[]) => {
        const height = 120; // Increased height for labels
        const width = 300;
        const padding = { top: 10, right: 10, bottom: 20, left: 30 };

        if (history.length < 2) {
            return (
                <div className="h-[120px] flex items-center justify-center text-xs text-slate-500 italic bg-slate-900/40 rounded-lg border border-slate-700/30">
                    Not enough play history
                </div>
            );
        }

        // Take last 20 matches max to keep it readable
        const recentHistory = history.slice(-20);

        // Calculate cumulative points
        let cumulative = 0;
        const points = recentHistory.map((res, i) => {
            cumulative += res;
            return { index: i, value: cumulative, result: res };
        });

        // Determine Range
        const minVal = Math.min(0, ...points.map(p => p.value));
        const maxVal = Math.max(0, ...points.map(p => p.value));
        const range = Math.max(4, maxVal - minVal); // Ensure at least some range

        // Drawing dimensions
        const graphWidth = width - padding.left - padding.right;
        const graphHeight = height - padding.top - padding.bottom;

        const stepX = graphWidth / (Math.max(1, recentHistory.length - 1));

        const getY = (val: number) => {
            const normalized = (val - minVal) / range;
            return padding.top + graphHeight - (normalized * graphHeight);
        };

        const getX = (index: number) => padding.left + (index * stepX);

        // Path Construction
        const pathData = points.map((p, i) =>
            `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.value)}`
        ).join(' ');

        // Gradient Area
        const areaPath = `
            ${pathData} 
            L ${getX(points.length - 1)} ${padding.top + graphHeight} 
            L ${padding.left} ${padding.top + graphHeight} 
            Z
        `;

        // Y-Axis Ticks (3 ticks: Min, 0, Max)
        const yTicks = [minVal, 0, maxVal];
        // Filter unique and sort
        const uniqueYTicks = Array.from(new Set(yTicks)).sort((a, b) => a - b);

        return (
            <div className="w-full h-[120px] select-none">
                <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible text-xs">
                    <defs>
                        <linearGradient id="graphGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {/* Grid Lines & Axes */}
                    {/* Y-Axis Grid & Labels */}
                    {uniqueYTicks.map((tick, i) => (
                        <g key={`y-${tick}-${i}`}>
                            <line
                                x1={padding.left}
                                y1={getY(tick)}
                                x2={width - padding.right}
                                y2={getY(tick)}
                                stroke="#334155"
                                strokeWidth="1"
                                strokeDasharray="4 4"
                                opacity="0.3"
                            />
                            <text
                                x={padding.left - 5}
                                y={getY(tick)}
                                fill="#94a3b8"
                                fontSize="9"
                                textAnchor="end"
                                alignmentBaseline="middle"
                            >
                                {tick > 0 ? `+${tick}` : tick}
                            </text>
                        </g>
                    ))}

                    {/* X-Axis Baseline */}
                    <line
                        x1={padding.left}
                        y1={padding.top + graphHeight}
                        x2={width - padding.right}
                        y2={padding.top + graphHeight}
                        stroke="#475569"
                        strokeWidth="1"
                    />

                    {/* Data Area */}
                    <path d={areaPath} fill="url(#graphGradient)" stroke="none" />
                    <path d={pathData} fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

                    {/* Data Points */}
                    {points.map((p, i) => (
                        <circle
                            key={i}
                            cx={getX(i)}
                            cy={getY(p.value)}
                            r="3"
                            className={`${p.result > 0 ? "fill-green-400" : "fill-red-400"} hover:r-4 transition-all`}
                            stroke="#0f172a"
                            strokeWidth="1.5"
                        />
                    ))}

                    {/* X-Axis Labels (Start/End) */}
                    <text x={padding.left} y={height - 2} fill="#64748b" fontSize="9" textAnchor="start">
                        {recentHistory.length} matches ago
                    </text>
                    <text x={width - padding.right} y={height - 2} fill="#64748b" fontSize="9" textAnchor="end">
                        Now
                    </text>
                </svg>
            </div>
        );
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-green-500" /></div>;
    if (!user) return <div className="text-center p-10 text-slate-400">Profile not found.</div>;

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* Header */}
            <header className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">My Profile</h1>
                <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
                    <Settings size={22} className="text-slate-400" />
                </Button>
            </header>

            {/* Profile Header */}
            <div className="flex flex-col items-center space-y-4 rounded-2xl bg-slate-800 p-6 shadow-lg">
                <div className="relative">
                    <Avatar fallback={user.username} src={user.avatar_url} size="xl" className="h-24 w-24 border-4 border-slate-700 shadow-xl" />

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="absolute bottom-0 right-0 rounded-full bg-green-500 p-2 text-slate-900 shadow-md hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleAvatarUpload}
                        className="hidden"
                        accept="image/*"
                    />
                </div>
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
                        {user.username}
                        {user.is_admin && (
                            <span title="Admin" className="flex items-center">
                                <ShieldCheck size={18} className="text-blue-400" />
                            </span>
                        )}
                    </h2>
                    <p className="text-sm font-medium text-slate-400">{user.email}</p>
                </div>
                <div className="rounded-full bg-slate-700/50 px-4 py-1.5 text-sm font-bold border border-green-500/20 text-white flex items-center gap-2">
                    <span className="text-green-400">Level {getLevelFromElo(user.elo).level}</span>
                    <span className="text-slate-500">|</span>
                    <span className="text-slate-300">{getLevelFromElo(user.elo).label}</span>
                </div>
                <div className="text-[10px] text-slate-500 font-medium">
                    ELO: {user.elo}
                </div>
            </div>

            {/* Admin Button */}
            {user.is_admin && (
                <Button
                    variant="outline"
                    className="w-full border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 gap-2"
                    onClick={() => navigate('/admin')}
                >
                    <ShieldCheck size={18} />
                    Admin Console
                </Button>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
                {/* Win Rate */}
                <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                        <BarChart3 size={18} />
                        <span className="text-xs font-semibold uppercase tracking-wider">Win Rate</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{user.winRate}%</p>
                    <p className="text-xs text-slate-500 mt-1">Lifetime average</p>
                </div>
                {/* Total Matches */}
                <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                        <Medal size={18} />
                        <span className="text-xs font-semibold uppercase tracking-wider">Matches</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{user.matchesPlayed}</p>
                    <p className="text-xs text-slate-500 mt-1">Total played</p>
                </div>

                {/* Matches Won / Lost */}
                <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                        <Trophy size={48} className="text-green-500" />
                    </div>
                    <div className="flex items-center gap-2 text-green-400 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider">Won</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{user.wins}</p>
                    <p className="text-xs text-slate-500 mt-1">Matches</p>
                </div>
                <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-10">
                        <X size={48} className="text-red-500" />
                    </div>
                    <div className="flex items-center gap-2 text-red-400 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider">Lost</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{user.losses}</p>
                    <p className="text-xs text-slate-500 mt-1">Matches</p>
                </div>

                {/* Sets & Games */}
                <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 text-blue-400 mb-2">
                        <Swords size={18} />
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sets</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{user.setsWon}</p>
                    <p className="text-xs text-slate-500 mt-1">Sets Won</p>
                </div>
                <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 text-purple-400 mb-2">
                        <div className="h-4 w-4 bg-purple-500 rounded-full opacity-60"></div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Games</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{user.gamesWon}</p>
                    <p className="text-xs text-slate-500 mt-1">Games Won</p>
                </div>
            </div>

            {/* MATCH JOURNEY GRAPH */}
            <div className="rounded-xl bg-slate-800/80 p-5 border border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                        <BarChart3 size={16} />
                        Performance Trend
                    </h3>
                    <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">Last 20 Matches</span>
                </div>

                {renderMatchGraph(user.matchHistory)}

                <div className="flex justify-between items-center mt-2 px-1">
                    <span className="text-[10px] text-slate-600">Oldest</span>
                    <span className="text-[10px] text-slate-600">Newest</span>
                </div>
            </div>

            {/* Achievements */}
            <div className="rounded-xl bg-slate-800 p-5 border border-slate-700/50">
                <h3 className="mb-4 text-sm font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                    Achievements <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full text-slate-300">{userAchievementIds.size} / {allAchievements.length}</span>
                </h3>

                {allAchievements.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-sm">
                        <p>No achievements available.</p>
                    </div>
                ) : (
                    <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
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
                    Sign Out
                </Button>
            </div>
            <div className="text-center text-xs text-slate-600">
                PadelUp Version 1.2.0 {user?.is_admin ? " (Admin Mode)" : ""}
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
