// Offline, lexical Luau/Roblox suggestions. Not a type checker.
import { maskLuau } from './luau-mask.js';

const KEYWORDS = 'and break continue do else elseif end export false for function if in local nil not or repeat return then true type typeof until while'.split(' ');
const GLOBALS = 'print warn assert error require tostring tonumber pairs ipairs next pcall xpcall select setmetatable getmetatable rawget rawset rawequal math string table buffer utf8 bit32 coroutine task os Enum Instance Vector3 Vector2 CFrame Color3 UDim2 UDim BrickColor RaycastParams OverlapParams Random game workspace script plugin'.split(' ');
const TYPES = 'any unknown never nil boolean number string thread buffer vector table Instance Player Part Model Humanoid RBXScriptSignal Vector3 Vector2 CFrame Color3 UDim2 UDim'.split(' ');
const MEMBERS = {
  game: ['GetService', 'FindFirstChild', 'WaitForChild', 'GetDescendants', 'GetChildren', 'IsA', 'Name', 'Parent', 'PlaceId', 'GameId', 'Players', 'Workspace', 'ReplicatedStorage', 'ServerScriptService', 'RunService'],
  workspace: ['FindFirstChild', 'WaitForChild', 'GetChildren', 'GetDescendants', 'Raycast', 'GetPartBoundsInBox', 'GetPartBoundsInRadius', 'Name', 'Parent', 'CurrentCamera'],
  Instance: ['new'],
  Vector3: ['new', 'zero', 'one', 'xAxis', 'yAxis', 'zAxis'],
  Vector2: ['new', 'zero', 'one'],
  UDim2: ['new', 'fromScale', 'fromOffset'],
  Color3: ['new', 'fromRGB', 'fromHSV', 'fromHex'],
  CFrame: ['new', 'Angles', 'lookAt', 'fromEulerAnglesXYZ'],
  task: ['wait', 'spawn', 'defer', 'delay', 'cancel', 'synchronize', 'desynchronize'],
  table: ['insert', 'remove', 'sort', 'find', 'clear', 'clone', 'freeze', 'isfrozen', 'concat', 'move', 'pack', 'unpack', 'create'],
  string: ['byte', 'char', 'find', 'format', 'gmatch', 'gsub', 'len', 'lower', 'match', 'rep', 'reverse', 'split', 'sub', 'upper'],
  math: ['abs', 'ceil', 'floor', 'max', 'min', 'clamp', 'round', 'random', 'sqrt', 'pow', 'log', 'log10', 'exp', 'sin', 'cos', 'atan2', 'huge', 'pi'],
  buffer: ['create', 'len', 'copy', 'fill', 'readu8', 'writeu8', 'readu16', 'writeu16', 'readu32', 'writeu32', 'readf32', 'writef32', 'readf64', 'writef64', 'readstring', 'writestring'],
  Enum: ['KeyCode', 'UserInputType', 'Material', 'EasingStyle', 'EasingDirection', 'Font', 'HumanoidStateType', 'RenderPriority']
};
function addName(map, name, kind) {
  if (name && !map.has(name)) map.set(name, { label: name, kind: kind });
}
export function completeLuau(source, cursor) {
  const clean = maskLuau(source);
  const before = clean.slice(0, cursor);
  if (source[cursor - 1] && clean[cursor - 1] === ' ' && source[cursor - 1] !== ' ') return null;
  const member = before.match(/\b([A-Za-z_]\w*)\s*([.:])\s*([A-Za-z_]\w*)?$/);
  const identifier = before.match(/(?:^|[^A-Za-z_0-9.])([A-Za-z_]\w*)$/);
  if (!member && !identifier) return null;
  const word = member ? (member[3] || '') : identifier[1];
  if (word.length > 45 || (!member && word.length < 1)) return null;
  const map = new Map();
  if (member) {
    const base = member[1];
    const locals = new Map();
    const localRegex = /\blocal\s+([A-Za-z_]\w*)\s*(?::\s*([A-Za-z_]\w*))?\s*=\s*([^\n]+)/g;
    for (const match of source.slice(0,cursor).matchAll(localRegex)) {
      const type = match[2] || (/game:GetService\s*\(\s*["']([A-Za-z_]\w*)["']/.exec(match[3]) || [])[1] ||
        (/Instance\.new\s*\(\s*["']([A-Za-z_]\w*)["']/.exec(match[3]) || [])[1] || '';
      locals.set(match[1], type);
    }
    const type = locals.get(base) || base;
    const known = MEMBERS[type] || MEMBERS[base] || [];
    for (const name of known) addName(map, name, 'member');
  } else {
    const scope = clean.slice(0, cursor);
    for (const match of scope.matchAll(/\blocal\s+(?!function\b)([A-Za-z_]\w*)|\blocal\s+function\s+([A-Za-z_]\w*)|\bfunction\s+([A-Za-z_]\w*)|\btype\s+([A-Za-z_]\w*)/g)) {
      addName(map, match[1] || match[2] || match[3] || match[4], 'local');
    }
    for (const name of GLOBALS) addName(map, name, 'global');
    for (const name of TYPES) addName(map, name, 'type');
    for (const name of KEYWORDS) addName(map, name, 'keyword');
  }
  const lower = word.toLowerCase();
  const ranked = [...map.values()].filter(item => item.label.toLowerCase().startsWith(lower) && item.label !== word);
  ranked.sort((a, b) => (a.kind === 'local' ? -1 : 0) - (b.kind === 'local' ? -1 : 0) || a.label.localeCompare(b.label));
  const items = ranked.slice(0, 10);
  if (!items.length) return null;
  return { items, from: cursor - word.length, to: cursor, query: word };
}
