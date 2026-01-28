import { useState, useEffect } from 'react';
import { cn } from './Button';

interface AvatarProps {
    src?: string | null;
    fallback: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

export const Avatar = ({ src, fallback, size = 'md', className }: AvatarProps) => {
    const [imageError, setImageError] = useState(false);

    // Reset error state when src changes
    useEffect(() => {
        setImageError(false);
    }, [src]);

    return (
        <div
            className={cn(
                "relative flex shrink-0 overflow-hidden rounded-full bg-slate-800 border border-slate-700",
                {
                    'h-8 w-8 text-xs': size === 'sm',
                    'h-10 w-10 text-sm': size === 'md',
                    'h-14 w-14 text-base': size === 'lg',
                    'h-20 w-20 text-xl': size === 'xl',
                },
                className
            )}
        >
            {src && !imageError ? (
                <img
                    src={src}
                    alt={fallback}
                    className="h-full w-full object-cover"
                    onError={() => setImageError(true)}
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center font-bold text-slate-400 uppercase select-none">
                    {fallback.slice(0, 2)}
                </div>
            )}
        </div>
    );
};
