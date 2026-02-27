import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ClipList } from './ClipList';
import { ClipItem } from '../types';
import { useAppContext } from '../contexts/AppContext';

// Mock virtualizer to render all rows deterministically in tests
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 64,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * 64,
      })),
    measureElement: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));

// Mock motion/react
vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// Mock ClipItemComponent
vi.mock('./ClipItem', () => ({
  ClipItemComponent: ({ item, index }: { item: ClipItem; index: number }) => (
    <div data-testid={`clip-item-${index}`} data-item-id={item.id}>
      {item.text}
    </div>
  ),
}));

// Mock useAppContext
vi.mock('../contexts/AppContext', () => ({
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

const createMockContext = (overrides: Record<string, any> = {}) => ({
  settings: defaultSettings,
  filteredHistory: [],
  selectedIndex: 0,
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

describe('ClipList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAppContext as any).mockReturnValue(createMockContext());
  });

  it('renders empty state when no items', () => {
    (useAppContext as any).mockReturnValue(createMockContext({ filteredHistory: [] }));

    render(<ClipList />);

    expect(screen.getByText('剪贴板空空如也 ✨')).toBeTruthy();
  });

  it('renders all items in the list', () => {
    const items: ClipItem[] = [
      { id: 1, text: 'Text item', timestamp: Date.now(), is_pinned: 0, is_snippet: 0, is_favorite: 0, tags: [], picked_color: null },
      { id: 2, text: 'Another text', timestamp: Date.now(), is_pinned: 0, is_snippet: 0, is_favorite: 0, tags: [], picked_color: null },
    ];

    (useAppContext as any).mockReturnValue(createMockContext({ filteredHistory: items }));

    render(<ClipList />);

    expect(screen.getByTestId('clip-item-0')).toBeTruthy();
    expect(screen.getByTestId('clip-item-1')).toBeTruthy();
  });

  it('renders image items correctly', () => {
    const items: ClipItem[] = [
      { id: 1, text: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', timestamp: Date.now(), is_pinned: 0, is_snippet: 0, is_favorite: 0, tags: [], picked_color: null },
      { id: 2, text: 'https://example.com/image.jpg', timestamp: Date.now(), is_pinned: 0, is_snippet: 0, is_favorite: 0, tags: [], picked_color: null },
      { id: 3, text: '/path/to/local/image.png', timestamp: Date.now(), is_pinned: 0, is_snippet: 0, is_favorite: 0, tags: [], picked_color: null },
    ];

    (useAppContext as any).mockReturnValue(createMockContext({ filteredHistory: items }));

    render(<ClipList />);

    // Verify all image items are rendered
    expect(screen.getByTestId('clip-item-0')).toBeTruthy();
    expect(screen.getByTestId('clip-item-1')).toBeTruthy();
    expect(screen.getByTestId('clip-item-2')).toBeTruthy();
  });

  it('renders mixed content (text and images)', () => {
    const items: ClipItem[] = [
      { id: 1, text: 'Regular text', timestamp: Date.now(), is_pinned: 0, is_snippet: 0, is_favorite: 0, tags: [], picked_color: null },
      { id: 2, text: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', timestamp: Date.now(), is_pinned: 0, is_snippet: 0, is_favorite: 0, tags: [], picked_color: null },
      { id: 3, text: 'https://example.com', timestamp: Date.now(), is_pinned: 0, is_snippet: 0, is_favorite: 0, tags: [], picked_color: null },
      { id: 4, text: 'https://example.com/photo.jpg', timestamp: Date.now(), is_pinned: 0, is_snippet: 0, is_favorite: 0, tags: [], picked_color: null },
    ];

    (useAppContext as any).mockReturnValue(createMockContext({ filteredHistory: items }));

    render(<ClipList />);

    // Verify all items are rendered regardless of type
    expect(screen.getByTestId('clip-item-0')).toBeTruthy();
    expect(screen.getByTestId('clip-item-1')).toBeTruthy();
    expect(screen.getByTestId('clip-item-2')).toBeTruthy();
    expect(screen.getByTestId('clip-item-3')).toBeTruthy();
  });

  it('passes correct props to ClipItemComponent', () => {
    const items: ClipItem[] = [
      { id: 1, text: 'Test item', timestamp: Date.now(), is_pinned: 0, is_snippet: 0, is_favorite: 0, tags: [], picked_color: null },
    ];

    (useAppContext as any).mockReturnValue(createMockContext({
      filteredHistory: items,
      searchQuery: 'test',
      copiedId: 1,
    }));

    render(<ClipList />);

    const clipItem = screen.getByTestId('clip-item-0');
    expect(clipItem.getAttribute('data-item-id')).toBe('1');
  });

  it('handles large lists efficiently', () => {
    // Create a large list of items
    const items: ClipItem[] = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      text: i % 3 === 0 ? `data:image/png;base64,test${i}` : `Text item ${i}`,
      timestamp: Date.now() - i * 1000,
      is_pinned: 0,
      is_snippet: 0,
      is_favorite: 0,
      tags: [],
      picked_color: null,
    }));

    (useAppContext as any).mockReturnValue(createMockContext({ filteredHistory: items }));

    const { container } = render(<ClipList />);

    // Verify the list container exists and has overflow
    const listContainer = container.querySelector('.overflow-y-auto');
    expect(listContainer).toBeTruthy();
    
    // Verify all items are rendered (in real app, virtual scrolling would optimize this)
    const renderedItems = container.querySelectorAll('[data-testid^="clip-item-"]');
    expect(renderedItems).toHaveLength(100);
  });

  it('maintains proper layout with images', () => {
    const items: ClipItem[] = [
      { id: 1, text: 'data:image/png;base64,test', timestamp: Date.now(), is_pinned: 0, is_snippet: 0, is_favorite: 0, tags: [], picked_color: null },
    ];

    (useAppContext as any).mockReturnValue(createMockContext({ filteredHistory: items }));

    const { container } = render(<ClipList />);

    // Verify the list has proper scrolling container
    const scrollContainer = container.querySelector('.overflow-y-auto.custom-scrollbar');
    expect(scrollContainer).toBeTruthy();
  });
});
