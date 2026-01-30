export interface CommentKeywordMatchRule {
  any?: string[];
  minAnyMatches?: number;
  must?: string[];
  should?: string[];
  minShouldMatches?: number;
  mustNot?: string[];
  caseSensitive?: boolean;
}

export interface CommentMatchResult {
  ok: boolean;
  anyHits: string[];
  mustHits: string[];
  shouldHits: string[];
  anyCount: number;
  shouldCount: number;
  rejectedBy?: 'mustNot' | 'must' | 'any' | 'should';
}

function normalizeText(text: string, caseSensitive: boolean) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return caseSensitive ? s : s.toLowerCase();
}

function normalizeKeywords(list: unknown, caseSensitive: boolean) {
  const arr = Array.isArray(list) ? list : [];
  const out = arr
    .map((x) => normalizeText(String(x || ''), caseSensitive))
    .filter(Boolean);
  // 轻量去重，保持稳定顺序
  return Array.from(new Set(out));
}

function hits(text: string, keywords: string[]) {
  const found: string[] = [];
  for (const k of keywords) {
    if (!k) continue;
    if (text.includes(k)) found.push(k);
  }
  return found;
}

export function matchCommentText(textRaw: string, rule: CommentKeywordMatchRule): CommentMatchResult {
  const caseSensitive = rule.caseSensitive === true;
  const text = normalizeText(textRaw, caseSensitive);

  const mustNot = normalizeKeywords(rule.mustNot, caseSensitive);
  const must = normalizeKeywords(rule.must, caseSensitive);
  const any = normalizeKeywords(rule.any, caseSensitive);
  const should = normalizeKeywords(rule.should, caseSensitive);

  const mustNotHits = hits(text, mustNot);
  if (mustNotHits.length > 0) {
    return {
      ok: false,
      anyHits: [],
      mustHits: [],
      shouldHits: [],
      anyCount: 0,
      shouldCount: 0,
      rejectedBy: 'mustNot',
    };
  }

  const mustHits = hits(text, must);
  if (must.length > 0 && mustHits.length !== must.length) {
    return {
      ok: false,
      anyHits: [],
      mustHits,
      shouldHits: [],
      anyCount: 0,
      shouldCount: 0,
      rejectedBy: 'must',
    };
  }

  const anyHits = hits(text, any);
  const minAny = typeof rule.minAnyMatches === 'number' ? Math.max(0, Math.floor(rule.minAnyMatches)) : (any.length > 0 ? 1 : 0);
  if (any.length > 0 && anyHits.length < minAny) {
    return {
      ok: false,
      anyHits,
      mustHits,
      shouldHits: [],
      anyCount: anyHits.length,
      shouldCount: 0,
      rejectedBy: 'any',
    };
  }

  const shouldHits = hits(text, should);
  const shouldCount = shouldHits.length;
  if (typeof rule.minShouldMatches === 'number') {
    const minShould = Math.max(0, Math.floor(rule.minShouldMatches));
    if (should.length > 0 && shouldCount < minShould) {
      return {
        ok: false,
        anyHits,
        mustHits,
        shouldHits,
        anyCount: anyHits.length,
        shouldCount,
        rejectedBy: 'should',
      };
    }
  }

  return {
    ok: true,
    anyHits,
    mustHits,
    shouldHits,
    anyCount: anyHits.length,
    shouldCount,
  };
}

export function isLegacyKeywordRule(rule: any): rule is CommentKeywordMatchRule {
  if (!rule || typeof rule !== 'object') return false;
  // legacy: uses any/must/mustNot/should keys
  const keys = ['any', 'must', 'mustNot', 'should', 'minAnyMatches', 'minShouldMatches', 'caseSensitive'];
  return keys.some((k) => Object.prototype.hasOwnProperty.call(rule, k));
}
