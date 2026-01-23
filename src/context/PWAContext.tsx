import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PWAContextType {
    deferredPrompt: BeforeInstallPromptEvent | null;
    isInstalled: boolean;
    install: () => Promise<void>;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

export const PWAProvider = ({ children }: { children: ReactNode }) => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        const handleBeforeInstallPrompt = (e: Event) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            console.log('Captured beforeinstallprompt event');
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Check if already installed
        const checkInstalled = () => {
            if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
                setIsInstalled(true);
            }
        };
        checkInstalled();

        window.matchMedia('(display-mode: standalone)').addEventListener('change', checkInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.matchMedia('(display-mode: standalone)').removeEventListener('change', checkInstalled);
        };
    }, []);

    const install = async () => {
        if (!deferredPrompt) return;

        deferredPrompt.prompt();

        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);

        if (outcome === 'accepted') {
            setDeferredPrompt(null);
        }
    };

    return (
        <PWAContext.Provider value={{ deferredPrompt, isInstalled, install }}>
            {children}
        </PWAContext.Provider>
    );
};

export const usePWA = () => {
    const context = useContext(PWAContext);
    if (context === undefined) {
        throw new Error('usePWA must be used within a PWAProvider');
    }
    return context;
};
