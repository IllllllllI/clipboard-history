/**
 * Lightweight inline SVG icons for HUD components.
 * Replaces lucide-react to eliminate heavy library dependency in HUD bundle.
 * All icons use the standard lucide 24×24 viewBox, stroke-based rendering.
 */
import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

const defaults: IconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

const icon = (children: React.ReactNode, displayName: string) => {
  const Comp = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <svg ref={ref} {...defaults} {...props}>{children}</svg>
  ));
  Comp.displayName = displayName;
  return Comp;
};

export const Copy = icon(
  <>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>,
  'Copy',
);

export const Edit3 = icon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
  'Edit3',
);

export const Pin = icon(
  <>
    <line x1="12" x2="12" y1="17" y2="22" />
    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
  </>,
  'Pin',
);

export const Star = icon(
  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  'Star',
);

export const Trash2 = icon(
  <>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" x2="10" y1="11" y2="17" />
    <line x1="14" x2="14" y1="11" y2="17" />
  </>,
  'Trash2',
);

export const Loader2 = icon(
  <path d="M21 12a9 9 0 1 1-6.219-8.56" />,
  'Loader2',
);

export const XCircle = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m15 9-6 6" />
    <path d="m9 9 6 6" />
  </>,
  'XCircle',
);

export const CheckCircle2 = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </>,
  'CheckCircle2',
);
