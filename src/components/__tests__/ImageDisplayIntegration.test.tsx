import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClipItemComponent } from '../ClipItem';
import { ClipItem } from '../../types';
import { useAppContext } from '../../contexts/AppContext';

// Mock IntersectionObserver
beforeEach(() => {
  global.IntersectionObserver = class IntersectionObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor() {}
  } as any;
});

// Mock useAppContext
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: vi.fn(),
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
  const createMockContext = (overrides: Record<string, any> = {}) => ({
    settings: defaultSettings,
    selectedIndex: -1,
    searchQuery: '',
    copiedId: null,
    setSelectedIndex: vi.fn(),
    handleDoubleClick: vi.fn(),
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    handleTogglePin: vi.fn(),
    copyToClipboard: vi.fn(),
    handleRemove: vi.fn(),
    setPreviewImageUrl: vi.fn(),
    ...overrides,
  });

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
    (useAppContext as any).mockReturnValue(createMockContext());
  });

  describe('Selection functionality with images', () => {
    it('should allow selecting image items', () => {
      const mockSetSelectedIndex = vi.fn();
      (useAppContext as any).mockReturnValue(createMockContext({ setSelectedIndex: mockSetSelectedIndex }));

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
      (useAppContext as any).mockReturnValue(createMockContext({ selectedIndex: 0 }));

      const imageItem = createMockItem('https://example.com/image.jpg');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const itemElement = container.querySelector('.group');
      expect(itemElement?.className).toContain('bg-indigo-500');
    });
  });

  describe('Copy functionality with images', () => {
    it('should allow copying image items', () => {
      const mockCopyToClipboard = vi.fn();
      (useAppContext as any).mockReturnValue(createMockContext({ selectedIndex: 0, copyToClipboard: mockCopyToClipboard }));

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
      (useAppContext as any).mockReturnValue(createMockContext({ selectedIndex: 0, copiedId: imageItem.id }));
      
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
      (useAppContext as any).mockReturnValue(createMockContext({ selectedIndex: 0, handleTogglePin: mockHandleTogglePin }));

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
      (useAppContext as any).mockReturnValue(createMockContext());

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
      (useAppContext as any).mockReturnValue(createMockContext({ selectedIndex: 0, handleRemove: mockHandleRemove }));

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
      (useAppContext as any).mockReturnValue(createMockContext({
        handleDragStart: mockHandleDragStart,
        handleDragEnd: mockHandleDragEnd,
      }));

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
      (useAppContext as any).mockReturnValue(createMockContext({ handleDragStart: mockHandleDragStart }));

      const imageItem = createMockItem('https://example.com/photo.png');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const itemElement = container.querySelector('.group');
      fireEvent.dragStart(itemElement!);
      
      expect(mockHandleDragStart).toHaveBeenCalledWith(
        expect.anything(),
        imageItem.text
      );
    });
  });

  describe('Double-click functionality with images', () => {
    it('should trigger double-click for image items', () => {
      const mockHandleDoubleClick = vi.fn();
      (useAppContext as any).mockReturnValue(createMockContext({ handleDoubleClick: mockHandleDoubleClick }));

      const imageItem = createMockItem('/path/to/image.bmp');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const itemElement = container.querySelector('.group');
      fireEvent.doubleClick(itemElement!);
      
      expect(mockHandleDoubleClick).toHaveBeenCalledWith(imageItem);
    });
  });

  describe('Search/filtering with images', () => {
    it('should highlight search terms in text items', () => {
      (useAppContext as any).mockReturnValue(createMockContext({ searchQuery: 'test' }));

      const textItem = createMockItem('This is a test item');
      
      render(
        <ClipItemComponent item={textItem} index={0} />
      );

      const highlightedText = screen.getByText('test');
      expect(highlightedText.tagName).toBe('MARK');
    });

    it('should display image items even with search query', () => {
      (useAppContext as any).mockReturnValue(createMockContext({ searchQuery: 'something' }));

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
    it('should show paste indicator when image item is selected', () => {
      (useAppContext as any).mockReturnValue(createMockContext({ selectedIndex: 0 }));

      const imageItem = createMockItem('https://example.com/image.svg');
      
      const { container } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      const pasteIndicator = screen.getByText('↵ 粘贴');
      expect(pasteIndicator).toBeTruthy();
    });
  });

  describe('Mixed content scenarios', () => {
    it('should handle text items alongside image items', () => {
      (useAppContext as any).mockReturnValue(createMockContext());

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
      (useAppContext as any).mockReturnValue(createMockContext());

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
      (useAppContext as any).mockReturnValue(createMockContext());

      const colorItem = createMockItem('#FF5733');
      const imageItem = createMockItem('data:image/png;base64,test');
      
      const { container: colorContainer } = render(
        <ClipItemComponent item={colorItem} index={0} />
      );

      const { container: imageContainer } = render(
        <ClipItemComponent item={imageItem} index={1} />
      );

      // Color preview should exist
      const colorPreview = colorContainer.querySelector('.rounded-full');
      expect(colorPreview).toBeTruthy();
      
      // Image display should exist
      const imageDisplay = imageContainer.querySelector('.w-full');
      expect(imageDisplay).toBeTruthy();
    });
  });

  describe('Performance with images', () => {
    it('should render multiple image items efficiently', () => {
      (useAppContext as any).mockReturnValue(createMockContext());

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

      (useAppContext as any).mockReturnValue(createMockContext({
        settings: { ...defaultSettings, showImagePreview: true },
      }));
      
      const { container: withPreview } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      (useAppContext as any).mockReturnValue(createMockContext({
        settings: { ...defaultSettings, showImagePreview: false },
      }));

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

      (useAppContext as any).mockReturnValue(createMockContext({
        settings: { ...defaultSettings, darkMode: false },
      }));
      
      const { container: lightMode } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      (useAppContext as any).mockReturnValue(createMockContext({
        settings: { ...defaultSettings, darkMode: true },
      }));

      const { container: darkMode } = render(
        <ClipItemComponent item={imageItem} index={0} />
      );

      // Both should render, with different color schemes
      expect(lightMode.querySelector('.group')).toBeTruthy();
      expect(darkMode.querySelector('.group')).toBeTruthy();
      
      // Dark mode should have different text color
      const darkModeIcon = darkMode.querySelector('.w-6.h-6');
      expect(darkModeIcon?.className).toContain('text-neutral-500');
    });
  });
});
