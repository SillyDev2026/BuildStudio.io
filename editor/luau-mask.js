// Extracted lexical masker from Luau Developer Playground.
export function maskLuau(source) {
  // Keep every character offset and line break intact while ignoring text in
  // strings and comments. Long bracket literals must not be tokenized as code.
  let output = '';
  let i = 0;
  const mask = text => text.replace(/[^\r\n]/g, ' ');
  while (i < source.length) {
    if (source.startsWith('--', i)) {
      const block = /^--\[(=*)\[/.exec(source.slice(i));
      if (block) {
        const closing = ']' + block[1] + ']';
        const closeAt = source.indexOf(closing, i + block[0].length);
        const end = closeAt < 0 ? source.length : closeAt + closing.length;
        output += mask(source.slice(i, end));
        i = end;
        continue;
      }
      const newline = source.indexOf('\n', i);
      const end = newline < 0 ? source.length : newline;
      output += mask(source.slice(i, end));
      i = end;
      continue;
    }
    if (source[i] === '[') {
      const long = /^\[(=*)\[/.exec(source.slice(i));
      if (long) {
        const closing = ']' + long[1] + ']';
        const closeAt = source.indexOf(closing, i + long[0].length);
        const end = closeAt < 0 ? source.length : closeAt + closing.length;
        output += mask(source.slice(i, end));
        i = end;
        continue;
      }
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      let end = i + 1;
      while (end < source.length) {
        if (source[end] === '\\') { end = Math.min(source.length, end + 2); continue; }
        if (source[end++] === ch) break;
      }
      output += mask(source.slice(i, end));
      i = end;
      continue;
    }
    output += ch;
    i++;
  }
  return output;
}

