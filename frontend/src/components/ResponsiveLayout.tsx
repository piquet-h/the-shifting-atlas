import React from 'react';
import { useMediaQuery } from '../hooks/useMediaQueries';

/**
 * ResponsiveLayout
 * Progressive enhancement wrapper that:
 *  - Constrains content width on larger screens (max-w-7xl container)
 *  - Adds a subtle grid background on large desktop (purely decorative)
 *  - Provides padding tiers separate from internal component spacing
 *  - No-op styling for small screens to keep initial payload lean
 */
export const ResponsiveLayout: React.FC<React.PropsWithChildren> = ({ children }) => {
    const isLarge = useMediaQuery('(min-width: 1024px)');
    return (
        <div
            className={[
                'flex-1 w-full mx-auto transition-colors duration-300',
                'container max-w-7xl',
                isLarge ? 'relative' : '',
            ].join(' ')}
        >
            {isLarge && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_70%)]"
                />
            )}
            {children}
        </div>
    );
};

export default ResponsiveLayout;
