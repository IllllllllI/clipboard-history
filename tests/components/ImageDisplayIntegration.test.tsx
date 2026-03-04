import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClipItemComponent } from '../../src/components/ClipItem';
import { ClipItem } from '../../src/types';
import { useSettingsContext } from '../../src/contexts/SettingsContext';
import { useClipboardContext } from '../../src/contexts/ClipboardContext';
import { useUIContext } from '../../src/contexts/UIContext';

// Mock motion/react
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock IntersectionObserver
beforeEach(() => {
  global.IntersectionObserver = class IntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor() {}
  } as any;
});

// Mock fine-grained contexts
vi.mock('../../src/contexts/SettingsContext', () => ({
  useSettingsContext: vi.fn(),
}));
vi.mock('../../src/contexts/ClipboardContext', () => ({
  useClipboardContext: vi.fn(),
}));
vi.mock('../../src/contexts/UIContext', () => ({
  useUIContext: vi.fn(),
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
};

describe('Image Display Integration Tests', () => {
  const defaultSettingsCtx = {
    settings: defaultSettings,
    updateSettings: vi.fn(),
  };

  const defaultClipboardCtx = {
    copyToClipboard: vi.fn(),
    copyText: vi.fn(),
    copiedId: null,
    loadHistory: vi.fn(),
    tags: [] as string[],
    handleTogglePin: vi.fn(),
    handleToggleFavorite: vi.fn(),
    handleRemove: vi.fn(),
    handleUpdatePickedColor: vi.fn(),
    handleAddTagToItem: vi.fn(),
    handleRemoveTagFromItem: vi.fn(),
  };

  const defaultUICtx = {
    selectedIndex: -1,
    searchQuery: '',
    setSelectedIndex: vi.fn(),
    handleDoubleClick: vi.fn(),
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    setPreviewImageUrl: vi.fn(),
    setEditingClip: vi.fn(),
  };

  const SETTINGS_KEYS = new Set(['settings', 'updateSettings']);
  const CLIPBOARD_KEYS = new Set(['copyToClipboard', 'copyText', 'copiedId', 'loadHistory', 'tags', 'handleTogglePin', 'handleToggleFavorite', 'handleRemove', 'handleUpdatePickedColor', 'handleAddTagToItem', 'handleRemoveTagFromItem']);

  const setupMocks = (overrides: Record<string, any> = {}) => {
    const settingsOv: Record<string, any> = {};
    const clipboardOv: Record<string, any> = {};
    const uiOv: Record<string, any> = {};
    for (const [k, v] of Object.entries(overrides)) {
      if (SETTINGS_KEYS.has(k)) settingsOv[k] = v;
      else if (CLIPBOARD_KEYS.has(k)) clipboardOv[k] = v;
      else uiOv[k] = v;
    }
    (useSettingsContext as any).mockReturnValue({ ...defaultSettingsCtx, ...settingsOv });
    (useClipboardContext as any).mockReturnValue({ ...defaultClipboardCtx, ...clipboardOv });
    (useUIContext as any).mockReturnValue({ ...defaultUICtx, ...uiOv });
  };

  const createMockItem = (text: string, overrides?: Partial<ClipItem>): ClipItem => ({
    id: Math.random(),
    text,
    timestamp: Date.now(),
    is_pinned: 0,
    is_snippet: 0,
    is_favorite: 0,
    tags: [],
    picked_color: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  describe('Selection functionality with images', () => {
    it('should allow selecting image items', () => {
      const mockSetSelectedIndex = vi.fn();
      setupMocks({ setSelectedIndex: mockSetSelectedIndex });

      const imageItem = createMockItem('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const itemElement = container.querySelector('.group');
      expect(itemElement).toBeTruthy();
      
      fireEvent.click(itemElement!);
      expect(mockSetSelectedIndex).toHaveBeenCalledWith(0);
    });

    it('should show selected state for image items', () => {
      setupMocks({ selectedIndex: 0 });

      const imageItem = createMockItem('https://example.com/image.jpg');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const itemElement = container.querySelector('.group');
      expect(itemElement?.className).toContain('border-indigo-500');
    });
  });

  describe('Copy functionality with images', () => {
    it('should allow copying image items', () => {
      const mockCopyToClipboard = vi.fn();
      setupMocks({ selectedIndex: 0, copyToClipboard: mockCopyToClipboard });

      const imageItem = createMockItem('data:image/png;base64,test');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const copyButton = container.querySelector('button[title="复制"]');
      expect(copyButton).toBeTruthy();
      
      fireEvent.click(copyButton!);
      expect(mockCopyToClipboard).toHaveBeenCalledWith(imageItem);
    });

    it('should show copied state for image items', () => {
      const imageItem = createMockItem('https://example.com/photo.png');
      setupMocks({ selectedIndex: 0, copiedId: imageItem.id });
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      // Check icon should be visible when copied
      const checkIcon = container.querySelector('button[title="复制"] svg');
      expect(checkIcon).toBeTruthy();
    });
  });

  describe('Pin functionality with images', () => {
    it('should allow pinning image items', () => {
      const mockHandleTogglePin = vi.fn();
      setupMocks({ selectedIndex: 0, handleTogglePin: mockHandleTogglePin });

      const imageItem = createMockItem('C:\\Users\\test\\photo.jpg');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const pinButton = container.querySelector('button[title="置顶"]');
      expect(pinButton).toBeTruthy();
      
      fireEvent.click(pinButton!);
      expect(mockHandleTogglePin).toHaveBeenCalledWith(imageItem);
    });

    it('should show pinned state for image items', () => {
      setupMocks();

      const imageItem = createMockItem('data:image/jpeg;base64,test', { is_pinned: 1 });
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const pinButton = container.querySelector('button[title="取消置顶"]');
      expect(pinButton).toBeTruthy();
      expect(pinButton?.className).toContain('text-indigo-500');
    });
  });

  describe('Delete functionality with images', () => {
    it('should allow deleting image items', () => {
      const mockHandleRemove = vi.fn();
      setupMocks({ selectedIndex: 0, handleRemove: mockHandleRemove });

      const imageItem = createMockItem('https://example.com/image.webp');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const deleteButton = container.querySelector('button[title="删除"]');
      expect(deleteButton).toBeTruthy();
      
      fireEvent.click(deleteButton!);
      expect(mockHandleRemove).toHaveBeenCalledWith(imageItem.id);
    });
  });

  describe('Drag-and-drop functionality with images', () => {
    it('should allow dragging image items', () => {
      const mockHandleDragStart = vi.fn();
      const mockHandleDragEnd = vi.fn();
      setupMocks({
        handleDragStart: mockHandleDragStart,
        handleDragEnd: mockHandleDragEnd,
      });

      const imageItem = createMockItem('data:image/gif;base64,test');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const itemElement = container.querySelector('.group');
      expect(itemElement?.getAttribute('draggable')).toBe('true');
      
      fireEvent.dragStart(itemElement!);
      expect(mockHandleDragStart).toHaveBeenCalled();
      
      fireEvent.dragEnd(itemElement!);
      expect(mockHandleDragEnd).toHaveBeenCalled();
    });

    it('should handle drag events for HTTP image URLs', () => {
      const mockHandleDragStart = vi.fn();
      setupMocks({ handleDragStart: mockHandleDragStart });

      const imageItem = createMockItem('https://example.com/photo.png');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const itemElement = container.querySelector('.group');
      fireEvent.dragStart(itemElement!);
      
      expect(mockHandleDragStart).toHaveBeenCalledWith(
        expect.anything(),
        imageItem.text,
        expect.any(Function)
      );
    });
  });

  describe('Double-click functionality with images', () => {
    it('should trigger double-click for image items', () => {
      const mockHandleDoubleClick = vi.fn();
      setupMocks({ handleDoubleClick: mockHandleDoubleClick });

      const imageItem = createMockItem('/path/to/image.bmp');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const itemElement = container.querySelector('.group');
      fireEvent.doubleClick(itemElement!);
      
      expect(mockHandleDoubleClick).toHaveBeenCalledWith(imageItem, expect.any(Function));
    });
  });

  describe('Search/filtering with images', () => {
    it('should highlight search terms in text items', () => {
      setupMocks({ searchQuery: 'test' });

      const textItem = createMockItem('This is a test item');
      
      render(
        <ClipItemComponent item={textItem} index={0} />
      );

      const highlightedText = screen.getByText('test');
      expect(highlightedText.tagName).toBe('MARK');
    });

    it('should display image items even with search query', () => {
      setupMocks({ searchQuery: 'something' });

      const imageItem = createMockItem('data:image/png;base64,test');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      // Image should still be rendered
      const imageDisplay = container.querySelector('.w-full');
      expect(imageDisplay).toBeTruthy();
    });
  });

  describe('Keyboard navigation with images', () => {
    it('should apply selected style when image item is selected', () => {
      setupMocks({ selectedIndex: 0 });

      const imageItem = createMockItem('https://example.com/image.svg');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const selectedItem = container.querySelector('.group');
      expect(selectedItem?.className).toContain('border-indigo-500');
    });
  });

  describe('Mixed content scenarios', () => {
    it('should handle text items alongside image items', () => {
      setupMocks();

      const textItem = createMockItem('Regular text');
      const imageItem = createMockItem('data:image/png;base64,test');
      
      const { container: textContainer } = render(
        <ClipItemComponent item={textItem} index={0} />
      );

      const { container: imageContainer } = render(
        <ClipItemComponent item={imageItem} index={1} />
      );

      // Both should render without issues
      expect(textContainer.querySelector('.group')).toBeTruthy();
      expect(imageContainer.querySelector('.group')).toBeTruthy();
    });

    it('should handle URL items alongside image items', () => {
      setupMocks();

      const urlItem = createMockItem('https://example.com/page');
      const imageUrlItem = createMockItem('https://example.com/image.jpg');
      
      const { container: urlContainer } = render(
        <ClipItemComponent item={urlItem} index={0} />
      );

      const { container: imageUrlContainer } = render(
        <ClipItemComponent item={imageUrlItem} index={1} />
      );

      // Both should render with correct icons
      const urlIcon = urlContainer.querySelector('.lucide-link');
      const imageIcon = imageUrlContainer.querySelector('.lucide-image');
      
      expect(urlIcon).toBeTruthy();
      expect(imageIcon).toBeTruthy();
    });

    it('should handle color items alongside image items', () => {
      setupMocks();

      const colorItem = createMockItem('#FF5733');
      const imageItem = createMockItem('data:image/png;base64,test');
      
      const { container: colorContainer } = render(
        <ClipItemComponent item={colorItem} index={0} />
      );

      const { container: imageContainer } = render(
        <ClipItemComponent item={imageItem} index={1} />
      );

      // Color preview should exist
      const colorPreview = colorContainer.querySelector('.w-5.h-5');
      expect(colorPreview).toBeTruthy();
      
      // Image display should exist
      const imageDisplay = imageContainer.querySelector('.w-full');
      expect(imageDisplay).toBeTruthy();
    });
  });

  describe('Performance with images', () => {
    it('should render multiple image items efficiently', () => {
      setupMocks();

      const imageItems = Array.from({ length: 10 }, (_, i) => 
        createMockItem(`data:image/png;base64,test${i}`)
      );

      const startTime = performance.now();
      
      imageItems.forEach((item, index) => {
        render(
          <ClipItemComponent item={item} index={index} />
        );
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Rendering 10 items should be fast (< 100ms)
      expect(renderTime).toBeLessThan(100);
    });
  });

  describe('Settings integration with images', () => {
    it('should respect showImagePreview setting', () => {
      const imageItem = createMockItem('https://example.com/image.jpg');

      setupMocks({
        settings: { ...defaultSettings, showImagePreview: true },
      });
      
      const { container: withPreview } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      setupMocks({
        settings: { ...defaultSettings, showImagePreview: false },
      });

      const { container: withoutPreview } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      // With preview enabled, ImageDisplay should be present
      expect(withPreview.querySelector('.w-full')).toBeTruthy();
      
      // Without preview, should show text placeholder
      expect(withoutPreview.querySelector('p')).toBeTruthy();
    });

    it('should respect darkMode setting for image items', () => {
      const imageItem = createMockItem('data:image/png;base64,test');

      setupMocks({
        settings: { ...defaultSettings, darkMode: false },
      });
      
      const { container: lightMode } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      setupMocks({
        settings: { ...defaultSettings, darkMode: true },
      });

      const { container: darkMode } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      // Both should render, with different color schemes
      expect(lightMode.querySelector('.group')).toBeTruthy();
      expect(darkMode.querySelector('.group')).toBeTruthy();
      
      // Dark mode should apply dark surface styles
      const darkModeItem = darkMode.querySelector('.group');
      expect(darkModeItem?.className).toContain('bg-neutral-800');
    });
  });
});
