import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
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
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() { return []; }
  unobserve() {}
} as any;

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

describe('ClipItemComponent - Code Snippet Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSettingsContext as any).mockReturnValue({ ...defaultSettingsCtx });
    (useClipboardContext as any).mockReturnValue({ ...defaultClipboardCtx });
    (useUIContext as any).mockReturnValue({ ...defaultUICtx });
  });

  it('should display code snippet containing "image.png" as text, not as image', () => {
    const codeSnippet: ClipItem = {
      id: 1,
      text: 'const imagePath = "assets/image.png";',
      timestamp: Date.now(),
      is_pinned: 0,
      is_snippet: 0,
      is_favorite: 0,
      tags: [],
      picked_color: null,
    };

    const { container } = render(
      <ClipItemComponent item={codeSnippet} index={0} />
    );

    // Should display as text, not try to render ImageDisplay
    const textElement = container.querySelector('p.text-sm');
    expect(textElement).toBeTruthy();
    expect(textElement?.textContent).toContain('const imagePath');
    
    // Should NOT have ImageDisplay component
    const imageDisplay = container.querySelector('[data-testid="image-display"]');
    expect(imageDisplay).toBeNull();
  });

  it('should display code snippet containing "file.jpg" as text, not as image', () => {
    const codeSnippet: ClipItem = {
      id: 2,
      text: 'function loadImage(file) { return fetch("file.jpg"); }',
      timestamp: Date.now(),
      is_pinned: 0,
      is_snippet: 0,
      is_favorite: 0,
      tags: [],
      picked_color: null,
    };

    const { container } = render(
      <ClipItemComponent item={codeSnippet} index={0} />
    );

    // Should display as text
    const textElement = container.querySelector('p.text-sm');
    expect(textElement).toBeTruthy();
    expect(textElement?.textContent).toContain('function loadImage');
  });

  it('should display actual image URL correctly', () => {
    const imageUrl: ClipItem = {
      id: 3,
      text: 'https://example.com/photo.jpg',
      timestamp: Date.now(),
      is_pinned: 0,
      is_snippet: 0,
      is_favorite: 0,
      tags: [],
      picked_color: null,
    };

    const { container } = render(
      <ClipItemComponent item={imageUrl} index={0} />
    );

    // Should try to render as image (ImageDisplay component)
    // Since showImagePreview is true and it's a valid image URL
    const imageWrapper = container.querySelector('.w-full');
    expect(imageWrapper).toBeTruthy();
  });

  it('should display base64 image correctly', () => {
    const base64Image: ClipItem = {
      id: 4,
      text: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      timestamp: Date.now(),
      is_pinned: 0,
      is_snippet: 0,
      is_favorite: 0,
      tags: [],
      picked_color: null,
    };

    const { container } = render(
      <ClipItemComponent item={base64Image} index={0} />
    );

    // Should try to render as image
    const imageWrapper = container.querySelector('.w-full');
    expect(imageWrapper).toBeTruthy();
  });

  it('should display code with multiple image references as text', () => {
    const codeSnippet: ClipItem = {
      id: 5,
      text: `const images = [
  "photo1.jpg",
  "photo2.png",
  "icon.svg"
];`,
      timestamp: Date.now(),
      is_pinned: 0,
      is_snippet: 0,
      is_favorite: 0,
      tags: [],
      picked_color: null,
    };

    const { container } = render(
      <ClipItemComponent item={codeSnippet} index={0} />
    );

    // Should display as text
    const textElement = container.querySelector('p.text-sm');
    expect(textElement).toBeTruthy();
    expect(textElement?.textContent).toContain('const images');
  });

  it('should display local file path as image when it is a valid image path', () => {
    const localImagePath: ClipItem = {
      id: 6,
      text: '/home/user/pictures/vacation.jpg',
      timestamp: Date.now(),
      is_pinned: 0,
      is_snippet: 0,
      is_favorite: 0,
      tags: [],
      picked_color: null,
    };

    const { container } = render(
      <ClipItemComponent item={localImagePath} index={0} />
    );

    // Should try to render as image
    const imageWrapper = container.querySelector('.w-full');
    expect(imageWrapper).toBeTruthy();
  });

  it('should display Windows file path as image when it is a valid image path', () => {
    const windowsImagePath: ClipItem = {
      id: 7,
      text: 'C:\\Users\\John\\Pictures\\photo.png',
      timestamp: Date.now(),
      is_pinned: 0,
      is_snippet: 0,
      is_favorite: 0,
      tags: [],
      picked_color: null,
    };

    const { container } = render(
      <ClipItemComponent item={windowsImagePath} index={0} />
    );

    // Should try to render as image
    const imageWrapper = container.querySelector('.w-full');
    expect(imageWrapper).toBeTruthy();
  });
});
