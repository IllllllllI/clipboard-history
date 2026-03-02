import { AppSettings } from '../types';

export const COPY_FEEDBACK_DURATION_MS = 2000;

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
  showDragDownloadHud: true,
  prefetchImageOnDragStart: false,
  showImagePreview: true,
  imagesDir: '',
  imagePerformanceProfile: 'balanced',
  allowPrivateNetwork: false,
  resolveDnsForUrlSafety: true,
  maxDecodedBytes: 160 * 1024 * 1024,
  imageConnectTimeout: 8,
  imageFirstByteTimeoutMs: 10_000,
  imageChunkTimeoutMs: 15_000,
  imageClipboardRetryMaxTotalMs: 1_800,
  imageClipboardRetryMaxDelayMs: 900,
  clipboardEventMinIntervalMs: 80,
  galleryDisplayMode: 'carousel',
  galleryScrollDirection: 'horizontal',
  galleryWheelMode: 'ctrl',
  windowPlacement: {
    mode: 'smart_near_cursor',
    customX: 120,
    customY: 120,
  },
};
