export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function tokenizeQuery(query: string): string[] {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function isSubsequence(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) {
      index += 1;
      if (index === needle.length) return true;
    }
  }
  return false;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function typoThreshold(tokenLength: number): number {
  if (tokenLength <= 3) return 0;
  if (tokenLength <= 5) return 1;
  return 2;
}

/** Score how well a single token matches a haystack (0 = no match). */
export function fuzzyTokenScore(haystack: string, token: string): number {
  const normalizedHaystack = normalizeSearchText(haystack);
  const normalizedToken = normalizeSearchText(token);
  if (!normalizedToken) return 0;

  if (normalizedHaystack === normalizedToken) return 100;
  if (normalizedHaystack.startsWith(normalizedToken)) return 85;
  if (normalizedHaystack.includes(normalizedToken)) return 65;

  if (isSubsequence(normalizedHaystack, normalizedToken)) {
    return 45 + Math.min(15, normalizedToken.length * 2);
  }

  const threshold = typoThreshold(normalizedToken.length);
  if (threshold === 0) return 0;

  const words = normalizedHaystack.split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (levenshtein(word, normalizedToken) <= threshold) {
      return 35;
    }
  }

  const windowSize = normalizedToken.length + threshold;
  for (let start = 0; start < normalizedHaystack.length; start += 1) {
    const slice = normalizedHaystack.slice(start, start + windowSize);
    if (levenshtein(slice, normalizedToken) <= threshold) {
      return 28;
    }
  }

  return 0;
}

/** Every token must match at least one field; returns aggregate score or 0. */
export function fuzzyMatchFields(query: string, fields: string[]): number {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0 || fields.length === 0) return 0;

  let totalScore = 0;

  for (const token of tokens) {
    let bestTokenScore = 0;
    for (const field of fields) {
      if (!field.trim()) continue;
      bestTokenScore = Math.max(bestTokenScore, fuzzyTokenScore(field, token));
    }
    if (bestTokenScore === 0) return 0;
    totalScore += bestTokenScore;
  }

  return totalScore;
}
