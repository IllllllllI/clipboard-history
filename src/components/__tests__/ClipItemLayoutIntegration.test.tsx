import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClipItemComponent } from '../ClipItem';
import { ClipItem } from '../../types';
import { useAppContext } from '../../contexts/AppContext';

const tauriMocks = vi.hoisted(() => ({
  openFile: vi.fn(),
  openPath: vi.fn(),
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

// Mock useAppContext
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: vi.fn(),
}));

vi.mock('../../services/tauri', () => ({
  isTauri: true,
  TauriService: {
    openFile: tauriMocks.openFile,
    openPath: tauriMocks.openPath,
  },
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
describe('ClipItemComponent Layout Integration', () => {
  const createMockItem = (text: string): ClipItem => ({
    id: Math.random(),
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
    tauriMocks.openFile.mockClear();
    tauriMocks.openPath.mockClear();
    (useAppContext as any).mockReturnValue({ ...defaultContext });
  });

  it('should properly layout Base64 image items', () => {
    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const item = createMockItem(base64Image);
    
    const { container } = render(
      <ClipItemComponent item={item} index={0} />
    );

    // Verify the layout structure
    const mainContainer = container.querySelector('.group');
    expect(mainContainer?.className).toContain('items-start');
    
    // Verify content area
    const contentArea = container.querySelector('.flex-1');
    expect(contentArea?.className).toContain('flex-col');
    expect(contentArea?.className).toContain('gap-1.5');
    expect(contentArea?.className).toContain('py-1');
  });

  it('should properly layout HTTP image URL items', () => {
    const httpImage = 'https://example.com/image.png';
    const item = createMockItem(httpImage);
    
    const { container } = render(
      <ClipItemComponent item={item} index={0} />
    );

    // Verify ImageDisplay is rendered
    const contentArea = container.querySelector('.flex-1');
    expect(contentArea).toBeTruthy();
    
    // Verify the wrapper div for ImageDisplay
    const imageWrapper = contentArea?.querySelector('.w-full');
    expect(imageWrapper).toBeTruthy();
  });

  it('should properly layout local file image items', () => {
    const localImage = 'C:\\Users\\test\\image.jpg';
    const item = createMockItem(localImage);
    
    const { container } = render(
      <ClipItemComponent item={item} index={0} />
    );

    // Verify layout accommodates the image
    const mainContainer = container.querySelector('.group');
    expect(mainContainer?.className).toContain('items-start');
  });

  it('should open local image path with openFile when clicking the link', () => {
    const localImage = 'C:\\Users\\test\\image.jpg';
    const item = createMockItem(localImage);

    render(<ClipItemComponent item={item} index={0} />);

    const pathLink = screen.getByText(localImage);
    fireEvent.click(pathLink);

    expect(tauriMocks.openFile).toHaveBeenCalledWith(localImage);
    expect(tauriMocks.openPath).not.toHaveBeenCalled();
  });

  it('should properly layout text items without breaking', () => {
    const textItem = createMockItem('This is a regular text item that should be displayed normally');
    
    const { container } = render(
      <ClipItemComponent item={textItem} index={0} />
    );

    // Text should be displayed with proper truncation
    const textElement = container.querySelector('p');
    expect(textElement).toBeTruthy();
    expect(textElement?.className).toContain('truncate');
    expect(textElement?.className).toContain('mt-1');
  });

  it('should properly layout color items', () => {
    const colorItem = createMockItem('#FF5733');
    
    const { container } = render(
      <ClipItemComponent item={colorItem} index={0} />
    );

    // Color preview should have proper alignment
    const colorPreview = container.querySelector('.w-5.h-5.rounded-md');
    expect(colorPreview).toBeTruthy();
    expect(colorPreview?.className).toContain('rounded-md');
  });

  it('should properly layout URL items', () => {
    const urlItem = createMockItem('https://example.com/page');
    
    const { container } = render(
      <ClipItemComponent item={urlItem} index={0} />
    );

    // URL should be displayed as text
    const textElement = container.querySelector('p');
    expect(textElement).toBeTruthy();
  });

  it('should maintain proper spacing between elements', () => {
    const item = createMockItem('Test item');
    
    const { container } = render(
      <ClipItemComponent item={item} index={0} />
    );

    // Verify gap between elements
    const mainContainer = container.querySelector('.group');
    expect(mainContainer?.className).toContain('gap-2.5');
    
    // Verify content area has proper gap
    const contentArea = container.querySelector('.flex-1');
    expect(contentArea?.className).toContain('gap-1.5');
  });

  it('should properly align icon with content', () => {
    const item = createMockItem('Test item');
    
    const { container } = render(
      <ClipItemComponent item={item} index={0} />
    );

    // Icon should have top margin for alignment
    const iconContainer = container.querySelector('.w-8.h-8');
    expect(iconContainer?.className).toContain('mt-0.5');
  });

  it('should properly align actions with content', () => {
    const item = createMockItem('Test item');
    
    const { container } = render(
      <ClipItemComponent item={item} index={0} />
    );

    // Actions should align to the top
    const actionsContainer = container.querySelector('.shrink-0.text-xs');
    expect(actionsContainer?.className).toContain('items-end');
    expect(actionsContainer?.className).toContain('pt-1');
  });
});
