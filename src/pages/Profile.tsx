
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Camera, Settings, LogOut, BarChart3, Medal, Trophy, Loader2, ShieldCheck, Flame, Swords } from 'lucide-react';
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
        id: string; // Added ID for storage path
        username: string;
        email: string;
        elo: number;
        avatar_url: string | null;
        matchesPlayed: number;
        winRate: number;
        currentStreak: number;
        bestStreak: number;
        setsWon: number;
        gamesWon: number;
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

            // Fetch Profile Data including is_admin
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
                .order('point_value', { ascending: true }); // Base sort by difficulty/points

            setAllAchievements(availableAchievements || []);

            // Calculate Stats... (Same as before)
            // Calculate Stats
            const { data: matches } = await supabase
                .from('matches')
                .select('winner_team, team1_p1, team1_p2, team2_p1, team2_p2, created_at, score')
                .or(`team1_p1.eq.${profileData.id},team1_p2.eq.${profileData.id},team2_p1.eq.${profileData.id},team2_p2.eq.${profileData.id}`)
                .eq('status', 'confirmed')
                .order('created_at', { ascending: false }); // Newest first

            let wins = 0;
            let currentStreak = 0;
            let bestStreak = 0;
            let tempStreak = 0;
            let totalSetsWon = 0;
            let totalGamesWon = 0;

            // Calculate Current Streak (Newest -> Oldest)
            // We stop counting as soon as we find a loss or a match they didn't play (shouldn't happen with query)
            if (matches) {
                for (const m of matches) {
                    const isTeam1 = m.team1_p1 === profileData.id || m.team1_p2 === profileData.id;
                    const won = (isTeam1 && m.winner_team === 1) || (!isTeam1 && m.winner_team === 2);

                    if (won) {
                        currentStreak++;
                    } else {
                        break; // Streak broken
                    }
                }

                // Calculate Best Streak, Total Wins, Sets & Games (Oldest -> Newest is easier, or just iterate all)
                // Let's iterate all (reverse of matches since matches is Descending)
                const chronological = [...matches].reverse();

                chronological.forEach(m => {
                    const isTeam1 = m.team1_p1 === profileData.id || m.team1_p2 === profileData.id;
                    const won = (isTeam1 && m.winner_team === 1) || (!isTeam1 && m.winner_team === 2);

                    // Stats Calculation
                    if (won) {
                        wins++;
                        tempStreak++;
                    } else {
                        tempStreak = 0;
                    }
                    if (tempStreak > bestStreak) bestStreak = tempStreak;

                    // Sets & Games Calculation
                    if (m.score && Array.isArray(m.score)) {
                        m.score.forEach((set: { t1: number, t2: number }) => {
                            const myScore = isTeam1 ? set.t1 : set.t2;
                            const oppScore = isTeam1 ? set.t2 : set.t1;

                            // Add Games
                            totalGamesWon += myScore;

                            // Add Set (if won this set)
                            // A set is won if myScore > oppScore (assuming standard rules or just raw score comparison)
                            // Typically 6-4, 7-6 etc. simpler logic: score > opponent
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
                currentStreak: currentStreak,
                bestStreak: bestStreak,
                setsWon: totalSetsWon,
                gamesWon: totalGamesWon,
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
            if (!event.target.files || event.target.files.length === 0) {
                return;
            }
            if (!user) return;

            setUploading(true);
            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // Update Profile
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', user.id);

            if (updateError) throw updateError;

            // Update Local State
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

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-green-500" /></div>;
    if (!user) return <div className="text-center p-10 text-slate-400">Profile not found.</div>;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header ... */}
            <header className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-white">My Profile</h1>
                <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
                    <Settings size={22} className="text-slate-400" />
                </Button>
            </header>

            {/* Profile Header (Components Omitted) */}
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

            {/* Admin Button (Only if Admin) */}
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

            {/* Stats Overview */}
            <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                        <BarChart3 size={18} />
                        <span className="text-xs font-semibold uppercase tracking-wider">Win Rate</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{user.winRate}%</p>
                    <p className="text-xs text-slate-500 mt-1">Lifetime average</p>
                </div>
                <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 text-slate-400 mb-2">
                        <Medal size={18} />
                        <span className="text-xs font-semibold uppercase tracking-wider">Matches</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{user.matchesPlayed}</p>
                    <p className="text-xs text-slate-500 mt-1">Total played</p>
                </div>
                {/* NEW: Streak Stats */}
                <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 text-yellow-500 mb-2">
                        <Flame size={18} />
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Streak</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{user.currentStreak}<span className="text-sm text-slate-500 ml-1">W</span></p>
                    <p className="text-xs text-slate-500 mt-1">Current form</p>
                </div>
                <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 text-purple-400 mb-2">
                        <Trophy size={18} />
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Best</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{user.bestStreak}<span className="text-sm text-slate-500 ml-1">W</span></p>
                    <p className="text-xs text-slate-500 mt-1">Record Streak</p>
                </div>

                {/* NEW: Sets & Games Stats */}
                <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 text-blue-400 mb-2">
                        <Swords size={18} />
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sets</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{user.setsWon}</p>
                    <p className="text-xs text-slate-500 mt-1">Sets Won</p>
                </div>
                <div className="rounded-xl bg-slate-800 p-4 border border-slate-700/50">
                    <div className="flex items-center gap-2 text-green-400 mb-2">
                        <div className="h-4 w-4 bg-green-500 rounded-full opacity-60"></div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Games</span>
                    </div>
                    <p className="text-3xl font-bold text-white">{user.gamesWon}</p>
                    <p className="text-xs text-slate-500 mt-1">Games Won</p>
                </div>
            </div>

            {/* Recent Badges / Achievements */}
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
