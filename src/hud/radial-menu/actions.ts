import type { ClipItemHudActionType, RadialMenuSnapshot } from '../../types';

export type RadialMenuActionId = Extract<ClipItemHudActionType, 'copy' | 'delete' | 'pin' | 'favorite' | 'paste'>;
export type RadialMenuActionTone = 'normal' | 'danger';

export interface RadialMenuActionItem {
  id: RadialMenuActionId;
  label: string;
  tone: RadialMenuActionTone;
  angle: number;
}

interface BuildRadialMenuActionsInput {
  isPinned: RadialMenuSnapshot['isPinned'];
  isFavorite: RadialMenuSnapshot['isFavorite'];
}

const RADIAL_MENU_ACTION_BASE: Array<Omit<RadialMenuActionItem, 'angle'>> = [
  { id: 'copy', label: '复制', tone: 'normal' },
  { id: 'delete', label: '删除', tone: 'danger' },
  { id: 'pin', label: '置顶', tone: 'normal' },
  { id: 'favorite', label: '收藏', tone: 'normal' },
  { id: 'paste', label: '粘贴', tone: 'normal' },
];

export function buildRadialMenuActions(input: BuildRadialMenuActionsInput): RadialMenuActionItem[] {
  return RADIAL_MENU_ACTION_BASE.map((action, index, arr) => {
    const dynamicLabel =
      action.id === 'pin'
        ? (input.isPinned ? '取消置顶' : '置顶')
        : action.id === 'favorite'
          ? (input.isFavorite ? '取消收藏' : '收藏')
          : action.label;

    return {
      ...action,
      label: dynamicLabel,
      angle: (360 / arr.length) * index,
    };
  });
}
