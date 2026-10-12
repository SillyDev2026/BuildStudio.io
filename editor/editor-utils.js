export function findMatches(source, query, caseSensitive = false) {
  if (!query) return [];
  const haystack = caseSensitive ? source : source.toLocaleLowerCase();
  const needle = caseSensitive ? query : query.toLocaleLowerCase();
  const matches = [];
  for (let i = 0; i < haystack.length && matches.length < 10000;) {
    const index = haystack.indexOf(needle, i);
    if (index === -1) break;
    matches.push(index);
    i = index + Math.max(1, needle.length);
  }
  return matches;
}

export function replaceAllLiteral(source, query, replacement, caseSensitive = false) {
  const positions = findMatches(source, query, caseSensitive);
  if (!positions.length) return { source, count: 0 };
  let cursor = 0;
  let result = '';
  for (const index of positions) {
    result += source.slice(cursor, index) + replacement;
    cursor = index + query.length;
  }
  return { source: result + source.slice(cursor), count: positions.length };
}

export function positionForLine(source, line) {
  const target = Math.max(1, Math.round(Number(line) || 1));
  let position = 0;
  for (let i = 1; i < target; i++) {
    const next = source.indexOf('\n', position);
    if (next === -1) return source.length;
    position = next + 1;
  }
  return position;
}

export function currentLineAndColumn(source, position) {
  const before = source.slice(0, Math.max(0, position));
  const line = before.split('\n');
  return { line: line.length, column: line.at(-1).length + 1 };
}

export function indentSelection(source, start, end, outdent = false) {
  const startLine = source.lastIndexOf('\n', start - 1) + 1;
  const endLine = end > start && source[end - 1] === '\n' ? end - 1 : end;
  const segment = source.slice(startLine, endLine);
  const lines = segment.split('\n');
  const changed = lines.map(line => outdent ? line.replace(/^( {1,4}|\t)/, '') : `    ${line}`);
  const newSegment = changed.join('\n');
  return { source: source.slice(0, startLine) + newSegment + source.slice(endLine), start: startLine, end: startLine + newSegment.length };
}
