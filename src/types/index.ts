export interface Tag {
  id: number;
  name: string;
  color: string | null;
}

export type WindowPlacementMode =
  | 'smart_near_cursor'
  | 'cursor_top_left'
  | 'cursor_center'
  | 'custom_anchor'
  | 'monitor_center'
  | 'screen_center'
  | 'custom'
  | 'last_position';

export interface WindowPlacementSettings {
  mode: WindowPlacementMode;
  customX: number;
  customY: number;
}

export type ImagePerformanceProfile = 'quality' | 'balanced' | 'speed';

export type GalleryDisplayMode = 'grid' | 'carousel' | 'list';
export type GalleryScrollDirection = 'horizontal' | 'vertical';
export type GalleryWheelMode = 'always' | 'ctrl';

export interface ImageAdvancedConfig {
  allow_private_network: boolean;
  resolve_dns_for_url_safety: boolean;
  max_decoded_bytes: number;
  connect_timeout: number;
  stream_first_byte_timeout_ms: number;
  stream_chunk_timeout_ms: number;
  clipboard_retry_max_total_ms: number;
  clipboard_retry_max_delay_ms: number;
}

export interface ClipItem {
  id: number;
  text: string;
  timestamp: number;
  is_pinned: number; // 0 or 1
  is_snippet: number; // 0 or 1
  is_favorite: number; // 0 or 1
  tags: Tag[]; // defaults to [] from backend
  /** 用户在调色板中选择的颜色（不覆盖原始 text） */
  picked_color: string | null;
}

export interface AppSettings {
  autoCapture: boolean;
  maxItems: number;
  doubleClickPaste: boolean;
  darkMode: boolean;
  globalShortcut: string;
  immersiveShortcut: string;
  autoClearDays: number; // 0 for disabled
  hideOnAction: boolean; // For double click
  hideOnDrag: boolean;   // For hiding during drag
  hideAfterDrag: boolean; // For hiding after drag
  showDragDownloadHud: boolean; // Show floating download HUD when main window is hidden during drag
  prefetchImageOnDragStart: boolean; // Start URL image download when drag starts
  showImagePreview: boolean;
  imagesDir: string; // Directory to save images, empty string for default
  imagePerformanceProfile: ImagePerformanceProfile;
  allowPrivateNetwork: boolean;
  resolveDnsForUrlSafety: boolean;
  maxDecodedBytes: number;
  imageConnectTimeout: number;
  imageFirstByteTimeoutMs: number;
  imageChunkTimeoutMs: number;
  imageClipboardRetryMaxTotalMs: number;
  imageClipboardRetryMaxDelayMs: number;
  clipboardEventMinIntervalMs: number;
  galleryDisplayMode: GalleryDisplayMode;
  galleryScrollDirection: GalleryScrollDirection;
  galleryWheelMode: GalleryWheelMode;
  galleryListMaxVisibleItems: number;
  windowPlacement: WindowPlacementSettings;
}

export interface AppStats {
  total: number;
  today: number;
  pinned: number;
  favorites: number;
}
export enum ImageType {
  None = 'none',           // 非图片内容
  HttpUrl = 'http_url',    // http/https链接图片
  Base64 = 'base64',       // data:image/... base64图片
  LocalFile = 'local_file' // 本地图片文件路径
}

export interface DownloadState {
  isDownloading: boolean;
  progress: number;  // 0-100
  error: string | null;
}

export type ImageDownloadErrorCode =
  | 'E_NET_REQUEST'
  | 'E_NET_TIMEOUT'
  | 'E_FORMAT_INVALID'
  | 'E_DECODE_FAILED'
  | 'E_CLIPBOARD_BUSY'
  | 'E_CLIPBOARD_WRITE'
  | 'E_FILE_IO'
  | 'E_RESOURCE_LIMIT'
  | 'E_CANCELLED';

export interface ImageDownloadProgressEvent {
  request_id: string;
  progress: number;
  downloaded_bytes: number;
  total_bytes: number | null;
  status: 'downloading' | 'completed' | 'cancelled' | 'failed';
  stage?: 'download' | 'format' | 'decode' | 'clipboard' | 'resource' | 'unknown';
  error_code?: ImageDownloadErrorCode;
  error_message?: string;
}
