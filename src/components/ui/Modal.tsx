import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, CheckCircle, Info, Ban, HelpCircle } from 'lucide-react';
import { Button } from './Button';
import { cn } from './Button'; // Reusing cn utility if exported, or import specifically

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: React.ReactNode;
    children?: React.ReactNode;
    type?: 'info' | 'success' | 'warning' | 'danger' | 'confirm';
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    isLoading?: boolean;
}

export const Modal = ({
    isOpen,
    onClose,
    title,
    description,
    children,
    type = 'info',
    confirmText = 'OK',
    cancelText = 'Cancel',
    onConfirm,
    isLoading
}: ModalProps) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) setIsVisible(true);
        else {
            const timer = setTimeout(() => setIsVisible(false), 300); // Wait for exit animation
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible) return null;

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle className="text-green-500" size={32} />;
            case 'warning': return <AlertTriangle className="text-yellow-500" size={32} />;
            case 'danger': return <Ban className="text-red-500" size={32} />;
            case 'confirm': return <HelpCircle className="text-blue-500" size={32} />;
            default: return <Info className="text-blue-500" size={32} />;
        }
    };

    const getConfirmVariant = () => {
        switch (type) {
            case 'danger': return 'danger';
            default: return 'primary';
        }
    };

    return (
        <div
            className={cn(
                "fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300",
                isOpen ? "opacity-100" : "opacity-0"
            )}
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div
                className={cn(
                    "relative w-full max-w-md transform overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl transition-all duration-300",
                    isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
                )}
            >
                {/* Header Pattern */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent opacity-50" />

                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 p-2 bg-slate-800/50 rounded-full border border-slate-700/50">
                            {getIcon()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-white leading-6">
                                {title}
                            </h3>
                            {description && (
                                <div className="mt-2 text-slate-400 text-sm leading-relaxed">
                                    {description}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {children && <div className="mt-4">{children}</div>}

                    <div className="mt-8 flex justify-end gap-3">
                        {(onConfirm || type === 'confirm') && (
                            <Button
                                variant="ghost"
                                onClick={onClose}
                                disabled={isLoading}
                            >
                                {cancelText}
                            </Button>
                        )}
                        <Button
                            variant={getConfirmVariant()}
                            onClick={() => {
                                onConfirm?.();
                                if (!isLoading) onClose();
                            }}
                            isLoading={isLoading}
                            className={cn(type !== 'danger' && "bg-green-600 hover:bg-green-500")}
                        >
                            {confirmText}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
