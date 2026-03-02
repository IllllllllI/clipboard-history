import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ClipItemComponent } from '../ClipItem';
import type { ClipItem } from '../../types';
import { useAppContext } from '../../contexts/AppContext';

beforeEach(() => {
  global.IntersectionObserver = class IntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor() {}
  } as any;
});

vi.mock('../../contexts/AppContext', () => ({
  useAppContext: vi.fn(),
}));

vi.mock('../ImageDisplay', () => ({
  ImageDisplay: ({ item, onClick }: { item: ClipItem; onClick?: (text: string) => void }) => (
    <button type="button" data-testid="mock-image-display" onClick={() => onClick?.(item.text)}>
      {item.text}
    </button>
  ),
}));

const defaultSettings = {
  autoCapture: true,
  maxItems: 100,
  doubleClickPaste: true,
  darkMode: false,
  globalShortcut: 'Alt+V',
  immersiveShortcut: 'Alt+Z',
  autoClearDays: 0,
  hideOnAction: true,
  hideOnDrag: true,
  hideAfterDrag: true,
  showImagePreview: true,
  galleryDisplayMode: 'list',
  galleryScrollDirection: 'horizontal',
  galleryWheelMode: 'ctrl',
  galleryListMaxVisibleItems: 6,
  fileListMaxVisibleItems: 5,
};

const createMockContext = (overrides: Record<string, any> = {}) => ({
  settings: defaultSettings,
  selectedIndex: -1,
  searchQuery: '',
  copiedId: null,
  updateSettings: vi.fn(),
  loadHistory: vi.fn(),
  setSelectedIndex: vi.fn(),
  handleDoubleClick: vi.fn(),
  handleDragStart: vi.fn(),
  handleDragEnd: vi.fn(),
  handleTogglePin: vi.fn(),
  handleToggleFavorite: vi.fn(),
  copyToClipboard: vi.fn(),
  copyText: vi.fn(),
  handleRemove: vi.fn(),
  handleUpdatePickedColor: vi.fn(),
  setPreviewImageUrl: vi.fn(),
  setEditingClip: vi.fn(),
  tags: [],
  handleAddTagToItem: vi.fn(),
  handleRemoveTagFromItem: vi.fn(),
  ...overrides,
});

const createMultiImageItem = (): ClipItem => ({
  id: 42,
  text: 'https://example.com/a.png\nhttps://example.com/b.png',
  timestamp: Date.now(),
  is_pinned: 0,
  is_snippet: 0,
  is_favorite: 0,
  tags: [],
  picked_color: null,
});

const createFileListItem = (): ClipItem => ({
  id: 77,
  text: '[FILES]\nC:\\A\\one.txt\nC:\\B\\two.md',
  timestamp: Date.now(),
  is_pinned: 0,
  is_snippet: 0,
  is_favorite: 0,
  tags: [],
  picked_color: null,
});

const createLargeFileListItem = (): ClipItem => ({
  id: 78,
  text: '[FILES]\nC:\\A\\one.txt\nC:\\B\\two.md\nC:\\C\\three.pdf',
  timestamp: Date.now(),
  is_pinned: 0,
  is_snippet: 0,
  is_favorite: 0,
  tags: [],
  picked_color: null,
});

