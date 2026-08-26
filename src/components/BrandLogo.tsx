import React from 'react';

/**
 * Royal Hotel POS — official brand logo.
 *
 * Master asset lives at `public/logo.png` (served from the site root).
 * To rebrand the whole system later, simply replace `public/logo.png`
 * (512×512, transparent rounded-square PNG) — every screen picks it up
 * from this single component.
 */
export const BRAND_LOGO_SRC = '/logo.png';
export const BRAND_NAME = 'Royal Hotel POS';

interface BrandLogoProps {
  /** Tailwind size classes, e.g. "w-9 h-9" */
  className?: string;
  /** Tailwind border-radius class matching the asset's rounded corners */
  roundedClass?: string;
  /** Accessible label */
  alt?: string;
  /** Extra classes (shadows, rings, etc.) */
  imgClassName?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = 'w-9 h-9',
  roundedClass = 'rounded-xl',
  alt = BRAND_NAME,
  imgClassName = '',
}) => (
  <img
    src={BRAND_LOGO_SRC}
    alt={alt}
    title={alt}
    draggable={false}
    className={`${className} ${roundedClass} object-cover select-none pointer-events-none shrink-0 ${imgClassName}`}
  />
);
