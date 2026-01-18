
import { useEffect, useState } from 'react';
import InstallPrompt from '../components/Install/InstallPrompt';
import IOSInstallGuide from '../components/Install/IOSInstallGuide';
import AndroidInstallGuide from '../components/Install/AndroidInstallGuide';
import ClubQR from '../components/QRCode/ClubQR';
import { Download, Share2 } from 'lucide-react';

const Install = () => {
    const [isIOS, setIsIOS] = useState(false);
    const [isAndroid, setIsAndroid] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const ua = navigator.userAgent;
        const isIOSDevice = /iPhone|iPad|iPod/.test(ua);
        const isAndroidDevice = /Android/.test(ua);

        setIsIOS(isIOSDevice);
        setIsAndroid(isAndroidDevice);
        setIsMobile(isIOSDevice || isAndroidDevice);
    }, []);

    return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[100px]" />
            </div>

            <div className="z-10 w-full max-w-md space-y-8 flex flex-col items-center">
                {/* Header */}
                <div className="text-center space-y-4 relative">
                    <button
                        onClick={() => window.history.back()}
                        className="absolute left-0 top-0 text-slate-400 hover:text-white p-2"
                        aria-label="Go back"
                    >
                        ✕
                    </button>
                    <div className="bg-gradient-to-br from-blue-500 to-purple-600 w-20 h-20 rounded-2xl mx-auto flex items-center justify-center shadow-2xl shadow-blue-500/20">
                        <img src="/icon-192.png" alt="PadelUp" className="w-16 h-16 rounded-xl" />
                    </div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                        Install PadelUp
                    </h1>
                    <p className="text-slate-400">
                        The best experience to manage your results, tournaments and statistics.
                    </p>
                </div>

                {/* Device Specific Content */}
                <div className="w-full space-y-6">
                    {isMobile ? (
                        <div className="space-y-6">
                            {isAndroid && (
                                <>
                                    <InstallPrompt />
                                    <AndroidInstallGuide />
                                </>
                            )}
                            {isIOS && <IOSInstallGuide />}
                        </div>
                    ) : (
                        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 text-center space-y-4">
                            <h3 className="text-lg font-medium text-white">Scan to install on your mobile</h3>
                            <div className="flex justify-center">
                                <ClubQR />
                            </div>
                        </div>
                    )}
                </div>

                {/* Features List */}
                <div className="grid grid-cols-1 gap-4 w-full text-sm text-slate-400">
                    <div className="flex items-center gap-3 bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                        <div className="p-2 bg-blue-500/20 rounded-full text-blue-400">
                            <Download size={16} />
                        </div>
                        <span>Instant access from home screen</span>
                    </div>
                    <div className="flex items-center gap-3 bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                        <div className="p-2 bg-purple-500/20 rounded-full text-purple-400">
                            <Share2 size={16} />
                        </div>
                        <span>No downloads from the store</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Install;
