import { describe, it, expect } from 'vitest';
import { plural, pluralize, FILE_FORMS, IMAGE_FORMS } from '../../utils/plural';

describe('plural — Russian declension', () => {
  it('uses the "one" form for 1 and numbers ending in 1', () => {
    expect(plural(1, FILE_FORMS)).toBe('файл');
    expect(plural(21, FILE_FORMS)).toBe('файл');
    expect(plural(101, FILE_FORMS)).toBe('файл');
  });

  it('uses the "few" form for 2–4 and numbers ending in 2–4', () => {
    expect(plural(2, FILE_FORMS)).toBe('файла');
    expect(plural(3, FILE_FORMS)).toBe('файла');
    expect(plural(4, FILE_FORMS)).toBe('файла');
    expect(plural(22, FILE_FORMS)).toBe('файла');
    expect(plural(104, FILE_FORMS)).toBe('файла');
  });

  it('uses the "many" form for 0 and 5–10', () => {
    expect(plural(0, FILE_FORMS)).toBe('файлов');
    expect(plural(5, FILE_FORMS)).toBe('файлов');
    expect(plural(9, FILE_FORMS)).toBe('файлов');
    expect(plural(10, FILE_FORMS)).toBe('файлов');
  });

  // The exception naive implementations get wrong.
  it('uses the "many" form for the 11–14 exception', () => {
    expect(plural(11, FILE_FORMS)).toBe('файлов');
    expect(plural(12, FILE_FORMS)).toBe('файлов');
    expect(plural(13, FILE_FORMS)).toBe('файлов');
    expect(plural(14, FILE_FORMS)).toBe('файлов');
    expect(plural(111, FILE_FORMS)).toBe('файлов');
    expect(plural(112, FILE_FORMS)).toBe('файлов');
  });

  it('resumes normal forms at 15–20 and 21+', () => {
    expect(plural(15, FILE_FORMS)).toBe('файлов');
    expect(plural(20, FILE_FORMS)).toBe('файлов');
    expect(plural(21, FILE_FORMS)).toBe('файл');
  });

  it('handles negative and fractional counts by magnitude/truncation', () => {
    expect(plural(-1, FILE_FORMS)).toBe('файл');
    expect(plural(-3, FILE_FORMS)).toBe('файла');
    expect(plural(2.7, FILE_FORMS)).toBe('файла');
  });

  it('works with other noun sets', () => {
    expect(plural(1, IMAGE_FORMS)).toBe('изображение');
    expect(plural(3, IMAGE_FORMS)).toBe('изображения');
    expect(plural(5, IMAGE_FORMS)).toBe('изображений');
  });
});

describe('pluralize', () => {
  it('prefixes the count', () => {
    expect(pluralize(1, FILE_FORMS)).toBe('1 файл');
    expect(pluralize(3, FILE_FORMS)).toBe('3 файла');
    expect(pluralize(5, FILE_FORMS)).toBe('5 файлов');
    expect(pluralize(11, FILE_FORMS)).toBe('11 файлов');
  });
});
