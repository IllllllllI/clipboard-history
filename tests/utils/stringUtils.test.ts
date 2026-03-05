import { describe, it, expect } from 'vitest';
import { escapeRegExp } from '../../src/utils/stringUtils';

describe('escapeRegExp', () => {
  it('should return empty string for empty input', () => {
    expect(escapeRegExp('')).toBe('');
  });

  it('should not modify normal text', () => {
    expect(escapeRegExp('hello world')).toBe('hello world');
    expect(escapeRegExp('abc123')).toBe('abc123');
  });

  it('should escape all regex special characters', () => {
    // Every character in this set: . * + ? ^ $ { } ( ) | [ ] \
    const specials = '.*+?^${}()|[]\\';
    const escaped = escapeRegExp(specials);
    // Each special char should be preceded by a backslash
    expect(escaped).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('should escape individual special characters correctly', () => {
    expect(escapeRegExp('.')).toBe('\\.');
    expect(escapeRegExp('*')).toBe('\\*');
    expect(escapeRegExp('+')).toBe('\\+');
    expect(escapeRegExp('?')).toBe('\\?');
    expect(escapeRegExp('^')).toBe('\\^');
    expect(escapeRegExp('$')).toBe('\\$');
    expect(escapeRegExp('{')).toBe('\\{');
    expect(escapeRegExp('}')).toBe('\\}');
    expect(escapeRegExp('(')).toBe('\\(');
    expect(escapeRegExp(')')).toBe('\\)');
    expect(escapeRegExp('|')).toBe('\\|');
    expect(escapeRegExp('[')).toBe('\\[');
    expect(escapeRegExp(']')).toBe('\\]');
    expect(escapeRegExp('\\')).toBe('\\\\');
  });

  it('should handle mixed normal and special characters', () => {
    expect(escapeRegExp('price: $100.00')).toBe('price: \\$100\\.00');
    expect(escapeRegExp('foo(bar)')).toBe('foo\\(bar\\)');
    expect(escapeRegExp('[tag]')).toBe('\\[tag\\]');
    expect(escapeRegExp('a+b=c')).toBe('a\\+b=c');
  });

  it('should handle unicode characters without modification', () => {
    expect(escapeRegExp('你好')).toBe('你好');
    expect(escapeRegExp('🎉')).toBe('🎉');
    expect(escapeRegExp('日本語+テスト')).toBe('日本語\\+テスト');
  });

  it('should produce safe regex patterns', () => {
    // The escaped output should be usable as a regex without throwing
    const dangerous = 'a[b](c){d}.*+?^$|\\';
    const escaped = escapeRegExp(dangerous);
    expect(() => new RegExp(escaped)).not.toThrow();

    // And it should match the literal original string
    const regex = new RegExp(escaped);
    expect(regex.test(dangerous)).toBe(true);
  });

  it('should correctly highlight text when used with split (integration)', () => {
    const text = 'Price is $100.00 (USD)';
    const search = '$100.00';
    const escaped = escapeRegExp(search);
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    expect(parts).toEqual(['Price is ', '$100.00', ' (USD)']);
  });
});
