# 服务层 API 使用矩阵

更新时间：2026/3/4 18:13:32

## 统计范围

- 服务文件：`src/services/tauri.ts`、`src/services/db.ts`
- 调用扫描范围：`src/**/*.ts`、`src/**/*.tsx`（不含服务文件自身）
- 统计口径：仅统计直接调用（`TauriService.method(` / `ClipboardDB.method(`）

## TauriService

| 方法 | 调用次数 | 调用文件 |
|---|---:|---|
| getAppSettings | 1 | `src/hud/radial-menu/RadialMenuApp.tsx` |
| setAppSettings | 0 | — |
| hideWindow | 1 | `src/contexts/UIContext.tsx` |
| showWindow | 1 | `src/contexts/UIContext.tsx` |
| getPosition | 1 | `src/contexts/UIContext.tsx` |
| setPosition | 1 | `src/contexts/UIContext.tsx` |
| moveOffScreen | 1 | `src/contexts/UIContext.tsx` |
| showDownloadHud | 1 | `src/contexts/UIContext.tsx` |
| hideDownloadHud | 1 | `src/contexts/UIContext.tsx` |
| positionDownloadHudNearCursor | 2 | `src/contexts/UIContext.tsx` |
| showClipItemHud | 1 | `src/hud/clipitem/useClipItemHudController.ts` |
| hideClipItemHud | 6 | `src/contexts/AppContext.tsx`，`src/contexts/UIContext.tsx`，`src/hud/clipitem/useClipItemHudController.ts` |
| isAppForegroundWindow | 2 | `src/hud/clipitem/useClipItemHudController.ts` |
| positionClipItemHudNearCursor | 1 | `src/hud/clipitem/useClipItemHudController.ts` |
| setClipItemHudMousePassthrough | 3 | `src/contexts/AppContext.tsx`，`src/hud/clipitem/useClipItemHudController.ts` |
| emitClipItemHudGlobalPointerMove | 0 | — |
| listenClipItemHudGlobalPointerMove | 0 | — |
| emitClipItemHudGlobalPointerUp | 0 | — |
| listenClipItemHudGlobalPointerUp | 0 | — |
| emitClipItemHudSnapshot | 1 | `src/hud/clipitem/useClipItemHudController.ts` |
| listenClipItemHudSnapshot | 1 | `src/hud/clipitem/ClipItemHudApp.tsx` |
| emitClipItemHudAction | 1 | `src/hud/clipitem/ClipItemHudApp.tsx` |
| listenClipItemHudAction | 1 | `src/contexts/AppContext.tsx` |
| showRadialMenu | 1 | `src/hud/clipitem/useClipItemHudController.ts` |
| hideRadialMenu | 2 | `src/hud/clipitem/useClipItemHudController.ts`，`src/hud/radial-menu/RadialMenuApp.tsx` |
| positionRadialMenuAtCursor | 1 | `src/hud/clipitem/useClipItemHudController.ts` |
| setRadialMenuMousePassthrough | 3 | `src/hud/clipitem/useClipItemHudController.ts`，`src/hud/radial-menu/RadialMenuApp.tsx` |
| emitRadialMenuGlobalPointerMove | 1 | `src/hud/clipitem/useClipItemHudController.ts` |
| listenRadialMenuGlobalPointerMove | 0 | — |
| emitRadialMenuGlobalPointerUp | 1 | `src/hud/clipitem/useClipItemHudController.ts` |
| listenRadialMenuGlobalPointerUp | 0 | — |
| emitRadialMenuSnapshot | 1 | `src/hud/clipitem/useClipItemHudController.ts` |
| listenRadialMenuSnapshot | 1 | `src/hud/radial-menu/RadialMenuApp.tsx` |
| emitRadialMenuAction | 1 | `src/hud/radial-menu/RadialMenuApp.tsx` |
| listenRadialMenuAction | 1 | `src/contexts/AppContext.tsx` |
| handleGlobalShortcut | 1 | `src/hooks/useShortcuts.ts` |
| listenMainWindowMoved | 1 | `src/hud/clipitem/useClipItemHudController.ts` |
| writeClipboard | 5 | `src/contexts/UIContext.tsx`，`src/hooks/useClipboard.ts`，`src/services/copyRouter.ts` |
| writeImageBase64 | 2 | `src/components/LargeImagePreview.tsx`，`src/services/copyRouter.ts` |
| saveClipboardImage | 1 | `src/components/LargeImagePreview.tsx` |
| captureClipboardSnapshot | 1 | `src/hooks/useClipboard.ts` |
| copyImageFromFile | 2 | `src/components/LargeImagePreview.tsx`，`src/services/copyRouter.ts` |
| copySvgFromFile | 1 | `src/services/copyRouter.ts` |
| downloadAndCopyImage | 3 | `src/contexts/UIContext.tsx`，`src/services/copyRouter.ts` |
| cancelImageDownload | 2 | `src/contexts/UIContext.tsx` |
| listenImageDownloadProgress | 2 | `src/contexts/UIContext.tsx`，`src/hud/download/DownloadHudApp.tsx` |
| copyBase64Image | 0 | — |
| copyLocalImage | 1 | `src/services/copyRouter.ts` |
| setImagePerformanceProfile | 0 | — |
| getImagePerformanceProfile | 1 | `src/components/SettingsModal.tsx` |
| setImageAdvancedConfig | 0 | — |
| getImageAdvancedConfig | 0 | — |
| copyFileToClipboard | 0 | — |
| copyFilesToClipboard | 1 | `src/services/copyRouter.ts` |
| pasteText | 2 | `src/contexts/AppContext.tsx`，`src/contexts/UIContext.tsx` |
| clickAndPaste | 1 | `src/contexts/UIContext.tsx` |
| registerShortcut | 1 | `src/hooks/useShortcuts.ts` |
| unregisterShortcut | 3 | `src/hooks/useShortcuts.ts` |
| unregisterAllShortcuts | 1 | `src/hooks/useShortcuts.ts` |
| openPath | 1 | `src/components/ClipItem/useUrlOpenState.ts` |
| openFile | 5 | `src/components/ClipItem/useUrlOpenState.ts`，`src/components/FileListDisplay.tsx`，`src/components/SettingsModal.tsx` |
| openFileLocation | 1 | `src/components/FileListDisplay.tsx` |
| getFileIcon | 1 | `src/components/FileListDisplay.tsx` |
| selectDirectory | 2 | `src/components/SettingsModal.tsx` |
| getImagesDirInfo | 2 | `src/components/SettingsModal.tsx` |
| getDbInfo | 1 | `src/components/SettingsModal.tsx` |
| moveDatabase | 2 | `src/components/SettingsModal.tsx` |