describe('ClipItem + ImageGallery list interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('点击列表行时调用 copyToClipboard(item)', () => {
    const mockCopyToClipboard = vi.fn();
    const item = createMultiImageItem();
    (useAppContext as any).mockReturnValue(
      createMockContext({
        selectedIndex: 0,
        copyToClipboard: mockCopyToClipboard,
      }),
    );

    const { container } = render(<ClipItemComponent item={item} index={0} />);
    const listRows = container.querySelectorAll('.img-gallery__list-row');
    expect(listRows).toHaveLength(2);

    fireEvent.click(listRows[0]);

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: item.id,
        text: 'https://example.com/a.png',
      }),
      { suppressCopiedIdFeedback: true },
    );
  });

  it('点击缩略图时只调用 setPreviewImageUrl，不触发复制', () => {
    const mockCopyToClipboard = vi.fn();
    const mockSetPreviewImageUrl = vi.fn();
    const item = createMultiImageItem();
    (useAppContext as any).mockReturnValue(
      createMockContext({
        selectedIndex: 0,
        copyToClipboard: mockCopyToClipboard,
        setPreviewImageUrl: mockSetPreviewImageUrl,
      }),
    );

    const { container } = render(<ClipItemComponent item={item} index={0} />);
    const thumbButtons = container.querySelectorAll('.img-gallery__list-row-thumb-btn');
    expect(thumbButtons).toHaveLength(2);

    fireEvent.click(thumbButtons[1]);

    expect(mockSetPreviewImageUrl).toHaveBeenCalledWith('https://example.com/b.png');
    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it('轮播模式点击复制当前图片时按当前索引复制单图', () => {
    const mockCopyToClipboard = vi.fn();
    const item = createMultiImageItem();
    (useAppContext as any).mockReturnValue(
      createMockContext({
        selectedIndex: 0,
        copyToClipboard: mockCopyToClipboard,
        settings: {
          ...defaultSettings,
          galleryDisplayMode: 'carousel',
        },
      }),
    );

    const { container } = render(<ClipItemComponent item={item} index={0} />);

    fireEvent.click(container.querySelector('button[aria-label="下一张"]')!);
    fireEvent.click(container.querySelector('button[title="复制当前图片"]')!);

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: item.id,
        text: 'https://example.com/b.png',
      }),
      { suppressCopiedIdFeedback: true },
    );
  });

  it('文件列表模式点击条目时复制单条文件路径并触发本地 copied 态', () => {
    const mockCopyToClipboard = vi.fn();
    const item = createFileListItem();
    (useAppContext as any).mockReturnValue(
      createMockContext({
        selectedIndex: 0,
        copyToClipboard: mockCopyToClipboard,
      }),
    );

    const { container } = render(<ClipItemComponent item={item} index={0} />);
    const fileRows = container.querySelectorAll('.file-list-item');
    expect(fileRows).toHaveLength(2);

    fireEvent.click(fileRows[0]);

    expect(mockCopyToClipboard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: item.id,
        text: '[FILES]\nC:\\A\\one.txt',
      }),
      { suppressCopiedIdFeedback: true },
    );
    expect(fileRows[0].getAttribute('data-copied')).toBe('true');
    expect(container.querySelectorAll('.file-list-item__copy-mark[data-visible="true"]')).toHaveLength(1);
  });

  it('文件列表支持按设置折叠并可展开/收起', () => {
    const item = createLargeFileListItem();
    (useAppContext as any).mockReturnValue(
      createMockContext({
        selectedIndex: 0,
        settings: {
          ...defaultSettings,
          fileListMaxVisibleItems: 1,
        },
      }),
    );

    const { container } = render(<ClipItemComponent item={item} index={0} />);
    expect(container.querySelectorAll('.file-list-item')).toHaveLength(1);

    fireEvent.click(container.querySelector('.file-list-display__toggle-btn')!);
    expect(container.querySelectorAll('.file-list-item')).toHaveLength(3);

    fireEvent.click(container.querySelector('.file-list-display__toggle-btn')!);
    expect(container.querySelectorAll('.file-list-item')).toHaveLength(1);
  });

  it('文件列表拖拽单条目时应走单文件拖拽链路', () => {
    const item = createFileListItem();
    const mockHandleDragStart = vi.fn();
    (useAppContext as any).mockReturnValue(
      createMockContext({
        selectedIndex: 0,
        handleDragStart: mockHandleDragStart,
      }),
    );

    const { container } = render(<ClipItemComponent item={item} index={0} />);
    const fileRows = container.querySelectorAll('.file-list-item');
    expect(fileRows).toHaveLength(2);

    fireEvent.dragStart(fileRows[1]);

    expect(mockHandleDragStart).toHaveBeenCalledTimes(1);
    expect(mockHandleDragStart).toHaveBeenCalledWith(expect.anything(), 'C:\\B\\two.md');
  });

  it('图片列表拖拽单条目时应走单条 URL 拖拽链路', () => {
    const item = createMultiImageItem();
    const mockHandleDragStart = vi.fn();
    (useAppContext as any).mockReturnValue(
      createMockContext({
        selectedIndex: 0,
        handleDragStart: mockHandleDragStart,
      }),
    );

    const { container } = render(<ClipItemComponent item={item} index={0} />);
    const imageRows = container.querySelectorAll('.img-gallery__list-row');
    expect(imageRows).toHaveLength(2);

    fireEvent.dragStart(imageRows[1]);

    expect(mockHandleDragStart).toHaveBeenCalledTimes(1);
    expect(mockHandleDragStart).toHaveBeenCalledWith(expect.anything(), 'https://example.com/b.png');
  });

  it('图片轮播模式拖拽主图时应走当前图片 URL 拖拽链路', () => {
    const item = createMultiImageItem();
    const mockHandleDragStart = vi.fn();
    (useAppContext as any).mockReturnValue(
      createMockContext({
        selectedIndex: 0,
        handleDragStart: mockHandleDragStart,
        settings: {
          ...defaultSettings,
          galleryDisplayMode: 'carousel',
        },
      }),
    );

    const { container } = render(<ClipItemComponent item={item} index={0} />);
    fireEvent.click(container.querySelector('button[aria-label="下一张"]')!);
    fireEvent.dragStart(container.querySelector('.img-gallery__main-image')!);

    expect(mockHandleDragStart).toHaveBeenCalledTimes(1);
    expect(mockHandleDragStart).toHaveBeenCalledWith(expect.anything(), 'https://example.com/b.png');
  });

  it('图片宫格模式拖拽单格时应走对应图片 URL 拖拽链路', () => {
    const item = createMultiImageItem();
    const mockHandleDragStart = vi.fn();
    (useAppContext as any).mockReturnValue(
      createMockContext({
        selectedIndex: 0,
        handleDragStart: mockHandleDragStart,
        settings: {
          ...defaultSettings,
          galleryDisplayMode: 'grid',
        },
      }),
    );

    const { container } = render(<ClipItemComponent item={item} index={0} />);
    const gridCells = container.querySelectorAll('.img-gallery__grid-cell');
    expect(gridCells).toHaveLength(2);

    fireEvent.dragStart(gridCells[1]);

    expect(mockHandleDragStart).toHaveBeenCalledTimes(1);
    expect(mockHandleDragStart).toHaveBeenCalledWith(expect.anything(), 'https://example.com/b.png');
  });
});
