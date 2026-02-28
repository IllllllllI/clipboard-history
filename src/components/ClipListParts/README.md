# ClipListParts

`ClipList` 的子模块目录，用于降低父组件复杂度。

## 文件职责

- `EmptyState.tsx`：列表为空时的占位视图。
- `VirtualizedClipRow.tsx`：虚拟列表单行的定位壳与 `ClipItemComponent` 渲染。
- `index.ts`：统一导出入口，供 `ClipList` 按模块导入。

## 维护约定

- `ClipList` 仅保留虚拟滚动、键盘滚动同步、数据编排逻辑。
- 可复用的展示子项优先放到本目录，避免回填到父组件。
- 子模块保持纯展示/薄逻辑，业务状态继续由上层上下文提供。
