import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
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

const defaultContext = {
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
  handleUpdatePickedColor: vi.fn(),
  setPreviewImageUrl: vi.fn(),
};
describe('ClipItemComponent Layout', () => {
  const createMockItem = (text: string): ClipItem => ({
    id: 1,
    text,
    timestamp: Date.now(),
    is_pinned: 0,
    is_snippet: 0,
    is_favorite: 0,
    tags: [],
    picked_color: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (useAppContext as any).mockReturnValue({ ...defaultContext });
  });

  it('should use items-start alignment for image items', () => {
    const imageItem = createMockItem('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    
    const { container } = render(
      <ClipItemComponent item={imageItem} index={0} />
    );

    // Check that the main container uses items-start
    const mainContainer = container.querySelector('.group');
    expect(mainContainer?.className).toContain('items-start');
  });

  it('should properly accommodate image content without overflow', () => {
    const imageItem = createMockItem('https://example.com/image.png');
    
    const { container } = render(
      <ClipItemComponent item={imageItem} index={0} />
    );

    // Check that the content area has proper flex properties
    const contentArea = container.querySelector('.flex-1');
    expect(contentArea?.className).toContain('min-w-0');
    expect(contentArea?.className).toContain('items-start');
  });

  it('should handle text-only items correctly', () => {
    const textItem = createMockItem('This is a regular text item');
    
    const { container } = render(
      <ClipItemComponent item={textItem} index={0} />
    );

    // Text items should still work with the new layout
    const textElement = container.querySelector('p');
    expect(textElement).toBeTruthy();
    expect(textElement?.className).toContain('truncate');
  });

  it('should handle mixed content types', () => {
    const colorItem = createMockItem('#FF5733');
    
    const { container } = render(
      <ClipItemComponent item={colorItem} index={0} />
    );

    // Color items should have proper spacing
    const contentArea = container.querySelector('.flex-1');
    expect(contentArea?.className).toContain('gap-3');
  });
});
