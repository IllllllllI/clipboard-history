import { AppSettings } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  autoCapture: true,
  maxItems: 100,
  doubleClickPaste: true,
  darkMode: false,
  globalShortcut: 'Alt+V',
  immersiveShortcut: 'Ctrl+Shift+Z',
  autoClearDays: 30,
  hideOnAction: true,
  hideOnDrag: true,
  hideAfterDrag: true,
  showImagePreview: true,
  imagesDir: '',
  imagePerformanceProfile: 'balanced',
  allowPrivateNetwork: false,
  resolveDnsForUrlSafety: true,
  maxDecodedBytes: 160 * 1024 * 1024,
  windowPlacement: {
    mode: 'smart_near_cursor',
    customX: 120,
    customY: 120,
  },
};
