# ClipItem ColorPicker Styles

本目录承载 `ClipItem/ColorPicker` 子模块的样式实现。

## 文件职责

- `color-picker.css`：
  - `ColorPickerPopover` 外层壳体与 `react-colorful` 样式覆写
  - `ActionBar` 底部操作区
  - `ColorInputPanel` / `ChannelInput` 输入面板
  - `ColorModeSelector` 模式切换与下拉
  - `ColorPreview` 颜色预览与重置遮罩
  - `HistoryColors` 历史色块展开区

## 维护约定

- 组件内尽量使用语义化 class，不堆叠 Tailwind 原子类。
- 动态色值（颜色块背景等）继续用内联 `style`。
- 第三方组件（如 `react-colorful`）的定制样式统一放在本文件管理。
