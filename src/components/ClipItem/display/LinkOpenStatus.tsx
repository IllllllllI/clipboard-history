import React from 'react';
import { ExternalLink, Loader2, CircleCheck, CircleAlert } from 'lucide-react';

interface LinkOpenStatusProps {
  state: 'idle' | 'opening' | 'success' | 'error';
}

export const LinkOpenStatus = React.memo(function LinkOpenStatus({ state }: LinkOpenStatusProps) {
  if (state === 'opening') {
    return <Loader2 className="clip-item-content-icon-12 clip-item-content-link-status-spin" />;
  }

  if (state === 'success') {
    return <CircleCheck className="clip-item-content-icon-12" />;
  }

  if (state === 'error') {
    return <CircleAlert className="clip-item-content-icon-12" />;
  }

  return <ExternalLink className="clip-item-content-icon-12 clip-item-content-link-fade" />;
});
