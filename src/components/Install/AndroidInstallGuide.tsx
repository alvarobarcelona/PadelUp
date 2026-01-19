
import { MoreVertical, Download } from 'lucide-react';

const AndroidInstallGuide = () => {
    return (
        <div className="fixed inset-x-0 bottom-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 p-6 pb-8 safe-area-bottom rounded-t-2xl shadow-2xl animate-slide-up z-50">
            <div className="flex flex-col gap-6 max-w-md mx-auto">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">Install PadelUp</h3>
                    <button
                        onClick={() => window.location.reload()}
                        className="text-slate-400 hover:text-white"
                    >
                        ✕
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="flex items-start gap-4">
                        <div className="bg-slate-800 p-2 rounded-lg text-slate-200">
                            <MoreVertical size={24} />
                        </div>
                        <div>
                            <p className="text-slate-300">1. Tap the <span className="text-white font-bold">Menu</span> icon (3 dots) at the top right.</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <div className="bg-slate-800 p-2 rounded-lg text-blue-400">
                            <Download size={24} />
                        </div>
                        <div>
                            <p className="text-slate-300">2. Select <span className="text-white font-bold">Install App</span> or <span className="text-white font-bold">Add via Chrome</span>.</p>
                        </div>
                    </div>
                </div>

                <div className="text-center text-sm text-slate-500 pt-2">
                    Access your tournaments with one touch
                </div>
            </div>
        </div>
    );
};

export default AndroidInstallGuide;
