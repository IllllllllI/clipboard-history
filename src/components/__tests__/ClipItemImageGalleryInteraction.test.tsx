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
});
