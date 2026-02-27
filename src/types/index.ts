export interface Tag {
  id: number;
  name: string;
  color: string | null;
}

export type ImagePerformanceProfile = 'quality' | 'balanced' | 'speed';

export interface ImageAdvancedConfig {
  allow_private_network: boolean;
  resolve_dns_for_url_safety: boolean;
  max_decoded_bytes: number;
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
  showImagePreview: boolean;
  imagesDir: string; // Directory to save images, empty string for default
  imagePerformanceProfile: ImagePerformanceProfile;
  allowPrivateNetwork: boolean;
  resolveDnsForUrlSafety: boolean;
  maxDecodedBytes: number;
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
