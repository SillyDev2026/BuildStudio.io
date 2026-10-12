const KEYWORDS = new Set('and break continue do else elseif end export false for function if in local nil not or repeat return then true type until while'.split(' '));
const BUILTINS = new Set('assert error getmetatable ipairs next pairs pcall print require select setmetatable tonumber tostring type typeof unpack xpcall math string table task coroutine os bit32 buffer vector utf8'.split(' '));
const TYPES = new Set('any boolean number string thread unknown never nil vector buffer'.split(' '));
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const COMMENT = /(?:--\[(=*)\[[\s\S]*?\]\1\]|--[^\n]*)/y;
const STRING = /(?:\[(=*)\[[\s\S]*?\]\1\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/y;
const NUMBER = /(?:0[xX][0-9a-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?)/y;
const IDENTIFIER = /[A-Za-z_][A-Za-z_0-9]*/y;

// Presentation lexer only; type diagnostics and compilation live in the official runner.
// Sticky regexes scan the original string without allocating a source.slice(i) on every token.
export function highlightLuau(source) {
  const parts = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    let rule = null;
    let cls = '';
    if (ch === '-' && source[i + 1] === '-') { rule = COMMENT; cls = 'comment'; }
    else if (ch === '"' || ch === "'" || ch === '`' || ch === '[') { rule = STRING; cls = 'string'; }
    else if ((ch >= '0' && ch <= '9')) { rule = NUMBER; cls = 'number'; }
    else if (ch === '_' || ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z') { rule = IDENTIFIER; }
    if (rule) {
      rule.lastIndex = i;
      const match = rule.exec(source);
      if (match) {
        const word = match[0];
        if (rule === IDENTIFIER) cls = KEYWORDS.has(word) ? 'keyword' : TYPES.has(word) ? 'type' : BUILTINS.has(word) ? 'builtin' : '';
        const escaped = escapeHtml(word);
        parts.push(cls ? `<span class="token ${cls}">${escaped}</span>` : escaped);
        i += word.length;
        continue;
      }
    }
    parts.push(escapeHtml(ch));
    i++;
  }
  return parts.join('') + '\n';
}