## ClipboardDB

| 方法 | 调用次数 | 调用文件 |
|---|---:|---|
| init | 1 | `src/contexts/ClipboardContext.tsx` |
| getStats | 1 | `src/hooks/useStats.ts` |
| getHistory | 1 | `src/contexts/ClipboardContext.tsx` |
| addClip | 2 | `src/components/ClipItem/useClipItemCallbacks.ts`，`src/contexts/ClipboardContext.tsx` |
| addClipAndGet | 1 | `src/hooks/useClipboard.ts` |
| togglePin | 1 | `src/contexts/ClipboardContext.tsx` |
| toggleFavorite | 1 | `src/contexts/ClipboardContext.tsx` |
| deleteClip | 1 | `src/contexts/ClipboardContext.tsx` |
| updateClip | 1 | `src/contexts/ClipboardContext.tsx` |
| updatePickedColor | 1 | `src/contexts/ClipboardContext.tsx` |
| clearAll | 1 | `src/contexts/ClipboardContext.tsx` |
| importData | 1 | `src/contexts/ClipboardContext.tsx` |
| getTags | 1 | `src/contexts/ClipboardContext.tsx` |
| createTag | 1 | `src/contexts/ClipboardContext.tsx` |
| updateTag | 1 | `src/contexts/ClipboardContext.tsx` |
| deleteTag | 1 | `src/contexts/ClipboardContext.tsx` |
| addTagToItem | 1 | `src/contexts/ClipboardContext.tsx` |
| removeTagFromItem | 1 | `src/contexts/ClipboardContext.tsx` |

## 零引用候选（TauriService）

- setAppSettings
- emitClipItemHudGlobalPointerMove
- listenClipItemHudGlobalPointerMove
- emitClipItemHudGlobalPointerUp
- listenClipItemHudGlobalPointerUp
- listenRadialMenuGlobalPointerMove
- listenRadialMenuGlobalPointerUp
- copyBase64Image
- setImagePerformanceProfile
- setImageAdvancedConfig
- getImageAdvancedConfig
- copyFileToClipboard

## 零引用候选（ClipboardDB）

- 无（全部方法在 `src/**` 中存在直接调用）

## 说明

- 该文档由脚本自动生成，请勿手工长期维护。
- 若采用动态属性访问或变量转发调用，本扫描不会命中。
