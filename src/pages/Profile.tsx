
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import { Camera, Settings, LogOut, BarChart3, Medal, Trophy, Loader2, ShieldCheck, Flame, Swords } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getLevelFromElo } from '../lib/elo';
import { checkAchievements } from '../lib/achievements';
import { useNavigate } from 'react-router-dom';

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
    const [achievements, setAchievements] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [user, setUser] = useState<{
        id: string; // Added ID for storage path
        username: string;
        email: string;
        elo: number;
        avatar_url: string | null;
        matchesPlayed: number;
        winRate: number;
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
                .eq('auth_id', authUser.id)
                .single();

            if (profileError) throw profileError;

            // Check & Fetch Achievements
            await checkAchievements(profileData.id);
            const { data: myAchievements } = await supabase
                .from('user_achievements')
                .select('*, achievements(*)')
                .eq('user_id', profileData.id);

            setAchievements(myAchievements || []);

            // Calculate Stats... (Same as before)
            const { data: matches } = await supabase
                .from('matches')
                .select('winner_team, team1_p1, team1_p2, team2_p1, team2_p2')
                .or(`team1_p1.eq.${profileData.id},team1_p2.eq.${profileData.id},team2_p1.eq.${profileData.id},team2_p2.eq.${profileData.id}`);

            let wins = 0;
            const totalMatches = matches?.length || 0;

            matches?.forEach(m => {
                const isTeam1 = m.team1_p1 === profileData.id || m.team1_p2 === profileData.id;
                const isTeam2 = m.team2_p1 === profileData.id || m.team2_p2 === profileData.id;

                if ((isTeam1 && m.winner_team === 1) || (isTeam2 && m.winner_team === 2)) wins++;
            });

            const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

            setUser({
                id: profileData.id,
                username: profileData.username,
                email: authUser.email || '',
                elo: profileData.elo,
                avatar_url: profileData.avatar_url,
                matchesPlayed: totalMatches,
                winRate: winRate,
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
            setUploading(true);

            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('You must select an image to upload.');
            }

            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${user?.id}/${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            // 1. Upload to Storage
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file);

            if (uploadError) {
                console.error('Storage Upload Error:', uploadError);
                throw new Error(`Storage Error: ${uploadError.message}`);
            }

            // 2. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            // 3. Update Profile Database
            if (user) {
                console.log('Attempting to update profile for User ID:', user.id);
                console.log('New Avatar URL:', publicUrl);

                const { data: updatedData, error: updateError } = await supabase
                    .from('profiles')
                    .update({ avatar_url: publicUrl })
                    .eq('id', user.id)
                    .select();

                if (updateError) {
                    console.error('Database Update Error:', updateError);
                    alert(`Database Error: ${updateError.message}. Check your RLS policies.`);
                    return;
                }

                if (!updatedData || updatedData.length === 0) {
                    console.error('Update succeeded but NO rows were modified.');
                    alert('Update failed silently. This usually means an RLS policy is hiding the row or the ID is wrong.');
                    return;
                }

                console.log('Database updated successfully:', updatedData);
                setUser({ ...user, avatar_url: publicUrl });
                alert('Profile picture updated successfully! (Saved to DB)');
            }

        } catch (error: any) {
            console.error('Avatar Upload Error:', error);
            alert(`Error: ${error.message || 'Unknown error occurred'}`);
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
            </div>

            {/* Recent Badges / Achievements */}
            <div className="rounded-xl bg-slate-800 p-5 border border-slate-700/50">
                <h3 className="mb-4 text-sm font-semibold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                    Achievements <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full text-slate-300">{achievements.length}</span>
                </h3>

                {achievements.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-sm">
                        <p>Play matches to unlock badges!</p>
                    </div>
                ) : (
                    <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                        {achievements.map((item: any) => {
                            const badge = item.achievements;
                            const Icon = iconMap[badge.icon] || Trophy;

                            return (
                                <div key={badge.id} className="flex flex-col items-center flex-shrink-0 space-y-2 w-20">
                                    <div className="h-14 w-14 rounded-full bg-gradient-to-br from-yellow-400/20 to-orange-500/20 p-[2px] shadow-lg shadow-orange-500/10">
                                        <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-800 border-2 border-slate-700">
                                            <Icon size={24} className="text-yellow-500" />
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-300 text-center leading-tight">{badge.name}</span>
                                    <span className="text-[9px] text-slate-500 text-center hidden">{badge.point_value}</span>
                                </div>
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
                PadelUp Version 1.2.0 (Admin Mode)
            </div>
        </div>
    );
};

export default Profile;
