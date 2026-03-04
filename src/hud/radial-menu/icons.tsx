import React from 'react';
import { RadialMenuActionId } from './actions';

export function RadialMenuIcon({ actionId }: { actionId: RadialMenuActionId }) {
  switch (actionId) {
    case 'copy':
      return (
        <svg className='radial-menu-icon-svg' viewBox='0 0 24 24' aria-hidden='true'>
          <rect x='9' y='9' width='10' height='10' rx='2' />
          <path d='M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1' />
        </svg>
      );
    case 'delete':
      return (
        <svg className='radial-menu-icon-svg' viewBox='0 0 24 24' aria-hidden='true'>
          <path d='M4 7h16' />
          <path d='M10 11v6' />
          <path d='M14 11v6' />
          <path d='M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12' />
          <path d='M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' />
        </svg>
      );
    case 'pin':
      return (
        <svg className='radial-menu-icon-svg' viewBox='0 0 24 24' aria-hidden='true'>
          <path d='M8 4h8' />
          <path d='M9 4v4l-3 4h12l-3-4V4' />
          <path d='M12 12v8' />
        </svg>
      );
    case 'favorite':
      return (
        <svg className='radial-menu-icon-svg' viewBox='0 0 24 24' aria-hidden='true'>
          <path d='M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8z' />
        </svg>
      );
    case 'paste':
      return (
        <svg className='radial-menu-icon-svg' viewBox='0 0 24 24' aria-hidden='true'>
          <path d='M9 4h6' />
          <rect x='6' y='4' width='12' height='16' rx='2' />
          <path d='M12 10v6' />
          <path d='M9.5 13.5L12 16l2.5-2.5' />
        </svg>
      );
    default:
      return null;
  }
}
