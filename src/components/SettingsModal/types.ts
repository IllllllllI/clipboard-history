import type React from 'react';
import type { AppSettings, AppStats, WindowPlacementMode, ImagePerformanceProfile } from '../../types';

export interface SettingToggle {
  key: keyof AppSettings;
  title: string;
  desc: string;
}

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

export interface ImagePerformanceOption {
  value: ImagePerformanceProfile;
  label: string;
  desc: string;
}

export interface WindowPlacementOption {
  value: WindowPlacementMode;
  label: string;
  desc: string;
}

export interface ToggleSwitchProps {
  dark: boolean;
  on: boolean;
  onToggle: () => void;
}

export interface SettingRowProps {
  title: string;
  desc: string;
  children: React.ReactNode;
}

export interface GeneralSettingsPanelProps {
  dark: boolean;
  stats: AppStats;
  settings: AppSettings;
  toggleSettings: SettingToggle[];
  autoClearOptions: Option<number>[];
  updateSettings: (updates: Partial<AppSettings>) => void;
  ToggleSwitch: React.ComponentType<ToggleSwitchProps>;
  SettingRow: React.ComponentType<SettingRowProps>;
}

export interface ShortcutRecorderProps {
  dark: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  isRegistering?: boolean;
  validateRegistration?: boolean;
}

export interface ShortcutSettingsPanelProps {
  dark: boolean;
  settings: AppSettings;
  globalShortcutError: string | null;
  immersiveShortcutError: string | null;
  shortcutRegistering: boolean;
  updateSettings: (updates: Partial<AppSettings>) => void;
  ShortcutRecorder: React.ComponentType<ShortcutRecorderProps>;
}

export interface WindowSettingsPanelProps {
  dark: boolean;
  settings: AppSettings;
  toggleSettingsAfterShortcut: SettingToggle[];
  windowPlacementOptions: WindowPlacementOption[];
  selectedPlacementLabel?: string;
  isCustomPlacement: boolean;
  isCustomAnchorPlacement: boolean;
  updateSettings: (updates: Partial<AppSettings>) => void;
  ToggleSwitch: React.ComponentType<ToggleSwitchProps>;
  SettingRow: React.ComponentType<SettingRowProps>;
}

export interface PathSelectorProps {
  dark: boolean;
  title: string;
  description: string;
  displayPath: string;
  statusText?: string;
  loading?: boolean;
  showReset: boolean;
  onOpen: () => void;
  onSelect: () => void;
  onReset: () => void;
}

export interface StorageSettingsPanelProps {
  dark: boolean;
  settings: AppSettings;
  minDecodedMb: number;
  decodedMb: number;
  imagePerformanceOptions: ImagePerformanceOption[];
  backendProfileSyncState: 'syncing' | 'synced' | 'failed';
  backendProfileError: string | null;
  backendImageProfile: AppSettings['imagePerformanceProfile'] | null;
  imagesPath: string;
  imagesStatusText?: string;
  showImagesReset: boolean;
  dbPath: string;
  dbStatusText?: string;
  dbMoving: boolean;
  updateSettings: (updates: Partial<AppSettings>) => void;
  onRetryBackendProfile: () => void;
  onOpenImagesDir: () => void;
  onSelectImagesDir: () => void;
  onResetImagesDir: () => void;
  onOpenDbDir: () => void;
  onSelectDbDir: () => void;
  onResetDbDir: () => void;
  onExportData: () => void;
  onImportData: (e: React.ChangeEvent<HTMLInputElement>) => void;
  ToggleSwitch: React.ComponentType<ToggleSwitchProps>;
  SettingRow: React.ComponentType<SettingRowProps>;
  PathSelector: React.ComponentType<PathSelectorProps>;
}
