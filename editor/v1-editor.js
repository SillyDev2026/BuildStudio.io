import { highlightLuau } from './highlight.js';
import { indentSelection, currentLineAndColumn, positionForLine } from './editor-utils.js';
import { maskLuau } from './luau-mask.js';
import { sourceLines, gutterHeights, isWrappingInput } from './editor-line-layout.js';

const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
export function newlineIndent(source, cursor) {
  const before = source.slice(source.lastIndexOf('\n', cursor - 1) + 1, cursor);
  const indentation = before.match(/^\s*/)?.[0] || '';
  const deeper = /(?:\b(?:then|do|else|repeat|function)\b|\{)\s*(?:--[^\n]*)?$/.test(before);
  return '\n' + indentation + (deeper ? '    ' : '');
}
export function matchBracket(source, cursor) {
  // Brackets inside strings or comments are not structural Luau syntax.
  const clean = maskLuau(source);
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const reverse = { ')': '(', ']': '[', '}': '{' };
  const at = /[()\[\]{}]/.test(clean[cursor] || '') ? cursor : cursor - 1;
  if (at < 0) return null;
  const ch = clean[at];
  const forward = Object.hasOwn(pairs, ch);
  const other = forward ? pairs[ch] : reverse[ch];
  if (!other) return null;
  let depth = 1;
  const step = forward ? 1 : -1;
  for (let i = at + step; i >= 0 && i < clean.length; i += step) {
    if (clean[i] === ch) depth++;
    else if (clean[i] === other && --depth === 0) return [Math.min(at, i), Math.max(at, i)];
  }
  return null;
}

export class CodeEditor {
  constructor({ input, highlight, gutter, onChange, onCursor, onShortcut }) {
    Object.assign(this, { input, highlight, gutter, onChange, onCursor, onShortcut });
    this.source = null;
    this.raf = 0;
    this.lastGutterCount = -1;
    this.lastGutterMode = 'plain';
    this.wrapMirror = null;
    this.lastWrapWidth = 0;
    input.addEventListener('input', () => { this.render(); this.onChange(input.value); this.onCursor(); });
    input.addEventListener('scroll', () => { highlight.parentElement.scrollTop = input.scrollTop; highlight.parentElement.scrollLeft = input.scrollLeft; gutter.scrollTop = input.scrollTop; });
    for (const type of ['click', 'keyup', 'select']) input.addEventListener(type, () => this.onCursor());
    input.addEventListener('keydown', event => this.keydown(event));
    // Android virtual keyboards may emit beforeinput without a reliable
    // keydown Enter. Use the same newline insertion as hardware keyboards.
    // Resize may change how many screen rows a single source line occupies.
    if(typeof ResizeObserver==='function'){
      this.resizeObserver=new ResizeObserver(()=>{
        if(isWrappingInput(this.input)&&this.input.clientWidth!==this.lastWrapWidth)this.syncLineNumbers();
      });
      this.resizeObserver.observe(input);
    }
    input.addEventListener('beforeinput', event => {
      if ((event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') && event.cancelable && !event.isComposing) {
        event.preventDefault();
        this.insertNewline();
      }
    });
  }
  load(text, path) {
    this.source = path;
    this.input.dataset.path = path;
    this.input.value = text;
    this.input.selectionStart = this.input.selectionEnd = 0;
    this.input.scrollTop = this.input.scrollLeft = 0;
    this.render(); this.onCursor();
    // File changes are programmatic: input does not fire on new/open/rename.
    // Let completion providers discard items belonging to the old source.
    this.input.dispatchEvent(new Event('luauforge:filechange'));
  }
  // Update the gutter before painting highlighted tokens. This also handles
  // Android IME events where the line count changes between animation frames.
  syncLineNumbers() {
    const lines=sourceLines(this.input.value);
    const count=lines.length;
    const wrapping=isWrappingInput(this.input) && this.input.clientWidth>0 &&
      typeof getComputedStyle==='function' && !!this.input.ownerDocument;
    if(wrapping){
      const doc=this.input.ownerDocument,computed=getComputedStyle(this.input);
      if(!this.wrapMirror){
        this.wrapMirror=doc.createElement('div');
        this.wrapMirror.className='editor-wrap-mirror';
        this.input.parentElement.append(this.wrapMirror);
      }
      const mirror=this.wrapMirror;
      mirror.style.width=this.input.clientWidth+'px';
      mirror.style.font=computed.font;
      mirror.style.lineHeight=computed.lineHeight;
      mirror.style.letterSpacing=computed.letterSpacing;
      mirror.style.paddingLeft=computed.paddingLeft;
      mirror.style.paddingRight=computed.paddingRight;
      mirror.style.tabSize=computed.tabSize;
      mirror.style.whiteSpace=computed.whiteSpace;
      mirror.style.overflowWrap='anywhere';
      this.lastWrapWidth=this.input.clientWidth;
      // A div per logical line measures its actual wrapped row height. Blank
      // lines still need one full line-height of vertical space.
      const fragment=doc.createDocumentFragment();
      for(const text of lines){
        const row=doc.createElement('div');
        row.textContent=text||'\u200b';
        fragment.append(row);
      }
      mirror.replaceChildren(fragment);
      const lineHeight=parseFloat(computed.lineHeight)||22;
      const heights=gutterHeights(lines,(_,i)=>mirror.children[i].getBoundingClientRect().height,lineHeight);
      const gutterFragment=doc.createDocumentFragment();
      for(let i=0;i<count;i++){
        const row=doc.createElement('div');
        row.className='gutter-number-row';
        row.textContent=String(i+1);
        row.style.height=heights[i]+'px';
        gutterFragment.append(row);
      }
      this.gutter.replaceChildren(gutterFragment);
      this.lastGutterCount=count;
      this.lastGutterMode='wrapped';
    }else{
      if(this.lastGutterMode!=='plain'||count!==this.lastGutterCount){
        this.lastGutterCount=count;
        this.gutter.textContent=Array.from({length:count},(_,i)=>i+1).join('\n');
      }
      this.lastGutterMode='plain';
      if(this.wrapMirror)this.wrapMirror.replaceChildren();
    }
    this.gutter.scrollTop=this.input.scrollTop;
  }
  render() {
    this.syncLineNumbers();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      this.highlight.innerHTML = highlightLuau(this.input.value);
      this.highlight.parentElement.scrollTop = this.input.scrollTop;
      this.highlight.parentElement.scrollLeft = this.input.scrollLeft;
    });
  }
  // A real LF is required to create the next numbered Luau line. Soft word
  // wrapping only changes presentation and must never modify source code.
  insertNewline() {
    const start=this.input.selectionStart, end=this.input.selectionEnd;
    this.replace(start,end,newlineIndent(this.input.value,start));
  }
  replace(start, end, value, cursor = start + value.length) {
    this.input.focus();
    this.input.setRangeText(value, start, end, 'end');
    this.input.setSelectionRange(cursor, cursor);
    this.input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  selectLine(line) {
    const pos = positionForLine(this.input.value, line);
    this.input.focus(); this.input.setSelectionRange(pos, pos);
    this.input.scrollTop = Math.max(0, (line - 5) * (parseFloat(getComputedStyle(this.input).lineHeight) || 21));
    this.onCursor();
  }
  keydown(event) {
    const input = this.input, ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && (event.key === 'Enter' || event.key === 's' || event.key === 'S' || event.key === 'p' || event.key === 'P' || event.key === 'b' || event.key === 'B' || event.key === 'f' || event.key === 'F')) {
      event.preventDefault(); this.onShortcut(event.key.toLowerCase()); return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const { selectionStart: start, selectionEnd: end } = input;
      if (start === end && !event.shiftKey) this.replace(start, end, '    ');
      else { const result = indentSelection(input.value, start, end, event.shiftKey); this.replace(0, input.value.length, result.source, result.end); input.setSelectionRange(result.start, result.end); }
      return;
    }
    if (event.key === 'Enter' && !ctrl && !event.altKey && !event.isComposing) {
      event.preventDefault(); this.insertNewline(); return;
    }
    if (input.selectionStart === input.selectionEnd && !ctrl && !event.altKey && !event.isComposing) {
      const a = input.selectionStart;
      if (PAIRS[event.key]) {
        event.preventDefault(); this.replace(a, a, event.key + PAIRS[event.key], a + 1); return;
      }
      if ([')', ']', '}'].includes(event.key) && input.value[a] === event.key) {
        event.preventDefault(); input.setSelectionRange(a + 1, a + 1); this.onCursor();
      }
    }
  }
  get position() { return currentLineAndColumn(this.input.value, this.input.selectionStart); }
}
