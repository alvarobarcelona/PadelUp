
import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';
import { useModal } from '../../context/ModalContext';
import { useTranslation } from 'react-i18next';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
    confirm?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, children, confirm, onClick, ...props }, ref) => {
        const { confirm: confirmModal } = useModal();
        const { t } = useTranslation();

        const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
            if (confirm) {
                // Use custom modal
                const isConfirmed = await confirmModal({
                    title: t('common.confirm_title') || 'Confirm Action',
                    message: confirm,
                    type: 'confirm',
                    confirmText: t('common.confirm') || 'Confirm',
                    cancelText: t('common.cancel') || 'Cancel'
                });

                if (!isConfirmed) {
                    return;
                }
            }
            onClick?.(e);
        };

        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 disabled:pointer-events-none disabled:opacity-50 active:scale-95",
                    {
                        'bg-green-500 text-slate-900 shadow-lg shadow-green-500/25 hover:bg-green-400': variant === 'primary',
                        'bg-slate-800 text-slate-100 hover:bg-slate-700': variant === 'secondary',
                        'border-2 border-slate-700 bg-transparent text-slate-300 hover:border-slate-600 hover:text-white': variant === 'outline',
                        'hover:bg-slate-800 text-slate-400 hover:text-slate-200': variant === 'ghost',
                        'bg-red-500/10 text-red-400 hover:bg-red-500/20': variant === 'danger',
                        'h-9 px-4 text-sm': size === 'sm',
                        'h-11 px-6 text-base': size === 'md',
                        'h-14 px-8 text-lg': size === 'lg',
                        'h-11 w-11': size === 'icon',
                    },
                    className
                )}
                disabled={isLoading || props.disabled}
                onClick={handleClick}
                {...props}
            >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {children}
            </button>
        );
    }
);
Button.displayName = 'Button';

export { Button, cn };
