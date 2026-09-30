/// <reference types="vite/client" />
// CLAUDE.md rules checked on every test run (ESLint enforces them too, but isn't the milestone gate).
import { describe, expect, test } from 'vitest';

const sources = import.meta.glob<string>('../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const files = Object.entries(sources).map(([path, code]) => ({
  rel: path.replace('../src/', ''),
  code,
}));

describe('architecture rules', () => {
  test('nothing outside src/services/ calls fetch or XMLHttpRequest', () => {
    const offenders = files
      .filter((f) => !f.rel.startsWith('services/'))
      .filter((f) => /\bfetch\s*\(|\.fetch\b|XMLHttpRequest|sendBeacon/.test(f.code))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  test('src/core/ never imports from services/ or ui/', () => {
    const offenders = files
      .filter((f) => f.rel.startsWith('core/'))
      .filter((f) => /from\s+['"][^'"]*\/(services|ui)(\/|['"])/.test(f.code))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  test('src/core/ does not touch the DOM', () => {
    const offenders = files
      .filter((f) => f.rel.startsWith('core/'))
      .filter((f) => /\b(document|window|localStorage|navigator)\./.test(f.code))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  test('the scan actually sees the source files', () => {
    expect(files.map((f) => f.rel)).toContain('services/http.ts');
    expect(files.filter((f) => /\bfetch\(/.test(f.code)).map((f) => f.rel)).toEqual([
      'services/http.ts',
    ]);
  });
});
