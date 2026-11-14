import React from 'react';

export const WURTH_LOGO_PATH = '/assets/aistudio/Logo_c2991402.jpg';

interface WurthLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  white?: boolean;
  compact?: boolean;
  showSubtitle?: boolean;
}

export const WurthLogo: React.FC<WurthLogoProps> = ({
  className = '',
  size = 'md',
  white = false,
  compact = false,
  showSubtitle = true,
}) => {
  if (compact) {
    return (
      <div
        className={`w-7 h-7 rounded-sm bg-white flex items-center justify-center overflow-hidden shadow-xs shrink-0 select-none ${className}`}
        title="WÜRTH Recovery Intelligence"
      >
        <img
          src={WURTH_LOGO_PATH}
          alt="WÜRTH"
          className="h-5 w-[18px] max-w-none object-cover object-left"
        />
      </div>
    );
  }

  const imgHeight = size === 'sm' ? 20 : size === 'lg' ? 30 : 24;

  return (
    <div className={`inline-flex flex-col items-start gap-1 select-none ${className}`}>
      <div className={white ? 'bg-white rounded-sm px-2 py-0.5 shadow-xs' : ''}>
        <img
          src={WURTH_LOGO_PATH}
          alt="WÜRTH"
          style={{ height: `${imgHeight}px`, width: 'auto' }}
          className="block object-contain"
        />
      </div>
      {showSubtitle && (
        <span
          className={`text-[9px] font-semibold tracking-wider uppercase leading-none ${
            white ? 'text-red-200' : 'text-red-600'
          }`}
        >
          Recovery Intelligence
        </span>
      )}
    </div>
  );
};
