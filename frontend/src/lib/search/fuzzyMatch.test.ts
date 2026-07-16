import { fuzzyMatchFields, fuzzyTokenScore, normalizeSearchText, tokenizeQuery } from '@/lib/search/fuzzyMatch';

describe('fuzzyMatch', () => {
  it('normalizes accents and casing', () => {
    expect(normalizeSearchText('Análíticas')).toBe('analiticas');
  });

  it('matches partial tokens', () => {
    expect(fuzzyTokenScore('Productos', 'prod')).toBeGreaterThan(0);
  });

  it('matches subsequence typos', () => {
    expect(fuzzyTokenScore('Configuración', 'config')).toBeGreaterThan(0);
    expect(fuzzyTokenScore('Analíticas', 'anlit')).toBeGreaterThan(0);
  });

  it('matches common misspellings', () => {
    expect(fuzzyTokenScore('Productos', 'prodcutos')).toBeGreaterThan(0);
  });

  it('requires every token to match at least one field', () => {
    expect(fuzzyMatchFields('ordenes maria', ['Órdenes', 'pedidos'])).toBeGreaterThan(0);
    expect(fuzzyMatchFields('ordenes xyzmissing', ['Órdenes'])).toBe(0);
  });

  it('tokenizes queries', () => {
    expect(tokenizeQuery('  Analíticas   ventas ')).toEqual(['analiticas', 'ventas']);
  });
});
