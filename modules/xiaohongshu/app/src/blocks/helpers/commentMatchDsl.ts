export type CommentMatchTerm = string;

export type CommentMatchExpr =
  | { op: 'any'; terms: CommentMatchTerm[] }
  | { op: 'all'; terms: CommentMatchTerm[] }
  | { op: 'atLeast'; terms: CommentMatchTerm[]; min: number }
  | { op: 'and'; exprs: CommentMatchExpr[] }
  | { op: 'or'; exprs: CommentMatchExpr[] }
  | { op: 'not'; expr: CommentMatchExpr };

export interface CommentMatchDslRule {
  /**
   * Default: false (case-insensitive).
   * Applies to all terms in this rule unless a caller normalizes terms separately.
   */
  caseSensitive?: boolean;
  /**
   * Exclusion filter. If matched => reject.
   * Typical: { op:'any', terms:[...] } or { op:'or', exprs:[...] }.
   */
  exclude?: CommentMatchExpr;
  /**
   * Required filter. Must be satisfied to accept.
   * Typical: any/all/atLeast/and/or combinations.
   */
  require?: CommentMatchExpr;
  /**
   * Optional preference signal for ranking/scoring.
   * If provided, matcher will count hits and return `preferHits`.
   * If you want to enforce, just put it into `require`.
   */
  prefer?: CommentMatchExpr;
}

export interface CommentMatchDslResult {
  ok: boolean;
  rejectedBy?: 'exclude' | 'require';
  hits: string[];
  requireHits: string[];
  excludeHits: string[];
  preferHits: string[];
  score: number;
}

function normalizeText(s: string, caseSensitive: boolean) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return caseSensitive ? t : t.toLowerCase();
}

function normalizeTerms(terms: CommentMatchTerm[], caseSensitive: boolean) {
  const list = Array.isArray(terms) ? terms : [];
  const out = list
    .map((x) => normalizeText(String(x || ''), caseSensitive))
    .filter(Boolean);
  return Array.from(new Set(out));
}

function termHits(text: string, terms: string[]) {
  const hits: string[] = [];
  for (const t of terms) {
    if (!t) continue;
    if (text.includes(t)) hits.push(t);
  }
  return hits;
}

function evalExpr(text: string, expr: CommentMatchExpr, caseSensitive: boolean): { ok: boolean; hits: string[] } {
  if (!expr || typeof expr !== 'object') return { ok: false, hits: [] };

  switch (expr.op) {
    case 'any': {
      const terms = normalizeTerms(expr.terms, caseSensitive);
      const hits = termHits(text, terms);
      return { ok: hits.length > 0, hits };
    }
    case 'all': {
      const terms = normalizeTerms(expr.terms, caseSensitive);
      const hits = termHits(text, terms);
      return { ok: terms.length > 0 ? hits.length === terms.length : true, hits };
    }
    case 'atLeast': {
      const terms = normalizeTerms(expr.terms, caseSensitive);
      const min = Math.max(0, Math.floor(Number(expr.min)));
      const hits = termHits(text, terms);
      return { ok: min <= 0 ? true : hits.length >= min, hits };
    }
    case 'and': {
      const exprs = Array.isArray(expr.exprs) ? expr.exprs : [];
      const hitsAll: string[] = [];
      for (const e of exprs) {
        const r = evalExpr(text, e, caseSensitive);
        hitsAll.push(...r.hits);
        if (!r.ok) return { ok: false, hits: Array.from(new Set(hitsAll)) };
      }
      return { ok: true, hits: Array.from(new Set(hitsAll)) };
    }
    case 'or': {
      const exprs = Array.isArray(expr.exprs) ? expr.exprs : [];
      const hitsAll: string[] = [];
      for (const e of exprs) {
        const r = evalExpr(text, e, caseSensitive);
        hitsAll.push(...r.hits);
        if (r.ok) return { ok: true, hits: Array.from(new Set(hitsAll)) };
      }
      return { ok: false, hits: Array.from(new Set(hitsAll)) };
    }
    case 'not': {
      const r = evalExpr(text, expr.expr, caseSensitive);
      return { ok: !r.ok, hits: r.hits };
    }
    default: {
      const _exhaustive: never = expr;
      return { ok: false, hits: [] };
    }
  }
}

export function matchCommentTextDsl(textRaw: string, rule: CommentMatchDslRule): CommentMatchDslResult {
  const caseSensitive = rule.caseSensitive === true;
  const text = normalizeText(textRaw, caseSensitive);

  const exclude = rule.exclude;
  if (exclude) {
    const r = evalExpr(text, exclude, caseSensitive);
    if (r.ok) {
      const hits = Array.from(new Set(r.hits));
      return {
        ok: false,
        rejectedBy: 'exclude',
        hits,
        requireHits: [],
        excludeHits: hits,
        preferHits: [],
        score: 0,
      };
    }
  }

  let requireHits: string[] = [];
  if (rule.require) {
    const r = evalExpr(text, rule.require, caseSensitive);
    requireHits = Array.from(new Set(r.hits));
    if (!r.ok) {
      return {
        ok: false,
        rejectedBy: 'require',
        hits: requireHits,
        requireHits,
        excludeHits: [],
        preferHits: [],
        score: 0,
      };
    }
  }

  let preferHits: string[] = [];
  if (rule.prefer) {
    const r = evalExpr(text, rule.prefer, caseSensitive);
    preferHits = Array.from(new Set(r.hits));
  }

  const hits = Array.from(new Set([...requireHits, ...preferHits]));
  // score: prefer hits first, then require hits
  const score = preferHits.length * 100 + requireHits.length;

  return {
    ok: true,
    hits,
    requireHits,
    excludeHits: [],
    preferHits,
    score,
  };
}

