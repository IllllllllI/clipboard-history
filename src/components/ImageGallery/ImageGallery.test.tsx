import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ImageGallery } from './ImageGallery';
import type { ClipItem } from '../../types';

vi.mock('../ImageDisplay', () => ({
  ImageDisplay: ({ item, onClick }: { item: ClipItem; onClick?: (text: string) => void }) => (
    <button
      type="button"
      data-testid="mock-image-display"
      onClick={() => onClick?.(item.text)}
    >
      {item.text}
    </button>
  ),
}));

const baseItem: ClipItem = {
  id: 100,
  text: 'https://example.com/base.png',
  timestamp: Date.now(),
  is_pinned: 0,
  is_snippet: 0,
  is_favorite: 0,
  tags: [],
  picked_color: null,
};

describe('ImageGallery', () => {
  it('list 模式点击行后更新 active 态并触发复制回调', () => {
    const onListItemClick = vi.fn();
    const onImageClick = vi.fn();
    const imageUrls = [
      'https://example.com/1.png',
      'https://example.com/2.png',
      'https://example.com/3.png',
    ];

    const { container } = render(
      <ImageGallery
        imageUrls={imageUrls}
        baseItem={baseItem}
        darkMode={false}
        displayMode="list"
        onImageClick={onImageClick}
        onListItemClick={onListItemClick}
      />,
    );

    const rows = Array.from(container.querySelectorAll('.img-gallery__list-row')) as HTMLButtonElement[];
    expect(rows).toHaveLength(3);
    expect(rows[0].getAttribute('data-active')).toBe('true');

    fireEvent.click(rows[1]);

    expect(rows[0].getAttribute('data-active')).toBe('false');
    expect(rows[1].getAttribute('data-active')).toBe('true');
    expect(rows[1].getAttribute('data-copied')).toBe('true');
    expect(onListItemClick).toHaveBeenCalledTimes(1);
    expect(onListItemClick).toHaveBeenCalledWith('https://example.com/2.png');
    expect(onImageClick).not.toHaveBeenCalled();

    const copiedMarks = container.querySelectorAll('.img-gallery__list-row-copy-mark[data-visible="true"]');
    expect(copiedMarks).toHaveLength(1);
  });

  it('list 模式点击缩略图时只触发预览回调', () => {
    const onListItemClick = vi.fn();
    const onImageClick = vi.fn();

    const { container } = render(
      <ImageGallery
        imageUrls={['https://example.com/1.png', 'https://example.com/2.png']}
        baseItem={baseItem}
        darkMode={false}
        displayMode="list"
        onImageClick={onImageClick}
        onListItemClick={onListItemClick}
      />,
    );

    const thumbButtons = container.querySelectorAll('.img-gallery__list-row-thumb-btn');
    expect(thumbButtons).toHaveLength(2);

    fireEvent.click(thumbButtons[1]);

    expect(onImageClick).toHaveBeenCalledWith('https://example.com/2.png');
    expect(onListItemClick).not.toHaveBeenCalled();
  });

  it('list 模式超出最大条目时默认折叠，并支持展开/收起', () => {
    const { container } = render(
      <ImageGallery
        imageUrls={[
          'https://example.com/1.png',
          'https://example.com/2.png',
          'https://example.com/3.png',
          'https://example.com/4.png',
        ]}
        baseItem={baseItem}
        darkMode={false}
        displayMode="list"
        listMaxVisibleItems={2}
      />,
    );

    expect(container.querySelectorAll('.img-gallery__list-row')).toHaveLength(2);
    const expandBtn = screen.getByRole('button', { name: '展开剩余 2 项' });
    fireEvent.click(expandBtn);
    expect(container.querySelectorAll('.img-gallery__list-row')).toHaveLength(4);

    const collapseBtn = screen.getByRole('button', { name: '收起列表' });
    fireEvent.click(collapseBtn);
    expect(container.querySelectorAll('.img-gallery__list-row')).toHaveLength(2);
  });

  it('carousel 模式多图时显示导航按钮与计数，并可切换计数', () => {
    render(
      <ImageGallery
        imageUrls={['https://example.com/a.png', 'https://example.com/b.png', 'https://example.com/c.png']}
        baseItem={baseItem}
        darkMode={false}
        displayMode="carousel"
      />,
    );

    expect(screen.getByLabelText('上一张')).toBeTruthy();
    const nextBtn = screen.getByLabelText('下一张');
    expect(nextBtn).toBeTruthy();

    const counterPill = screen.getByTitle('展开缩略图');
    expect(within(counterPill).getByText('1/3')).toBeTruthy();
    fireEvent.click(nextBtn);
    expect(within(counterPill).getByText('2/3')).toBeTruthy();
  });

  it('carousel 模式支持复制当前图片，并随当前索引变化', () => {
    const onCopyImage = vi.fn();

    render(
      <ImageGallery
        imageUrls={['https://example.com/a.png', 'https://example.com/b.png']}
        baseItem={baseItem}
        darkMode={false}
        displayMode="carousel"
        onCopyImage={onCopyImage}
      />,
    );

    const copyBtn = screen.getByTitle('复制当前图片');
    fireEvent.click(copyBtn);
    expect(onCopyImage).toHaveBeenCalledWith('https://example.com/a.png');
    expect(copyBtn.getAttribute('data-copied')).toBe('true');

    fireEvent.click(screen.getByLabelText('下一张'));
    fireEvent.click(copyBtn);
    expect(onCopyImage).toHaveBeenLastCalledWith('https://example.com/b.png');
    expect(copyBtn.getAttribute('data-copied')).toBe('true');
  });

  it('grid 模式通过宫格悬浮按钮支持单图复制', () => {
    const onCopyImage = vi.fn();
    const onImageClick = vi.fn();

    const { container } = render(
      <ImageGallery
        imageUrls={['https://example.com/g1.png', 'https://example.com/g2.png']}
        baseItem={baseItem}
        darkMode={false}
        displayMode="grid"
        onCopyImage={onCopyImage}
        onImageClick={onImageClick}
      />,
    );

    const gridCells = container.querySelectorAll('.img-gallery__grid-cell');
    expect(gridCells).toHaveLength(2);

    const copyButtons = container.querySelectorAll('.img-gallery__grid-copy-fab');
    expect(copyButtons).toHaveLength(2);
    fireEvent.click(copyButtons[0]);
    expect(onCopyImage).toHaveBeenCalledWith('https://example.com/g1.png');
    expect(copyButtons[0].getAttribute('data-copied')).toBe('true');

    fireEvent.click(gridCells[1]);
    expect(onImageClick).toHaveBeenCalledWith('https://example.com/g2.png');

    fireEvent.click(copyButtons[1]);
    expect(onCopyImage).toHaveBeenLastCalledWith('https://example.com/g2.png');
    expect(copyButtons[1].getAttribute('data-copied')).toBe('true');
  });

  it('carousel 模式单图时不显示导航按钮与计数胶囊', () => {
    render(
      <ImageGallery
        imageUrls={['https://example.com/only.png']}
        baseItem={baseItem}
        darkMode={true}
        displayMode="carousel"
      />,
    );

    expect(screen.queryByLabelText('上一张')).toBeNull();
    expect(screen.queryByLabelText('下一张')).toBeNull();
    expect(screen.queryByText('1/1')).toBeNull();
  });
});
