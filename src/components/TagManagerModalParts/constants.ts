import { Tag } from '../../types';

export const TAG_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#0284c7', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e',
];

export const toTagStyle = (color: string | null, dark: boolean) => {
  if (!color) {
    return dark
      ? {
          backgroundColor: 'rgba(64,64,64,0.9)',
          borderColor: 'rgba(255,255,255,0.08)',
          color: 'rgb(212 212 212)',
        }
      : {
          backgroundColor: 'rgba(245,245,245,0.95)',
          borderColor: 'rgba(0,0,0,0.08)',
          color: 'rgb(82 82 82)',
        };
  }

  return {
    backgroundColor: `${color}1A`,
    borderColor: `${color}55`,
    color,
  };
};

export interface TagEditorValue {
  name: string;
  color: string | null;
}

export interface TagEditorTarget {
  id?: number;
  mode: 'create' | 'edit';
  initial: TagEditorValue;
}

export const getTagInitialValue = (tag: Tag): TagEditorValue => ({
  name: tag.name,
  color: tag.color,
});
