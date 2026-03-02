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
    <div className="sm-panel__stack">
      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">图片设置</h3>

        <SettingRow title="显示图片预览" desc="在列表中显示图片或图片链接的预览">
          <ToggleSwitch dark={dark} on={!!settings.showImagePreview} onToggle={() => updateSettings({ showImagePreview: !settings.showImagePreview })} />
        </SettingRow>

        <div className="sm-panel__block--tight">
          <p className="sm-panel__label">图片处理性能档位</p>
          <select
            value={settings.imagePerformanceProfile}
            onChange={(e) => updateSettings({ imagePerformanceProfile: e.target.value as typeof settings.imagePerformanceProfile })}
            className="sm-field__select"
            data-theme={dark ? 'dark' : 'light'}
          >
            {imagePerformanceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <p className="sm-panel__muted">
            {imagePerformanceOptions.find((opt) => opt.value === settings.imagePerformanceProfile)?.desc}
          </p>
          {backendProfileSyncState === 'failed' ? (
            <div className="sm-sync__row">
              <p className="sm-sync__error">后端已生效：获取失败（{backendProfileError ?? '未知错误'}）</p>
              <button
                type="button"
                onClick={onRetryBackendProfile}
                className="sm-sync__retry-btn"
                data-theme={dark ? 'dark' : 'light'}
              >
                重试
              </button>
            </div>
          ) : (
            <div className="sm-sync__status" data-state={backendProfileSyncState === 'synced' ? 'synced' : 'syncing'}>
              {backendProfileSyncState === 'syncing' && <Loader2 className="sm-sync__spinner" />}
              <span>
                后端已生效：
                {imagePerformanceOptions.find((opt) => opt.value === (backendImageProfile ?? settings.imagePerformanceProfile))?.label ?? '未知'}
                {backendProfileSyncState === 'synced' ? '（已同步）' : '（同步中）'}
              </span>
            </div>
          )}
        </div>

        <div className="sm-panel__stack">
          <p className="sm-panel__label">常用调优</p>

          <div className="sm-panel__block--tight">
            <p className="sm-panel__label">剪贴板刷新灵敏度（毫秒）</p>
            <input
              type="number"
              min={20}
              max={5000}
              step={10}
              value={settings.clipboardEventMinIntervalMs}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value || '80', 10);
                const nextVal = Number.isFinite(parsed) ? Math.min(5000, Math.max(20, parsed)) : 80;
                updateSettings({ clipboardEventMinIntervalMs: nextVal });
              }}
              className="sm-field__number"
              data-theme={dark ? 'dark' : 'light'}
            />
            <p className="sm-panel__muted">控制外部剪贴板变化触发列表刷新的最小间隔；越小越及时，越大越稳定（默认 80ms，建议 60~120ms）</p>
          </div>

          <div className="sm-panel__block--tight">
            <p className="sm-panel__label">解码内存上限（MB）</p>
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
              className="sm-field__number"
              data-theme={dark ? 'dark' : 'light'}
            />
            <p className="sm-panel__muted">最小 {minDecodedMb}MB；值越大可处理更大图片，但峰值内存也会增加</p>
          </div>

          <p className="sm-panel__label">高级网络与重试（一般无需修改）</p>

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

          <div className="sm-panel__block--tight">
            <p className="sm-panel__label">连接超时（秒）</p>
            <input
              type="number"
              min={1}
              max={120}
              step={1}
              value={settings.imageConnectTimeout}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value || '8', 10);
                const nextVal = Number.isFinite(parsed) ? Math.min(120, Math.max(1, parsed)) : 8;
                updateSettings({ imageConnectTimeout: nextVal });
              }}
              className="sm-field__number"
              data-theme={dark ? 'dark' : 'light'}
            />
            <p className="sm-panel__muted">建立网络连接（TCP/TLS）允许等待的最长时间</p>
          </div>

          <div className="sm-panel__block--tight">
            <p className="sm-panel__label">首包超时（毫秒）</p>
            <input
              type="number"
              min={500}
              max={120000}
              step={100}
              value={settings.imageFirstByteTimeoutMs}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value || '10000', 10);
                const nextVal = Number.isFinite(parsed) ? Math.min(120000, Math.max(500, parsed)) : 10000;
                updateSettings({ imageFirstByteTimeoutMs: nextVal });
              }}
              className="sm-field__number"
              data-theme={dark ? 'dark' : 'light'}
            />
            <p className="sm-panel__muted">发起请求后，等待服务器返回第一段数据的最长时间</p>
          </div>

          <div className="sm-panel__block--tight">
            <p className="sm-panel__label">分块读取超时（毫秒）</p>
            <input
              type="number"
              min={500}
              max={120000}
              step={100}
              value={settings.imageChunkTimeoutMs}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value || '15000', 10);
                const nextVal = Number.isFinite(parsed) ? Math.min(120000, Math.max(500, parsed)) : 15000;
                updateSettings({ imageChunkTimeoutMs: nextVal });
              }}
              className="sm-field__number"
              data-theme={dark ? 'dark' : 'light'}
            />
            <p className="sm-panel__muted">下载过程中每一段数据允许的最长间隔，超时会判定下载失败</p>
          </div>

          <div className="sm-panel__block--tight">
            <p className="sm-panel__label">剪贴板重试总预算（毫秒）</p>
            <input
              type="number"
              min={200}
              max={30000}
              step={50}
              value={settings.imageClipboardRetryMaxTotalMs}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value || '1800', 10);
                const nextVal = Number.isFinite(parsed) ? Math.min(30000, Math.max(200, parsed)) : 1800;
                updateSettings({
                  imageClipboardRetryMaxTotalMs: nextVal,
                  imageClipboardRetryMaxDelayMs: Math.min(settings.imageClipboardRetryMaxDelayMs, nextVal),
                });
              }}
              className="sm-field__number"
              data-theme={dark ? 'dark' : 'light'}
            />
            <p className="sm-panel__muted">限制一次图片复制在“写入剪贴板阶段”最多可花费的重试时间</p>
          </div>

          <div className="sm-panel__block--tight">
            <p className="sm-panel__label">单次重试延迟上限（毫秒）</p>
            <input
              type="number"
              min={10}
              max={5000}
              step={10}
              value={settings.imageClipboardRetryMaxDelayMs}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value || '900', 10);
                const nextVal = Number.isFinite(parsed) ? Math.min(5000, Math.max(10, parsed)) : 900;
                updateSettings({ imageClipboardRetryMaxDelayMs: Math.min(nextVal, settings.imageClipboardRetryMaxTotalMs) });
              }}
              className="sm-field__number"
              data-theme={dark ? 'dark' : 'light'}
            />
            <p className="sm-panel__muted">重试间隔会逐步增大，该值限制“单次最多等待多久”</p>
          </div>

        </div>
      </section>

      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">存储路径</h3>
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
      </section>

      <section className="sm-panel__section" data-theme={dark ? 'dark' : 'light'}>
        <h3 className="sm-panel__section-title">数据管理</h3>
        <div className="sm-data__actions">
          <button
            onClick={onExportData}
            className="sm-data__export-btn"
            data-theme={dark ? 'dark' : 'light'}
          >导出数据</button>
          <label className="sm-data__import-label" data-theme={dark ? 'dark' : 'light'}>
            导入数据
            <input type="file" accept=".json" onChange={onImportData} className="sm-data__file-input" />
          </label>
        </div>
      </section>
    </div>
  );
}
