import React from 'react';

/**
 * Logo
 * Centralized mark so we keep consistency across navigation and landing surfaces.
 * If we later need variants (monochrome, compact), extend via props.
 */
export default function Logo(): React.ReactElement {
  return (
    <div className="w-12 h-12 text-atlas-accent flex items-center justify-center" aria-hidden>
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 12h10M12 7v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
