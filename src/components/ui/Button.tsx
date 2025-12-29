
import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {
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
