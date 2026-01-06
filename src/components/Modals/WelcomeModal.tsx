import { Handshake, ShieldCheck, TrendingUp, Heart } from 'lucide-react';

interface WelcomeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const WelcomeModal = ({ isOpen, onClose }: WelcomeModalProps) => {
    if (!isOpen) return null;

    return (
        <div className="fixed  z-50 flex justify-center p-5 animate-fade-in">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/90 backdrop-blur-sm transition-opacity"
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-lg transform overflow-hidden rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl transition-all animate-scale-in">

                {/* Header Image / Pattern */}
                <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                    <Handshake size={64} className="text-white mx-auto mb-2 relative z-10" />
                    <h2 className="text-3xl font-black text-white relative z-10 tracking-tight">Welcome to PadelUp</h2>
                    <p className="text-green-100 font-medium relative z-10">More than just a padel community.</p>
                </div>

                <div className="p-6 space-y-6">
                    {/* Value 1: Honesty */}
                    <div className="flex gap-4">
                        <div className="flex-shrink-0">
                            <div className="p-3 rounded-full bg-blue-500/10 text-blue-400">
                                <ShieldCheck size={24} />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-lg">Play Fair, Score True</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Honest scoring is the heart of our ranking system. Accurate results ensure real statistics and fair matchmaking for everyone.
                            </p>
                        </div>
                    </div>

                    {/* Value 2: Growth */}
                    <div className="flex gap-4">
                        <div className="flex-shrink-0">
                            <div className="p-3 rounded-full bg-yellow-500/10 text-yellow-500">
                                <TrendingUp size={24} />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-lg">Grow Together</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Use real data to improve your game. Challenge yourself, unlock achievements, and climb the leaderboard.
                            </p>
                        </div>
                    </div>

                    {/* Value 3: Support */}
                    <div className="flex gap-4">
                        <div className="flex-shrink-0">
                            <div className="p-3 rounded-full bg-red-500/10 text-red-400">
                                <Heart size={24} />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-lg">Support the Community</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                After the test period, your monthly subscription keeps PadelUp alive and evolving. It directly supports new features and new functions.
                            </p>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            onClick={onClose}
                            className="w-full py-4 rounded-xl bg-green-500 hover:bg-green-400 text-slate-900 font-bold text-lg transition-colors shadow-lg shadow-green-500/20 active:scale-95"
                        >
                            I'm Ready to enjoy!
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
