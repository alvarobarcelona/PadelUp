import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Modal } from '../components/ui/Modal';

interface ModalOptions {
    title: string;
    message?: ReactNode;
    type?: 'info' | 'success' | 'warning' | 'danger' | 'confirm';
    confirmText?: string;
    cancelText?: string;
}

interface ModalContextType {
    alert: (options: ModalOptions) => Promise<void>;
    confirm: (options: ModalOptions) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
    const context = useContext(ModalContext);
    if (!context) {
        throw new Error('useModal must be used within a ModalProvider');
    }
    return context;
};

export const ModalProvider = ({ children }: { children: ReactNode }) => {
    const [modalState, setModalState] = useState<{
        isOpen: boolean;
        options: ModalOptions;
        resolve?: (value: boolean | void | PromiseLike<boolean | void>) => void;
    }>({
        isOpen: false,
        options: { title: '' },
    });

    const close = useCallback(() => {
        setModalState(prev => ({ ...prev, isOpen: false }));
    }, []);

    const alert = useCallback((options: ModalOptions) => {
        return new Promise<void>((resolve) => {
            setModalState({
                isOpen: true,
                options: { ...options, type: options.type || 'info', cancelText: 'Close' },
                resolve: () => {
                    close();
                    resolve();
                }
            });
        });
    }, [close]);

    const confirm = useCallback((options: ModalOptions) => {
        return new Promise<boolean>((resolve) => {
            setModalState({
                isOpen: true,
                options: { ...options, type: options.type || 'confirm' },
                resolve: (updatedValue) => { // Updated to accept a value
                    close();
                    resolve(updatedValue as boolean); // Cast to boolean
                }
            });
        });
    }, [close]);

    const handleConfirm = () => {
        if (modalState.resolve) {
            modalState.resolve(true);
        }
    };

    const handleCancel = () => {
        if (modalState.resolve) {
            // If it's an alert, we just resolve. If it's a confirm, we resolve false.
            // But for simplicity in the resolve signature we made it generic.
            modalState.resolve(false);
        } else {
            close();
        }
    };

    return (
        <ModalContext.Provider value={{ alert, confirm }}>
            {children}
            <Modal
                isOpen={modalState.isOpen}
                onClose={handleCancel}
                onConfirm={handleConfirm}
                title={modalState.options.title}
                description={modalState.options.message}
                type={modalState.options.type}
                confirmText={modalState.options.confirmText}
                cancelText={modalState.options.cancelText}
            />
        </ModalContext.Provider>
    );
};
