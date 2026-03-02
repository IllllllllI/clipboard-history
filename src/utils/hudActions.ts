import { invoke } from '@tauri-apps/api/core';

export const performActionOnClipItem = async (actionId: string, item: any) => {
    console.log('Action performed', actionId, item);
    const closeHud = () => invoke('close_clipitem_hud');
    
    if (actionId === 'copy') {
      await invoke('copy_clip_by_id', { id: item.id });
    }
    if (actionId === 'delete') {
      await invoke('delete_clip_by_id', { id: item.id });
    }
    if (actionId === 'pin') {
      await invoke('toggle_pin_clip', { id: item.id });
    }
    if (actionId === 'favorite') {
      await invoke('toggle_favorite_clip', { id: item.id });
    }
    if (actionId === 'paste') {
      await invoke('paste_clip_by_id', { id: item.id });
    }
    
    await closeHud();
};
