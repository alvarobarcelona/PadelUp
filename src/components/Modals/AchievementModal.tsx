import { X, Trophy, Medal, Flame, Camera, Swords, CheckCircle2 } from 'lucide-react';


interface Achievement {
    id: string;
    name: string;
    description: string;
    icon: string;
    point_value: number;
}

interface AchievementModalProps {
    isOpen: boolean;
    onClose: () => void;
    achievement: Achievement | null;
    isUnlocked: boolean;
}

const iconMap: Record<string, any> = {
    'Trophy': Trophy,
    'Medal': Medal,
    'Flame': Flame,
    'Camera': Camera,
    'Sword': Swords
};

export const AchievementModal = ({ isOpen, onClose, achievement, isUnlocked }: AchievementModalProps) => {
    if (!isOpen || !achievement) return null;

    const Icon = iconMap[achievement.icon] || Trophy;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-sm transform overflow-hidden rounded-3xl bg-slate-900 p-6 text-left align-middle shadow-2xl transition-all border border-slate-700/50 animate-scale-in mt-96">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                {/* Content */}
                <div className="flex flex-col items-center text-center space-y-4 pt-4">

                    {/* Icon Circle - Animated */}
                    <div className={`relative flex items-center justify-center h-24 w-24 rounded-full border-4 shadow-xl mb-2
                        ${isUnlocked
                            ? 'bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/50 shadow-yellow-500/20 animate-pulse-slow'
                            : 'bg-slate-800 border-slate-700 grayscale'
                        }`}
                    >
                        <Icon
                            size={48}
                            className={`transform transition-all duration-700 ${isUnlocked ? 'text-yellow-500 rotate-[360deg]' : 'text-slate-600'}`}
                        />

                        {isUnlocked && (
                            <div className="absolute -bottom-2 -right-2 bg-green-500 text-slate-900 rounded-full p-1.5 border-4 border-slate-900">
                                <CheckCircle2 size={16} strokeWidth={3} />
                            </div>
                        )}
                    </div>

                    {/* Text Details */}
                    <div className="space-y-1">
                        <h3 className={`text-2xl font-black tracking-tight ${isUnlocked ? 'text-white' : 'text-slate-400'}`}>
                            {achievement.name}
                        </h3>
                        <div className="flex items-center justify-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider
                                ${isUnlocked ? 'bg-yellow-500/20 text-yellow-500' : 'bg-slate-800 text-slate-500'}`}>
                                {achievement.point_value} XP
                            </span>
                        </div>
                    </div>

                    <p className="text-slate-300 leading-relaxed text-sm px-4">
                        {achievement.description}
                    </p>

                    {/* Status Footer */}
                    <div className={`w-full py-3 rounded-xl mt-4 font-bold text-sm tracking-wide
                        ${isUnlocked
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                            : 'bg-slate-800/50 text-slate-500 border border-slate-700/50'
                        }`}>
                        {isUnlocked ? 'ACHIEVEMENT UNLOCKED' : 'LOCKED'}
                    </div>
                </div>
            </div>
        </div>
    );
};
