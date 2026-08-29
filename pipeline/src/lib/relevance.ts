import type { ChangelogEntry, Relevance, SymbolMatch, WatchTarget } from "../types.ts";

/**
 * Match a symbol with boundaries that work for code-shaped tokens too.
 *
 * `\b` is useless for a symbol like "/v1/charges" (it starts with a non-word char), so
 * we use lookarounds on word chars and hyphens instead. This is what stops the symbol
 * "source" matching inside "resource".
 */
function symbolRegex(symbol: string): RegExp {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i");
}

/** Pull out the `backticked` tokens parse.ts preserved from <code> spans. */
function codeTokens(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
}

/**
 * Decide whether an entry touches code we actually call.
 *
 * A match inside a code span is strong evidence; a match in prose is weaker but still
 * worth surfacing. A breaking entry that matches nothing is recorded, not acted on
 * (specs/agent.md §The loop, step 3).
 */
export function assessRelevance(
  entry: Pick<ChangelogEntry, "title" | "body">,
  target: WatchTarget,
): Relevance {
  const text = `${entry.title}\n${entry.body}`;
  const tokens = codeTokens(text);

  const matches: SymbolMatch[] = [];
  const paths = new Set<string>();

  for (const watch of target.watches) {
    let watchMatched = false;

    for (const symbol of watch.symbols) {
      const re = symbolRegex(symbol);
      const inCode = tokens.some((token) => re.test(token));

      if (inCode) {
        matches.push({ symbol, how: "code" });
        watchMatched = true;
      } else if (re.test(text)) {
        matches.push({ symbol, how: "text" });
        watchMatched = true;
      }
    }

    if (watchMatched) paths.add(watch.path);
  }

  return { relevant: matches.length > 0, matches, paths: [...paths] };
}
