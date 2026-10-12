// The gutter numbers logical (LF-separated) lines, not the screen rows caused
// by wrapping. A wrapped line takes up multiple line-heights in the gutter.
export function sourceLines(source,limit=10000) {
  return String(source).split('\n').slice(0,limit);
}
export function gutterHeights(lines,measure,lineHeight) {
  const minimum=Number.isFinite(lineHeight)&&lineHeight>0?lineHeight:22;
  return lines.map((line,index)=>{
    const height=Number(measure(line,index));
    return Number.isFinite(height)&&height>0?Math.max(minimum,height):minimum;
  });
}
export function isWrappingInput(input) {
  return input?.wrap === 'soft' && input?.style?.whiteSpace !== 'pre';
}
