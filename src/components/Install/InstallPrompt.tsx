import { usePWA } from "../../context/PWAContext";





const InstallPrompt = () => {
    const { deferredPrompt, isInstalled, install } = usePWA();

    if (isInstalled) {
        return (
            <div className="p-4 bg-green-900/20 border border-green-500/50 rounded-lg text-center">
                <p className="text-green-400 font-medium">You already have the app installed!</p>
            </div>
        )
    }

    if (!deferredPrompt) {
        return null;
    }

    return (
        <button
            onClick={install}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg transform transition active:scale-95 flex items-center justify-center gap-3"
        >
            <span>📲</span>
            Install App
        </button>
    );
};

export default InstallPrompt;
