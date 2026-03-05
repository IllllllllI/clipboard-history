import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ClipItemComponent } from '../../src/components/ClipItem';
import { ClipItem } from '../../src/types';
import { useSettingsContext } from '../../src/contexts/SettingsContext';
import { useClipboardContext } from '../../src/contexts/ClipboardContext';
import { useUIContext } from '../../src/contexts/UIContext';
import { useClipItemStableContext } from '../../src/components/ClipItem/ClipItemContext';

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
vi.mock('../../src/components/ClipItem/ClipItemContext', () => ({
  useClipItemStableContext: vi.fn(),
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
    (useSettingsContext as any).mockReturnValue({ ...defaultSettingsCtx });
    (useClipboardContext as any).mockReturnValue({ ...defaultClipboardCtx });
    (useUIContext as any).mockReturnValue({ ...defaultUICtx });
    (useClipItemStableContext as any).mockReturnValue({
      ...defaultSettingsCtx,
      ...defaultClipboardCtx,
      ...defaultUICtx,
      addClipEntry: vi.fn(),
    });
  });

  it('should use items-start alignment for image items', () => {
    const imageItem = createMockItem('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    
    const { container } = render(
      <ClipItemComponent item={imageItem} index={0} isSelected={false} isCopied={false} searchQuery="" />
    );

    // Check that the main container uses items-start
    const mainContainer = container.querySelector('.group');
    expect(mainContainer?.className).toContain('items-start');
  });

  it('should properly accommodate image content without overflow', () => {
    const imageItem = createMockItem('https://example.com/image.png');
    
    const { container } = render(
      <ClipItemComponent item={imageItem} index={0} isSelected={false} isCopied={false} searchQuery="" />
    );

    // Check that the content area has proper flex properties
    const contentArea = container.querySelector('.flex-1');
    expect(contentArea?.className).toContain('min-w-0');
    expect(contentArea?.className).toContain('flex-col');
  });

  it('should handle text-only items correctly', () => {
    const textItem = createMockItem('This is a regular text item');
    
    const { container } = render(
      <ClipItemComponent item={textItem} index={0} isSelected={false} isCopied={false} searchQuery="" />
    );

    // Text items should still work with the new layout
    const textElement = container.querySelector('p');
    expect(textElement).toBeTruthy();
    expect(textElement?.className).toContain('truncate');
  });

  it('should handle mixed content types', () => {
    const colorItem = createMockItem('#FF5733');
    
    const { container } = render(
      <ClipItemComponent item={colorItem} index={0} isSelected={false} isCopied={false} searchQuery="" />
    );

    // Color items should have proper spacing
    const contentArea = container.querySelector('.flex-1');
    expect(contentArea?.className).toContain('gap-1.5');
  });
});
