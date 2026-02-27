import React from 'react';
import { Loader2 } from 'lucide-react';
import type { StorageSettingsPanelProps } from './types';

export function StorageSettingsPanel({
  dark,
  settings,
  minDecodedMb,
  decodedMb,
  imagePerformanceOptions,
  backendProfileSyncState,
  backendProfileError,
  backendImageProfile,
  imagesPath,
  imagesStatusText,
  showImagesReset,
  dbPath,
  dbStatusText,
  dbMoving,
  updateSettings,
  onRetryBackendProfile,
  onOpenImagesDir,
  onSelectImagesDir,
  onResetImagesDir,
  onOpenDbDir,
  onSelectDbDir,
  onResetDbDir,
  onExportData,
  onImportData,
  ToggleSwitch,
  SettingRow,
  PathSelector,
}: StorageSettingsPanelProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">图片设置</h3>

        <SettingRow title="显示图片预览" desc="在列表中显示图片或图片链接的预览">
          <ToggleSwitch dark={dark} on={!!settings.showImagePreview} onToggle={() => updateSettings({ showImagePreview: !settings.showImagePreview })} />
        </SettingRow>

        <div className="space-y-2">
          <p className="font-medium text-sm">图片处理性能档位</p>
          <select
            value={settings.imagePerformanceProfile}
            onChange={(e) => updateSettings({ imagePerformanceProfile: e.target.value as typeof settings.imagePerformanceProfile })}
            className={`w-full p-2 rounded-lg border text-sm outline-none ${dark ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-neutral-50 border-neutral-200'}`}
          >
            {imagePerformanceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="text-xs text-neutral-500">
            {imagePerformanceOptions.find((opt) => opt.value === settings.imagePerformanceProfile)?.desc}
          </p>
          {backendProfileSyncState === 'failed' ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-red-500">后端已生效：获取失败（{backendProfileError ?? '未知错误'}）</p>
              <button
                type="button"
                onClick={onRetryBackendProfile}
                className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${dark ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'}`}
              >
                重试
              </button>
            </div>
          ) : (
            <div className={`text-xs flex items-center gap-1.5 ${backendProfileSyncState === 'synced' ? 'text-emerald-500' : 'text-amber-500'}`}>
              {backendProfileSyncState === 'syncing' && <Loader2 className="w-3 h-3 animate-spin" />}
              <span>
                后端已生效：
                {imagePerformanceOptions.find((opt) => opt.value === (backendImageProfile ?? settings.imagePerformanceProfile))?.label ?? '未知'}
                {backendProfileSyncState === 'synced' ? '（已同步）' : '（同步中）'}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <p className="font-medium text-sm">图片处理高级配置</p>

          <SettingRow
            title="允许内网地址"
            desc="开启后允许访问 127.0.0.1/内网网段图片链接（存在 SSRF 风险）"
          >
            <ToggleSwitch
              dark={dark}
              on={settings.allowPrivateNetwork}
              onToggle={() => updateSettings({ allowPrivateNetwork: !settings.allowPrivateNetwork })}
            />
          </SettingRow>

          <SettingRow
            title="DNS 解析安全校验"
            desc="校验域名解析结果是否落入内网/本地地址，建议保持开启"
          >
            <ToggleSwitch
              dark={dark}
              on={settings.resolveDnsForUrlSafety}
              onToggle={() => updateSettings({ resolveDnsForUrlSafety: !settings.resolveDnsForUrlSafety })}
            />
          </SettingRow>

          <div className="space-y-2">
            <p className="font-medium text-sm">解码内存上限（MB）</p>
            <input
              type="number"
              min={minDecodedMb}
              step={8}
              value={decodedMb}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value || `${minDecodedMb}`, 10);
                const nextMb = Number.isFinite(parsed) ? Math.max(minDecodedMb, parsed) : minDecodedMb;
                updateSettings({ maxDecodedBytes: nextMb * 1024 * 1024 });
              }}
              className={`w-full p-2 rounded-lg border text-sm outline-none ${dark ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-neutral-50 border-neutral-200'}`}
            />
            <p className="text-xs text-neutral-500">最小 {minDecodedMb}MB；值越大可处理更大图片，但峰值内存也会增加</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">存储路径</h3>
        <PathSelector
          dark={dark}
          title="图片保存路径"
          description="设置图片和 SVG 文件的保存位置"
          displayPath={imagesPath}
          statusText={imagesStatusText}
          showReset={showImagesReset}
          onOpen={onOpenImagesDir}
          onSelect={onSelectImagesDir}
          onReset={onResetImagesDir}
        />

        <PathSelector
          dark={dark}
          title="数据库路径"
          description="更改数据库存储位置（会自动移动数据）"
          displayPath={dbPath}
          statusText={dbStatusText}
          loading={dbMoving}
          showReset
          onOpen={onOpenDbDir}
          onSelect={onSelectDbDir}
          onReset={onResetDbDir}
        />
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">数据管理</h3>
        <div className="flex gap-3">
          <button
            onClick={onExportData}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${dark ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-neutral-100 hover:bg-neutral-200'}`}
          >导出数据</button>
          <label className={`flex-1 py-2 rounded-lg text-xs font-semibold text-center cursor-pointer transition-all ${dark ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-neutral-100 hover:bg-neutral-200'}`}>
            导入数据
            <input type="file" accept=".json" onChange={onImportData} className="hidden" />
          </label>
        </div>
      </div>
    </div>
  );
}
