/**
 * Textarea caret coordinates in its own scrolled viewport.
 * The hidden mirror copies the text metrics and wrapping rules so popups stay
 * close to the insertion point with monospaced or proportional fonts.
 */
export function textareaCaretOffset(editor, cursor = editor.selectionStart) {
  const style = getComputedStyle(editor);
  const mirror = document.createElement('div');
  for (const name of [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
    'letterSpacing', 'textTransform', 'textIndent', 'tabSize',
    'padding', 'borderWidth', 'boxSizing', 'whiteSpace', 'overflowWrap',
    'wordBreak', 'textAlign', 'direction'
  ]) mirror.style[name] = style[name];
  mirror.style.position = 'fixed';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.left = '-100000px';
  mirror.style.top = '0';
  mirror.style.width = `${editor.clientWidth}px`;
  mirror.style.height = 'auto';
  mirror.style.minHeight = '0';
  mirror.style.maxHeight = 'none';
  mirror.style.overflow = 'visible';
  // A textarea uses pre-wrap in soft-wrap mode; the mirror must do the same.
  mirror.style.whiteSpace = editor.wrap === 'off' ? 'pre' : 'pre-wrap';
  mirror.append(document.createTextNode(editor.value.slice(0, cursor)));
  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.append(marker);
  document.body.append(mirror);
  const coordinates = {
    x: marker.offsetLeft - editor.scrollLeft,
    y: marker.offsetTop - editor.scrollTop,
    lineHeight: parseFloat(style.lineHeight) || 22
  };
  mirror.remove();
  return coordinates;
}

/** Fit an IntelliSense popup inside the visible editor, above the caret if needed. */
export function placeCompletionPopup(anchor, bounds, preferred = { width: 380, height: 260 }, margin = 7) {
  const width = Math.min(preferred.width, Math.max(0, bounds.width - margin * 2));
  const availableBelow = Math.max(0, bounds.height - anchor.y - anchor.lineHeight - margin - 3);
  const availableAbove = Math.max(0, anchor.y - margin - 3);
  const below = availableBelow >= Math.min(preferred.height, 145) || availableBelow >= availableAbove;
  const available = below ? availableBelow : availableAbove;
  const height = Math.max(0, Math.min(preferred.height, available, Math.floor(bounds.height * .58)));
  const maxLeft = Math.max(margin, bounds.width - width - margin);
  const left = Math.min(maxLeft, Math.max(margin, anchor.x));
  const top = below ? anchor.y + anchor.lineHeight + 3 : anchor.y - height - 3;
  return { left, top: Math.max(margin, Math.min(bounds.height - height - margin, top)), width, height, below };
}
