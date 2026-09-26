/* ============================================================================
   MIND MATH — interactive scientific workspace engine
   - Canvas coordinate-plane renderer (pan / zoom / trace)
   - Expression parser: functions f(x), points, vertical lines, implicit f(x,y)=0
   - Tools: move / point / line / circle / extremum / root / intersect / tangent
   - Panels: algebra list, value table, mini sheet, settings
   No external dependencies. Vietnamese UI.
   ============================================================================ */
(function () {
"use strict";

/* ---------------- utilities ---------------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const PALETTE = ["#8b5cf6", "#38bdf8", "#e879f9", "#34d399", "#fbbf24", "#fb7185", "#a5b4fc", "#22d3ee"];
const FN_NAMES = ["asin", "acos", "atan", "sinh", "cosh", "tanh", "sin", "cos", "tan", "sqrt", "cbrt", "abs", "exp", "floor", "ceil", "round", "sign", "log10"];
/* helpers toàn cục cho bàn phím GeoGebra — new Function() vẫn nhìn thấy */
function fact(n) { n = Math.floor(Number(n)); if (!isFinite(n) || n < 0 || n > 170) return NaN; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
function logb(x, b) { const bb = (b === undefined ? 10 : Number(b)); try { return Math.log(Number(x)) / Math.log(bb); } catch { return NaN; } }
function nroot(x, n) { const nn = (n === undefined ? 2 : Number(n)); try { if (nn === 2) return Math.sqrt(Number(x)); return Math.sign(Number(x)) * Math.pow(Math.abs(Number(x)), 1 / nn); } catch { return NaN; } }
try { globalThis.fact = fact; globalThis.logb = logb; globalThis.nroot = nroot; } catch {}

function toast(msg, kind) {
  const stack = $("#toastStack");
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " " + kind : "");
  el.textContent = msg;
  stack.appendChild(el);
  while (stack.children.length > 3) stack.removeChild(stack.firstChild);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .4s"; }, 2600);
  setTimeout(() => el.remove(), 3100);
}

/* ---------------- math expression compiler ----------------
   Compiles a user string into JS. Returns { js, vars }.
   - chuẩn hoá Unicode kiểu GeoGebra (≤ ≥ ≠ ∞ ² √ ± ° % ! ∧∨¬ Hy Lạp…)
   - inserts explicit multiplication (2x -> 2*x)
   - maps names to Math.* ; pi -> Math.PI ; lone e -> Math.E               */
function compileScalar(src) {
  let s = String(src).trim();
  /* --- kiểm tra CAS nâng cao trước để báo lỗi thân thiện (tiếng Việt) --- */
  if (/d\s*\/\s*dx|∫|∮|∬|∂/i.test(s)) throw new Error("Ký hiệu đạo hàm / tích phân (d/dx, ∫) là CAS nâng cao — hãy nhập hàm kết quả để vẽ, vd: 2*x thay vì d/dx x^2.");
  if (/(^|[^a-zA-Z])i([^a-zA-Z]|$)/.test(s.replace(/\b(sin|cos|tan|asin|acos|atan|sinh|cosh|pi)\b/gi, ""))) {
    if (/\bi\b/.test(s)) throw new Error("Số ảo i chưa vẽ được trên đồ thị thực — hãy dùng phần thực / mô-đun.");
  }
  if (/[∀∃∈∉⊂⊆⊃⊇∥⊥∠⊗→⇒⇔]/.test(s)) throw new Error("Ký hiệu logic / tập hợp (∀ ∃ ∈ ⊂ ∥ ⊥ ∠ →) chưa vẽ được — hãy nhập phương trình f(x,y)=0.");
  if (/\bint\b|\bsum\b/.test(s)) throw new Error("Ký hiệu ∫ / Σ là CAS nâng cao — hãy nhập hàm kết quả để vẽ.");
  if (/[{}]/.test(s)) throw new Error("Dấu { } là ký hiệu tập hợp — hãy dùng ( ) cho điểm / biểu thức.");
  if (/:=/.test(s)) s = s.replace(/:=/g, "=");
  /* log cơ số viết trước để dấu _ của log_2(...) không bị chặn */
  s = s.replace(/log\s*_\s*(\d+(?:\.\d+)?|[a-zA-Z]+)\s*\(\s*([^)]+?)\s*\)/gi, (m, b, x) => `logb(${x},${b})`);
  s = s.replace(/log\s*_\s*([a-zA-Z0-9]+)/g, "logb");
  if (/[[\]]/.test(s)) throw new Error("Ngoặc [ ] là ma trận / miền — hãy dùng ( ) , vd: (2,3).");
  if (/[@#$&_]/.test(s)) throw new Error("Ký tự @ # $ & _ chưa hỗ trợ trong biểu thức — hãy dùng x, y, số và hàm.");
  if (/["'`]/.test(s)) throw new Error("Dấu nháy ' \" dùng để đặt tên — biểu thức chỉ dùng x, y, số và hàm.");
  if (/[;]/.test(s) && !/\(.*[,;].*\)/.test(s)) throw new Error("Dấu ; dùng ngăn cách lệnh — hãy nhập từng biểu thức một.");
  if (/:/.test(s)) throw new Error("Dấu : là tỉ lệ / định nghĩa — hãy dùng / cho phép chia, = cho phương trình.");
  if (/->|=>/.test(s)) throw new Error("Mũi tên → (suy ra) là logic — hãy nhập phương trình biên f(x,y)=0.");
  /* --- chuẩn hoá Unicode GeoGebra --- */
  s = s.replace(/π/g, "pi").replace(/÷/g, "/").replace(/×/g, "*").replace(/−/g, "-").replace(/·/g, "*").replace(/•/g, "*");
  s = s.replace(/≤/g, "<=").replace(/≥/g, ">=").replace(/≠/g, "!=").replace(/≐|≅|≈/g, "=");
  s = s.replace(/∞/g, "Infinity").replace(/±/g, "+").replace(/∓/g, "-");
  s = s.replace(/∧/g, "&&").replace(/∨/g, "||");
  s = s.replace(/¬/g, "!").replace(/⌐/g, "!");
  s = s.replace(/²/g, "^2").replace(/³/g, "^3").replace(/ⁿ/g, "^");
  s = s.replace(/⁰/g, "^0").replace(/¹/g, "^1").replace(/⁴/g, "^4").replace(/⁵/g, "^5").replace(/⁶/g, "^6").replace(/⁷/g, "^7").replace(/⁸/g, "^8").replace(/⁹/g, "^9").replace(/⁺/g, "+");
  s = s.replace(/∛\s*(\d+(?:\.\d+)?)/g, "cbrt($1)").replace(/√\s*(\d+(?:\.\d+)?)/g, "sqrt($1)");
  s = s.replace(/∛/g, "cbrt").replace(/√/g, "sqrt");
  s = s.replace(/sin\s*⁻¹|sin\s*\^\s*-1/gi, "asin").replace(/cos\s*⁻¹|cos\s*\^\s*-1/gi, "acos").replace(/tan\s*⁻¹|tan\s*\^\s*-1/gi, "atan");
  s = s.replace(/⁻¹/g, "^-1").replace(/⁻/g, "-").replace(/ˣ/g, "^");
  s = s.replace(/α|β|γ|θ|λ|μ|τ|φ|ω|ρ|σ/gi, (m) => (m.toLowerCase() === "π" ? m : "x"));
  s = s.replace(/Δ/g, "x").replace(/Σ/g, "x");
  /* % → /100 (50% = 50/100, x% = x/100), ° → radian (chỉ số) */
  s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");
  s = s.replace(/([xXyY\)])\s*%/g, "($1/100)");
  s = s.replace(/(\d+(?:\.\d+)?)\s*°/g, "($1*pi/180)");
  /* 10^(x), e^(x) để ^ → ** xử lý tự nhiên */
  s = s.replace(/\^/g, "**");
  /* giai thừa: 5! → fact(5), 12! → fact(12), x! → fact(x), (x+1)! → fact((x+1)) */
  s = s.replace(/\(([^()]+)\)\s*!(?!=)/g, (m, a) => `fact((${a}))`);
  s = s.replace(/(\d+(?:\.\d+)?|[xXyY\)])\s*!(?!=)/g, (m, a) => `fact(${a})`);
  // explicit multiplication (2x -> 2*x, 2( -> 2*( ; không phá log10, 10^( )
  s = s.replace(/(?<![a-zA-Z0-9])(\d)(?=[a-zA-Z(])/g, "$1*");
  s = s.replace(/(\))(?=[a-zA-Z0-9(])/g, "$1*");
  s = s.replace(/\b(x|pi|e)\)?\(/g, (m) => (m.endsWith("(") && !/(sin|cos|tan|log|exp|abs|qrt)\($/.test(m) ? m.slice(0, -1) + "*(" : m));
  // 'x(x+1)' edge (above handles most); keep simple second pass:
  s = s.replace(/(x|\))(\()/g, "$1*$2");
  // constants (word boundaries so exp/log names survive)
  s = s.replace(/\bpi\b/g, "Math.PI").replace(/(?<![a-zA-Z])e(?![a-zA-Z0-9])/g, "Math.E");
  // Infinity giữ nguyên (không nhân e)
  s = s.replace(/Math\.EInfinity/g, "Infinity");
  // ln / log handling BEFORE generic names
  s = s.replace(/\bln\b/g, "Math.log").replace(/(?<!\.)\blog\b(?!\d)/g, "Math.log10");
  for (const n of FN_NAMES) {
    if (n === "log10") { s = s.replace(/Math\.log10/g, "__L10__").replace(/\blog10\b/g, "Math.log10").replace(/__L10__/g, "Math.log10"); continue; }
    const re = new RegExp("\\b" + n + "\\b", "g");
    s = s.replace(re, "Math." + n);
  }
  /* hàm tuỳ biến toàn cục (không prefix Math.) */
  s = s.replace(/\bMath\.logb\b/g, "logb").replace(/\bMath\.nroot\b/g, "nroot").replace(/\bMath\.fact\b/g, "fact");
  if (/__/.test(s) || /constructor|prototype|Function|import|require|=>|;|\[|\]|{|}|`|\\/.test(s)) {
    throw new Error("Biểu thức chứa ký tự không hỗ trợ.");
  }
  if (!/^[0-9xXyY+\-*/().,\s*MathPIElogqrtcsinadexfpobw\d.!&|><=]*$/.test(s)) {
    throw new Error("Biểu thức chứa ký tự không hỗ trợ.");
  }
  return s;
}

function makeFn(js, vars) {
  // vars: e.g. ['x'] or ['x','y']
  const args = vars.join(",");
  try {
    // eslint-disable-next-line no-new-func
    return new Function(args, `"use strict"; return (${js});`);
  } catch (e) {
    throw new Error("Không hiểu biểu thức này.");
  }
}

/* Parse a full command line into a math object descriptor.
   kinds: 'fn' (y=f(x)) | 'point' | 'point3d' | 'vline' (x=c)
        | 'implicit' (f(x,y)=0) | 'surface' (z=f(x,y))
        | 'solid' (khối/hình 3D cơ bản: box, cube, sphere, cyl, cone, pyramid,
           square, rect, disk, tri) — cảm hứng GeoGebra 3D */
function parseCommand(raw) {
  const original = String(raw).trim();
  if (!original) throw new Error("Hãy nhập một biểu thức, ví dụ: x^2 - 2");
  let s = original;
  let forceSurface = false;
  // strip z= prefix -> surface (3D)
  const zm = s.match(/^\s*z\s*=\s*([\s\S]+)$/i);
  if (zm) { s = zm[1].trim(); forceSurface = true; }
  else {
    // strip common prefixes: f(x)= | y= | (label)=
    s = s.replace(/^[a-zA-Z]\s*\(\s*x\s*\)\s*=/, "").replace(/^y\s*=/i, "").replace(/^[A-Za-z]\d*\s*=\s*(?=[\s\S])/, (m) => {
      // keep "x=2" (vertical line) intact; strip label only if RHS looks like point/expr with x/y
      const rhs = original.slice(m.length);
      if (/^\s*x\s*=/.test(original)) return m; // vertical line, keep
      s = rhs; return "";
    });
  }
  s = s.trim();

  // ---- khối & hình cơ bản 3D: cube(3), box(4,3,2), sphere(2), cyl(2,3)... ----
  const num = "(-?\\d+(?:\\.\\d+)?)";
  const nums = (str, n) => {
    const m = str.match(new RegExp("^\\(\\s*" + Array(n).fill(num).join("\\s*,\\s*") + "\\s*\\)$"));
    return m ? m.slice(1, n + 1).map(parseFloat) : null;
  };
  const solidMatch = s.match(/^([a-zA-ZÀ-ỹ]+)\s*([\s\S]*)$/);
  if (solidMatch) {
    const name = solidMatch[1].toLowerCase();
    const arg = solidMatch[2].trim();
    const N = (n, lo, hi) => {
      const v = nums(arg, n);
      if (!v) return null;
      if (v.some(x => !(x >= lo && x <= hi))) throw new Error("Kích thước nằm ngoài 0.3 – 8.");
      return v;
    };
    let v = null;
    if (["cube", "lapphuong"].includes(name) && (v = N(1, 0.3, 8)))
      return { kind: "solid", solid: "cube", p: v, label: original };
    if (["box", "hop", "hopchunhat"].includes(name) && (v = N(3, 0.3, 8)))
      return { kind: "solid", solid: "box", p: v, label: original };
    if (["sphere", "cau", "hincau"].includes(name) && (v = N(1, 0.3, 6)))
      return { kind: "solid", solid: "sphere", p: v, label: original };
    if (["cyl", "tru", "hinhtru", "cylinder"].includes(name) && (v = N(2, 0.3, 8)))
      return { kind: "solid", solid: "cyl", p: v, label: original };
    if (["cone", "non", "hinnon"].includes(name) && (v = N(2, 0.3, 8)))
      return { kind: "solid", solid: "cone", p: v, label: original };
    if (["pyramid", "chop", "hinhchop"].includes(name) && (v = N(2, 0.3, 8)))
      return { kind: "solid", solid: "pyramid", p: v, label: original };
    if (["square", "vuong", "hinhvuong"].includes(name) && (v = N(1, 0.3, 8)))
      return { kind: "solid", solid: "square", p: v, label: original };
    if (["rect", "hcn", "chunhat", "hinhchunhat"].includes(name) && (v = N(2, 0.3, 8)))
      return { kind: "solid", solid: "rect", p: v, label: original };
    if (["disk", "tron", "hinhtron", "circle"].includes(name) && (v = N(1, 0.3, 6)))
      return { kind: "solid", solid: "disk", p: v, label: original };
    if (["tri", "tamgiac", "hinhtamgiac"].includes(name) && (v = N(1, 0.3, 8)))
      return { kind: "solid", solid: "tri", p: v, label: original };
  }

  // point 3D: (a,b,c)
  const pt3 = s.match(/^\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/);
  if (pt3) return { kind: "point3d", x: parseFloat(pt3[1]), y: parseFloat(pt3[2]), z: parseFloat(pt3[3]), label: original };

  // point: (a,b)
  const pt = s.match(/^\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/);
  if (pt) return { kind: "point", x: parseFloat(pt[1]), y: parseFloat(pt[2]), label: original };

  // vertical line x = c
  const vl = s.match(/^x\s*=\s*(-?\d+(?:\.\d+)?)$/i);
  if (vl) return { kind: "vline", x: parseFloat(vl[1]), label: original };

  const hasX = /[xXαβγθλμτφωρσ]/.test(s) && !/^[-\d\s.,()+*/^]*$/.test(s);
  const hasY = /[yY]/.test(s.replace(/\b(exp|ln|log10|logb|log)\b/gi, ""));

  /* bất phương trình / miền logic kiểu GeoGebra: vẽ đường biên = để trực quan */
  if (/&&|\|\|/.test(s)) {
    const parts = s.split(/&&|\|\|/).map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      const m = part.match(/^([\s\S]+?)(<=|>=|!=|=|<|>)([\s\S]+)$/);
      if (m) {
        try {
          const L = compileScalar(m[1]), R = compileScalar(m[3]);
          const fn = makeFn(`(${L})-(${R})`, ["x", "y"]);
          fn(0, 0);
          return { kind: "implicit", fn, label: original, ineq: true };
        } catch {}
      }
    }
    throw new Error("Miền logic (∧ ∨) — hãy nhập từng đường biên, vd: x + y = 2.");
  }
  const ineqM = s.match(/^([\s\S]+?)(<=|>=|!=|<|>)([\s\S]+)$/);
  if (ineqM && !/==/.test(s)) {
    try {
      const L = compileScalar(ineqM[1]), R = compileScalar(ineqM[3]);
      const fn = makeFn(`(${L})-(${R})`, ["x", "y"]);
      fn(0, 0);
      return { kind: "implicit", fn, label: original, ineq: true };
    } catch (e) { throw e; }
  }
  if (s.includes("=")) {
    // implicit: LHS - (RHS)
    const i = s.indexOf("=");
    const L = compileScalar(s.slice(0, i)), R = compileScalar(s.slice(i + 1));
    const fn = makeFn(`(${L})-(${R})`, ["x", "y"]);
    fn(0, 0); // validation probe
    return { kind: "implicit", fn, label: original };
  }
  if (forceSurface || (hasX && hasY)) {
    // surface z = f(x,y) — dùng ở chế độ 3D (tham khảo cách GeoGebra vẽ mặt)
    const js = compileScalar(s);
    const fn = makeFn(js, ["x", "y"]);
    fn(0, 0);
    return { kind: "surface", fn, label: original };
  }
  if (hasY && !hasX) throw new Error("Biểu thức chứa y — hãy viết dạng phương trình, ví dụ: x^2 + y^2 = 4");
  // plain number -> horizontal line f(x)=c
  // function of x
  const js = compileScalar(s);
  const fn = makeFn(js, ["x"]);
  const probe = fn(0);
  if (typeof probe !== "number" && !Number.isNaN(probe)) throw new Error("Không hiểu biểu thức này.");
  return { kind: "fn", fn, label: original };
}

/* ---------------- state ---------------- */
const store = {
  load() { try { return JSON.parse(localStorage.getItem("mind-math-v1") || "null"); } catch { return null; } },
  save(d) { try { localStorage.setItem("mind-math-v1", JSON.stringify(d)); } catch {} }
};

/* Theme cho CENTER STAGE: light = nền trắng, dark = nền đen */
const THEMES = {
  light: {
    bgTop: "#ffffff", bgBot: "#e8edff", glowB: "rgba(99,102,241,.18)",
    minor: "rgba(15,23,42,.055)", major: "rgba(15,23,42,.14)",
    axis: "rgba(15,23,42,.9)", label: "rgba(51,65,85,.92)", origin: "rgba(30,27,75,.9)",
    grid3d: "rgba(30,41,82,.16)", floor: "rgba(99,102,241,.06)",
  },
  dark: {
    bgTop: "#0b0b1c", bgBot: "#000000", glowB: "rgba(139,92,246,.30)",
    minor: "rgba(139,92,246,.10)", major: "rgba(165,180,252,.20)",
    axis: "rgba(238,240,255,.85)", label: "rgba(214,210,250,.9)", origin: "rgba(238,240,255,.9)",
    grid3d: "rgba(165,180,252,.18)", floor: "rgba(139,92,246,.07)",
  },
};

const state = {
  objects: [],       // {id,name,expr,kind,color,visible,fn,x,y,z,error}
  seq: 0,
  selectedId: null,
  view: { cx: 0, cy: 0, scale: 48 },
  // view 3D kiểu GeoGebra: azimuth quanh Oz, elevation nghiêng, scale + tâm
  view3d: { az: -0.65, el: 0.95, scale: 36, tx: 0, ty: 0, tz: 0 },
  mode: "2d",        // '2d' | '3d'
  tool: "move",
  pending: [],       // pending clicks for line/circle
  lastClick: null,   // {x,y} math
  opts: { minor: true, labels: true, glow: true, wave: true, gridStep: 1, thick: 2.5,
          theme: "light", mesh3d: true, spin3d: false, quality3d: 32,
          animate: true, animDur: 1.4 },
  history: [], future: [],
};
let colorIdx = 0;
const nextColor = () => PALETTE[(colorIdx++) % PALETTE.length];
const FN_LETTERS = "fghqrstuvwz";

function snapshot() {
  state.history.push(JSON.stringify({ objects: state.objects.map(stripFn), seq: state.seq, colorIdx }));
  if (state.history.length > 60) state.history.shift();
  state.future.length = 0;
}
function stripFn(o) { const { fn, born, ...rest } = o; return rest; }
function restore(json) {
  const d = JSON.parse(json);
  state.seq = d.seq; colorIdx = d.colorIdx;
  state.objects = d.objects.map(rehydrate);
  if (!state.objects.find(o => o.id === state.selectedId)) state.selectedId = state.objects[0]?.id ?? null;
}
function rehydrate(o) {
  try {
    const p = parseCommand(o.expr);
    return { ...o, ...p, error: null, born: 0 };
  } catch (e) { return { ...o, error: e.message, born: 0 }; }
}
function pushHistory() { snapshot(); persist(); }
function persist() {
  store.save({ objects: state.objects.map(stripFn), seq: state.seq, colorIdx, view: state.view, view3d: state.view3d, mode: state.mode, opts: state.opts });
}

/* ---------------- canvas renderer ---------------- */
const canvas = $("#graph"), wrap = $("#graphWrap"), ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(2.5, window.devicePixelRatio || 1);
  const r = wrap.getBoundingClientRect();
  W = Math.max(50, r.width); H = Math.max(50, r.height);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  draw();
}
new ResizeObserver(resize).observe(wrap);

const toScreen = (x, y) => [W / 2 + (x - state.view.cx) * state.view.scale, H / 2 - (y - state.view.cy) * state.view.scale];
const toMath = (px, py) => [state.view.cx + (px - W / 2) / state.view.scale, state.view.cy - (py - H / 2) / state.view.scale];

function niceStep(target) {
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= target) return m * pow;
  return 10 * pow;
}

function themeColors() { return THEMES[state.opts.theme] || THEMES.light; }

function draw() {
  if (state.mode === "3d") { draw3D(); return; }
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const { scale } = state.view;
  const T = themeColors();
  // background: light = trắng, dark = đen (theo yêu cầu Dark/Light mode)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, T.bgTop); bg.addColorStop(1, T.bgBot);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (state.opts.theme === "dark") {
    const glowB = ctx.createRadialGradient(W / 2, H * 1.12, 10, W / 2, H * 1.12, W * 0.75);
    glowB.addColorStop(0, T.glowB); glowB.addColorStop(0.5, "rgba(56,189,248,.10)"); glowB.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glowB; ctx.fillRect(0, 0, W, H);
  } else {
    const glowL = ctx.createRadialGradient(W / 2, H * 1.1, 10, W / 2, H * 1.1, W * 0.7);
    glowL.addColorStop(0, "rgba(99,102,241,.10)"); glowL.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glowL; ctx.fillRect(0, 0, W, H);
  }

  const step = niceStep((72 / scale) * state.opts.gridStep);
  const [x0, y1] = toMath(0, 0), [x1, y0] = toMath(W, H);
  const minor = step / (step >= 2 ? 2 : 5);

  // minor grid
  if (state.opts.minor) {
    ctx.strokeStyle = T.minor; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = Math.ceil(x0 / minor) * minor; x <= x1; x += minor) {
      const [sx] = toScreen(x, 0); ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, H);
    }
    for (let y = Math.ceil(y0 / minor) * minor; y <= y1; y += minor) {
      const [, sy] = toScreen(0, y); ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(W, Math.round(sy) + 0.5);
    }
    ctx.stroke();
  }
  // major grid
  ctx.strokeStyle = T.major; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    const [sx] = toScreen(x, 0); ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, H);
  }
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
    const [, sy] = toScreen(0, y); ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(W, Math.round(sy) + 0.5);
  }
  ctx.stroke();

  // axes
  const [ox] = toScreen(0, 0), [, oy] = toScreen(0, 0);
  ctx.strokeStyle = T.axis; ctx.lineWidth = 1.6; ctx.beginPath();
  if (oy >= 0 && oy <= H) { ctx.moveTo(0, Math.round(oy) + 0.5); ctx.lineTo(W, Math.round(oy) + 0.5); }
  if (ox >= 0 && ox <= W) { ctx.moveTo(Math.round(ox) + 0.5, 0); ctx.lineTo(Math.round(ox) + 0.5, H); }
  ctx.stroke();
  // arrowheads
  ctx.fillStyle = T.axis;
  if (oy >= 0 && oy <= H) { ctx.beginPath(); ctx.moveTo(W - 2, oy); ctx.lineTo(W - 12, oy - 4.5); ctx.lineTo(W - 12, oy + 4.5); ctx.fill(); }
  if (ox >= 0 && ox <= W) { ctx.beginPath(); ctx.moveTo(ox, 2); ctx.lineTo(ox - 4.5, 12); ctx.lineTo(ox + 4.5, 12); ctx.fill(); }

  // labels
  if (state.opts.labels) {
    ctx.font = "600 11px 'Be Vietnam Pro','Segoe UI',sans-serif";
    ctx.fillStyle = T.label; ctx.textAlign = "center";
    const yLbl = clamp(oy + 16, 14, H - 6);
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
      if (Math.abs(x) < step * 1e-9) continue;
      const [sx] = toScreen(x, 0);
      if (sx < 8 || sx > W - 8) continue;
      ctx.fillText(fmtTick(x), sx, yLbl);
    }
    ctx.textAlign = "left";
    const xLbl = clamp(ox + 7, 6, W - 30);
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
      if (Math.abs(y) < step * 1e-9) continue;
      const [, sy] = toScreen(0, y);
      if (sy < 10 || sy > H - 6) continue;
      ctx.fillText(fmtTick(y), xLbl, sy - 5);
    }
    ctx.fillText("O", clamp(ox - 16, 4, W - 20), clamp(oy + 16, 14, H - 6));
    ctx.fillStyle = state.opts.theme === "dark" ? "#7dd3fc" : "#4f46e5"; ctx.font = "700 12px 'Be Vietnam Pro','Segoe UI',sans-serif";
    ctx.fillText("x", W - 16, clamp(oy - 8, 12, H - 8));
    ctx.fillText("y", clamp(ox + 8, 8, W - 12), 16);
  }

  // objects
  for (const o of state.objects) {
    if (!o.visible || o.error) continue;
    if (o.kind === "fn") drawFunction(o);
    else if (o.kind === "point") drawPoint(o.x, o.y, o);
    else if (o.kind === "point3d") drawPoint(o.x, o.y, { ...o, name: `${o.name} z=${o.z}` });
    else if (o.kind === "vline") drawVLine(o);
    else if (o.kind === "implicit") drawImplicit(o);
    else if (o.kind === "surface") drawImplicit({ ...o, fn: (x, y) => { try { return o.fn(x, y); } catch { return NaN; } } });
    else if (o.kind === "solid") drawSolid2D(o);
  }
  // pending construction preview
  if (state.pending.length) {
    ctx.fillStyle = "#38bdf8";
    for (const p of state.pending) { const [sx, sy] = toScreen(p.x, p.y); ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill(); }
  }
  const hud = $("#hudScale"); if (hud) hud.textContent = `tỉ lệ ${Math.round(scale)} px/đv · 2D`;
}
function fmtTick(v) {
  const r = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  return (Math.round(v * 100) / 100).toFixed(r).replace(/\.?0+$/, "");
}

/* ---- Vẽ dần 2D/3D: mỗi object có born, tiến độ p 0→1 theo animDur ---- */
function animP(o) {
  if (!state.opts.animate || !o.born) return 1;
  const dur = Math.max(0.4, Number(state.opts.animDur) || 1.4) * 1000;
  const p = (performance.now() - o.born) / dur;
  return clamp(p, 0, 1);
}
let animRaf = 0;
function kickAnim() {
  if (animRaf) return;
  const step = () => {
    animRaf = 0;
    const need = state.objects.some(o => o.visible && !o.error && animP(o) < 1);
    if (need) { draw(); animRaf = requestAnimationFrame(step); }
  };
  animRaf = requestAnimationFrame(step);
}
function replayAnim() {
  const now = performance.now();
  // vẽ lại từ từ: object cũ nhất vẽ trước, mỗi object lệch 250ms
  const vis = state.objects.filter(o => o.visible && !o.error);
  vis.forEach((o, i) => { o.born = now + i * 250; });
  if (!state.opts.animate) state.opts.animate = true;
  const cb = $("#setAnimate"); if (cb) cb.checked = true;
  draw(); kickAnim(); persist();
}

function drawFunction(o) {
  const p = animP(o);
  if (p <= 0) return;
  ctx.save();
  ctx.strokeStyle = o.color; ctx.lineWidth = state.opts.thick; ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 12; }
  if (p < 1) ctx.globalAlpha = 0.35 + 0.65 * p;
  ctx.beginPath();
  let pen = false, prevY = 0;
  const pxStep = 1.5; // smooth: sample every 1.5px
  const pxMax = -4 + (W + 8) * p; // vẽ dần từ trái sang phải
  for (let px = -4; px <= W + 4; px += pxStep) {
    if (px > pxMax) break;
    const [x] = toMath(px, 0);
    let y; try { y = o.fn(x); } catch { pen = false; continue; }
    if (typeof y !== "number" || !isFinite(y)) { pen = false; continue; }
    const [, sy] = toScreen(0, y);
    if (!pen) { ctx.moveTo(px, sy); pen = true; }
    else {
      if (Math.abs(sy - prevY) > H * 3) { ctx.moveTo(px, sy); } // discontinuity
      else ctx.lineTo(px, sy);
    }
    prevY = sy;
  }
  ctx.stroke(); ctx.restore();
  if (p < 1) kickAnim();
}
function drawVLine(o) {
  const p = animP(o);
  if (p <= 0) return;
  const [sx] = toScreen(o.x, 0);
  ctx.save(); ctx.strokeStyle = o.color; ctx.lineWidth = state.opts.thick;
  if (p < 1) ctx.globalAlpha = p;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 12; }
  ctx.setLineDash([9, 6]); ctx.beginPath();
  const yEnd = H * p;
  ctx.moveTo(sx, 0); ctx.lineTo(sx, yEnd); ctx.stroke(); ctx.restore();
  if (p < 1) kickAnim();
}
function drawPoint(x, y, o) {
  const p = o && o.born ? animP(o) : 1;
  if (p <= 0) return;
  const [sx, sy] = toScreen(x, y);
  if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) return;
  const isDark = state.opts.theme === "dark";
  ctx.save();
  if (p < 1) ctx.globalAlpha = p;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 14; }
  const rr = 5.5 * (0.4 + 0.6 * p);
  ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(sx, sy, rr, 0, 7); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, sy, 2 * p + 0.4, 0, 7); ctx.fill();
  ctx.font = "700 11px 'Be Vietnam Pro',sans-serif";
  // viền halo quanh chữ để luôn đọc được trên mọi nền, màu chữ theo theme
  ctx.lineWidth = 3;
  ctx.strokeStyle = isDark ? "rgba(6,6,15,.85)" : "rgba(255,255,255,.9)";
  ctx.strokeText(o.name, sx + 9, sy - 8);
  ctx.fillStyle = isDark ? "rgba(255,255,255,.92)" : "#0f172a";
  ctx.fillText(o.name, sx + 9, sy - 8);
  ctx.restore();
  if (p < 1) kickAnim();
}
/* Generic implicit contour via marching squares on a coarse grid */
function drawImplicit(o) {
  const p = animP(o);
  if (p <= 0) return;
  const nx = Math.max(60, Math.floor(W / 4)), ny = Math.max(60, Math.floor(H / 4));
  const [x0, y1t] = toMath(0, 0), [x1, y0] = toMath(W, H);
  const F = [];
  try {
    for (let j = 0; j <= ny; j++) {
      const row = [];
      const y = y1t + ((y0 - y1t) * j) / ny;
      for (let i = 0; i <= nx; i++) {
        const x = x0 + ((x1 - x0) * i) / nx;
        let v; try { v = o.fn(x, y); } catch { v = NaN; }
        row.push(typeof v === "number" && isFinite(v) ? v : NaN);
      }
      F.push(row);
    }
  } catch { return; }
  ctx.save(); ctx.strokeStyle = o.color; ctx.lineWidth = state.opts.thick; ctx.lineCap = "round";
  if (p < 1) ctx.globalAlpha = p;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 12; }
  ctx.beginPath();
  const P = (i, j) => toScreen(x0 + ((x1 - x0) * i) / nx, y1t + ((y0 - y1t) * j) / ny);
  const jMax = Math.floor(ny * p);
  for (let j = 0; j < jMax; j++) for (let i = 0; i < nx; i++) {
    const a = F[j][i], b = F[j][i + 1], c = F[j + 1][i + 1], d = F[j + 1][i];
    if ([a, b, c, d].some(v => !isFinite(v))) continue;
    let idx = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const [ax, ay] = P(i, j), [bx, by] = P(i + 1, j), [cx2, cy2] = P(i + 1, j + 1), [dx, dy] = P(i, j + 1);
    const lerp = (p, q, va, vb) => { const t = Math.abs(va - vb) < 1e-12 ? 0.5 : va / (va - vb); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
    const T = lerp([ax, ay], [bx, by], a, b), R = lerp([bx, by], [cx2, cy2], b, c),
          B = lerp([dx, dy], [cx2, cy2], d, c), L = lerp([ax, ay], [dx, dy], a, d);
    const seg = (p, q) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); };
    switch (idx) {
      case 1: case 14: seg(L, B); break; case 2: case 13: seg(B, R); break;
      case 3: case 12: seg(L, R); break; case 4: case 11: seg(T, R); break;
      case 5: seg(T, L); seg(B, R); break; case 6: case 9: seg(T, B); break;
      case 7: case 8: seg(T, L); break; case 10: seg(T, R); seg(L, B); break;
    }
  }
  ctx.stroke(); ctx.restore();
  if (p < 1) kickAnim();
}

/* ============================================================================
   3D ENGINE — cảm hứng từ GeoGebra 3D (open-source, GPL)
   - Hệ trục Oxyz: Ox đỏ, Oy xanh lá, Oz xanh dương, lưới nền mặt Oxy
   - Mặt z = f(x,y): lưới tam giác, tô sáng Lambert + painter sort
   - Xoay quỹ đạo (orbit), zoom, pan; hỗ trợ Light/Dark theme
   ============================================================================ */
function hexRgb(hex) {
  const h = String(hex).replace("#", "");
  const v = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(v.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shadeHex(hex, k) {
  const [r, g, b] = hexRgb(hex);
  const f = (c) => Math.round(clamp(c * k, 0, 255));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
// Xoay điểm (x,y,z) theo az (quanh Oz) rồi el (quanh Ox), trả về {X, Yd(depth), Z}
function rot3(x, y, z) {
  const { az, el } = state.view3d;
  const ca = Math.cos(az), sa = Math.sin(az);
  const x1 = x * ca - y * sa, y1 = x * sa + y * ca, z1 = z;
  const ce = Math.cos(el), se = Math.sin(el);
  const y2 = y1 * ce - z1 * se, z2 = y1 * se + z1 * ce;
  return { X: x1, Yd: y2, Z: z2 };
}
function proj3(x, y, z) {
  const v = state.view3d;
  const r = rot3(x - v.tx, y - v.ty, z - v.tz);
  // phối cảnh yếu để có chiều sâu (giống GeoGebra perspective nhẹ)
  const persp = 900 / (900 - r.Yd * v.scale * 0.35);
  const sx = W / 2 + r.X * v.scale * persp;
  const sy = H / 2 - r.Z * v.scale * persp;
  return { sx, sy, depth: r.Yd, persp };
}
// Nghịch đảo: màn hình -> điểm trên mặt z=0 (để tạo điểm 3D bằng click)
function screenToFloor(px, py) {
  const v = state.view3d;
  // giải tuyến tính: tìm (x,y) sao cho proj3(x,y,0) = (px,py) (xấp xỉ trực giao)
  // lặp 3 vòng Newton đơn giản
  let x = (px - W / 2) / v.scale + v.tx, y = (H / 2 - py) / v.scale + v.ty;
  for (let k = 0; k < 6; k++) {
    const p = proj3(x, y, 0);
    const dx = (px - p.sx) / v.scale, dy = -(py - p.sy) / v.scale;
    // Jacobian xấp xỉ bằng xoay ngược
    const ca = Math.cos(-v.az), sa = Math.sin(-v.az);
    // chuyển (dx, dy) trong không gian xoay về (x,y): dy thuộc Z sau nghiêng
    const ce = Math.cos(v.el);
    if (Math.abs(ce) < 0.15) break;
    const dY = dy / Math.sin(v.el || 0.001) * 0.5 + dx * 0;
    // bước đơn giản, hội tụ đủ cho click
    x += dx * ca * 0.7;
    y += (dx * sa + dY) * 0.7;
    if (Math.abs(dx) + Math.abs(dY) < 0.01) break;
  }
  return { x: round2(x), y: round2(y) };
}

function draw3D() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const T = themeColors();
  const isDark = state.opts.theme === "dark";
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, T.bgTop); bg.addColorStop(1, T.bgBot);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const R = Math.max(5, Math.min(9, 340 / state.view3d.scale + 4)); // nửa rộng thế giới
  const step = 1;

  // --- lưới nền Oxy (z=0) ---
  ctx.lineWidth = 1;
  const gridLines = [];
  for (let i = -Math.ceil(R); i <= R; i += step) {
    gridLines.push([[i, -R, 0, i, R, 0], i === 0]);
    gridLines.push([[-R, i, 0, R, i, 0], i === 0]);
  }
  // vẽ lưới thường trước, trục 0 vẽ đậm sau
  for (const [seg, isZero] of gridLines) {
    if (isZero) continue;
    const a = proj3(seg[0], seg[1], 0), b = proj3(seg[3], seg[4], 0);
    ctx.strokeStyle = T.grid3d; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  }
  // mặt nền mờ
  try {
    const c1 = proj3(-R, -R, 0), c2 = proj3(R, -R, 0), c3 = proj3(R, R, 0), c4 = proj3(-R, R, 0);
    ctx.fillStyle = T.floor; ctx.beginPath();
    ctx.moveTo(c1.sx, c1.sy); ctx.lineTo(c2.sx, c2.sy); ctx.lineTo(c3.sx, c3.sy); ctx.lineTo(c4.sx, c4.sy);
    ctx.closePath(); ctx.fill();
  } catch {}

  // --- trục Oxyz kiểu GeoGebra ---
  const AX = [
    { p1: [-R - 1, 0, 0], p2: [R + 1, 0, 0], c: "#ef4444", label: "x" },
    { p1: [0, -R - 1, 0], p2: [0, R + 1, 0], c: "#22c55e", label: "y" },
    { p1: [0, 0, -R * 0.6], p2: [0, 0, R + 1.5], c: "#3b82f6", label: "z" },
  ];
  ctx.lineWidth = 2;
  for (const a of AX) {
    const p1 = proj3(...a.p1), p2 = proj3(...a.p2);
    ctx.strokeStyle = a.c; ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
    ctx.fillStyle = a.c; ctx.font = "700 13px 'Be Vietnam Pro',sans-serif";
    ctx.fillText(a.label, p2.sx + 6, p2.sy - 4);
  }
  // gốc O
  if (state.opts.labels) {
    const o = proj3(0, 0, 0);
    ctx.fillStyle = isDark ? "#e8e4ff" : "#1e1b4b"; ctx.font = "700 11px sans-serif";
    ctx.fillText("O", o.sx - 14, o.sy + 12);
  }

  // --- đối tượng ---
  for (const ob of state.objects) {
    if (!ob.visible || ob.error) continue;
    try {
      if (ob.kind === "surface") drawSurface3D(ob);
      else if (ob.kind === "solid") drawSolid3D(ob);
      else if (ob.kind === "point3d") drawPoint3D(ob.x, ob.y, ob.z, ob);
      else if (ob.kind === "point") drawPoint3D(ob.x, ob.y, 0, ob);
      else if (ob.kind === "fn") drawCurve3D(ob, (x) => { try { return ob.fn(x); } catch { return NaN; } });
      else if (ob.kind === "implicit") drawImplicit3D(ob);
      else if (ob.kind === "vline") drawVLine3D(ob);
    } catch {}
  }

  const hud = $("#hudScale");
  if (hud) hud.textContent = `3D · az ${(state.view3d.az * 180 / Math.PI).toFixed(0)}° el ${(state.view3d.el * 180 / Math.PI).toFixed(0)}° · ${Math.round(state.view3d.scale)} px/đv`;
  const hc = $("#hudCoords");
  if (hc && state.lastClick3d) hc.textContent = `x: ${state.lastClick3d.x.toFixed(2)} · y: ${state.lastClick3d.y.toFixed(2)} · z: ${state.lastClick3d.z.toFixed(2)}`;
}

function drawSurface3D(o) {
  const ap = animP(o);
  if (ap <= 0) return;
  const N = clamp(Math.round(state.opts.quality3d || 32), 12, 64);
  const R = 5;
  const xs = [], zs = [];
  const F = [];
  for (let j = 0; j <= N; j++) {
    const row = [];
    const y = -R + (2 * R * j) / N;
    for (let i = 0; i <= N; i++) {
      const x = -R + (2 * R * i) / N;
      let z; try { z = o.fn(x, y); } catch { z = NaN; }
      if (typeof z !== "number" || !isFinite(z)) z = NaN;
      else z = clamp(z, -R * 1.6, R * 1.6);
      row.push(z);
    }
    F.push(row);
  }
  const quads = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x0 = -R + (2 * R * i) / N, y0 = -R + (2 * R * j) / N;
    const x1 = -R + (2 * R * (i + 1)) / N, y1 = -R + (2 * R * (j + 1)) / N;
    const z00 = F[j][i], z10 = F[j][i + 1], z11 = F[j + 1][i + 1], z01 = F[j + 1][i];
    if (![z00, z10, z11, z01].every(isFinite)) continue;
    // độ sâu trung bình để sort painter
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z00 + z10 + z11 + z01) / 4;
    const r = rot3(cx - state.view3d.tx, cy - state.view3d.ty, cz - state.view3d.tz);
    // normal ~ (-dz/dx, -dz/dy, 1)
    const dzdx = (z10 + z11 - z00 - z01) / (2 * (2 * R / N));
    const dzdy = (z01 + z11 - z00 - z10) / (2 * (2 * R / N));
    let nx = -dzdx, ny = -dzdy, nz = 1;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    // sáng Lambert với đèn từ trên-trái (giống GeoGebra)
    const L = [-0.45, -0.55, 0.75];
    const dot = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    const shade = 0.45 + 0.55 * dot;
    quads.push({ x0, y0, x1, y1, z00, z10, z11, z01, depth: r.Yd, shade });
  }
  quads.sort((a, b) => a.depth - b.depth); // xa vẽ trước
  const showMesh = state.opts.mesh3d;
  const isDark = state.opts.theme === "dark";
  // vẽ dần: chỉ hiện ap*100% quads (mọc từ giữa ra ngoài cho đẹp)
  const nShow = Math.floor(quads.length * ap);
  for (let qi = 0; qi < nShow; qi++) {
    const q = quads[qi];
    const p00 = proj3(q.x0, q.y0, q.z00), p10 = proj3(q.x1, q.y0, q.z10),
          p11 = proj3(q.x1, q.y1, q.z11), p01 = proj3(q.x0, q.y1, q.z01);
    ctx.beginPath();
    ctx.moveTo(p00.sx, p00.sy); ctx.lineTo(p10.sx, p10.sy); ctx.lineTo(p11.sx, p11.sy); ctx.lineTo(p01.sx, p01.sy);
    ctx.closePath();
    ctx.fillStyle = shadeHex(o.color, q.shade * (isDark ? 1 : 0.95));
    ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
    if (showMesh) {
      ctx.strokeStyle = isDark ? "rgba(255,255,255,.18)" : "rgba(15,23,42,.18)";
      ctx.lineWidth = 0.6; ctx.stroke();
    }
  }
  // viền sáng mặt
  if (state.opts.glow && !showMesh) {
    ctx.save(); ctx.shadowColor = o.color; ctx.shadowBlur = 10; ctx.strokeStyle = o.color;
    ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
  }
  if (ap < 1) kickAnim();
}
function drawPoint3D(x, y, z, o) {
  const ap = o && o.born ? animP(o) : 1;
  if (ap <= 0) return;
  const p = proj3(x, y, z);
  if (p.sx < -30 || p.sx > W + 30 || p.sy < -30 || p.sy > H + 30) return;
  const s = clamp(p.persp, 0.6, 1.6) * (0.4 + 0.6 * ap);
  ctx.save();
  if (ap < 1) ctx.globalAlpha = ap;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 12; }
  ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(p.sx, p.sy, 5.5 * s, 0, 7); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.sx, p.sy, 2 * s, 0, 7); ctx.fill();
  // chân chiếu xuống nền (giống GeoGebra)
  const f = proj3(x, y, 0);
  ctx.strokeStyle = o.color; ctx.globalAlpha = 0.45; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(f.sx, f.sy); ctx.stroke();
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  ctx.fillStyle = state.opts.theme === "dark" ? "rgba(255,255,255,.92)" : "#1e1b4b";
  ctx.font = "700 11px 'Be Vietnam Pro',sans-serif";
  ctx.fillText(o.name || `(${x},${y},${z})`, p.sx + 9, p.sy - 8);
  ctx.restore();
}
function drawCurve3D(o, getZ) {
  // đường cong 2D y=f(x) đặt trên mặt y=0, z=f(x): (x, 0, z)
  const ap = animP(o);
  if (ap <= 0) return;
  ctx.save();
  ctx.strokeStyle = o.color; ctx.lineWidth = state.opts.thick; ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (ap < 1) ctx.globalAlpha = 0.35 + 0.65 * ap;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 10; }
  ctx.beginPath();
  let pen = false;
  const iMax = Math.floor(220 * ap);
  for (let i = 0; i <= iMax; i++) {
    const x = -7 + (14 * i) / 220;
    let z; try { z = getZ(x); } catch { z = NaN; }
    if (typeof z !== "number" || !isFinite(z)) { pen = false; continue; }
    z = clamp(z, -8, 8);
    const p = proj3(x, 0, z);
    if (!pen) { ctx.moveTo(p.sx, p.sy); pen = true; } else ctx.lineTo(p.sx, p.sy);
  }
  ctx.stroke(); ctx.restore();
  if (ap < 1) kickAnim();
}
function drawImplicit3D(o) {
  // đường mức f(x,y)=0 nằm trên nền z=0 (marching squares rồi chiếu 3D)
  const ap = animP(o);
  if (ap <= 0) return;
  const R = 6, N = 90;
  const F = [];
  for (let j = 0; j <= N; j++) {
    const row = []; const y = -R + (2 * R * j) / N;
    for (let i = 0; i <= N; i++) {
      const x = -R + (2 * R * i) / N;
      let v; try { v = o.fn(x, y); } catch { v = NaN; }
      row.push(typeof v === "number" && isFinite(v) ? v : NaN);
    }
    F.push(row);
  }
  ctx.save(); ctx.strokeStyle = o.color; ctx.lineWidth = 2.2;
  if (ap < 1) ctx.globalAlpha = ap;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 8; }
  ctx.beginPath();
  const P = (i, j) => proj3(-R + (2 * R * i) / N, -R + (2 * R * j) / N, 0);
  const jMax3 = Math.floor(N * ap);
  for (let j = 0; j < jMax3; j++) for (let i = 0; i < N; i++) {
    const a = F[j][i], b = F[j][i + 1], c = F[j + 1][i + 1], d = F[j + 1][i];
    if ([a, b, c, d].some(v => !isFinite(v))) continue;
    const idx = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
    if (idx === 0 || idx === 15) continue;
    const A = P(i, j), B = P(i + 1, j), C = P(i + 1, j + 1), D = P(i, j + 1);
    const lp = (p, q, va, vb) => { const t = Math.abs(va - vb) < 1e-12 ? 0.5 : va / (va - vb); return { sx: p.sx + (q.sx - p.sx) * t, sy: p.sy + (q.sy - p.sy) * t }; };
    const Tp = lp(A, B, a, b), Rp = lp(B, C, b, c), Bp = lp(D, C, d, c), Lp = lp(A, D, a, d);
    const seg = (p, q) => { ctx.moveTo(p.sx, p.sy); ctx.lineTo(q.sx, q.sy); };
    switch (idx) {
      case 1: case 14: seg(Lp, Bp); break; case 2: case 13: seg(Bp, Rp); break;
      case 3: case 12: seg(Lp, Rp); break; case 4: case 11: seg(Tp, Rp); break;
      case 5: seg(Tp, Lp); seg(Bp, Rp); break; case 6: case 9: seg(Tp, Bp); break;
      case 7: case 8: seg(Tp, Lp); break; case 10: seg(Tp, Rp); seg(Lp, Bp); break;
    }
  }
  ctx.stroke(); ctx.restore();
  if (ap < 1) kickAnim();
}
function drawVLine3D(o) {
  // đường x=c: dựng mặt phẳng đứng trên nền (y chạy, z chạy)
  const ap = animP(o);
  if (ap <= 0) return;
  ctx.save(); ctx.strokeStyle = o.color; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
  if (ap < 1) ctx.globalAlpha = ap;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 8; }
  ctx.beginPath();
  const a = proj3(o.x, -7, 0), b = proj3(o.x, 7, 0);
  ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
  const c = proj3(o.x, 0, -5), d = proj3(o.x, 0, 6);
  ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
  ctx.stroke(); ctx.restore();
}

/* ---- Khối & hình cơ bản 3D: tạo lưới verts/faces từ tham số ---- */
function solidMesh(o) {
  const t = o.solid, p = o.p || [];
  const V = [], F = [];
  const quad = (a, b, c, d) => F.push([a, b, c, d]);
  const triF = (a, b, c) => F.push([a, b, c]);
  if (t === "box" || t === "cube") {
    const w = t === "cube" ? p[0] : p[0], d = t === "cube" ? p[0] : p[1], h = t === "cube" ? p[0] : p[2];
    const x0 = -w / 2, x1 = w / 2, y0 = -d / 2, y1 = d / 2;
    V.push([x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0],
           [x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]);
    quad(0, 1, 2, 3); quad(4, 5, 6, 7);
    quad(0, 1, 5, 4); quad(1, 2, 6, 5); quad(2, 3, 7, 6); quad(3, 0, 4, 7);
  } else if (t === "sphere") {
    const r = p[0], nu = 22, nv = 14;
    for (let j = 0; j <= nv; j++) {
      const lat = -Math.PI / 2 + (Math.PI * j) / nv;
      for (let i = 0; i <= nu; i++) {
        const lon = (2 * Math.PI * i) / nu;
        V.push([r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)]);
      }
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
      F.push([a, b, c, d]);
    }
  } else if (t === "cyl") {
    const r = p[0], h = p[1], n = 30;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      V.push([r * Math.cos(a), r * Math.sin(a), 0]);
    }
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      V.push([r * Math.cos(a), r * Math.sin(a), h]);
    }
    for (let i = 0; i < n; i++) quad(i, (i + 1) % n, n + ((i + 1) % n), n + i);
    F.push([...Array(n).keys()]);
    F.push([...Array(n).keys()].map(k => 2 * n - 1 - k));
  } else if (t === "cone") {
    const r = p[0], h = p[1], n = 30;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      V.push([r * Math.cos(a), r * Math.sin(a), 0]);
    }
    V.push([0, 0, h]);
    const apex = n;
    for (let i = 0; i < n; i++) triF(i, (i + 1) % n, apex);
    F.push([...Array(n).keys()].reverse());
  } else if (t === "pyramid") {
    const a = p[0] / 2, h = p[1];
    V.push([-a, -a, 0], [a, -a, 0], [a, a, 0], [-a, a, 0], [0, 0, h]);
    quad(0, 1, 2, 3);
    triF(0, 1, 4); triF(1, 2, 4); triF(2, 3, 4); triF(3, 0, 4);
  } else if (t === "square" || t === "rect") {
    const w = t === "square" ? p[0] : p[0], d = t === "square" ? p[0] : p[1];
    V.push([-w / 2, -d / 2, 0], [w / 2, -d / 2, 0], [w / 2, d / 2, 0], [-w / 2, d / 2, 0]);
    quad(0, 1, 2, 3);
  } else if (t === "disk") {
    const r = p[0], n = 44;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      V.push([r * Math.cos(a), r * Math.sin(a), 0]);
    }
    F.push([...Array(n).keys()]);
  } else if (t === "tri") {
    const a = p[0], R = a / Math.sqrt(3);
    for (let k = 0; k < 3; k++) {
      const ang = Math.PI / 2 + (2 * Math.PI * k) / 3;
      V.push([R * Math.cos(ang), R * Math.sin(ang), 0]);
    }
    triF(0, 1, 2);
  }
  return { V, F };
}
function drawSolid3D(o) {
  const ap = animP(o);
  if (ap <= 0) return;
  const { V, F } = solidMesh(o);
  if (!V.length || !F.length) return;
  const isDark = state.opts.theme === "dark";
  // mọc dần từ đáy lên: kẹp z theo tiến độ
  const zMaxAll = Math.max(...V.map(v => v[2]), 0.001);
  const zCut = zMaxAll * ap + 0.001;
  const P = V.map(v => proj3(v[0], v[1], Math.min(v[2], zCut)));
  // chuẩn bị mặt: độ sâu + sáng
  const faces = [];
  for (const f of F) {
    let dx = 0, dy = 0, dz = 0, cx = 0, cy = 0, cz = 0;
    for (const idx of f) { cx += V[idx][0]; cy += V[idx][1]; cz += V[idx][2]; }
    cx /= f.length; cy /= f.length; cz /= f.length;
    if (f.length >= 3) {
      const [a, b, c] = [V[f[0]], V[f[1]], V[f[2]]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const L = [-0.45, -0.55, 0.72];
      dx = Math.abs(nx * L[0] + ny * L[1] + nz * L[2]);
    }
    const r = rot3(cx - state.view3d.tx, cy - state.view3d.ty, cz - state.view3d.tz);
    faces.push({ f, depth: r.Yd, shade: 0.5 + 0.5 * dx });
  }
  faces.sort((a, b) => a.depth - b.depth);
  const flat = ["square", "rect", "disk", "tri"].includes(o.solid);
  for (const { f, shade } of faces) {
    ctx.beginPath();
    f.forEach((idx, k) => { if (k === 0) ctx.moveTo(P[idx].sx, P[idx].sy); else ctx.lineTo(P[idx].sx, P[idx].sy); });
    ctx.closePath();
    ctx.fillStyle = shadeHex(o.color, shade * (isDark ? 1 : 0.96));
    ctx.globalAlpha = (flat ? 0.55 : 0.93) * (0.3 + 0.7 * ap);
    ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = isDark ? "rgba(255,255,255,.35)" : "rgba(15,23,42,.4)";
    ctx.lineWidth = flat ? 2 : 1;
    ctx.stroke();
  }
  if (ap < 1) kickAnim();
  // đỉnh + nhãn kích thước
  const top = V.reduce((m, v, i) => (v[2] > V[m][2] ? i : m), 0);
  ctx.fillStyle = isDark ? "#fff" : "#0f172a"; ctx.font = "700 11px 'Be Vietnam Pro',sans-serif";
  ctx.fillText(o.name, P[top].sx + 8, P[top].sy - 8);
  // vẽ cạnh nổi cho hộp/chóp (rõ khối)
  if (["box", "cube", "pyramid"].includes(o.solid)) {
    ctx.save();
    if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 6; }
    ctx.strokeStyle = o.color; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.9;
    ctx.beginPath();
    // viền đáy + viền nóc đã có, chỉ tô lại cho sáng
    ctx.stroke(); ctx.restore();
  }
}
function drawSolid2D(o) {
  // hình chiếu bằng (nhìn từ trên) khi ở chế độ 2D
  const ap = animP(o);
  if (ap <= 0) return;
  ctx.save();
  if (ap < 1) ctx.globalAlpha = ap;
  ctx.strokeStyle = o.color; ctx.fillStyle = o.color + "33";
  ctx.lineWidth = state.opts.thick;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 8; }
  const rect2 = (w, d) => {
    const [x0, y0] = toScreen(-w / 2, -d / 2), [x1, y1] = toScreen(w / 2, d / 2);
    ctx.beginPath(); ctx.rect(x0, y1, x1 - x0, y0 - y1); ctx.fill(); ctx.stroke();
  };
  const circ2 = (r) => {
    const [cx, cy] = toScreen(0, 0);
    const rr = r * state.view.scale;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.fill(); ctx.stroke();
  };
  try {
    if (o.solid === "cube") rect2(o.p[0], o.p[0]);
    else if (o.solid === "box") rect2(o.p[0], o.p[1]);
    else if (o.solid === "square") rect2(o.p[0], o.p[0]);
    else if (o.solid === "rect") rect2(o.p[0], o.p[1]);
    else if (o.solid === "sphere" || o.solid === "disk") circ2(o.p[0]);
    else if (o.solid === "cyl" || o.solid === "cone") circ2(o.p[0]);
    else if (o.solid === "pyramid") rect2(o.p[0], o.p[0]);
    else if (o.solid === "tri") {
      const a = o.p[0], R = a / Math.sqrt(3);
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const ang = Math.PI / 2 + (2 * Math.PI * k) / 3;
        const [sx, sy] = toScreen(R * Math.cos(ang), R * Math.sin(ang));
        if (k === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  } catch {}
  ctx.restore();
  if (ap < 1) kickAnim();
}

/* ---------------- object CRUD ---------------- */
function displayName(expr, kind, x, y) {
  if (kind === "point") return `A(${x}, ${y})`;
  return expr.length > 26 ? expr.slice(0, 26) + "…" : expr;
}
function setTheme(t) {
  state.opts.theme = t === "dark" ? "dark" : "light";
  document.body.dataset.theme = state.opts.theme;
  $$("[data-theme-btn]").forEach(b => b.classList.toggle("is-active", b.dataset.themeBtn === state.opts.theme));
  draw(); if (typeof drawTrigCircle === "function") { try { drawTrigCircle(); } catch {} } try { refreshMarkusContext(); } catch {} persist();
}
function setMode(m) {
  state.mode = m === "3d" ? "3d" : "2d";
  $$("#modeSwitch button").forEach(b => b.classList.toggle("is-active", b.dataset.mode === state.mode));
  const bar = $("#view3dBar"); if (bar) bar.hidden = state.mode !== "3d";
  const hc = $("#hudCoords");
  if (hc) hc.textContent = state.mode === "3d" ? "3D · kéo để xoay" : "x: 0.00 · y: 0.00";
  draw(); try { refreshMarkusContext(); } catch {} persist();
  if (state.mode === "3d") toast("Chế độ 3D: nhập z=f(x,y), ví dụ z = x^2+y^2. Kéo để xoay.", "ok");
}
function resetView3D() {
  state.view3d = { az: -0.65, el: 0.95, scale: 36, tx: 0, ty: 0, tz: 0 };
  draw(); persist();
}
function addObject(expr, opts = {}) {
  const parsed = parseCommand(expr);
  pushHistory();
  state.seq += 1;
  const letter = FN_LETTERS[(state.seq - 1) % FN_LETTERS.length];
  let name = `E${state.seq}`;
  if (parsed.kind === "fn") name = `${letter}(x)`;
  else if (parsed.kind === "point") name = `P${state.seq}`;
  else if (parsed.kind === "point3d") name = `P${state.seq}`;
  else if (parsed.kind === "surface") name = `S${state.seq}`;
  else if (parsed.kind === "solid") name = `K${state.seq}`;
  else if (parsed.kind === "vline") name = `V${state.seq}`;
  else if (parsed.kind === "implicit") name = `C${state.seq}`;
  const obj = {
    id: "o" + Date.now().toString(36) + state.seq,
    name, expr: String(expr).trim(), color: opts.color || nextColor(),
    visible: true, selected: false, ...parsed, error: null,
    born: performance.now(),
  };
  if (!state.opts.animate) obj.born = 0;
  if (parsed.kind === "point") obj.name = `P${state.seq}(${parsed.x}, ${parsed.y})`;
  if (parsed.kind === "point3d") obj.name = `P${state.seq}(${parsed.x},${parsed.y},${parsed.z})`;
  if (parsed.kind === "surface") obj.name = `S${state.seq}: ${String(expr).trim().slice(0, 22)}`;
  if (parsed.kind === "solid") {
    const VN = { cube: "Lập phương", box: "Hộp", sphere: "Cầu", cyl: "Trụ", cone: "Nón", pyramid: "Chóp", square: "Vuông", rect: "Chữ nhật", disk: "Tròn", tri: "Tam giác" };
    obj.name = `K${state.seq} ${(VN[parsed.solid] || parsed.solid)} ${(parsed.p || []).join("×")}`;
  }
  state.objects.push(obj);
  state.selectedId = obj.id;
  renderList(); refreshTableSelect(); draw(); kickAnim(); persist();
  if ((parsed.kind === "surface" || parsed.kind === "solid") && state.mode !== "3d") toast("Đã thêm hình 3D — bấm nút 3D để xem.", "ok");
  if (parsed.ineq) toast("Bất phương trình (≤ ≥ < >) — đang vẽ đường biên = để trực quan.", "ok");
  return obj;
}
function removeObject(id) { pushHistory(); state.objects = state.objects.filter(o => o.id !== id); renderList(); refreshTableSelect(); draw(); persist(); }

function renderList(filter = "") {
  const list = $("#objectList");
  list.innerHTML = "";
  const q = filter.trim().toLowerCase();
  const items = state.objects.filter(o => !q || (o.name + " " + o.expr).toLowerCase().includes(q));
  $("#objectCount").textContent = `${state.objects.length} đối tượng`;
  if (!state.objects.length) {
    list.innerHTML = `<div class="empty-note">Chưa có đối tượng nào.<br>Nhập <b>x^2 − 2</b> vào ô lệnh phía trên rồi nhấn <b>⏎</b>.</div>`;
    return;
  }
  if (!items.length) { list.innerHTML = `<div class="empty-note">Không tìm thấy đối tượng phù hợp.</div>`; return; }
  for (const o of items.slice().reverse()) {
    const row = document.createElement("div");
    row.className = "obj" + (o.visible ? "" : " is-hidden") + (o.id === state.selectedId ? " is-selected" : "");
    row.setAttribute("role", "listitem");
    row.innerHTML = `
      <span class="obj-dot" style="background:${o.color};color:${o.color}" title="Nhấp để đổi màu"></span>
      <div class="obj-main"><div class="obj-name">${escapeHtml(o.name)}</div>
      <div class="obj-expr">${escapeHtml(o.expr)}</div>${o.error ? `<div class="obj-err">${escapeHtml(o.error)}</div>` : ""}</div>
      <div class="obj-btns">
        <button data-a="eye" title="${o.visible ? "Ẩn" : "Hiện"}">${o.visible ? "👁" : "🚫"}</button>
        <button data-a="more" title="Tùy chọn">⋯</button>
        <button data-a="del" title="Xóa">🗑</button>
      </div>`;
    row.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) { state.selectedId = o.id; renderList($("#algebraSearch").value); refreshTableSelect(); draw(); return; }
      const a = btn.dataset.a;
      if (a === "eye") { pushHistory(); o.visible = !o.visible; renderList($("#algebraSearch").value); draw(); persist(); }
      if (a === "del") { removeObject(o.id); toast(`Đã xóa ${o.name}`, "ok"); }
      if (a === "more") { state.selectedId = o.id; pushHistory(); o.color = nextColor(); renderList($("#algebraSearch").value); draw(); persist(); toast(`${o.name} đổi màu ${o.color}`); }
    });
    row.querySelector(".obj-dot").addEventListener("click", (e) => {
      e.stopPropagation(); pushHistory();
      const i = PALETTE.indexOf(o.color); o.color = PALETTE[(i + 1 + PALETTE.length) % PALETTE.length];
      renderList($("#algebraSearch").value); draw(); persist();
    });
    list.appendChild(row);
  }
  try { refreshMarkusContext(); } catch {}
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ---------------- command bar (nay nằm trong panel Đại số kiểu GeoGebra) ---------------- */
let lastAns = 0;
function insertAtCursor(inp, text) {
  if (!inp) return;
  const s = inp.selectionStart ?? inp.value.length;
  const e = inp.selectionEnd ?? inp.value.length;
  inp.value = inp.value.slice(0, s) + text + inp.value.slice(e);
  const pos = s + String(text).length;
  inp.focus();
  try { inp.setSelectionRange(pos, pos); } catch {}
}
function executeCommand() {
  const input = $("#cmdInput");
  if (!input) return;
  let raw = input.value.trim();
  if (!raw) { toast("Hãy nhập biểu thức trước, ví dụ: x^2 - 2"); input.focus(); return; }
  // hỗ trợ ans (kết quả trước)
  if (/\bans\b/i.test(raw)) raw = raw.replace(/\bans\b/gi, `(${lastAns})`);
  try {
    // equation solve shortcut: "solve: x^2-3" or "f(x)=0"? plain add + analyse
    const obj = addObject(raw);
    try {
      if (obj.kind === "fn") { const v = obj.fn(0); if (isFinite(v)) lastAns = round2(v); }
      else if (obj.kind === "point" || obj.kind === "point3d") lastAns = obj.x;
      else if (obj.kind === "vline") lastAns = obj.x;
    } catch {}
    toast(`Đã thêm ${obj.name}: ${obj.expr}`, "ok");
    input.value = ""; input.focus();
  } catch (e) { toast(e.message, "err"); }
}

/* ---------------- analysis tools ---------------- */
function selectedFn() {
  return state.objects.find(o => o.id === state.selectedId && o.kind === "fn" && o.visible && !o.error)
      || state.objects.find(o => o.kind === "fn" && o.visible && !o.error);
}
function sampleFn(fn, a, b, n = 400) {
  const xs = [], ys = [];
  for (let i = 0; i <= n; i++) { const x = a + ((b - a) * i) / n; let y; try { y = fn(x); } catch { y = NaN; } xs.push(x); ys.push(y); }
  return { xs, ys };
}
function findRoots(fn, a, b) {
  const { xs, ys } = sampleFn(fn, a, b, 600), roots = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const y1 = ys[i], y2 = ys[i + 1];
    if (!isFinite(y1) || !isFinite(y2)) continue;
    if (y1 === 0) roots.push(xs[i]);
    else if (y1 * y2 < 0) {
      let l = xs[i], r = xs[i + 1];
      for (let k = 0; k < 40; k++) { const m = (l + r) / 2; let f; try { f = fn(m); } catch { break; } if (y1 * f <= 0) r = m; else l = m; }
      roots.push((l + r) / 2);
    }
  }
  return roots.filter((v, i, arr) => arr.findIndex(u => Math.abs(u - v) < 1e-3) === i).slice(0, 12);
}
function findExtrema(fn, a, b) {
  const { xs, ys } = sampleFn(fn, a, b, 800), out = [];
  for (let i = 1; i < xs.length - 1; i++) {
    const y0 = ys[i - 1], y1 = ys[i], y2 = ys[i + 1];
    if (![y0, y1, y2].every(isFinite)) continue;
    if ((y1 >= y0 && y1 >= y2 && (y1 > y0 || y1 > y2))) {
      // refine by parabolic interpolation
      out.push({ x: xs[i], y: y1, type: "max" });
    } else if ((y1 <= y0 && y1 <= y2 && (y1 < y0 || y1 < y2))) out.push({ x: xs[i], y: y1, type: "min" });
  }
  // dedupe neighbours
  return out.filter((p, i, arr) => i === 0 || Math.abs(p.x - arr[i - 1].x) > (b - a) / 200).slice(0, 12);
}
function markPoint(x, y, color) {
  pushHistory(); state.seq += 1;
  state.objects.push({ id: "o" + Date.now().toString(36) + state.seq + Math.floor(Math.random() * 99), name: `M${state.seq}(${round2(x)}, ${round2(y)})`, expr: `(${round2(x)}, ${round2(y)})`, kind: "point", x, y, color: color || "#38bdf8", visible: true, error: null, born: state.opts.animate ? performance.now() : 0 });
  renderList($("#algebraSearch").value); draw(); kickAnim(); persist();
}
const round2 = (v) => Math.round(v * 100) / 100;
function viewRange() { const [a] = toMath(0, 0), [b] = toMath(W, 0); return [Math.min(a, b), Math.max(a, b)]; }

function runToolAnalysis(tool) {
  const f = selectedFn();
  if ((tool === "extremum" || tool === "root" || tool === "intersect" || tool === "tangent") && !f && tool !== "intersect") {
    toast("Hãy thêm ít nhất một hàm số trước.", "err"); return;
  }
  const [a, b] = viewRange();
  if (tool === "extremum") {
    const pts = findExtrema(f.fn, a, b);
    if (!pts.length) toast("Không thấy cực trị trong khung nhìn hiện tại.");
    pts.forEach(p => markPoint(p.x, p.y, "#fbbf24"));
    if (pts.length) toast(`Tìm thấy ${pts.length} cực trị của ${f.name}`, "ok");
  } else if (tool === "root") {
    const rs = findRoots(f.fn, a, b);
    if (!rs.length) toast("Không thấy nghiệm trong khung nhìn hiện tại.");
    rs.forEach(x => { try { markPoint(x, f.fn(x), "#34d399"); } catch {} });
    if (rs.length) toast(`Nghiệm của ${f.name}: ${rs.map(round2).join(", ")}`, "ok");
  } else if (tool === "intersect") {
    const fns = state.objects.filter(o => o.kind === "fn" && o.visible && !o.error);
    if (fns.length < 2) { toast("Cần ít nhất 2 đồ thị để tìm giao điểm.", "err"); return; }
    let count = 0;
    for (let i = 0; i < fns.length; i++) for (let j = i + 1; j < fns.length; j++) {
      const d = (x) => { try { return fns[i].fn(x) - fns[j].fn(x); } catch { return NaN; } };
      findRoots(d, a, b).forEach(x => { try { markPoint(x, fns[i].fn(x), "#e879f9"); count++; } catch {} });
    }
    toast(count ? `Tìm thấy ${count} giao điểm` : "Không thấy giao điểm trong khung nhìn.", count ? "ok" : undefined);
  } else if (tool === "tangent") {
    const x0 = state.lastClick ? state.lastClick.x : 1;
    const h = 1e-4; let y0, d;
    try { y0 = f.fn(x0); d = (f.fn(x0 + h) - f.fn(x0 - h)) / (2 * h); } catch { toast("Không tính được tiếp tuyến tại điểm này.", "err"); return; }
    if (!isFinite(y0) || !isFinite(d)) { toast("Không tính được tiếp tuyến tại điểm này.", "err"); return; }
    try { addObject(`y = ${round2(y0)} + ${round2(d)}*(x - ${round2(x0)})`, { color: "#fbbf24" }); } catch { try { addObject(`${round2(y0)} + ${round2(d)}*(x - ${round2(x0)})`, { color: "#fbbf24" }); } catch (e) { toast(e.message, "err"); return; } }
    toast(`Tiếp tuyến của ${f.name} tại x = ${round2(x0)} (hệ số góc ${round2(d)})`, "ok");
  }
}

/* ---------------- pointer interaction (2D pan/zoom + 3D orbit như GeoGebra) ---------------- */
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  if (state.mode === "3d") {
    if (state.tool === "move" || state.tool === undefined) {
      drag = { mode3d: true, sx: e.clientX, sy: e.clientY, az: state.view3d.az, el: state.view3d.el,
               tx: state.view3d.tx, ty: state.view3d.ty, moved: false, pan: e.shiftKey || e.button === 2 };
    } else {
      const fl = screenToFloor(px, py);
      let z = 0;
      // nếu đang có mặt được chọn, đặt điểm lên mặt đó
      const sel = state.objects.find(o => o.id === state.selectedId && o.kind === "surface");
      if (sel) { try { const zz = sel.fn(fl.x, fl.y); if (isFinite(zz)) z = clamp(zz, -8, 8); } catch {} }
      state.lastClick3d = { x: fl.x, y: fl.y, z };
      handleToolClick3D(fl.x, fl.y, z);
    }
    return;
  }
  const [x, y] = toMath(px, py);
  if (state.tool === "move" || state.tool === undefined) {
    drag = { sx: e.clientX, sy: e.clientY, cx: state.view.cx, cy: state.view.cy, moved: false };
  } else {
    handleToolClick(x, y);
  }
});
canvas.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  if (state.mode === "3d") {
    if (drag?.mode3d) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.pan || e.shiftKey) {
        state.view3d.tx = drag.tx - dx / state.view3d.scale;
        state.view3d.ty = drag.ty + dy / state.view3d.scale;
      } else {
        state.view3d.az = drag.az + dx * 0.008;
        state.view3d.el = clamp(drag.el + dy * 0.006, 0.12, 1.5);
      }
      draw();
    } else {
      // hover: hiện tọa độ nền gần nhất
      try {
        const fl = screenToFloor(px, py);
        $("#hudCoords").textContent = `x: ${fl.x.toFixed(2)} · y: ${fl.y.toFixed(2)} · kéo để xoay`;
      } catch {}
    }
    return;
  }
  const [x, y] = toMath(px, py);
  $("#hudCoords").textContent = `x: ${round2(x).toFixed(2)} · y: ${round2(y).toFixed(2)}`;
  updateTrace(px, py, x);
  if (drag) {
    const dx = (e.clientX - drag.sx) / state.view.scale, dy = (e.clientY - drag.sy) / state.view.scale;
    if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) drag.moved = true;
    state.view.cx = drag.cx - dx; state.view.cy = drag.cy + dy;
    draw();
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (drag && drag.moved) persist();
  if (drag && !drag.moved) {
    const r = canvas.getBoundingClientRect();
    if (state.mode === "3d") {
      const fl = screenToFloor(e.clientX - r.left, e.clientY - r.top);
      state.lastClick3d = { x: fl.x, y: fl.y, z: 0 };
      state.lastClick = { x: fl.x, y: fl.y };
    } else {
      const [x, y] = toMath(e.clientX - r.left, e.clientY - r.top);
      state.lastClick = { x, y };
    }
  }
  drag = null;
});
canvas.addEventListener("contextmenu", (e) => { if (state.mode === "3d") e.preventDefault(); });
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (state.mode === "3d") {
    state.view3d.scale = clamp(state.view3d.scale * Math.exp(-e.deltaY * 0.0012), 10, 160);
    draw(); persist(); return;
  }
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const [bx, by] = toMath(px, py);
  state.view.scale = clamp(state.view.scale * Math.exp(-e.deltaY * 0.0012), 8, 500);
  // keep cursor anchored
  state.view.cx = bx - (px - W / 2) / state.view.scale;
  state.view.cy = by + (py - H / 2) / state.view.scale;
  draw(); persist();
}, { passive: false });

function updateTrace(px, py, x) {
  const card = $("#traceCard");
  const f = selectedFn();
  if (!f) { card.hidden = true; return; }
  let y; try { y = f.fn(x); } catch { card.hidden = true; return; }
  if (typeof y !== "number" || !isFinite(y)) { card.hidden = true; return; }
  const [, sy] = toScreen(x, y);
  if (Math.abs(sy - py) > 60) { card.hidden = true; return; }
  card.hidden = false;
  $("#traceTitle").textContent = `${f.name} tại x=${round2(x)}`;
  $("#traceValue").textContent = `y = ${round2(y)}`;
  card.style.left = clamp(px + 14, 8, W - 170) + "px";
  card.style.top = clamp(sy - 44, 8, H - 50) + "px";
}

function handleToolClick3D(x, y, z) {
  state.lastClick = { x, y };
  if (state.tool === "point") {
    try {
      const o = addObject(`(${round2(x)}, ${round2(y)}, ${round2(z)})`);
      toast(`Đã tạo điểm 3D ${o.name}`, "ok");
    } catch (e) { toast(e.message, "err"); }
  } else if (state.tool === "line" || state.tool === "circle") {
    toast("Ở 3D hãy nhập phương trình mặt z=f(x,y) hoặc điểm (x,y,z).", undefined);
  } else {
    // cực trị / nghiệm / giao điểm: chạy trên mặt đã chọn tại y hiện tại (cắt mặt bằng mặt phẳng y=const)
    const sel = state.objects.find(o => o.id === state.selectedId && o.kind === "surface")
             || state.objects.find(o => o.kind === "surface" && o.visible);
    if (!sel) { toast("Hãy thêm một mặt z=f(x,y) trước.", "err"); return; }
    const f1 = (xx) => { try { return sel.fn(xx, y); } catch { return NaN; } };
    if (state.tool === "extremum" || state.tool === "root") {
      const rs = state.tool === "root" ? findRoots(f1, -6, 6) : findExtrema(f1, -6, 6).map(p => p.x);
      if (!rs.length) { toast("Không thấy điểm trên lát cắt y=" + round2(y)); return; }
      rs.slice(0, 6).forEach(xx => {
        try {
          const zz = sel.fn(xx, y);
          pushHistory(); state.seq += 1;
          state.objects.push({ id: "o3" + Date.now().toString(36) + state.seq, name: `M${state.seq}(${round2(xx)},${round2(y)},${round2(zz)})`,
            expr: `(${round2(xx)}, ${round2(y)}, ${round2(zz)})`, kind: "point3d", x: round2(xx), y: round2(y), z: round2(zz),
            color: "#fbbf24", visible: true, error: null, born: state.opts.animate ? performance.now() : 0 });
        } catch {}
      });
      renderList($("#algebraSearch").value); draw(); kickAnim(); persist();
      toast(`Đã đánh dấu ${rs.length} điểm trên mặt ${sel.name} tại y=${round2(y)}`, "ok");
    } else runToolAnalysis(state.tool);
  }
}

function handleToolClick(x, y) {
  state.lastClick = { x, y };
  if (state.mode === "3d") { handleToolClick3D(x, y, 0); return; }
  if (state.tool === "point") {
    try { const o = addObject(`(${round2(x)}, ${round2(y)})`); toast(`Đã tạo ${o.name}`, "ok"); }
    catch (e) { toast(e.message, "err"); }
  } else if (state.tool === "line" || state.tool === "circle") {
    state.pending.push({ x, y });
    if (state.pending.length === 1) { toast(state.tool === "line" ? "Đã chọn điểm 1 — nhấp điểm 2." : "Đã chọn tâm — nhấp điểm vành."); draw(); }
    else {
      const [p1, p2] = state.pending; state.pending = [];
      try {
        if (state.tool === "line") {
          if (Math.abs(p2.x - p1.x) < 1e-9) addObject(`x = ${round2(p1.x)}`);
          else { const m = (p2.y - p1.y) / (p2.x - p1.x), c = p1.y - m * p1.x; addObject(`${round2(m)}*x + ${round2(c)}`); }
        } else {
          const R = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          addObject(`(x - ${round2(p1.x)})^2 + (y - ${round2(p1.y)})^2 = ${round2(R * R)}`);
        }
        toast("Đã dựng hình xong.", "ok");
      } catch (e) { toast(e.message, "err"); }
      draw();
    }
  } else {
    runToolAnalysis(state.tool);
  }
}

/* ---------------- toolbar / rail / panels ---------------- */
function setTool(t) {
  state.tool = t; state.pending = [];
  $$("#toolGrid .tool-card").forEach(b => b.classList.toggle("is-active", b.dataset.tool === t));
  $$(".graph-toolbar button").forEach(b => { if (b.dataset.act === "pointer") b.classList.toggle("is-active", t === "move"); });
  canvas.style.cursor = t === "move" ? "grab" : "crosshair";
  draw();
}
function zoomBy(f) {
  if (state.mode === "3d") { state.view3d.scale = clamp(state.view3d.scale * f, 10, 160); draw(); persist(); return; }
  state.view.scale = clamp(state.view.scale * f, 8, 500); draw(); persist();
}
function resetView() {
  if (state.mode === "3d") { resetView3D(); toast("Đã đặt lại góc nhìn 3D chuẩn.", "ok"); return; }
  state.view = { cx: 0, cy: 0, scale: 48 }; draw(); persist(); toast("Đã đặt lại khung nhìn chuẩn.", "ok");
}

function bindChrome() {
  $$(".rail-item").forEach(b => b.addEventListener("click", () => {
    const v = b.dataset.view;
    const wasActive = b.classList.contains("is-active");
    const leftHidden = document.body.classList.contains("hide-left");
    // click lại icon đang mở -> thu gọn panel; panel đang ẩn -> mở ra
    if (wasActive && !leftHidden) { setLeftVisible(false); return; }
    $$(".rail-item").forEach(x => { x.classList.remove("is-active"); x.setAttribute("aria-pressed", "false"); });
    b.classList.add("is-active"); b.setAttribute("aria-pressed", "true");
    $$(".side-view").forEach(p => p.classList.toggle("is-visible", p.dataset.pane === v));
    if (leftHidden) setLeftVisible(true);
    if (v === "table") refreshTable();
  }));
  $$("#toolGrid .tool-card").forEach(b => b.addEventListener("click", () => { setTool(b.dataset.tool); toast(`Công cụ: ${b.querySelector("b").textContent}`); }));
  $$(".graph-toolbar button").forEach(b => b.addEventListener("click", () => {
    const a = b.dataset.act;
    if (a === "pointer") setTool("move");
    else if (a === "zoom-in") zoomBy(1.25);
    else if (a === "zoom-out") zoomBy(1 / 1.25);
    else if (a === "center") resetView();
    else if (a === "fullscreen") { if (document.fullscreenElement) document.exitFullscreen(); else wrap.requestFullscreen?.(); }
    else if (a === "settings") { $(`.rail-item[data-view="settings"]`).click(); setLeftVisible(true); }
  }));

  const execBtn = $("#execBtn");
  if (execBtn) execBtn.addEventListener("click", executeCommand);
  const cmdInput = $("#cmdInput");
  if (cmdInput) cmdInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") executeCommand();
    if (e.key === "Escape") { e.target.value = ""; }
  });
  const clearCmdBtn = $("#clearCmdBtn");
  if (clearCmdBtn) clearCmdBtn.addEventListener("click", () => { const i = $("#cmdInput"); if (i) { i.value = ""; i.focus(); } });
  const geoAddBtn = $("#geoAddBtn");
  if (geoAddBtn) geoAddBtn.addEventListener("click", executeCommand);
  const kbToggle = $("#keyboardBtn");
  if (kbToggle) kbToggle.addEventListener("click", () => {
    const k = $("#mathKeys") || $("#geoKeyboard");
    if (k) k.hidden = !k.hidden;
  });
  // Tabs bàn phím kiểu GeoGebra: 123 / f(x) / ABC / #&¬ (4 ảnh mẫu)
  $$(".geo-kb-tabs button").forEach(t => t.addEventListener("click", () => {
    $$(".geo-kb-tabs button").forEach(x => x.classList.toggle("is-active", x === t));
    $$(".geo-keyboard .kb-pane").forEach(p => p.classList.toggle("is-visible", p.dataset.paneKb === t.dataset.kb));
  }));
  // Shift qwerty (một lần như điện thoại) + popup Hy Lạp
  let kbShift = false;
  const greekPop = $("#greekPop");
  // Tất cả phím trong keyboard mới: chèn tại con trỏ + phím đặc biệt
  $$(".geo-keyboard button").forEach(b => b.addEventListener("click", () => {
    if (b.closest(".geo-kb-tabs")) return; // tab đã xử lý riêng
    const inp = $("#cmdInput");
    if (!inp) return;
    const k = b.dataset.k, act = b.dataset.act;
    if (act === "shift") {
      kbShift = !kbShift;
      b.classList.toggle("is-active", kbShift);
      $$(".kb-abc .qb-row button[data-k]").forEach(x => {
        if (/^[a-z]$/i.test(x.dataset.k)) x.textContent = kbShift ? x.dataset.k.toUpperCase() : x.dataset.k.toLowerCase();
      });
      return;
    }
    if (act === "greek") {
      if (greekPop) greekPop.hidden = !greekPop.hidden;
      return;
    }
    if (act === "back") {
      const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? inp.value.length;
      if (s !== e) insertAtCursor(inp, "");
      else if (s > 0) {
        inp.value = inp.value.slice(0, s - 1) + inp.value.slice(e);
        inp.focus();
        try { inp.setSelectionRange(s - 1, s - 1); } catch {}
      } else inp.focus();
      return;
    }
    if (act === "clear") { inp.value = ""; inp.focus(); return; }
    if (act === "left") {
      const s = (inp.selectionStart ?? 1) - 1;
      inp.focus();
      try { inp.setSelectionRange(Math.max(0, s), Math.max(0, s)); } catch {}
      return;
    }
    if (act === "right") {
      const s = (inp.selectionStart ?? 0) + 1;
      inp.focus();
      try { inp.setSelectionRange(s, s); } catch {}
      return;
    }
    if (act === "enter") { if (greekPop) greekPop.hidden = true; executeCommand(); return; }
    if (!k) return;
    let ins = k;
    if (/^ans$/i.test(k)) ins = String(lastAns);
    else if (kbShift && /^[a-z]$/i.test(k)) {
      ins = k.toUpperCase();
      kbShift = false;
      const sh = document.querySelector('.kb-abc [data-act="shift"]');
      if (sh) sh.classList.remove("is-active");
      $$(".kb-abc .qb-row button[data-k]").forEach(x => {
        if (/^[a-z]$/i.test(x.dataset.k)) x.textContent = x.dataset.k.toLowerCase();
      });
    }
    /* gợi ý CAS / ký hiệu nâng cao ngay khi bấm (vẫn chèn để Enter báo chi tiết) */
    if (/^d\/dx\($/.test(ins)) toast("d/dx là đạo hàm — nhập hàm kết quả để vẽ, vd: 2*x.", undefined);
    else if (/^int\($/.test(ins)) toast("∫ là nguyên hàm — nhập hàm kết quả để vẽ, vd: x^2/2.", undefined);
    else if (/^[∀∃∈∉⊂⊆∥⊥∠⊗∧∨]$/.test(ins)) toast(`Ký hiệu ${ins} là logic / tập hợp — hãy nhập phương trình biên f(x,y)=0.`, undefined);
    else if (/^matrix|^\[\.\]/.test(ins) || ins === "[.]" || ins === "[..]") toast("Ma trận — hãy nhập điểm (x,y) hoặc khối 3D cube()/sphere().", undefined);
    else if (/^[{}]$|^:=$|^;$|^\$$/.test(ins)) toast("Ký hiệu lập trình / tập hợp — biểu thức vẽ chỉ cần x, y, số và hàm.", undefined);
    else if (/^[αβγθλμρσφωΔΣ]$/.test(ins)) toast(`${ins} sẽ dùng như biến x khi vẽ.`, undefined);
    if (greekPop && !b.closest("#greekPop")) greekPop.hidden = true;
    insertAtCursor(inp, ins);
  }));
  if (greekPop) greekPop.addEventListener("click", (e) => e.stopPropagation());
  $("#algebraSearch").addEventListener("input", (e) => renderList(e.target.value));
  $("#addObjectBtn").addEventListener("click", () => { $("#cmdInput").focus(); toast("Nhập biểu thức vào ô lệnh phía trên (kiểu GeoGebra)."); });
  $("#clearAllBtn").addEventListener("click", () => {
    if (!state.objects.length) return;
    pushHistory(); state.objects = []; state.selectedId = null;
    renderList(); refreshTableSelect(); draw(); persist(); toast("Đã xóa tất cả đối tượng.");
  });
  $("#undoBtn").addEventListener("click", undo);
  $("#redoBtn").addEventListener("click", redo);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
  });
  $("#shareBtn").addEventListener("click", async () => {
    const data = btoa(unescape(encodeURIComponent(JSON.stringify(state.objects.map(stripFn)))));
    const url = location.href.split("#")[0] + "#mm=" + data.slice(0, 1200);
    try { await navigator.clipboard.writeText(url); toast("Đã sao chép liên kết chia sẻ.", "ok"); }
    catch { toast("Trạng thái đã sẵn sàng để chia sẻ.", "ok"); }
  });
  $("#presentBtn").addEventListener("click", () => {
    resetView();
    document.querySelector(".insight-panel")?.scrollTo({ top: 0, behavior: "smooth" });
    toast("Chế độ trình bày: khung nhìn chuẩn, lưới rõ, chữ lớn.", "ok");
  });
  $("#avatarBtn").addEventListener("click", () => toast("Mind Math — phiên bản trình diễn KHKT (lưu cục bộ)."));
  $("#menuBtn").addEventListener("click", () => toast("Menu: Hồ sơ, Mở/Lưu, Xuất ảnh PNG (bản trình diễn)."));

  // suggestions + feature demos
  $$("#suggestList button").forEach(b => b.addEventListener("click", () => {
    try { const o = addObject(b.dataset.expr); toast(`Đã thêm ${o.name}`, "ok"); }
    catch (e) { toast(e.message, "err"); }
  }));
  $$("#suggestList3d button").forEach(b => b.addEventListener("click", () => {
    try {
      if (b.dataset.goto3d && state.mode !== "3d") setMode("3d");
      const o = addObject(b.dataset.expr); toast(`Đã thêm mặt 3D ${o.name}`, "ok");
    } catch (e) { toast(e.message, "err"); }
  }));
  $$(".feature-card").forEach(c => c.addEventListener("click", () => runDemo(c.dataset.demo)));

  // Dark / Light mode — layout giữa trắng / đen
  $$("[data-theme-btn]").forEach(b => b.addEventListener("click", () => {
    setTheme(b.dataset.themeBtn);
    toast(b.dataset.themeBtn === "dark" ? "Dark mode: nền đồ thị đen." : "Light mode: nền đồ thị trắng.", "ok");
  }));
  // 2D / 3D switch
  $$("#modeSwitch button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  // thanh công cụ 3D
  $$("#view3dBar button").forEach(b => b.addEventListener("click", () => {
    const a = b.dataset.v3;
    if (a === "reset") resetView3D();
    else if (a === "top") { state.view3d.az = 0; state.view3d.el = 1.5; draw(); persist(); }
    else if (a === "mesh") {
      state.opts.mesh3d = !state.opts.mesh3d;
      b.classList.toggle("is-active", state.opts.mesh3d);
      const cb = $("#setMesh3d"); if (cb) cb.checked = state.opts.mesh3d;
      draw(); persist();
    } else if (a === "spin") {
      state.opts.spin3d = !state.opts.spin3d;
      b.classList.toggle("is-active", state.opts.spin3d);
      const cb = $("#setSpin3d"); if (cb) cb.checked = state.opts.spin3d;
      persist();
      toast(state.opts.spin3d ? "Đang tự xoay 3D (bấm lần nữa để dừng)." : "Đã dừng xoay.", "ok");
    }
  }));

  // table + sheet + settings
  $("#tableSelect").addEventListener("change", refreshTable);
  $("#setMinor").addEventListener("change", (e) => { state.opts.minor = e.target.checked; draw(); persist(); });
  $("#setLabels").addEventListener("change", (e) => { state.opts.labels = e.target.checked; draw(); persist(); });
  $("#setGlow").addEventListener("change", (e) => { state.opts.glow = e.target.checked; draw(); persist(); });
  $("#setWave").addEventListener("change", (e) => { state.opts.wave = e.target.checked; $("#atmosphere").style.display = e.target.checked ? "" : "none"; persist(); });
  $("#setGrid").addEventListener("input", (e) => { state.opts.gridStep = parseFloat(e.target.value); $("#gridVal").textContent = state.opts.gridStep.toFixed(1); draw(); persist(); });
  $("#setThick").addEventListener("input", (e) => { state.opts.thick = parseFloat(e.target.value); $("#thickVal").textContent = state.opts.thick.toFixed(1); draw(); persist(); });
  const meshCb = $("#setMesh3d"); if (meshCb) meshCb.addEventListener("change", (e) => {
    state.opts.mesh3d = e.target.checked;
    $$('#view3dBar [data-v3="mesh"]').forEach(x => x.classList.toggle("is-active", state.opts.mesh3d));
    draw(); persist();
  });
  const spinCb = $("#setSpin3d"); if (spinCb) spinCb.addEventListener("change", (e) => {
    state.opts.spin3d = e.target.checked;
    $$('#view3dBar [data-v3="spin"]').forEach(x => x.classList.toggle("is-active", state.opts.spin3d));
    persist();
  });
  const q3 = $("#setQuality3d"); if (q3) q3.addEventListener("input", (e) => {
    state.opts.quality3d = parseInt(e.target.value, 10);
    $("#q3Val").textContent = state.opts.quality3d; draw(); persist();
  });
  const anCb = $("#setAnimate"); if (anCb) anCb.addEventListener("change", (e) => {
    state.opts.animate = e.target.checked; draw(); kickAnim(); persist();
  });
  const adR = $("#setAnimDur"); if (adR) adR.addEventListener("input", (e) => {
    state.opts.animDur = parseFloat(e.target.value);
    $("#animVal").textContent = Number(state.opts.animDur).toFixed(1); persist();
  });
  const rpB = $("#replayAnimBtn"); if (rpB) rpB.addEventListener("click", replayAnim);
  $("#resetViewBtn2").addEventListener("click", resetView);

  // ---- Thu gọn / mở rộng panel phải (đỡ chật màn hình) ----
  const insightExpand = $("#insightExpand");
  function setInsightVisible(v) {
    document.body.classList.toggle("hide-insight", !v);
    if (insightExpand) insightExpand.hidden = !!v;
    try { localStorage.setItem("mind-math-hide-insight", v ? "0" : "1"); } catch {}
    requestAnimationFrame(() => { try { draw(); } catch {} });
  }
  const insightToggle = $("#insightToggle");
  if (insightToggle) insightToggle.addEventListener("click", () => setInsightVisible(false));
  if (insightExpand) insightExpand.addEventListener("click", () => setInsightVisible(true));
  try { if (localStorage.getItem("mind-math-hide-insight") === "1") setInsightVisible(false); } catch {}

  // ---- Thu gọn / mở rộng panel trái bằng click icon trên rail ----
  function setLeftVisible(v) {
    document.body.classList.toggle("hide-left", !v);
    try { localStorage.setItem("mind-math-hide-left", v ? "0" : "1"); } catch {}
    requestAnimationFrame(() => { try { draw(); } catch {} });
  }
  try { if (localStorage.getItem("mind-math-hide-left") === "1") setLeftVisible(false); } catch {}
  try { localStorage.removeItem("mind-math-leftw"); } catch {}

  // ---- Đường tròn lượng giác ----
  const sl = $("#trigSlider");
  if (sl) {
    sl.addEventListener("input", (e) => setTrigDeg(parseFloat(e.target.value), true));
    // kéo trực tiếp trên vòng tròn để đổi góc
    const cv = $("#trigCircle");
    const pickAngle = (ev) => {
      const r = cv.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (cv.width / r.width);
      // cần tọa độ CSS để tính góc: dùng bounding tương đối
      const cxp = r.width / 2 - 18, cyp = r.height / 2 - 8;
      const dx = (ev.clientX - r.left) - cxp, dy = -((ev.clientY - r.top) - cyp);
      let deg = Math.atan2(dy, dx) * 180 / Math.PI;
      setTrigDeg(deg);
    };
    let trigDrag = false;
    cv.addEventListener("pointerdown", (ev) => { trigDrag = true; cv.setPointerCapture(ev.pointerId); pickAngle(ev); });
    cv.addEventListener("pointermove", (ev) => { if (trigDrag) pickAngle(ev); });
    cv.addEventListener("pointerup", () => { trigDrag = false; });
  }
  const dg = $("#trigDeg");
  if (dg) {
    dg.addEventListener("input", (e) => setTrigDeg(parseFloat(e.target.value) || 0));
    dg.addEventListener("change", (e) => setTrigDeg(parseFloat(e.target.value) || 0));
  }
  // nhập radian ở trên → đổi ngay khung bên cạnh (vòng tròn + số)
  const rd = $("#trigRad");
  if (rd) {
    rd.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      if (isFinite(v)) setTrigRad(v);
    });
    rd.addEventListener("change", (e) => {
      const v = parseFloat(e.target.value);
      if (isFinite(v)) setTrigRad(v);
    });
  }
  const playBtn = $("#trigPlayBtn");
  if (playBtn) playBtn.addEventListener("click", () => {
    trig.playing = !trig.playing;
    playBtn.textContent = trig.playing ? "⏸ Dừng" : "▶ Quay";
    playBtn.classList.toggle("is-active", trig.playing);
  });
  $$("#trigSpecial button").forEach(b => b.addEventListener("click", () => {
    trig.buildT = 1;
    setTrigDeg(parseFloat(b.dataset.deg));
  }));
  const buildBtn = $("#trigBuildBtn");
  if (buildBtn) buildBtn.addEventListener("click", trigBuildPlay);
  $$(".trig-wave-switch button").forEach(b => b.addEventListener("click", () => {
    trig.waveFunc = b.dataset.wave === "cos" ? "cos" : "sin";
    $$(".trig-wave-switch button").forEach(x => x.classList.toggle("is-active", x === b));
    drawTrigCircle();
    toast(trig.waveFunc === "cos" ? "Sóng mini: hình cos — hoành độ M = cos." : "Sóng mini: hình sin — tung độ M = sin.", "ok");
  }));
  const addSin = $("#trigAddSin");
  if (addSin) addSin.addEventListener("click", () => {
    try {
      if (state.mode === "3d") setMode("2d");
      const o = addObject("sin(x)", { color: "#34d399" });
      toast(`Đã vẽ sin(x) ${o.name} — tung độ M = sin α.`, "ok");
    } catch (e) { toast(e.message, "err"); }
  });
  const addCos = $("#trigAddCos");
  if (addCos) addCos.addEventListener("click", () => {
    try {
      if (state.mode === "3d") setMode("2d");
      const o = addObject("cos(x)", { color: "#38bdf8" });
      toast(`Đã vẽ cos(x) ${o.name} — hoành độ M = cos α.`, "ok");
    } catch (e) { toast(e.message, "err"); }
  });
  // mở tab Lượng giác thì vẽ lại vòng tròn (canvas cần layout xong)
  $$('.rail-item[data-view="trig"]').forEach(b => b.addEventListener("click", () => {
    requestAnimationFrame(() => drawTrigCircle());
  }));

  // ---- Markus AI ----
  const mkInput = $("#markusInput"), mkSend = $("#markusSend");
  if (mkSend) mkSend.addEventListener("click", () => markusSend());
  if (mkInput) {
    mkInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); markusSend(); }
    });
    mkInput.addEventListener("input", () => {
      mkInput.style.height = "auto";
      mkInput.style.height = Math.min(90, mkInput.scrollHeight) + "px";
    });
  }
  $$("#markusChips button").forEach(b => b.addEventListener("click", () => markusSend(b.dataset.q)));
  const mkGear = $("#markusSettingsBtn"), mkSet = $("#markusSettings");
  if (mkGear) mkGear.addEventListener("click", () => { if (mkSet) mkSet.hidden = !mkSet.hidden; });
  const mkModel = $("#markusModel"), mkKey = $("#markusKey");
  if (mkModel) {
    mkModel.value = markusCfg.model || "gemini-3.6-flash";
    mkModel.addEventListener("change", () => {
      markusCfg.model = mkModel.value; markusStore.saveCfg(markusCfg);
      toast("Markus dùng mô hình " + markusCfg.model, "ok");
    });
  }
  if (mkKey) {
    mkKey.value = markusCfg.key || "";
    mkKey.addEventListener("change", () => {
      markusCfg.key = mkKey.value.trim(); markusStore.saveCfg(markusCfg);
      markusSetStatus(markusCfg.key ? "on" : "off", markusCfg.key ? "online" : "offline");
      toast(markusCfg.key ? "Đã lưu API key cho Markus." : "Đã xóa key — Markus chạy offline.", "ok");
    });
  }
  const mkShow = $("#markusKeyShow");
  if (mkShow) mkShow.addEventListener("click", () => { if (mkKey) mkKey.type = mkKey.type === "password" ? "text" : "password"; });
  const mkTest = $("#markusTestBtn");
  if (mkTest) mkTest.addEventListener("click", async () => {
    mkTest.textContent = "Đang kiểm tra…"; mkTest.disabled = true;
    try {
      const r = await markusCallAPI("Trả lời đúng một từ: OK");
      markusSetStatus("on", "online");
      toast("Markus kết nối thành công: " + r.slice(0, 60), "ok");
    } catch (e) {
      markusSetStatus("off", "offline");
      toast("Kết nối lỗi: " + e.message, "err");
    }
    mkTest.textContent = "Kiểm tra kết nối"; mkTest.disabled = false;
  });
  const mkClear = $("#markusClearBtn");
  if (mkClear) mkClear.addEventListener("click", () => {
    markusHist = []; markusStore.saveHist(markusHist); renderMarkusChat();
    toast("Đã xóa hội thoại với Markus.");
  });
  $$('.rail-item[data-view="markus"]').forEach(b => b.addEventListener("click", () => {
    refreshMarkusContext();
    renderMarkusChat();
  }));

  buildSheet();
  window.addEventListener("resize", () => { draw(); drawTrigCircle(); });
}

function runDemo(kind) {
  try {
    if (kind === "geometry") {
      setTool("move");
      addObject("(0, 0)", { color: "#e879f9" });
      addObject("x^2 + y^2 = 9", { color: "#38bdf8" });
      addObject("x + y = 2", { color: "#34d399" });
      toast("Hình học: điểm O, đường tròn R=3 và đường thẳng x+y=2.", "ok");
    } else if (kind === "analyze") {
      const o = addObject("x^3 - 3*x", { color: "#8b5cf6" });
      state.selectedId = o.id;
      const [a, b] = [-4, 4];
      findExtrema(o.fn, a, b).forEach(p => markPoint(p.x, p.y, "#fbbf24"));
      findRoots(o.fn, a, b).forEach(x => { try { markPoint(x, o.fn(x), "#34d399"); } catch {} });
      $(`.rail-item[data-view="table"]`).click(); setLeftVisible(true);
      toast("Đã phân tích f(x)=x³−3x: cực trị vàng, nghiệm xanh.", "ok");
    } else if (kind === "solve") {
      const o = addObject("x^2 - 3", { color: "#38bdf8" });
      const rs = findRoots(o.fn, -6, 6);
      rs.forEach(x => { try { markPoint(x, o.fn(x), "#34d399"); } catch {} });
      toast(rs.length ? `x²−3=0 có nghiệm x ≈ ${rs.map(round2).join(", ")}` : "Không thấy nghiệm.", rs.length ? "ok" : undefined);
    }
  } catch (e) { toast(e.message, "err"); }
}

function undo() {
  if (!state.history.length) { toast("Không còn gì để hoàn tác."); return; }
  state.future.push(JSON.stringify({ objects: state.objects.map(stripFn), seq: state.seq, colorIdx }));
  restore(state.history.pop());
  renderList(); refreshTableSelect(); draw(); persist();
}
function redo() {
  if (!state.future.length) { toast("Không còn gì để làm lại."); return; }
  state.history.push(JSON.stringify({ objects: state.objects.map(stripFn), seq: state.seq, colorIdx }));
  restore(state.future.pop());
  renderList(); refreshTableSelect(); draw(); persist();
}

/* ---------------- value table ---------------- */
function refreshTableSelect() {
  const sel = $("#tableSelect");
  const cur = sel.value;
  sel.innerHTML = "";
  const fns = state.objects.filter(o => o.kind === "fn" && !o.error);
  if (!fns.length) { sel.innerHTML = `<option value="">— chưa có hàm số —</option>`; }
  for (const o of fns) {
    const op = document.createElement("option");
    op.value = o.id; op.textContent = `${o.name}: ${o.expr}`;
    sel.appendChild(op);
  }
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  else if (state.selectedId && [...sel.options].some(o => o.value === state.selectedId)) sel.value = state.selectedId;
  refreshTable();
}
function refreshTable() {
  const tb = $("#valueTable tbody"); tb.innerHTML = "";
  const o = state.objects.find(x => x.id === $("#tableSelect").value && x.kind === "fn");
  if (!o) { tb.innerHTML = `<tr><td colspan="2" style="text-align:center;color:var(--muted)">Thêm hàm số để xem bảng giá trị.</td></tr>`; return; }
  for (let x = -5; x <= 5.001; x += 0.5) {
    let y; try { y = o.fn(x); } catch { y = NaN; }
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${round2(x)}</td><td>${isFinite(y) ? round2(y) : "—"}</td>`;
    tb.appendChild(tr);
  }
}

/* ---------------- mini sheet ---------------- */
const sheetData = Array.from({ length: 6 }, () => Array(3).fill(""));
function sheetEval(expr, depth = 0) {
  if (depth > 8) return NaN;
  let s = String(expr).trim();
  if (!s.startsWith("=")) { const n = parseFloat(s); return s === "" ? "" : (isNaN(n) ? s : n); }
  s = s.slice(1);
  s = s.replace(/([A-C])([1-6])/g, (m, c, r) => {
    const v = sheetEval(sheetData[+r - 1][c.charCodeAt(0) - 65], depth + 1);
    return typeof v === "number" ? `(${v})` : "0";
  });
  try { return makeFn(compileScalar(s), ["x"])(0); } catch { return "⊥"; }
}
function buildSheet() {
  const tb = $("#sheetTable tbody"); tb.innerHTML = "";
  sheetData.forEach((row, r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td style="color:var(--dim)">${r + 1}</td>`;
    row.forEach((val, c) => {
      const td = document.createElement("td");
      const inp = document.createElement("input");
      inp.value = val; inp.placeholder = "—";
      inp.addEventListener("change", () => { sheetData[r][c] = inp.value; refreshSheetHints(); });
      inp.addEventListener("focus", () => inp.select());
      td.appendChild(inp); tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  sheetData[0][0] = "2"; sheetData[1][0] = "3"; sheetData[0][1] = "=A1*2+sin(A2)";
  syncSheetInputs();
}
function syncSheetInputs() {
  $$("#sheetTable tbody tr").forEach((tr, r) => {
    $$("input", tr).forEach((inp, c) => { inp.value = sheetData[r][c]; inp.title = String(sheetEval(sheetData[r][c])); });
  });
}
function refreshSheetHints() {
  $$("#sheetTable tbody tr").forEach((tr, r) => {
    $$("input", tr).forEach((inp, c) => { inp.title = String(sheetEval(inp.value)); });
  });
}

/* ============================================================================
   ĐƯỜNG TRÒN LƯỢNG GIÁC — toàn bộ chi tiết toán học
   - Định nghĩa: đường tròn tâm O(0,0), bán kính R=1 trên mặt phẳng Oxy.
   - Góc định hướng α: tia Ox⁺ quay ngược chiều kim đồng hồ (dương), cùng chiều (âm).
   - Điểm M trên tròn: M(cos α, sin α). Hoành độ = cos, tung độ = sin.
   - tan α = sin/cos: giao của OM kéo dài với trục x=1. Không XĐ tại 90°+k180°.
   - cot α = cos/sin: giao với trục y=1. Không XĐ tại k180°.
   - Dấu theo phần tư: Q1 (+,+), Q2 (−,+), Q3 (−,−), Q4 (+,−).
   - Chu kỳ 2π (360°): sin(α+2π)=sin α, cos(α+2π)=cos α.
   - Giá trị đặc biệt: 0°, 30°(π/6), 45°(π/4), 60°(π/3), 90°(π/2), 180°(π), 270°(3π/2).
   ============================================================================ */
const trig = { deg: 30, playing: false, speed: 60, showTan: true, showProj: true, showWave: true,
  waveFunc: "sin", buildT: 1, building: false, useRad: false, lastT: 0 };
const TRIG_EXACT = {
  0:   { rad: "0", cos: "1", sin: "0" },
  30:  { rad: "π/6", cos: "√3/2", sin: "1/2" },
  45:  { rad: "π/4", cos: "√2/2", sin: "√2/2" },
  60:  { rad: "π/3", cos: "1/2", sin: "√3/2" },
  90:  { rad: "π/2", cos: "0", sin: "1" },
  120: { rad: "2π/3", cos: "−1/2", sin: "√3/2" },
  135: { rad: "3π/4", cos: "−√2/2", sin: "√2/2" },
  150: { rad: "5π/6", cos: "−√3/2", sin: "1/2" },
  180: { rad: "π", cos: "−1", sin: "0" },
  210: { rad: "7π/6", cos: "−√3/2", sin: "−1/2" },
  270: { rad: "3π/2", cos: "0", sin: "−1" },
  315: { rad: "7π/4", cos: "√2/2", sin: "−√2/2" },
};
function trigNorm360(d) { let r = d % 360; if (r < 0) r += 360; return r; }
function trigRad(d) { return d * Math.PI / 180; }
function trigValues(deg) {
  const r = trigRad(deg), c = Math.cos(r), s = Math.sin(r);
  const tan = Math.abs(c) < 1e-12 ? NaN : s / c;
  const cot = Math.abs(s) < 1e-12 ? NaN : c / s;
  return { c, s, tan, cot };
}
function trigFmt(v) { return !isFinite(v) ? "KXĐ" : (Math.abs(v) < 0.0005 ? "0" : (Math.round(v * 1000) / 1000).toString()); }

function drawTrigCircle() {
  const cv = $("#trigCircle");
  if (!cv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = cv.clientWidth || 260;
  const size = Math.max(200, cssW);
  if (cv.width !== Math.round(size * dpr)) { cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr); }
  const g = cv.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const isDark = (state.opts.theme !== "light");
  // nền
  g.fillStyle = isDark ? "#0d0b28" : "#ffffff";
  g.fillRect(0, 0, size, size);

  const pad = trig.showWave ? 14 : 18;
  const R = (size - pad * 2 - (trig.showWave ? 34 : 0)) / 2.6;
  const cx = size / 2 - (trig.showWave ? 18 : 0), cy = size / 2 - (trig.showWave ? 8 : 0);
  const X = (x) => cx + x * R, Y = (y) => cy - y * R;
  const grid = isDark ? "rgba(139,92,246,.14)" : "rgba(15,23,42,.10)";
  const axisC = isDark ? "rgba(238,240,255,.75)" : "rgba(15,23,42,.7)";
  const txtC = isDark ? "#d6d2f7" : "#334155";

  // lưới mờ vuông [-1.3,1.3]
  g.strokeStyle = grid; g.lineWidth = 1; g.beginPath();
  for (const t of [-1, -0.5, 0.5, 1]) {
    g.moveTo(X(-1.35), Y(t)); g.lineTo(X(1.35), Y(t));
    g.moveTo(X(t), Y(-1.35)); g.lineTo(X(t), Y(1.35));
  }
  g.stroke();
  // trục
  g.strokeStyle = axisC; g.lineWidth = 1.4; g.beginPath();
  g.moveTo(X(-1.45), Y(0)); g.lineTo(X(1.45), Y(0));
  g.moveTo(X(0), Y(-1.45)); g.lineTo(X(0), Y(1.45));
  g.stroke();
  g.fillStyle = txtC; g.font = "700 11px sans-serif";
  g.fillText("x", X(1.45) - 4, Y(0) + 14); g.fillText("y", X(0) + 6, Y(1.45) + 4);
  g.fillText("O", X(0) - 14, Y(0) + 13);
  g.fillText("1", X(1) - 3, Y(0) + 13); g.fillText("−1", X(-1) - 12, Y(0) + 13);
  g.fillText("1", X(0) + 5, Y(1) + 4); g.fillText("−1", X(0) + 5, Y(-1) + 4);

  // trục tan x=1 và cot y=1
  const { c, s } = trigValues(trig.deg);
  if (trig.showTan) {
    g.save(); g.setLineDash([5, 4]);
    g.strokeStyle = isDark ? "rgba(232,121,249,.55)" : "rgba(192,38,211,.5)";
    g.lineWidth = 1.2; g.beginPath();
    g.moveTo(X(1), Y(-1.35)); g.lineTo(X(1), Y(1.35));   // trục tan
    g.moveTo(X(-1.35), Y(1)); g.lineTo(X(1.35), Y(1));   // trục cot
    g.stroke(); g.restore();
    g.fillStyle = isDark ? "#e879f9" : "#a21caf"; g.font = "600 10px sans-serif";
    g.fillText("tan", X(1) + 4, Y(1.3)); g.fillText("cot", X(1.05), Y(1) - 5);
  }

  // đường tròn đơn vị — vẽ dần theo buildT (0→1)
  const bt = clamp(trig.buildT ?? 1, 0, 1);
  g.strokeStyle = isDark ? "#a5b4fc" : "#4f46e5"; g.lineWidth = 2.2;
  g.beginPath();
  if (bt >= 0.999) g.arc(cx, cy, R, 0, Math.PI * 2);
  else if (bt > 0.001) g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + bt * Math.PI * 2);
  g.stroke();
  const bar = document.getElementById("trigBuildBar");
  if (bar) bar.style.width = Math.round(bt * 100) + "%";
  const showRest = bt > 0.55; // tia OM / M / chiếu chỉ hiện khi vòng tròn vẽ được hơn nửa

  // cung góc α
  const a = trigRad(trigNorm360(trig.deg));
  g.strokeStyle = "#fbbf24"; g.lineWidth = 3; g.beginPath();
  g.arc(cx, cy, 26, 0, -a, a > 0 ? true : false); g.stroke();
  g.fillStyle = "#fbbf24"; g.font = "700 11px sans-serif";
  g.fillText("α", cx + 32 * Math.cos(-a / 2) - 3, cy + 32 * Math.sin(-a / 2) + 4);

  // điểm M
  const mx = c, my = s;
  if (!showRest) {
    g.fillStyle = txtC; g.font = "600 11px sans-serif";
    g.fillText("Đang vẽ vòng tròn… " + Math.round(bt * 100) + "%", cx - 62, cy + R + 18);
    updateTrigNumbers();
    return;
  }
  // tia OM
  g.strokeStyle = "#38bdf8"; g.lineWidth = 2; g.beginPath();
  g.moveTo(cx, cy); g.lineTo(X(mx), Y(my)); g.stroke();
  // kéo dài OM cắt trục tan (minh họa tan)
  if (trig.showTan && Math.abs(c) > 1e-9) {
    const t = 1 / c; // scale để x=1
    if (Math.abs(my * t) < 1.4) {
      g.save(); g.setLineDash([4, 3]);
      g.strokeStyle = "rgba(232,121,249,.8)"; g.lineWidth = 1.4; g.beginPath();
      g.moveTo(X(mx), Y(my)); g.lineTo(X(1), Y(my * t)); g.stroke(); g.restore();
      g.fillStyle = "#e879f9"; g.beginPath(); g.arc(X(1), Y(my * t), 3.5, 0, 7); g.fill();
      g.fillText("T", X(1) + 5, Y(my * t) - 4);
    }
  }
  // hình chiếu + tam giác vuông
  if (trig.showProj) {
    g.save(); g.setLineDash([4, 3]);
    g.strokeStyle = "#34d399"; g.lineWidth = 1.5; g.beginPath();
    g.moveTo(X(mx), Y(my)); g.lineTo(X(mx), Y(0));   // xuống Ox (sin)
    g.moveTo(X(mx), Y(my)); g.lineTo(X(0), Y(my));   // sang Oy (cos)
    g.stroke(); g.restore();
    // tam giác O-H-M
    g.fillStyle = "rgba(56,189,248,.14)"; g.beginPath();
    g.moveTo(cx, cy); g.lineTo(X(mx), Y(0)); g.lineTo(X(mx), Y(my)); g.closePath(); g.fill();
    // đoạn cos (đỏ) trên Ox, sin (xanh) đứng
    g.lineWidth = 3.5; g.lineCap = "round";
    g.strokeStyle = "#fb7185"; g.beginPath(); g.moveTo(cx, cy); g.lineTo(X(mx), Y(0)); g.stroke();
    g.strokeStyle = "#34d399"; g.beginPath(); g.moveTo(X(mx), Y(0)); g.lineTo(X(mx), Y(my)); g.stroke();
    g.fillStyle = txtC; g.font = "600 10px sans-serif";
    g.fillText("cos", (cx + X(mx)) / 2 - 8, Y(0) + 13);
    g.fillText("sin", X(mx) + 5, (Y(0) + Y(my)) / 2);
  }
  // điểm M
  g.save(); g.shadowColor = "#38bdf8"; g.shadowBlur = 10;
  g.fillStyle = "#38bdf8"; g.beginPath(); g.arc(X(mx), Y(my), 6, 0, 7); g.fill();
  g.shadowBlur = 0; g.fillStyle = "#fff"; g.beginPath(); g.arc(X(mx), Y(my), 2.2, 0, 7); g.fill();
  g.restore();
  g.fillStyle = isDark ? "#fff" : "#0f172a"; g.font = "700 11px sans-serif";
  g.fillText(`M(${trigFmt(c)}, ${trigFmt(s)})`, X(mx) + 9, Y(my) - 9);

  // phần tư + dấu
  g.fillStyle = isDark ? "rgba(214,210,250,.55)" : "rgba(100,116,139,.9)";
  g.font = "600 10px sans-serif";
  g.fillText("Q1 (+,+)", X(0.55), Y(0.85)); g.fillText("Q2 (−,+)", X(-1.15), Y(0.85));
  g.fillText("Q3 (−,−)", X(-1.15), Y(-0.75)); g.fillText("Q4 (+,−)", X(0.55), Y(-0.75));

  // sóng mini bên phải — sin hoặc cos theo trig.waveFunc
  if (trig.showWave) {
    const isCos = trig.waveFunc === "cos";
    const wx = X(1.55), ww = size - wx - 10, wh = R * 1.7;
    const wy = cy;
    const wVal = isCos ? c : s;
    const wColor = isCos ? "#38bdf8" : "#34d399";
    g.strokeStyle = grid; g.strokeRect(wx, wy - wh / 2, ww, wh);
    g.strokeStyle = axisC; g.lineWidth = 1; g.beginPath();
    g.moveTo(wx, wy); g.lineTo(wx + ww, wy); g.stroke();
    g.strokeStyle = wColor; g.lineWidth = 1.8; g.beginPath();
    const wMax = Math.floor(80 * bt);
    for (let i = 0; i <= wMax; i++) {
      const xx = (i / 80) * Math.PI * 2;
      const px = wx + (xx / (Math.PI * 2)) * ww;
      const py = wy - (isCos ? Math.cos(xx) : Math.sin(xx)) * (wh / 2 - 4);
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
    // vạch vị trí α hiện tại trên sóng
    const cur = ((trigNorm360(trig.deg) % 360) / 360) * ww;
    g.strokeStyle = "#fbbf24"; g.setLineDash([3, 3]); g.beginPath();
    g.moveTo(wx + cur, wy - wh / 2); g.lineTo(wx + cur, wy + wh / 2); g.stroke();
    g.setLineDash([]);
    g.fillStyle = wColor; g.beginPath(); g.arc(wx + cur, wy - wVal * (wh / 2 - 4), 3.5, 0, 7); g.fill();
    g.fillStyle = txtC; g.font = "600 9px sans-serif";
    g.fillText(isCos ? "cos" : "sin", wx + 3, wy - wh / 2 - 4);
  }

  // cập nhật số
  updateTrigNumbers();
}
function setTrigRad(rad) {
  if (!isFinite(rad)) return;
  setTrigDeg(rad * 180 / Math.PI);
}
function trigBuildPlay() {
  if (trig.building) return;
  trig.building = true;
  trig.buildT = 0;
  const btn = $("#trigBuildBtn");
  if (btn) { btn.textContent = "⏳ Đang vẽ…"; btn.disabled = true; }
  const t0 = performance.now(), dur = 2200;
  const step = (t) => {
    trig.buildT = clamp((t - t0) / dur, 0, 1);
    drawTrigCircle();
    if (trig.buildT < 1) requestAnimationFrame(step);
    else {
      trig.building = false;
      if (btn) { btn.textContent = "▶ Vẽ dần"; btn.disabled = false; }
      drawTrigCircle();
    }
  };
  requestAnimationFrame(step);
}
function updateTrigNumbers() {
  const v = trigValues(trig.deg);
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = trigFmt(val); };
  set("trigCos", v.c); set("trigSin", v.s); set("trigTan", v.tan); set("trigCot", v.cot);
  const sl = $("#trigSlider"), dg = $("#trigDeg"), rd = $("#trigRad");
  const n = Math.round(trigNorm360(trig.deg));
  const radVal = Math.round(trigNorm360(trig.deg) * Math.PI / 180 * 1000) / 1000;
  if (sl && document.activeElement !== sl) sl.value = String(n);
  if (dg && document.activeElement !== dg) dg.value = String(Math.round(trig.deg * 10) / 10);
  if (rd && document.activeElement !== rd) rd.value = String(radVal);
  const ex = $("#trigExact");
  if (ex) {
    const key = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 270, 315].reduce((best, k) =>
      Math.abs(trigNorm360(trig.deg) - k) < Math.abs(trigNorm360(trig.deg) - best) ? k : best, 0);
    const info = TRIG_EXACT[key];
    const near = Math.abs(trigNorm360(trig.deg) - key) < 0.6;
    const rad = (trigNorm360(trig.deg) * Math.PI / 180).toFixed(3);
    ex.textContent = near && info
      ? `α = ${key}° = ${info.rad} · cos = ${info.cos} · sin = ${info.sin}`
      : `α = ${(Math.round(trig.deg * 10) / 10)}° = ${rad} rad · phần tư ${trigQuadrant(trig.deg)}`;
  }
  $$("#trigSpecial button").forEach(b => b.classList.toggle("is-active", Math.abs(trigNorm360(trig.deg) - parseFloat(b.dataset.deg)) < 0.6));
}
function trigQuadrant(d) {
  const n = trigNorm360(d);
  if (n === 0 || n === 90 || n === 180 || n === 270) return "trục";
  if (n < 90) return "I (sin+, cos+)";
  if (n < 180) return "II (sin+, cos−)";
  if (n < 270) return "III (sin−, cos−)";
  return "IV (sin−, cos+)";
}
function setTrigDeg(d, fromSlider) {
  trig.deg = ((d % 360) + 360) % 360;
  if (trig.deg === 0 && d > 0 && fromSlider !== true) trig.deg = 0;
  drawTrigCircle();
}
function trigTick(ts) {
  if (trig.playing) {
    if (!trig.lastT) trig.lastT = ts;
    const dt = (ts - trig.lastT) / 1000;
    trig.lastT = ts;
    trig.deg = (trig.deg + trig.speed * dt) % 360;
    drawTrigCircle();
  } else trig.lastT = 0;
  requestAnimationFrame(trigTick);
}

/* ============================================================================
   MARKUS — trợ lý AI toán học (điểm đột phá của dự án)
   - Gọi TRỰC TIẾP Gemini native: POST
     https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
     header `x-goog-api-key: <key>` (key AQ. thế hệ mới BẮT BUỘC đi đường native,
     không dùng OpenAI-compatible — sẽ 400/401).
   - Key + model lưu localStorage, test kết nối trong pane.
   - Mất mạng / key lỗi / CORS → Markus offline (engine toán nội bộ) vẫn trả lời,
     nên demo KHKT không bao giờ "chết".
   - Markus vẽ được lên đồ thị: mọi biểu thức trong khối ```mm ... ``` sẽ tự
     thực thi qua addObject (tối đa 3/khúc trả lời).
   ============================================================================ */
const MARKUS_DEFAULT_KEY = "";
const markusStore = {
  loadCfg() {
    try {
      const c = JSON.parse(localStorage.getItem("mind-math-markus") || "null") || {};
      // di trú model cũ đã bị Google khai tử (2.0/1.5/2.5-flash) sang model sống
      if (!c.model || /^(gemini-(1\.5-flash|2\.0-flash|2\.5-flash))$/.test(c.model)) c.model = "gemini-3.6-flash";
      return { model: "gemini-3.6-flash", key: MARKUS_DEFAULT_KEY, ...c };
    } catch { return { model: "gemini-3.6-flash", key: MARKUS_DEFAULT_KEY }; }
  },
  saveCfg(c) { try { localStorage.setItem("mind-math-markus", JSON.stringify(c)); } catch {} },
  loadHist() { try { return JSON.parse(localStorage.getItem("mind-math-markus-hist") || "[]"); } catch { return []; } },
  saveHist(h) { try { localStorage.setItem("mind-math-markus-hist", JSON.stringify(h.slice(-30))); } catch {} },
};
let markusCfg = markusStore.loadCfg();
let markusHist = markusStore.loadHist(); // [{role:'user'|'markus', text, offline}]
let markusBusy = false;

function markusContextText() {
  const objs = state.objects.filter(o => !o.error).slice(-8)
    .map(o => `${o.name}=${o.expr}`).join("; ") || "chưa có đối tượng";
  const sel = state.objects.find(o => o.id === state.selectedId);
  const v = trigValues(trig.deg);
  return `Chế độ: ${state.mode === "3d" ? "3D" : "2D"} (${state.opts.theme}). ` +
    `Đối tượng: ${objs}. Đang chọn: ${sel ? sel.name + "=" + sel.expr : "không"}. ` +
    `Góc lượng giác α=${Math.round(trigNorm360(trig.deg))}° (cos=${trigFmt(v.c)}, sin=${trigFmt(v.s)}).`;
}
function refreshMarkusContext() {
  const el = $("#markusContext");
  if (el) el.textContent = "◉ " + markusContextText();
}
function markusSetStatus(mode, label) {
  const el = $("#markusStatus");
  if (!el) return;
  el.classList.toggle("off", mode === "off");
  el.innerHTML = `<i></i>${escapeHtml(label)}`;
}
function markusEscapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
/* Fallback đọc được khi không có KaTeX / offline: LaTeX -> HTML gọn đẹp */
function markusPrettyTex(raw, display) {
  let h = escapeHtml(String(raw ?? ""));
  const BR = "§BR§";
  h = h.replace(/\\\\/g, BR);
  // bỏ lệnh trình bày
  h = h.replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle|limits|nonumber)\b/g, "");
  h = h.replace(/\\(?:left|right|big|Big|bigg|Bigg)\s*(.)/g, "$1");
  h = h.replace(/\\(?:,|;|:|!|quad|qquad|\s)/g, " ");
  // \text{...}, \mathrm{...}... -> giữ nội dung
  for (let k = 0; k < 6; k++) {
    let changed = false;
    h = h.replace(/\\(?:text|mathrm|mathbf|mathit|boldsymbol|operatorname|mathrm)\{([^{}]*)\}/g, (m, inner) => { changed = true; return inner; });
    if (!changed) break;
  }
  // \frac{a}{b} + \sqrt: lặp chung để phân số lồng căn (vd \frac{-b\pm\sqrt{b^2-4ac}}{2a}) vẫn ra
  for (let k = 0; k < 10; k++) {
    const before = h;
    h = h.replace(/\\sqrt\[([^{}]*)\]\{([^{}]*)\}/g, (m, n, a) => `<sup>${n}</sup>√<span class="mk-root">${a}</span>`);
    h = h.replace(/\\sqrt\{([^{}]*)\}/g, (m, a) => `√<span class="mk-root">${a}</span>`);
    h = h.replace(/\\(?:d?frac|cfrac)\{([^{}]*)\}\{([^{}]*)\}/g, (m, a, b) =>
      `<span class="mk-frac"><span class="mk-num">${a}</span><span class="mk-den">${b}</span></span>`);
    if (h === before) break;
  }
  h = h.replace(/\\pmod\{([^{}]*)\}/g, "(mod $1)");
  h = h.replace(/\\(?:pod|mod|bmod)\b/g, " mod ");
  // mũ / chỉ số: ^{...}, _{...}, ^x, _x (lặp để lồng nhau)
  for (let k = 0; k < 6; k++) {
    let c = false;
    h = h.replace(/\^\{([^{}]*)\}/g, (m, a) => { c = true; return `<sup>${a}</sup>`; });
    h = h.replace(/_\{([^{}]*)\}/g, (m, a) => { c = true; return `<sub>${a}</sub>`; });
    if (!c) break;
  }
  h = h.replace(/\^([A-Za-z0-9α-ωΑ-Ω+\-])/g, "<sup>$1</sup>");
  h = h.replace(/_([A-Za-z0-9+\-])/g, "<sub>$1</sub>");
  const MAP = {
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ",
    eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
    nu: "ν", xi: "ξ", pi: "π", varpi: "ϖ", rho: "ρ", varrho: "ϱ", sigma: "σ",
    varsigma: "ς", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ",
    psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ",
    Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
    equiv: "≡", ne: "≠", neq: "≠", approx: "≈", simeq: "≃", sim: "∼", cong: "≅",
    propto: "∝", le: "≤", leq: "≤", ge: "≥", geq: "≥", ll: "≪", gg: "≫",
    pm: "±", mp: "∓", times: "×", cdot: "·", div: "÷", ast: "∗", star: "★",
    circ: "∘", bullet: "•", oplus: "⊕", otimes: "⊗", perp: "⊥", parallel: "∥",
    angle: "∠", triangle: "△", to: "→", rightarrow: "→", leftarrow: "←",
    Rightarrow: "⇒", Leftarrow: "⇐", Leftrightarrow: "⇔", leftrightarrow: "↔",
    mapsto: "↦", implies: "⇒", iff: "⇔", forall: "∀", exists: "∃",
    in: "∈", notin: "∉", ni: "∋", subset: "⊂",subseteq: "⊆", supset: "⊃",
    supseteq: "⊇", cup: "∪", cap: "∩", setminus: "∖", emptyset: "∅", varnothing: "∅",
    infty: "∞", partial: "∂", nabla: "∇", sum: "∑", prod: "∏", int: "∫", oint: "∮",
    ldots: "…", cdots: "⋯", vdots: "⋮", ddots: "⋱", dots: "…",
  };
  h = h.replace(/\\([A-Za-z]+)/g, (m, name) => {
    if (MAP[name] !== undefined) {
      if (/^(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|lg|exp|min|max|sup|inf|lim|det|gcd|deg)$/.test(name))
        return `<span class="mk-op">${MAP[name] || name}</span>`;
      return MAP[name];
    }
    if (/^(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|lg|exp|min|max|sup|inf|lim|det|gcd|deg)$/.test(name))
      return `<span class="mk-op">${name}</span>`;
    return name + " ";
  });
  h = h.replace(/\\([{}%$#_&])/g, "$1");
  h = h.replace(/[{}]/g, "");
  h = h.replace(/&amp;/g, "&nbsp;&nbsp;");
  h = h.replace(new RegExp(BR, "g"), display ? "<br>" : " ; ");
  h = h.replace(/\s+/g, " ").trim();
  return h || "·";
}
function markusTypeset(root) {
  try {
    const scope = root || document;
    if (!scope.querySelectorAll || !window.katex || !window.katex.render) return;
    scope.querySelectorAll(".mk-tex[data-tex]").forEach((el) => {
      if (el.dataset.done) return;
      const tex = el.getAttribute("data-tex") || "";
      if (!tex) return;
      try {
        window.katex.render(tex, el, { displayMode: el.dataset.display === "1", throwOnError: false, strict: false, trust: true });
        el.dataset.done = "1";
      } catch {}
    });
  } catch {}
}
function markusMd(src) {
  // markdown-lite + LaTeX ($..$, $$..$$, \(..\), \[..\]) -> HTML đẹp như AI mode
  const codes = [], maths = [];
  let t = String(src ?? "");
  t = t.replace(/```mm\s*([\s\S]*?)```/g, (m, code) => { codes.push({ k: "mm", code }); return `__MKCODE${codes.length - 1}__`; });
  t = t.replace(/```([\s\S]*?)```/g, (m, code) => { codes.push({ k: "code", code }); return `__MKCODE${codes.length - 1}__`; });
  t = t.replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => { if (!tex.trim()) return m; maths.push({ tex: tex.trim(), display: true }); return `__MKMATH${maths.length - 1}__`; });
  t = t.replace(/\\\[([\s\S]+?)\\\]/g, (m, tex) => { if (!tex.trim()) return m; maths.push({ tex: tex.trim(), display: true }); return `__MKMATH${maths.length - 1}__`; });
  t = t.replace(/\\\(([\s\S]+?)\\\)/g, (m, tex) => { if (!tex.trim()) return m; maths.push({ tex: tex.trim(), display: false }); return `__MKMATH${maths.length - 1}__`; });
  t = t.replace(/\$([^$]{1,800}?)\$/g, (m, tex) => { if (!tex || !tex.trim()) return m; maths.push({ tex: tex.trim(), display: false }); return `__MKMATH${maths.length - 1}__`; });
  t = escapeHtml(t);
  t = t.replace(/`([^`\n]+?)`/g, (m, c) => `<code>${c}</code>`);
  t = t.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  t = t.replace(/(^|[^*])\*([^*\n]+?)\*/g, "$1<i>$2</i>");
  const lines = t.split("\n");
  let html = "", inUl = false, inOl = false;
  const flush = () => { if (inUl) { html += "</ul>"; inUl = false; } if (inOl) { html += "</ol>"; inOl = false; } };
  for (const rawLn of lines) {
    const ln = rawLn.trim();
    if (!ln) { flush(); continue; }
    const hm = ln.match(/^(#{1,4})\s+(.*)$/);
    if (hm) { flush(); html += `<div class="mk-h">${hm[2]}</div>`; continue; }
    const om = ln.match(/^(\d+)[.)]\s+(.*)$/);
    if (om) { if (inUl) { html += "</ul>"; inUl = false; } if (!inOl) { html += "<ol>"; inOl = true; } html += `<li>${om[2]}</li>`; continue; }
    const um = ln.match(/^(?:[-*•+]|&gt;)\s+(.*)$/);
    if (um) { if (inOl) { html += "</ol>"; inOl = false; } if (!inUl) { html += "<ul>"; inUl = true; } html += `<li>${um[1]}</li>`; continue; }
    flush();
    html += ln + "<br>";
  }
  flush();
  html = html.replace(/(<br>)+$/, "");
  html = html.replace(/__MKMATH(\d+)__/g, (m, i) => {
    const it = maths[+i]; if (!it) return "";
    const attr = markusEscapeAttr(it.tex);
    const fb = markusPrettyTex(it.tex, it.display);
    if (it.display) return `<div class="mk-math-block"><span class="mk-tex" data-tex="${attr}" data-display="1">${fb}</span></div>`;
    return `<span class="mk-math"><span class="mk-tex" data-tex="${attr}" data-display="0">${fb}</span></span>`;
  });
  html = html.replace(/__MKCODE(\d+)__/g, (m, i) => {
    const c = codes[+i]; if (!c) return "";
    if (c.k === "mm") {
      const short = escapeHtml(c.code.trim().split("\n").slice(0, 3).join(" · ").slice(0, 120));
      return `<div class="markus-drawcard ok">✏️ Lệnh vẽ: <code>${short}</code></div>`;
    }
    return `<code>${escapeHtml(c.code.trim().slice(0, 300))}</code>`;
  });
  html = html.replace(/(<\/(div|ul|ol)>)(<br>)+/g, "$1");
  return html;
}
function renderMarkusChat() {
  const box = $("#markusChat");
  if (!box) return;
  box.innerHTML = "";
  if (!markusHist.length) {
    markusHist.push({ role: "markus", text: "Chào bạn, tôi là **Markus** — trợ lý toán học của Mind Math. Tôi thấy toàn bộ đồ thị của bạn và có thể **vẽ hình, giải thích, tìm nghiệm, ra đề đố vui**. Hỏi tôi bất cứ gì nhé!", offline: true });
  }
  for (const m of markusHist) {
    const row = document.createElement("div");
    row.className = "markus-msg " + (m.role === "user" ? "user" : "ai");
    row.innerHTML = (m.role === "user" ? "" : `<span class="markus-avatar"></span>`) +
      `<div class="markus-bubble${m.offline && m.role === "markus" ? " offline" : ""}">${markusMd(m.text)}` +
      (m.role === "markus" && m.offline ? `<div class="markus-src">Markus · offline — vẫn đầy đủ toán nội bộ</div>` : "") +
      (m.role === "markus" && !m.offline ? `<div class="markus-src">Markus · ${escapeHtml(markusCfg.model)}</div>` : "") +
      `</div>`;
    box.appendChild(row);
  }
  box.scrollTop = box.scrollHeight;
  try { markusTypeset(box); } catch {}
}
function markusApplyDrawings(text) {
  // thực thi khối ```mm ... ``` (mỗi dòng 1 biểu thức Mind Math)
  const out = [];
  const re = /```mm\s*([\s\S]*?)```/g;
  let m, n = 0;
  while ((m = re.exec(text)) && n < 3) {
    for (const line of m[1].split("\n")) {
      if (n >= 3) break;
      const expr = line.trim().replace(/^[-*]\s+/, "");
      if (!expr) continue;
      try {
        if (state.mode === "3d" && /^(cube|box|sphere|cyl|cone|pyramid|square|rect|disk|tri)\b/i.test(expr) === false
            && /^z\s*=/i.test(expr) === false && /^\(.*,,.*\)$/.test(expr) === false) {
          // mặt z=... và khối giữ nguyên 3D; còn lại vẫn vẽ được trong 3D — không ép đổi mode
        }
        const o = addObject(expr);
        out.push({ ok: true, msg: `Đã vẽ ${o.name}: ${o.expr}` });
      } catch (e) { out.push({ ok: false, msg: `"${expr}": ${e.message}` }); }
      n++;
    }
  }
  return out;
}
function markusShowDrawResults(res) {
  if (!res.length) return;
  const box = $("#markusChat");
  if (!box) return;
  const last = box.lastElementChild?.querySelector(".markus-bubble");
  if (!last) return;
  for (const r of res) {
    const d = document.createElement("div");
    d.className = "markus-drawcard " + (r.ok ? "ok" : "err");
    d.textContent = (r.ok ? "✅ " : "⚠️ ") + r.msg;
    last.appendChild(d);
  }
  box.scrollTop = box.scrollHeight;
  res.filter(r => r.ok).forEach(r => toast(r.msg, "ok"));
}
async function markusCallAPI(userText) {
  const model = (markusCfg.model || "gemini-3.6-flash").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const sys =
    `Bạn là Markus, trợ lý toán học tiếng Việt bên trong phần mềm Mind Math (đồ thị 2D/3D, ` +
    `đường tròn lượng giác, bảng giá trị, trang tính). Trả lời NGẮN GỌN, đúng trọng tâm, tiếng Việt. ` +
    `Bối cảnh đồ thị hiện tại: ${markusContextText()} ` +
    `QUY TẮC CÔNG THỨC (bắt buộc): mọi công thức toán phải dùng LaTeX chuẩn để app render đẹp: ` +
    `$...$ cho công thức trong dòng (ví dụ $2\\\\cos a\\\\sin\\\\frac{b}{2}$), $$...$$ cho công thức trưng bày riêng một dòng. ` +
    `Dùng \\\\frac{a}{b}, \\\\sqrt{}, ^, _, \\\\equiv, \\\\pmod, \\\\sin, \\\\cos. Mỗi bước giải trình bày: tiêu đề **Bước N: ...**, ` +
    `1-2 dòng giải thích, rồi gạch đầu dòng mỗi công thức một dòng. Không viết LaTeX trần ngoài $...$. ` +
    `QUY TẮC VẼ: khi muốn vẽ, đặt mỗi biểu thức một dòng trong đúng một khối \`\`\`mm ... \`\`\`. ` +
    `Biểu thức hợp lệ: hàm f(x) như x^2-2, sin(x); điểm (2,3); x=2; phương trình x^2+y^2=9; ` +
    `mặt 3D z=x^2+y^2; điểm 3D (1,2,3); khối cube(3), box(4,3,2), sphere(2), cyl(1.5,3), ` +
    `cone(1.8,3), pyramid(3,3); hình phẳng square(3), rect(4,2.5), disk(2), tri(3). ` +
    `Không nhét giải thích vào trong khối mm. Tối đa 3 biểu thức/lần.`;
  const contents = markusHist.slice(-8).filter(m => m.role === "user" || m.role === "markus")
    .map(m => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text.slice(0, 1500) }] }));
  contents.push({ role: "user", parts: [{ text: userText.slice(0, 2000) }] });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": markusCfg.key || "" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text || "").join("").trim();
    if (!text) throw new Error(data?.promptFeedback?.blockReason ? "Bị chặn an toàn: " + data.promptFeedback.blockReason : "API không trả lời.");
    return text;
  } finally { clearTimeout(timer); }
}
/* --- Markus offline: engine toán nội bộ, không cần mạng --- */
function markusOfflineReply(q) {
  const s = q.toLowerCase();
  const sel = state.objects.find(o => o.id === state.selectedId && !o.error)
    || state.objects.find(o => o.kind === "fn" && !o.error);
  // chào
  if (/^(chào|chao|hi|hello|hey|xin chào)/.test(s.trim()))
    return `Chào bạn! Tôi là **Markus** (đang offline vẫn phục vụ tốt). Tôi có thể:\n- **Vẽ**: nói "vẽ x^2-2" hoặc "vẽ sphere(2)"\n- **Giải thích** đồ thị đang có\n- **Tìm nghiệm / cực trị** hàm đang chọn\n- **Lượng giác**: hỏi "sin 30° bằng mấy?"\nBạn muốn bắt đầu từ đâu?`;
  // vẽ ...
  let mv = s.match(/(?:vẽ|ve|draw|vẽ giúp|vẽ cho)\s+(.+)/);
  if (mv) {
    let expr = q.slice(q.toLowerCase().indexOf(mv[1].slice(0, 8))).trim();
    expr = expr.replace(/[.!?]+$/, "");
    try {
      const o = addObject(expr);
      return `Xong! Tôi đã vẽ **${o.name}**: \`${o.expr}\`. Bạn có muốn tôi **giải thích** hình này không?`;
    } catch (e) { return `Tôi chưa vẽ được \`${expr}\` (${e.message}). Thử các mẫu: \`x^2-2\`, \`sin(x)\`, \`(2,3)\`, \`x^2+y^2=9\`, \`z=x^2+y^2\`, \`cube(3)\`, \`sphere(2)\`.`; }
  }
  // nghiệm / cực trị / phân tích
  if (/nghiệm|nghiem|cực trị|cuc tri|phân tích|phan tich|đạo hàm|dao ham|giải thích|giai thich|min|max|đỉnh|đáy/.test(s)) {
    if (!sel || sel.kind !== "fn") {
      const names = state.objects.filter(o => !o.error).map(o => o.name).join(", ") || "trống";
      return `Hiện chưa có hàm số nào được chọn (đang có: ${names}). Hãy thêm hàm, ví dụ nói với tôi: "vẽ x^3-3*x", rồi hỏi lại nhé!`;
    }
    const [a, b] = [-6, 6];
    const rs = findRoots(sel.fn, a, b).map(round2);
    const ex = findExtrema(sel.fn, a, b);
    let ans = `Phân tích **${sel.name}** = \`${sel.expr}\` trên [${a}, ${b}]:\n` +
      (rs.length ? `- **Nghiệm** (giao Ox): ${rs.join(", ")}\n` : `- Không thấy nghiệm trong khung này.\n`) +
      (ex.length ? `- **Cực trị**: ${ex.map(p => `${p.type === "max" ? "đại" : "tiểu"} tại (${round2(p.x)}, ${round2(p.y)})`).join("; ")}\n` : `- Không thấy cực trị rõ.\n`);
    try {
      rs.slice(0, 4).forEach(x => { try { markPoint(x, sel.fn(x), "#34d399"); } catch {} });
      ex.slice(0, 4).forEach(p => markPoint(p.x, p.y, "#fbbf24"));
      ans += `Tôi đã **đánh dấu** nghiệm (xanh) và cực trị (vàng) lên đồ thị cho bạn.`;
    } catch {}
    renderList($("#algebraSearch")?.value || ""); draw(); persist();
    return ans;
  }
  // lượng giác
  if (/sin|cos|tan|cot|lượng giác|luong giac|góc|goc|radian|độ/.test(s)) {
    const dm = s.match(/(\d+(?:\.\d+)?)\s*(?:°|độ|do|deg)?/);
    const deg = dm ? parseFloat(dm[1]) : trigNorm360(trig.deg);
    const v = trigValues(deg);
    return `Góc **${deg}°** = ${(deg * Math.PI / 180).toFixed(3)} rad:\n- cos = **${trigFmt(v.c)}**, sin = **${trigFmt(v.s)}**\n- tan = **${trigFmt(v.tan)}**, cot = **${trigFmt(v.cot)}**\nMở tab **Lượng giác** để xem điểm M trên vòng tròn nhé!`;
  }
  // 3D / khối
  if (/3d|khối|khoi|cầu|cau|trụ|tru|nón|non|chóp|chop|hộp|hop|lập phương|paraboloid|mặt/.test(s)) {
    try {
      if (state.mode !== "3d") setMode("3d");
      addObject("z = x^2 + y^2", { color: "#8b5cf6" });
      addObject("sphere(2)", { color: "#38bdf8" });
      return `Tôi đã chuyển sang **3D** và vẽ **paraboloid** \`z=x²+y²\` cùng **hình cầu** \`sphere(2)\`. Kéo để xoay, lăn chuột để zoom. Muốn thêm hộp/trụ/nón thì bảo tôi, ví dụ "vẽ box(4,3,2)".`;
    } catch (e) { return `Lệnh 3D mẫu: \`z=x^2+y^2\`, \`cube(3)\`, \`box(4,3,2)\`, \`sphere(2)\`, \`cyl(1.5,3)\`, \`cone(1.8,3)\`, \`pyramid(3,3)\`.`; }
  }
  // đố vui
  if (/đố|do vui|trắc nghiệm|trac nghiem|câu hỏi|quiz|kiểm tra|kiem tra|bài tập|bai tap/.test(s)) {
    if (sel && sel.kind === "fn") {
      const x0 = 2;
      let y0; try { y0 = round2(sel.fn(x0)); } catch { y0 = "?"; }
      return `Đố nhanh về **${sel.name}** = \`${sel.expr}\`:\n1. f(${x0}) bằng bao nhiêu? (đáp án: ${y0})\n2. Đồ thị cắt trục Oy tại điểm nào?\n3. Hàm này có cực trị không? Mở tab **Bảng** để kiểm chứng nhé!`;
    }
    return `Đố nhanh về lượng giác:\n1. sin 30° = ? (1/2)\n2. cos 60° = ? (1/2)\n3. tan 45° = ? (1)\nTrả lời rồi đối chiếu ở tab **Lượng giác** nhé!`;
  }
  // trợ giúp
  if (/giúp|giup|help|làm được|chức năng|hướng dẫn|huong dan/.test(s))
    return `Tôi giúp được:\n- **Vẽ**: "vẽ x^2-2", "vẽ sphere(2)"\n- **Phân tích**: "tìm nghiệm và cực trị"\n- **Giải thích** đồ thị hiện tại\n- **Lượng giác**: "sin 45° bằng mấy"\n- **3D**: "vẽ khối mẫu"\n- **Đố vui**: "ra 3 câu trắc nghiệm"\nCứ nói tự nhiên nhé!`;
  // mặc định: tóm tắt trạng thái
  const names = state.objects.filter(o => !o.error).map(o => `${o.name}=${o.expr}`).join("; ") || "chưa có gì";
  return `Tôi (offline) hiểu bạn đang hỏi về "${q.slice(0, 80)}". Trên màn hình hiện có: ${names}. ` +
    `Thử: "giải thích đồ thị", "tìm nghiệm và cực trị", "vẽ sphere(2)" hoặc "ra 3 câu trắc nghiệm". ` +
    `Có mạng + key hợp lệ thì tôi trả lời tự do đầy đủ hơn.`;
}
function markusTypewriter(el, fullText, done) {
  const plain = fullText;
  let i = 0;
  el.innerHTML = "";
  const step = () => {
    i = Math.min(plain.length, i + Math.max(1, Math.round(plain.length / 60)));
    el.textContent = plain.slice(0, i);
    const box = $("#markusChat"); if (box) box.scrollTop = box.scrollHeight;
    if (i < plain.length) setTimeout(step, 18);
    else done && done();
  };
  step();
}
async function markusSend(text) {
  const input = $("#markusInput");
  const raw = (text ?? input?.value ?? "").trim();
  if (!raw || markusBusy) return;
  markusBusy = true;
  const sendBtn = $("#markusSend"); if (sendBtn) sendBtn.disabled = true;
  markusHist.push({ role: "user", text: raw });
  markusStore.saveHist(markusHist);
  renderMarkusChat();
  if (input) { input.value = ""; input.style.height = "auto"; }
  refreshMarkusContext();
  // bong bóng "đang nghĩ"
  const box = $("#markusChat");
  const think = document.createElement("div");
  think.className = "markus-msg ai"; think.id = "markusThinking";
  think.innerHTML = `<span class="markus-avatar"></span><div class="markus-bubble"><span class="markus-typing"><i></i><i></i><i></i></span></div>`;
  box.appendChild(think); box.scrollTop = box.scrollHeight;
  let reply, offline = false;
  if (!markusCfg.key) {
    reply = markusOfflineReply(raw); offline = true;
    markusSetStatus("off", "offline");
  } else {
    try {
      reply = await markusCallAPI(raw);
      markusSetStatus("on", "online");
    } catch (e) {
      reply = `⚠️ Gọi Gemini lỗi (${e.message}). Tôi trả lời offline nhé:\n\n` + markusOfflineReply(raw);
      offline = true;
      markusSetStatus("off", "offline");
    }
  }
  think.remove();
  markusHist.push({ role: "markus", text: reply, offline });
  markusStore.saveHist(markusHist);
  // hiệu ứng gõ chữ rồi mới render markdown + thực thi vẽ
  const row = document.createElement("div");
  row.className = "markus-msg ai";
  row.innerHTML = `<span class="markus-avatar"></span><div class="markus-bubble${offline ? " offline" : ""}"></div>`;
  box.appendChild(row);
  const bubble = row.querySelector(".markus-bubble");
  markusTypewriter(bubble, reply, () => {
    bubble.innerHTML = markusMd(reply) +
      (offline ? `<div class="markus-src">Markus · offline — vẫn đầy đủ toán nội bộ</div>`
               : `<div class="">Markus · ${escapeHtml(markusCfg.model)}</div>`);
    box.scrollTop = box.scrollHeight;
    try { markusTypeset(bubble); } catch {}
    try { markusShowDrawResults(markusApplyDrawings(reply)); } catch (e) { toast(e.message, "err"); }
    refreshMarkusContext();
  });
  markusBusy = false;
  if (sendBtn) sendBtn.disabled = false;
  input?.focus();
}

/* ---------------- boot ---------------- */
function seed() {
  const saved = store.load();
  if (saved) {
    try {
      state.seq = saved.seq || 0; colorIdx = saved.colorIdx || 0;
      Object.assign(state.view, saved.view || {});
      Object.assign(state.view3d, saved.view3d || {});
      Object.assign(state.opts, { theme: "light", mesh3d: true, spin3d: false, quality3d: 32, animate: true, animDur: 1.4 }, saved.opts || {});
      if (saved.mode === "3d" || saved.mode === "2d") state.mode = saved.mode;
      if (saved?.objects?.length) {
        state.objects = saved.objects.map(rehydrate);
        state.selectedId = state.objects[state.objects.length - 1]?.id ?? null;
        return;
      }
    } catch {}
  }
  // mặc định theme sáng (nền trắng) theo yêu cầu
  if (!state.opts.theme) state.opts.theme = "light";
  // hash-shared state (#mm=...) support
  if (location.hash.includes("mm=")) {
    try {
      const arr = JSON.parse(decodeURIComponent(escape(atob(location.hash.split("mm=")[1]))));
      if (Array.isArray(arr) && arr.length) {
        state.objects = arr.map((o, i) => { state.seq = i + 1; return rehydrate({ ...o, visible: o.visible !== false }); });
        state.selectedId = state.objects[state.objects.length - 1].id;
        return;
      }
    } catch {}
  }
  // default demo workspace (high-contrast curves)
  for (const [expr, color] of [["x^2 - 2", "#8b5cf6"], ["sin(x)", "#38bdf8"], ["0.5*x + 1", "#34d399"]]) {
    try {
      const p = parseCommand(expr); state.seq += 1;
      const letter = FN_LETTERS[(state.seq - 1) % FN_LETTERS.length];
      state.objects.push({ id: "seed" + state.seq, name: `${letter}(x)`, expr, color, visible: true, ...p, error: null, born: 0 });
      colorIdx++;
    } catch {}
  }
  state.selectedId = state.objects[0]?.id ?? null;
  snapshot();
}

function syncSettingsUI() {
  $("#setMinor").checked = state.opts.minor; $("#setLabels").checked = state.opts.labels;
  $("#setGlow").checked = state.opts.glow; $("#setWave").checked = state.opts.wave;
  const m3 = $("#setMesh3d"); if (m3) m3.checked = state.opts.mesh3d !== false;
  const sp = $("#setSpin3d"); if (sp) sp.checked = !!state.opts.spin3d;
  const q3 = $("#setQuality3d"); if (q3) { q3.value = state.opts.quality3d || 32; $("#q3Val").textContent = state.opts.quality3d || 32; }
  const an = $("#setAnimate"); if (an) an.checked = state.opts.animate !== false;
  const ad = $("#setAnimDur"); if (ad) { ad.value = state.opts.animDur || 1.4; $("#animVal").textContent = Number(state.opts.animDur || 1.4).toFixed(1); }
  $("#setGrid").value = state.opts.gridStep; $("#gridVal").textContent = Number(state.opts.gridStep).toFixed(1);
  $("#setThick").value = state.opts.thick; $("#thickVal").textContent = Number(state.opts.thick).toFixed(1);
  $("#atmosphere").style.display = state.opts.wave ? "" : "none";
  document.body.dataset.theme = state.opts.theme || "light";
  $$("[data-theme-btn]").forEach(b => b.classList.toggle("is-active", b.dataset.themeBtn === document.body.dataset.theme));
  $$("#modeSwitch button").forEach(b => b.classList.toggle("is-active", b.dataset.mode === state.mode));
  const bar = $("#view3dBar"); if (bar) bar.hidden = state.mode !== "3d";
  $$('#view3dBar [data-v3="mesh"]').forEach(x => x.classList.toggle("is-active", state.opts.mesh3d !== false));
  $$('#view3dBar [data-v3="spin"]').forEach(x => x.classList.toggle("is-active", !!state.opts.spin3d));
}
// vòng tự xoay cho trình bày 3D
function spinLoop() {
  if (state.mode === "3d" && state.opts.spin3d) {
    state.view3d.az += 0.008;
    draw();
  }
  requestAnimationFrame(spinLoop);
}

seed();
bindChrome();
syncSettingsUI();
renderList();
refreshTableSelect();
resize();
setTool("move");
setTheme(state.opts.theme || "light");
setMode(state.mode || "2d");
try { drawTrigCircle(); } catch {}
requestAnimationFrame(spinLoop);
requestAnimationFrame(trigTick);
try {
  const _mkModel = $("#markusModel"); if (_mkModel) _mkModel.value = markusCfg.model || "gemini-3.6-flash";
  const _mkKey = $("#markusKey"); if (_mkKey) _mkKey.value = markusCfg.key || "";
  renderMarkusChat(); refreshMarkusContext();
  markusSetStatus(markusCfg.key ? "on" : "off", markusCfg.key ? "online" : "offline");
} catch {}

})();


