import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Modal } from '../components/ui/Modal';

interface ModalOptions {
    title: string;
    message?: ReactNode;
    type?: 'info' | 'success' | 'warning' | 'danger' | 'confirm' | 'prompt';
    confirmText?: string;
    cancelText?: string;
    defaultValue?: string;
    placeholder?: string;
    autoCloseDuration?: number;
    hideButtons?: boolean;
}

interface ModalContextType {
    alert: (options: ModalOptions) => Promise<void>;
    confirm: (options: ModalOptions) => Promise<boolean>;
    prompt: (options: ModalOptions) => Promise<string | null>;
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
        resolve?: (value: boolean | void | string | null | PromiseLike<boolean | void | string | null>) => void;
    }>({
        isOpen: false,
        options: { title: '' },
    });
    const [inputValue, setInputValue] = useState('');

    const close = useCallback(() => {
        setModalState(prev => ({ ...prev, isOpen: false }));
    }, []);

    const alert = useCallback((options: ModalOptions) => {
        return new Promise<void>((resolve) => {
            let timerId: ReturnType<typeof setTimeout> | null = null;

            const handleResolve = () => {
                if (timerId) clearTimeout(timerId);
                close();
                resolve();
            };

            if (options.autoCloseDuration) {
                timerId = setTimeout(() => {
                    handleResolve();
                }, options.autoCloseDuration);
            }

            setModalState({
                isOpen: true,
                options: { ...options, type: options.type || 'info', cancelText: 'Close' },
                resolve: handleResolve
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

    const prompt = useCallback((options: ModalOptions) => {
        return new Promise<string | null>((resolve) => {
            setInputValue(options.defaultValue || '');
            setModalState({
                isOpen: true,
                options: { ...options, type: 'prompt' },
                resolve: (value) => {
                    close();
                    resolve(value as string | null);
                }
            });
        });
    }, [close]);

    const handleConfirm = () => {
        if (modalState.resolve) {
            if (modalState.options.type === 'prompt') {
                modalState.resolve(inputValue);
            } else {
                modalState.resolve(true);
            }
        }
    };

    const handleCancel = () => {
        if (modalState.resolve) {
            // If it's an alert, we just resolve. If it's a confirm, we resolve false.
            // If it's a prompt, we resolve null.
            if (modalState.options.type === 'prompt') {
                modalState.resolve(null);
            } else {
                modalState.resolve(false);
            }
        } else {
            close();
        }
    };

    return (
        <ModalContext.Provider value={{ alert, confirm, prompt }}>
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
                inputValue={modalState.options.type === 'prompt' ? inputValue : undefined}
                onInputChange={modalState.options.type === 'prompt' ? setInputValue : undefined}
                placeholder={modalState.options.placeholder}
                hideButtons={modalState.options.hideButtons}
            />
        </ModalContext.Provider>
    );
};

