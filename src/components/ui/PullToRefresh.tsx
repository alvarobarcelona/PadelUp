import { useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
    onRefresh: () => Promise<void>;
    children: ReactNode;
}

export const PullToRefresh = ({ onRefresh, children }: PullToRefreshProps) => {
    const [startY, setStartY] = useState(0);
    const [currentY, setCurrentY] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const PULL_THRESHOLD = 80;

    const handleTouchStart = (e: React.TouchEvent) => {
        if (window.scrollY === 0 && !refreshing) {
            setStartY(e.touches[0].clientY);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (window.scrollY === 0 && startY > 0 && !refreshing) {
            const pullDistance = e.touches[0].clientY - startY;
            if (pullDistance > 0) {
                // Add resistance
                setCurrentY(Math.min(pullDistance * 0.5, 120));
            }
        }
    };

    const handleTouchEnd = async () => {
        if (currentY > PULL_THRESHOLD && !refreshing) {
            setRefreshing(true);
            setCurrentY(60); // Snap to loading position
            try {
                await onRefresh();
            } finally {
                setRefreshing(false);
                setCurrentY(0);
                setStartY(0);
            }
        } else {
            setCurrentY(0);
            setStartY(0);
        }
    };

    return (
        <div
            ref={contentRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
                transform: `translateY(${currentY}px)`,
                transition: refreshing ? 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)' : 'transform 0.2s ease-out'
            }}
        >
            {/* Refresh Indicator */}
            <div
                className="absolute top-0 left-0 w-full flex justify-center pointer-events-none"
                style={{
                    marginTop: '-40px',
                    opacity: currentY > 10 ? 1 : 0
                }}
            >
                <div className="bg-slate-800 p-2 rounded-full shadow-lg border border-slate-700">
                    <Loader2
                        className={`text-green-500 transition-transform ${refreshing ? 'animate-spin' : ''}`}
                        size={20}
                        style={{ transform: `rotate(${currentY * 2}deg)` }}
                    />
                </div>
            </div>

            {children}
        </div>
    );
};
