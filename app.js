/* ============================================================================
   MIND MATH — interactive scientific workspace engine
   - Canvas coordinate-plane renderer (pan / zoom / trace)
   - Expression parser: functions f(x), points, vertical lines, implicit f(x,y)=0
   - Tools: move / point / line / circle (cụm Phân tích đã gỡ khỏi web)
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
  /* tham số thanh trượt GeoGebra (a, b, c…) — thay bằng giá trị trước khi biên dịch */
  if (state.params) {
    for (const k of Object.keys(state.params).sort()) {
      if (!/^[a-zA-Z]$/.test(k) || /[eEiIxXyY]/.test(k)) continue;
      const v = Number(state.params[k]);
      if (!isFinite(v)) continue;
      s = s.replace(new RegExp("\\b" + k + "\\b", "g"), "(" + v + ")");
    }
  }
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
  // tham số thanh trượt GeoGebra: a = 2 (một chữ cái, trừ x/y/z) — trước mọi strip
  const pm0 = s.match(/^\s*([a-wA-W])\s*=\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (pm0 && !/^[xXyYzZ]$/.test(pm0[1])) {
    const pname = pm0[1].toLowerCase();
    return { kind: "param", pname, pvalue: parseFloat(pm0[2]), label: original };
  }
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

  // ---- hình học phẳng GeoGebra: segment / ray / vector / polygon / angle / text / arc / sector / ellipse / hyperbola / image ----
  const gnum = "(-?\\d+(?:\\.\\d+)?)";
  const gnums = (str, n) => {
    const m = String(str).trim().match(new RegExp("^\\(\\s*" + Array(n).fill(gnum).join("\\s*,\\s*") + "\\s*\\)$"));
    return m ? m.slice(1, n + 1).map(parseFloat) : null;
  };
  const geoMatch = s.match(/^([a-zA-Z]+)\s*([\s\S]*)$/);
  if (geoMatch) {
    const gname = geoMatch[1].toLowerCase(), garg = geoMatch[2].trim();
    let g = null;
    if (["segment", "doan", "doanthang"].includes(gname) && (g = gnums(garg, 4)))
      return { kind: "segment", x1: g[0], y1: g[1], x2: g[2], y2: g[3], label: original };
    if (["ray", "tia"].includes(gname) && (g = gnums(garg, 4)))
      return { kind: "ray", x1: g[0], y1: g[1], x2: g[2], y2: g[3], label: original };
    if (["vector", "vecto"].includes(gname) && (g = gnums(garg, 4)))
      return { kind: "vector", x1: g[0], y1: g[1], x2: g[2], y2: g[3], label: original };
    if (["arc", "cung", "cungtron"].includes(gname) && (g = gnums(garg, 5)))
      return { kind: "arc", cx: g[0], cy: g[1], r: Math.abs(g[2]) || 0.5, a0: g[3] * Math.PI / 180, a1: g[4] * Math.PI / 180, label: original };
    if (["sector", "quat", "hinhquat"].includes(gname) && (g = gnums(garg, 5)))
      return { kind: "sector", cx: g[0], cy: g[1], r: Math.abs(g[2]) || 0.5, a0: g[3] * Math.PI / 180, a1: g[4] * Math.PI / 180, label: original };
    if (["ellipse", "elip"].includes(gname) && (g = gnums(garg, 5)))
      return { kind: "ellipse", cx: g[0], cy: g[1], rx: Math.abs(g[2]) || 0.5, ry: Math.abs(g[3]) || 0.5, rot: (g[4] || 0) * Math.PI / 180, label: original };
    if (["hyperbola", "hypebon", "hyperbol"].includes(gname) && (g = gnums(garg, 5)))
      return { kind: "hyperbola", cx: g[0], cy: g[1], ra: Math.abs(g[2]) || 0.5, rb: Math.abs(g[3]) || 0.5, rot: (g[4] || 0) * Math.PI / 180, label: original };
    if (["angle", "goc"].includes(gname) && (g = gnums(garg, 6)))
      return { kind: "angle", ax: g[0], ay: g[1], bx: g[2], by: g[3], cx: g[4], cy: g[5], label: original };
    if (["polygon", "dagiac"].includes(gname)) {
      const pts = [];
      const re = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
      let m; while ((m = re.exec(garg)) !== null) pts.push([parseFloat(m[1]), parseFloat(m[2])]);
      if (pts.length >= 3) return { kind: "polygon", pts, label: original };
    }
    if (["text", "chu", "chuthich"].includes(gname)) {
      const tm = garg.match(/^\(\s*"([^"]{0,80})"\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/);
      if (tm) return { kind: "text", text: tm[1], x: parseFloat(tm[2]), y: parseFloat(tm[3]), label: original };
    }
    if (["image", "anh"].includes(gname)) {
      const im = garg.match(/^\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/);
      if (im) return { kind: "image", x: parseFloat(im[1]), y: parseFloat(im[2]), w: clamp(parseFloat(im[3]), 40, 640), label: original };
    }
  }

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

  // ---- MIND MATH 3D Construction Engine: lệnh số trực tiếp (cho command bar + Markus) ----
  // Cú pháp: line3d / seg3d / ray3d / vec3d / plane3d / circle3d / sphere3d / poly3d / cube3 / tetra3 / prism3 / pyramid3 / cyl3 / cone3
  const num3 = "(-?\\d+(?:\\.\\d+)?)";
  const nums3 = (str, n) => {
    const m = String(str).trim().match(new RegExp("^\\(\\s*" + Array(n).fill(num3).join("\\s*,\\s*") + "\\s*\\)$"));
    return m ? m.slice(1, n + 1).map(parseFloat) : null;
  };
  const cmd3 = s.match(/^([a-zA-Z][a-zA-Z0-9]*)\s*([\s\S]*)$/);
  if (cmd3) {
    const cn = cmd3[1].toLowerCase(), ca = cmd3[2].trim();
    let vv = null;
    const bad3 = () => { throw new Error("Tham số 3D không hợp lệ (số thực, bán kính > 0)."); };
    if (["line3d", "duong3d"].includes(cn) && (vv = nums3(ca, 6))) {
      if (Math.hypot(vv[3] - vv[0], vv[4] - vv[1], vv[5] - vv[2]) < 1e-9) bad3();
      return { kind: "line3d", a: [vv[0], vv[1], vv[2]], b: [vv[3], vv[4], vv[5]], label: original };
    }
    if (["seg3d", "segment3d", "doan3d"].includes(cn) && (vv = nums3(ca, 6))) {
      if (Math.hypot(vv[3] - vv[0], vv[4] - vv[1], vv[5] - vv[2]) < 1e-9) bad3();
      return { kind: "segment3d", a: [vv[0], vv[1], vv[2]], b: [vv[3], vv[4], vv[5]], label: original };
    }
    if (["ray3d", "tia3d"].includes(cn) && (vv = nums3(ca, 6))) {
      if (Math.hypot(vv[3] - vv[0], vv[4] - vv[1], vv[5] - vv[2]) < 1e-9) bad3();
      return { kind: "ray3d", a: [vv[0], vv[1], vv[2]], b: [vv[3], vv[4], vv[5]], label: original };
    }
    if (["vec3d", "vector3d", "vecto3d"].includes(cn) && (vv = nums3(ca, 6))) {
      if (Math.hypot(vv[3] - vv[0], vv[4] - vv[1], vv[5] - vv[2]) < 1e-9) bad3();
      return { kind: "vector3d", a: [vv[0], vv[1], vv[2]], b: [vv[3], vv[4], vv[5]], label: original };
    }
    if (["plane3d", "mp3d", "matphang"].includes(cn) && (vv = nums3(ca, 6))) {
      if (Math.hypot(vv[3], vv[4], vv[5]) < 1e-9) bad3();
      return { kind: "plane3d", origin: [vv[0], vv[1], vv[2]], normal: vv.slice(3, 6), label: original };
    }
    if (["circle3d", "tron3d", "duongtron3d"].includes(cn) && (vv = nums3(ca, 7))) {
      if (!(vv[3] > 0) || Math.hypot(vv[4], vv[5], vv[6]) < 1e-9) bad3();
      return { kind: "circle3d", center: [vv[0], vv[1], vv[2]], radius: vv[3], normal: vv.slice(4, 7), label: original };
    }
    if (["sphere3d", "cau3d", "matcau"].includes(cn) && (vv = nums3(ca, 4))) {
      if (!(vv[3] > 0)) bad3();
      return { kind: "sphere3d", center: [vv[0], vv[1], vv[2]], radius: vv[3], label: original };
    }
    if (["poly3d", "polygon3d", "dagiac3d"].includes(cn)) {
      const pts = [];
      const re = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
      let m; while ((m = re.exec(ca)) !== null) pts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
      if (pts.length >= 3) return { kind: "polygon3d", vertices: pts, label: original };
    }
    if (["cube3", "lapphuong3d"].includes(cn) && (vv = nums3(ca, 7))) {
      if (Math.hypot(vv[3] - vv[0], vv[4] - vv[1], vv[5] - vv[2]) < 1e-9 || !(vv[6] > 1e-9)) bad3();
      return { kind: "solid3", solid3: "cube", a: [vv[0], vv[1], vv[2]], b: [vv[3], vv[4], vv[5]], h: vv[6], label: original };
    }
    if (["tetra3", "tudien"].includes(cn) && (vv = nums3(ca, 6))) {
      if (Math.hypot(vv[3] - vv[0], vv[4] - vv[1], vv[5] - vv[2]) < 1e-9) bad3();
      return { kind: "solid3", solid3: "tetra", a: [vv[0], vv[1], vv[2]], b: [vv[3], vv[4], vv[5]], label: original };
    }
    if (["cyl3", "tru3d"].includes(cn) && (vv = nums3(ca, 7))) {
      if (Math.hypot(vv[3] - vv[0], vv[4] - vv[1], vv[5] - vv[2]) < 1e-9 || !(vv[6] > 0)) bad3();
      return { kind: "solid3", solid3: "cyl", a: [vv[0], vv[1], vv[2]], b: [vv[3], vv[4], vv[5]], r: vv[6], label: original };
    }
    if (["cone3", "non3d"].includes(cn) && (vv = nums3(ca, 7))) {
      if (Math.hypot(vv[3] - vv[0], vv[4] - vv[1], vv[5] - vv[2]) < 1e-9 || !(vv[6] > 0)) bad3();
      return { kind: "solid3", solid3: "cone", a: [vv[0], vv[1], vv[2]], b: [vv[3], vv[4], vv[5]], r: vv[6], label: original };
    }
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
  toolMem: {},       // bộ nhớ tạm riêng từng công cụ (chép kiểu, ảnh…)
  lastClick: null,   // {x,y} math
  params: {},        // tham số thanh trượt GeoGebra: {a: 1, b: 0.5…}
  opts: { minor: true, labels: true, glow: true, gridStep: 1, thick: 2.5,
          theme: "light", mesh3d: true, spin3d: false, quality3d: 32,
          animate: true, animDur: 1.4 },
  history: [], future: [],
};
let colorIdx = 0;
const nextColor = () => PALETTE[(colorIdx++) % PALETTE.length];
const FN_LETTERS = "fghqrstuvwz";

function snapshot() {
  state.history.push(JSON.stringify({ objects: state.objects.map(stripFn), seq: state.seq, colorIdx, params: state.params }));
  if (state.history.length > 60) state.history.shift();
  state.future.length = 0;
}
function stripFn(o) { const { fn, born, _oldX, _oldY, ...rest } = o; return rest; }
function restore(json) {
  const d = JSON.parse(json);
  state.seq = d.seq; colorIdx = d.colorIdx;
  state.params = d.params || {};
  state.objects = d.objects.map(rehydrate);
  if (!state.objects.find(o => o.id === state.selectedId)) state.selectedId = state.objects[0]?.id ?? null;
}
function rehydrate(o) {
  try {
    // Object 3D quan hệ (MIND MATH 3D Construction Engine): giữ nguyên trường số/ngữ nghĩa,
    // không ép parse lại expr (expr chỉ để hiển thị/serialize nhẹ). Chống mất dependency khi reload/share.
    if (o && typeof o.kind === "string" && /^(line3d|segment3d|ray3d|vector3d|plane3d|circle3d|sphere3d|polygon3d|solid3|measure3d)$/.test(o.kind)) {
      const c = { ...o, error: null, born: 0 };
      if (!c.color) c.color = "#8b5cf6";
      if (c.visible === undefined) c.visible = true;
      return c;
    }
    const p = parseCommand(o.expr);
    return { ...o, ...p, error: null, born: 0 };
  } catch (e) { return { ...o, error: e.message, born: 0 }; }
}
function pushHistory() { snapshot(); persist(); }
function persist() {
  store.save({ objects: state.objects.map(stripFn), seq: state.seq, colorIdx, params: state.params, view: state.view, view3d: state.view3d, mode: state.mode, opts: state.opts });
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

/* Zoom/pan gần như vô hạn: scale 1e-12..1e12 (24 bậc), tâm tới ±1e15.
   Vượt quá → mất chính xác double nên lưới/nhãn tự ẩn (LOD), không treo máy. */
const MIN_SCALE = 1e-12, MAX_SCALE = 1e12, MAX_CENTER = 1e15;
function sanitizeView() {
  const v = state.view;
  if (!isFinite(v.scale) || v.scale <= 0) v.scale = 48;
  v.scale = clamp(v.scale, MIN_SCALE, MAX_SCALE);
  if (!isFinite(v.cx)) v.cx = 0; if (!isFinite(v.cy)) v.cy = 0;
  v.cx = clamp(v.cx, -MAX_CENTER, MAX_CENTER);
  v.cy = clamp(v.cy, -MAX_CENTER, MAX_CENTER);
}
const toScreen = (x, y) => [W / 2 + (x - state.view.cx) * state.view.scale, H / 2 - (y - state.view.cy) * state.view.scale];
const toMath = (px, py) => {
  const s = state.view.scale || 48;
  return [state.view.cx + (px - W / 2) / s, state.view.cy - (py - H / 2) / s];
};
/* ============ Dynamic-geometry coordinate helpers (screen <-> world) ============
   Dùng duy nhất 2 hàm này cho mọi tính toán kéo-thả để tránh hard-code.
   px/py là CSS pixel (clientX - rect.left), đã đúng với DPR vì toScreen/toMath
   dùng W/H CSS còn ctx scale bằng DPR. */
function screenToWorld(px, py) { return toMath(px, py); }
function worldToScreen(x, y) { return toScreen(x, y); }

/* ============================================================================
   MIND MATH — DYNAMIC GEOMETRY INTERACTION LAYER
   Triết lý: tái dùng object model hiện có, không tạo engine thứ hai.
   Luồng: pointer -> hitTest -> select/hover/drag -> update source ->
          propagate dependents -> schedule render -> update algebra -> commit undo.
   ============================================================================ */
const DEBUG_INTERACTION = false;
function mmDbg(...a) { if (DEBUG_INTERACTION) try { console.log("[mm-interact]", ...a); } catch {} }
const mmRound2 = (v) => Math.round(Number(v) * 100) / 100;
function mmFmtNum(v) {
  if (!isFinite(v)) return "0";
  const r = Math.round(Number(v) * 100) / 100;
  return String(r);
}
function mmClamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

const interact = {
  hoverId: null, hoverPart: null, hoverVertex: -1,
  drag: null,          // drag session khi đang kéo object
  pan: null,           // pan session khi kéo nền
  orbit: null,         // orbit session 3D
  drawQueued: false,
  lastAlgebra: 0,
  snapInfo: null,      // {x,y,kind} để vẽ marker
};
const HIT = { point: 14, ctrl: 12, body: 10, vertex: 12, edge: 10 };
const DRAG_THRESHOLD = 4;

function mmGetObj(id) { return state.objects.find(o => o.id === id) || null; }
function mmIsDragTool() {
  const t = state.tool || "move";
  return t === "move" || t === "select" || t === "pan";
}
function mmPointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi)) inside = !inside;
  }
  return inside;
}
function mmCircleMetaOf(o) {
  if (o.cx !== undefined && o.cy !== undefined && (o.cr !== undefined || o.r !== undefined)) {
    const r = o.cr !== undefined ? o.cr : o.r;
    if (isFinite(o.cx) && isFinite(o.cy) && isFinite(r) && r > 0) return { cx: o.cx, cy: o.cy, r };
  }
  try {
    if (o.expr) {
      const m = parseCircleMeta(o.expr);
      if (m) return m;
    }
  } catch {}
  return null;
}
/* ---- hitTest 2D: trả về {obj, part, vertex, d, rank} ----
   part: 'p1'|'p2'|'center'|'rim'|'vertex'|'body'|'edge'|'a'|'b'|'c'|'point'
   rank càng nhỏ càng ưu tiên: 0 point, 1 control/vertex, 2 segment body, 3 edge, 4 khác */
function hitTest2D(px, py) {
  const cands = [];
  for (const o of state.objects) {
    if (!o.visible || o.error) continue;
    try {
      if (o.kind === "point" || o.kind === "point3d") {
        const sx = o.x, sy = o.y;
        if (!isFinite(sx) || !isFinite(sy)) continue;
        const [ax, ay] = toScreen(sx, sy);
        const d = Math.hypot(px - ax, py - ay);
        if (d <= HIT.point) cands.push({ obj: o, part: "point", vertex: -1, d, rank: 0 });
      } else if (o.kind === "segment" || o.kind === "vector" || o.kind === "ray") {
        const [ax, ay] = toScreen(o.x1, o.y1), [bx, by] = toScreen(o.x2, o.y2);
        if (![ax, ay, bx, by].every(isFinite)) continue;
        const d1 = Math.hypot(px - ax, py - ay), d2 = Math.hypot(px - bx, py - by);
        if (d1 <= HIT.ctrl) { cands.push({ obj: o, part: "p1", vertex: -1, d: d1, rank: 1 }); continue; }
        // ray: đầu xa không phải control thật (kéo dài vô hạn) -> chỉ p1 là control
        if (o.kind !== "ray" && d2 <= HIT.ctrl) { cands.push({ obj: o, part: "p2", vertex: -1, d: d2, rank: 1 }); continue; }
        let d;
        if (o.kind === "ray") {
          const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
          const t = ((px - ax) * vx + (py - ay) * vy) / l2;
          d = t < 0 ? Math.hypot(px - ax, py - ay) : distPtSeg(px, py, ax, ay, bx, by);
        } else d = distPtSeg(px, py, ax, ay, bx, by);
        if (d <= HIT.body) cands.push({ obj: o, part: "body", vertex: -1, d, rank: 2 });
      } else if (o.kind === "polygon") {
        if (!o.pts || o.pts.length < 3) continue;
        const S = o.pts.map(p => toScreen(p[0], p[1]));
        let bestV = -1, bestVd = 1e9;
        S.forEach(([sx, sy], i) => {
          if (!isFinite(sx) || !isFinite(sy)) return;
          const d = Math.hypot(px - sx, py - sy);
          if (d < bestVd) { bestVd = d; bestV = i; }
        });
        if (bestVd <= HIT.vertex) { cands.push({ obj: o, part: "vertex", vertex: bestV, d: bestVd, rank: 1 }); continue; }
        let m = Infinity;
        for (let i = 0; i < S.length; i++) {
          const A = S[i], B = S[(i + 1) % S.length];
          m = Math.min(m, distPtSeg(px, py, A[0], A[1], B[0], B[1]));
        }
        if (m <= HIT.edge) { cands.push({ obj: o, part: "edge", vertex: -1, d: m, rank: 3 }); continue; }
        try {
          const [mx, my] = toMath(px, py);
          if (mmPointInPoly(mx, my, o.pts)) cands.push({ obj: o, part: "body", vertex: -1, d: 8, rank: 3 });
        } catch {}
      } else if (o.kind === "angle") {
        const A = toScreen(o.ax, o.ay), B = toScreen(o.bx, o.by), C = toScreen(o.cx, o.cy);
        const da = Math.hypot(px - A[0], py - A[1]), db = Math.hypot(px - B[0], py - B[1]), dc = Math.hypot(px - C[0], py - C[1]);
        const m = Math.min(da, db, dc);
        if (m <= HIT.ctrl) {
          const part = m === da ? "a" : (m === db ? "b" : "c");
          cands.push({ obj: o, part, vertex: -1, d: m, rank: 1 });
        }
      } else if (o.kind === "arc" || o.kind === "sector") {
        const [sx, sy] = toScreen(o.cx, o.cy);
        const dc = Math.hypot(px - sx, py - sy);
        if (dc <= HIT.ctrl) { cands.push({ obj: o, part: "center", vertex: -1, d: dc, rank: 1 }); continue; }
        const rPx = (o.r || 0.5) * (state.view.scale || 48);
        if (Math.abs(dc - rPx) <= HIT.body) cands.push({ obj: o, part: "rim", vertex: -1, d: Math.abs(dc - rPx), rank: 2 });
      } else if (o.kind === "ellipse") {
        const [sx, sy] = toScreen(o.cx, o.cy);
        const dc = Math.hypot(px - sx, py - sy);
        if (dc <= HIT.ctrl) { cands.push({ obj: o, part: "center", vertex: -1, d: dc, rank: 1 }); continue; }
        // xấp xỉ vành: chuẩn hoá theo rx/ry (xoay)
        try {
          const [mx, my] = toMath(px, py);
          const dx = mx - o.cx, dy = my - o.cy;
          const ca = Math.cos(o.rot || 0), sa = Math.sin(o.rot || 0);
          const lx = (dx * ca + dy * sa) / (o.rx || 1), ly = (-dx * sa + dy * ca) / (o.ry || 1);
          const q = Math.hypot(lx, ly);
          const edgePx = Math.abs(q - 1) * Math.min(o.rx, o.ry) * (state.view.scale || 48);
          if (edgePx <= 12) cands.push({ obj: o, part: "rim", vertex: -1, d: edgePx, rank: 2 });
        } catch {}
      } else if (o.kind === "hyperbola") {
        const [sx, sy] = toScreen(o.cx, o.cy);
        const d = Math.hypot(px - sx, py - sy);
        if (d <= 16) cands.push({ obj: o, part: "center", vertex: -1, d, rank: 2 });
      } else if (o.kind === "text" || o.kind === "image") {
        const [sx, sy] = toScreen(o.x, o.y);
        const d = Math.hypot(px - sx, py - sy);
        if (d <= 16) cands.push({ obj: o, part: "body", vertex: -1, d, rank: 2 });
      } else if (o.kind === "vline") {
        const [sx] = toScreen(o.x, 0);
        const d = Math.abs(px - sx);
        if (d <= HIT.body) cands.push({ obj: o, part: "body", vertex: -1, d, rank: 2 });
      } else if (o.kind === "fn" || o.kind === "implicit") {
        // chỉ chọn được (select/hover), kéo tự do chỉ cho đường thẳng (linear)
        let d = Infinity, isLine = false;
        try {
          if (o.kind === "fn" && /^\s*-?\d*\.?\d*\s*\*\s*x\s*(\+|\-)/.test(o.expr)) isLine = true;
          if (o.kind === "fn") {
            const [mx] = toMath(px, py);
            let y; try { y = o.fn(mx); } catch { y = NaN; }
            if (isFinite(y)) { const [, sy] = toScreen(mx, y); d = Math.abs(py - sy); }
          } else {
            // implicit: khoảng cách tới đường mức ~ |F|/|grad| đổi ra px (xấp xỉ)
            const [mx, my] = toMath(px, py);
            let v; try { v = o.fn(mx, my); } catch { v = NaN; }
            if (isFinite(v)) {
              const h = 1e-4;
              let gx = NaN, gy = NaN;
              try {
                gx = (o.fn(mx + h, my) - o.fn(mx - h, my)) / (2 * h);
                gy = (o.fn(mx, my + h) - o.fn(mx, my - h)) / (2 * h);
              } catch {}
              const g = Math.hypot(gx, gy);
              if (isFinite(g) && g > 1e-9) d = Math.abs(v) / g * (state.view.scale || 48);
              else {
                const meta = mmCircleMetaOf(o);
                if (meta) {
                  const dc = Math.hypot(mx - meta.cx, my - meta.cy);
                  d = Math.abs(dc - meta.r) * (state.view.scale || 48);
                  const [scx, scy] = toScreen(meta.cx, meta.cy);
                  if (Math.hypot(px - scx, py - scy) <= HIT.ctrl) {
                    cands.push({ obj: o, part: "center", vertex: -1, d: Math.hypot(px - scx, py - scy), rank: 1 });
                    continue;
                  }
                  if (d <= 12) { cands.push({ obj: o, part: "rim", vertex: -1, d, rank: 2 }); continue; }
                  else continue;
                }
              }
            }
          }
        } catch {}
        if (d <= 12) {
          const meta = o.kind === "implicit" ? mmCircleMetaOf(o) : null;
          cands.push({ obj: o, part: meta ? "rim" : "body", vertex: -1, d, rank: 4, maybeCircle: !!meta });
        }
      }
    } catch {}
  }
  if (!cands.length) return null;
  cands.sort((a, b) => (a.rank - b.rank) || (a.d - b.d));
  return cands[0];
}
function hitTest3D(px, py) {
  // chỉ point3d / point (trên nền) mới bắt được trong 3D; ưu tiên gần màn hình nhất
  let best = null, bd = 16;
  for (const o of state.objects) {
    if (!o.visible || o.error) continue;
    if (o.kind !== "point3d" && o.kind !== "point") continue;
    try {
      const z = o.kind === "point3d" ? o.z : 0;
      const p = proj3(o.x, o.y, z);
      const d = Math.hypot(px - p.sx, py - p.sy);
      if (d < bd) { bd = d; best = o; }
    } catch {}
  }
  return best ? { obj: best, d: bd } : null;
}
/* Nghịch đảo màn hình -> mặt phẳng z=const (cho drag point 3D, giữ z). */
function screenToPlaneZ(px, py, zConst) {
  const v = state.view3d;
  let x = (px - W / 2) / (v.scale || 36) + (v.tx || 0);
  let y = (H / 2 - py) / (v.scale || 36) + (v.ty || 0);
  for (let k = 0; k < 8; k++) {
    let p;
    try { p = proj3(x, y, zConst); } catch { break; }
    const dx = (px - p.sx) / (v.scale || 36), dy = -(py - p.sy) / (v.scale || 36);
    const ce = Math.cos(v.el || 0.9);
    if (Math.abs(ce) < 0.12) break;
    x += dx * Math.cos(-v.az) * 0.7;
    y += (dx * Math.sin(-v.az) + dy * 0.7) * 0.7;
    if (Math.abs(dx) + Math.abs(dy) < 0.005) break;
  }
  return { x: mmRound2(x), y: mmRound2(y) };
}
/* số gọn cho HUD / nhãn vô hạn: 1e12 → "1e12", 0.0000001 → "1e-7" */
function fmtCompact(v, sig) {
  if (!isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e12 || a < 1e-9) {
    let s = v.toExponential(sig ?? 1).replace(/\.0+e/, "e").replace("e+", "e");
    return s;
  }
  if (a >= 1000) return String(Math.round(v * 100) / 100);
  return String(Number(v.toPrecision(6)));
}
function fmtScaleHUD(scale) {
  if (!isFinite(scale) || scale <= 0) return "—";
  if (scale >= 10) return `${Math.round(scale)} px/đv`;
  if (scale >= 1) return `${Math.round(scale * 10) / 10} px/đv`;
  if (scale >= 0.001) {
    let s = String(Number(scale.toPrecision(3)));
    return `${s} px/đv`;
  }
  return `${fmtCompact(scale)} px/đv`;
}

/* ---- Lưới + nhãn kiểu GeoGebra, vô hạn: major ~30px, label thưa ~85px ----
   nice 1-2-5 → zoom xa: 10 → 20 → 50 → 100 → 200 → ... → 1e12 (kéo tới 600
   chỉ còn 100, 200; kéo tới 1e9 chỉ còn 1e8...); zoom gần: 1 → 0.5 → 0.2...
   Vòng lặp theo chỉ số nguyên k + bỏ ticks trùng (mất chính xác double)
   + chặn số lượng để không treo máy yếu. */
function niceStep(target) {
  if (!isFinite(target) || target <= 0) return 1;
  if (target >= 1e308) return 1e308;
  if (target < 1e-308) return 1e-308;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (m * pow >= target) return m * pow;
  return 10 * pow;
}
function niceMantissa(v) {
  if (!isFinite(v) || v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v) + 1e-12));
  return v / pow;
}
/* major: lưới đậm (~30px), label: chữ số (~90px, luôn là bội của major),
   minor: lưới mờ (chia nhỏ major). Thu nhỏ/ẩn chi tiết li ti khi vô hạn. */
function axisSteps(scale, gridMul) {
  const mul = (isFinite(gridMul) && gridMul > 0) ? gridMul : 1;
  const s = clamp(scale || 48, MIN_SCALE, MAX_SCALE);
  const major = niceStep((30 / s) * mul);
  let label = major;
  const MIN_LBL_PX = 88;
  let guard = 0;
  while (label * s < MIN_LBL_PX && guard++ < 24) {
    if (!isFinite(label) || label <= 0 || label >= 1e308) break;
    const m = niceMantissa(label);
    const pow = Math.pow(10, Math.floor(Math.log10(label) + 1e-12));
    if (Math.abs(m - 1) < 0.05) label = 2 * pow;
    else if (Math.abs(m - 2) < 0.05) label = 5 * pow;
    else if (Math.abs(m - 5) < 0.05) label = 10 * pow;
    else label = niceStep(label * 2);
  }
  const mm = niceMantissa(major);
  const minorDiv = Math.abs(mm - 2) < 0.05 ? 4 : 5;
  const minor = major / minorDiv;
  return { major, minor, label };
}
/* Lặp ticks an toàn vô hạn: bỏ qua khi vượt safe-integer / trùng do double. */
function forEachTick(min, max, step, cb) {
  if (!isFinite(min) || !isFinite(max) || !isFinite(step) || step <= 0) return 0;
  if (max < min) return 0;
  const span = max - min;
  if (!isFinite(span) || span / step > 2000) return 0; // quá dày → ẩn (LOD)
  const k0 = Math.ceil(min / step - 1e-9), k1 = Math.floor(max / step + 1e-9);
  if (!isFinite(k0) || !isFinite(k1)) return 0;
  if (Math.abs(k0) > 9e15 || Math.abs(k1) > 9e15) return 0; // vượt double → ẩn
  const count = k1 - k0;
  if (count < 0 || count > 2000) return 0;
  let lastV = null, shown = 0;
  for (let i = 0; i <= count; i++) {
    const k = k0 + i;
    let v = k * step;
    if (!isFinite(v)) continue;
    v = Number(v.toPrecision(12)); // khử 0.30000000004
    if (Math.abs(v) < step * 1e-9) v = 0;
    if (lastV !== null && v === lastV) continue; // trùng do hết chính xác → ẩn
    lastV = v;
    cb(v, k);
    if (++shown > 2000) break;
  }
  return shown;
}

function themeColors() { return THEMES[state.opts.theme] || THEMES.light; }

function draw() {
  if (state.mode === "3d") { draw3D(); return; }
  sanitizeView();
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

  const { major: step, minor, label: labelStep } = axisSteps(scale, state.opts.gridStep);
  const [x0, y1] = toMath(0, 0), [x1, y0] = toMath(W, H);

  // minor grid — tự ẩn khi quá dày / quá nhỏ (<6px) để giữ 60fps (LOD)
  const minorCount = (x1 - x0) / minor + (y1 - y0) / minor;
  const minorPx = minor * scale;
  if (state.opts.minor && minorCount < 700 && minorPx >= 6 && isFinite(minorCount)) {
    ctx.strokeStyle = T.minor; ctx.lineWidth = 1; ctx.beginPath();
    forEachTick(x0, x1, minor, (x) => {
      const [sx] = toScreen(x, 0);
      if (!isFinite(sx)) return;
      ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, H);
    });
    forEachTick(y0, y1, minor, (y) => {
      const [, sy] = toScreen(0, y);
      if (!isFinite(sy)) return;
      ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(W, Math.round(sy) + 0.5);
    });
    ctx.stroke();
  }
  // major grid
  ctx.strokeStyle = T.major; ctx.lineWidth = 1; ctx.beginPath();
  forEachTick(x0, x1, step, (x) => {
    const [sx] = toScreen(x, 0);
    if (!isFinite(sx)) return;
    ctx.moveTo(Math.round(sx) + 0.5, 0); ctx.lineTo(Math.round(sx) + 0.5, H);
  });
  forEachTick(y0, y1, step, (y) => {
    const [, sy] = toScreen(0, y);
    if (!isFinite(sy)) return;
    ctx.moveTo(0, Math.round(sy) + 0.5); ctx.lineTo(W, Math.round(sy) + 0.5);
  });
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

  // labels — dùng bước thưa labelStep kiểu GeoGebra, tránh chồng chữ khi zoom xa
  if (state.opts.labels) {
    ctx.font = "600 11px 'Be Vietnam Pro','Segoe UI',sans-serif";
    ctx.fillStyle = T.label; ctx.textAlign = "center";
    const yLbl = clamp(oy + 16, 14, H - 6);
    let prevSx = -1e9;
    forEachTick(x0, x1, labelStep, (x) => {
      if (Math.abs(x) < labelStep * 1e-9) return;
      const [sx] = toScreen(x, 0);
      if (!isFinite(sx) || sx < 8 || sx > W - 8) return;
      if (sx - prevSx < 48) return; // chống đè chữ trên máy hẹp
      prevSx = sx;
      ctx.fillText(fmtTick(x, labelStep), sx, yLbl);
    });
    ctx.textAlign = "left";
    const xLbl = clamp(ox + 7, 6, W - 30);
    let prevSy = -1e9;
    forEachTick(y0, y1, labelStep, (y) => {
      if (Math.abs(y) < labelStep * 1e-9) return;
      const [, sy] = toScreen(0, y);
      if (!isFinite(sy) || sy < 10 || sy > H - 6) return;
      if (Math.abs(sy - prevSy) < 18) return; // sy đi từ dưới lên (giảm dần) nên phải dùng abs
      prevSy = sy;
      ctx.fillText(fmtTick(y, labelStep), xLbl, sy - 5);
    });
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
    else if (o.kind === "param") { /* tham số: chỉ hiện trong Đại số */ }
    else if (o.kind === "segment") drawSegment(o);
    else if (o.kind === "ray") drawRay(o);
    else if (o.kind === "vector") drawVector(o);
    else if (o.kind === "polygon") drawPolygon(o);
    else if (o.kind === "angle") drawAngle(o);
    else if (o.kind === "text") drawTextObj(o);
    else if (o.kind === "arc") drawArc(o);
    else if (o.kind === "sector") drawSector(o);
    else if (o.kind === "ellipse") drawEllipse(o);
    else if (o.kind === "hyperbola") drawHyperbola(o);
    else if (o.kind === "image") drawImageObj(o);
  }
  // pending construction preview
  if (state.pending.length) {
    ctx.fillStyle = "#38bdf8";
    for (const p of state.pending) { const [sx, sy] = toScreen(p.x, p.y); ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fill(); }
    if (state.pending.length > 1 && ["polygon", "oriented", "plist", "regression", "conic5", "segment", "ray", "vector", "line", "vecfrom"].includes(state.tool)) {
      ctx.save(); ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      state.pending.forEach((p, i) => { const [sx, sy] = toScreen(p.x, p.y); if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy); });
      if ((state.tool === "polygon" || state.tool === "oriented") && state.pending.length > 2) ctx.closePath();
      ctx.stroke(); ctx.restore();
    }
  }
  try { if (typeof mmDrawInteractOverlay2D === "function") mmDrawInteractOverlay2D(); } catch {}
  const hud = $("#hudScale"); if (hud) hud.textContent = `${fmtScaleHUD(scale)} · 2D`;
}
/* Hình phẳng 2D chiếu xuống nền z=0 khi ở chế độ 3D */
function drawSeg3DFlat(o) {
  let x2 = o.x2, y2 = o.y2;
  if (o.kind === "ray") { const dx = o.x2 - o.x1, dy = o.y2 - o.y1, l = Math.hypot(dx, dy) || 1; x2 = o.x1 + dx / l * 14; y2 = o.y1 + dy / l * 14; }
  const a = proj3(o.x1, o.y1, 0), b = proj3(x2, y2, 0);
  ctx.save(); ctx.strokeStyle = o.color; ctx.lineWidth = 2;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 6; }
  ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); ctx.restore();
}
function drawPoly3DFlat(o) {
  if (!o.pts || o.pts.length < 3) return;
  ctx.save(); ctx.strokeStyle = o.color; ctx.lineWidth = 1.6;
  ctx.globalAlpha = 0.8; ctx.beginPath();
  o.pts.forEach((p, i) => { const q = proj3(p[0], p[1], 0); if (i === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy); });
  ctx.closePath(); ctx.stroke(); ctx.restore();
}
function tickDecimals(step) {
  if (!isFinite(step) || step <= 0) return 0;
  if (step >= 1e12 || step < 1e-12) return 2;
  const exp = Math.floor(Math.log10(step) + 1e-12);
  const m = step / Math.pow(10, exp);
  let d = Math.max(0, -exp);
  if (Math.abs(m - 2.5) < 0.06) d += 1; // bước 2.5, 0.25... cần thêm 1 chữ số
  return clamp(d, 0, 12);
}
function fmtTick(v, step) {
  if (!isFinite(v)) return "—";
  if (Math.abs(v) < 1e-15) v = 0;
  // canonical nhẹ theo bước để 99.999999 → 100, 0.30000004 → 0.3 (chỉ snap khi gần)
  if (isFinite(step) && step > 0 && isFinite(v / step) && Math.abs(v / step) < 1e15) {
    const q = v / step, qr = Math.round(q);
    if (Math.abs(q - qr) < 1e-6) {
      v = qr * step;
      v = Number(v.toPrecision(12));
    } else {
      v = Number(v.toPrecision(12));
    }
    if (Math.abs(v) < step * 1e-9) v = 0;
  } else {
    v = Number(v.toPrecision(12));
  }
  const a = Math.abs(v);
  // cực lớn / cực nhỏ → số mũ gọn (vô hạn): 1e12, 1.5e-10… thay vì dãy 0 dài
  if (v !== 0 && (a >= 1e12 || a < 1e-9)) {
    let s = v.toExponential(2).replace(/(\.\d*?)0+e/, "$1e").replace(/\.e/, "e").replace("e+", "e");
    return s;
  }
  const dec = tickDecimals(step || (Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 10 ? 0.5 : 0.1));
  // giá trị lớn nhưng cần nhiều decimals (hết chính xác) → mũ cho gọn
  if (a >= 1e9 && dec > 3) {
    let s = v.toExponential(2).replace(/(\.\d*?)0+e/, "$1e").replace(/\.e/, "e").replace("e+", "e");
    return s;
  }
  let s;
  try { s = v.toFixed(dec); }
  catch { return fmtCompact(v); }
  if (s.length > 18) return fmtCompact(v); // nhãn quá dài → gọn, chống đè
  if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
  if (s === "-0") s = "0";
  return s;
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
    if (!isFinite(x)) { pen = false; continue; }
    let y; try { y = o.fn(x); } catch { pen = false; continue; }
    if (typeof y !== "number" || !isFinite(y)) { pen = false; continue; }
    const [, sy] = toScreen(0, y);
    if (!isFinite(sy) || Math.abs(sy) > 1e6) { pen = false; continue; } // LOD: ẩn spike vô hạn khi zoom xa
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
  if (!isFinite(sx) || sx < -60 || sx > W + 60) return; // LOD: ngoài màn hình thì ẩn
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
  if (!isFinite(x) || !isFinite(y)) return;
  const [sx, sy] = toScreen(x, y);
  if (!isFinite(sx) || !isFinite(sy)) return;
  if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) return;
  const isDark = state.opts.theme === "dark";
  ctx.save();
  if (p < 1) ctx.globalAlpha = p;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 14; }
  const rr = 5.5 * (0.4 + 0.6 * p);
  ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(sx, sy, rr, 0, 7); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, sy, 2 * p + 0.4, 0, 7); ctx.fill();
  if (!o.hideName) {
    ctx.font = "700 11px 'Be Vietnam Pro',sans-serif";
    // viền halo quanh chữ để luôn đọc được trên mọi nền, màu chữ theo theme
    ctx.lineWidth = 3;
    ctx.strokeStyle = isDark ? "rgba(6,6,15,.85)" : "rgba(255,255,255,.9)";
    ctx.strokeText(o.name, sx + 9, sy - 8);
    ctx.fillStyle = isDark ? "rgba(255,255,255,.92)" : "#0f172a";
    ctx.fillText(o.name, sx + 9, sy - 8);
  }
  ctx.restore();
  if (p < 1) kickAnim();
}
/* Generic implicit contour via marching squares on a coarse grid */
function drawImplicit(o) {
  const p = animP(o);
  if (p <= 0) return;
  // LOD: chặn độ phân giải để máy yếu vẫn mượt khi zoom vô hạn
  const nx = clamp(Math.floor(W / 4), 60, 240), ny = clamp(Math.floor(H / 4), 60, 240);
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
  // kẹp mẫu số để zoom vô hạn không bị lật hình khi scale lớn / Yd lớn
  const denom = Math.max(250, 900 - r.Yd * v.scale * 0.35);
  const persp = 900 / denom;
  const sx = W / 2 + r.X * v.scale * persp;
  const sy = H / 2 - r.Z * v.scale * persp;
  return { sx, sy, depth: r.Yd, persp };
}
/* ---- Trục 3D vô hạn kiểu GeoGebra: bước nice 1-2-5 theo scale ----
   - tickStep: chấm mỗi ~22px ; labelStep: số mỗi ~72px (bội của tickStep)
   - vd zoom xa tới 600 -> labelStep tự nhảy 100, hiện 100 200...;
     zoom gần -> 0.5, 0.2... Số lượng ticks luôn ~ W/22 nên
     phóng to / thu nhỏ vô hạn mà không tràn hiệu năng. */
function axisSteps3D(scale) {
  const s = (isFinite(scale) && scale > 0) ? scale : 36;
  const tickStep = niceStep(22 / s);
  let labelStep = tickStep;
  let guard = 0;
  while (labelStep * s < 72 && guard++ < 12) {
    const m = niceMantissa(labelStep);
    const pow = Math.pow(10, Math.floor(Math.log10(labelStep) + 1e-12));
    if (Math.abs(m - 1) < 0.05) labelStep = 2 * pow;
    else if (Math.abs(m - 2) < 0.05) labelStep = 5 * pow;
    else if (Math.abs(m - 5) < 0.05) labelStep = 10 * pow;
    else labelStep = niceStep(labelStep * 2);
  }
  return { tickStep, labelStep };
}
/* Bán kính trục đủ phủ màn hình ở mọi zoom/pan -> cảm giác vô hạn.
   Rview = nửa màn hình quy ra world; cộng dist tâm để pan xa vẫn thấy trục. */
function axisExtent3D() {
  const v = state.view3d;
  const s = (isFinite(v.scale) && v.scale > 0) ? v.scale : 36;
  const Rview = Math.max(W, H) / (2 * s);
  const distC = Math.hypot(v.tx || 0, v.ty || 0, v.tz || 0);
  const { labelStep } = axisSteps3D(s);
  return Rview * 1.18 + distC + labelStep * 1.2 + 0.5;
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

  // --- lưới nền Oxy VÔ HẠN bám theo chuột (pan/zoom) kiểu GeoGebra ---
  // bước lưới tự thưa theo zoom (~30px/ô), phạm vi phủ kín màn hình quanh tâm nhìn
  // nên kéo đi đâu / lăn zoom bao nhiêu cũng luôn thấy lưới chạy theo, không mất lưới
  const sc3g = (isFinite(state.view3d.scale) && state.view3d.scale > 0) ? state.view3d.scale : 36;
  const gridStep = niceStep(30 / sc3g);
  const RviewG = Math.max(W, H) / (2 * sc3g) * 1.3 + gridStep * 2;
  const cxG = state.view3d.tx || 0, cyG = state.view3d.ty || 0;
  const gx0 = Math.floor((cxG - RviewG) / gridStep) * gridStep;
  const gx1 = Math.ceil((cxG + RviewG) / gridStep) * gridStep;
  const gy0 = Math.floor((cyG - RviewG) / gridStep) * gridStep;
  const gy1 = Math.ceil((cyG + RviewG) / gridStep) * gridStep;
  // mặt nền mờ bám theo tâm nhìn (luôn lót dưới chân chuột)
  try {
    const c1 = proj3(gx0, gy0, 0), c2 = proj3(gx1, gy0, 0), c3 = proj3(gx1, gy1, 0), c4 = proj3(gx0, gy1, 0);
    ctx.fillStyle = T.floor; ctx.beginPath();
    ctx.moveTo(c1.sx, c1.sy); ctx.lineTo(c2.sx, c2.sy); ctx.lineTo(c3.sx, c3.sy); ctx.lineTo(c4.sx, c4.sy);
    ctx.closePath(); ctx.fill();
  } catch {}
  // lưới: gom 1 path duy nhất cho mượt, bỏ đường trùng trục (x=0, y=0 để trục vẽ đè)
  ctx.lineWidth = 1;
  ctx.strokeStyle = T.grid3d;
  ctx.beginPath();
  forEachTick(gx0, gx1, gridStep, (x) => {
    if (Math.abs(x) < gridStep * 1e-9) return; // trùng trục Oy
    const a = proj3(x, gy0, 0), b = proj3(x, gy1, 0);
    ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
  });
  forEachTick(gy0, gy1, gridStep, (y) => {
    if (Math.abs(y) < gridStep * 1e-9) return; // trùng trục Ox
    const a = proj3(gx0, y, 0), b = proj3(gx1, y, 0);
    ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
  });
  ctx.stroke();

  // --- trục Oxyz vô hạn kiểu GeoGebra: chấm + số thích ứng, thu gọn khi zoom xa ---
  const v3 = state.view3d;
  const Rax = axisExtent3D();
  const { tickStep: tick3, labelStep: lab3 } = axisSteps3D(v3.scale);
  const RaxNegZ = Rax * 0.7; // nhánh âm Oz ngắn hơn như GeoGebra (vẫn vô hạn tỉ lệ)
  const AX = [
    { p1: [-Rax, 0, 0], p2: [Rax, 0, 0], neg: Rax, pos: Rax, c: "#ef4444", label: "x", pt: (t) => [t, 0, 0] },
    { p1: [0, -Rax, 0], p2: [0, Rax, 0], neg: Rax, pos: Rax, c: "#22c55e", label: "y", pt: (t) => [0, t, 0] },
    { p1: [0, 0, -RaxNegZ], p2: [0, 0, Rax], neg: RaxNegZ, pos: Rax, c: "#3b82f6", label: "z", pt: (t) => [0, 0, t], dashNeg: true },
  ];
  // thân trục: x,y đặc cả 2 phía; z dương đặc, z âm nét đứt
  ctx.lineWidth = 2;
  for (const a of AX) {
    const p1 = proj3(...a.p1), p2 = proj3(...a.p2);
    if (a.dashNeg) {
      const o0 = proj3(0, 0, 0);
      ctx.save();
      ctx.strokeStyle = a.c; ctx.setLineDash([6, 5]); ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.moveTo(o0.sx, o0.sy); ctx.lineTo(p1.sx, p1.sy); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = a.c; ctx.beginPath(); ctx.moveTo(o0.sx, o0.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
    } else {
      ctx.strokeStyle = a.c; ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
    }
  }
  // ticks + nhãn số trên từng trục (chấm nhỏ mỗi tick3, số mỗi lab3)
  if (state.opts.labels) {
    ctx.font = "700 10.5px 'Be Vietnam Pro','Segoe UI',sans-serif";
    for (const a of AX) {
      let prevLx = 1e9, prevLy = 1e9;
      forEachTick(-a.neg, a.pos, tick3, (tv) => {
        if (Math.abs(tv) < tick3 * 1e-9) return; // bỏ gốc 0, vẽ O riêng
        if (a.dashNeg && tv < 0 && tv < -a.neg + 1e-9) return;
        const wp = a.pt(tv);
        const p = proj3(wp[0], wp[1], wp[2]);
        if (p.sx < -30 || p.sx > W + 30 || p.sy < -30 || p.sy > H + 30) return;
        // số nguyên k của lab3? -> nhãn lớn, còn lại chấm nhỏ
        const kLab = Math.round(tv / lab3);
        const isLab = Math.abs(kLab * lab3 - tv) < Math.max(1e-9, tick3 * 1e-6);
        ctx.fillStyle = a.c;
        ctx.beginPath(); ctx.arc(p.sx, p.sy, isLab ? 3 : 1.8, 0, 7); ctx.fill();
        if (!isLab) return;
        // chống đè chữ khi phối cảnh nén (đầu xa): cách nhau <30px thì bỏ số, giữ chấm
        if (Math.hypot(p.sx - prevLx, p.sy - prevLy) < 30) return;
        prevLx = p.sx; prevLy = p.sy;
        const txt = fmtTick(tv, lab3);
        ctx.lineWidth = 3;
        ctx.strokeStyle = isDark ? "rgba(6,6,15,.85)" : "rgba(255,255,255,.92)";
        ctx.strokeText(txt, p.sx + 6, p.sy - 5);
        ctx.fillStyle = a.c;
        ctx.fillText(txt, p.sx + 6, p.sy - 5);
      });
    }
  }
  // mũi tên + tên trục tại đầu dương
  for (const a of AX) {
    const tip = proj3(...a.p2);
    const dlt = Math.min(Math.max(tick3, a.pos * 0.04), Math.max(0.05, a.pos * 0.4));
    const nearP = proj3(...a.pt(a.pos - dlt));
    let dx = tip.sx - nearP.sx, dy = tip.sy - nearP.sy;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const L = 10, wd = 4.2;
    ctx.fillStyle = a.c; ctx.beginPath();
    ctx.moveTo(tip.sx + dx * 2, tip.sy + dy * 2);
    ctx.lineTo(tip.sx - dx * L + (-dy) * wd, tip.sy - dy * L + dx * wd);
    ctx.lineTo(tip.sx - dx * L + dy * wd, tip.sy - dy * L - dx * wd);
    ctx.closePath(); ctx.fill();
    ctx.font = "700 13px 'Be Vietnam Pro',sans-serif";
    ctx.fillText(a.label, tip.sx + 8, tip.sy - 6);
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
      else if (ob.kind === "segment" || ob.kind === "vector" || ob.kind === "ray") drawSeg3DFlat(ob);
      else if (ob.kind === "polygon") drawPoly3DFlat(ob);
      else if (ob.kind === "text") drawPoint3D(ob.x, ob.y, 0, { ...ob, name: `"${ob.text}"` });
      /* MIND MATH 3D Construction Engine — đối tượng quan hệ */
      else if (ob.kind === "segment3d" && typeof mmDrawSeg3D === "function") mmDrawSeg3D(ob);
      else if (ob.kind === "line3d" && typeof mmDrawLine3D === "function") mmDrawLine3D(ob);
      else if (ob.kind === "ray3d" && typeof mmDrawRay3D === "function") mmDrawRay3D(ob);
      else if (ob.kind === "vector3d" && typeof mmDrawVector3D === "function") mmDrawVector3D(ob);
      else if (ob.kind === "plane3d" && typeof mmDrawPlane3D === "function") mmDrawPlane3D(ob);
      else if (ob.kind === "circle3d" && typeof mmDrawCircle3D === "function") mmDrawCircle3D(ob);
      else if (ob.kind === "sphere3d" && typeof mmDrawSphere3D === "function") mmDrawSphere3D(ob);
      else if (ob.kind === "polygon3d" && typeof mmDrawPolygon3D === "function") mmDrawPolygon3D(ob);
      else if (ob.kind === "solid3" && typeof mmDrawSolid3 === "function") mmDrawSolid3(ob);
      else if (ob.kind === "measure3d" && typeof mmDrawMeasure3D === "function") mmDrawMeasure3D(ob);
    } catch {}
  }

  try { if (typeof mmDrawInteractOverlay3D === "function") mmDrawInteractOverlay3D(); } catch {}
  try { if (typeof mmDraw3DToolPreview === "function") mmDraw3DToolPreview(); } catch {}
  const hud = $("#hudScale");
  if (hud) hud.textContent = `3D · az ${(state.view3d.az * 180 / Math.PI).toFixed(0)}° el ${(state.view3d.el * 180 / Math.PI).toFixed(0)}° · ${Math.round(state.view3d.scale)} px/đv · bước ${fmtTick(lab3, lab3)}`;
  const hc = $("#hudCoords");
  if (hc && !(interact.drag && interact.drag.active) && state.lastClick3d) hc.textContent = `x: ${state.lastClick3d.x.toFixed(2)} · y: ${state.lastClick3d.y.toFixed(2)} · z: ${state.lastClick3d.z.toFixed(2)}`;
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
    const pw = Math.abs(w * state.view.scale), pd = Math.abs(d * state.view.scale);
    if (!isFinite(pw) || !isFinite(pd)) return;
    if (Math.max(pw, pd) < 1) { const [cx0, cy0] = toScreen(0, 0); geomDot(cx0, cy0, o.color, 3); return; }
    const [x0, y0] = toScreen(-w / 2, -d / 2), [x1, y1] = toScreen(w / 2, d / 2);
    if (![x0, y0, x1, y1].every(isFinite)) return;
    ctx.beginPath(); ctx.rect(x0, y1, x1 - x0, y0 - y1); ctx.fill(); ctx.stroke();
  };
  const circ2 = (r) => {
    const [cx, cy] = toScreen(0, 0);
    if (!isFinite(cx) || !isFinite(cy)) return;
    const rr = r * state.view.scale;
    if (!isFinite(rr) || rr < 0.8) { geomDot(cx, cy, o.color, 3); return; }
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, rr), 0, 7); ctx.fill(); ctx.stroke();
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

/* ============================================================================
   VẼ HÌNH HỌC PHẲNG GeoGebra — đoạn / tia / véc-tơ / đa giác / góc / chữ /
   cung / quạt / elíp / hypebôn / ảnh
   ============================================================================ */
function geomStyle(o, alpha) {
  ctx.save();
  ctx.strokeStyle = o.color; ctx.fillStyle = o.color;
  ctx.lineWidth = state.opts.thick; ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 10; }
  if (alpha !== undefined) ctx.globalAlpha = alpha;
}
function geomDot(sx, sy, color, r) {
  ctx.save();
  if (state.opts.glow) { ctx.shadowColor = color; ctx.shadowBlur = 10; }
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(sx, sy, r || 4.5, 0, 7); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, 7); ctx.fill();
  ctx.restore();
}
function geomArrow(sx, sy, ang, color) {
  const L = 11, a = 0.42;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.4; ctx.lineCap = "round";
  if (state.opts.glow) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx - L * Math.cos(ang - a), sy - L * Math.sin(ang - a));
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx - L * Math.cos(ang + a), sy - L * Math.sin(ang + a));
  ctx.stroke(); ctx.restore();
}
function geomLabel(text, sx, sy, color) {
  const isDark = state.opts.theme === "dark";
  ctx.save();
  ctx.font = "700 12px 'Be Vietnam Pro',sans-serif";
  ctx.lineWidth = 3;
  ctx.strokeStyle = isDark ? "rgba(6,6,15,.85)" : "rgba(255,255,255,.92)";
  ctx.strokeText(text, sx + 8, sy - 9);
  ctx.fillStyle = color || (isDark ? "#fff" : "#0f172a");
  ctx.fillText(text, sx + 8, sy - 9);
  ctx.restore();
}
/* LOD vô hạn: bỏ qua hình ngoài màn hình / nhỏ hơn pixel để giữ 60fps */
function offScreen2(ax, ay, bx, by) {
  const M = 200;
  if (!isFinite(ax) || !isFinite(ay) || !isFinite(bx) || !isFinite(by)) return true;
  if (Math.abs(ax) > 5e6 || Math.abs(ay) > 5e6 || Math.abs(bx) > 5e6 || Math.abs(by) > 5e6) return true;
  return (ax < -M && bx < -M) || (ax > W + M && bx > W + M) || (ay < -M && by < -M) || (ay > H + M && by > H + M);
}
function drawSegment(o) {
  const [ax, ay] = toScreen(o.x1, o.y1), [bx, by] = toScreen(o.x2, o.y2);
  if (offScreen2(ax, ay, bx, by)) return;
  if (Math.hypot(ax - bx, ay - by) < 1.2) { geomDot((ax + bx) / 2, (ay + by) / 2, o.color, 3.5); return; } // quá nhỏ → chấm
  geomStyle(o); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore();
  geomDot(ax, ay, o.color); geomDot(bx, by, o.color);
  if (!o.hideName) geomLabel(o.name, (ax + bx) / 2, (ay + by) / 2, o.color);
}
function drawRay(o) {
  const [ax, ay] = toScreen(o.x1, o.y1);
  let dx = o.x2 - o.x1, dy = o.y2 - o.y1;
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const [bx, by] = toScreen(o.x1 + dx * 1e4, o.y1 + dy * 1e4);
  const ang = Math.atan2(by - ay, bx - ax);
  geomStyle(o); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore();
  geomArrow(ax + Math.cos(ang) * 26, ay + Math.sin(ang) * 26, ang, o.color);
  geomDot(ax, ay, o.color);
  if (!o.hideName) geomLabel(o.name, ax, ay, o.color);
}
function drawVector(o) {
  const [ax, ay] = toScreen(o.x1, o.y1), [bx, by] = toScreen(o.x2, o.y2);
  if (offScreen2(ax, ay, bx, by)) return;
  if (Math.hypot(ax - bx, ay - by) < 1.2) { geomDot((ax + bx) / 2, (ay + by) / 2, o.color, 3.5); return; }
  const ang = Math.atan2(by - ay, bx - ax);
  geomStyle(o); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore();
  geomArrow(bx, by, ang, o.color);
  geomDot(ax, ay, o.color);
  if (!o.hideName) geomLabel(o.name, (ax + bx) / 2, (ay + by) / 2, o.color);
}
function drawPolygon(o) {
  if (!o.pts || o.pts.length < 3) return;
  const S = o.pts.map(p => toScreen(p[0], p[1]));
  if (S.some(s => !isFinite(s[0]) || !isFinite(s[1]))) return;
  let minX = 1e18, maxX = -1e18, minY = 1e18, maxY = -1e18;
  for (const [sx, sy] of S) { if (sx < minX) minX = sx; if (sx > maxX) maxX = sx; if (sy < minY) minY = sy; if (sy > maxY) maxY = sy; }
  const M = 200;
  if (maxX < -M || minX > W + M || maxY < -M || minY > H + M) return; // ngoài màn hình → ẩn
  if ((maxX - minX) < 2 && (maxY - minY) < 2) { geomDot((minX + maxX) / 2, (minY + maxY) / 2, o.color, 3.5); return; } // quá nhỏ → chấm
  geomStyle(o);
  ctx.beginPath();
  S.forEach(([sx, sy], i) => { if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy); });
  ctx.closePath();
  ctx.globalAlpha = 0.22; ctx.fillStyle = o.color; ctx.fill();
  ctx.globalAlpha = 1; ctx.stroke();
  ctx.restore();
  for (const [sx, sy] of S) geomDot(sx, sy, o.color, 4);
  if (!o.hideName) geomLabel(o.name, S[0][0], S[0][1], o.color);
}
function angleDegOf(o) {
  const v1x = o.ax - o.bx, v1y = o.ay - o.by, v2x = o.cx - o.bx, v2y = o.cy - o.by;
  const a1 = Math.atan2(v1y, v1x), a2 = Math.atan2(v2y, v2x);
  let d = (a2 - a1) * 180 / Math.PI;
  while (d < 0) d += 360; while (d >= 360) d -= 360;
  if (d > 180) d = 360 - d;
  return { deg: d, a1, a2 };
}
function drawAngle(o) {
  const [bx, by] = toScreen(o.bx, o.by);
  const { deg, a1, a2 } = angleDegOf(o);
  const rPx = 30;
  let s0 = -a1, s1 = -a2, span = a2 - a1;
  while (span < 0) span += Math.PI * 2;
  const small = span <= Math.PI;
  const ccw = small ? true : false;
  if (!small) { const t = s0; s0 = s1; s1 = t; }
  geomStyle(o);
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.arc(bx, by, rPx, s0, s1, ccw); ctx.closePath();
  ctx.globalAlpha = 0.25; ctx.fillStyle = o.color; ctx.fill();
  ctx.globalAlpha = 1; ctx.stroke(); ctx.restore();
  const mid = small ? (a1 + a2) / 2 : (a1 + a2) / 2 + Math.PI;
  geomLabel(`${o.hideName ? "" : o.name + " "}${Math.round(deg * 10) / 10}°`, bx + Math.cos(mid) * (rPx + 10) - 10, by - Math.sin(mid) * (rPx + 10) + 5, o.color);
}
function drawTextObj(o) {
  const [sx, sy] = toScreen(o.x, o.y);
  const isDark = state.opts.theme === "dark";
  ctx.save();
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 8; }
  ctx.font = "600 14px 'Be Vietnam Pro',sans-serif";
  ctx.lineWidth = 3;
  ctx.strokeStyle = isDark ? "rgba(6,6,15,.85)" : "rgba(255,255,255,.92)";
  ctx.strokeText(o.text, sx, sy);
  ctx.fillStyle = o.color; ctx.fillText(o.text, sx, sy);
  ctx.restore();
}
function drawArc(o) {
  const [sx, sy] = toScreen(o.cx, o.cy);
  if (!isFinite(sx) || !isFinite(sy)) return;
  if (sx < -5000 || sx > W + 5000 || sy < -5000 || sy > H + 5000) {
    const pr = o.r * state.view.scale;
    if (!isFinite(pr) || pr < 1) return;
    if (Math.abs(sx) > 2e6 || Math.abs(sy) > 2e6) return;
  }
  const rPx = o.r * state.view.scale;
  if (!isFinite(rPx) || rPx < 0.8) { geomDot(sx, sy, o.color, 3); return; } // quá nhỏ → chấm
  const r = Math.max(1, rPx);
  let a0 = o.a0, a1 = o.a1;
  while (a1 <= a0) a1 += Math.PI * 2;
  if (a1 - a0 >= Math.PI * 2 - 1e-9) a1 = a0 + Math.PI * 2 - 1e-6;
  geomStyle(o); ctx.beginPath(); ctx.arc(sx, sy, r, -a0, -a1, true); ctx.stroke(); ctx.restore();
  const [ex, ey] = toScreen(o.cx + o.r * Math.cos(a1), o.cy + o.r * Math.sin(a1));
  geomDot(sx, sy, o.color, 4); geomDot(ex, ey, o.color, 3.5);
  if (!o.hideName) geomLabel(o.name, ex, ey, o.color);
}
function drawSector(o) {
  const [sx, sy] = toScreen(o.cx, o.cy);
  const r = Math.max(1, o.r * state.view.scale);
  let a0 = o.a0, a1 = o.a1;
  while (a1 <= a0) a1 += Math.PI * 2;
  geomStyle(o);
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.arc(sx, sy, r, -a0, -a1, true); ctx.closePath();
  ctx.globalAlpha = 0.25; ctx.fillStyle = o.color; ctx.fill();
  ctx.globalAlpha = 1; ctx.stroke(); ctx.restore();
  geomDot(sx, sy, o.color, 4);
  if (!o.hideName) geomLabel(o.name, sx + r * 0.5, sy, o.color);
}
function drawEllipse(o) {
  const [sx, sy] = toScreen(o.cx, o.cy);
  if (!isFinite(sx) || !isFinite(sy)) return;
  const rxPx = o.rx * state.view.scale, ryPx = o.ry * state.view.scale;
  if (!isFinite(rxPx) || !isFinite(ryPx)) return;
  if (Math.max(rxPx, ryPx) < 0.8) { geomDot(sx, sy, o.color, 3); return; } // quá nhỏ → chấm
  if (sx < -5000 - rxPx || sx > W + 5000 + rxPx || sy < -5000 - ryPx || sy > H + 5000 + ryPx) return;
  geomStyle(o);
  ctx.beginPath(); ctx.ellipse(sx, sy, Math.max(1, rxPx), Math.max(1, ryPx), -o.rot, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  if (!o.hideName) geomLabel(o.name, sx, sy - Math.max(6, ryPx) - 4, o.color);
}
function drawHyperbola(o) {
  geomStyle(o);
  ctx.beginPath();
  for (const s of [1, -1]) {
    for (let i = 0; i <= 60; i++) {
      const t = -2.2 + (4.4 * i) / 60;
      const lx = s * o.ra * Math.cosh(t), ly = o.rb * Math.sinh(t);
      const wx = o.cx + lx * Math.cos(o.rot) - ly * Math.sin(o.rot);
      const wy = o.cy + lx * Math.sin(o.rot) + ly * Math.cos(o.rot);
      const [sx, sy] = toScreen(wx, wy);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
  }
  ctx.stroke(); ctx.restore();
  const [sx, sy] = toScreen(o.cx, o.cy);
  if (!o.hideName) geomLabel(o.name, sx, sy - 10, o.color);
}
const imgCache = {};
function drawImageObj(o) {
  const [sx, sy] = toScreen(o.x, o.y);
  if (!o.dataUrl) {
    ctx.save(); ctx.strokeStyle = o.color; ctx.setLineDash([6, 4]);
    ctx.strokeRect(sx - 60, sy - 40, 120, 80); ctx.setLineDash([]); ctx.restore();
    geomLabel(o.name + " (trống)", sx - 60, sy - 40, o.color);
    return;
  }
  let im = imgCache[o.id];
  if (!im) {
    im = new Image(); im.onload = () => draw();
    im.src = o.dataUrl; imgCache[o.id] = im;
    return;
  }
  if (!im.complete || !im.naturalWidth) return;
  const w = o.w || 160, h = w * im.naturalHeight / im.naturalWidth;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.4)"; ctx.shadowBlur = 12;
  ctx.drawImage(im, sx - w / 2, sy - h / 2, w, h);
  ctx.restore();
  if (!o.hideName) geomLabel(o.name, sx - w / 2, sy - h / 2, o.color);
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
  /* tham số trùng tên: cập nhật giá trị thay vì tạo mới (kiểu GeoGebra) */
  if (parsed.kind === "param") {
    const ex = state.objects.find(o => o.kind === "param" && o.pname === parsed.pname);
    if (ex) {
      pushHistory();
      ex.pvalue = parsed.pvalue; ex.expr = String(expr).trim();
      ex.name = parsed.pname; state.params[parsed.pname] = parsed.pvalue;
      state.selectedId = ex.id;
      renderList(); refreshParams(); persist();
      return ex;
    }
    state.params[parsed.pname] = parsed.pvalue;
  }
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
  else if (parsed.kind === "param") name = parsed.pname;
  else if (parsed.kind === "segment") name = `D${state.seq}`;
  else if (parsed.kind === "ray") name = `T${state.seq}`;
  else if (parsed.kind === "vector") name = `v${state.seq}`;
  else if (parsed.kind === "polygon") name = `G${state.seq}`;
  else if (parsed.kind === "angle") name = `α${state.seq}`;
  else if (parsed.kind === "text") name = `Tx${state.seq}`;
  else if (parsed.kind === "arc") name = `Arc${state.seq}`;
  else if (parsed.kind === "sector") name = `Sec${state.seq}`;
  else if (parsed.kind === "ellipse") name = `El${state.seq}`;
  else if (parsed.kind === "hyperbola") name = `Hy${state.seq}`;
  else if (parsed.kind === "image") name = `Ảnh${state.seq}`;
  else if (parsed.kind === "line3d") name = `d${state.seq}`;
  else if (parsed.kind === "segment3d") name = `D${state.seq}₃D`;
  else if (parsed.kind === "ray3d") name = `T${state.seq}₃D`;
  else if (parsed.kind === "vector3d") name = `v${state.seq}₃D`;
  else if (parsed.kind === "plane3d") name = `α${state.seq}`;
  else if (parsed.kind === "circle3d") name = `C${state.seq}₃D`;
  else if (parsed.kind === "sphere3d") name = `S${state.seq}c`;
  else if (parsed.kind === "polygon3d") name = `G${state.seq}₃D`;
  else if (parsed.kind === "solid3") name = `K${state.seq}₃D`;
  else if (parsed.kind === "measure3d") name = `M${state.seq}₃D`;
  const obj = {
    id: "o" + Date.now().toString(36) + state.seq,
    name, expr: String(expr).trim(), color: opts.color || nextColor(),
    visible: true, selected: false, ...parsed, error: null,
    born: performance.now(),
  };
  if (!state.opts.animate) obj.born = 0;
  if (parsed.kind === "param") {
    obj.name = parsed.pname;
    if (obj.pmin === undefined) obj.pmin = -10;
    if (obj.pmax === undefined) obj.pmax = 10;
    if (obj.pstep === undefined) obj.pstep = 0.5;
  }
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

/* Biên dịch lại mọi đối tượng phụ thuộc tham số (kéo thanh trượt) */
function refreshParams(redraw = true) {
  for (const o of state.objects) {
    if (!o.expr || o.kind === "param" || o.kind === "image") continue;
    if (!["fn", "implicit", "surface", "vline", "point", "point3d"].includes(o.kind)) continue;
    try {
      const p = parseCommand(o.expr);
      const keep = { id: o.id, name: o.name, color: o.color, visible: o.visible, hideName: o.hideName, born: o.born,
        parents: o.parents, def: o.def, cx: o.cx, cy: o.cy, cr: o.cr, r: o.r };
      for (const k of Object.keys(o)) delete o[k];
      Object.assign(o, keep, p, { error: null });
      // giữ lại cx/cr cho đường tròn (parse mất meta) + parents/def
      if (keep.cx !== undefined && o.cx === undefined) o.cx = keep.cx;
      if (keep.cy !== undefined && o.cy === undefined) o.cy = keep.cy;
      if ((keep.cr !== undefined || keep.r !== undefined) && o.cr === undefined && o.r === undefined) o.cr = keep.cr ?? keep.r;
      if (keep.parents) o.parents = keep.parents;
      if (keep.def) o.def = keep.def;
    } catch (e) { o.error = e.message; }
  }
  refreshTableSelect();
  if (redraw) { draw(); persist(); }
}

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
      <div class="obj-main"><div class="obj-name">${prettyRowLabel(o)}</div>
      <div class="obj-expr" title="${escapeHtml(o.expr)} — nhấp để sửa">${prettyRowBody(o)}</div>${o.error ? `<div class="obj-err">${escapeHtml(o.error)}</div>` : ""}</div>
      <div class="obj-btns">
        <button data-a="eye" title="${o.visible ? "Ẩn" : "Hiện"}">${o.visible ? "👁" : "🚫"}</button>
        <button data-a="more" title="Tùy chọn">⋯</button>
        <button data-a="del" title="Xóa">🗑</button>
      </div>`;
    if (o.kind === "param") {
      const prow = document.createElement("div");
      prow.className = "param-slider";
      prow.innerHTML = `<input type="range" min="${o.pmin ?? -10}" max="${o.pmax ?? 10}" step="${o.pstep ?? 0.5}" value="${o.pvalue}" aria-label="Thanh trượt ${escapeHtml(o.pname)}" /><b>${round2(o.pvalue)}</b>`;
      const rng = prow.querySelector("input"), val = prow.querySelector("b");
      rng.addEventListener("pointerdown", () => { rng.dataset.armed = "1"; });
      rng.addEventListener("focus", () => { rng.dataset.armed = "1"; });
      rng.addEventListener("input", () => {
        if (rng.dataset.armed) { pushHistory(); rng.dataset.armed = ""; }
        o.pvalue = parseFloat(rng.value); state.params[o.pname] = o.pvalue;
        o.expr = `${o.pname} = ${o.pvalue}`;
        const nm = row.querySelector(".obj-expr"); if (nm) nm.textContent = o.expr;
        val.textContent = round2(o.pvalue);
        refreshParams(false); draw(); refreshTableSelect();
      });
      rng.addEventListener("change", () => { rng.dataset.armed = ""; renderList($("#algebraSearch").value); draw(); persist(); });
      prow.addEventListener("click", (e) => e.stopPropagation());
      row.appendChild(prow);
      row.classList.add("is-param");
    }
    row.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) {
        state.selectedId = o.id;
        // kiểu GeoGebra: nhấp công thức -> nạp text gốc vào ô nhập để sửa
        if (e.target.closest(".obj-expr")) {
          const ci = $("#cmdInput");
          if (ci) { ci.value = o.expr; ci.focus(); try { updateCmdPreview(); } catch {} }
        }
        renderList($("#algebraSearch").value); refreshTableSelect(); draw(); return;
      }
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
  try { markusTypeset(list); } catch {}
  try { refreshMarkusContext(); } catch {}
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ---------------- command bar (nay nằm trong panel Đại số kiểu GeoGebra) ---------------- */
let lastAns = 0;
function insertAtCursor(inp, text, caretBack) {
  if (!inp) return;
  const s = inp.selectionStart ?? inp.value.length;
  const e = inp.selectionEnd ?? inp.value.length;
  inp.value = inp.value.slice(0, s) + text + inp.value.slice(e);
  const pos = Math.max(0, s + String(text).length - (caretBack || 0));
  inp.focus();
  try { inp.setSelectionRange(pos, pos); } catch {}
  try { updateCmdPreview(); } catch {}
}
/* Preview công thức kiểu GeoGebra dưới ô nhập (pretty + báo lỗi parse) */
let cmdPreviewTimer = 0;
function updateCmdPreview() {
  const el = $("#cmdPreview"), inp = $("#cmdInput");
  if (!el || !inp) return;
  const v = inp.value.trim();
  if (!v) { el.innerHTML = ""; el.hidden = true; return; }
  el.hidden = false;
  try {
    parseCommand(v);
    el.classList.remove("is-err");
    el.innerHTML = prettyMathHTML(v);
  } catch (err) {
    el.classList.add("is-err");
    el.innerHTML = `<span class="cmd-err">⚠ ${escapeHtml(err && err.message ? err.message : "Chưa hợp lệ")}</span>`;
  }
  try { markusTypeset(el); } catch {}
}
function queueCmdPreview() { clearTimeout(cmdPreviewTimer); cmdPreviewTimer = setTimeout(updateCmdPreview, 120); }
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
    toast(`Đã thêm ${prettyRowLetter(obj)}: ${prettyTextUnicode(obj.expr)}`, "ok");
    input.value = ""; input.focus();
    try { updateCmdPreview(); } catch {}
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
  const _o = { id: "o" + Date.now().toString(36) + state.seq + Math.floor(Math.random() * 99), name: `M${state.seq}(${round2(x)}, ${round2(y)})`, expr: `(${round2(x)}, ${round2(y)})`, kind: "point", x, y, color: color || "#38bdf8", visible: true, error: null, born: state.opts.animate ? performance.now() : 0 };
  state.objects.push(_o);
  renderList($("#algebraSearch").value); draw(); kickAnim(); persist();
  return _o;
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

/* ---- interaction runtime: schedule, undo transaction, overlay ---- */
function mmScheduleDraw() {
  if (interact.drawQueued) return;
  interact.drawQueued = true;
  requestAnimationFrame(() => { interact.drawQueued = false; try { draw(); } catch {} });
}
function mmScheduleAlgebra(force) {
  const now = performance.now();
  if (!force && now - interact.lastAlgebra < 180) return;
  interact.lastAlgebra = now;
  try { renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); } catch {}
  try { refreshTableSelect(); } catch {}
}
function mmBeginDragTx() {
  interact.dragTx = JSON.stringify({ objects: state.objects.map(stripFn), seq: state.seq, colorIdx, params: state.params });
}
function mmCommitDragTx() {
  if (!interact.dragTx) return;
  // 1 drag session = 1 undo step: đẩy trạng thái ĐẦU lên history
  state.history.push(interact.dragTx);
  if (state.history.length > 60) state.history.shift();
  state.future.length = 0;
  interact.dragTx = null;
  try { persist(); } catch {}
}
function mmCancelDragTx() {
  if (!interact.dragTx) return;
  try {
    const d = JSON.parse(interact.dragTx);
    state.seq = d.seq; colorIdx = d.colorIdx; state.params = d.params || {};
    state.objects = d.objects.map(rehydrate);
  } catch {}
  interact.dragTx = null;
  try { renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); refreshTableSelect(); draw(); } catch {}
}
function mmSetHover(hit) {
  const nid = hit ? hit.obj.id : null;
  const npart = hit ? hit.part : null;
  const nv = hit && hit.vertex !== undefined ? hit.vertex : -1;
  if (interact.hoverId === nid && interact.hoverPart === npart && interact.hoverVertex === nv) return;
  interact.hoverId = nid; interact.hoverPart = npart; interact.hoverVertex = nv;
  // cursor + class nhẹ, không mutate dữ liệu
  try {
    canvas.classList.remove("mm-hover-pt", "mm-hover-body", "mm-hover-sel", "mm-dragging");
    if (interact.drag && interact.drag.active) canvas.classList.add("mm-dragging");
    else if (hit) {
      if (hit.rank <= 2) canvas.classList.add("mm-hover-pt");
      else if (hit.rank === 3) canvas.classList.add("mm-hover-body");
      else canvas.classList.add("mm-hover-sel");
    }
    if (mmIsDragTool()) {
      if (interact.drag && interact.drag.active) canvas.style.cursor = "grabbing";
      else if (hit && hit.rank <= 3) canvas.style.cursor = "move";
      else if (hit) canvas.style.cursor = "pointer";
      else canvas.style.cursor = "grab";
    }
  } catch {}
  mmScheduleDraw();
}
function mmDrawInteractOverlay2D() {
  // hover/select halo + drag HUD — nhẹ, giữ visual identity tím
  const hid = interact.hoverId, sid = state.selectedId;
  const did = interact.drag && interact.drag.active ? interact.drag.objId : null;
  const drawHalo = (o, isHover, isSel, isDrag) => {
    if (!o || !o.visible || o.error) return;
    const col = o.color || "#8b5cf6";
    ctx.save();
    ctx.globalAlpha = isDrag ? 0.95 : (isSel ? 0.9 : 0.55);
    ctx.strokeStyle = isSel || isDrag ? "#c4b5fd" : col;
    ctx.fillStyle = col;
    ctx.lineWidth = isSel || isDrag ? 2.2 : 1.6;
    if (state.opts.glow) { ctx.shadowColor = col; ctx.shadowBlur = isSel || isDrag ? 12 : 7; }
    try {
      if (o.kind === "point") {
        const [sx, sy] = toScreen(o.x, o.y);
        ctx.beginPath(); ctx.arc(sx, sy, isDrag ? 11 : 9, 0, 7); ctx.stroke();
        if (isDrag || isSel) { ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 7); ctx.fill(); }
      } else if (o.kind === "segment" || o.kind === "vector" || o.kind === "ray") {
        const [ax, ay] = toScreen(o.x1, o.y1);
        let bx, by;
        if (o.kind === "ray") {
          let dx = o.x2 - o.x1, dy = o.y2 - o.y1; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          [bx, by] = toScreen(o.x1 + dx * 1e4, o.y1 + dy * 1e4);
        } else [bx, by] = toScreen(o.x2, o.y2);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      } else if (o.kind === "polygon" && o.pts) {
        ctx.beginPath();
        o.pts.forEach((p, i) => { const [sx, sy] = toScreen(p[0], p[1]); if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy); });
        ctx.closePath(); ctx.stroke();
      } else if (o.kind === "angle") {
        const [bx, by] = toScreen(o.bx, o.by);
        ctx.beginPath(); ctx.arc(bx, by, 36, 0, 7); ctx.stroke();
      } else if (o.kind === "arc" || o.kind === "sector") {
        const [sx, sy] = toScreen(o.cx, o.cy);
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, (o.r || 0.5) * (state.view.scale || 48)), 0, 7); ctx.stroke();
      } else if (o.kind === "ellipse") {
        const [sx, sy] = toScreen(o.cx, o.cy);
        ctx.beginPath(); ctx.ellipse(sx, sy, Math.max(2, (o.rx || 1) * (state.view.scale || 48)), Math.max(2, (o.ry || 1) * (state.view.scale || 48)), -(o.rot || 0), 0, Math.PI * 2); ctx.stroke();
      } else if (o.kind === "implicit") {
        const meta = mmCircleMetaOf(o);
        if (meta) {
          const [sx, sy] = toScreen(meta.cx, meta.cy);
          ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, meta.r * (state.view.scale || 48)), 0, 7); ctx.stroke();
        }
      } else if (o.kind === "vline") {
        const [sx] = toScreen(o.x, 0);
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
      } else if (o.kind === "text" || o.kind === "image") {
        const [sx, sy] = toScreen(o.x, o.y);
        ctx.strokeRect(sx - 14, sy - 14, 28, 28);
      }
    } catch {}
    ctx.restore();
  };
  try {
    if (hid && hid !== did) { const o = mmGetObj(hid); if (o && o.id !== sid) drawHalo(o, true, false, false); }
    if (sid && sid !== did) { const o = mmGetObj(sid); if (o) drawHalo(o, o.id === hid, true, false); }
    if (did) { const o = mmGetObj(did); if (o) drawHalo(o, false, true, true); }
  } catch {}
  // snap marker
  try {
    if (interact.snapInfo && interact.drag && interact.drag.active) {
      const [sx, sy] = toScreen(interact.snapInfo.x, interact.snapInfo.y);
      ctx.save();
      ctx.strokeStyle = "#34d399"; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 10, sy); ctx.lineTo(sx + 10, sy); ctx.moveTo(sx, sy - 10); ctx.lineTo(sx, sy + 10); ctx.stroke();
      ctx.restore();
    }
  } catch {}
  // drag HUD: tên + tọa độ gần điểm đang kéo
  try {
    if (interact.drag && interact.drag.active) {
      const o = mmGetObj(interact.drag.objId);
      if (o) {
        let wx, wy, label;
        if (o.kind === "point") { wx = o.x; wy = o.y; label = `${mmShortName(o).replace(/\(.*$/, "")} (${mmFmtNum(o.x)}, ${mmFmtNum(o.y)})`; }
        else if (o.kind === "point3d") { wx = o.x; wy = o.y; label = `${mmShortName(o).replace(/\(.*$/, "")} (${mmFmtNum(o.x)}, ${mmFmtNum(o.y)}, ${mmFmtNum(o.z)})`; }
        else if (o.kind === "segment" || o.kind === "vector" || o.kind === "ray") { wx = (o.x1 + o.x2) / 2; wy = (o.y1 + o.y2) / 2; label = `${o.name}`; }
        else if (o.kind === "polygon" && o.pts && o.pts.length) { wx = o.pts[0][0]; wy = o.pts[0][1]; label = `${o.name}`; }
        else if (o.kind === "angle") { wx = o.bx; wy = o.by; try { label = `${o.name} ${Math.round(angleDegOf(o).deg * 10) / 10}°`; } catch { label = o.name; } }
        else if (o.cx !== undefined) { wx = o.cx; wy = o.cy; label = o.name; }
        if (wx !== undefined) {
          const [sx, sy] = toScreen(wx, wy);
          const isDark = state.opts.theme === "dark";
          ctx.save();
          ctx.font = "700 11px 'Be Vietnam Pro','Segoe UI',sans-serif";
          const tw = ctx.measureText(label).width + 16;
          let bx = Math.min(Math.max(sx + 14, 6), W - tw - 6), by = Math.max(sy - 34, 6);
          ctx.fillStyle = isDark ? "rgba(10,8,30,.92)" : "rgba(255,255,255,.95)";
          ctx.strokeStyle = "rgba(139,92,246,.55)"; ctx.lineWidth = 1.2;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(bx, by, tw, 22, 7); else ctx.rect(bx, by, tw, 22);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = isDark ? "#e8e4ff" : "#1e1b4b";
          ctx.fillText(label, bx + 8, by + 15);
          ctx.restore();
        }
      }
    }
  } catch {}
}
function mmDrawInteractOverlay3D() {
  try {
    const sid = state.selectedId, hid = interact.hoverId;
    const did = interact.drag && interact.drag.active ? interact.drag.objId : null;
    const mark = (o, strong) => {
      if (!o || (o.kind !== "point3d" && o.kind !== "point")) return;
      const z = o.kind === "point3d" ? o.z : 0;
      const p = proj3(o.x, o.y, z);
      ctx.save();
      ctx.strokeStyle = strong ? "#c4b5fd" : (o.color || "#8b5cf6");
      ctx.lineWidth = strong ? 2.2 : 1.5;
      ctx.globalAlpha = strong ? 0.95 : 0.6;
      if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 10; }
      ctx.beginPath(); ctx.arc(p.sx, p.sy, strong ? 12 : 9, 0, 7); ctx.stroke();
      ctx.restore();
      // readout XYZ
      if (strong) {
        ctx.save();
        ctx.font = "700 11px 'Be Vietnam Pro',sans-serif";
        const label = `${mmShortName(o).replace(/\(.*$/, "")} (${mmFmtNum(o.x)}, ${mmFmtNum(o.y)}, ${mmFmtNum(typeof o.z === "number" ? o.z : 0)})${interact.drag && interact.drag.zMode ? " · Z" : " · XY"}`;
        const tw = ctx.measureText(label).width + 16;
        const bx = Math.min(Math.max(p.sx + 14, 6), W - tw - 6), by = Math.max(p.sy - 34, 6);
        const isDark = state.opts.theme === "dark";
        ctx.fillStyle = isDark ? "rgba(10,8,30,.92)" : "rgba(255,255,255,.95)";
        ctx.strokeStyle = "rgba(139,92,246,.55)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, tw, 22, 7); else ctx.rect(bx, by, tw, 22);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = isDark ? "#e8e4ff" : "#1e1b4b";
        ctx.fillText(label, bx + 8, by + 15);
        ctx.restore();
      }
    };
    if (hid && hid !== did) { const o = mmGetObj(hid); if (o && o.id !== sid) mark(o, false); }
    if (sid && sid !== did) { const o = mmGetObj(sid); if (o) mark(o, true); }
    if (did) { const o = mmGetObj(did); if (o) mark(o, true); }
  } catch {}
}
/* ---------------- pointer interaction (2D pan/zoom + 3D orbit như GeoGebra) ---------------- */
let drag = null;
function mmIsLinearFn(o) {
  if (!o || o.kind !== "fn") return false;
  const ex = String(o.expr || "").replace(/\s+/g, "");
  if (/^[+-]?\d*\.?\d+$/.test(ex)) return true; // y = const
  if (/^[+-]?\d*\.?\d*\*?x([+-]\d*\.?\d+)?$/.test(ex)) return true;
  return false;
}
function mmIsDraggableHit(hit) {
  if (!hit || !hit.obj) return false;
  const o = hit.obj;
  if (o.kind === "point" || o.kind === "point3d" || o.kind === "segment" || o.kind === "vector" ||
      o.kind === "ray" || o.kind === "polygon" || o.kind === "angle" || o.kind === "arc" ||
      o.kind === "sector" || o.kind === "ellipse" || o.kind === "text" || o.kind === "image" ||
      o.kind === "vline" || o.kind === "hyperbola") return true;
  if (o.kind === "fn") return mmIsLinearFn(o);
  if (o.kind === "implicit") return !!mmCircleMetaOf(o);
  return false;
}
canvas.addEventListener("pointerdown", (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  mmDbg("down", px, py, state.mode, state.tool);
  if (state.mode === "3d") {
    const t3 = state.tool || "move";
    try { if (typeof mmFlyRaf !== "undefined" && mmFlyRaf) { try { cancelAnimationFrame(mmFlyRaf); } catch {} mmFlyRaf = 0; } } catch {}
    if (!["move", "select", "pan", "m3d-move"].includes(t3)) {
      const fl = screenToFloor(px, py);
      let z = 0;
      const sel = state.objects.find(o => o.id === state.selectedId && o.kind === "surface");
      if (sel) { try { const zz = sel.fn(fl.x, fl.y); if (isFinite(zz)) z = clamp(zz, -8, 8); } catch {} }
      state.lastClick3d = { x: fl.x, y: fl.y, z };
      handleToolClick3D(fl.x, fl.y, z, px, py);
      return;
    }
    if (t3 === "pan") {
      interact.orbit = { sx: e.clientX, sy: e.clientY, az: state.view3d.az, el: state.view3d.el, tx: state.view3d.tx, ty: state.view3d.ty, moved: false, pan: true };
      drag = { mode3d: true, sx: e.clientX, sy: e.clientY, az: state.view3d.az, el: state.view3d.el, tx: state.view3d.tx, ty: state.view3d.ty, moved: false, pan: true };
      return;
    }
    const hit3 = hitTest3D(px, py);
    mmSetHover(hit3 ? { obj: hit3.obj, part: "point", vertex: -1, d: hit3.d, rank: 0 } : null);
    if (hit3) {
      const o = hit3.obj;
      state.selectedId = o.id;
      mmBeginDragTx();
      interact.drag = {
        mode3d: true, candidate: true, active: false, objId: o.id,
        sx: e.clientX, sy: e.clientY, px, py,
        ox: o.x, oy: o.y, oz: o.kind === "point3d" ? o.z : 0,
        zMode: !!e.altKey, noSnap: !!e.altKey, moved: false,
      };
      drag = null;
      try { renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); } catch {}
      mmScheduleDraw();
      return;
    }
    // vùng trống 3D -> orbit / pan (giữ nguyên behavior cũ)
    interact.orbit = { sx: e.clientX, sy: e.clientY, az: state.view3d.az, el: state.view3d.el, tx: state.view3d.tx, ty: state.view3d.ty, moved: false, pan: e.shiftKey || e.button === 2 };
    drag = { mode3d: true, sx: e.clientX, sy: e.clientY, az: state.view3d.az, el: state.view3d.el, tx: state.view3d.tx, ty: state.view3d.ty, moved: false, pan: e.shiftKey || e.button === 2 };
    return;
  }
  const [x, y] = toMath(px, py);
  const t = state.tool || "move";
  if (!["move", "select", "pan"].includes(t)) {
    handleToolClick(x, y, px, py);
    return;
  }
  if (t === "pan") {
    interact.pan = { sx: e.clientX, sy: e.clientY, cx: state.view.cx, cy: state.view.cy, moved: false };
    drag = { sx: e.clientX, sy: e.clientY, cx: state.view.cx, cy: state.view.cy, moved: false };
    return;
  }
  const hit = hitTest2D(px, py);
  mmSetHover(hit);
  if (hit && mmIsDraggableHit(hit)) {
    const o = hit.obj;
    state.selectedId = o.id;
    mmBeginDragTx();
    // snapshot hình học gốc để move-body tính delta
    const snap = { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, pts: o.pts ? o.pts.map(p => [p[0], p[1]]) : null, cx: o.cx, cy: o.cy, cr: o.cr, r: o.r, rx: o.rx, ry: o.ry, ax: o.ax, ay: o.ay, bx: o.bx, by: o.by };
    // nếu kéo endpoint/vertex mà endpoint trùng point nguồn -> kéo luôn point nguồn (giữ dependency)
    let srcPointId = null;
    try {
      const eqP = (wx, wy) => {
        for (const q of state.objects) {
          if (q.kind !== "point" || q.id === o.id) continue;
          if (Math.abs(q.x - wx) < 1e-9 && Math.abs(q.y - wy) < 1e-9) return q.id;
        }
        return null;
      };
      if (o.kind === "segment" || o.kind === "vector") {
        if (hit.part === "p1") srcPointId = (o.def && o.def.p1) || eqP(o.x1, o.y1);
        if (hit.part === "p2") srcPointId = (o.def && o.def.p2) || eqP(o.x2, o.y2);
      } else if (o.kind === "polygon" && hit.part === "vertex" && o.pts) {
        const vv = o.pts[hit.vertex];
        if (vv) srcPointId = (o.def && o.def.vIds && o.def.vIds[hit.vertex]) || eqP(vv[0], vv[1]);
      } else if (o.kind === "angle") {
        if (hit.part === "a") srcPointId = (o.def && o.def.p1) || eqP(o.ax, o.ay);
        if (hit.part === "b") srcPointId = (o.def && o.def.p2) || eqP(o.bx, o.by);
        if (hit.part === "c") srcPointId = (o.def && o.def.p3) || eqP(o.cx, o.cy);
      }
    } catch {}
    interact.drag = {
      candidate: true, active: false, objId: o.id, part: hit.part, vertex: hit.vertex ?? -1,
      sx: e.clientX, sy: e.clientY, px, py, orig: snap, srcPointId,
      world0: { x, y }, noSnap: !!e.altKey, moved: false,
    };
    drag = null;
    try { renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); } catch {}
    mmScheduleDraw();
    return;
  }
  if (hit && !mmIsDraggableHit(hit)) {
    // object chỉ chọn được (hàm, implicit lạ...): chọn ngay, không pan
    state.selectedId = hit.obj.id;
    try { renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); refreshTableSelect(); } catch {}
    mmScheduleDraw();
    interact.pan = null; drag = null;
    return;
  }
  // vùng trống -> pan (giữ nguyên)
  interact.pan = { sx: e.clientX, sy: e.clientY, cx: state.view.cx, cy: state.view.cy, moved: false };
  drag = { sx: e.clientX, sy: e.clientY, cx: state.view.cx, cy: state.view.cy, moved: false };
});
canvas.addEventListener("dblclick", (e) => {
  if (state.mode === "3d" && state.tool === "m3d-polygon" && state.pending.length >= 3) {
    state.pending.splice(-1); // bỏ điểm của cú đúp
    mmFinishPoly3D();
    return;
  }
  if (state.mode !== "2d") return;
  if ((state.tool === "polygon" || state.tool === "oriented" || state.tool === "plist" || state.tool === "regression") && state.pending.length >= 2) {
    state.pending.splice(-2); // bỏ 2 điểm của chính cú đúp
    if (!finishPending()) draw();
  }
});
function mmUpdateDrag2D(px, py, e) {
  const D = interact.drag;
  if (!D || D.mode3d) return;
  const o = mmGetObj(D.objId);
  if (!o) return;
  D.noSnap = !!e.altKey;
  const [wx0, wy0] = toMath(px, py);
  let wx = mmClamp(wx0, -1e9, 1e9), wy = mmClamp(wy0, -1e9, 1e9);
  if (!isFinite(wx) || !isFinite(wy)) return;
  const doSnap = (x, y, exId) => mmSnapDrag(x, y, exId, px, py);
  // 1) kéo hộ point nguồn (giữ dependency) — cho segment/polygon/angle endpoint
  if (D.srcPointId) {
    const sp = mmGetObj(D.srcPointId);
    if (sp && (sp.kind === "point" || sp.kind === "point3d")) {
      const s = doSnap(wx, wy, sp.id);
      sp._oldX = sp.x; sp._oldY = sp.y;
      sp.x = mmClamp(s.x, -1e9, 1e9); sp.y = mmClamp(s.y, -1e9, 1e9);
      mmSyncPointNameExpr(sp);
      propagateUpdates([sp.id]);
      interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
      try { $("#hudCoords").textContent = `x: ${mmFmtNum(sp.x)} · y: ${mmFmtNum(sp.y)}${s.snapped ? " · snap" : ""}`; } catch {}
      mmScheduleDraw(); mmScheduleAlgebra(false);
      return;
    }
  }
  const markOld = (p) => { p._oldX = p.x; p._oldY = p.y; };
  try {
    if (o.kind === "point") {
      const s = doSnap(wx, wy, o.id);
      markOld(o);
      o.x = mmClamp(s.x, -1e9, 1e9); o.y = mmClamp(s.y, -1e9, 1e9);
      mmSyncPointNameExpr(o);
      propagateUpdates([o.id]);
      interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
      try { $("#hudCoords").textContent = `x: ${mmFmtNum(o.x)} · y: ${mmFmtNum(o.y)}${s.snapped ? " · snap" : ""}`; } catch {}
    } else if (o.kind === "point3d" && state.mode === "2d") {
      const s = doSnap(wx, wy, o.id);
      markOld(o);
      o.x = mmClamp(s.x, -1e9, 1e9); o.y = mmClamp(s.y, -1e9, 1e9);
      mmSyncPointNameExpr(o);
      propagateUpdates([o.id]);
      interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
    } else if (o.kind === "segment" || o.kind === "vector" || o.kind === "ray") {
      if (D.part === "p1" || D.part === "p2") {
        const s = doSnap(wx, wy, o.id);
        if (D.part === "p1") { o.x1 = s.x; o.y1 = s.y; } else { o.x2 = s.x; o.y2 = s.y; }
        mmSyncGeomExpr(o);
        interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
      } else {
        // move cả object: delta từ world0, đồng thời dời các point trùng đầu mút
        const dx = wx - D.world0.x, dy = wy - D.world0.y;
        const linked = [];
        if (o.def && (o.def.p1 || o.def.p2)) {
          if (o.def.p1) linked.push(o.def.p1);
          if (o.def.p2) linked.push(o.def.p2);
        } else {
          for (const q of state.objects) {
            if (q.kind !== "point") continue;
            if ((Math.abs(q.x - D.orig.x1) < 1e-9 && Math.abs(q.y - D.orig.y1) < 1e-9) ||
                (Math.abs(q.x - D.orig.x2) < 1e-9 && Math.abs(q.y - D.orig.y2) < 1e-9)) linked.push(q.id);
          }
        }
        const movedIds = [];
        for (const id of linked) {
          const q = mmGetObj(id);
          if (!q) continue;
          const base = (Math.abs(q.x - D.orig.x1) < 1e-9 && Math.abs(q.y - D.orig.y1) < 1e-9) ? { x: D.orig.x1, y: D.orig.y1 } :
                       (Math.abs(q.x - D.orig.x2) < 1e-9 && Math.abs(q.y - D.orig.y2) < 1e-9) ? { x: D.orig.x2, y: D.orig.y2 } : { x: q.x, y: q.y };
          // nếu có def, base là vị trí hiện tại của point (đã có thể bị dời trước đó trong cùng drag? dùng orig + dx)
          markOld(q);
          // tìm base gốc: nếu q trùng orig endpoint thì orig+dx, else q hiện tại +dx? đơn giản: q.x+dx cumulative sẽ nhân đôi khi move nhiều frame.
          // -> dùng orig của point? lưu lần đầu. Ở đây tính từ vị trí snapshot trong dragTx? Đơn giản: đặt lại từ D.orig endpoint + dx nếu trùng, else giữ.
          if (o.def && (o.def.p1 === id || o.def.p2 === id)) {
            // point nguồn: dời theo dx từ vị trí lúc bắt đầu drag (lấy từ dragTx? dùng current - accumulated?).
            // Để tránh cộng dồn, lưu orig của point trong D.linkedOrig lần đầu.
            if (!D.linkedOrig) D.linkedOrig = {};
            if (!D.linkedOrig[id]) D.linkedOrig[id] = { x: q.x, y: q.y };
            q.x = mmClamp(D.linkedOrig[id].x + dx, -1e9, 1e9);
            q.y = mmClamp(D.linkedOrig[id].y + dx * 0 + dy, -1e9, 1e9);
            mmSyncPointNameExpr(q);
            movedIds.push(id);
          } else {
            markOld(q);
            q.x = mmClamp(base.x + dx, -1e9, 1e9); q.y = mmClamp(base.y + dy, -1e9, 1e9);
            mmSyncPointNameExpr(q);
            movedIds.push(id);
          }
        }
        o.x1 = D.orig.x1 + dx; o.y1 = D.orig.y1 + dy;
        o.x2 = D.orig.x2 + dx; o.y2 = D.orig.y2 + dy;
        mmSyncGeomExpr(o);
        if (movedIds.length) propagateUpdates(movedIds);
        interact.snapInfo = null;
      }
    } else if (o.kind === "polygon" && o.pts) {
      if (D.part === "vertex" && D.vertex >= 0) {
        const s = doSnap(wx, wy, o.id);
        o.pts[D.vertex] = [s.x, s.y];
        // nếu vertex có parents, dời luôn point nguồn
        if (o.def && o.def.vIds && o.def.vIds[D.vertex]) {
          const q = mmGetObj(o.def.vIds[D.vertex]);
          if (q && q.kind === "point") { markOld(q); q.x = s.x; q.y = s.y; mmSyncPointNameExpr(q); propagateUpdates([q.id]); }
        }
        mmSyncGeomExpr(o);
        interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
      } else {
        const dx = wx - D.world0.x, dy = wy - D.world0.y;
        o.pts = D.orig.pts.map(p => [p[0] + dx, p[1] + dy]);
        if (o.def && o.def.vIds) {
          if (!D.linkedOrig) D.linkedOrig = {};
          o.def.vIds.forEach((id, i) => {
            const q = mmGetObj(id);
            if (!q) return;
            if (!D.linkedOrig[id]) D.linkedOrig[id] = { x: q.x, y: q.y };
            markOld(q);
            q.x = mmClamp(D.linkedOrig[id].x + dx, -1e9, 1e9);
            q.y = mmClamp(D.linkedOrig[id].y + dy, -1e9, 1e9);
            mmSyncPointNameExpr(q);
          });
          propagateUpdates(o.def.vIds.slice());
        }
        mmSyncGeomExpr(o);
        interact.snapInfo = null;
      }
    } else if (o.kind === "angle") {
      const s = doSnap(wx, wy, o.id);
      if (D.part === "a") { o.ax = s.x; o.ay = s.y; }
      else if (D.part === "b") { o.bx = s.x; o.by = s.y; }
      else if (D.part === "c") { o.cx = s.x; o.cy = s.y; }
      else { const dx = wx - D.world0.x, dy = wy - D.world0.y; o.ax = D.orig.ax + dx; o.ay = D.orig.ay + dy; o.bx = D.orig.bx + dx; o.by = D.orig.by + dy; o.cx = D.orig.cx + dx; o.cy = D.orig.cy + dy; }
      if (o.def) {
        const map = { a: o.def.p1, b: o.def.p2, c: o.def.p3 };
        const id = map[D.part];
        if (id) { const q = mmGetObj(id); if (q) { markOld(q); q.x = s.x; q.y = s.y; mmSyncPointNameExpr(q); propagateUpdates([id]); } }
      }
      mmSyncGeomExpr(o);
      interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
    } else if (o.kind === "arc" || o.kind === "sector") {
      if (D.part === "center") {
        const s = doSnap(wx, wy, o.id);
        o.cx = s.x; o.cy = s.y;
        mmSyncGeomExpr(o);
        interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
      } else {
        const r = Math.hypot(wx - o.cx, wy - o.cy);
        o.r = mmClamp(r, 0.1, 1e6);
        mmSyncGeomExpr(o);
        interact.snapInfo = null;
      }
    } else if (o.kind === "ellipse") {
      if (D.part === "center") {
        const s = doSnap(wx, wy, o.id);
        o.cx = s.x; o.cy = s.y;
        mmSyncGeomExpr(o);
        interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
      } else {
        const dx = wx - o.cx, dy = wy - o.cy;
        const ca = Math.cos(o.rot || 0), sa = Math.sin(o.rot || 0);
        const lx = (dx * ca + dy * sa) / (o.rx || 1), ly = (-dx * sa + dy * ca) / (o.ry || 1);
        const k = mmClamp(Math.hypot(lx, ly) || 1, 0.1, 10);
        o.rx = mmClamp((o.rx || 1) * k, 0.1, 1e6);
        o.ry = mmClamp((o.ry || 1) * k, 0.1, 1e6);
        mmSyncGeomExpr(o);
        interact.snapInfo = null;
      }
    } else if (o.kind === "hyperbola") {
      const s = doSnap(wx, wy, o.id);
      o.cx = s.x; o.cy = s.y;
      mmSyncGeomExpr(o);
      interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
    } else if (o.kind === "text" || o.kind === "image") {
      const s = doSnap(wx, wy, o.id);
      o.x = s.x; o.y = s.y;
      mmSyncGeomExpr(o);
      interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
    } else if (o.kind === "vline") {
      const s = doSnap(wx, wy, o.id);
      o.x = mmClamp(s.x, -1e9, 1e9);
      mmSyncGeomExpr(o);
      interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
    } else if (o.kind === "fn" && mmIsLinearFn(o)) {
      // đường thẳng y=mx+c: tịnh tiến theo delta (dx,dy)
      const dx = wx - D.world0.x, dy = wy - D.world0.y;
      if (o.def && (o.def.p1 || o.def.refId || o.def.aId)) {
        // có dependency: dời các point nguồn rồi recompute
        const ids = [o.def.p1, o.def.p2, o.def.aId].filter(Boolean);
        if (!D.linkedOrig) D.linkedOrig = {};
        for (const id of ids) {
          const q = mmGetObj(id);
          if (!q || q.kind !== "point") continue;
          if (!D.linkedOrig[id]) D.linkedOrig[id] = { x: q.x, y: q.y };
          markOld(q);
          q.x = mmClamp(D.linkedOrig[id].x + dx, -1e9, 1e9);
          q.y = mmClamp(D.linkedOrig[id].y + dy, -1e9, 1e9);
          mmSyncPointNameExpr(q);
        }
        if (o.def.aId && !o.def.p1) {
          // perp/parallel neo thô (ax,ay): dời neo
          if (D.origAx === undefined) { D.origAx = o.def.ax; D.origAy = o.def.ay; }
          o.def.ax = D.origAx + dx; o.def.ay = D.origAy + dy;
        }
        propagateUpdates(ids.length ? ids : [o.id]);
        // recompute line từ propagate nếu o phụ thuộc chính nó? đảm bảo recompute o
        try { recomputeObject(o); } catch {}
      } else {
        // tự do: đổi c (giữ m)
        const ex = String(o.expr || "").replace(/\s+/g, "");
        let m = 0, c0 = 0, isConst = false;
        if (/^[+-]?\d*\.?\d+$/.test(ex)) { m = 0; c0 = parseFloat(ex); isConst = true; }
        else {
          const mm = ex.match(/^([+-]?\d*\.?\d*)\*?x([+-].+)?$/);
          if (mm) {
            let ms = mm[1];
            if (ms === "" || ms === "+") m = 1; else if (ms === "-") m = -1; else m = parseFloat(ms);
            c0 = mm[2] ? parseFloat(mm[2]) : 0;
          }
        }
        if (!isFinite(m)) m = 0; if (!isFinite(c0)) c0 = 0;
        const nc = c0 + dy - m * dx;
        o.expr = isConst || Math.abs(m) < 5e-4 ? `${mmFmtNum(nc)}` : `${mmFmtNum(m)}*x + ${mmFmtNum(nc)}`;
        try { const p = parseCommand(o.expr); o.kind = p.kind; if (p.kind === "fn") o.fn = p.fn; else if (p.kind === "vline") o.x = p.x; o.error = null; } catch (err) { o.error = err.message; }
      }
      interact.snapInfo = null;
    } else if (o.kind === "implicit" && mmCircleMetaOf(o)) {
      if (o.def && o.def.cId && o.def.rId) {
        if (D.part === "center") {
          const c = mmGetObj(o.def.cId);
          if (c) {
            const s = doSnap(wx, wy, c.id);
            markOld(c); c.x = s.x; c.y = s.y; mmSyncPointNameExpr(c);
            propagateUpdates([c.id]);
            interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
          }
        } else {
          const rPt = mmGetObj(o.def.rId), cPt = mmGetObj(o.def.cId);
          if (rPt && cPt) {
            const s = doSnap(wx, wy, rPt.id);
            markOld(rPt); rPt.x = s.x; rPt.y = s.y; mmSyncPointNameExpr(rPt);
            propagateUpdates([rPt.id]);
            interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
          } else {
            const meta = mmCircleMetaOf(o);
            const r = Math.hypot(wx - meta.cx, wy - meta.cy);
            o.cx = meta.cx; o.cy = meta.cy; o.cr = mmClamp(r, 0.1, 1e6);
            mmSyncGeomExpr(o);
            try { const p = parseCommand(o.expr); o.fn = p.fn; o.error = null; } catch {}
          }
        }
      } else {
        const meta = mmCircleMetaOf(o);
        if (!meta) return;
        if (D.part === "center") {
          const s = doSnap(wx, wy, o.id);
          o.cx = s.x; o.cy = s.y; o.cr = meta.r;
          if (o.cr === undefined && o.r !== undefined) o.r = meta.r;
          mmSyncGeomExpr(o);
          try { const p = parseCommand(o.expr); o.fn = p.fn; o.cx = meta.cx; o.cy = meta.cy; o.error = null; } catch {}
          // parseCommand mất cx/cr -> giữ lại
          o.cx = s.x; o.cy = s.y; o.cr = meta.r;
          try { const p2 = parseCommand(o.expr); o.fn = p2.fn; } catch {}
          interact.snapInfo = s.snapped ? { x: s.x, y: s.y } : null;
        } else {
          const r = Math.hypot(wx - meta.cx, wy - meta.cy);
          const nr = mmClamp(r, 0.1, 1e6);
          o.cx = meta.cx; o.cy = meta.cy; o.cr = nr;
          mmSyncGeomExpr(o);
          try { const p = parseCommand(o.expr); o.fn = p.fn; o.error = null; } catch {}
          o.cx = meta.cx; o.cy = meta.cy; o.cr = nr;
          interact.snapInfo = null;
        }
      }
    }
  } catch (err) { mmDbg("drag err", err); }
  mmScheduleDraw(); mmScheduleAlgebra(false);
}
function mmUpdateDrag3D(px, py, e) {
  const D = interact.drag;
  if (!D || !D.mode3d) return;
  const o = mmGetObj(D.objId);
  if (!o) return;
  D.zMode = !!e.altKey;
  try {
    if (D.zMode) {
      const sc = state.view3d.scale || 36;
      const dz = (D.sy - e.clientY) / sc;
      o.z = mmClamp(mmRound2(D.oz + dz), -50, 50);
      mmSyncPointNameExpr(o);
    } else {
      const r = screenToPlaneZ(px, py, D.oz);
      o.x = mmClamp(r.x, -500, 500); o.y = mmClamp(r.y, -500, 500);
      mmSyncPointNameExpr(o);
    }
    propagateUpdates([o.id]);
    try { $("#hudCoords").textContent = `x: ${mmFmtNum(o.x)} · y: ${mmFmtNum(o.y)} · z: ${mmFmtNum(o.z ?? 0)}${D.zMode ? " · Z" : " · XY"}`; } catch {}
  } catch {}
  mmScheduleDraw(); mmScheduleAlgebra(false);
}
canvas.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  if (state.mode === "3d") {
    if (interact.drag && interact.drag.mode3d) {
      const D = interact.drag;
      if (!D.active && Math.hypot(e.clientX - D.sx, e.clientY - D.sy) > DRAG_THRESHOLD) {
        D.active = true;
        try { canvas.classList.add("mm-dragging"); canvas.style.cursor = "grabbing"; } catch {}
      }
      if (D.active) { mmUpdateDrag3D(px, py, e); D.moved = true; }
      return;
    }
    if (interact.orbit) {
      const O = interact.orbit;
      const dx = e.clientX - O.sx, dy = e.clientY - O.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) O.moved = true;
      drag = drag || { mode3d: true, sx: O.sx, sy: O.sy, az: O.az, el: O.el, tx: O.tx, ty: O.ty, moved: O.moved, pan: O.pan };
      if (drag) drag.moved = O.moved;
      if (O.pan || e.shiftKey) {
        const sc = state.view3d.scale || 36;
        const ca = Math.cos(state.view3d.az), sa = Math.sin(state.view3d.az);
        const se = Math.max(0.35, Math.sin(state.view3d.el || 0.9));
        const u = -dx / sc, v = -dy / (se * sc);
        state.view3d.tx = clamp(O.tx + (-ca * u + sa * v), -1e6, 1e6);
        state.view3d.ty = clamp(O.ty + (sa * u + ca * v), -1e6, 1e6);
      } else {
        state.view3d.az = O.az + dx * 0.008;
        state.view3d.el = clamp(O.el + dy * 0.006, 0.12, 1.5);
      }
      draw();
      return;
    }
    // hover 3D
    try {
      let hov = null;
      if (/^m3d-/.test(state.tool || "") && typeof mmPick3D === "function") {
        const pk = mmPick3D(px, py);
        if (pk) hov = { obj: pk.obj, part: "body", vertex: -1, d: pk.d, rank: 2 };
        else {
          const hit3 = hitTest3D(px, py);
          if (hit3) hov = { obj: hit3.obj, part: "point", vertex: -1, d: hit3.d, rank: 0 };
        }
      } else {
        const hit3 = hitTest3D(px, py);
        if (hit3) hov = { obj: hit3.obj, part: "point", vertex: -1, d: hit3.d, rank: 0 };
      }
      mmSetHover(hov);
      if (!hit3) {
        try {
          const fl = screenToFloor(px, py);
          $("#hudCoords").textContent = `x: ${fl.x.toFixed(2)} · y: ${fl.y.toFixed(2)} · kéo để xoay`;
        } catch {}
      } else {
        try { $("#hudCoords").textContent = `${hit3.obj.name} · kéo để di chuyển (Alt=Z)`; } catch {}
      }
    } catch {}
    return;
  }
  const [x, y] = toMath(px, py);
  if (!(interact.drag && interact.drag.active)) {
    try { $("#hudCoords").textContent = `x: ${mmFmtNum(x)} · y: ${mmFmtNum(y)}`; } catch {}
  }
  if (interact.drag && !interact.drag.mode3d) {
    const D = interact.drag;
    if (!D.active && Math.hypot(e.clientX - D.sx, e.clientY - D.sy) > DRAG_THRESHOLD) {
      D.active = true;
      try { canvas.classList.add("mm-dragging"); canvas.style.cursor = "grabbing"; } catch {}
    }
    if (D.active) { mmUpdateDrag2D(px, py, e); D.moved = true; }
    return;
  }
  if (interact.pan) {
    const P = interact.pan;
    const sc = state.view.scale || 48;
    const dx = (e.clientX - P.sx) / sc, dy = (e.clientY - P.sy) / sc;
    if (Math.abs(e.clientX - P.sx) + Math.abs(e.clientY - P.sy) > 3) P.moved = true;
    if (drag) drag.moved = P.moved;
    state.view.cx = P.cx - dx; state.view.cy = P.cy + dy;
    sanitizeView();
    draw();
    return;
  }
  // hover khi không kéo (cả tool dựng hình cũng highlight để gợi snap)
  try {
    const hit = hitTest2D(px, py);
    mmSetHover(hit);
    if (hit && mmIsDraggableHit(hit)) {
      try { $("#hudCoords").textContent = `${hit.obj.name} · kéo để di chuyển`; } catch {}
    }
  } catch {}
});
function mmEndDrag2D(commit) {
  const D = interact.drag;
  if (!D) return;
  try { canvas.classList.remove("mm-dragging"); } catch {}
  interact.snapInfo = null;
  if (!D.active) {
    // click chọn (không drag): giữ selection đã đặt ở pointerdown, cập nhật lastClick
    interact.dragTx = null;
    try {
      const r = canvas.getBoundingClientRect();
      // last pointer pos? dùng world0
      state.lastClick = { x: D.world0.x, y: D.world0.y };
    } catch {}
    try { renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); refreshTableSelect(); draw(); } catch {}
  } else if (commit) {
    mmCommitDragTx();
    try { renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); refreshTableSelect(); draw(); } catch {}
    try {
      const o = mmGetObj(D.objId);
      if (o && o.kind === "point") toast(`${mmShortName(o).replace(/\(.*$/, "")} = (${mmFmtNum(o.x)}, ${mmFmtNum(o.y)})`, "ok");
    } catch {}
  }
  interact.drag = null;
  interact.lastAlgebra = 0;
}
function mmEndDrag3D(commit) {
  const D = interact.drag;
  if (!D) return;
  try { canvas.classList.remove("mm-dragging"); } catch {}
  if (!D.active) {
    interact.dragTx = null;
    try { renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); draw(); } catch {}
  } else if (commit) {
    mmCommitDragTx();
    try { renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); draw(); } catch {}
  }
  interact.drag = null;
}
canvas.addEventListener("pointerup", (e) => {
  mmDbg("up", state.mode);
  if (state.mode === "3d") {
    if (interact.drag && interact.drag.mode3d) { mmEndDrag3D(true); drag = null; return; }
    if (interact.orbit) {
      const O = interact.orbit;
      if (O.moved) { try { persist(); } catch {} }
      else {
        // click vùng trống 3D: bỏ chọn + lưu lastClick
        try {
          const r = canvas.getBoundingClientRect();
          const fl = screenToFloor(e.clientX - r.left, e.clientY - r.top);
          state.lastClick3d = { x: fl.x, y: fl.y, z: 0 };
          state.lastClick = { x: fl.x, y: fl.y };
        } catch {}
        state.selectedId = null;
        try { renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); draw(); } catch {}
      }
      interact.orbit = null; drag = null;
      return;
    }
    drag = null;
    return;
  }
  if (interact.drag && !interact.drag.mode3d) { mmEndDrag2D(true); drag = null; return; }
  if (interact.pan) {
    const P = interact.pan;
    if (P.moved) { try { persist(); } catch {} }
    else {
      // click vùng trống 2D: bỏ chọn
      const r = canvas.getBoundingClientRect();
      const [x, y] = toMath(e.clientX - r.left, e.clientY - r.top);
      state.lastClick = { x, y };
      state.selectedId = null;
      try { renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); refreshTableSelect(); draw(); } catch {}
    }
    interact.pan = null; drag = null;
    return;
  }
  // fallback cũ (tool dựng hình không dùng interact)
  if (drag && drag.moved) { try { persist(); } catch {} }
  if (drag && !drag.moved) {
    const r = canvas.getBoundingClientRect();
    const [x, y] = toMath(e.clientX - r.left, e.clientY - r.top);
    state.lastClick = { x, y };
  }
  drag = null;
});
canvas.addEventListener("pointercancel", (e) => {
  try {
    if (state.mode === "3d" && interact.drag && interact.drag.mode3d) { mmEndDrag3D(true); }
    else if (interact.drag) { mmEndDrag2D(true); }
    interact.pan = null; interact.orbit = null; drag = null;
    try { canvas.classList.remove("mm-dragging"); } catch {}
  } catch {}
});
canvas.addEventListener("pointerleave", (e) => {
  // ra ngoài canvas khi không kéo: xóa hover (không mutate)
  try {
    if (!interact.drag && !interact.pan && !interact.orbit) mmSetHover(null);
  } catch {}
});
/* Keyboard cho interaction: Delete xóa selected, Escape hủy drag/pending (không phá shortcut cũ). */
document.addEventListener("keydown", (e) => {
  try {
    const tag = (e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : "";
    const inField = tag === "input" || tag === "textarea" || tag === "select" || (e.target && e.target.isContentEditable);
    if (e.key === "Escape") {
      if (interact.drag) {
        if (state.mode === "3d") mmCancelDragTx(); else mmCancelDragTx();
        interact.drag = null; interact.snapInfo = null;
        try { canvas.classList.remove("mm-dragging"); } catch {}
        try { draw(); } catch {}
        e.preventDefault();
        return;
      }
      if (state.pending && state.pending.length && !inField) {
        state.pending = [];
        try { draw(); toast("Đã hủy thao tác đang dựng."); } catch {}
        e.preventDefault();
        return;
      }
      if (!inField && state.selectedId) {
        state.selectedId = null;
        try { renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); draw(); } catch {}
      }
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !inField) {
      if (state.selectedId && (state.tool === "move" || state.tool === "select" || !state.tool)) {
        const o = mmGetObj(state.selectedId);
        if (o) {
          e.preventDefault();
          try { removeObject(o.id); toast(`Đã xóa ${o.name}`, "ok"); } catch {}
        }
      }
    }
  } catch {}
});
canvas.addEventListener("contextmenu", (e) => { if (state.mode === "3d") e.preventDefault(); });
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (state.mode === "3d") {
    // zoom vô hạn bám theo chuột: điểm lưới dưới con trỏ đứng yên khi lăn
    // (bước lưới/ticks tự thu gọn theo scale nên không tràn hiệu năng)
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let fl = null;
    try { fl = screenToFloor(px, py); } catch { fl = null; }
    state.view3d.scale = clamp(state.view3d.scale * Math.exp(-e.deltaY * 0.0012), 0.4, 6000);
    if (fl && isFinite(fl.x) && isFinite(fl.y)) {
      try {
        const p1 = proj3(fl.x, fl.y, 0);
        const dx = px - p1.sx, dy = py - p1.sy;
        if (Math.abs(dx) + Math.abs(dy) > 0.5 && Math.abs(dx) + Math.abs(dy) < Math.max(W, H) * 2) {
          const sc = state.view3d.scale || 36;
          const ca = Math.cos(state.view3d.az), sa = Math.sin(state.view3d.az);
          const se = Math.max(0.35, Math.sin(state.view3d.el || 0.9));
          const u = -dx / sc, v = -dy / (se * sc);
          // chỉ neo khi góc nhìn còn "thấy mặt đất" (el không quá bẹt) để không giật
          if (Math.sin(state.view3d.el || 0.9) > 0.25) {
            state.view3d.tx = clamp(state.view3d.tx + (-ca * u + sa * v), -1e6, 1e6);
            state.view3d.ty = clamp(state.view3d.ty + (sa * u + ca * v), -1e6, 1e6);
          }
        }
      } catch {}
    }
    draw(); persist(); return;
  }
  const r = canvas.getBoundingClientRect();
  const px = e.clientX - r.left, py = e.clientY - r.top;
  const [bx, by] = toMath(px, py);
  state.view.scale = clamp(state.view.scale * Math.exp(-e.deltaY * 0.0012), MIN_SCALE, MAX_SCALE);
  // keep cursor anchored
  state.view.cx = bx - (px - W / 2) / state.view.scale;
  state.view.cy = by + (py - H / 2) / state.view.scale;
  sanitizeView(); // zoom vô hạn 1e-12..1e12, ticks tự thưa (100,200…1e12)
  draw(); persist();
}, { passive: false });

/* ============================================================================
   BỘ CÔNG CỤ HÌNH HỌC GeoGebra — modal, hit-test, helpers
   ============================================================================ */
/* Modal nhập liệu mini (số cạnh, độ dài, góc, chữ…) */
function mmModal({ title, fields, okText }) {
  return new Promise((resolve) => {
    const ov = document.createElement("div");
    ov.className = "mm-modal-ov";
    ov.innerHTML = `<div class="mm-modal" role="dialog" aria-label="${escapeHtml(title)}">
      <h3>${escapeHtml(title)}</h3>
      <div class="mm-fields">${fields.map((f, i) => `
        <label>${escapeHtml(f.label)}<input data-k="${escapeHtml(f.key)}" type="${f.type || "text"}"
          value="${escapeHtml(String(f.value ?? ""))}" ${f.min !== undefined ? `min="${f.min}"` : ""} ${f.max !== undefined ? `max="${f.max}"` : ""}
          ${f.step !== undefined ? `step="${f.step}"` : ""} /></label>`).join("")}</div>
      <div class="mm-actions"><button class="link-btn" data-x="cancel">Hủy</button>
      <button class="mini-btn" data-x="ok">${escapeHtml(okText || "Xong")}</button></div>
    </div>`;
    document.body.appendChild(ov);
    const done = (v) => { ov.remove(); resolve(v); };
    const inputs = Array.from(ov.querySelectorAll("input"));
    if (inputs[0]) setTimeout(() => { try { inputs[0].focus(); inputs[0].select(); } catch {} }, 30);
    ov.querySelector('[data-x="cancel"]').addEventListener("click", () => done(null));
    ov.addEventListener("pointerdown", (e) => { if (e.target === ov) done(null); });
    const ok = () => {
      const out = {};
      for (const inp of inputs) out[inp.dataset.k] = inp.type === "number" ? parseFloat(inp.value) : inp.value;
      done(out);
    };
    ov.querySelector('[data-x="ok"]').addEventListener("click", ok);
    ov.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); ok(); }
      if (e.key === "Escape") done(null);
    });
  });
}
/* Phương trình đường thẳng qua điểm theo hướng (dx,dy) */
function lineExprThrough(px, py, dx, dy) {
  if (Math.abs(dx) < 1e-9) return `x = ${round2(px)}`;
  const m = dy / dx, c = py - m * px;
  if (Math.abs(m) < 5e-4) return `${round2(c)}`;
  return `${round2(m)}*x + ${round2(c)}`;
}
/* Hướng của đường tham chiếu tại (x,y): fn / vline / đoạn / implicit */
function refDir(obj, x, y) {
  try {
    if (!obj || obj.error) return null;
    if (obj.kind === "fn") {
      const h = 1e-4, d = (obj.fn(x + h) - obj.fn(x - h)) / (2 * h);
      if (!isFinite(d)) return null;
      return { dx: 1, dy: d };
    }
    if (obj.kind === "vline") return { dx: 0, dy: 1 };
    if (obj.kind === "segment" || obj.kind === "ray" || obj.kind === "vector") {
      const dx = obj.x2 - obj.x1, dy = obj.y2 - obj.y1;
      if (Math.hypot(dx, dy) < 1e-12) return null;
      return { dx, dy };
    }
    if (obj.kind === "implicit") {
      const h = 1e-4;
      const gx = (obj.fn(x + h, y) - obj.fn(x - h, y)) / (2 * h);
      const gy = (obj.fn(x, y + h) - obj.fn(x, y - h)) / (2 * h);
      if (!isFinite(gx) || !isFinite(gy) || Math.hypot(gx, gy) < 1e-9) return null;
      return { dx: -gy, dy: gx }; // tiếp tuyến = vuông góc gradient
    }
  } catch { return null; }
  return null;
}
function selectedLineRef() {
  const o = state.objects.find(s => s.id === state.selectedId);
  if (o && ["fn", "vline", "segment", "ray", "vector", "implicit"].includes(o.kind) && !o.error) return o;
  return state.objects.find(s => ["fn", "vline", "segment", "implicit"].includes(s.kind) && s.visible && !s.error) || null;
}
function selectedPointObj() {
  const o = state.objects.find(s => s.id === state.selectedId);
  if (o && (o.kind === "point" || o.kind === "point3d") && !o.error) return o;
  return null;
}
/* Tâm + bán kính của đường tròn dạng (x-h)^2+(y-k)^2=R */
function parseCircleMeta(expr) {
  const m = String(expr).replace(/\s+/g, "").match(/\(x-(-?[\d.]+)\)\^2\+\(y-(-?[\d.]+)\)\^2=(-?[\d.]+)/);
  if (!m) return null;
  const r2 = parseFloat(m[3]);
  if (!(r2 > 0)) return null;
  return { cx: parseFloat(m[1]), cy: parseFloat(m[2]), r: Math.sqrt(r2) };
}
/* Khoảng cách điểm–đoạn trên màn hình (px) */
function distPtSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}
/* Đối tượng gần điểm chạm nhất (px) — cho Chọn / Xóa / Hiện-ẩn */
function nearestObject(px, py) {
  const [mx, my] = toMath(px, py);
  let best = null, bd = 20;
  for (const o of state.objects) {
    if (!o.visible || o.error) continue;
    let d = Infinity;
    try {
      if (o.kind === "point" || o.kind === "point3d") {
        const [sx, sy] = toScreen(o.x, o.y); d = Math.hypot(px - sx, py - sy);
      } else if (o.kind === "fn") {
        const y = o.fn(mx); if (isFinite(y)) { const [, sy] = toScreen(mx, y); d = Math.abs(py - sy); }
      } else if (o.kind === "vline") {
        const [sx] = toScreen(o.x, 0); d = Math.abs(px - sx);
      } else if (o.kind === "segment" || o.kind === "vector") {
        const [ax, ay] = toScreen(o.x1, o.y1), [bx, by] = toScreen(o.x2, o.y2);
        d = distPtSeg(px, py, ax, ay, bx, by);
      } else if (o.kind === "ray") {
        const [ax, ay] = toScreen(o.x1, o.y1), [bx, by] = toScreen(o.x2, o.y2);
        const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
        const t = ((px - ax) * vx + (py - ay) * vy) / l2;
        d = t < 0 ? Math.hypot(px - ax, py - ay) : distPtSeg(px, py, ax, ay, bx, by);
      } else if (o.kind === "polygon") {
        let m = Infinity;
        const P = o.pts.map(p => toScreen(p[0], p[1]));
        for (let i = 0; i < P.length; i++) {
          const A = P[i], B = P[(i + 1) % P.length];
          m = Math.min(m, distPtSeg(px, py, A[0], A[1], B[0], B[1]));
        }
        d = m;
      } else if (o.kind === "angle" || o.kind === "arc" || o.kind === "sector" || o.kind === "text") {
        const [sx, sy] = toScreen(o.bx ?? o.cx ?? o.x, o.by ?? o.cy ?? o.y);
        d = Math.hypot(px - sx, py - sy);
      } else if (o.kind === "ellipse" || o.kind === "hyperbola") {
        const [sx, sy] = toScreen(o.cx, o.cy);
        d = Math.hypot(px - sx, py - sy) - Math.min(o.rx ?? o.ra ?? 0, o.ry ?? o.rb ?? 0) * state.view.scale;
        d = Math.abs(d);
      }
    } catch { continue; }
    if (d < bd) { bd = d; best = o; }
  }
  return best ? { obj: best, d: bd } : null;
}
/* ============================================================================
   DEPENDENCY + SYNC + SNAP (dynamic geometry)
   - Mọi object hình học giữ tọa độ thật trong field (x/y, x1/y1..., pts...).
   - expr là biểu diễn serialize (để lưu/share/rehydrate), được đồng bộ sau drag.
   - parents: [id...] trỏ tới các point nguồn; def mô tả công thức dựng để recompute.
   ============================================================================ */
function mmSnapToPoint(x, y, excludeId) {
  // tìm point 2D gần nhất trong 14px (để tool mới tự gắn parents)
  let best = null, bd = 14;
  const [qx, qy] = [x, y];
  const tmpPx = toScreen(qx, qy);
  for (const o of state.objects) {
    if (!o.visible || o.error || o.id === excludeId) continue;
    if (o.kind !== "point") continue;
    const [sx, sy] = toScreen(o.x, o.y);
    const d = Math.hypot(tmpPx[0] - sx, tmpPx[1] - sy);
    // tính lại đúng: so px thực? ở đây chỉ có world -> dùng world dist*scale
    const dw = Math.hypot(o.x - x, o.y - y) * (state.view.scale || 48);
    if (dw < bd) { bd = dw; best = o; }
  }
  return best;
}
function mmSnapDrag(x, y, excludeId, px, py) {
  // Ưu tiên: point (12px) > chiếu lên segment/đường (10px) > lưới 0.5 (8px).
  // Giữ Alt để tắt snap (vẽ chính xác).
  try {
    if (typeof window !== "undefined" && window.__mmNoSnap) return { x, y, snapped: false };
  } catch {}
  // caller truyền altHeld qua interact.drag?.noSnap
  if (interact.drag && interact.drag.noSnap) return { x, y, snapped: false };
  const scale = state.view.scale || 48;
  // 1) point
  let bestP = null, bdP = 13;
  for (const o of state.objects) {
    if (!o.visible || o.error || o.id === excludeId) continue;
    if (o.kind !== "point") continue;
    const [sx, sy] = toScreen(o.x, o.y);
    const d = Math.hypot(px - sx, py - sy);
    if (d < bdP) { bdP = d; bestP = o; }
  }
  if (bestP) return { x: bestP.x, y: bestP.y, snapped: true, kind: "point", id: bestP.id };
  // 2) chiếu lên segment / polygon edge / circle rim (10px)
  let bestC = null, bdC = 10;
  const [mx, my] = [x, y];
  for (const o of state.objects) {
    if (!o.visible || o.error || o.id === excludeId) continue;
    try {
      if (o.kind === "segment" || o.kind === "vector") {
        const [ax, ay] = toScreen(o.x1, o.y1), [bx, by] = toScreen(o.x2, o.y2);
        const d = distPtSeg(px, py, ax, ay, bx, by);
        if (d < bdC) {
          const vx = o.x2 - o.x1, vy = o.y2 - o.y1, l2 = vx * vx + vy * vy || 1;
          let t = ((mx - o.x1) * vx + (my - o.y1) * vy) / l2;
          t = mmClamp(t, 0, 1);
          bestC = { x: o.x1 + t * vx, y: o.y1 + t * vy, kind: o.kind }; bdC = d;
        }
      } else if (o.kind === "polygon" && o.pts) {
        const S = o.pts.map(p => toScreen(p[0], p[1]));
        for (let i = 0; i < S.length; i++) {
          const A = S[i], B = S[(i + 1) % S.length];
          const d = distPtSeg(px, py, A[0], A[1], B[0], B[1]);
          if (d < bdC) {
            const P0 = o.pts[i], P1 = o.pts[(i + 1) % o.pts.length];
            const vx = P1[0] - P0[0], vy = P1[1] - P0[1], l2 = vx * vx + vy * vy || 1;
            let t = ((mx - P0[0]) * vx + (my - P0[1]) * vy) / l2;
            t = mmClamp(t, 0, 1);
            bestC = { x: P0[0] + t * vx, y: P0[1] + t * vy, kind: "edge" }; bdC = d;
          }
        }
      } else if (o.kind === "implicit") {
        const meta = mmCircleMetaOf(o);
        if (meta) {
          const [scx, scy] = toScreen(meta.cx, meta.cy);
          const dc = Math.hypot(px - scx, py - scy);
          const rPx = meta.r * scale;
          if (Math.abs(dc - rPx) < bdC) {
            const ang = Math.atan2(my - meta.cy, mx - meta.cx);
            bestC = { x: meta.cx + meta.r * Math.cos(ang), y: meta.cy + meta.r * Math.sin(ang), kind: "circle" };
            bdC = Math.abs(dc - rPx);
          }
        }
      }
    } catch {}
  }
  if (bestC) return { x: bestC.x, y: bestC.y, snapped: true, kind: bestC.kind };
  // 3) lưới 0.5
  const gx = Math.round(x * 2) / 2, gy = Math.round(y * 2) / 2;
  const [gsx, gsy] = toScreen(gx, gy);
  if (Math.hypot(px - gsx, py - gsy) <= 8) return { x: gx, y: gy, snapped: true, kind: "grid" };
  return { x, y, snapped: false };
}
function mmShortName(o) {
  const m = /^([A-Za-zÀ-ỹ][\w]*)/.exec(String(o.name || ""));
  return m ? m[1] : (o.name || "P");
}
function mmSyncPointNameExpr(o) {
  if (o.kind === "point") {
    o.expr = `(${mmFmtNum(o.x)}, ${mmFmtNum(o.y)})`;
    const pre = mmShortName(o).replace(/\(.*$/, "");
    o.name = `${pre}(${mmFmtNum(o.x)}, ${mmFmtNum(o.y)})`;
  } else if (o.kind === "point3d") {
    o.expr = `(${mmFmtNum(o.x)}, ${mmFmtNum(o.y)}, ${mmFmtNum(o.z)})`;
    const pre = mmShortName(o).replace(/\(.*$/, "");
    o.name = `${pre}(${mmFmtNum(o.x)},${mmFmtNum(o.y)},${mmFmtNum(o.z)})`;
  }
}
function mmSyncGeomExpr(o) {
  try {
    if (o.kind === "segment" || o.kind === "ray" || o.kind === "vector") {
      o.expr = `${o.kind}(${mmFmtNum(o.x1)},${mmFmtNum(o.y1)},${mmFmtNum(o.x2)},${mmFmtNum(o.y2)})`;
    } else if (o.kind === "polygon" && o.pts) {
      o.expr = `polygon(${o.pts.map(p => `(${mmFmtNum(p[0])},${mmFmtNum(p[1])})`).join(",")})`;
    } else if (o.kind === "angle") {
      o.expr = `angle(${mmFmtNum(o.ax)},${mmFmtNum(o.ay)},${mmFmtNum(o.bx)},${mmFmtNum(o.by)},${mmFmtNum(o.cx)},${mmFmtNum(o.cy)})`;
    } else if (o.kind === "arc" || o.kind === "sector") {
      const d0 = Math.round((o.a0 || 0) * 180 / Math.PI * 10) / 10;
      const d1 = Math.round((o.a1 || 0) * 180 / Math.PI * 10) / 10;
      o.expr = `${o.kind}(${mmFmtNum(o.cx)},${mmFmtNum(o.cy)},${mmFmtNum(o.r)},${d0},${d1})`;
    } else if (o.kind === "ellipse") {
      const rd = Math.round((o.rot || 0) * 180 / Math.PI * 10) / 10;
      o.expr = `ellipse(${mmFmtNum(o.cx)},${mmFmtNum(o.cy)},${mmFmtNum(o.rx)},${mmFmtNum(o.ry)},${rd})`;
    } else if (o.kind === "hyperbola") {
      const rd = Math.round((o.rot || 0) * 180 / Math.PI * 10) / 10;
      o.expr = `hyperbola(${mmFmtNum(o.cx)},${mmFmtNum(o.cy)},${mmFmtNum(o.ra)},${mmFmtNum(o.rb)},${rd})`;
    } else if (o.kind === "text") {
      const t = String(o.text || "").replace(/"/g, "'").slice(0, 80);
      o.expr = `text("${t}",${mmFmtNum(o.x)},${mmFmtNum(o.y)})`;
    } else if (o.kind === "image") {
      o.expr = `image(${mmFmtNum(o.x)},${mmFmtNum(o.y)},${Math.round(o.w || 160)})`;
    } else if (o.kind === "vline") {
      o.expr = `x = ${mmFmtNum(o.x)}`;
    } else if (o.kind === "implicit" && o.def && (o.def.type === "circle" || o.def.type === "circle3" || o.def.type === "compass" || o.cx !== undefined)) {
      const r = o.cr ?? o.r ?? mmCircleMetaOf(o)?.r ?? 1;
      o.expr = `(x - ${mmFmtNum(o.cx)})^2 + (y - ${mmFmtNum(o.cy)})^2 = ${mmFmtNum(r * r)}`;
    } else if (o.kind === "line3d" || o.kind === "segment3d" || o.kind === "ray3d" || o.kind === "vector3d") {
      const tag = o.kind === "line3d" ? "line3d" : o.kind === "segment3d" ? "seg3d" : o.kind === "ray3d" ? "ray3d" : "vec3d";
      o.expr = `${tag}(${mmFmtNum(o.a[0])},${mmFmtNum(o.a[1])},${mmFmtNum(o.a[2])},${mmFmtNum(o.b[0])},${mmFmtNum(o.b[1])},${mmFmtNum(o.b[2])})`;
    } else if (o.kind === "plane3d") {
      o.expr = `plane3d(${mmFmtNum(o.origin[0])},${mmFmtNum(o.origin[1])},${mmFmtNum(o.origin[2])},${mmFmtNum(o.normal[0])},${mmFmtNum(o.normal[1])},${mmFmtNum(o.normal[2])})`;
    } else if (o.kind === "circle3d") {
      o.expr = `circle3d(${mmFmtNum(o.center[0])},${mmFmtNum(o.center[1])},${mmFmtNum(o.center[2])},${mmFmtNum(o.radius)},${mmFmtNum(o.normal[0])},${mmFmtNum(o.normal[1])},${mmFmtNum(o.normal[2])})`;
    } else if (o.kind === "sphere3d") {
      o.expr = `sphere3d(${mmFmtNum(o.center[0])},${mmFmtNum(o.center[1])},${mmFmtNum(o.center[2])},${mmFmtNum(o.radius)})`;
    } else if (o.kind === "polygon3d") {
      o.expr = `poly3d(${(o.vertices || []).map(v => `(${mmFmtNum(v[0])},${mmFmtNum(v[1])},${mmFmtNum(v[2])})`).join(",")})`;
    } else if (o.kind === "solid3") {
      // expr ngắn gọn để hiển thị; hình học thật nằm trong V/F + def (persist giữ nguyên).
      const nm = { cube: "Khối lập phương", tetra: "Tứ diện", prism: "Lăng trụ", pyramid: "Hình chóp", cyl: "Hình trụ", cone: "Hình nón" }[o.solid3] || o.solid3;
      o.expr = `${nm} 3D (${(o.V || []).length} đỉnh, ${(o.F || []).length} mặt)`;
    } else if (o.kind === "measure3d") {
      o.expr = `${o.mtype || "measure"}(${(o.mrefs || []).join(",")}) = ${mmFmtNum(o.mvalue || 0)}`;
    }
  } catch {}
}
/* ---- Helpers hình học cho tool dựng hình (Mind Math, không dependency ngoài) ---- */
/* Tâm đường tròn ngoại tiếp 3 điểm. Ném lỗi khi thẳng hàng/trùng (để tool báo nhẹ nhàng). */
function mmCircumcenter(ax, ay, bx, by, cx, cy) {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) throw new Error("Ba điểm đang thẳng hàng, không thể tạo đường tròn.");
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  return {
    x: (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d,
    y: (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d,
  };
}
/* Chiếu điểm (x,y) lên đối tượng ref -> điểm gần nhất thuộc hình (cho Điểm thuộc/Dính). */
function mmProjectToObj(x, y, ref) {
  if (!ref || ref.error) return null;
  if (ref.kind === "point" || ref.kind === "point3d") return { x: ref.x, y: ref.y };
  if (ref.kind === "segment" || ref.kind === "vector") {
    const dx = ref.x2 - ref.x1, dy = ref.y2 - ref.y1, l2 = dx * dx + dy * dy;
    if (l2 < 1e-12) return { x: ref.x1, y: ref.y1 };
    const t = Math.min(1, Math.max(0, ((x - ref.x1) * dx + (y - ref.y1) * dy) / l2));
    return { x: ref.x1 + t * dx, y: ref.y1 + t * dy };
  }
  if (ref.kind === "ray") {
    const dx = ref.x2 - ref.x1, dy = ref.y2 - ref.y1, l2 = dx * dx + dy * dy;
    if (l2 < 1e-12) return { x: ref.x1, y: ref.y1 };
    const t = Math.max(0, ((x - ref.x1) * dx + (y - ref.y1) * dy) / l2);
    return { x: ref.x1 + t * dx, y: ref.y1 + t * dy };
  }
  if (ref.kind === "vline") return { x: ref.x, y };
  if (ref.kind === "fn") {
    try { const fy = ref.fn(x); if (isFinite(fy)) return { x, y: fy }; } catch {}
    return null;
  }
  if (ref.kind === "implicit" && ref.cx !== undefined && ref.cr) {
    const dx = x - ref.cx, dy = y - ref.cy, d = Math.hypot(dx, dy) || 1;
    return { x: ref.cx + dx / d * ref.cr, y: ref.cy + dy / d * ref.cr };
  }
  if (ref.kind === "arc" || ref.kind === "sector") {
    const dx = x - ref.cx, dy = y - ref.cy, d = Math.hypot(dx, dy) || 1;
    return { x: ref.cx + dx / d * ref.r, y: ref.cy + dy / d * ref.r };
  }
  if (ref.kind === "ellipse") {
    // xấp xỉ: chiếu xuyên tâm (đủ cho snap điểm thuộc; không giả vờ exact)
    const dx = x - ref.cx, dy = y - ref.cy;
    const ang = Math.atan2(dy, dx) - (ref.rot || 0);
    const px = ref.rx * Math.cos(ang), py = ref.ry * Math.sin(ang);
    const c = Math.cos(ref.rot || 0), s = Math.sin(ref.rot || 0);
    return { x: ref.cx + px * c - py * s, y: ref.cy + px * s + py * c };
  }
  if (ref.kind === "polygon" && ref.pts && ref.pts.length) {
    let best = null, bd = 1e18;
    for (let i = 0; i < ref.pts.length; i++) {
      const A = ref.pts[i], B = ref.pts[(i + 1) % ref.pts.length];
      const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy || 1;
      const t = Math.min(1, Math.max(0, ((x - A[0]) * dx + (y - A[1]) * dy) / l2));
      const qx = A[0] + t * dx, qy = A[1] + t * dy;
      const d = Math.hypot(x - qx, y - qy);
      if (d < bd) { bd = d; best = { x: qx, y: qy }; }
    }
    return best;
  }
  return null;
}
/* Diện tích có dấu + hướng đa giác (CCW > 0, CW < 0). */
function mmPolygonSignedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i], B = pts[(i + 1) % pts.length];
    s += A[0] * B[1] - B[0] * A[1];
  }
  return s / 2;
}
function mmOrientName(pts) {
  const s = mmPolygonSignedArea(pts);
  if (Math.abs(s) < 1e-9) return "suy biến";
  return s > 0 ? "CCW" : "CW";
}
/* Thu thập mọi parents id từ def (tương thích cả def cũ/mới, chống sót dependency). */
function mmDefParents(o) {
  if (o.parents && o.parents.length) return o.parents;
  if (!o.def) return [];
  const out = [];
  for (const v of Object.values(o.def)) {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) for (const u of v) if (typeof u === "string") out.push(u);
  }
  return [...new Set(out.filter(Boolean))];
}
/* Dựng lại 1 object từ parents (nếu có def). Trả về true nếu đã đổi. */
function recomputeObject(o) {
  if (!o || !o.def || !o.parents || !o.parents.length) return false;
  const P = (id) => mmGetObj(id);
  try {
    const D = o.def;
    if (o.kind === "point" && D.type === "midpoint" && D.p1 && D.p2) {
      const a = P(D.p1), b = P(D.p2);
      if (!a || !b || !isFinite(a.x) || !isFinite(b.x)) return false;
      o.x = (a.x + b.x) / 2; o.y = (a.y + b.y) / 2;
      mmSyncPointNameExpr(o);
      return true;
    }
    if ((o.kind === "segment" || o.kind === "ray" || o.kind === "vector") && D.p1 && D.p2) {
      const a = P(D.p1), b = P(D.p2);
      if (!a || !b) return false;
      o.x1 = a.x; o.y1 = a.y; o.x2 = b.x; o.y2 = b.y;
      mmSyncGeomExpr(o);
      return true;
    }
    if (o.kind === "polygon" && D.vIds && D.vIds.length >= 3) {
      const pts = [];
      for (const id of D.vIds) { const q = P(id); if (!q || !isFinite(q.x)) return false; pts.push([q.x, q.y]); }
      o.pts = pts;
      mmSyncGeomExpr(o);
      return true;
    }
    if (o.kind === "angle" && D.p1 && D.p2 && D.p3) {
      const a = P(D.p1), b = P(D.p2), c = P(D.p3);
      if (!a || !b || !c) return false;
      o.ax = a.x; o.ay = a.y; o.bx = b.x; o.by = b.y; o.cx = c.x; o.cy = c.y;
      mmSyncGeomExpr(o);
      return true;
    }
    if (o.kind === "implicit" && D.type === "circle" && D.cId && D.rId) {
      const c = P(D.cId), r = P(D.rId);
      if (!c || !r) return false;
      o.cx = c.x; o.cy = c.y;
      const rr = Math.hypot(r.x - c.x, r.y - c.y);
      if (!(rr > 1e-9)) return false;
      o.cr = rr;
      mmSyncGeomExpr(o);
      try { const p = parseCommand(o.expr); o.fn = p.fn; o.error = null; } catch (e) { o.error = e.message; }
      return true;
    }
    if ((o.kind === "fn" || o.kind === "vline" || o.kind === "implicit") && (D.type === "line" || D.type === "midperp" || D.type === "perp" || D.type === "parallel" || D.type === "bisector")) {
      let nx1, ny1, nx2, ny2;
      if (D.type === "line" && D.p1 && D.p2) {
        const a = P(D.p1), b = P(D.p2);
        if (!a || !b) return false;
        nx1 = a.x; ny1 = a.y; nx2 = b.x; ny2 = b.y;
      } else if (D.type === "midperp" && D.p1 && D.p2) {
        const a = P(D.p1), b = P(D.p2);
        if (!a || !b) return false;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const dx = -(b.y - a.y), dy = b.x - a.x;
        nx1 = mx; ny1 = my; nx2 = mx + dx; ny2 = my + dy;
      } else if ((D.type === "perp" || D.type === "parallel") && D.refId) {
        const ref = P(D.refId);
        if (!ref || ref.error) return false;
        let ax = D.ax, ay = D.ay;
        if (D.aId) { const q = P(D.aId); if (!q) return false; ax = q.x; ay = q.y; }
        // hướng ref tại anchor
        let d = null;
        try {
          if (typeof refDir === "function") d = refDir(ref, ax, ay);
        } catch {}
        if (!d) return false;
        const dir = D.type === "perp" ? { dx: -d.dy, dy: d.dx } : d;
        nx1 = ax; ny1 = ay; nx2 = ax + dir.dx; ny2 = ay + dir.dy;
      } else if (D.type === "bisector" && D.p1 && D.p2 && D.p3) {
        const a = P(D.p1), b = P(D.p2), c = P(D.p3);
        if (!a || !b || !c) return false;
        const ux = a.x - b.x, uy = a.y - b.y, wx = c.x - b.x, wy = c.y - b.y;
        const lu = Math.hypot(ux, uy) || 1, lw = Math.hypot(wx, wy) || 1;
        let dx = ux / lu + wx / lw, dy = uy / lu + wy / lw;
        if (Math.hypot(dx, dy) < 1e-9) { dx = -uy / lu; dy = ux / lu; }
        nx1 = b.x; ny1 = b.y; nx2 = b.x + dx; ny2 = b.y + dy;
      } else return false;
      // dựng lại expr tuyến tính từ 2 điểm (nx1,ny1)-(nx2,ny2)
      let newExpr;
      if (Math.abs(nx2 - nx1) < 1e-9) newExpr = `x = ${mmFmtNum(nx1)}`;
      else {
        const m = (ny2 - ny1) / (nx2 - nx1), c0 = ny1 - m * nx1;
        if (Math.abs(m) < 5e-4) newExpr = `${mmFmtNum(c0)}`;
        else newExpr = `${mmFmtNum(m)}*x + ${mmFmtNum(c0)}`;
      }
      o.expr = newExpr;
      try {
        const p = parseCommand(newExpr);
        o.kind = p.kind;
        if (p.kind === "fn") { o.fn = p.fn; delete o.x; }
        else if (p.kind === "vline") { o.x = p.x; delete o.fn; }
        else { o.fn = p.fn; }
        o.error = null;
      } catch (e) { o.error = e.message; return false; }
      return true;
    }
    /* Điểm thuộc / dính trên đối tượng: chiếu vị trí hiện tại lên ref (giữ dính khi hình gốc đổi). */
    if (o.kind === "point" && (D.type === "pointon" || D.type === "attach") && D.refId) {
      const ref = P(D.refId);
      if (!ref || ref.error) return false;
      const q = mmProjectToObj(o.x, o.y, ref);
      if (!q || !isFinite(q.x)) return false;
      o.x = q.x; o.y = q.y;
      mmSyncPointNameExpr(o);
      return true;
    }
    /* Biến hình điểm (có quan hệ thật — kéo gốc/tâm là ảnh cập nhật). */
    if (o.kind === "point" && D.type === "refpoint" && D.sId && D.cId) {
      const s = P(D.sId), c = P(D.cId);
      if (!s || !c || !isFinite(s.x)) return false;
      o.x = 2 * c.x - s.x; o.y = 2 * c.y - s.y;
      mmSyncPointNameExpr(o);
      return true;
    }
    if (o.kind === "point" && D.type === "translate" && D.sId && D.v1 && D.v2) {
      const s = P(D.sId), a = P(D.v1), b = P(D.v2);
      if (!s || !a || !b || !isFinite(s.x)) return false;
      o.x = s.x + (b.x - a.x); o.y = s.y + (b.y - a.y);
      mmSyncPointNameExpr(o);
      return true;
    }
    if (o.kind === "point" && D.type === "rotate" && D.sId && D.cId && isFinite(D.deg)) {
      const s = P(D.sId), c = P(D.cId);
      if (!s || !c || !isFinite(s.x)) return false;
      const a = (+D.deg) * Math.PI / 180;
      const dx = s.x - c.x, dy = s.y - c.y;
      o.x = c.x + dx * Math.cos(a) - dy * Math.sin(a);
      o.y = c.y + dx * Math.sin(a) + dy * Math.cos(a);
      mmSyncPointNameExpr(o);
      return true;
    }
    if (o.kind === "point" && D.type === "dilate" && D.sId && D.cId && isFinite(D.k)) {
      const s = P(D.sId), c = P(D.cId);
      if (!s || !c || !isFinite(s.x)) return false;
      o.x = c.x + (s.x - c.x) * (+D.k); o.y = c.y + (s.y - c.y) * (+D.k);
      mmSyncPointNameExpr(o);
      return true;
    }
    if (o.kind === "point" && D.type === "refline" && D.sId && D.aId && D.bId) {
      const s = P(D.sId), a = P(D.aId), b = P(D.bId);
      if (!s || !a || !b || !isFinite(s.x)) return false;
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      if (l2 < 1e-12) return false;
      const t = ((s.x - a.x) * dx + (s.y - a.y) * dy) / l2;
      o.x = 2 * (a.x + t * dx) - s.x; o.y = 2 * (a.y + t * dy) - s.y;
      mmSyncPointNameExpr(o);
      return true;
    }
    if (o.kind === "point" && D.type === "refpointline" && D.sId && D.refId) {
      const s = P(D.sId), ref = P(D.refId);
      if (!s || !ref || ref.error || !isFinite(s.x)) return false;
      const d = (typeof refDir === "function") ? refDir(ref, s.x, s.y) : null;
      if (!d) return false;
      // chân đường vuông góc từ s xuống ref: ref đi qua anchor (điểm trên ref gần s nhất)
      let ax = s.x, ay = s.y;
      const q = mmProjectToObj(s.x, s.y, ref);
      // với đường thẳng vô hạn, hình chiếu = đối xứng một nửa; dùng gradient cho implicit
      if (ref.kind === "implicit" && ref.cx !== undefined) {
        const dx = s.x - ref.cx, dy = s.y - ref.cy, dd = Math.hypot(dx, dy) || 1;
        const f = { x: ref.cx + dx / dd * (ref.cr || 1), y: ref.cy + dy / dd * (ref.cr || 1) };
        o.x = 2 * f.x - s.x; o.y = 2 * f.y - s.y;
      } else if (q && (ref.kind === "segment" || ref.kind === "ray" || ref.kind === "vector" || ref.kind === "fn" || ref.kind === "vline")) {
        // chiếu s lên đường vô hạn chứa ref
        let px = ref.x1 ?? s.x, py = ref.y1 ?? s.y, dx = d.dx, dy = d.dy;
        if (ref.kind === "fn") { try { px = s.x; py = ref.fn(s.x); } catch {} }
        if (ref.kind === "vline") { px = ref.x; py = s.y; dx = 0; dy = 1; }
        const l2 = dx * dx + dy * dy || 1;
        const t = ((s.x - px) * dx + (s.y - py) * dy) / l2;
        const fx = px + t * dx, fy = py + t * dy;
        o.x = 2 * fx - s.x; o.y = 2 * fy - s.y;
      } else if (q) { o.x = 2 * q.x - s.x; o.y = 2 * q.y - s.y; }
      else return false;
      mmSyncPointNameExpr(o);
      return true;
    }
    /* Đường tròn: tâm+bán kính (circle), compa (tâm + 2 điểm định r), qua 3 điểm. */
    if (o.kind === "implicit" && (D.type === "circle" || D.type === "compass" || D.type === "circle3")) {
      let cx, cy, rr;
      if (D.type === "circle" && D.cId && D.rId) {
        const c = P(D.cId), r = P(D.rId);
        if (!c || !r) return false;
        cx = c.x; cy = c.y; rr = Math.hypot(r.x - c.x, r.y - c.y);
      } else if (D.type === "compass" && D.cId && D.r1 && D.r2) {
        const c = P(D.cId), a = P(D.r1), b = P(D.r2);
        if (!c || !a || !b) return false;
        cx = c.x; cy = c.y; rr = Math.hypot(b.x - a.x, b.y - a.y);
      } else if (D.type === "circle3" && D.p1 && D.p2 && D.p3) {
        const a = P(D.p1), b = P(D.p2), c = P(D.p3);
        if (!a || !b || !c) return false;
        let cc;
        try { cc = mmCircumcenter(a.x, a.y, b.x, b.y, c.x, c.y); } catch { return false; }
        cx = cc.x; cy = cc.y; rr = Math.hypot(a.x - cx, a.y - cy);
      } else return false;
      if (!(rr > 1e-9) || !isFinite(cx)) return false;
      o.cx = cx; o.cy = cy; o.cr = rr;
      mmSyncGeomExpr(o);
      try { const p = parseCommand(o.expr); o.fn = p.fn; o.error = null; } catch (e) { o.error = e.message; }
      return true;
    }
    /* Bán nguyệt (đường kính p1-p2) và cung/quạt có tâm (cId + điểm đầu/cuối). */
    if ((o.kind === "arc" || o.kind === "sector") && D.type === "semicircle" && D.p1 && D.p2) {
      const a = P(D.p1), b = P(D.p2);
      if (!a || !b) return false;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
      if (!(r > 1e-9)) return false;
      o.cx = cx; o.cy = cy; o.r = r;
      o.a0 = Math.atan2(a.y - cy, a.x - cx); o.a1 = o.a0 + Math.PI;
      mmSyncGeomExpr(o);
      return true;
    }
    if ((o.kind === "arc" || o.kind === "sector") && (D.type === "arc" || D.type === "sector") && D.cId && D.sId && D.eId) {
      const c = P(D.cId), s = P(D.sId), e = P(D.eId);
      if (!c || !s || !e) return false;
      const r = Math.hypot(s.x - c.x, s.y - c.y);
      if (!(r > 1e-9)) return false;
      o.cx = c.x; o.cy = c.y; o.r = r;
      o.a0 = Math.atan2(s.y - c.y, s.x - c.x); o.a1 = Math.atan2(e.y - c.y, e.x - c.x);
      mmSyncGeomExpr(o);
      return true;
    }
    /* Cung/quạt qua 3 điểm (tâm = ngoại tiếp; cung chứa p2). */
    if ((o.kind === "arc" || o.kind === "sector") && (D.type === "arc3" || D.type === "sector3") && D.p1 && D.p2 && D.p3) {
      const a = P(D.p1), b = P(D.p2), c = P(D.p3);
      if (!a || !b || !c) return false;
      let cc;
      try { cc = mmCircumcenter(a.x, a.y, b.x, b.y, c.x, c.y); } catch { return false; }
      const r = Math.hypot(a.x - cc.x, a.y - cc.y);
      if (!(r > 1e-9)) return false;
      let a0 = Math.atan2(a.y - cc.y, a.x - cc.x);
      let a1 = Math.atan2(c.y - cc.y, c.x - cc.x);
      const am = Math.atan2(b.y - cc.y, b.x - cc.x);
      // chuẩn hoá để cung a0->a1 (ngược chiều kim đồng hồ, qua am)
      const TAU = Math.PI * 2;
      const norm = (t) => ((t % TAU) + TAU) % TAU;
      let n0 = norm(a0), n1 = norm(a1), nm = norm(am);
      const between = (t, s, e) => (s <= e ? (t >= s && t <= e) : (t >= s || t <= e));
      if (!between(nm, n0, n1)) { const tmp = n0; n0 = n1; n1 = tmp; }
      o.cx = cc.x; o.cy = cc.y; o.r = r; o.a0 = n0; o.a1 = n1;
      mmSyncGeomExpr(o);
      return true;
    }
    /* Elíp / hypebôn từ 2 tiêu điểm + điểm vành (giữ đúng quan hệ hình học). */
    if (o.kind === "ellipse" && D.type === "ellipse" && D.f1 && D.f2 && D.pId) {
      const f1 = P(D.f1), f2 = P(D.f2), q = P(D.pId);
      if (!f1 || !f2 || !q) return false;
      const d1 = Math.hypot(q.x - f1.x, q.y - f1.y), d2 = Math.hypot(q.x - f2.x, q.y - f2.y);
      const a = (d1 + d2) / 2, c2 = Math.hypot(f2.x - f1.x, f2.y - f1.y) / 2;
      if (!(a > c2 + 1e-9)) return false;
      o.cx = (f1.x + f2.x) / 2; o.cy = (f1.y + f2.y) / 2;
      o.rx = a; o.ry = Math.sqrt(a * a - c2 * c2);
      o.rot = Math.atan2(f2.y - f1.y, f2.x - f1.x);
      mmSyncGeomExpr(o);
      return true;
    }
    if (o.kind === "hyperbola" && D.type === "hyperbola" && D.f1 && D.f2 && D.pId) {
      const f1 = P(D.f1), f2 = P(D.f2), q = P(D.pId);
      if (!f1 || !f2 || !q) return false;
      const d1 = Math.hypot(q.x - f1.x, q.y - f1.y), d2 = Math.hypot(q.x - f2.x, q.y - f2.y);
      const a = Math.abs(d1 - d2) / 2, c2 = Math.hypot(f2.x - f1.x, f2.y - f1.y) / 2;
      if (!(a > 1e-9) || a >= c2 - 1e-9) return false;
      o.cx = (f1.x + f2.x) / 2; o.cy = (f1.y + f2.y) / 2;
      o.ra = a; o.rb = Math.sqrt(c2 * c2 - a * a);
      o.rot = Math.atan2(f2.y - f1.y, f2.x - f1.x);
      mmSyncGeomExpr(o);
      return true;
    }
    /* Parabôn (tiêu điểm + 2 điểm chuẩn) và cônic 5 điểm: dựng lại từ điểm gốc. */
    if (o.kind === "implicit" && D.type === "parabola" && D.fId && D.d1 && D.d2) {
      const F = P(D.fId), B = P(D.d1), C = P(D.d2);
      if (!F || !B || !C) return false;
      const dx = C.x - B.x, dy = C.y - B.y, l2 = dx * dx + dy * dy;
      if (l2 < 1e-12) return false;
      const l = Math.sqrt(l2), nx = -dy / l, ny = dx / l;
      const cc = -(nx * B.x + ny * B.y);
      o.expr = `(x-${mmFmtNum(F.x)})^2+(y-${mmFmtNum(F.y)})^2-(${mmFmtNum(nx)}*x+${mmFmtNum(ny)}*y+${mmFmtNum(cc)})^2 = 0`;
      try { const p = parseCommand(o.expr); o.fn = p.fn; o.error = null; } catch (e) { o.error = e.message; return false; }
      return true;
    }
    if (o.kind === "implicit" && D.type === "conic5" && D.vIds && D.vIds.length === 5) {
      const pts = [];
      for (const id of D.vIds) { const q = P(id); if (!q || !isFinite(q.x)) return false; pts.push([q.x, q.y]); }
      try {
        const X = fitConic5(pts);
        o.expr = conic5Expr(X, pts);
        const p = parseCommand(o.expr); o.fn = p.fn; o.error = null;
      } catch { return false; }
      return true;
    }
    /* Đa giác đều (tâm + đỉnh + n), vector từ điểm, đa giác vector, đa giác có hướng. */
    if (o.kind === "polygon" && D.type === "regpoly" && D.cId && D.vId && isFinite(D.n)) {
      const c = P(D.cId), v = P(D.vId);
      if (!c || !v) return false;
      const r = Math.hypot(v.x - c.x, v.y - c.y);
      if (!(r > 1e-9)) return false;
      const a0 = Math.atan2(v.y - c.y, v.x - c.x);
      const n = Math.min(12, Math.max(3, Math.round(+D.n)));
      o.pts = [];
      for (let i = 0; i < n; i++) {
        const a = a0 + (2 * Math.PI * i) / n;
        o.pts.push([c.x + r * Math.cos(a), c.y + r * Math.sin(a)]);
      }
      mmSyncGeomExpr(o);
      return true;
    }
    if (o.kind === "vector" && D.type === "vecfrom" && D.d1 && D.d2 && D.oId) {
      const a = P(D.d1), b = P(D.d2), q = P(D.oId);
      if (!a || !b || !q) return false;
      o.x1 = q.x; o.y1 = q.y; o.x2 = q.x + (b.x - a.x); o.y2 = q.y + (b.y - a.y);
      mmSyncGeomExpr(o);
      return true;
    }
    if (o.kind === "polygon" && D.type === "vecpoly" && D.polyId) {
      const base = P(D.polyId);
      if (!base || !base.pts) return false;
      let dx = isFinite(+D.dx) ? +D.dx : 0, dy = isFinite(+D.dy) ? +D.dy : 0;
      if (D.v1 && D.v2) {
        const a = P(D.v1), b = P(D.v2);
        if (!a || !b) return false;
        dx = b.x - a.x; dy = b.y - a.y;
      }
      o.pts = base.pts.map(q => [q[0] + dx, q[1] + dy]);
      mmSyncGeomExpr(o);
      return true;
    }
    if (o.kind === "polygon" && (D.type === "oriented" || D.type === "polygon") && D.vIds && D.vIds.length >= 3) {
      const pts = [];
      for (const id of D.vIds) { const q = P(id); if (!q || !isFinite(q.x)) return false; pts.push([q.x, q.y]); }
      o.pts = pts;
      if (D.type === "oriented") o.def.orient = mmOrientName(pts);
      mmSyncGeomExpr(o);
      return true;
    }
    /* Đoạn cố định (gốc + dài + góc): giữ độ dài khi kéo gốc. */
    if (o.kind === "segment" && D.type === "fixedseg" && D.pId && isFinite(D.len)) {
      const p = P(D.pId);
      if (!p || !isFinite(p.x)) return false;
      const a = (+D.ang || 0) * Math.PI / 180;
      o.x1 = p.x; o.y1 = p.y;
      o.x2 = p.x + (+D.len) * Math.cos(a); o.y2 = p.y + (+D.len) * Math.sin(a);
      mmSyncGeomExpr(o);
      return true;
    }
    /* Tia góc cố định (đỉnh + hướng gốc + độ): dựng lại khi điểm gốc đổi. */
    if (o.kind === "ray" && D.type === "anglefixed" && D.vId && D.aId && isFinite(D.deg)) {
      const v = P(D.vId), a = P(D.aId);
      if (!v || !a) return false;
      const base = Math.atan2(a.y - v.y, a.x - v.x) + (+D.deg) * Math.PI / 180;
      o.x1 = v.x; o.y1 = v.y;
      o.x2 = v.x + Math.cos(base); o.y2 = v.y + Math.sin(base);
      mmSyncGeomExpr(o);
      return true;
    }
    /* ============ MIND MATH 3D CONSTRUCTION ENGINE — recompute quan hệ ============ */
    if (o.kind === "point3d" && D.type === "midpoint3d" && D.p1 && D.p2) {
      const a = P(D.p1), b = P(D.p2);
      if (!a || !b || !isFinite(a.x)) return false;
      const az = a.kind === "point3d" ? a.z : 0, bz = b.kind === "point3d" ? b.z : 0;
      o.x = (a.x + b.x) / 2; o.y = (a.y + b.y) / 2; o.z = (az + bz) / 2;
      mmSyncPointNameExpr(o); return true;
    }
    if (o.kind === "point3d" && (D.type === "pointon3d" || D.type === "attach3d") && D.refId) {
      const ref = P(D.refId);
      if (!ref || ref.error) return false;
      const q = (typeof mmProjectToObj3D === "function") ? mmProjectToObj3D([o.x, o.y, o.kind === "point3d" ? o.z : 0], ref) : null;
      if (!q) return false;
      o.x = q[0]; o.y = q[1]; o.z = q[2];
      mmSyncPointNameExpr(o); return true;
    }
    if ((o.kind === "segment3d" || o.kind === "line3d" || o.kind === "ray3d" || o.kind === "vector3d") && D.p1 && D.p2) {
      const a = P(D.p1), b = P(D.p2);
      if (!a || !b) return false;
      o.a = [a.x, a.y, a.kind === "point3d" ? a.z : 0];
      o.b = [b.x, b.y, b.kind === "point3d" ? b.z : 0];
      try { mmSyncGeomExpr(o); } catch {}
      return true;
    }
    if (o.kind === "vector3d" && D.type === "vecfrom3d" && D.d1 && D.d2 && D.oId) {
      const a = P(D.d1), b = P(D.d2), q = P(D.oId);
      if (!a || !b || !q) return false;
      const az = a.kind === "point3d" ? a.z : 0, bz = b.kind === "point3d" ? b.z : 0, qz = q.kind === "point3d" ? q.z : 0;
      const dx = b.x - a.x, dy = b.y - a.y, dz = bz - az;
      o.a = [q.x, q.y, qz]; o.b = [q.x + dx, q.y + dy, qz + dz];
      try { mmSyncGeomExpr(o); } catch {}
      return true;
    }
    if (o.kind === "polygon3d" && D.vIds && D.vIds.length >= 3 && (D.type === "polygon3d" || D.type === "poly3d")) {
      const vs = [];
      for (const id of D.vIds) { const q = P(id); if (!q || !isFinite(q.x)) return false; vs.push([q.x, q.y, q.kind === "point3d" ? q.z : 0]); }
      o.vertices = vs;
      try { mmSyncGeomExpr(o); } catch {}
      return true;
    }
    if (o.kind === "plane3d" && D.type === "plane3" && D.p1 && D.p2 && D.p3) {
      const a = P(D.p1), b = P(D.p2), c = P(D.p3);
      if (!a || !b || !c) return false;
      try {
        const pl = (typeof mmPlaneFrom3 === "function") ? mmPlaneFrom3([a.x, a.y, a.kind === "point3d" ? a.z : 0], [b.x, b.y, b.kind === "point3d" ? b.z : 0], [c.x, c.y, c.kind === "point3d" ? c.z : 0]) : null;
        if (!pl) return false;
        o.origin = pl.origin; o.normal = pl.normal;
        try { mmSyncGeomExpr(o); } catch {}
        return true;
      } catch { return false; }
    }
    if (o.kind === "plane3d" && D.type === "planepar" && D.refId && (D.pId || isFinite(D.px))) {
      const ref = P(D.refId);
      if (!ref || ref.kind !== "plane3d") return false;
      let pp;
      if (D.pId) { const q = P(D.pId); if (!q) return false; pp = [q.x, q.y, q.kind === "point3d" ? q.z : 0]; }
      else pp = [D.px, D.py, D.pz || 0];
      o.origin = pp; o.normal = ref.normal.slice();
      try { mmSyncGeomExpr(o); } catch {}
      return true;
    }
    if (o.kind === "plane3d" && D.type === "planeperp" && D.refId && (D.pId || isFinite(D.px))) {
      const ref = P(D.refId);
      if (!ref) return false;
      let pp;
      if (D.pId) { const q = P(D.pId); if (!q) return false; pp = [q.x, q.y, q.kind === "point3d" ? q.z : 0]; }
      else pp = [D.px, D.py, D.pz || 0];
      let dir = null;
      if (ref.kind === "line3d" || ref.kind === "segment3d" || ref.kind === "ray3d" || ref.kind === "vector3d") {
        dir = [ref.b[0] - ref.a[0], ref.b[1] - ref.a[1], ref.b[2] - ref.a[2]];
      } else if (ref.kind === "plane3d" && D.dir) dir = D.dir.slice();
      if (!dir || (typeof mmLen === "function" ? mmLen(dir) : Math.hypot(dir[0], dir[1], dir[2])) < 1e-9) return false;
      o.origin = pp; o.normal = dir;
      try { mmSyncGeomExpr(o); } catch {}
      return true;
    }
    if (o.kind === "circle3d" && (D.type === "circleCP" || D.type === "circleCR" || D.type === "circle3")) {
      try {
        if (D.type === "circleCP" && D.cId && D.rId) {
          const c = P(D.cId), r = P(D.rId);
          if (!c || !r) return false;
          const cc = [c.x, c.y, c.kind === "point3d" ? c.z : 0], rr = [r.x, r.y, r.kind === "point3d" ? r.z : 0];
          const rad = Math.hypot(rr[0] - cc[0], rr[1] - cc[1], rr[2] - cc[2]);
          if (!(rad > 1e-9)) return false;
          o.center = cc; o.radius = rad;
          if (D.normal) o.normal = D.normal.slice();
          try { mmSyncGeomExpr(o); } catch {}
          return true;
        }
        if (D.type === "circleCR" && D.cId && isFinite(D.r)) {
          const c = P(D.cId);
          if (!c) return false;
          o.center = [c.x, c.y, c.kind === "point3d" ? c.z : 0]; o.radius = +D.r;
          if (D.normal) o.normal = D.normal.slice();
          try { mmSyncGeomExpr(o); } catch {}
          return true;
        }
        if (D.type === "circle3" && D.p1 && D.p2 && D.p3) {
          const a = P(D.p1), b = P(D.p2), c = P(D.p3);
          if (!a || !b || !c) return false;
          const cc = (typeof mmCircle3From3 === "function") ? mmCircle3From3([a.x, a.y, a.kind === "point3d" ? a.z : 0], [b.x, b.y, b.kind === "point3d" ? b.z : 0], [c.x, c.y, c.kind === "point3d" ? c.z : 0]) : null;
          if (!cc) return false;
          o.center = cc.center; o.radius = cc.radius; o.normal = cc.normal;
          try { mmSyncGeomExpr(o); } catch {}
          return true;
        }
      } catch { return false; }
    }
    if (o.kind === "sphere3d" && (D.type === "sphereCP" || D.type === "sphereCR")) {
      const c = P(D.cId);
      if (!c) return false;
      const cc = [c.x, c.y, c.kind === "point3d" ? c.z : 0];
      if (D.type === "sphereCP" && D.rId) {
        const r = P(D.rId);
        if (!r) return false;
        const rad = Math.hypot(r.x - cc[0], r.y - cc[1], (r.kind === "point3d" ? r.z : 0) - cc[2]);
        if (!(rad > 1e-9)) return false;
        o.center = cc; o.radius = rad;
      } else if (D.type === "sphereCR" && isFinite(D.r)) {
        o.center = cc; o.radius = +D.r;
      } else return false;
      try { mmSyncGeomExpr(o); } catch {}
      return true;
    }
    if (o.kind === "solid3" && D.type) {
      try {
        if (typeof mmBuildSolid3 === "function") {
          const built = mmBuildSolid3(o.solid3, D, P);
          if (!built) return false;
          o.V = built.V; o.F = built.F;
          return true;
        }
      } catch { return false; }
    }
    if (o.kind === "measure3d" && D.type) {
      try {
        if (typeof mmMeasureValue === "function") {
          const v = mmMeasureValue(o, P);
          if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return false;
          o.mvalue = v;
          try { mmSyncGeomExpr(o); } catch {}
          return true;
        }
      } catch { return false; }
    }
    if ((o.kind === "line3d" || o.kind === "circle3d" || o.kind === "polygon3d" || o.kind === "point3d") && D.type === "intersect3d" && D.aId && D.bId) {
      try {
        if (typeof mmRecomputeIntersect === "function") {
          return mmRecomputeIntersect(o, D, P);
        }
      } catch { return false; }
    }
    if (o.kind === "line3d" && (D.type === "parallel3d" || D.type === "perp3d") && D.refId) {
      const ref = P(D.refId);
      if (!ref || ref.error) return false;
      let pp = null;
      if (D.pId) { const q = P(D.pId); if (!q) return false; pp = [q.x, q.y, q.kind === "point3d" ? q.z : 0]; }
      else if (isFinite(D.px)) pp = [D.px, D.py, D.pz || 0];
      else return false;
      let dir = null;
      if (D.type === "parallel3d") {
        if (!["line3d", "segment3d", "ray3d", "vector3d"].includes(ref.kind)) return false;
        dir = [ref.b[0] - ref.a[0], ref.b[1] - ref.a[1], ref.b[2] - ref.a[2]];
      } else {
        if (ref.kind === "plane3d") dir = ref.normal.slice();
        else if (["line3d", "segment3d", "ray3d", "vector3d"].includes(ref.kind)) {
          const ab = [ref.b[0] - ref.a[0], ref.b[1] - ref.a[1], ref.b[2] - ref.a[2]];
          const l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
          let t = ((pp[0] - ref.a[0]) * ab[0] + (pp[1] - ref.a[1]) * ab[1] + (pp[2] - ref.a[2]) * ab[2]) / l2;
          if (ref.kind !== "line3d") t = Math.min(1, Math.max(0, t));
          const foot = [ref.a[0] + ab[0] * t, ref.a[1] + ab[1] * t, ref.a[2] + ab[2] * t];
          dir = [pp[0] - foot[0], pp[1] - foot[1], pp[2] - foot[2]];
          if (Math.hypot(dir[0], dir[1], dir[2]) < 1e-9) {
            dir = [ab[1], -ab[0], 0];
            if (Math.hypot(dir[0], dir[1], dir[2]) < 1e-9) dir = [ab[2], 0, -ab[0]];
          }
        } else return false;
      }
      const l = Math.hypot(dir[0], dir[1], dir[2]);
      if (!(l > 1e-9)) return false;
      const nd = [dir[0] / l, dir[1] / l, dir[2] / l];
      o.a = pp; o.b = [pp[0] + nd[0], pp[1] + nd[1], pp[2] + nd[2]];
      try { mmSyncGeomExpr(o); } catch {}
      return true;
    }
    if (o.kind === "point3d" && D.type === "translate3d" && D.sId && D.v1 && D.v2) {
      const s = P(D.sId), a = P(D.v1), b = P(D.v2);
      if (!s || !a || !b || !isFinite(s.x)) return false;
      const sz = s.kind === "point3d" ? s.z : 0, az = a.kind === "point3d" ? a.z : 0, bz = b.kind === "point3d" ? b.z : 0;
      o.x = s.x + (b.x - a.x); o.y = s.y + (b.y - a.y); o.z = sz + (bz - az);
      mmSyncPointNameExpr(o);
      return true;
    }
    if (o.kind === "point3d" && D.type === "refpoint3d" && D.sId && D.cId) {
      const s = P(D.sId), c = P(D.cId);
      if (!s || !c || !isFinite(s.x)) return false;
      const sz = s.kind === "point3d" ? s.z : 0, cz = c.kind === "point3d" ? c.z : 0;
      o.x = 2 * c.x - s.x; o.y = 2 * c.y - s.y; o.z = 2 * cz - sz;
      mmSyncPointNameExpr(o);
      return true;
    }
    if (o.kind === "point3d" && D.type === "refplane3d" && D.sId && D.refId) {
      const s = P(D.sId), ref = P(D.refId);
      if (!s || !ref || ref.kind !== "plane3d" || !isFinite(s.x)) return false;
      const sz = s.kind === "point3d" ? s.z : 0;
      const d = (s.x - ref.origin[0]) * ref.normal[0] + (s.y - ref.origin[1]) * ref.normal[1] + (sz - ref.origin[2]) * ref.normal[2];
      o.x = s.x - 2 * d * ref.normal[0]; o.y = s.y - 2 * d * ref.normal[1]; o.z = sz - 2 * d * ref.normal[2];
      mmSyncPointNameExpr(o);
      return true;
    }
    if (o.kind === "point3d" && D.type === "dilate3d" && D.sId && D.cId && isFinite(D.k)) {
      const s = P(D.sId), c = P(D.cId);
      if (!s || !c || !isFinite(s.x)) return false;
      const sz = s.kind === "point3d" ? s.z : 0, cz = c.kind === "point3d" ? c.z : 0;
      const k = +D.k;
      o.x = c.x + (s.x - c.x) * k; o.y = c.y + (s.y - c.y) * k; o.z = cz + (sz - cz) * k;
      mmSyncPointNameExpr(o);
      return true;
    }
    if (o.kind === "point3d" && D.type === "rotline3d" && D.sId && D.aId && D.bId && isFinite(D.deg)) {
      const s = P(D.sId), a = P(D.aId), b = P(D.bId);
      if (!s || !a || !b || !isFinite(s.x)) return false;
      const U = [a.x, a.y, a.kind === "point3d" ? a.z : 0], Vv = [b.x, b.y, b.kind === "point3d" ? b.z : 0];
      let axis = [Vv[0] - U[0], Vv[1] - U[1], Vv[2] - U[2]];
      const l = Math.hypot(axis[0], axis[1], axis[2]);
      if (!(l > 1e-9)) return false;
      axis = [axis[0] / l, axis[1] / l, axis[2] / l];
      const sz = s.kind === "point3d" ? s.z : 0;
      const rel = [s.x - U[0], s.y - U[1], sz - U[2]];
      const ang = (+D.deg) * Math.PI / 180;
      const c = Math.cos(ang), ss = Math.sin(ang);
      const kv = [axis[1] * rel[2] - axis[2] * rel[1], axis[2] * rel[0] - axis[0] * rel[2], axis[0] * rel[1] - axis[1] * rel[0]];
      const d = axis[0] * rel[0] + axis[1] * rel[1] + axis[2] * rel[2];
      o.x = U[0] + rel[0] * c + kv[0] * ss + axis[0] * d * (1 - c);
      o.y = U[1] + rel[1] * c + kv[1] * ss + axis[1] * d * (1 - c);
      o.z = U[2] + rel[2] * c + kv[2] * ss + axis[2] * d * (1 - c);
      mmSyncPointNameExpr(o);
      return true;
    }
    /* Quỹ tích là đường lấy mẫu (sampled polyline, không phải symbolic exact) — giữ nguyên. */
    if (o.def && o.def.type === "locus") return false;
  } catch { return false; }
  return false;
}
/* Lan truyền thay đổi từ các id nguồn -> mọi object phụ thuộc (BFS, chống vòng). */
function propagateUpdates(changedIds) {
  if (!changedIds || !changedIds.length) return;
  const changed = new Set(changedIds);
  const visited = new Set();
  for (let iter = 0; iter < 12; iter++) {
    let any = false;
    for (const o of state.objects) {
      if (visited.has(o.id)) continue;
      let ps = null;
      try { ps = mmDefParents(o); } catch { ps = null; }
      if (!ps || !ps.length) continue;
      if (ps.some(id => changed.has(id))) {
        try {
          if (recomputeObject(o)) { changed.add(o.id); any = true; }
        } catch {}
        visited.add(o.id);
      }
    }
    if (!any) break;
  }
  // tương thích file cũ (không có parents): khớp tọa độ chính xác với điểm đã đổi
  try { applyLegacyCoordLinks(changedIds); } catch {}
}
function applyLegacyCoordLinks(changedIds) {
  for (const pid of changedIds) {
    const pt = mmGetObj(pid);
    if (!pt || (pt.kind !== "point" && pt.kind !== "point3d")) continue;
    if (pt._oldX === undefined) continue;
    const ox = pt._oldX, oy = pt._oldY, nx = pt.x, ny = pt.y;
    const dx = nx - ox, dy = ny - oy;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) continue;
    const eq = (a, b) => Math.abs(a - b) < 1e-9;
    for (const o of state.objects) {
      if (o.id === pid || o.error) continue;
      if (o.parents && o.parents.length) continue; // đã có parents thì recompute lo
      let touched = false;
      try {
        if (o.kind === "segment" || o.kind === "ray" || o.kind === "vector") {
          if (eq(o.x1, ox) && eq(o.y1, oy)) { o.x1 = nx; o.y1 = ny; touched = true; }
          if (eq(o.x2, ox) && eq(o.y2, oy)) { o.x2 = nx; o.y2 = ny; touched = true; }
          if (touched) mmSyncGeomExpr(o);
        } else if (o.kind === "polygon" && o.pts) {
          for (const q of o.pts) if (eq(q[0], ox) && eq(q[1], oy)) { q[0] = nx; q[1] = ny; touched = true; }
          if (touched) mmSyncGeomExpr(o);
        } else if (o.kind === "angle") {
          if (eq(o.ax, ox) && eq(o.ay, oy)) { o.ax = nx; o.ay = ny; touched = true; }
          if (eq(o.bx, ox) && eq(o.by, oy)) { o.bx = nx; o.by = ny; touched = true; }
          if (eq(o.cx, ox) && eq(o.cy, oy)) { o.cx = nx; o.cy = ny; touched = true; }
          if (touched) mmSyncGeomExpr(o);
        } else if (o.kind === "arc" || o.kind === "sector") {
          if (eq(o.cx, ox) && eq(o.cy, oy)) { o.cx = nx; o.cy = ny; touched = true; }
          if (touched) mmSyncGeomExpr(o);
        } else if (o.kind === "ellipse" || o.kind === "hyperbola") {
          if (eq(o.cx, ox) && eq(o.cy, oy)) { o.cx = nx; o.cy = ny; touched = true; }
          if (touched) mmSyncGeomExpr(o);
        } else if (o.kind === "implicit" && o.cx !== undefined) {
          if (eq(o.cx, ox) && eq(o.cy, oy)) { o.cx = nx; o.cy = ny; touched = true; }
          if (touched) {
            mmSyncGeomExpr(o);
            try { const p = parseCommand(o.expr); o.fn = p.fn; o.error = null; } catch {}
          }
        }
      } catch {}
    }
    delete pt._oldX; delete pt._oldY;
  }
}
/* Cônic tổng quát qua 5 điểm: giải A..F (F=-1) bằng khử Gauss */
function fitConic5(pts) {
  const M = pts.map(([x, y]) => [x * x, x * y, y * y, x, y, -1]);
  const n = 5;
  const A = M.map(r => r.slice(0, 5)), B = M.map(r => -r[5]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-9) throw new Error("5 điểm suy biến — không xác định được cônic duy nhất.");
    [A[c], A[piv]] = [A[piv], A[c]]; [B[c], B[piv]] = [B[piv], B[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      B[r] -= f * B[c];
    }
  }
  const X = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = B[r];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * X[k];
    X[r] = s / A[r][r];
  }
  return X; // [A,B,C,D,E] với F = -1
}
function conic5Expr([A, B, C, D, E], pts) {
  const f = (v) => round2(v);
  const terms = [`${f(A)}*x^2`, `${f(B)}*x*y`, `${f(C)}*y^2`, `${f(D)}*x`, `${f(E)}*y`, "-1"];
  return terms.join(" + ") + " = 0";
}

function mmHint3D(msg, kind) {
  try {
    const el = document.getElementById("m3dHint");
    if (el) {
      el.innerHTML = msg;
      el.classList.toggle("is-active", kind === "ok");
      el.classList.toggle("is-err", kind === "err");
    }
  } catch {}
}
function mmSelPoint3D() {
  const o = state.objects.find(s => s.id === state.selectedId);
  if (o && (o.kind === "point3d" || o.kind === "point") && !o.error) return o;
  return null;
}
function mmSelLine3D() {
  const o = state.objects.find(s => s.id === state.selectedId);
  if (o && ["line3d", "segment3d", "ray3d", "vector3d"].includes(o.kind) && !o.error) return o;
  return null;
}
function mmSelPlane3D() {
  const o = state.objects.find(s => s.id === state.selectedId);
  if (o && o.kind === "plane3d" && !o.error) return o;
  return null;
}
function mmSelPoly3D() {
  const o = state.objects.find(s => s.id === state.selectedId);
  if (o && o.kind === "polygon3d" && !o.error) return o;
  return null;
}
function mmP3(e) { return [e.x, e.y, e.z || 0]; }
function handleToolClick3D(x, y, z, px, py) {
  state.lastClick = { x, y };
  state.lastClick3d = { x, y, z };
  const T = state.tool || "move";
  const R = (v) => Math.round(Number(v) * 100) / 100;
  // công cụ Điểm 2D khi đang ở 3D -> tạo điểm 3D (tương thích cũ)
  if (T === "point") {
    try {
      const rs = (px !== undefined) ? mmResolveClick3D(px, py) : { p: [x, y, z], id: null };
      if (rs.id) {
        const ex = mmGetObj(rs.id);
        state.selectedId = rs.id;
        renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); draw();
        toast(`Đã bắt điểm ${ex ? ex.name : ""} (snap).`, "ok");
        return;
      }
      const o = mmAddDirect3D("point3d", { x: R(rs.p[0]), y: R(rs.p[1]), z: R(rs.p[2]) });
      toast(`Đã tạo điểm 3D ${o.name}`, "ok");
    } catch (e) { toast(e.message, "err"); }
    return;
  }
  if (!/^m3d-/.test(T)) {
    toast("Công cụ này chỉ dùng ở chế độ 2D — hãy bấm nút 2D.", undefined);
    return;
  }
  const snap = (px !== undefined) ? mmResolveClick3D(px, py) : { p: [x, y, z], id: null };
  const P = state.pending;
  const pushSnap = () => {
    if (snap.id) { const q = mmGetObj(snap.id); P.push({ x: q.x, y: q.y, z: q.kind === "point3d" ? q.z : 0, _pid: q.id }); }
    else P.push({ x: R(snap.p[0]), y: R(snap.p[1]), z: R(snap.p[2]), _pid: null });
  };
  const needPoint = (e) => {
    if (!e._pid) {
      // tự tạo điểm 3D tại vị trí click để giữ dependency
      const np = mmAddDirect3D("point3d", { x: R(e.x), y: R(e.y), z: R(e.z || 0) });
      e._pid = np.id; e.x = np.x; e.y = np.y; e.z = np.z;
    }
    return mmGetObj(e._pid);
  };
  try {
    /* --- điểm --- */
    if (T === "m3d-point") {
      if (snap.id) {
        const ex = mmGetObj(snap.id);
        state.selectedId = snap.id;
        renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); draw();
        toast(`Đã bắt điểm ${ex.name} (snap).`, "ok");
      } else {
        const o = mmAddDirect3D("point3d", { x: R(snap.p[0]), y: R(snap.p[1]), z: R(snap.p[2]) });
        toast(`Đã tạo điểm 3D ${o.name}`, "ok");
      }
      return;
    }
    if (T === "m3d-pointon") {
      const pick = (px !== undefined) ? mmPick3D(px, py) : null;
      const ref = pick ? pick.obj : null;
      const okRef = ref && ["segment3d", "line3d", "ray3d", "vector3d", "plane3d", "circle3d", "sphere3d", "polygon3d", "solid3"].includes(ref.kind);
      if (!okRef) { toast("Nhấp lên một đoạn/đường/mặt/cầu/khối để đặt điểm thuộc.", "err"); mmHint3D("Nhấp lên một <b>đoạn / đường / mặt / cầu / khối</b> để đặt điểm thuộc.", "err"); return; }
      const q = mmProjectToObj3D(snap.p, ref);
      if (!q) { toast("Không chiếu được lên đối tượng này.", "err"); return; }
      const o = mmAddDirect3D("point3d", { x: R(q[0]), y: R(q[1]), z: R(q[2]) },
        { parents: [ref.id], def: { type: "pointon3d", refId: ref.id } });
      toast(`Điểm thuộc ${ref.name} — kéo ${ref.name.includes("(") ? "điểm gốc" : ref.name} để kiểm tra.`, "ok");
      mmHint3D(`Đã tạo <b>${o.name}</b> thuộc <b>${ref.name}</b>.`, "ok");
      return;
    }
    if (T === "m3d-midpoint") {
      pushSnap(); draw();
      if (P.length < 2) { toast("Điểm 1 — nhấp điểm 2."); mmHint3D("Đã chọn điểm 1 — <b>nhấp điểm 2</b>.", ""); return; }
      const A = P[0], B = P[1]; state.pending = [];
      const pa = needPoint(A), pb = needPoint(B);
      const az = pa.kind === "point3d" ? pa.z : 0, bz = pb.kind === "point3d" ? pb.z : 0;
      const o = mmAddDirect3D("point3d", { x: R((pa.x + pb.x) / 2), y: R((pa.y + pb.y) / 2), z: R((az + bz) / 2) },
        { color: "#34d399", parents: [pa.id, pb.id], def: { type: "midpoint3d", p1: pa.id, p2: pb.id } });
      toast(`Trung điểm ${o.name}.`, "ok"); draw(); return;
    }
    /* --- đường --- */
    if (["m3d-segment", "m3d-line", "m3d-ray", "m3d-vector"].includes(T)) {
      pushSnap(); draw();
      if (P.length < 2) {
        const msg = { "m3d-segment": "Đầu A — <b>nhấp đầu B</b>.", "m3d-line": "Điểm 1 — <b>nhấp điểm 2</b>.", "m3d-ray": "Gốc tia — <b>nhấp điểm định hướng</b>.", "m3d-vector": "Điểm đặt — <b>nhấp ngọn véc-tơ</b>." }[T];
        toast("Đã chọn điểm 1."); mmHint3D(msg, ""); return;
      }
      const A = P[0], B = P[1]; state.pending = [];
      const pa = needPoint(A), pb = needPoint(B);
      const kind = T === "m3d-segment" ? "segment3d" : T === "m3d-line" ? "line3d" : T === "m3d-ray" ? "ray3d" : "vector3d";
      const az = pa.kind === "point3d" ? pa.z : 0, bz = pb.kind === "point3d" ? pb.z : 0;
      if (Math.hypot(pb.x - pa.x, pb.y - pa.y, bz - az) < 1e-9) { toast("Hai điểm trùng nhau.", "err"); draw(); return; }
      const o = mmAddDirect3D(kind, { a: [pa.x, pa.y, az], b: [pb.x, pb.y, bz] },
        { parents: [pa.id, pb.id], def: { type: "line", p1: pa.id, p2: pb.id } });
      toast(`Đã tạo ${o.name}.`, "ok"); draw(); return;
    }
    if (T === "m3d-vecfrom") {
      pushSnap(); draw();
      if (P.length < 3) { toast(["Điểm 1/3 (đầu hướng).", "Điểm 2/3 (ngọn hướng).", ""][P.length - 1] || "Nhấp điểm đặt."); mmHint3D(`Đã có ${P.length}/3 — <b>${P.length < 2 ? "nhấp tiếp điểm hướng" : "nhấp điểm đặt"}</b>.`, ""); return; }
      const A = P[0], B = P[1], O = P[2]; state.pending = [];
      const pa = needPoint(A), pb = needPoint(B), po = needPoint(O);
      const az = pa.kind === "point3d" ? pa.z : 0, bz = pb.kind === "point3d" ? pb.z : 0, oz = po.kind === "point3d" ? po.z : 0;
      const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = bz - az;
      if (Math.hypot(dx, dy, dz) < 1e-9) { toast("Hai điểm định hướng trùng nhau.", "err"); draw(); return; }
      const o = mmAddDirect3D("vector3d", { a: [po.x, po.y, oz], b: [po.x + dx, po.y + dy, oz + dz] },
        { parents: [pa.id, pb.id, po.id], def: { type: "vecfrom3d", d1: pa.id, d2: pb.id, oId: po.id } });
      toast(`Véc-tơ từ điểm ${o.name}.`, "ok"); draw(); return;
    }
    if (T === "m3d-parallel" || T === "m3d-perp") {
      const ref = mmSelLine3D() || mmSelPlane3D();
      if (!ref) { toast("Hãy chọn một đường/mặt trong Đại số trước.", "err"); mmHint3D("Hãy <b>chọn một đường/mặt</b> trong Đại số trước, rồi nhấp điểm.", "err"); return; }
      let pp, pid = null;
      if (snap.id) { const q = mmGetObj(snap.id); pp = [q.x, q.y, q.kind === "point3d" ? q.z : 0]; pid = q.id; }
      else pp = [R(snap.p[0]), R(snap.p[1]), R(snap.p[2])];
      let dir = null;
      if (T === "m3d-parallel") {
        if (ref.kind === "plane3d") { toast("Song song với mặt phẳng cần công cụ MP song song.", "err"); return; }
        dir = mmSub(ref.b, ref.a);
      } else {
        if (ref.kind === "plane3d") dir = ref.normal.slice();
        else {
          // đường vuông góc qua P: hướng = P - chân chiếu (hạ vuông góc), duy nhất + ý nghĩa
          const ab = mmSub(ref.b, ref.a), l2 = mmDot(ab, ab) || 1;
          const t = mmDot(mmSub(pp, ref.a), ab) / l2;
          const foot = mmAdd(ref.a, mmScale(ab, ref.kind === "line3d" ? t : clamp(t, 0, 1)));
          dir = mmSub(pp, foot);
          if (mmLen(dir) < 1e-9) {
            dir = mmCross(ab, [0, 0, 1]);
            if (mmLen(dir) < 1e-9) dir = mmCross(ab, [0, 1, 0]);
          }
        }
      }
      if (mmLen(dir) < 1e-9) { toast("Hướng suy biến.", "err"); return; }
      const nd = mmNorm(dir);
      const o = mmAddDirect3D("line3d", { a: pp, b: mmAdd(pp, nd) },
        { parents: pid ? [ref.id, pid] : [ref.id], def: { type: T === "m3d-parallel" ? "parallel3d" : "perp3d", refId: ref.id, ...(pid ? { pId: pid } : { px: pp[0], py: pp[1], pz: pp[2] }), dir: nd } });
      // recompute cho perp/parallel 3D (không có trong recompute 2D): tự lan truyền thủ công
      toast(`${T === "m3d-parallel" ? "Song song" : "Vuông góc"} với ${ref.name}: ${o.name}.`, "ok");
      draw(); return;
    }
    if (T === "m3d-polygon") {
      pushSnap(); draw();
      if (P.length >= 4) {
        const F = P[0];
        const last = P[P.length - 1];
        if (Math.hypot(last.x - F.x, last.y - F.y, (last.z || 0) - (F.z || 0)) < 0.4) {
          P.pop(); mmFinishPoly3D(); return;
        }
      }
      toast(`Đỉnh ${P.length} — nhấp điểm đầu để khép / Enter để xong.`);
      mmHint3D(`Đa giác 3D: <b>${P.length} đỉnh</b> — nhấp điểm đầu để khép / <b>Enter</b> để xong.`, "");
      return;
    }
    /* --- mặt phẳng --- */
    if (T === "m3d-plane3") {
      pushSnap(); draw();
      if (P.length < 3) { toast(`Điểm ${P.length}/3 — nhấp tiếp.`); mmHint3D(`Mặt phẳng: đã có <b>${P.length}/3 điểm</b>.`, ""); return; }
      const A = P[0], B = P[1], C = P[2]; state.pending = [];
      const pa = needPoint(A), pb = needPoint(B), pc = needPoint(C);
      try {
        const pl = mmPlaneFrom3([pa.x, pa.y, pa.kind === "point3d" ? pa.z : 0], [pb.x, pb.y, pb.kind === "point3d" ? pb.z : 0], [pc.x, pc.y, pc.kind === "point3d" ? pc.z : 0]);
        const o = mmAddDirect3D("plane3d", { origin: pl.origin, normal: pl.normal, extent: 3.2 },
          { parents: [pa.id, pb.id, pc.id], def: { type: "plane3", p1: pa.id, p2: pb.id, p3: pc.id } });
        toast(`Mặt phẳng ${o.name} qua 3 điểm.`, "ok");
        mmHint3D(`Đã tạo <b>${o.name}</b>: ${mmFmtNum(pl.eq.a)}x+${mmFmtNum(pl.eq.b)}y+${mmFmtNum(pl.eq.c)}z+${mmFmtNum(pl.eq.d)}=0.`, "ok");
      } catch (e) { toast(e.message, "err"); mmHint3D(e.message, "err"); }
      draw(); return;
    }
    if (T === "m3d-planepar") {
      const ref = mmSelPlane3D();
      if (!ref) { toast("Hãy chọn một mặt phẳng trong Đại số trước.", "err"); return; }
      let pp, pid = null;
      if (snap.id) { const q = mmGetObj(snap.id); pp = [q.x, q.y, q.kind === "point3d" ? q.z : 0]; pid = q.id; }
      else pp = [R(snap.p[0]), R(snap.p[1]), R(snap.p[2])];
      const o = mmAddDirect3D("plane3d", { origin: pp, normal: ref.normal.slice(), extent: 3.2 },
        { parents: pid ? [ref.id, pid] : [ref.id], def: { type: "planepar", refId: ref.id, ...(pid ? { pId: pid } : { px: pp[0], py: pp[1], pz: pp[2] }) } });
      toast(`Mặt phẳng song song ${ref.name}: ${o.name}.`, "ok"); draw(); return;
    }
    if (T === "m3d-planeperp") {
      const ref = mmSelLine3D();
      if (!ref) { toast("Hãy chọn một đường trong Đại số trước.", "err"); return; }
      let pp, pid = null;
      if (snap.id) { const q = mmGetObj(snap.id); pp = [q.x, q.y, q.kind === "point3d" ? q.z : 0]; pid = q.id; }
      else pp = [R(snap.p[0]), R(snap.p[1]), R(snap.p[2])];
      const dir = mmNorm(mmSub(ref.b, ref.a));
      const o = mmAddDirect3D("plane3d", { origin: pp, normal: dir, extent: 3.2 },
        { parents: pid ? [ref.id, pid] : [ref.id], def: { type: "planeperp", refId: ref.id, ...(pid ? { pId: pid } : { px: pp[0], py: pp[1], pz: pp[2] }) } });
      toast(`Mặt phẳng vuông góc ${ref.name}: ${o.name}.`, "ok"); draw(); return;
    }
    /* --- tròn / cầu --- */
    if (T === "m3d-circleCP") {
      pushSnap(); draw();
      if (P.length < 2) { toast("Tâm — nhấp điểm vành."); mmHint3D("Đường tròn: đã chọn <b>tâm</b> — nhấp <b>điểm vành</b>.", ""); return; }
      const A = P[0], B = P[1]; state.pending = [];
      const pa = needPoint(A), pb = needPoint(B);
      const cc = [pa.x, pa.y, pa.kind === "point3d" ? pa.z : 0], rr = [pb.x, pb.y, pb.kind === "point3d" ? pb.z : 0];
      const rad = mmDist(cc, rr);
      if (!(rad > 1e-9)) { toast("Bán kính quá nhỏ.", "err"); draw(); return; }
      const sel = mmSelPlane3D();
      const normal = sel ? sel.normal.slice() : [0, 0, 1];
      const o = mmAddDirect3D("circle3d", { center: cc, radius: R(rad), normal },
        { parents: [pa.id, pb.id], def: { type: "circleCP", cId: pa.id, rId: pb.id, normal } });
      toast(`Đường tròn ${o.name} R=${R(rad)}.`, "ok"); draw(); return;
    }
    if (T === "m3d-circleCR") {
      pushSnap(); draw();
      const A = P[0]; state.pending = [];
      const pa = needPoint(A);
      mmModal({ title: "Đường tròn 3D — bán kính", okText: "Tạo", fields: [{ key: "r", label: "Bán kính R", value: 2, type: "number", min: 0.2, max: 20, step: 0.5 }] }).then(v => {
        if (!v || !(+v.r > 0)) { draw(); return; }
        const sel = mmSelPlane3D();
        const normal = sel ? sel.normal.slice() : [0, 0, 1];
        const o = mmAddDirect3D("circle3d", { center: [pa.x, pa.y, pa.kind === "point3d" ? pa.z : 0], radius: +v.r, normal },
          { parents: [pa.id], def: { type: "circleCR", cId: pa.id, r: +v.r, normal } });
        toast(`Đường tròn ${o.name} R=${+v.r}.`, "ok"); draw();
      });
      return;
    }
    if (T === "m3d-circle3") {
      pushSnap(); draw();
      if (P.length < 3) { toast(`Điểm ${P.length}/3 — nhấp tiếp.`); mmHint3D(`Đường tròn 3 điểm: <b>${P.length}/3</b>.`, ""); return; }
      const A = P[0], B = P[1], C = P[2]; state.pending = [];
      const pa = needPoint(A), pb = needPoint(B), pc = needPoint(C);
      try {
        const cc = mmCircle3From3([pa.x, pa.y, pa.kind === "point3d" ? pa.z : 0], [pb.x, pb.y, pb.kind === "point3d" ? pb.z : 0], [pc.x, pc.y, pc.kind === "point3d" ? pc.z : 0]);
        const o = mmAddDirect3D("circle3d", { center: cc.center, radius: cc.radius, normal: cc.normal },
          { parents: [pa.id, pb.id, pc.id], def: { type: "circle3", p1: pa.id, p2: pb.id, p3: pc.id } });
        toast(`Đường tròn qua 3 điểm ${o.name}.`, "ok");
      } catch (e) { toast(e.message, "err"); }
      draw(); return;
    }
    if (T === "m3d-sphereCP") {
      pushSnap(); draw();
      if (P.length < 2) { toast("Tâm cầu — nhấp điểm trên cầu."); mmHint3D("Mặt cầu: đã chọn <b>tâm</b> — nhấp <b>điểm trên cầu</b>.", ""); return; }
      const A = P[0], B = P[1]; state.pending = [];
      const pa = needPoint(A), pb = needPoint(B);
      const cc = [pa.x, pa.y, pa.kind === "point3d" ? pa.z : 0];
      const rad = Math.hypot(pb.x - cc[0], pb.y - cc[1], (pb.kind === "point3d" ? pb.z : 0) - cc[2]);
      if (!(rad > 1e-9)) { toast("Bán kính quá nhỏ.", "err"); draw(); return; }
      const o = mmAddDirect3D("sphere3d", { center: cc, radius: R(rad) },
        { parents: [pa.id, pb.id], def: { type: "sphereCP", cId: pa.id, rId: pb.id } });
      toast(`Mặt cầu ${o.name} R=${R(rad)}.`, "ok"); draw(); return;
    }
    if (T === "m3d-sphereCR") {
      pushSnap(); draw();
      const A = P[0]; state.pending = [];
      const pa = needPoint(A);
      mmModal({ title: "Mặt cầu — bán kính", okText: "Tạo", fields: [{ key: "r", label: "Bán kính R", value: 2, type: "number", min: 0.2, max: 20, step: 0.5 }] }).then(v => {
        if (!v || !(+v.r > 0)) { draw(); return; }
        const o = mmAddDirect3D("sphere3d", { center: [pa.x, pa.y, pa.kind === "point3d" ? pa.z : 0], radius: +v.r },
          { parents: [pa.id], def: { type: "sphereCR", cId: pa.id, r: +v.r } });
        toast(`Mặt cầu ${o.name} R=${+v.r}.`, "ok"); draw();
      });
      return;
    }
    /* --- khối --- */
    if (T === "m3d-cube") {
      pushSnap(); draw();
      if (P.length < 2) { toast("Điểm A cạnh đáy — nhấp điểm B."); return; }
      const A = P[0], B = P[1]; state.pending = [];
      const pa = needPoint(A), pb = needPoint(B);
      mmModal({ title: "Lập phương — chiều cao", okText: "Tạo", fields: [{ key: "h", label: "Chiều cao h", value: 2, type: "number", min: 0.3, max: 20, step: 0.5 }] }).then(v => {
        if (!v || !(+v.h > 0)) { draw(); return; }
        const built = mmBuildSolid3("cube", { aId: pa.id, bId: pb.id, h: +v.h }, (id) => mmGetObj(id));
        if (!built) { toast("Hai điểm trùng nhau.", "err"); draw(); return; }
        const o = mmAddDirect3D("solid3", { solid3: "cube", ...built }, { parents: [pa.id, pb.id], def: { type: "cube", aId: pa.id, bId: pb.id, h: +v.h } });
        mmOpenNetPanel(o);
        toast(`Lập phương ${o.name} — mở Khai triển để xem Net.`, "ok"); draw();
      });
      return;
    }
    if (T === "m3d-tetra") {
      pushSnap(); draw();
      if (P.length < 2) { toast("Điểm A — nhấp điểm B (cạnh tứ diện)."); return; }
      const A = P[0], B = P[1]; state.pending = [];
      const pa = needPoint(A), pb = needPoint(B);
      const built = mmBuildSolid3("tetra", { aId: pa.id, bId: pb.id }, (id) => mmGetObj(id));
      if (!built) { toast("Hai điểm trùng nhau.", "err"); draw(); return; }
      const o = mmAddDirect3D("solid3", { solid3: "tetra", ...built }, { parents: [pa.id, pb.id], def: { type: "tetra", aId: pa.id, bId: pb.id } });
      mmOpenNetPanel(o);
      toast(`Tứ diện đều ${o.name}.`, "ok"); draw(); return;
    }
    if (T === "m3d-prism" || T === "m3d-extrude") {
      const pick = (px !== undefined) ? mmPick3D(px, py) : null;
      let base = mmSelPoly3D();
      if (pick && pick.obj.kind === "polygon3d") base = pick.obj;
      if (!base) { toast("Hãy chọn một đa giác đáy trong Đại số (hoặc nhấp lên đa giác).", "err"); return; }
      mmModal({ title: "Lăng trụ — chiều cao", okText: "Tạo", fields: [{ key: "h", label: "Chiều cao h", value: 2.5, type: "number", min: 0.3, max: 20, step: 0.5 }] }).then(v => {
        if (!v || !(+v.h > 0)) return;
        const built = mmBuildSolid3("prism", { polyId: base.id, h: +v.h }, (id) => mmGetObj(id));
        if (!built) { toast("Đáy suy biến.", "err"); return; }
        const o = mmAddDirect3D("solid3", { solid3: "prism", ...built }, { parents: [base.id], def: { type: "prism", polyId: base.id, h: +v.h } });
        mmOpenNetPanel(o);
        toast(`Lăng trụ ${o.name} từ ${base.name}.`, "ok"); draw();
      });
      return;
    }
    if (T === "m3d-pyramid") {
      let base = mmSelPoly3D();
      const pick = (px !== undefined) ? mmPick3D(px, py) : null;
      if (pick && pick.obj.kind === "polygon3d") base = pick.obj;
      if (!base) {
        // 2-step: click đáy rồi đỉnh — ở đây yêu cầu chọn đáy trước cho đơn giản, rõ ràng
        toast("Hãy chọn một đa giác đáy trong Đại số trước, rồi nhấp đỉnh.", "err"); return;
      }
      pushSnap(); draw();
      if (P.length < 1) { toast(`Đáy ${base.name} — nhấp đỉnh chóp.`); mmHint3D(`Chóp đáy <b>${base.name}</b> — <b>nhấp đỉnh</b>.`, ""); return; }
      const S = P[0]; state.pending = [];
      const ps = needPoint(S);
      const built = mmBuildSolid3("pyramid", { polyId: base.id, apexId: ps.id }, (id) => mmGetObj(id));
      if (!built) { toast("Đáy/đỉnh suy biến.", "err"); draw(); return; }
      const o = mmAddDirect3D("solid3", { solid3: "pyramid", ...built }, { parents: [base.id, ps.id], def: { type: "pyramid", polyId: base.id, apexId: ps.id } });
      mmOpenNetPanel(o);
      toast(`Hình chóp ${o.name}.`, "ok"); draw(); return;
    }
    if (T === "m3d-cyl" || T === "m3d-cone") {
      pushSnap(); draw();
      if (P.length < 2) { toast("Điểm A trục — nhấp điểm B trục."); return; }
      const A = P[0], B = P[1]; state.pending = [];
      const pa = needPoint(A), pb = needPoint(B);
      mmModal({ title: T === "m3d-cyl" ? "Hình trụ — bán kính" : "Hình nón — bán kính đáy", okText: "Tạo", fields: [{ key: "r", label: "Bán kính R", value: 1.5, type: "number", min: 0.2, max: 20, step: 0.25 }] }).then(v => {
        if (!v || !(+v.r > 0)) { draw(); return; }
        const built = mmBuildSolid3(T === "m3d-cyl" ? "cyl" : "cone", { aId: pa.id, bId: pb.id, r: +v.r }, (id) => mmGetObj(id));
        if (!built) { toast("Trục suy biến.", "err"); draw(); return; }
        const o = mmAddDirect3D("solid3", { solid3: T === "m3d-cyl" ? "cyl" : "cone", ...built }, { parents: [pa.id, pb.id], def: { type: T === "m3d-cyl" ? "cyl" : "cone", aId: pa.id, bId: pb.id, r: +v.r } });
        toast(`${T === "m3d-cyl" ? "Hình trụ" : "Hình nón"} ${o.name}.`, "ok"); draw();
      });
      return;
    }
    if (T === "m3d-net") {
      const pick = (px !== undefined) ? mmPick3D(px, py) : null;
      const o = (pick && pick.obj.kind === "solid3") ? pick.obj : state.objects.find(s => s.id === state.selectedId && s.kind === "solid3");
      if (!o) { toast("Nhấp lên một khối (lập phương/chóp/lăng trụ) để khai triển.", "err"); return; }
      state.selectedId = o.id;
      renderList($("#algebraSearch") ? $("#algebraSearch").value : "");
      mmOpenNetPanel(o);
      mmNetPlay(o, !(o.netT > 0.5));
      draw(); return;
    }
    /* --- giao --- */
    if (T === "m3d-intersect") {
      const pick = (px !== undefined) ? mmPick3D(px, py) : null;
      if (!pick) { toast("Nhấp lên mặt/khối thứ nhất.", "err"); return; }
      state.pending.push({ oid: pick.obj.id });
      draw();
      if (state.pending.length < 2) { toast(`Đã chọn ${pick.obj.name} — nhấp đối tượng thứ hai.`); mmHint3D(`Giao: đã chọn <b>${pick.obj.name}</b> — nhấp <b>đối tượng thứ hai</b>.`, ""); return; }
      const A = mmGetObj(state.pending[0].oid), B = pick.obj;
      state.pending = [];
      try {
        const o = mmDoIntersect(A, B);
        toast(`Giao ${A.name} ∩ ${B.name}: ${o.name}.`, "ok");
        mmHint3D(`Đã tạo <b>${o.name}</b> = ${A.name} ∩ ${B.name} — kéo gốc để xem tự cập nhật.`, "ok");
      } catch (e) { toast(e.message, "err"); mmHint3D(e.message, "err"); }
      draw(); return;
    }
    /* --- đo --- */
    if (T === "m3d-dist") {
      pushSnap(); draw();
      if (P.length < 2) { toast("Điểm 1 — nhấp điểm 2."); return; }
      const A = P[0], B = P[1]; state.pending = [];
      const pa = needPoint(A), pb = needPoint(B);
      const v = mmDist([pa.x, pa.y, pa.kind === "point3d" ? pa.z : 0], [pb.x, pb.y, pb.kind === "point3d" ? pb.z : 0]);
      mmAddDirect3D("measure3d", { mtype: "dist", mvalue: R(v), mrefs: [pa.name, pb.name] }, { color: "#34d399", parents: [pa.id, pb.id], def: { type: "measure", p1: pa.id, p2: pb.id } });
      toast(`Khoảng cách = ${R(v)}.`, "ok"); draw(); return;
    }
    if (T === "m3d-angle") {
      pushSnap(); draw();
      if (P.length < 3) { toast(`Điểm ${P.length}/3 (đỉnh ở giữa) — nhấp tiếp.`); return; }
      const A = P[0], B = P[1], C = P[2]; state.pending = [];
      const pa = needPoint(A), pb = needPoint(B), pc = needPoint(C);
      const u = mmNorm(mmSub([pa.x, pa.y, pa.kind === "point3d" ? pa.z : 0], [pb.x, pb.y, pb.kind === "point3d" ? pb.z : 0]));
      const v = mmNorm(mmSub([pc.x, pc.y, pc.kind === "point3d" ? pc.z : 0], [pb.x, pb.y, pb.kind === "point3d" ? pb.z : 0]));
      const deg = Math.acos(clamp(mmDot(u, v), -1, 1)) * 180 / Math.PI;
      mmAddDirect3D("measure3d", { mtype: "angle", mvalue: R(deg), mrefs: [pa.name, pb.name, pc.name] }, { color: "#fbbf24", parents: [pa.id, pb.id, pc.id], def: { type: "measure", p1: pa.id, p2: pb.id, p3: pc.id } });
      toast(`Góc = ${R(deg)}°.`, "ok"); draw(); return;
    }
    if (T === "m3d-area") {
      const pick = (px !== undefined) ? mmPick3D(px, py) : null;
      const ref = (pick && ["polygon3d", "circle3d", "plane3d"].includes(pick.obj.kind)) ? pick.obj : null;
      if (!ref) { toast("Nhấp lên một đa giác / đường tròn 3D.", "err"); return; }
      let v = 0;
      if (ref.kind === "polygon3d") v = mmPolygonArea3D(ref.vertices);
      else if (ref.kind === "circle3d") v = Math.PI * ref.radius * ref.radius;
      else v = (2 * (ref.extent || 3.2)) * (2 * (ref.extent || 3.2));
      mmAddDirect3D("measure3d", { mtype: "area", mvalue: R(v), mrefs: [ref.name] }, { color: "#34d399", parents: [ref.id], def: { type: "measure", refId: ref.id } });
      toast(`Diện tích ${ref.name} = ${R(v)}.`, "ok"); draw(); return;
    }
    if (T === "m3d-volume") {
      const pick = (px !== undefined) ? mmPick3D(px, py) : null;
      const ref = (pick && ["solid3", "sphere3d"].includes(pick.obj.kind)) ? pick.obj : state.objects.find(s => s.id === state.selectedId && ["solid3", "sphere3d"].includes(s.kind));
      if (!ref) { toast("Nhấp lên một khối / mặt cầu.", "err"); return; }
      const v = mmSolidVolume3D(ref);
      if (!isFinite(v)) { toast("Chưa tính được thể tích khối này.", "err"); return; }
      mmAddDirect3D("measure3d", { mtype: "volume", mvalue: R(v), mrefs: [ref.name] }, { color: "#38bdf8", parents: [ref.id], def: { type: "measure", refId: ref.id } });
      toast(`Thể tích ${ref.name} = ${R(v)}.`, "ok"); draw(); return;
    }
    /* --- biến hình --- */
    if (T === "m3d-translate" || T === "m3d-refpoint" || T === "m3d-dilate") {
      const S = mmSelPoint3D();
      if (!S) { toast("Hãy chọn một điểm trong Đại số trước.", "err"); return; }
      pushSnap(); draw();
      if (T === "m3d-translate" && P.length < 2) { toast(P.length ? "Ngọn véc-tơ — nhấp tiếp." : "Điểm gốc véc-tơ — nhấp tiếp."); return; }
      if (T !== "m3d-translate" && P.length < 1) { toast("Nhấp tâm biến hình."); return; }
      const done = (extra) => {
        const sz = S.kind === "point3d" ? S.z : 0;
        let img = null;
        if (T === "m3d-translate") {
          const A = P[0], B = P[1];
          const pa = needPoint(A), pb = needPoint(B);
          img = [S.x + (pb.x - pa.x), S.y + (pb.y - pa.y), sz + ((pb.kind === "point3d" ? pb.z : 0) - (pa.kind === "point3d" ? pa.z : 0))];
          mmAddDirect3D("point3d", { x: R(img[0]), y: R(img[1]), z: R(img[2]) },
            { color: S.color, parents: [S.id, pa.id, pb.id], def: { type: "translate3d", sId: S.id, v1: pa.id, v2: pb.id } });
        } else if (T === "m3d-refpoint") {
          const C = needPoint(P[0]);
          const cz = C.kind === "point3d" ? C.z : 0;
          img = [2 * C.x - S.x, 2 * C.y - S.y, 2 * cz - sz];
          mmAddDirect3D("point3d", { x: R(img[0]), y: R(img[1]), z: R(img[2]) },
            { color: S.color, parents: [S.id, C.id], def: { type: "refpoint3d", sId: S.id, cId: C.id } });
        } else {
          const C = needPoint(P[0]);
          const cz = C.kind === "point3d" ? C.z : 0;
          const k = extra.k;
          img = [C.x + (S.x - C.x) * k, C.y + (S.y - C.y) * k, cz + (sz - cz) * k];
          mmAddDirect3D("point3d", { x: R(img[0]), y: R(img[1]), z: R(img[2]) },
            { color: S.color, parents: [S.id, C.id], def: { type: "dilate3d", sId: S.id, cId: C.id, k } });
        }
        state.pending = [];
        toast(`Đã tạo ảnh của ${S.name}.`, "ok"); draw();
      };
      if (T === "m3d-dilate") {
        const keep = P.slice();
        mmModal({ title: "Vị tự 3D", okText: "Tạo ảnh", fields: [{ key: "k", label: "Tỉ số k", value: 2, type: "number", step: 0.5 }] }).then(v => {
          if (!v || !isFinite(+v.k)) { state.pending = keep; draw(); return; }
          done({ k: +v.k });
        });
      } else done({});
      return;
    }
    if (T === "m3d-refplane") {
      const S = mmSelPoint3D();
      if (!S) { toast("Hãy chọn một điểm trong Đại số trước.", "err"); return; }
      const pick = (px !== undefined) ? mmPick3D(px, py) : null;
      const pl = (pick && pick.obj.kind === "plane3d") ? pick.obj : mmSelPlane3D();
      if (!pl) { toast("Nhấp lên một mặt phẳng.", "err"); return; }
      const sz = S.kind === "point3d" ? S.z : 0;
      const d = mmDot(mmSub([S.x, S.y, sz], pl.origin), pl.normal);
      const img = mmSub([S.x, S.y, sz], mmScale(pl.normal, 2 * d));
      mmAddDirect3D("point3d", { x: R(img[0]), y: R(img[1]), z: R(img[2]) },
        { color: S.color, parents: [S.id, pl.id], def: { type: "refplane3d", sId: S.id, refId: pl.id } });
      toast(`Đối xứng ${S.name} qua ${pl.name}.`, "ok"); draw(); return;
    }
    if (T === "m3d-rotline") {
      const S = mmSelPoint3D();
      if (!S) { toast("Hãy chọn một điểm trong Đại số trước.", "err"); return; }
      pushSnap(); draw();
      if (P.length < 2) { toast("Điểm 1 của trục — nhấp điểm 2."); return; }
      const A = P[0], B = P[1];
      const keep = P.slice();
      mmModal({ title: "Quay quanh đường", okText: "Quay", fields: [{ key: "deg", label: "Góc (độ)", value: 90, type: "number", step: 15 }] }).then(v => {
        if (!v) { state.pending = keep; draw(); return; }
        const deg = +v.deg || 0;
        const pa = needPoint(A), pb = needPoint(B);
        const U = [pa.x, pa.y, pa.kind === "point3d" ? pa.z : 0], Vv = [pb.x, pb.y, pb.kind === "point3d" ? pb.z : 0];
        const axis = mmNorm(mmSub(Vv, U));
        const sz = S.kind === "point3d" ? S.z : 0;
        const rel = mmSub([S.x, S.y, sz], U);
        const ang = deg * Math.PI / 180;
        // animation 0 -> θ: tạo điểm tạm, nội suy góc rồi mới gắn def
        const tmp = mmAddDirect3D("point3d", { x: S.x, y: S.y, z: sz }, { color: S.color });
        const t0 = performance.now(), dur = 950;
        const step = (now) => {
          const k = clamp((now - t0) / dur, 0, 1);
          const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
          const q = mmAdd(U, mmRotAroundAxis(rel, axis, ang * e));
          tmp.x = R(q[0]); tmp.y = R(q[1]); tmp.z = R(q[2]);
          mmSyncPointNameExpr(tmp);
          draw();
          if (k < 1) requestAnimationFrame(step);
          else {
            mmAttachParents(tmp, [S.id, pa.id, pb.id], { type: "rotline3d", sId: S.id, aId: pa.id, bId: pb.id, deg });
            try { mmSyncPointNameExpr(tmp); } catch {}
            renderList($("#algebraSearch") ? $("#algebraSearch").value : "");
            persist(); draw();
            toast(`Đã quay ${S.name} ${deg}° quanh trục.`, "ok");
          }
        };
        state.pending = [];
        requestAnimationFrame(step);
      });
      return;
    }
    /* --- edit/view/demo --- */
    if (["m3d-select", "m3d-delete", "m3d-toggle", "m3d-names", "m3d-style", "m3d-front"].includes(T)) {
      const pick = (px !== undefined) ? mmPick3D(px, py) : null;
      if (!pick) { toast("Nhấp gần một đối tượng 3D hơn.", "err"); return; }
      const o = pick.obj;
      if (T === "m3d-select") { state.selectedId = o.id; renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); refreshTableSelect(); draw(); toast(`Đã chọn ${o.name}`, "ok"); }
      else if (T === "m3d-delete") { removeObject(o.id); toast(`Đã xóa ${o.name}`, "ok"); }
      else if (T === "m3d-toggle") { pushHistory(); o.visible = !o.visible; renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); draw(); persist(); toast(`${o.name}: ${o.visible ? "hiện" : "ẩn"}.`, "ok"); }
      else if (T === "m3d-names") { pushHistory(); o.hideName = !o.hideName; renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); draw(); persist(); toast(`${o.name}: ${o.hideName ? "ẩn tên" : "hiện tên"}.`, "ok"); }
      else if (T === "m3d-style") {
        if (!state.toolMem.styleColor) { state.toolMem.styleColor = o.color; toast(`Đã lấy kiểu ${o.name} — nhấp đối tượng đích.`, "ok"); }
        else { pushHistory(); o.color = state.toolMem.styleColor; state.toolMem.styleColor = null; renderList($("#algebraSearch") ? $("#algebraSearch").value : ""); draw(); persist(); toast(`Đã chép kiểu cho ${o.name}.`, "ok"); }
      } else if (T === "m3d-front") mmFocusObject(o);
      return;
    }
    if (T === "m3d-demo") { mmDemoWOW(); return; }
    if (T === "m3d-move") return;
    toast("Công cụ 3D này đang được hoàn thiện.", undefined);
  } catch (e) { toast(e.message, "err"); }
}
function mmFinishPoly3D() {
  const P = state.pending;
  if (P.length < 3) { toast("Đa giác 3D cần ít nhất 3 đỉnh.", "err"); return false; }
  try {
    const ids = [];
    const vs = P.map(e => {
      let q = e._pid ? mmGetObj(e._pid) : null;
      if (!q) {
        q = mmAddDirect3D("point3d", { x: Math.round(e.x * 100) / 100, y: Math.round(e.y * 100) / 100, z: Math.round((e.z || 0) * 100) / 100 });
      }
      ids.push(q.id);
      return [q.x, q.y, q.kind === "point3d" ? q.z : 0];
    });
    const o = mmAddDirect3D("polygon3d", { vertices: vs }, { parents: ids, def: { type: "polygon3d", vIds: ids } });
    state.pending = []; draw();
    toast(`Đã tạo ${o.name} (${vs.length} đỉnh).`, "ok");
    return true;
  } catch (e) { toast(e.message, "err"); return false; }
}
// con trỏ 3D cho preview (theo dõi floor khi đang dựng)
try {
  canvas.addEventListener("pointermove", (e) => {
    try {
      if (state.mode !== "3d" || !/^m3d-/.test(state.tool || "")) { state.toolCursor3d = null; return; }
      const r = canvas.getBoundingClientRect();
      const fl = screenToFloor(e.clientX - r.left, e.clientY - r.top);
      state.toolCursor3d = [fl.x, fl.y, 0];
    } catch { state.toolCursor3d = null; }
  });
} catch {}

/* Tạo điểm với tên tùy ý (Số phức Z, điểm đối xứng…) */
function markNamedPoint(x, y, name, color) {
  pushHistory(); state.seq += 1;
  const o = {
    id: "o" + Date.now().toString(36) + state.seq + Math.floor(Math.random() * 99),
    name: name || `P${state.seq}(${round2(x)}, ${round2(y)})`,
    expr: `(${round2(x)}, ${round2(y)})`, kind: "point", x: round2(x), y: round2(y),
    color: color || nextColor(), visible: true, error: null,
    born: state.opts.animate ? performance.now() : 0,
  };
  state.objects.push(o); state.selectedId = o.id;
  renderList($("#algebraSearch").value); draw(); kickAnim(); persist();
  return o;
}
/* Chốt các công cụ nhiều điểm (Enter / nhấp đúp) */
function finishPending() {
  const t = state.tool, P = state.pending;
  if (t === "polygon" || t === "oriented") {
    if (P.length < 3) { toast("Đa giác cần ít nhất 3 đỉnh.", "err"); return false; }
    try {
      const o = addObject(`polygon(${P.map(p => `(${round2(p.x)},${round2(p.y)})`).join(",")})`);
      const vIds = P.map(p => p._pid).filter(Boolean);
      if (o && vIds.length === P.length) {
        if (t === "oriented") {
          const pts = P.map(p => [p.x, p.y]);
          mmAttachParents(o, vIds, { type: "oriented", vIds, orient: mmOrientName(pts) });
        } else mmAttachParents(o, vIds, { type: "polygon", vIds });
      }
      state.pending = []; draw();
      if (t === "oriented") {
        const pts = o.pts || P.map(p => [p.x, p.y]);
        toast(`Đã tạo ${o.name} có hướng ${mmOrientName(pts)}.`, "ok");
      } else toast(`Đã tạo ${o.name} (${P.length} đỉnh).`, "ok");
      return true;
    } catch (e) { toast(e.message, "err"); return false; }
  }
  if (t === "plist") {
    if (!P.length) return false;
    P.forEach(p => { try { addObject(`(${round2(p.x)}, ${round2(p.y)})`); } catch {} });
    state.pending = []; draw(); toast(`Đã tạo danh sách ${P.length} điểm.`, "ok"); return true;
  }
  if (t === "regression") {
    if (P.length < 2) { toast("Hồi quy cần ít nhất 2 điểm.", "err"); return false; }
    const n = P.length;
    const sx = P.reduce((a, p) => a + p.x, 0), sy = P.reduce((a, p) => a + p.y, 0);
    const mx = sx / n, my = sy / n;
    let sxx = 0, sxy = 0;
    for (const p of P) { sxx += (p.x - mx) * (p.x - mx); sxy += (p.x - mx) * (p.y - my); }
    try {
      if (Math.abs(sxx) < 1e-9) addObject(`x = ${round2(mx)}`);
      else { const m = sxy / sxx, c = my - m * mx; addObject(`${round2(m)}*x + ${round2(c)}`); }
      state.pending = []; draw(); toast(`Đường hồi quy qua ${n} điểm.`, "ok"); return true;
    } catch (e) { toast(e.message, "err"); return false; }
  }
  return false;
}

/* Click dựng hình: nếu nhấp gần point có sẵn (14px) thì dùng đúng tọa độ point
   và giữ id trong pending để tạo dependency (kéo point -> hình cập nhật). */
function mmResolveClick(x, y, px, py) {
  try {
    if (px === undefined || py === undefined) {
      const [sx0, sy0] = toScreen(x, y);
      px = sx0; py = sy0;
    }
    let best = null, bd = 14;
    for (const o of state.objects) {
      if (!o.visible || o.error || o.kind !== "point") continue;
      const [sx, sy] = toScreen(o.x, o.y);
      const d = Math.hypot(px - sx, py - sy);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) return { x: best.x, y: best.y, id: best.id };
  } catch {}
  return { x, y, id: null };
}
function mmAttachParents(o, ids, def) {
  try {
    const uniq = [...new Set((ids || []).filter(Boolean))];
    if (uniq.length) { o.parents = uniq; o.def = def || o.def; }
    else if (def) { o.def = def; }
    persist();
  } catch {}
}
function handleToolClick(x, y, px, py) {
  // snap nhẹ khi dựng hình: hút về point có sẵn để giữ dependency
  try {
    const rs = mmResolveClick(x, y, px, py);
    if (rs.id) { x = rs.x; y = rs.y; }
    var __clickId = rs.id;
  } catch { var __clickId = null; }
  state.lastClick = { x, y };
  if (state.mode === "3d") { handleToolClick3D(x, y, 0); return; }
  const T = state.tool || "move";
  const R = (v) => round2(v);
  /* --- nhóm một chạm --- */
  if (T === "point") {
    try { const o = addObject(`(${R(x)}, ${R(y)})`); toast(`Đã tạo ${o.name}`, "ok"); }
    catch (e) { toast(e.message, "err"); }
    return;
  }
  if (T === "complex") {
    try { const o = markNamedPoint(x, y, null, "#e879f9"); o.name = `Z${state.seq}(${R(x)}, ${R(y)})`; renderList($("#algebraSearch").value); draw(); persist(); toast(`Số phức ${o.name} — tung độ là phần ảo.`, "ok"); }
    catch (e) { toast(e.message, "err"); }
    return;
  }
  if (T === "extremum" || T === "root" || T === "intersect") { runToolAnalysis(T); return; }
  if (T === "tangent") {
    const sel = state.objects.find(o => o.id === state.selectedId && o.kind === "implicit" && !o.error)
      || state.objects.find(o => o.kind === "implicit" && o.visible && !o.error);
    const meta = sel && (sel.cx !== undefined ? { cx: sel.cx, cy: sel.cy, r: sel.cr } : parseCircleMeta(sel ? sel.expr : ""));
    if (sel && meta) {
      const dx = x - meta.cx, dy = y - meta.cy, d = Math.hypot(dx, dy);
      if (d < meta.r - 1e-9) { toast("Điểm nằm trong đường tròn — không có tiếp tuyến.", "err"); return; }
      try {
        if (d <= meta.r + 1e-9) {
          addObject(lineExprThrough(x, y, -(y - meta.cy), x - meta.cx), { color: "#fbbf24" });
        } else {
          const th = Math.atan2(dy, dx), be = Math.acos(clamp(meta.r / d, -1, 1));
          for (const s of [1, -1]) {
            const a = th + s * be;
            addObject(lineExprThrough(x, y, Math.cos(a), Math.sin(a)), { color: "#fbbf24" });
          }
        }
        toast(`Tiếp tuyến của ${sel.name} qua điểm chạm.`, "ok");
      } catch (e) { toast(e.message, "err"); }
      return;
    }
    runToolAnalysis("tangent"); return;
  }
  if (T === "select" || T === "delete" || T === "toggle" || T === "names" || T === "style") {
    const hit = nearestObject(px, py);
    if (!hit) { toast("Nhấp gần một đối tượng hơn.", "err"); return; }
    const o = hit.obj;
    if (T === "select") { state.selectedId = o.id; renderList($("#algebraSearch").value); refreshTableSelect(); draw(); toast(`Đã chọn ${o.name}`, "ok"); }
    else if (T === "delete") { removeObject(o.id); toast(`Đã xóa ${o.name}`, "ok"); }
    else if (T === "toggle") { pushHistory(); o.visible = !o.visible; renderList($("#algebraSearch").value); draw(); persist(); toast(`${o.name}: ${o.visible ? "hiện" : "ẩn"}.`, "ok"); }
    else if (T === "names") {
      if (!["point", "point3d", "segment", "ray", "vector", "polygon", "angle", "arc", "sector", "ellipse", "hyperbola"].includes(o.kind)) { toast("Công cụ Tên dùng cho điểm / hình.", "err"); return; }
      pushHistory(); o.hideName = !o.hideName; renderList($("#algebraSearch").value); draw(); persist();
      toast(`${o.name}: ${o.hideName ? "ẩn tên" : "hiện tên"}.`, "ok");
    } else if (T === "style") {
      if (!state.toolMem.styleColor) { state.toolMem.styleColor = o.color; toast(`Đã lấy kiểu ${o.name} — nhấp đối tượng đích.`, "ok"); }
      else { pushHistory(); o.color = state.toolMem.styleColor; state.toolMem.styleColor = null; renderList($("#algebraSearch").value); draw(); persist(); toast(`Đã chép kiểu cho ${o.name}.`, "ok"); }
    }
    return;
  }
  if (T === "area") {
    const polys = state.objects.filter(o => o.kind === "polygon" && o.visible && !o.error);
    if (!polys.length) { toast("Chưa có đa giác nào — hãy tạo Đa giác trước.", "err"); return; }
    let best = null, bd = 1e12;
    for (const p of polys) {
      const cx = p.pts.reduce((a, q) => a + q[0], 0) / p.pts.length;
      const cy = p.pts.reduce((a, q) => a + q[1], 0) / p.pts.length;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bd) { bd = d; best = p; }
    }
    let s = 0;
    for (let i = 0; i < best.pts.length; i++) {
      const A = best.pts[i], B = best.pts[(i + 1) % best.pts.length];
      s += A[0] * B[1] - B[0] * A[1];
    }
    const area = Math.abs(s / 2);
    const cx = best.pts.reduce((a, q) => a + q[0], 0) / best.pts.length;
    const cy = best.pts.reduce((a, q) => a + q[1], 0) / best.pts.length;
    try { addObject(`text("S=${R(area)}",${R(cx)},${R(cy)})`, { color: "#34d399" }); toast(`Diện tích ${best.name} = ${R(area)} (đv²).`, "ok"); }
    catch (e) { toast(e.message, "err"); }
    return;
  }
  if (T === "slope") {
    const ref = selectedLineRef();
    if (!ref) { toast("Hãy chọn một đường trong danh sách Đại số trước.", "err"); return; }
    const d = refDir(ref, x, y);
    if (!d) { toast("Không tính được hướng tại điểm này.", "err"); return; }
    const txt = Math.abs(d.dx) < 1e-9 ? "m = ∞" : `m = ${R(d.dy / d.dx)}`;
    try { addObject(`text("${txt}",${R(x)},${R(y)})`, { color: "#38bdf8" }); toast(`Hệ số góc ${ref.name}: ${txt}.`, "ok"); }
    catch (e) { toast(e.message, "err"); }
    return;
  }
  if (T === "perp" || T === "parallel") {
    const ref = selectedLineRef();
    if (!ref) { toast("Hãy chọn một đường trong danh sách Đại số trước.", "err"); return; }
    const d = refDir(ref, x, y);
    if (!d) { toast("Không tính được hướng của đường đã chọn.", "err"); return; }
    const dir = T === "perp" ? { dx: -d.dy, dy: d.dx } : d;
    try {
      const o = addObject(lineExprThrough(x, y, dir.dx, dir.dy));
      const aid = (typeof __clickId !== "undefined" && __clickId) ? __clickId : null;
      if (aid) mmAttachParents(o, [ref.id, aid], { type: T === "perp" ? "perp" : "parallel", refId: ref.id, aId: aid });
      else mmAttachParents(o, [ref.id], { type: T === "perp" ? "perp" : "parallel", refId: ref.id, ax: x, ay: y });
      toast(`${T === "perp" ? "Vuông góc" : "Song song"} với ${ref.name}: ${o.name}.`, "ok");
    }
    catch (e) { toast(e.message, "err"); }
    return;
  }
  if (T === "text") {
    mmModal({ title: "Chèn chữ", fields: [{ key: "text", label: "Nội dung", value: "" }], okText: "Chèn" }).then(v => {
      if (!v || !String(v.text).trim()) { draw(); return; }
      const t = String(v.text).trim().slice(0, 80).replace(/"/g, "'");
      try { const o = addObject(`text("${t}",${R(x)},${R(y)})`); toast(`Đã chèn chữ ${o.name}.`, "ok"); }
      catch (e) { toast(e.message, "err"); }
    });
    return;
  }
  if (T === "image") {
    state.toolMem.imgPos = { x: R(x), y: R(y) };
    const pk = document.getElementById("imgPicker");
    if (pk) pk.click();
    else toast("Trình duyệt không hỗ trợ chọn ảnh.", "err");
    return;
  }
  if (T === "slider") {
    const free = ["a", "b", "c", "d", "m", "k", "t"].find(k => !(k in state.params)) || ("p" + state.seq);
    mmModal({
      title: "Thanh trượt mới", okText: "Tạo",
      fields: [
        { key: "name", label: "Tên (một chữ cái)", value: free },
        { key: "value", label: "Giá trị", value: 1, type: "number", step: 0.5 },
        { key: "min", label: "Nhỏ nhất", value: -10, type: "number", step: 0.5 },
        { key: "max", label: "Lớn nhất", value: 10, type: "number", step: 0.5 },
      ],
    }).then(v => {
      if (!v) return;
      let nm = String(v.name || free).trim().toLowerCase();
      if (!/^[a-w]$/.test(nm) || /[exy]/.test(nm)) { toast("Tên phải là một chữ cái (trừ e, x, y).", "err"); return; }
      const val = isFinite(+v.value) ? +v.value : 1;
      try {
        const o = addObject(`${nm} = ${val}`, { color: "#fbbf24" });
        o.pmin = isFinite(+v.min) ? +v.min : -10; o.pmax = isFinite(+v.max) ? +v.max : 10;
        if (o.pmax <= o.pmin) o.pmax = o.pmin + 10;
        o.pvalue = clamp(val, o.pmin, o.pmax); state.params[nm] = o.pvalue;
        o.expr = `${nm} = ${o.pvalue}`;
        renderList($("#algebraSearch").value); draw(); persist();
        toast(`Thanh trượt ${nm} — dùng trong biểu thức, vd: ${nm}*x^2.`, "ok");
      } catch (e) { toast(e.message, "err"); }
    });
    return;
  }
  if (T === "plist" || T === "regression" || T === "conic5") {
    state.pending.push({ x, y, _pid: (typeof __clickId !== "undefined" ? __clickId : null) }); draw();
    if (T === "conic5" && state.pending.length === 5) {
      try {
        const X = fitConic5(state.pending.map(p => [p.x, p.y]));
        const o = addObject(conic5Expr(X, state.pending));
        const vIds = state.pending.map(p => p._pid).filter(Boolean);
        if (o && vIds.length === 5) mmAttachParents(o, vIds, { type: "conic5", vIds });
        state.pending = []; draw(); toast(`Cônic qua 5 điểm: ${o.name}.`, "ok");
      } catch (e) { state.pending = []; draw(); toast(e.message, "err"); }
    } else {
      const need = T === "regression" ? "Enter / nhấp đúp" : "Enter / nhấp đúp";
      toast(`Điểm ${state.pending.length} — ${need} để xong.${T === "conic5" ? ` (còn ${5 - state.pending.length})` : ""}`);
    }
    return;
  }
  /* --- nhóm 2 chạm --- */
  const pair2 = ["line", "circle", "segment", "ray", "vector", "midpoint", "midperp", "semicircle", "distance", "regpoly", "fixedseg", "anglefixed", "refpoint", "rotate", "dilate", "translate", "refline"];
  if (pair2.includes(T)) {
    state.pending.push({ x, y, _pid: (typeof __clickId !== "undefined" ? __clickId : null) });
    if (state.pending.length === 1) {
      const first = {
        line: "Đã chọn điểm 1 — nhấp điểm 2.", circle: "Đã chọn tâm — nhấp điểm vành.",
        segment: "Đầu A — nhấp đầu B.", ray: "Gốc tia — nhấp điểm định hướng.",
        vector: "Điểm đặt — nhấp ngọn véc-tơ.", midpoint: "Điểm 1 — nhấp điểm 2.",
        midperp: "Điểm 1 — nhấp điểm 2.", semicircle: "Đầu A của đường kính — nhấp đầu B.",
        distance: "Điểm 1 — nhấp điểm 2.", regpoly: "Đã chọn tâm — nhấp đỉnh.",
        fixedseg: null, anglefixed: null, refpoint: null, rotate: null, dilate: null,
        translate: null, refline: null,
      }[T];
      if (T === "fixedseg") {
        mmModal({ title: "Đoạn thẳng cố định", okText: "Tạo", fields: [{ key: "len", label: "Độ dài", value: 3, type: "number", min: 0.2, max: 20, step: 0.5 }, { key: "ang", label: "Góc (độ)", value: 0, type: "number", step: 5 }] }).then(v => {
          const [p] = state.pending; state.pending = [];
          if (!v || !(+v.len > 0)) { draw(); return; }
          const a = (+v.ang || 0) * Math.PI / 180;
          try {
            const o = addObject(`segment(${R(p.x)},${R(p.y)},${R(p.x + (+v.len) * Math.cos(a))},${R(p.y + (+v.len) * Math.sin(a))})`);
            if (o && p._pid) mmAttachParents(o, [p._pid], { type: "fixedseg", pId: p._pid, len: +v.len, ang: +v.ang || 0 });
            draw(); toast(`Đoạn dài ${+v.len}: ${o.name}.`, "ok");
          }
          catch (e) { draw(); toast(e.message, "err"); }
        });
      } else if (T === "anglefixed") {
        toast("Đỉnh + điểm gốc — nhập số độ ở hộp thoại.");
      } else if (T === "refpoint" || T === "rotate" || T === "dilate") {
        if (!selectedPointObj()) { state.pending = []; draw(); toast("Hãy chọn một điểm trong danh sách Đại số trước.", "err"); }
        else if (T === "rotate") {
          mmModal({ title: "Quay quanh tâm đã nhấp", okText: "Quay", fields: [{ key: "deg", label: "Góc (độ, + ngược chiều)", value: 90, type: "number", step: 5 }] }).then(v => {
            const [c] = state.pending; state.pending = [];
            if (!v) { draw(); return; }
            const P = selectedPointObj(); if (!P) { draw(); return; }
            const a = (+v.deg || 0) * Math.PI / 180;
            const dx = P.x - c.x, dy = P.y - c.y;
            const o = markPoint(c.x + dx * Math.cos(a) - dy * Math.sin(a), c.y + dx * Math.sin(a) + dy * Math.cos(a), P.color);
            if (o && c._pid) mmAttachParents(o, [P.id, c._pid], { type: "rotate", sId: P.id, cId: c._pid, deg: +v.deg || 0 });
            draw(); toast(`Đã quay ${P.name} ${+v.deg}°.`, "ok");
          });
        } else if (T === "dilate") {
          mmModal({ title: "Vị tự tâm đã nhấp", okText: "Tạo ảnh", fields: [{ key: "k", label: "Tỉ số k", value: 2, type: "number", step: 0.5 }] }).then(v => {
            const [c] = state.pending; state.pending = [];
            if (!v || !isFinite(+v.k)) { draw(); return; }
            const P = selectedPointObj(); if (!P) { draw(); return; }
            const o = markPoint(c.x + (P.x - c.x) * (+v.k), c.y + (P.y - c.y) * (+v.k), P.color);
            if (o && c._pid) mmAttachParents(o, [P.id, c._pid], { type: "dilate", sId: P.id, cId: c._pid, k: +v.k });
            draw(); toast(`Vị tự ${P.name} tỉ số ${+v.k}.`, "ok");
          });
        } else toast("Đã chọn tâm — tạo ảnh đối xứng.");
      } else if (T === "translate" || T === "refline") {
        if (!selectedPointObj()) { state.pending = []; draw(); toast("Hãy chọn một điểm trong danh sách Đại số trước.", "err"); }
        else toast(T === "translate" ? "Điểm gốc véc-tơ — nhấp ngọn." : "Điểm 1 của trục — nhấp điểm 2.");
      } else if (first) toast(first);
      draw(); return;
    }
    const P = state.pending; state.pending = [];
    try {
      if (T === "line") {
        let o;
        if (Math.abs(P[1].x - P[0].x) < 1e-9) o = addObject(`x = ${R(P[0].x)}`);
        else { const m = (P[1].y - P[0].y) / (P[1].x - P[0].x), c = P[0].y - m * P[0].x; o = addObject(`${R(m)}*x + ${R(c)}`); }
        if (o && P[0]._pid && P[1]._pid) mmAttachParents(o, [P[0]._pid, P[1]._pid], { type: "line", p1: P[0]._pid, p2: P[1]._pid });
      } else if (T === "circle") {
        const Rh = Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y);
        if (Rh < 1e-9) throw new Error("Bán kính quá nhỏ.");
        const o = addObject(`(x - ${R(P[0].x)})^2 + (y - ${R(P[0].y)})^2 = ${R(Rh * Rh)}`);
        o.cx = R(P[0].x); o.cy = R(P[0].y); o.cr = R(Rh);
        o.def = { type: "circle" };
        if (P[0]._pid && P[1]._pid) { o.parents = [P[0]._pid, P[1]._pid]; o.def = { type: "circle", cId: P[0]._pid, rId: P[1]._pid }; }
        persist();
      } else if (T === "segment" || T === "ray" || T === "vector") {
        const o = addObject(`${T}(${R(P[0].x)},${R(P[0].y)},${R(P[1].x)},${R(P[1].y)})`);
        if (o && P[0]._pid && P[1]._pid) mmAttachParents(o, [P[0]._pid, P[1]._pid], { type: T, p1: P[0]._pid, p2: P[1]._pid });
      } else if (T === "midpoint") {
        const o = markPoint((P[0].x + P[1].x) / 2, (P[0].y + P[1].y) / 2, "#34d399");
        if (o && P[0]._pid && P[1]._pid) mmAttachParents(o, [P[0]._pid, P[1]._pid], { type: "midpoint", p1: P[0]._pid, p2: P[1]._pid });
      } else if (T === "midperp") {
        const mx = (P[0].x + P[1].x) / 2, my = (P[0].y + P[1].y) / 2;
        const o = addObject(lineExprThrough(mx, my, -(P[1].y - P[0].y), P[1].x - P[0].x));
        if (o && P[0]._pid && P[1]._pid) mmAttachParents(o, [P[0]._pid, P[1]._pid], { type: "midperp", p1: P[0]._pid, p2: P[1]._pid });
      } else if (T === "semicircle") {
        const cx = (P[0].x + P[1].x) / 2, cy = (P[0].y + P[1].y) / 2;
        const r = Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y) / 2;
        if (r < 1e-9) throw new Error("Hai điểm trùng nhau.");
        const a0 = Math.atan2(P[0].y - cy, P[0].x - cx) * 180 / Math.PI;
        const o = addObject(`arc(${R(cx)},${R(cy)},${R(r)},${R(a0)},${R(a0 + 180)})`);
        if (o && P[0]._pid && P[1]._pid) mmAttachParents(o, [P[0]._pid, P[1]._pid], { type: "semicircle", p1: P[0]._pid, p2: P[1]._pid });
      } else if (T === "distance") {
        const d = Math.hypot(P[1].x - P[0].x, P[1].y - P[0].y);
        const oSeg = addObject(`segment(${R(P[0].x)},${R(P[0].y)},${R(P[1].x)},${R(P[1].y)})`);
        if (oSeg && P[0]._pid && P[1]._pid) mmAttachParents(oSeg, [P[0]._pid, P[1]._pid], { type: "segment", p1: P[0]._pid, p2: P[1]._pid });
        addObject(`text("d=${R(d)}",${R((P[0].x + P[1].x) / 2)},${R((P[0].y + P[1].y) / 2)})`, { color: "#34d399" });
        toast(`Khoảng cách = ${R(d)}.`, "ok");
      } else if (T === "regpoly") {
        const cx = P[0].x, cy = P[0].y, r = Math.hypot(P[1].x - cx, P[1].y - cy);
        if (r < 1e-9) throw new Error("Bán kính quá nhỏ.");
        const a0 = Math.atan2(P[1].y - cy, P[1].x - cx);
        const cPid = P[0]._pid, vPid = P[1]._pid;
        mmModal({ title: "Đa giác đều", okText: "Tạo", fields: [{ key: "n", label: "Số cạnh (3–12)", value: 5, type: "number", min: 3, max: 12, step: 1 }] }).then(v => {
          const n = clamp(Math.round(+(v && v.n) || 5), 3, 12);
          if (!v) { draw(); return; }
          const pts = [];
          for (let i = 0; i < n; i++) {
            const a = a0 + (2 * Math.PI * i) / n;
            pts.push(`(${R(cx + r * Math.cos(a))},${R(cy + r * Math.sin(a))})`);
          }
          try {
            const o = addObject(`polygon(${pts.join(",")})`);
            if (o && cPid && vPid) mmAttachParents(o, [cPid, vPid], { type: "regpoly", cId: cPid, vId: vPid, n });
            draw(); toast(`${o.name}: ${n} cạnh đều.`, "ok");
          }
          catch (e) { draw(); toast(e.message, "err"); }
        });
        draw(); return;
      } else if (T === "anglefixed") {
        const [V, A] = P;
        const base = Math.atan2(A.y - V.y, A.x - V.x);
        const vPid = V._pid, aPid = A._pid;
        mmModal({ title: "Góc có độ lớn cho trước", okText: "Tạo tia", fields: [{ key: "deg", label: "Số độ", value: 45, type: "number", step: 5 }] }).then(v => {
          if (!v) { draw(); return; }
          const a = base + (+v.deg || 0) * Math.PI / 180;
          try {
            const o = addObject(`ray(${R(V.x)},${R(V.y)},${R(V.x + Math.cos(a))},${R(V.y + Math.sin(a))})`);
            if (o && vPid && aPid) mmAttachParents(o, [vPid, aPid], { type: "anglefixed", vId: vPid, aId: aPid, deg: +v.deg || 0 });
            draw(); toast(`Tia hợp ${+v.deg}°: ${o.name}.`, "ok");
          }
          catch (e) { draw(); toast(e.message, "err"); }
        });
        draw(); return;
      } else if (T === "refpoint") {
        const S = selectedPointObj(); if (!S) throw new Error("Hãy chọn một điểm trong Đại số.");
        const o = markPoint(2 * P[0].x - S.x, 2 * P[0].y - S.y, S.color);
        if (o && P[0]._pid) mmAttachParents(o, [S.id, P[0]._pid], { type: "refpoint", sId: S.id, cId: P[0]._pid });
        toast(`Đối xứng ${S.name} qua tâm.`, "ok");
      } else if (T === "translate") {
        const S = selectedPointObj(); if (!S) throw new Error("Hãy chọn một điểm trong Đại số.");
        const o = markPoint(S.x + (P[1].x - P[0].x), S.y + (P[1].y - P[0].y), S.color);
        if (o && P[0]._pid && P[1]._pid) mmAttachParents(o, [S.id, P[0]._pid, P[1]._pid], { type: "translate", sId: S.id, v1: P[0]._pid, v2: P[1]._pid });
        toast(`Tịnh tiến ${S.name} theo véc-tơ.`, "ok");
      } else if (T === "refline") {
        const S = selectedPointObj(); if (!S) throw new Error("Hãy chọn một điểm trong Đại số.");
        const [A, B] = P;
        const dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
        if (l2 < 1e-12) throw new Error("Trục suy biến.");
        const t = ((S.x - A.x) * dx + (S.y - A.y) * dy) / l2;
        const o = markPoint(2 * (A.x + t * dx) - S.x, 2 * (A.y + t * dy) - S.y, S.color);
        if (o && P[0]._pid && P[1]._pid) mmAttachParents(o, [S.id, P[0]._pid, P[1]._pid], { type: "refline", sId: S.id, aId: P[0]._pid, bId: P[1]._pid });
        toast(`Đối xứng ${S.name} qua trục.`, "ok");
      }
      if (!["regpoly", "anglefixed"].includes(T)) toast("Đã dựng hình xong.", "ok");
    } catch (e) { toast(e.message, "err"); }
    draw(); return;
  }
  /* --- nhóm 3 chạm --- */
  const trio = ["bisector", "arc", "sector", "ellipse", "parabola", "hyperbola", "angle", "compass", "circle3", "arc3", "sector3"];
  if (trio.includes(T)) {
    state.pending.push({ x, y, _pid: (typeof __clickId !== "undefined" ? __clickId : null) }); draw();
    if (state.pending.length < 3) {
      toast(["Điểm 1/3 — nhấp tiếp.", "Điểm 2/3 — nhấp điểm cuối."][state.pending.length - 1] || "");
      return;
    }
    const [A, B, C] = state.pending; state.pending = [];
    try {
      if (T === "bisector") {
        const u = { x: A.x - B.x, y: A.y - B.y }, w = { x: C.x - B.x, y: C.y - B.y };
        const lu = Math.hypot(u.x, u.y) || 1, lw = Math.hypot(w.x, w.y) || 1;
        let dx = u.x / lu + w.x / lw, dy = u.y / lu + w.y / lw;
        if (Math.hypot(dx, dy) < 1e-9) { dx = -u.y / lu; dy = u.x / lu; }
        const o = addObject(lineExprThrough(B.x, B.y, dx, dy));
        if (o && A._pid && B._pid && C._pid) mmAttachParents(o, [A._pid, B._pid, C._pid], { type: "bisector", p1: A._pid, p2: B._pid, p3: C._pid });
        toast(`Phân giác: ${o.name}.`, "ok");
      } else if (T === "arc" || T === "sector") {
        const r = Math.hypot(A.x - B.x, A.y - B.y);
        if (r < 1e-9) throw new Error("Bán kính quá nhỏ.");
        const a0 = Math.atan2(A.y - B.y, A.x - B.x) * 180 / Math.PI;
        const a1 = Math.atan2(C.y - B.y, C.x - B.x) * 180 / Math.PI;
        const o = addObject(`${T}(${R(B.x)},${R(B.y)},${R(r)},${R(a0)},${R(a1)})`);
        if (o && A._pid && B._pid && C._pid) mmAttachParents(o, [A._pid, B._pid, C._pid], { type: T, cId: B._pid, sId: A._pid, eId: C._pid });
        toast(`${T === "arc" ? "Cung tròn" : "Hình quạt"}: ${o.name}.`, "ok");
      } else if (T === "ellipse") {
        const d1 = Math.hypot(C.x - A.x, C.y - A.y), d2 = Math.hypot(C.x - B.x, C.y - B.y);
        const a = (d1 + d2) / 2, c2 = Math.hypot(B.x - A.x, B.y - A.y) / 2;
        if (a <= c2 + 1e-9) throw new Error("Điểm phải nằm ngoài đoạn F1F2.");
        const b = Math.sqrt(a * a - c2 * c2);
        const cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2;
        const rot = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;
        const o = addObject(`ellipse(${R(cx)},${R(cy)},${R(a)},${R(b)},${R(rot)})`);
        if (o && A._pid && B._pid && C._pid) mmAttachParents(o, [A._pid, B._pid, C._pid], { type: "ellipse", f1: A._pid, f2: B._pid, pId: C._pid });
        toast(`Elíp: ${o.name}.`, "ok");
      } else if (T === "parabola") {
        const dx = C.x - B.x, dy = C.y - B.y, l2 = dx * dx + dy * dy;
        if (l2 < 1e-12) throw new Error("Hai điểm chuẩn trùng nhau.");
        const l = Math.sqrt(l2), nx = -dy / l, ny = dx / l;
        const cc = -(nx * B.x + ny * B.y);
        const F = `(x-${R(A.x)})^2+(y-${R(A.y)})^2-(${R(nx)}*x+${R(ny)}*y+${R(cc)})^2`;
        const o = addObject(`${F} = 0`);
        if (o && A._pid && B._pid && C._pid) mmAttachParents(o, [A._pid, B._pid, C._pid], { type: "parabola", fId: A._pid, d1: B._pid, d2: C._pid });
        toast(`Parabôn: ${o.name}.`, "ok");
      } else if (T === "hyperbola") {
        const d1 = Math.hypot(C.x - A.x, C.y - A.y), d2 = Math.hypot(C.x - B.x, C.y - B.y);
        const a = Math.abs(d1 - d2) / 2, c2 = Math.hypot(B.x - A.x, B.y - A.y) / 2;
        if (!(a > 1e-9) || a >= c2 - 1e-9) throw new Error("Cần ||PF1|−|PF2|| < F1F2.");
        const b = Math.sqrt(c2 * c2 - a * a);
        const cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2;
        const rot = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI;
        const o = addObject(`hyperbola(${R(cx)},${R(cy)},${R(a)},${R(b)},${R(rot)})`);
        if (o && A._pid && B._pid && C._pid) mmAttachParents(o, [A._pid, B._pid, C._pid], { type: "hyperbola", f1: A._pid, f2: B._pid, pId: C._pid });
        toast(`Hypebôn: ${o.name}.`, "ok");
      } else if (T === "angle") {
        const o = addObject(`angle(${R(A.x)},${R(A.y)},${R(B.x)},${R(B.y)},${R(C.x)},${R(C.y)})`);
        if (o && A._pid && B._pid && C._pid) mmAttachParents(o, [A._pid, B._pid, C._pid], { type: "angle", p1: A._pid, p2: B._pid, p3: C._pid });
        toast(`Góc ${o.name}: ${R(angleDegOf(o).deg)}°.`, "ok");
      } else if (T === "compass") {
        const r = Math.hypot(C.x - B.x, C.y - B.y);
        if (r < 1e-9) throw new Error("Bán kính quá nhỏ.");
        const o = addObject(`(x - ${R(A.x)})^2 + (y - ${R(A.y)})^2 = ${R(r * r)}`);
        o.cx = R(A.x); o.cy = R(A.y); o.cr = R(r);
        if (A._pid && B._pid && C._pid) mmAttachParents(o, [A._pid, B._pid, C._pid], { type: "compass", cId: A._pid, r1: B._pid, r2: C._pid });
        else mmAttachParents(o, [], { type: "compass" });
        persist();
        toast(`Compa: ${o.name}.`, "ok");
      } else if (T === "circle3") {
        let cc;
        try { cc = mmCircumcenter(A.x, A.y, B.x, B.y, C.x, C.y); }
        catch (e) { toast(e.message, "err"); draw(); return; }
        const r = Math.hypot(A.x - cc.x, A.y - cc.y);
        const o = addObject(`(x - ${R(cc.x)})^2 + (y - ${R(cc.y)})^2 = ${R(r * r)}`);
        o.cx = R(cc.x); o.cy = R(cc.y); o.cr = R(r);
        if (A._pid && B._pid && C._pid) mmAttachParents(o, [A._pid, B._pid, C._pid], { type: "circle3", p1: A._pid, p2: B._pid, p3: C._pid });
        else mmAttachParents(o, [], { type: "circle3" });
        persist();
        toast(`Đường tròn qua 3 điểm: ${o.name}.`, "ok");
      } else if (T === "arc3" || T === "sector3") {
        let cc;
        try { cc = mmCircumcenter(A.x, A.y, B.x, B.y, C.x, C.y); }
        catch (e) { toast(e.message, "err"); draw(); return; }
        const r = Math.hypot(A.x - cc.x, A.y - cc.y);
        const kind = T === "arc3" ? "arc" : "sector";
        const a0 = Math.atan2(A.y - cc.y, A.x - cc.x) * 180 / Math.PI;
        const a1 = Math.atan2(C.y - cc.y, C.x - cc.x) * 180 / Math.PI;
        const o = addObject(`${kind}(${R(cc.x)},${R(cc.y)},${R(r)},${R(a0)},${R(a1)})`);
        if (o && A._pid && B._pid && C._pid) mmAttachParents(o, [A._pid, B._pid, C._pid], { type: T, p1: A._pid, p2: B._pid, p3: C._pid });
        toast(`${T === "arc3" ? "Cung qua 3 điểm" : "Quạt qua 3 điểm"}: ${o.name}.`, "ok");
      }
    } catch (e) { toast(e.message, "err"); }
    draw(); return;
  }
  /* --- điểm thuộc / dính (Points) --- */
  if (T === "pointon") {
    const hit = nearestObject(px, py);
    const ref = hit ? hit.obj : null;
    const okRef = ref && ["segment", "ray", "vector", "fn", "vline", "implicit", "arc", "sector", "ellipse", "polygon"].includes(ref.kind);
    if (!okRef) { toast("Nhấp lên một đường / hình để đặt điểm thuộc.", "err"); return; }
    const q = mmProjectToObj(x, y, ref);
    if (!q || !isFinite(q.x)) { toast("Không chiếu được lên đối tượng này.", "err"); return; }
    try {
      const o = markPoint(q.x, q.y, "#38bdf8");
      mmAttachParents(o, [ref.id], { type: "pointon", refId: ref.id });
      toast(`Điểm thuộc ${ref.name} — kéo ${ref.name} để kiểm tra.`, "ok");
    } catch (e) { toast(e.message, "err"); }
    draw(); return;
  }
  if (T === "attach") {
    if (!state.pending.length) {
      if (typeof __clickId === "undefined" || !__clickId) { toast("Nhấp vào một điểm trước (lần 2 nhấp lên hình để dính).", "err"); return; }
      const pt = mmGetObj(__clickId);
      if (!pt || (pt.kind !== "point" && pt.kind !== "point3d")) { toast("Lần 1 phải là một điểm.", "err"); return; }
      if (pt.def && (pt.def.type === "pointon" || pt.def.type === "attach")) {
        pushHistory();
        delete pt.parents; delete pt.def;
        renderList($("#algebraSearch").value); draw(); persist();
        toast(`Đã hủy dính ${pt.name} — giờ di chuyển độc lập.`, "ok");
        return;
      }
      state.pending.push({ x: pt.x, y: pt.y, _pid: pt.id }); draw();
      toast(`Đã chọn ${pt.name} — nhấp lên đối tượng để dính vào (ESC hủy).`);
      return;
    }
    const first = state.pending[0]; state.pending = [];
    const pt = first._pid ? mmGetObj(first._pid) : null;
    if (!pt) { draw(); return; }
    const hit = nearestObject(px, py);
    const ref = hit ? hit.obj : null;
    const okRef = ref && ref.id !== pt.id && ["segment", "ray", "vector", "fn", "vline", "implicit", "arc", "sector", "ellipse", "polygon"].includes(ref.kind);
    if (!okRef) { draw(); toast("Cần nhấp lên một đường / hình để dính.", "err"); return; }
    try {
      const q = mmProjectToObj(pt.x, pt.y, ref) || { x: pt.x, y: pt.y };
      pushHistory();
      pt.x = R(q.x); pt.y = R(q.y);
      mmSyncPointNameExpr(pt);
      mmAttachParents(pt, [ref.id], { type: "attach", refId: ref.id });
      renderList($("#algebraSearch").value); draw(); persist();
      toast(`Đã dính ${pt.name} vào ${ref.name}.`, "ok");
    } catch (e) { draw(); toast(e.message, "err"); }
    return;
  }
  /* --- véc-tơ từ điểm / đa giác véc-tơ / đa giác có hướng (Lines & Polygons) --- */
  if (T === "vecfrom") {
    state.pending.push({ x, y, _pid: (typeof __clickId !== "undefined" ? __clickId : null) }); draw();
    if (state.pending.length < 3) {
      toast(["Điểm 1/3 (đầu hướng) — nhấp tiếp.", "Điểm 2/3 (ngọn hướng) — nhấp điểm đặt."][state.pending.length - 1] || "");
      return;
    }
    const [A, B, O] = state.pending; state.pending = [];
    const dx = B.x - A.x, dy = B.y - A.y;
    if (Math.hypot(dx, dy) < 1e-9) { toast("Hai điểm định hướng trùng nhau.", "err"); draw(); return; }
    try {
      const o = addObject(`vector(${R(O.x)},${R(O.y)},${R(O.x + dx)},${R(O.y + dy)})`);
      if (o && A._pid && B._pid && O._pid) mmAttachParents(o, [A._pid, B._pid, O._pid], { type: "vecfrom", d1: A._pid, d2: B._pid, oId: O._pid });
      toast(`Véc-tơ từ điểm: ${o.name} (giữ hướng/độ lớn).`, "ok");
    } catch (e) { toast(e.message, "err"); }
    draw(); return;
  }
  if (T === "vecpoly") {
    const base = state.objects.find(s => s.id === state.selectedId && s.kind === "polygon" && !s.error);
    if (!base) { toast("Hãy chọn một đa giác trong danh sách Đại số trước.", "err"); return; }
    state.pending.push({ x, y, _pid: (typeof __clickId !== "undefined" ? __clickId : null) }); draw();
    if (state.pending.length < 2) { toast("Điểm gốc véc-tơ — nhấp ngọn để tịnh tiến đa giác."); return; }
    const [A, B] = state.pending; state.pending = [];
    const dx = B.x - A.x, dy = B.y - A.y;
    try {
      const pts = base.pts.map(q => `(${R(q[0] + dx)},${R(q[1] + dy)})`);
      const o = addObject(`polygon(${pts.join(",")})`);
      const ids = [base.id];
      const def = { type: "vecpoly", polyId: base.id, dx: R(dx), dy: R(dy) };
      if (A._pid && B._pid) { ids.push(A._pid, B._pid); def.v1 = A._pid; def.v2 = B._pid; }
      mmAttachParents(o, ids, def);
      toast(`Đa giác véc-tơ: ${o.name} = ${base.name} + véc-tơ.`, "ok");
    } catch (e) { toast(e.message, "err"); }
    draw(); return;
  }
  /* --- quỹ tích (Construct): đường lấy mẫu, KHÔNG phải symbolic exact --- */
  if (T === "locus") {
    const P0 = selectedPointObj();
    if (!P0 || !P0.def) { toast("Hãy chọn một điểm phụ thuộc (trung điểm, đối xứng…) trong Đại số trước.", "err"); return; }
    let driverId = null;
    try {
      const ids = mmDefParents(P0);
      for (const id of ids) {
        const q = mmGetObj(id);
        if (q && (q.kind === "point" || q.kind === "point3d") && q.def && mmDefParents(q).length) { driverId = id; break; }
      }
      if (!driverId) for (const id of ids) {
        const q = mmGetObj(id);
        if (q && (q.kind === "point" || q.kind === "point3d")) { driverId = id; break; }
      }
    } catch {}
    if (!driverId) { toast("Không tìm được điểm driver cho quỹ tích.", "err"); return; }
    const D0 = mmGetObj(driverId);
    const refIds = mmDefParents(D0);
    const base = refIds.map(mmGetObj).find(q => q && !q.error && ["segment", "implicit", "arc"].includes(q.kind));
    if (!base) { toast("Quỹ tích cần driver dính trên đoạn / đường tròn / cung (dùng Điểm thuộc).", "err"); return; }
    mmModal({ title: "Quỹ tích (lấy mẫu)", okText: "Dựng", fields: [{ key: "n", label: "Số mẫu (60–240)", value: 120, type: "number", min: 60, max: 240, step: 10 }] }).then(v => {
      if (!v) return;
      const n = Math.min(240, Math.max(60, Math.round(+v.n || 120)));
      const ox = D0.x, oy = D0.y;
      const trace = [];
      try {
        for (let i = 0; i < n; i++) {
          const t = i / n;
          if (base.kind === "segment") {
            D0.x = base.x1 + (base.x2 - base.x1) * t;
            D0.y = base.y1 + (base.y2 - base.y1) * t;
          } else if (base.kind === "implicit" && base.cx !== undefined) {
            const a = t * Math.PI * 2;
            D0.x = base.cx + Math.cos(a) * (base.cr || 1);
            D0.y = base.cy + Math.sin(a) * (base.cr || 1);
          } else if (base.kind === "arc") {
            const a = (base.a0 || 0) + ((base.a1 || 0) - (base.a0 || 0)) * t;
            D0.x = base.cx + Math.cos(a) * base.r;
            D0.y = base.cy + Math.sin(a) * base.r;
          }
          try { propagateUpdates([D0.id]); } catch {}
          if (isFinite(P0.x) && isFinite(P0.y)) trace.push(`(${R(P0.x)},${R(P0.y)})`);
        }
      } finally {
        D0.x = ox; D0.y = oy;
        try { mmSyncPointNameExpr(D0); propagateUpdates([D0.id]); } catch {}
        draw();
      }
      if (trace.length < 3) { toast("Không lấy được mẫu quỹ tích.", "err"); return; }
      try {
        const o = addObject(`polygon(${trace.join(",")})`, { color: "#f472b6" });
        mmAttachParents(o, [P0.id, D0.id], { type: "locus", srcId: P0.id, driverId: D0.id, refId: base.id, n: trace.length });
        toast(`Quỹ tích (lấy mẫu ${trace.length} điểm, không phải symbolic): ${o.name}.`, "ok");
      } catch (e) { toast(e.message, "err"); }
    });
    return;
  }
  /* --- đối xứng điểm qua đường (Transform): dùng đường có sẵn, khác refline (trục 2 điểm) --- */
  if (T === "refpointline") {
    state.pending.push({ x, y, _pid: (typeof __clickId !== "undefined" ? __clickId : null) }); draw();
    if (state.pending.length < 2) { toast("Đã chọn điểm — nhấp lên một đường thẳng."); return; }
    const [S] = state.pending; state.pending = [];
    const src = S._pid ? mmGetObj(S._pid) : null;
    if (!src || (src.kind !== "point" && src.kind !== "point3d")) { toast("Điểm đầu phải là một điểm (nhấp gần điểm có sẵn).", "err"); draw(); return; }
    const hit = nearestObject(px, py);
    const ref = hit ? hit.obj : null;
    if (!ref || !["fn", "vline", "segment", "ray", "vector"].includes(ref.kind)) { draw(); toast("Cần nhấp lên một đường thẳng / đoạn.", "err"); return; }
    try {
      const d = refDir(ref, src.x, src.y);
      if (!d) throw new Error("Không tính được hướng đường.");
      let ax = src.x, ay = src.y;
      if (ref.kind === "segment" || ref.kind === "ray" || ref.kind === "vector") { ax = ref.x1; ay = ref.y1; }
      else if (ref.kind === "fn") { try { ax = src.x; ay = ref.fn(src.x); } catch {} }
      else if (ref.kind === "vline") { ax = ref.x; ay = src.y; }
      const l2 = d.dx * d.dx + d.dy * d.dy || 1;
      const t = ((src.x - ax) * d.dx + (src.y - ay) * d.dy) / l2;
      const o = markPoint(2 * (ax + t * d.dx) - src.x, 2 * (ay + t * d.dy) - src.y, src.color);
      if (o) mmAttachParents(o, [src.id, ref.id], { type: "refpointline", sId: src.id, refId: ref.id });
      toast(`Đối xứng ${src.name} qua ${ref.name}.`, "ok");
    } catch (e) { toast(e.message, "err"); }
    draw(); return;
  }
  /* --- đa giác: khép tại điểm đầu --- */
  if (T === "polygon" || T === "oriented") {
    if (state.pending.length >= 3) {
      const F = state.pending[0];
      if (Math.hypot(x - F.x, y - F.y) < 0.35) { finishPending(); return; }
    }
    state.pending.push({ x, y, _pid: (typeof __clickId !== "undefined" ? __clickId : null) }); draw();
    toast(`Đỉnh ${state.pending.length} — nhấp điểm đầu để khép / Enter để xong.`);
    return;
  }
  /* --- còn lại: polar… nâng cao --- */
  toast("Công cụ này là CAS nâng cao — hãy dùng Markus hoặc dựng tay.", undefined);
}

/* ---------------- toolbar / rail / panels ---------------- */
const TOOL_HINTS = {
  move: "Di chuyển: kéo nền, nhấp chọn.", pan: "Kéo nền để di chuyển khung nhìn.",
  point: "Điểm mới: nhấp lên mặt phẳng.", complex: "Số phức: nhấp để đặt Z(a,b).",
  slider: "Thanh trượt: nhấp để tạo tham số a, b, c…",
  line: "Đường thẳng: nhấp 2 điểm.", circle: "Đường tròn: nhấp tâm rồi điểm vành.",
  segment: "Đoạn thẳng: nhấp 2 đầu.", ray: "Tia: nhấp gốc rồi điểm định hướng.",
  vector: "Véc-tơ: nhấp điểm đặt rồi ngọn.", regression: "Hồi quy: nhấp nhiều điểm, Enter xong.",
  fixedseg: "Đoạn cố định: nhấp gốc rồi nhập dài + góc.",
  midpoint: "Trung điểm: nhấp 2 điểm.", perp: "Vuông góc: chọn đường ở Đại số, nhấp 1 điểm.",
  midperp: "Trung trực: nhấp 2 điểm.", parallel: "Song song: chọn đường ở Đại số, nhấp 1 điểm.",
  bisector: "Phân giác: nhấp 3 điểm (đỉnh giữa).", tangent: "Tiếp tuyến: chọn đường, nhấp điểm chạm.",
  compass: "Compa: tâm + 2 điểm định bán kính.", semicircle: "Bán nguyệt: 2 đầu đường kính.",
  arc: "Cung tròn: tâm + đầu + cuối.", sector: "Hình quạt: tâm + đầu + cuối.",
  ellipse: "Elíp: 2 tiêu điểm + 1 điểm.", parabola: "Parabôn: tiêu điểm + 2 điểm chuẩn.",
  hyperbola: "Hypebôn: 2 tiêu điểm + 1 điểm.", conic5: "Cônic: nhấp 5 điểm.",
  polygon: "Đa giác: nhấp đỉnh, khép tại điểm đầu / Enter.", regpoly: "Đa giác đều: tâm + đỉnh + số cạnh.",
  angle: "Góc: nhấp 3 điểm (đỉnh giữa).", anglefixed: "Góc cố định: đỉnh + điểm + nhập độ.",
  distance: "Khoảng cách: nhấp 2 điểm.", area: "Diện tích: nhấp vào đa giác.",
  slope: "Hệ số góc: chọn đường, nhấp vị trí nhãn.",
  extremum: "Cực trị của hàm đang chọn.", root: "Nghiệm của hàm đang chọn.",
  intersect: "Giao điểm các đồ thị.", select: "Chọn: nhấp gần đối tượng.",
  delete: "Xóa: nhấp vào đối tượng.", toggle: "Hiện/ẩn: nhấp đối tượng.",
  names: "Tên: nhấp điểm/hình để ẩn-hiện tên.", style: "Chép kiểu: nhấp nguồn rồi đích.",
  refline: "ĐX qua đường: chọn điểm, nhấp 2 điểm trục.", refpoint: "ĐX qua điểm: chọn điểm, nhấp tâm.",
  translate: "Tịnh tiến: chọn điểm, nhấp 2 điểm véc-tơ.", rotate: "Quay: chọn điểm, nhấp tâm, nhập góc.",
  dilate: "Vị tự: chọn điểm, nhấp tâm, nhập tỉ số.",
  text: "Chèn chữ: nhấp vị trí rồi nhập.", image: "Chèn ảnh: nhấp vị trí rồi chọn file.",
  plist: "Danh sách: nhấp nhiều điểm, Enter xong.",
  pointon: "Điểm thuộc: nhấp lên đường/hình để đặt điểm dính.",
  attach: "Dính/Hủy dính: nhấp điểm rồi nhấp hình (nhấp lại điểm dính để gỡ).",
  locus: "Quỹ tích (lấy mẫu): chọn điểm phụ thuộc rồi dựng đường mẫu.",
  vecfrom: "Véc-tơ từ điểm: nhấp 2 điểm hướng rồi điểm đặt.",
  vecpoly: "Đa giác véc-tơ: chọn đa giác rồi nhấp 2 điểm véc-tơ.",
  oriented: "Đa giác có hướng: nhấp đỉnh, khép tại điểm đầu (lưu CW/CCW).",
  circle3: "Tròn qua 3 điểm: nhấp 3 điểm không thẳng hàng.",
  arc3: "Cung qua 3 điểm.", sector3: "Quạt qua 3 điểm.",
  refpointline: "ĐX điểm qua đường: nhấp điểm rồi nhấp lên đường.",
  "m3d-move": "Di chuyển 3D: kéo để xoay, Shift+kéo để pan, lăn chuột zoom.",
  "m3d-point": "Điểm 3D: nhấp lên nền (snap điểm tím khi gần).",
  "m3d-pointon": "Điểm thuộc 3D: nhấp lên đoạn/đường/mặt/cầu/khối.",
  "m3d-midpoint": "Trung điểm 3D: nhấp 2 điểm.",
  "m3d-segment": "Đoạn 3D: nhấp 2 điểm.", "m3d-line": "Đường 3D: nhấp 2 điểm.",
  "m3d-ray": "Tia 3D: nhấp gốc rồi điểm hướng.", "m3d-vector": "Véc-tơ 3D: nhấp điểm đặt rồi ngọn.",
  "m3d-vecfrom": "Véc-tơ từ điểm: 2 điểm hướng + điểm đặt.",
  "m3d-parallel": "Song song 3D: chọn đường ở Đại số, nhấp 1 điểm.",
  "m3d-perp": "Vuông góc 3D: chọn đường/mặt ở Đại số, nhấp 1 điểm.",
  "m3d-polygon": "Đa giác 3D: nhấp đỉnh, Enter/nhấp đúp để xong.",
  "m3d-plane3": "Mặt phẳng 3 điểm: nhấp 3 điểm không thẳng hàng.",
  "m3d-planepar": "MP song song: chọn mặt ở Đại số, nhấp 1 điểm.",
  "m3d-planeperp": "MP vuông góc: chọn đường ở Đại số, nhấp 1 điểm.",
  "m3d-circleCP": "Tròn 3D: nhấp tâm rồi điểm vành.",
  "m3d-circleCR": "Tròn 3D: nhấp tâm rồi nhập bán kính.",
  "m3d-circle3": "Tròn 3D qua 3 điểm.",
  "m3d-sphereCP": "Mặt cầu: nhấp tâm rồi điểm trên cầu.",
  "m3d-sphereCR": "Mặt cầu: nhấp tâm rồi nhập bán kính.",
  "m3d-cube": "Lập phương: nhấp 2 điểm cạnh đáy + nhập cao.",
  "m3d-tetra": "Tứ diện đều: nhấp 2 điểm (cạnh).",
  "m3d-prism": "Lăng trụ: chọn đa giác đáy + nhập cao.",
  "m3d-pyramid": "Hình chóp: chọn đa giác đáy rồi nhấp đỉnh.",
  "m3d-cyl": "Hình trụ: nhấp 2 điểm trục + nhập R.",
  "m3d-cone": "Hình nón: nhấp 2 điểm trục + nhập R.",
  "m3d-extrude": "Đùn đa giác thành lăng trụ.",
  "m3d-net": "Khai triển: nhấp khối để mở/gập (animation).",
  "m3d-intersect": "Giao 2 mặt: nhấp 2 đối tượng.",
  "m3d-dist": "Khoảng cách 3D: nhấp 2 điểm.", "m3d-angle": "Góc 3D: nhấp 3 điểm.",
  "m3d-area": "Diện tích: nhấp đa giác/tròn 3D.", "m3d-volume": "Thể tích: nhấp khối/cầu.",
  "m3d-translate": "Tịnh tiến 3D: chọn điểm, nhấp 2 điểm véc-tơ.",
  "m3d-refplane": "ĐX qua mặt: chọn điểm rồi nhấp mặt.",
  "m3d-refpoint": "ĐX qua điểm 3D: chọn điểm, nhấp tâm.",
  "m3d-rotline": "Quay quanh đường: chọn điểm, nhấp 2 điểm trục, nhập góc.",
  "m3d-dilate": "Vị tự 3D: chọn điểm, nhấp tâm, nhập k.",
  "m3d-select": "Chọn 3D: nhấp gần đối tượng.", "m3d-delete": "Xóa 3D: nhấp đối tượng.",
  "m3d-toggle": "Hiện/ẩn 3D.", "m3d-names": "Tên 3D.", "m3d-style": "Chép kiểu 3D.",
  "m3d-front": "Chính diện: camera bay tới vật đang chọn.",
  "m3d-demo": "Demo WOW: chóp + mặt + cầu + giao tuyến.",
};
function setTool(t) {
  state.tool = t; state.pending = []; state.toolMem = {};
  try { interact.hoverId = null; interact.hoverPart = null; interact.hoverVertex = -1; interact.drag = null; interact.pan = null; interact.orbit = null; interact.snapInfo = null; drag = null; } catch {}
  // chọn công cụ 3D -> tự chuyển sang mode 3D (cảm giác workspace thật)
  try {
    if (/^m3d-/.test(t || "") && state.mode !== "3d") setMode("3d");
    if ((t === "move" || t === "point") && state.mode === "3d") {
      // giữ nguyên mode 3D khi dùng tool 2D tương thích (point/move)
    }
  } catch {}
  $$("#toolGrid .tool-card").forEach(b => b.classList.toggle("is-active", b.dataset.tool === t));
  $$(".graph-toolbar button").forEach(b => { if (b.dataset.act === "pointer") b.classList.toggle("is-active", t === "move" || t === "m3d-move"); });
  try { canvas.classList.remove("mm-hover-pt", "mm-hover-body", "mm-hover-sel", "mm-dragging"); } catch {}
  canvas.style.cursor = (t === "move" || t === "pan" || t === "select" || t === "m3d-move" || t === "m3d-select") ? "grab" : "crosshair";
  try {
    const el = document.getElementById("m3dHint");
    if (el && /^m3d-/.test(t || "")) el.innerHTML = `Công cụ: <b>${(TOOL_HINTS[t] || t)}</b> — ESC hủy · click lại tool để reset.`;
  } catch {}
  draw();
}
function zoomBy(f) {
  if (state.mode === "3d") { state.view3d.scale = clamp(state.view3d.scale * f, 0.4, 6000); draw(); persist(); return; }
  state.view.scale = clamp(state.view.scale * f, MIN_SCALE, MAX_SCALE);
  sanitizeView(); draw(); persist();
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
  $$("#toolGrid .tool-card").forEach(b => b.addEventListener("click", () => {
    // click lại tool đang active -> reset về move (tránh kẹt trạng thái dựng)
    if (state.tool === b.dataset.tool) {
      setTool(state.mode === "3d" ? "m3d-move" : "move");
      toast("Đã reset công cụ.");
      return;
    }
    setTool(b.dataset.tool);
    toast(TOOL_HINTS[b.dataset.tool] || `Công cụ: ${b.querySelector("b").textContent}`);
  }));
  /* Tab 2D / 3D trong panel Công cụ dựng hình */
  $$(".tdim-tab").forEach(b => b.addEventListener("click", () => {
    const is3d = b.dataset.tdim === "3d";
    $$(".tdim-tab").forEach(x => {
      const on = x === b;
      x.classList.toggle("is-active", on);
      x.setAttribute("aria-selected", on ? "true" : "false");
    });
    const p2 = document.getElementById("tdimPane2d"), p3 = document.getElementById("tdimPane3d");
    if (p2) p2.hidden = is3d;
    if (p3) p3.hidden = !is3d;
  }));
  /* Enter chốt đa giác / hồi quy / danh sách (khi không gõ ô nhập) */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.target && e.target.closest && e.target.closest("input,textarea,select,.mm-modal")) return;
    if (["polygon", "oriented", "plist", "regression"].includes(state.tool) && state.pending.length) {
      e.preventDefault(); finishPending();
    } else if (state.tool === "m3d-polygon" && state.pending.length) {
      e.preventDefault(); mmFinishPoly3D();
    }
  });
  /* input chọn ảnh cho công cụ Chèn ảnh */
  if (!document.getElementById("imgPicker")) {
    const pk = document.createElement("input");
    pk.type = "file"; pk.id = "imgPicker"; pk.accept = "image/*"; pk.hidden = true;
    document.body.appendChild(pk);
    pk.addEventListener("change", () => {
      const f = pk.files && pk.files[0], pos = state.toolMem.imgPos;
      pk.value = "";
      if (!f || !pos) return;
      const rd = new FileReader();
      rd.onload = () => {
        const im = new Image();
        im.onload = () => {
          const sc = document.createElement("canvas");
          const k = Math.min(1, 480 / im.naturalWidth);
          sc.width = Math.max(1, Math.round(im.naturalWidth * k));
          sc.height = Math.max(1, Math.round(im.naturalHeight * k));
          sc.getContext("2d").drawImage(im, 0, 0, sc.width, sc.height);
          try {
            const o = addObject(`image(${pos.x},${pos.y},${Math.min(320, Math.round(160 * k) || 160)})`);
            o.w = clamp(Math.round(sc.width / 3), 40, 640);
            o.dataUrl = sc.toDataURL("image/jpeg", 0.85);
            renderList($("#algebraSearch").value); draw(); persist();
            toast(`Đã chèn ${o.name}.`, "ok");
          } catch (e) { toast(e.message, "err"); }
        };
        im.src = rd.result;
      };
      rd.readAsDataURL(f);
    });
  }
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
  const geoKb = $("#geoKeyboard");
  const openKb = () => { document.body.classList.add("kb-open"); if (geoKb) geoKb.hidden = false; };
  const closeKb = () => { document.body.classList.remove("kb-open"); if (geoKb) geoKb.hidden = true; };
  try { window.mmCloseKb = closeKb; window.mmOpenKb = openKb; } catch {}
  if (cmdInput) {
    cmdInput.addEventListener("focus", openKb);
    cmdInput.addEventListener("click", openKb);
    cmdInput.addEventListener("input", queueCmdPreview);
    cmdInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") executeCommand();
      if (e.key === "Escape") { e.target.value = ""; try { updateCmdPreview(); } catch {} closeKb(); e.target.blur(); }
    });
  }
  const kbClose = $("#kbClose");
  if (kbClose) kbClose.addEventListener("click", (e) => { e.stopPropagation(); closeKb(); if (cmdInput) cmdInput.blur(); });
  document.addEventListener("pointerdown", (e) => {
    if (!document.body.classList.contains("kb-open")) return;
    const t = e.target;
    if (t.closest && (t.closest("#geoKeyboard") || t.closest(".geo-input-row") || t.closest("#addObjectBtn"))) return;
    closeKb();
  });
  // chuyển tab khác Đại số thì ẩn bàn phím (kiểu GeoGebra)
  $$(".rail-item").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.view !== "algebra") closeKb();
  }));
  const clearCmdBtn = $("#clearCmdBtn");
  if (clearCmdBtn) clearCmdBtn.addEventListener("click", () => { const i = $("#cmdInput"); if (i) { i.value = ""; i.focus(); } try { updateCmdPreview(); } catch {} });
  const geoAddBtn = $("#geoAddBtn");
  if (geoAddBtn) geoAddBtn.addEventListener("click", executeCommand);
  const kbToggle = $("#keyboardBtn");
  if (kbToggle) kbToggle.addEventListener("click", () => {
    const k = $("#mathKeys") || $("#geoKeyboard");
    if (k) k.hidden = !k.hidden;
  });
  // Tabs bàn phím kiểu GeoGebra: 123 / ABC / #&¬
  $$(".geo-kb-tabs button[data-kb]").forEach(t => t.addEventListener("click", () => {
    $$(".geo-kb-tabs button[data-kb]").forEach(x => x.classList.toggle("is-active", x === t));
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
        try { updateCmdPreview(); } catch {}
      } else inp.focus();
      return;
    }
    if (act === "clear") { inp.value = ""; inp.focus(); try { updateCmdPreview(); } catch {} return; }
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
    else if (/^log_\($/.test(ins)) toast("Logarit cơ số tùy ý — vd: log_2(8). Gõ đủ số, dấu phẩy rồi đóng ngoặc.", undefined);
    else if (/^nroot\($/.test(ins)) toast("Căn bậc n — vd: nroot(8,3) = 2.", undefined);
    else if (ins === "i") toast("Số ảo i chưa vẽ trên đồ thị thực — hãy dùng phần thực / mô-đun.", undefined);
    else if (/^[∀∃∈∉⊂⊆∥⊥∠⊗∧∨→¬]$/.test(ins)) toast(`Ký hiệu ${ins} là logic / tập hợp — hãy nhập phương trình biên f(x,y)=0.`, undefined);
    else if (/^matrix|^\[\.\]/.test(ins) || ins === "[.]" || ins === "[..]" || ins === "[" || ins === "]") toast("Ma trận — hãy nhập điểm (x,y) hoặc khối 3D cube()/sphere().", undefined);
    else if (/^[{}:;]$|^:=$|^;$|^\$$|^@$|^#$|^&$/.test(ins)) toast("Ký hiệu lập trình / tập hợp — biểu thức vẽ chỉ cần x, y, số và hàm.", undefined);
    else if (/^['\"]$|^''$/.test(ins)) toast("Dấu nháy dùng để đặt tên — biểu thức chỉ dùng x, y, số và hàm.", undefined);
    else if (/^[αβγθλμρσφωΔΣ]$/.test(ins)) toast(`${ins} sẽ dùng như biến x khi vẽ.`, undefined);
    if (greekPop && !b.closest("#greekPop")) greekPop.hidden = true;
    // phím mẫu kiểu GeoGebra: tự đóng ngoặc, caret nhảy vào □
    let caretBack = 0;
    if (ins === "nroot(") { ins = "nroot(, )"; caretBack = 3; }
    else if (/^[A-Za-z0-9√∛^_+\-*/]+\($/.test(ins)) { ins += ")"; caretBack = 1; }
    insertAtCursor(inp, ins, caretBack);
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
    if (a === "reset") { try { if (typeof mmFlyTo === "function") mmFlyTo({ az: -0.65, el: 0.95, scale: 36, tx: 0, ty: 0, tz: 0 }, 650); else resetView3D(); } catch { resetView3D(); } }
    else if (a === "top") { try { mmFlyTo({ az: 0, el: 1.5, scale: state.view3d.scale, tx: state.view3d.tx, ty: state.view3d.ty, tz: state.view3d.tz }, 650); } catch { state.view3d.az = 0; state.view3d.el = 1.5; draw(); persist(); } }
    else if (a === "front") { try { mmFlyTo({ az: 0, el: 0.55, scale: state.view3d.scale, tx: state.view3d.tx, ty: state.view3d.ty, tz: state.view3d.tz }, 650); } catch {} }
    else if (a === "right") { try { mmFlyTo({ az: -Math.PI / 2, el: 0.7, scale: state.view3d.scale, tx: state.view3d.tx, ty: state.view3d.ty, tz: state.view3d.tz }, 650); } catch {} }
    else if (a === "iso") { try { mmFlyTo({ az: -Math.PI / 4, el: 0.955, scale: state.view3d.scale, tx: state.view3d.tx, ty: state.view3d.ty, tz: state.view3d.tz }, 650); } catch {} }
    else if (a === "focus") { try { const o = mmGetObj(state.selectedId); mmFocusObject(o); } catch {} }
    else if (a === "full") { try { if (document.fullscreenElement) document.exitFullscreen(); else wrap.requestFullscreen?.(); } catch {} }
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

  // panel Khai triển Net (3D Construction Engine)
  try {
    const np = document.getElementById("m3dNetPlay"), nr = document.getElementById("m3dNetReset"), ns = document.getElementById("m3dNetSlider");
    if (np) np.addEventListener("click", () => {
      const o = mmGetObj(state.selectedId);
      if (!o || o.kind !== "solid3") { toast("Hãy chọn một khối 3D trước.", "err"); return; }
      mmOpenNetPanel(o);
      mmNetPlay(o, !(o.netT > 0.5));
      np.textContent = (o.netT > 0.5) ? "▶ Mở" : "⏸ Gập";
    });
    if (nr) nr.addEventListener("click", () => {
      const o = mmGetObj(state.selectedId);
      if (!o || o.kind !== "solid3") { toast("Hãy chọn một khối 3D trước.", "err"); return; }
      try { if (typeof mmNetRaf !== "undefined" && mmNetRaf) cancelAnimationFrame(mmNetRaf); } catch {}
      mmNetSet(o, 0);
      if (np) np.textContent = "▶ Mở";
      toast(`Đã gập lại ${o.name}.`, "ok");
    });
    if (ns) ns.addEventListener("input", () => {
      const o = mmGetObj(state.selectedId);
      if (!o || o.kind !== "solid3") return;
      try { if (typeof mmNetRaf !== "undefined" && mmNetRaf) cancelAnimationFrame(mmNetRaf); } catch {}
      mmNetSet(o, (+ns.value || 0) / 100);
    });
  } catch {}

  // table + sheet + settings
  $("#tableSelect").addEventListener("change", refreshTable);
  $("#setMinor").addEventListener("change", (e) => { state.opts.minor = e.target.checked; draw(); persist(); });
  $("#setLabels").addEventListener("change", (e) => { state.opts.labels = e.target.checked; draw(); persist(); });
  $("#setGlow").addEventListener("change", (e) => { state.opts.glow = e.target.checked; draw(); persist(); });

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
  state.future.push(JSON.stringify({ objects: state.objects.map(stripFn), seq: state.seq, colorIdx, params: state.params }));
  restore(state.history.pop());
  renderList(); refreshTableSelect(); draw(); persist();
}
function redo() {
  if (!state.future.length) { toast("Không còn gì để làm lại."); return; }
  state.history.push(JSON.stringify({ objects: state.objects.map(stripFn), seq: state.seq, colorIdx, params: state.params }));
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
    op.value = o.id; op.textContent = `${prettyRowLetter(o)}: y = ${prettyTextUnicode(o.expr)}`;
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
/* ============================================================================
   HIỂN THỊ CÔNG THỨC KIỂU GEOGEBRA — dùng chung mọi nơi (list Đại số,
   preview ô nhập, bảng, toast…).
   - State LUÔN giữ text gốc ASCII để tính toán; chỉ pretty lúc render.
   - asciiToLatex: text người dùng -> LaTeX (KaTeX render, throwOnError:false).
   - Fallback offline: markusPrettyTex (HTML sup/sub/frac/√).
   ============================================================================ */
function asciiToLatex(s) {
  let t = String(s ?? "");
  t = t.replace(/\*\*/g, "^");
  // sin^(-1)( / sin^-1( / asin( -> \sin^{-1}( (logic nhập GeoGebra)
  t = t.replace(/\bsin\s*\^?\s*\(?\s*-1\s*\)?\s*\(/gi, "\\sin^{-1}(");
  t = t.replace(/\bcos\s*\^?\s*\(?\s*-1\s*\)?\s*\(/gi, "\\cos^{-1}(");
  t = t.replace(/\btan\s*\^?\s*\(?\s*-1\s*\)?\s*\(/gi, "\\tan^{-1}(");
  t = t.replace(/\basin\s*\(/gi, "\\sin^{-1}(");
  t = t.replace(/\bacos\s*\(/gi, "\\cos^{-1}(");
  t = t.replace(/\batan\s*\(/gi, "\\tan^{-1}(");
  t = t.replace(/\blog10\s*\(/gi, "\\log_{10}(");
  t = t.replace(/\blog\s*_\s*([A-Za-z0-9]+)\s*\(/g, "\\log_{$1}(");
  t = t.replace(/\bnroot\s*\(\s*([^,()]+?)\s*,\s*([^()]+?)\s*\)/g, "\\sqrt[$2]{$1}");
  // hàm có ngoặc: sqrt( cbrt( abs( √( ∛( — bọc balanced, dở dang vẫn hiện
  const wrapFn = (str, opener, openL, closeL, word) => {
    let out = "", i = 0;
    const pat = word ? new RegExp("\\b" + opener.replace(/\(/g, "\\("), "gi") : null;
    while (true) {
      let k;
      if (pat) { pat.lastIndex = i; const m = pat.exec(str); if (!m) { out += str.slice(i); break; } k = m.index; }
      else { k = str.indexOf(opener, i); if (k < 0) { out += str.slice(i); break; } }
      out += str.slice(i, k);
      let depth = 0, j = k + opener.length - 1, closed = false;
      for (; j < str.length; j++) {
        const c = str[j];
        if (c === "(") depth++;
        else if (c === ")") { depth--; if (depth === 0) { closed = true; break; } }
      }
      if (closed) { out += openL + str.slice(k + opener.length, j) + closeL; i = j + 1; }
      else { out += openL; i = k + opener.length; }
    }
    return out;
  };
  t = wrapFn(t, "sqrt(", "\\sqrt{", "}", true);
  t = wrapFn(t, "cbrt(", "\\sqrt[3]{", "}", true);
  t = wrapFn(t, "abs(", "\\left|", "\\right|", true);
  t = wrapFn(t, "√(", "\\sqrt{", "}", false);
  t = wrapFn(t, "∛(", "\\sqrt[3]{", "}", false);
  // tên hàm chuẩn -> lệnh LaTeX (chạy sau asin/log10 để không đè)
  t = t.replace(/\b(sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|ln|log|exp|min|max|det|gcd|deg|lim|sup|inf)\s*\(/gi, "\\$1(");
  // khối 3D / hình: \text để đứng chữ
  t = t.replace(/\b(cube|box|sphere|cyl|cone|pyramid|square|rect|disk|tri|polygon)\s*\(/gi, "\\text{$1}(");
  t = t.replace(/\bpi\b/gi, "\\pi");
  t = t.replace(/\bInfinity\b/g, "\\infty");
  t = t.replace(/<=/g, "\\le ").replace(/>=/g, "\\ge ").replace(/!=/g, "\\ne ");
  t = t.replace(/%/g, "\\%").replace(/°/g, "^{\\circ}");
  // nhân ẩn kiểu GeoGebra: 3*x -> 3x, 2*sin -> 2sin ; còn lại -> \cdot
  t = t.replace(/([0-9A-Za-z)\]\}])\s*\*\s*(?=[A-Za-z\\(])/g, "$1");
  t = t.replace(/\*/g, "\\cdot ");
  // phân số đơn giản a/b -> \frac (lặp cho lồng nhau nông)
  for (let k = 0; k < 4; k++) {
    const nb = t.replace(/(\([^()]*\)|[A-Za-z0-9.\\]+(?:\^\{[^}]*\}|\^[A-Za-z0-9])?)\s*\/\s*(\([^()]*\)|[A-Za-z0-9.\\]+(?:\^\{[^}]*\}|\^[A-Za-z0-9])?)/g, "\\frac{$1}{$2}");
    if (nb === t) break; t = nb;
  }
  t = t.replace(/\^\(/g, "^{(");
  return t;
}
function prettyMathHTML(raw, display) {
  let latex = "";
  try { latex = asciiToLatex(raw); } catch { latex = String(raw ?? ""); }
  let fb = "";
  try { fb = markusPrettyTex(latex, !!display); } catch { try { fb = escapeHtml(String(raw ?? "")); } catch { fb = ""; } }
  return `<span class="mk-math"><span class="mk-tex pexp" data-tex="${markusEscapeAttr(latex)}" data-display="${display ? 1 : 0}">${fb}</span></span>`;
}
/* Bản text-thuần (toast, <option>, canvas): ² × √ π ≤…, giữ nguyên text tính được */
function prettyTextUnicode(raw) {
  let t = String(raw ?? "").replace(/\*\*/g, "^");
  t = t.replace(/\bsin\s*\^?\s*\(?\s*-1\s*\)?\s*\(/gi, "sin⁻¹(");
  t = t.replace(/\bcos\s*\^?\s*\(?\s*-1\s*\)?\s*\(/gi, "cos⁻¹(");
  t = t.replace(/\btan\s*\^?\s*\(?\s*-1\s*\)?\s*\(/gi, "tan⁻¹(");
  t = t.replace(/\basin\s*\(/gi, "sin⁻¹(").replace(/\bacos\s*\(/gi, "cos⁻¹(").replace(/\batan\s*\(/gi, "tan⁻¹(");
  t = t.replace(/\blog10\s*\(/gi, "log₁₀(");
  t = t.replace(/\bsqrt\s*\(/gi, "√(").replace(/\bcbrt\s*\(/gi, "∛(").replace(/\babs\s*\(/gi, "|(");
  t = t.replace(/\bpi\b/gi, "π").replace(/\bInfinity\b/g, "∞");
  t = t.replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/!=/g, "≠");
  const sup = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "n": "ⁿ", "x": "ˣ" };
  t = t.replace(/\^([0-9nx-])/, (m, c) => sup[c] || m);
  t = t.replace(/\^\{([^}]*)\}/g, (m, a) => a.split("").map(c => sup[c] || c).join(""));
  t = t.replace(/([0-9A-Za-z)\]}])\s*\*\s*(?=[A-Za-z(π√(])/g, "$1").replace(/\*/g, "×");
  return t;
}
/* Nhãn + thân dòng kiểu GeoGebra: f: y = x²+3x+2 · A = (2, 3) */
function prettyRowLetter(o) {
  const nm = String(o.name || "");
  const m = /^([A-Za-z][\w]*)/.exec(nm);
  return m ? m[1] : nm;
}
function prettyRowLabel(o) {
  return escapeHtml(prettyRowLetter(o));
}
function prettyRowBody(o) {
  try {
    const ex = String(o.expr ?? "");
    if (o.kind === "fn") return `y\u2009=\u2009${prettyMathHTML(ex)}`;
    if (o.kind === "surface") {
      const m = ex.match(/^\s*z\s*=\s*([\s\S]+)$/i);
      return `z\u2009=\u2009${prettyMathHTML(m ? m[1] : ex)}`;
    }
    if (o.kind === "implicit") {
      const i = ex.indexOf("=");
      if (i > 0) return `${prettyMathHTML(ex.slice(0, i))}\u2009=\u2009${prettyMathHTML(ex.slice(i + 1))}`;
      return prettyMathHTML(ex);
    }
    if (o.kind === "point" || o.kind === "point3d") {
      const m = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(,\s*(-?\d+(?:\.\d+)?))?\s*\)/.exec(ex);
      if (m) return prettyMathHTML(`(${m[1]}, ${m[2]}${m[3] ? `, ${m[4]}` : ""})`);
      return prettyMathHTML(ex);
    }
    return prettyMathHTML(ex);
  } catch { return escapeHtml(String(o.expr ?? "")); }
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
    `cone(1.8,3), pyramid(3,3); hình phẳng square(3), rect(4,2.5), disk(2), tri(3); ` +
    `dựng 3D quan hệ: line3d(x1,y1,z1,x2,y2,z2), seg3d(...), vec3d(...), plane3d(px,py,pz,nx,ny,nz), ` +
    `circle3d(cx,cy,cz,r,nx,ny,nz), sphere3d(cx,cy,cz,r), poly3d((x,y,z),(x,y,z),(x,y,z)), ` +
    `cube3(ax,ay,az,bx,by,bz,h), tetra3(ax,ay,az,bx,by,bz), cyl3/cone3(ax,ay,az,bx,by,bz,r). ` +
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
  // 3D / khối — Markus offline HIỂU object quan hệ, không vẽ pixel giả
  if (/3d|khối|khoi|cầu|cau|trụ|tru|nón|non|chóp|chop|hộp|hop|lập phương|paraboloid|mặt|giao tuyến|khai triển|xoay|chính diện|đo|thể tích|diện tích/.test(s)) {
    try {
      if (state.mode !== "3d") setMode("3d");
      // lệnh dựng cụ thể tiếng Việt -> engine thật
      if (/hình chóp|chop tam giác|pyramid/.test(s)) {
        mmDemoWOW();
        return `Tôi đã dựng **hình chóp tam giác ABCD** (A, B, C đáy + D đỉnh), kèm **mặt phẳng ABC**, **mặt cầu tâm D** và **đường giao**. Kéo D để thấy giao tuyến tự cập nhật — đó là dependency thật. Mở tool **Khai triển** để xem Net, **Quay trục** để xoay chóp.`;
      }
      if (/lập phương|cube/.test(s)) {
        try { addObject("cube(3)"); } catch {}
        return `Tôi đã vẽ **lập phương** \`cube(3)\`. Muốn khối quan hệ (kéo điểm cập nhật), dùng tool **Lập phương** trong Công cụ → Dựng hình → 3D: nhấp 2 điểm + nhập cao. Rồi bấm **Khai triển** để xem Net animation.`;
      }
      if (/mặt phẳng|mat phang|plane/.test(s)) {
        try {
          mmAddDirect3D("point3d", { x: 0, y: 0, z: 0 }, { name: "A" });
          mmAddDirect3D("point3d", { x: 3, y: 0, z: 0 }, { name: "B" });
          mmAddDirect3D("point3d", { x: 0, y: 3, z: 1 }, { name: "C" });
          const objs = state.objects.filter(o => o.kind === "point3d").slice(-3);
          const pl = mmPlaneFrom3([objs[0].x, objs[0].y, objs[0].z], [objs[1].x, objs[1].y, objs[1].z], [objs[2].x, objs[2].y, objs[2].z]);
          mmAddDirect3D("plane3d", { origin: pl.origin, normal: pl.normal, extent: 3.2 }, { parents: objs.map(o => o.id), def: { type: "plane3", p1: objs[0].id, p2: objs[1].id, p3: objs[2].id } });
        } catch (e) { return `Mặt phẳng cần 3 điểm không thẳng hàng (${e.message}). Dùng tool **MP 3 điểm** trong 3D nhé!`; }
        return `Tôi đã tạo **mặt phẳng qua 3 điểm A, B, C** (có phương trình hiển thị cạnh tên). Kéo bất kỳ điểm nào — mặt tự cập nhật theo.`;
      }
      if (/mặt cầu|mat cau|sphere/.test(s)) {
        try { addObject("sphere3d(0,0,0,2)"); } catch {}
        return `Tôi đã vẽ **mặt cầu** \`sphere3d(0,0,0,2)\` (tâm O, R=2). Muốn cầu quan hệ, dùng tool **Cầu T+Đ**: nhấp tâm rồi điểm trên cầu. Kết hợp **Giao 2 mặt** để xem đường tròn giao với mặt phẳng.`;
      }
      if (/đường tròn|duong tron|circle/.test(s)) {
        try { addObject("circle3d(0,0,0,2,0,0,1)"); } catch {}
        return `Tôi đã vẽ **đường tròn 3D** tâm O, R=2 trong mặt Oxy. Tool **Tròn 3đ** dựng tròn qua 3 điểm bất kỳ trong không gian.`;
      }
      if (/giao|intersect/.test(s)) {
        return `Để xem **giao**: tạo 2 mặt (vd mặt phẳng + mặt cầu), rồi dùng tool **Giao 2 mặt** — nhấp 2 đối tượng. Kết quả là object thật (đường/cung/đa giác), kéo gốc là giao tự cập nhật. Hỗ trợ: MP∩MP, MP∩Cầu, Cầu∩Cầu, MP∩Khối.`;
      }
      if (/khai triển|net|mở khối/.test(s)) {
        return `**Khai triển (Net)**: chọn một khối (lập phương/chóp/lăng trụ) trong Đại số, rồi bấm tool **Khai triển** — khối mở dần 0→100% (có nút ▶/⟲ + slider). Thử scene demo: bấm **Demo WOW** trong nhóm 3D.`;
      }
      if (/xoay|rotate/.test(s)) {
        return `**Quay quanh đường**: chọn 1 điểm, dùng tool **Quay trục**, nhấp 2 điểm trục, nhập góc — điểm ảnh chạy animation 0→θ quanh trục. Camera cũng có **Chính diện** (bay cinematic tới vật).`;
      }
      if (/đo|khoảng cách|góc|diện tích|thể tích/.test(s)) {
        return `**Đo 3D**: Khoảng cách (2 điểm), Góc (3 điểm), Diện tích (đa giác/tròn), Thể tích (khối/cầu) — nhãn đo hiện trên sân khấu và **tự cập nhật realtime** khi kéo hình.`;
      }
      addObject("z = x^2 + y^2", { color: "#8b5cf6" });
      addObject("sphere(2)", { color: "#38bdf8" });
      return `Tôi đã chuyển sang **3D** và vẽ **paraboloid** \`z=x²+y²\` cùng **hình cầu** \`sphere(2)\`. ` +
        `Muốn dựng quan hệ, thử: "tạo hình chóp", "tạo mặt phẳng", "tạo mặt cầu". ` +
        `Hoặc mở Công cụ → Dựng hình → 3D (điểm/đường/mặt/tròn/khối/giao/đo/biến hình).`;
    } catch (e) { return `Lệnh 3D mẫu: \`z=x^2+y^2\`, \`sphere3d(0,0,0,2)\`, \`plane3d(0,0,0,0,0,1)\`, \`cube(3)\`, \`cyl(1.5,3)\`, \`cone(1.8,3)\`.`; }
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

/* ============================================================================
   MIND MATH 3D CONSTRUCTION ENGINE (độc lập, thuần JS — không copy ai)
   WHAT: toán vector + object quan hệ + render + tool + preview + net + giao + đo.
   WHY: biến cụm 3D tĩnh (mặt/khối đặt sẵn) thành workspace dựng hình thật.
   INPUT: point3d cha (A,B,C...) · OUTPUT: object con có parents/def, tự update.
   ============================================================================ */
/* ---- vector 3D ---- */
function mmAdd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function mmSub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function mmScale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
function mmDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function mmCross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function mmLen(a) { return Math.hypot(a[0], a[1], a[2]); }
function mmNorm(a) { const l = mmLen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function mmDist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function mmMid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; }
/* Mặt phẳng qua 3 điểm: ném lỗi khi thẳng hàng/trùng (tool báo nhẹ, không commit rác). */
function mmPlaneFrom3(A, B, C) {
  const u = mmSub(B, A), v = mmSub(C, A);
  const n = mmCross(u, v);
  if (mmLen(n) < 1e-9) throw new Error("Không thể tạo mặt phẳng: ba điểm đang thẳng hàng.");
  const normal = mmNorm(n);
  const uu = mmNorm(u);
  const vv = mmNorm(mmCross(normal, uu));
  const d = -(normal[0] * A[0] + normal[1] * A[1] + normal[2] * A[2]);
  return { origin: A.slice(), normal, u: uu, v: vv, eq: { a: normal[0], b: normal[1], c: normal[2], d } };
}
function mmPlaneBasis(normal) {
  const n = mmNorm(normal);
  const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u = mmNorm(mmCross(ref, n));
  const v = mmNorm(mmCross(n, u));
  return { u, v };
}
/* Đường tròn qua 3 điểm không gian: tâm = giao 2 trung trực trong mặt phẳng ABC. */
function mmCircle3From3(A, B, C) {
  const pl = mmPlaneFrom3(A, B, C);
  const u = mmSub(B, A), v = mmSub(C, A);
  // giải trong cơ sở 2D (u,v): chuẩn Gram-Schmidt
  const e1 = mmNorm(u);
  const vOrth = mmSub(v, mmScale(e1, mmDot(v, e1)));
  if (mmLen(vOrth) < 1e-9) throw new Error("Ba điểm đang thẳng hàng.");
  const e2 = mmNorm(vOrth);
  const to2 = (P) => { const d = mmSub(P, A); return [mmDot(d, e1), mmDot(d, e2)]; };
  const [bx, by] = to2(B), [cx, cy] = to2(C);
  const d = 2 * (bx * cy - by * cx);
  if (Math.abs(d) < 1e-9) throw new Error("Ba điểm đang thẳng hàng.");
  const b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (b2 * cy - c2 * by) / d, uy = (bx * c2 - cx * b2) / d;
  const center = mmAdd(A, mmAdd(mmScale(e1, ux), mmScale(e2, uy)));
  return { center, radius: mmDist(center, A), normal: pl.normal };
}
/* Chiếu điểm p lên đối tượng 3D (cho Điểm thuộc/Dính 3D). */
function mmProjectToObj3D(p, ref) {
  if (!ref || ref.error) return null;
  if (ref.kind === "point3d" || ref.kind === "point") return [ref.x, ref.y, ref.kind === "point3d" ? ref.z : 0];
  if (ref.kind === "segment3d" || ref.kind === "vector3d") {
    const A = ref.a, B = ref.b, ab = mmSub(B, A), l2 = mmDot(ab, ab) || 1;
    const t = clamp(mmDot(mmSub(p, A), ab) / l2, 0, 1);
    return mmAdd(A, mmScale(ab, t));
  }
  if (ref.kind === "line3d") {
    const A = ref.a, B = ref.b, ab = mmSub(B, A), l2 = mmDot(ab, ab) || 1;
    const t = mmDot(mmSub(p, A), ab) / l2;
    return mmAdd(A, mmScale(ab, t));
  }
  if (ref.kind === "ray3d") {
    const A = ref.a, B = ref.b, ab = mmSub(B, A), l2 = mmDot(ab, ab) || 1;
    const t = Math.max(0, mmDot(mmSub(p, A), ab) / l2);
    return mmAdd(A, mmScale(ab, t));
  }
  if (ref.kind === "plane3d") {
    const n = ref.normal, d = mmDot(mmSub(p, ref.origin), n);
    return mmSub(p, mmScale(n, d));
  }
  if (ref.kind === "circle3d") {
    const d = mmSub(p, ref.center), n = ref.normal;
    const dn = mmDot(d, n);
    const q = mmSub(p, mmScale(n, dn));
    const r = mmSub(q, ref.center), l = mmLen(r) || 1;
    return mmAdd(ref.center, mmScale(r, ref.radius / l));
  }
  if (ref.kind === "sphere3d") {
    const d = mmSub(p, ref.center), l = mmLen(d) || 1;
    return mmAdd(ref.center, mmScale(d, ref.radius / l));
  }
  if (ref.kind === "polygon3d" && ref.vertices && ref.vertices.length >= 3) {
    // chiếu lên mặt rồi kẹp vào đa giác (nếu ngoài thì lấy biên gần nhất)
    let pl = null;
    try { pl = mmPlaneFrom3(ref.vertices[0], ref.vertices[1], ref.vertices[2]); } catch { return ref.vertices[0].slice(); }
    const n = pl.normal;
    const q = mmSub(p, mmScale(n, mmDot(mmSub(p, ref.origin || ref.vertices[0]), n)));
    // kiểm tra trong đa giác (quạt tam giác); ngoài -> chiếu lên cạnh gần nhất
    const vs = ref.vertices;
    let best = null, bd = 1e18;
    for (let i = 0; i < vs.length; i++) {
      const A = vs[i], B = vs[(i + 1) % vs.length], ab = mmSub(B, A), l2 = mmDot(ab, ab) || 1;
      const t = clamp(mmDot(mmSub(q, A), ab) / l2, 0, 1);
      const c = mmAdd(A, mmScale(ab, t)), dd = mmDist(q, c);
      if (dd < bd) { bd = dd; best = c; }
    }
    // nếu q nằm trong (khoảng cách tới biên > 1e-9 và cùng phía) thì giữ q
    return bd < 1e-9 ? q : best;
  }
  if (ref.kind === "solid3" && ref.V && ref.V.length) {
    let best = ref.V[0], bd = 1e18;
    for (const v of ref.V) { const d = mmDist(p, v); if (d < bd) { bd = d; best = v; } }
    return best.slice();
  }
  return null;
}
/* Tên điểm 3D thông minh: A, B, C... (không object123). */
function mmNextPointName3D() {
  const used = new Set(state.objects.filter(o => o.kind === "point3d").map(o => (o.name || "").charAt(0)));
  for (let c = 65; c <= 90; c++) { const L = String.fromCharCode(c); if (!used.has(L)) return L; }
  return "P" + (state.seq + 1);
}
function mmNextPlaneName() {
  const greek = ["α", "β", "γ", "δ", "ε"];
  const used = new Set(state.objects.filter(o => o.kind === "plane3d").map(o => (o.name || "").charAt(0)));
  for (const g of greek) if (!used.has(g)) return g;
  return "α" + (state.seq + 1);
}
/* Tạo object 3D quan hệ trực tiếp (bypass parse số, vẫn undo/persist/share/list). */
function mmAddDirect3D(kind, fields, opts) {
  opts = opts || {};
  pushHistory();
  state.seq += 1;
  const o = {
    id: "o" + Date.now().toString(36) + state.seq + Math.floor(Math.random() * 97),
    kind, color: opts.color || nextColor(), visible: true,
    born: state.opts.animate ? performance.now() : 0,
    ...fields,
  };
  if (kind === "point3d") {
    const L = opts.name || mmNextPointName3D();
    o.name = `${L}(${mmFmtNum(o.x)},${mmFmtNum(o.y)},${mmFmtNum(o.z)})`;
    o.expr = `(${mmFmtNum(o.x)}, ${mmFmtNum(o.y)}, ${mmFmtNum(o.z)})`;
  } else if (kind === "plane3d") {
    o.name = opts.name || `${mmNextPlaneName()}${state.seq}`;
    try { mmSyncGeomExpr(o); } catch { o.expr = `Mặt phẳng ${o.name}`; }
  } else {
    const VN3 = { line3d: "Đường", segment3d: "Đoạn", ray3d: "Tia", vector3d: "Véc-tơ", circle3d: "Đường tròn", sphere3d: "Mặt cầu", polygon3d: "Đa giác", solid3: "Khối", measure3d: "Đo" };
    o.name = opts.name || `${VN3[kind] || kind} ${state.seq}`;
    try { mmSyncGeomExpr(o); } catch { if (!o.expr) o.expr = o.name; }
    if (kind === "solid3") {
      const SN = { cube: "Lập phương", tetra: "Tứ diện", prism: "Lăng trụ", pyramid: "Chóp", cyl: "Trụ", cone: "Nón" }[o.solid3] || o.solid3;
      o.name = `${SN} ${state.seq}`;
    }
  }
  if (opts.parents || opts.def) mmAttachParents(o, opts.parents || [], opts.def);
  state.objects.push(o);
  state.selectedId = o.id;
  renderList($("#algebraSearch") ? $("#algebraSearch").value : "");
  refreshTableSelect(); draw(); kickAnim(); persist();
  return o;
}
/* Dựng V/F khối từ def quan hệ (dùng cho tạo mới + recompute). Pget(id)->obj. */
function mmBuildSolid3(type, D, Pget) {
  const GP = (id) => {
    const q = Pget(id);
    if (!q || !isFinite(q.x)) return null;
    return [q.x, q.y, q.kind === "point3d" ? q.z : 0];
  };
  const quad = (F, a, b, c, d) => F.push([a, b, c, d]);
  const tri = (F, a, b, c) => F.push([a, b, c]);
  if (type === "cube" && D.aId && D.bId && isFinite(D.h)) {
    const A = GP(D.aId), B = GP(D.bId);
    if (!A || !B) return null;
    const ab = mmSub(B, A);
    if (mmLen(ab) < 1e-9) return null;
    let up = [0, 0, 1];
    if (Math.abs(mmNorm(ab)[2]) > 0.94) up = [0, 1, 0];
    const n0 = mmNorm(mmCross(ab, up));
    if (mmLen(n0) < 1e-9) return null;
    const side = mmScale(n0, mmLen(ab));
    const C = mmAdd(B, side), Dc = mmAdd(A, side);
    const n = mmNorm(mmCross(mmSub(B, A), mmSub(Dc, A)));
    const t = mmScale(n, +D.h);
    const V = [A, B, C, Dc, mmAdd(A, t), mmAdd(B, t), mmAdd(C, t), mmAdd(Dc, t)];
    const F = [];
    quad(F, 0, 1, 2, 3); quad(F, 4, 5, 6, 7);
    quad(F, 0, 1, 5, 4); quad(F, 1, 2, 6, 5); quad(F, 2, 3, 7, 6); quad(F, 3, 0, 4, 7);
    return { V, F };
  }
  if (type === "tetra" && D.aId && D.bId) {
    const A = GP(D.aId), B = GP(D.bId);
    if (!A || !B) return null;
    const s = mmDist(A, B);
    if (s < 1e-9) return null;
    let up = [0, 0, 1];
    if (Math.abs(mmNorm(mmSub(B, A))[2]) > 0.94) up = [0, 1, 0];
    const n = mmNorm(mmCross(mmSub(B, A), up));
    const mid = mmMid(A, B);
    const perp = mmNorm(mmCross(n, mmSub(B, A)));
    const C = mmAdd(mid, mmScale(perp, s * Math.sqrt(3) / 2));
    const G = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
    const S = mmAdd(G, mmScale(n, s * Math.sqrt(2 / 3)));
    const F = [];
    tri(F, 0, 1, 2); tri(F, 0, 1, 3); tri(F, 1, 2, 3); tri(F, 2, 0, 3);
    return { V: [A, B, C, S], F };
  }
  if ((type === "prism" || type === "extrude") && D.polyId && isFinite(D.h)) {
    const base = Pget(D.polyId);
    if (!base || base.kind !== "polygon3d" || !base.vertices || base.vertices.length < 3) return null;
    const vs = base.vertices.map(v => v.slice());
    let n;
    try { n = mmPlaneFrom3(vs[0], vs[1], vs[2]).normal; } catch { return null; }
    const t = mmScale(n, +D.h);
    const m = vs.length;
    const V = vs.concat(vs.map(v => mmAdd(v, t)));
    const F = [];
    F.push(vs.map((_, i) => i));
    F.push(vs.map((_, i) => 2 * m - 1 - i));
    for (let i = 0; i < m; i++) quad(F, i, (i + 1) % m, m + ((i + 1) % m), m + i);
    return { V, F };
  }
  if (type === "pyramid" && D.polyId && D.apexId) {
    const base = Pget(D.polyId), S = GP(D.apexId);
    if (!base || base.kind !== "polygon3d" || !base.vertices || base.vertices.length < 3 || !S) return null;
    const vs = base.vertices.map(v => v.slice());
    const m = vs.length;
    const V = vs.concat([S]);
    const F = [];
    F.push(vs.map((_, i) => i));
    for (let i = 0; i < m; i++) tri(F, i, (i + 1) % m, m);
    return { V, F };
  }
  if ((type === "cyl" || type === "cone") && D.aId && D.bId && isFinite(D.r)) {
    const A = GP(D.aId), B = GP(D.bId);
    const r = +D.r;
    if (!A || !B || !(r > 1e-9) || mmDist(A, B) < 1e-9) return null;
    const nSeg = 24;
    const axis = mmNorm(mmSub(B, A));
    const ref = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
    const u = mmNorm(mmCross(ref, axis)), v = mmNorm(mmCross(axis, u));
    const ring = (C) => {
      const pts = [];
      for (let i = 0; i < nSeg; i++) {
        const a = (2 * Math.PI * i) / nSeg;
        pts.push(mmAdd(C, mmAdd(mmScale(u, r * Math.cos(a)), mmScale(v, r * Math.sin(a)))));
      }
      return pts;
    };
    if (type === "cyl") {
      const r0 = ring(A), r1 = ring(B);
      const V = r0.concat(r1);
      const F = [];
      for (let i = 0; i < nSeg; i++) quad(F, i, (i + 1) % nSeg, nSeg + ((i + 1) % nSeg), nSeg + i);
      F.push(r0.map((_, i) => nSeg - 1 - i));
      F.push(r1.map((_, i) => nSeg + i));
      return { V, F };
    }
    const r0 = ring(A);
    const V = r0.concat([B]);
    const F = [];
    for (let i = 0; i < nSeg; i++) tri(F, i, (i + 1) % nSeg, nSeg);
    F.push(r0.map((_, i) => nSeg - 1 - i));
    return { V, F };
  }
  return null;
}
/* Diện tích / thể tích / độ đo (recompute + hiển thị). */
function mmPolygonArea3D(vs) {
  if (!vs || vs.length < 3) return 0;
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < vs.length; i++) {
    const A = vs[i], B = vs[(i + 1) % vs.length];
    sx += A[1] * B[2] - A[2] * B[1];
    sy += A[2] * B[0] - A[0] * B[2];
    sz += A[0] * B[1] - A[1] * B[0];
  }
  return mmLen([sx, sy, sz]) / 2;
}
function mmSolidVolume3D(o) {
  try {
    if (!o) return NaN;
    if (o.kind === "sphere3d") return (4 / 3) * Math.PI * Math.pow(o.radius, 3);
    if (o.kind === "solid3" && o.V && o.F) {
      // thể tích qua tổng tứ diện (gốc O): V = |Σ (a·(b×c))| / 6
      let s = 0;
      for (const f of o.F) {
        for (let i = 1; i < f.length - 1; i++) {
          const a = o.V[f[0]], b = o.V[f[i]], c = o.V[f[i + 1]];
          s += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
        }
      }
      return Math.abs(s) / 6;
    }
  } catch { return NaN; }
  return NaN;
}
function mmMeasureValue(o, Pget) {
  const G = (id) => {
    const q = Pget(id);
    if (!q || !isFinite(q.x)) return null;
    return [q.x, q.y, q.kind === "point3d" ? q.z : 0];
  };
  const D = o.def || {};
  if (o.mtype === "dist" && D.p1 && D.p2) {
    const a = G(D.p1), b = G(D.p2);
    if (!a || !b) return null;
    return mmDist(a, b);
  }
  if (o.mtype === "angle" && D.p1 && D.p2 && D.p3) {
    const a = G(D.p1), b = G(D.p2), c = G(D.p3);
    if (!a || !b || !c) return null;
    const u = mmNorm(mmSub(a, b)), v = mmNorm(mmSub(c, b));
    const cs = clamp(mmDot(u, v), -1, 1);
    return Math.acos(cs) * 180 / Math.PI;
  }
  if (o.mtype === "area" && D.refId) {
    const ref = Pget(D.refId);
    if (!ref) return null;
    if (ref.kind === "polygon3d") return mmPolygonArea3D(ref.vertices);
    if (ref.kind === "circle3d") return Math.PI * ref.radius * ref.radius;
    if (ref.kind === "plane3d" && ref.extent) return (2 * ref.extent) * (2 * ref.extent);
    return null;
  }
  if (o.mtype === "volume" && D.refId) {
    const ref = Pget(D.refId);
    if (!ref) return null;
    return mmSolidVolume3D(ref);
  }
  return null;
}
/* ---- Giao 2 mặt (analytic + numeric, KHÔNG kết quả giả) ---- */
function mmIntersectPlanePlane(p1, p2) {
  const n1 = p1.normal, n2 = p2.normal;
  const dir = mmCross(n1, n2);
  if (mmLen(dir) < 1e-9) throw new Error("Hai mặt phẳng không có giao tuyến hữu hạn (song song/trùng).");
  // điểm trên giao: giải hệ 2 phương trình, cố định biến có |dir| lớn nhất
  const d1 = -(n1[0] * p1.origin[0] + n1[1] * p1.origin[1] + n1[2] * p1.origin[2]);
  const d2 = -(n2[0] * p2.origin[0] + n2[1] * p2.origin[1] + n2[2] * p2.origin[2]);
  const ad = [Math.abs(dir[0]), Math.abs(dir[1]), Math.abs(dir[2])];
  let pt = null;
  const solve2 = (i, j, k) => {
    // n1i*xi + n1j*xj = -(d1) (xk=0); tương tự p2
    const a11 = n1[i], a12 = n1[j], b1 = -(d1);
    const a21 = n2[i], a22 = n2[j], b2 = -(d2);
    const det = a11 * a22 - a12 * a21;
    if (Math.abs(det) < 1e-12) return null;
    const xi = (b1 * a22 - a12 * b2) / det, xj = (a11 * b2 - b1 * a21) / det;
    const p = [0, 0, 0]; p[i] = xi; p[j] = xj; p[k] = 0;
    return p;
  };
  if (ad[0] >= ad[1] && ad[0] >= ad[2]) pt = solve2(1, 2, 0);
  else if (ad[1] >= ad[0] && ad[1] >= ad[2]) pt = solve2(0, 2, 1);
  else pt = solve2(0, 1, 2);
  if (!pt) throw new Error("Hai mặt phẳng không có giao tuyến hữu hạn.");
  return { a: pt, b: mmAdd(pt, mmNorm(dir)) };
}
function mmIntersectPlaneSphere(pl, sp) {
  const n = pl.normal;
  const dist = mmDot(mmSub(sp.center, pl.origin), n);
  const r = sp.radius, ad = Math.abs(dist);
  if (ad > r + 1e-9) throw new Error("Mặt phẳng không cắt mặt cầu.");
  if (Math.abs(ad - r) <= 1e-9) return { type: "point", point: mmSub(sp.center, mmScale(n, dist)) };
  const cc = mmSub(sp.center, mmScale(n, dist));
  return { type: "circle", center: cc, radius: Math.sqrt(Math.max(0, r * r - dist * dist)), normal: n.slice() };
}
function mmIntersectSphereSphere(s1, s2) {
  const c1 = s1.center, c2 = s2.center, r1 = s1.radius, r2 = s2.radius;
  const d = mmDist(c1, c2);
  if (d < 1e-9) throw new Error("Hai mặt cầu đồng tâm — giao không xác định duy nhất.");
  if (d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) throw new Error("Hai mặt cầu không giao nhau.");
  if (Math.abs(d - (r1 + r2)) <= 1e-9 || Math.abs(d - Math.abs(r1 - r2)) <= 1e-9) {
    const t = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const pt = mmAdd(c1, mmScale(mmNorm(mmSub(c2, c1)), t));
    return { type: "point", point: pt };
  }
  const t = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const cc = mmAdd(c1, mmScale(mmNorm(mmSub(c2, c1)), t));
  return { type: "circle", center: cc, radius: Math.sqrt(Math.max(0, r1 * r1 - t * t)), normal: mmNorm(mmSub(c2, c1)) };
}
/* Giao mặt phẳng – khối/vòng: cắt mọi cạnh, gom điểm, sắp theo góc quanh tâm. */
function mmIntersectPlaneSolid(pl, solid) {
  const n = pl.normal, O = pl.origin;
  const sd = (p) => mmDot(mmSub(p, O), n);
  const pts = [];
  const edges = new Set();
  const V = solid.V || [];
  for (const f of solid.F || []) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const k = a < b ? a + "_" + b : b + "_" + a;
      if (edges.has(k)) continue;
      edges.add(k);
      const A = V[a], B = V[b];
      if (!A || !B) continue;
      const da = sd(A), db = sd(B);
      if (Math.abs(da) < 1e-9 && Math.abs(db) < 1e-9) { pts.push(A.slice(), B.slice()); }
      else if (Math.abs(da) < 1e-9) pts.push(A.slice());
      else if (Math.abs(db) < 1e-9) pts.push(B.slice());
      else if (da * db < 0) {
        const t = da / (da - db);
        pts.push(mmAdd(A, mmScale(mmSub(B, A), t)));
      }
    }
  }
  // khử trùng
  const uniq = [];
  for (const p of pts) {
    if (!uniq.some(q => mmDist(p, q) < 1e-7)) uniq.push(p);
  }
  if (uniq.length < 3) throw new Error("Mặt phẳng không cắt khối thành đa giác (chạm biên hoặc ngoài).");
  // sắp quanh tâm theo cơ sở mặt
  const C = [0, 0, 0];
  uniq.forEach(p => { C[0] += p[0]; C[1] += p[1]; C[2] += p[2]; });
  C[0] /= uniq.length; C[1] /= uniq.length; C[2] /= uniq.length;
  const bs = mmPlaneBasis(n);
  uniq.sort((p, q) => {
    const ap = Math.atan2(mmDot(mmSub(p, C), bs.v), mmDot(mmSub(p, C), bs.u));
    const aq = Math.atan2(mmDot(mmSub(q, C), bs.v), mmDot(mmSub(q, C), bs.u));
    return ap - aq;
  });
  return uniq;
}
function mmDoIntersect(a, b) {
  if (!a || !b) throw new Error("Hãy chọn 2 đối tượng mặt.");
  if (a.id === b.id) throw new Error("Hãy chọn 2 đối tượng khác nhau.");
  const PA = a.kind === "plane3d", PB = b.kind === "plane3d";
  const SA = a.kind === "sphere3d", SB = b.kind === "sphere3d";
  if (PA && PB) {
    const ln = mmIntersectPlanePlane(a, b);
    return mmAddDirect3D("line3d", { a: ln.a, b: ln.b }, { parents: [a.id, b.id], def: { type: "intersect3d", aId: a.id, bId: b.id, algo: "plane-plane" } });
  }
  if ((PA && SB) || (PB && SA)) {
    const pl = PA ? a : b, sp = PA ? b : a;
    const r = mmIntersectPlaneSphere(pl, sp);
    if (r.type === "point") {
      return mmAddDirect3D("point3d", { x: r.point[0], y: r.point[1], z: r.point[2] }, { parents: [a.id, b.id], def: { type: "intersect3d", aId: a.id, bId: b.id, algo: "plane-sphere-point" } });
    }
    return mmAddDirect3D("circle3d", { center: r.center, radius: r.radius, normal: r.normal }, { parents: [a.id, b.id], def: { type: "intersect3d", aId: a.id, bId: b.id, algo: "plane-sphere" } });
  }
  if (SA && SB) {
    const r = mmIntersectSphereSphere(a, b);
    if (r.type === "point") {
      return mmAddDirect3D("point3d", { x: r.point[0], y: r.point[1], z: r.point[2] }, { parents: [a.id, b.id], def: { type: "intersect3d", aId: a.id, bId: b.id, algo: "sphere-sphere-point" } });
    }
    return mmAddDirect3D("circle3d", { center: r.center, radius: r.radius, normal: r.normal }, { parents: [a.id, b.id], def: { type: "intersect3d", aId: a.id, bId: b.id, algo: "sphere-sphere" } });
  }
  const pl = PA ? a : (PB ? b : null);
  const solid = (a.kind === "solid3" || a.kind === "polygon3d" || a.kind === "circle3d") ? a : ((b.kind === "solid3" || b.kind === "polygon3d" || b.kind === "circle3d") ? b : null);
  if (pl && solid) {
    let V = null, F = null;
    if (solid.kind === "solid3") { V = solid.V; F = solid.F; }
    else if (solid.kind === "polygon3d") {
      V = solid.vertices;
      F = [solid.vertices.map((_, i) => i)];
    } else if (solid.kind === "circle3d") {
      const bs = mmPlaneBasis(solid.normal);
      V = [];
      for (let i = 0; i <= 48; i++) {
        const t = (2 * Math.PI * i) / 48;
        V.push(mmAdd(solid.center, mmAdd(mmScale(bs.u, solid.radius * Math.cos(t)), mmScale(bs.v, solid.radius * Math.sin(t)))));
      }
      F = [V.map((_, i) => i)];
    }
    if (!V) throw new Error("Đối tượng này chưa hỗ trợ giao.");
    const poly = mmIntersectPlaneSolid(pl, { V, F });
    return mmAddDirect3D("polygon3d", { vertices: poly }, { parents: [a.id, b.id], def: { type: "intersect3d", aId: a.id, bId: b.id, algo: "plane-solid" } });
  }
  throw new Error("Cặp này chưa hỗ trợ giao (hỗ trợ: MP∩MP, MP∩Cầu, Cầu∩Cầu, MP∩Khối).");
}
function mmRecomputeIntersect(o, D, Pget) {
  const a = Pget(D.aId), b = Pget(D.bId);
  if (!a || !b || a.error || b.error) return false;
  const algo = D.algo || "";
  try {
    if (algo === "plane-plane" && a.kind === "plane3d" && b.kind === "plane3d" && o.kind === "line3d") {
      const ln = mmIntersectPlanePlane(a, b);
      o.a = ln.a; o.b = ln.b;
      try { mmSyncGeomExpr(o); } catch {}
      return true;
    }
    if ((algo === "plane-sphere") && o.kind === "circle3d") {
      const pl = a.kind === "plane3d" ? a : b, sp = a.kind === "sphere3d" ? a : b;
      const r = mmIntersectPlaneSphere(pl, sp);
      if (r.type !== "circle") return false;
      o.center = r.center; o.radius = r.radius; o.normal = r.normal;
      try { mmSyncGeomExpr(o); } catch {}
      return true;
    }
    if ((algo === "sphere-sphere") && o.kind === "circle3d") {
      const r = mmIntersectSphereSphere(a, b);
      if (r.type !== "circle") return false;
      o.center = r.center; o.radius = r.radius; o.normal = r.normal;
      try { mmSyncGeomExpr(o); } catch {}
      return true;
    }
    if (algo.indexOf("point") >= 0 && o.kind === "point3d") {
      let pt = null;
      if ((a.kind === "plane3d" && b.kind === "sphere3d") || (b.kind === "plane3d" && a.kind === "sphere3d")) {
        const pl = a.kind === "plane3d" ? a : b, sp = a.kind === "sphere3d" ? a : b;
        const r = mmIntersectPlaneSphere(pl, sp);
        if (r.type !== "point") return false;
        pt = r.point;
      } else if (a.kind === "sphere3d" && b.kind === "sphere3d") {
        const r = mmIntersectSphereSphere(a, b);
        if (r.type !== "point") return false;
        pt = r.point;
      } else return false;
      o.x = pt[0]; o.y = pt[1]; o.z = pt[2];
      mmSyncPointNameExpr(o);
      return true;
    }
    if (algo === "plane-solid" && o.kind === "polygon3d") {
      const pl = a.kind === "plane3d" ? a : b;
      const solid = a.kind === "plane3d" ? b : a;
      let V = null, F = null;
      if (solid.kind === "solid3") { V = solid.V; F = solid.F; }
      else if (solid.kind === "polygon3d") { V = solid.vertices; F = [solid.vertices.map((_, i) => i)]; }
      else return false;
      o.vertices = mmIntersectPlaneSolid(pl, { V, F });
      try { mmSyncGeomExpr(o); } catch {}
      return true;
    }
  } catch { return false; }
  return false;
}
/* ---------------- RENDER 3D quan hệ ---------------- */
function mmIsOrbiting() { return !!(interact.orbit || (interact.drag && interact.drag.active)); }
function mmStrokeSeg3D(A, B) {
  const a = proj3(A[0], A[1], A[2]), b = proj3(B[0], B[1], B[2]);
  ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
}
function mmHalo3D(o, isSel) {
  ctx.save();
  ctx.strokeStyle = isSel ? "#c4b5fd" : o.color;
  ctx.globalAlpha = isSel ? 0.95 : 0.5;
  ctx.lineWidth = isSel ? 2.2 : 1.4;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = isSel ? 12 : 6; }
}
function mmLabel3D(p, text, color) {
  const isDark = state.opts.theme === "dark";
  ctx.save();
  ctx.font = "700 11px 'Be Vietnam Pro',sans-serif";
  const tw = ctx.measureText(text).width + 16;
  const bx = Math.min(Math.max(p.sx + 12, 6), W - tw - 6), by = Math.max(p.sy - 32, 6);
  ctx.fillStyle = isDark ? "rgba(10,8,30,.92)" : "rgba(255,255,255,.95)";
  ctx.strokeStyle = "rgba(139,92,246,.55)"; ctx.lineWidth = 1.1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, tw, 22, 7); else ctx.rect(bx, by, tw, 22);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = color || (isDark ? "#e8e4ff" : "#1e1b4b");
  ctx.fillText(text, bx + 8, by + 15);
  ctx.restore();
}
function mmDrawLine3D(o) {
  const p = (o.born && typeof animP === "function") ? animP(o) : 1;
  if (p <= 0) return;
  const dir = mmNorm(mmSub(o.b, o.a));
  const L = 30;
  const A = mmAdd(o.a, mmScale(dir, -L)), B = mmAdd(o.a, mmScale(dir, L));
  const isSel = state.selectedId === o.id;
  mmHalo3D(o, isSel);
  if (p < 1) ctx.globalAlpha *= p;
  ctx.setLineDash(isSel ? [] : [2, 0]);
  mmStrokeSeg3D(A, B);
  ctx.restore();
  if (!o.hideName) { const m = proj3(o.a[0], o.a[1], o.a[2]); mmLabel3D(m, o.name, o.color); }
  if (p < 1 && typeof kickAnim === "function") kickAnim();
}
function mmDrawSeg3D(o) {
  const p = (o.born && typeof animP === "function") ? animP(o) : 1;
  if (p <= 0) return;
  const isSel = state.selectedId === o.id;
  mmHalo3D(o, isSel);
  if (p < 1) ctx.globalAlpha *= p;
  const B = [o.a[0] + (o.b[0] - o.a[0]) * p, o.a[1] + (o.b[1] - o.a[1]) * p, o.a[2] + (o.b[2] - o.a[2]) * p];
  mmStrokeSeg3D(o.a, B);
  ctx.restore();
  // đầu mút
  const pa = proj3(o.a[0], o.a[1], o.a[2]), pb = proj3(B[0], B[1], B[2]);
  ctx.save(); ctx.fillStyle = o.color;
  ctx.beginPath(); ctx.arc(pa.sx, pa.sy, 3, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(pb.sx, pb.sy, 3, 0, 7); ctx.fill(); ctx.restore();
  if (!o.hideName) { const m = proj3((o.a[0] + B[0]) / 2, (o.a[1] + B[1]) / 2, (o.a[2] + B[2]) / 2); mmLabel3D(m, o.name, o.color); }
  if (p < 1 && typeof kickAnim === "function") kickAnim();
}
function mmDrawRay3D(o) {
  const p = (o.born && typeof animP === "function") ? animP(o) : 1;
  if (p <= 0) return;
  const dir = mmNorm(mmSub(o.b, o.a));
  const B = mmAdd(o.a, mmScale(dir, 30 * p));
  const isSel = state.selectedId === o.id;
  mmHalo3D(o, isSel);
  if (p < 1) ctx.globalAlpha *= p;
  mmStrokeSeg3D(o.a, B);
  ctx.restore();
  if (!o.hideName) { const m = proj3(o.a[0], o.a[1], o.a[2]); mmLabel3D(m, o.name, o.color); }
  if (p < 1 && typeof kickAnim === "function") kickAnim();
}
function mmDrawVector3D(o) {
  mmDrawSeg3D(o);
  // mũi tên 3D rõ: tam giác theo hướng màn hình
  try {
    const a = proj3(o.a[0], o.a[1], o.a[2]), b = proj3(o.b[0], o.b[1], o.b[2]);
    let dx = b.sx - a.sx, dy = b.sy - a.sy;
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const L = 11, wd = 4.5;
    ctx.save(); ctx.fillStyle = o.color;
    if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 8; }
    ctx.beginPath();
    ctx.moveTo(b.sx + dx * 2, b.sy + dy * 2);
    ctx.lineTo(b.sx - dx * L + (-dy) * wd, b.sy - dy * L + dx * wd);
    ctx.lineTo(b.sx - dx * L + dy * wd, b.sy - dy * L - dx * wd);
    ctx.closePath(); ctx.fill(); ctx.restore();
  } catch {}
}
function mmDrawPlane3D(o) {
  const p = (o.born && typeof animP === "function") ? animP(o) : 1;
  if (p <= 0) return;
  const ext = (o.extent || 3.2) * (0.3 + 0.7 * p);
  let u, v;
  try {
    const bs = mmPlaneBasis(o.normal);
    u = bs.u; v = bs.v;
  } catch { return; }
  const O = o.origin;
  const c = [
    mmSub(mmSub(O, mmScale(u, ext)), mmScale(v, ext)),
    mmAdd(mmSub(O, mmScale(u, ext)), mmScale(v, ext)),
    mmAdd(mmAdd(O, mmScale(u, ext)), mmScale(v, ext)),
    mmAdd(mmSub(O, mmScale(u, ext)), mmScale(v, ext)),
  ];
  const P = c.map(q => proj3(q[0], q[1], q[2]));
  const isSel = state.selectedId === o.id;
  ctx.save();
  if (p < 1) ctx.globalAlpha = p;
  ctx.beginPath();
  P.forEach((q, i) => { if (i === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy); });
  ctx.closePath();
  ctx.fillStyle = o.color || "#8b5cf6";
  ctx.globalAlpha = (isSel ? 0.34 : 0.22) * p + 0.02;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = isSel ? "#c4b5fd" : o.color;
  ctx.lineWidth = isSel ? 2.2 : 1.4;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 8; }
  ctx.stroke();
  ctx.restore();
  if (!o.hideName) {
    const m = proj3(O[0], O[1], O[2]);
    let eq = "";
    try { eq = `${mmFmtNum(o.normal[0])}x+${mmFmtNum(o.normal[1])}y+${mmFmtNum(o.normal[2])}z=${mmFmtNum(o.normal[0] * O[0] + o.normal[1] * O[1] + o.normal[2] * O[2])}`; } catch {}
    mmLabel3D(m, `${o.name}${eq ? " · " + eq : ""}`, o.color);
  }
  if (p < 1 && typeof kickAnim === "function") kickAnim();
}
function mmDrawCircle3D(o) {
  const p = (o.born && typeof animP === "function") ? animP(o) : 1;
  if (p <= 0 || !(o.radius > 0)) return;
  let u, v;
  try { const bs = mmPlaneBasis(o.normal); u = bs.u; v = bs.v; } catch { return; }
  const N = mmIsOrbiting() ? 40 : 72;
  const isSel = state.selectedId === o.id;
  ctx.save();
  ctx.strokeStyle = isSel ? "#c4b5fd" : o.color;
  ctx.lineWidth = isSel ? 2.4 : 1.8;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 8; }
  if (p < 1) ctx.globalAlpha = p;
  ctx.beginPath();
  const n = Math.max(8, Math.floor(N * p));
  for (let i = 0; i <= n; i++) {
    const t = (2 * Math.PI * i) / N;
    const q = mmAdd(o.center, mmAdd(mmScale(u, o.radius * Math.cos(t)), mmScale(v, o.radius * Math.sin(t))));
    const s = proj3(q[0], q[1], q[2]);
    if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
  }
  ctx.stroke(); ctx.restore();
  const c = proj3(o.center[0], o.center[1], o.center[2]);
  ctx.save(); ctx.fillStyle = o.color;
  ctx.beginPath(); ctx.arc(c.sx, c.sy, 3, 0, 7); ctx.fill(); ctx.restore();
  if (!o.hideName) mmLabel3D(c, `${o.name} · R=${mmFmtNum(o.radius)}`, o.color);
  if (p < 1 && typeof kickAnim === "function") kickAnim();
}
function mmDrawSphere3D(o) {
  const p = (o.born && typeof animP === "function") ? animP(o) : 1;
  if (p <= 0 || !(o.radius > 0)) return;
  const C = o.center, r = o.radius * (0.25 + 0.75 * p);
  const isSel = state.selectedId === o.id;
  const c = proj3(C[0], C[1], C[2]);
  // hào quang Lambert nhẹ: đĩa mờ + 3 vòng kinh tuyến
  ctx.save();
  if (p < 1) ctx.globalAlpha = p;
  try {
    const edge = proj3(C[0] + r, C[1], C[2]);
    const rp = Math.abs(edge.sx - c.sx);
    const g = ctx.createRadialGradient(c.sx - rp * 0.3, c.sy - rp * 0.3, rp * 0.1, c.sx, c.sy, Math.max(1, rp));
    g.addColorStop(0, "rgba(255,255,255,.5)");
    g.addColorStop(0.45, (o.color || "#38bdf8") + "55");
    g.addColorStop(1, (o.color || "#38bdf8") + "14");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c.sx, c.sy, Math.max(1, rp), 0, 7); ctx.fill();
  } catch {}
  ctx.strokeStyle = isSel ? "#c4b5fd" : o.color;
  ctx.lineWidth = isSel ? 2.2 : 1.5;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 8; }
  const rings = mmIsOrbiting() ? [[0, 0, 1]] : [[0, 0, 1], [0, 1, 0], [1, 0, 0]];
  for (const nn of rings) {
    let u, v;
    try { const bs = mmPlaneBasis(nn); u = bs.u; v = bs.v; } catch { continue; }
    ctx.beginPath();
    const N = 56;
    for (let i = 0; i <= N; i++) {
      const t = (2 * Math.PI * i) / N;
      const q = mmAdd(C, mmAdd(mmScale(u, r * Math.cos(t)), mmScale(v, r * Math.sin(t))));
      const s = proj3(q[0], q[1], q[2]);
      if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
    }
    ctx.stroke();
  }
  ctx.restore();
  if (!o.hideName) mmLabel3D(c, `${o.name} · R=${mmFmtNum(o.radius)}`, o.color);
  if (p < 1 && typeof kickAnim === "function") kickAnim();
}
function mmDrawPolygon3D(o) {
  const p = (o.born && typeof animP === "function") ? animP(o) : 1;
  if (p <= 0 || !o.vertices || o.vertices.length < 3) return;
  const vs = o.vertices;
  const isSel = state.selectedId === o.id;
  const P = vs.map(v => proj3(v[0], v[1], v[2]));
  ctx.save();
  if (p < 1) ctx.globalAlpha = p;
  ctx.beginPath();
  P.forEach((q, i) => { if (i === 0) ctx.moveTo(q.sx, q.sy); else ctx.lineTo(q.sx, q.sy); });
  ctx.closePath();
  ctx.fillStyle = (o.color || "#8b5cf6") + "";
  ctx.globalAlpha = (isSel ? 0.42 : 0.26) * p + 0.02;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = isSel ? "#c4b5fd" : o.color;
  ctx.lineWidth = isSel ? 2.2 : 1.6;
  if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 7; }
  ctx.stroke();
  ctx.fillStyle = o.color;
  P.forEach(q => { ctx.beginPath(); ctx.arc(q.sx, q.sy, 3, 0, 7); ctx.fill(); });
  ctx.restore();
  if (!o.hideName) {
    try {
      const cx = vs.reduce((a, v) => a + v[0], 0) / vs.length;
      const cy = vs.reduce((a, v) => a + v[1], 0) / vs.length;
      const cz = vs.reduce((a, v) => a + v[2], 0) / vs.length;
      mmLabel3D(proj3(cx, cy, cz), `${o.name} · S=${mmFmtNum(mmPolygonArea3D(vs))}`, o.color);
    } catch {}
  }
  if (p < 1 && typeof kickAnim === "function") kickAnim();
}
function mmFaceNormal(V, f) {
  const a = V[f[0]], b = V[f[1]], c = V[f[2]];
  return mmNorm(mmCross(mmSub(b, a), mmSub(c, a)));
}
/* Khai triển Net: xoay từng mặt quanh cạnh chung về phẳng (xấp xỉ trực quan, có chú thích). */
function mmNetFaces(o) {
  const V = o.V || [], F = o.F || [];
  const t = clamp(o.netT || 0, 0, 1);
  if (!V.length || !F.length || t <= 0) return null;
  // kề cạnh -> mặt
  const edgeMap = {};
  F.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const k = a < b ? a + "_" + b : b + "_" + a;
      (edgeMap[k] = edgeMap[k] || []).push(fi);
    }
  });
  const normals = F.map(f => { try { return mmFaceNormal(V, f); } catch { return [0, 0, 1]; } });
  const solidC = [0, 0, 0];
  V.forEach(v => { solidC[0] += v[0]; solidC[1] += v[1]; solidC[2] += v[2]; });
  solidC[0] /= V.length; solidC[1] /= V.length; solidC[2] /= V.length;
  // BFS từ mặt 0
  const parent = new Array(F.length).fill(-1);
  const pEdge = new Array(F.length).fill(null);
  const q = [0];
  parent[0] = -2;
  while (q.length) {
    const fi = q.shift();
    const f = F[fi];
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const k = a < b ? a + "_" + b : b + "_" + a;
      for (const nb of (edgeMap[k] || [])) {
        if (parent[nb] === -1) { parent[nb] = fi; pEdge[nb] = [V[a], V[b]]; q.push(nb); }
      }
    }
  }
  // chuỗi xoay cho từng mặt
  const chains = F.map(() => []);
  for (let fi = 0; fi < F.length; fi++) {
    let cur = fi;
    const ch = [];
    while (cur > 0 && parent[cur] >= 0) {
      const pf = parent[cur];
      const n1 = normals[pf], n2 = normals[cur];
      const cos = clamp(mmDot(n1, n2), -1, 1);
      let ang = Math.PI - Math.acos(cos);
      const [A, B] = pEdge[cur];
      const axis = mmNorm(mmSub(B, A));
      // chọn dấu để mặt con bung RA NGOÀI (xa tâm khối)
      const fc = [0, 0, 0];
      F[cur].forEach(idx => { fc[0] += V[idx][0]; fc[1] += V[idx][1]; fc[2] += V[idx][2]; });
      fc[0] /= F[cur].length; fc[1] /= F[cur].length; fc[2] /= F[cur].length;
      const test = mmRotAroundAxis(mmSub(fc, A), axis, 0.12);
      const plus = mmDist(mmAdd(A, test), solidC), minus = mmDist(mmAdd(A, mmRotAroundAxis(mmSub(fc, A), axis, -0.12)), solidC);
      if (minus > plus) ang = -ang;
      ch.unshift({ A: A.slice(), axis, ang });
      cur = pf;
    }
    chains[fi] = ch;
  }
  // áp chuỗi (góc × t)
  return F.map((f, fi) => {
    const pts = f.map(idx => {
      let p = V[idx].slice();
      for (const s of chains[fi]) {
        const rel = mmSub(p, s.A);
        p = mmAdd(s.A, mmRotAroundAxis(rel, s.axis, s.ang * t));
      }
      return p;
    });
    return { pts, fi };
  });
}
function mmRotAroundAxis(v, axis, ang) {
  // Rodrigues: v cos + (k×v) sin + k (k·v)(1-cos)
  const k = mmNorm(axis);
  const c = Math.cos(ang), s = Math.sin(ang);
  const kv = mmCross(k, v);
  const d = mmDot(k, v);
  return [
    v[0] * c + kv[0] * s + k[0] * d * (1 - c),
    v[1] * c + kv[1] * s + k[1] * d * (1 - c),
    v[2] * c + kv[2] * s + k[2] * d * (1 - c),
  ];
}
function mmDrawSolid3(o) {
  const p = (o.born && typeof animP === "function") ? animP(o) : 1;
  if (p <= 0 || !o.V || !o.F || !o.V.length) return;
  const isSel = state.selectedId === o.id;
  const isDark = state.opts.theme === "dark";
  const net = mmNetFaces(o);
  const faces = [];
  const pushFace = (pts, fi) => {
    let cx = 0, cy = 0, cz = 0;
    pts.forEach(q => { cx += q[0]; cy += q[1]; cz += q[2]; });
    cx /= pts.length; cy /= pts.length; cz /= pts.length;
    let shade = 0.65;
    try {
      const a = pts[0], b = pts[1], c = pts[2];
      const n = mmNorm(mmCross(mmSub(b, a), mmSub(c, a)));
      const L = [-0.45, -0.55, 0.72];
      shade = 0.5 + 0.5 * Math.abs(n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
    } catch {}
    let depth = 0;
    try { depth = rot3(cx - state.view3d.tx, cy - state.view3d.ty, cz - state.view3d.tz).Yd; } catch {}
    faces.push({ pts, depth, shade });
  };
  if (net) net.forEach(nf => pushFace(nf.pts, nf.fi));
  else o.F.forEach(f => pushFace(f.map(i => o.V[i]), 0));
  faces.sort((a, b) => a.depth - b.depth);
  ctx.save();
  if (p < 1) ctx.globalAlpha = p;
  for (const fc of faces) {
    ctx.beginPath();
    fc.pts.forEach((q, i) => {
      const s = proj3(q[0], q[1], q[2]);
      if (i === 0) ctx.moveTo(s.sx, s.sy); else ctx.lineTo(s.sx, s.sy);
    });
    ctx.closePath();
    ctx.fillStyle = shadeHex(o.color, fc.shade * (isDark ? 1 : 0.96));
    ctx.globalAlpha = (net ? 0.88 : 0.93) * (0.3 + 0.7 * p);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = isSel ? "#c4b5fd" : (isDark ? "rgba(255,255,255,.4)" : "rgba(15,23,42,.45)");
    ctx.lineWidth = isSel ? 2 : 1.1;
    ctx.stroke();
  }
  ctx.restore();
  if (!o.hideName) {
    try {
      let top = o.V[0], bi = 0;
      o.V.forEach((v, i) => { if (v[2] > top[2]) { top = v; bi = i; } });
      const s = proj3(top[0], top[1], top[2]);
      mmLabel3D(s, `${o.name}${o.netT > 0 ? ` · Net ${Math.round(o.netT * 100)}%` : ""}`, o.color);
    } catch {}
  }
  if (p < 1 && typeof kickAnim === "function") kickAnim();
}
function mmDrawMeasure3D(o) {
  if (!o.visible || o.error) return;
  const D = o.def || {};
  const G = (id) => mmGetObj(id);
  try {
    if (o.mtype === "dist" && D.p1 && D.p2) {
      const a = G(D.p1), b = G(D.p2);
      if (!a || !b) return;
      const A = [a.x, a.y, a.kind === "point3d" ? a.z : 0], B = [b.x, b.y, b.kind === "point3d" ? b.z : 0];
      ctx.save();
      ctx.strokeStyle = o.color; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
      if (state.opts.glow) { ctx.shadowColor = o.color; ctx.shadowBlur = 6; }
      mmStrokeSeg3D(A, B);
      ctx.restore();
      mmLabel3D(proj3((A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2), `${o.name} = ${mmFmtNum(o.mvalue)}`, o.color);
    } else if (o.mtype === "angle" && D.p1 && D.p2 && D.p3) {
      const a = G(D.p1), b = G(D.p2), c = G(D.p3);
      if (!a || !b) return;
      const B = [b.x, b.y, b.kind === "point3d" ? b.z : 0];
      mmLabel3D(proj3(B[0], B[1], B[2]), `${o.name} = ${mmFmtNum(o.mvalue)}°`, o.color);
    } else if (o.mtype === "area" && D.refId) {
      const ref = G(D.refId);
      if (!ref) return;
      let C = [0, 0, 0];
      if (ref.kind === "polygon3d") {
        ref.vertices.forEach(v => { C[0] += v[0]; C[1] += v[1]; C[2] += v[2]; });
        C = mmScale(C, 1 / ref.vertices.length);
      } else if (ref.kind === "circle3d") C = ref.center;
      else if (ref.kind === "plane3d") C = ref.origin;
      else return;
      mmLabel3D(proj3(C[0], C[1], C[2]), `${o.name} S = ${mmFmtNum(o.mvalue)}`, o.color);
    } else if (o.mtype === "volume" && D.refId) {
      const ref = G(D.refId);
      if (!ref) return;
      let C = [0, 0, 0];
      if (ref.kind === "sphere3d") C = ref.center;
      else if (ref.kind === "solid3" && ref.V) {
        ref.V.forEach(v => { C[0] += v[0]; C[1] += v[1]; C[2] += v[2]; });
        C = mmScale(C, 1 / ref.V.length);
      } else return;
      mmLabel3D(proj3(C[0], C[1], C[2]), `${o.name} V = ${mmFmtNum(o.mvalue)}`, o.color);
    }
  } catch {}
}
/* ---- Preview dụng cụ 3D (translucent trước khi chốt) ---- */
function mmDraw3DToolPreview() {
  try {
    const t = state.tool || "";
    if (state.mode !== "3d" || !/^m3d-/.test(t)) return;
    const P = state.pending || [];
    const cur = state.toolCursor3d || null;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#34d399"; ctx.fillStyle = "#34d399";
    ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
    const dot = (q) => { try { const s = proj3(q[0], q[1], q[2]); ctx.beginPath(); ctx.arc(s.sx, s.sy, 4, 0, 7); ctx.fill(); } catch {} };
    const line = (A, B) => { try { mmStrokeSeg3D(A, B); } catch {} };
    const P3 = (q) => [q.x, q.y, q.z || 0];
    if (["m3d-segment", "m3d-line", "m3d-ray", "m3d-vector"].includes(t) && P.length === 1 && cur) {
      line(P3(P[0]), cur); dot(P3(P[0])); dot(cur);
    } else if (t === "m3d-plane3" && P.length >= 1 && cur) {
      if (P.length === 1) { line(P3(P[0]), cur); }
      else if (P.length === 2) {
        const A = P3(P[0]), B = P3(P[1]);
        line(A, B); line(B, cur); line(cur, A);
        [A, B, cur].forEach(dot);
      }
    } else if (["m3d-circleCP", "m3d-sphereCP"].includes(t) && P.length === 1 && cur) {
      line(P3(P[0]), cur); dot(P3(P[0])); dot(cur);
    } else if (t === "m3d-polygon" && P.length >= 1) {
      const pts = P.map(P3);
      if (cur) pts.push(cur);
      for (let i = 0; i < pts.length - 1; i++) line(pts[i], pts[i + 1]);
      if (P.length >= 3) line(pts[pts.length - 1], pts[0]);
      pts.forEach(dot);
    } else if (["m3d-cyl", "m3d-cone"].includes(t) && P.length >= 2 && cur) {
      line(P3(P[0]), P3(P[1]));
    }
    ctx.restore();
  } catch {}
}
/* ---------------- PICK + SNAP 3D ---------------- */
function mmResolveClick3D(px, py) {
  // Ưu tiên Point3D (16px) > floor. Trả về {p:[x,y,z], id}
  try {
    const h = (typeof hitTest3D === "function") ? hitTest3D(px, py) : null;
    if (h && h.obj) {
      const o = h.obj;
      return { p: [o.x, o.y, o.kind === "point3d" ? o.z : 0], id: o.id };
    }
  } catch {}
  try {
    const fl = screenToFloor(px, py);
    let z = 0;
    const sel = state.objects.find(o => o.id === state.selectedId && o.kind === "surface");
    if (sel) { try { const zz = sel.fn(fl.x, fl.y); if (isFinite(zz)) z = clamp(zz, -8, 8); } catch {} }
    return { p: [fl.x, fl.y, z], id: null };
  } catch {}
  return { p: [0, 0, 0], id: null };
}
function mmPick3D(px, py) {
  // chọn đối tượng 3D gần nhất cho Edit/Intersect/Measure (Point > Edge > Face).
  let best = null, bd = 1e18;
  const consider = (o, d) => { if (d < bd) { bd = d; best = o; } };
  for (const o of state.objects) {
    if (!o.visible || o.error) continue;
    try {
      if (o.kind === "point3d" || o.kind === "point") {
        const p = proj3(o.x, o.y, o.kind === "point3d" ? o.z : 0);
        const d = Math.hypot(px - p.sx, py - p.sy);
        if (d <= 16) consider(o, d - 6);
      } else if (["segment3d", "vector3d"].includes(o.kind)) {
        const a = proj3(o.a[0], o.a[1], o.a[2]), b = proj3(o.b[0], o.b[1], o.b[2]);
        const d = distPtSeg(px, py, a.sx, a.sy, b.sx, b.sy);
        if (d <= 12) consider(o, d);
        if (Math.hypot(px - a.sx, py - a.sy) <= 12) consider(o, 2);
        if (Math.hypot(px - b.sx, py - b.sy) <= 12) consider(o, 2);
      } else if (["line3d", "ray3d"].includes(o.kind)) {
        const dir = mmNorm(mmSub(o.b, o.a));
        const A = mmAdd(o.a, mmScale(dir, -30)), B = mmAdd(o.a, mmScale(dir, 30));
        const a = proj3(A[0], A[1], A[2]), b = proj3(B[0], B[1], B[2]);
        const d = distPtSeg(px, py, a.sx, a.sy, b.sx, b.sy);
        if (d <= 12) consider(o, d + 1);
      } else if (o.kind === "polygon3d" && o.vertices) {
        const S = o.vertices.map(v => proj3(v[0], v[1], v[2]));
        let m = 1e18;
        for (let i = 0; i < S.length; i++) {
          const A = S[i], B = S[(i + 1) % S.length];
          m = Math.min(m, distPtSeg(px, py, A.sx, A.sy, B.sx, B.sy));
          if (Math.hypot(px - A.sx, py - A.sy) <= 12) m = Math.min(m, 2);
        }
        if (m <= 12) consider(o, m + 2);
      } else if (o.kind === "circle3d") {
        const bs = mmPlaneBasis(o.normal);
        let m = 1e18;
        let prev = null;
        for (let i = 0; i <= 48; i++) {
          const t = (2 * Math.PI * i) / 48;
          const q = mmAdd(o.center, mmAdd(mmScale(bs.u, o.radius * Math.cos(t)), mmScale(bs.v, o.radius * Math.sin(t))));
          const s = proj3(q[0], q[1], q[2]);
          if (prev) m = Math.min(m, distPtSeg(px, py, prev.sx, prev.sy, s.sx, s.sy));
          prev = s;
        }
        if (m <= 12) consider(o, m + 2);
      } else if (o.kind === "sphere3d") {
        const c = proj3(o.center[0], o.center[1], o.center[2]);
        const e = proj3(o.center[0] + o.radius, o.center[1], o.center[2]);
        const rp = Math.abs(e.sx - c.sx);
        const d = Math.abs(Math.hypot(px - c.sx, py - c.sy) - rp);
        if (d <= 12 || Math.hypot(px - c.sx, py - c.sy) <= 10) consider(o, Math.min(d, 8) + 3);
      } else if (o.kind === "plane3d") {
        const O = proj3(o.origin[0], o.origin[1], o.origin[2]);
        if (Math.hypot(px - O.sx, py - O.sy) <= 14) consider(o, 6);
        else {
          const ext = o.extent || 3.2;
          const bs = mmPlaneBasis(o.normal);
          const cs = [
            mmSub(mmSub(o.origin, mmScale(bs.u, ext)), mmScale(bs.v, ext)),
            mmAdd(mmSub(o.origin, mmScale(bs.u, ext)), mmScale(bs.v, ext)),
            mmAdd(mmAdd(o.origin, mmScale(bs.u, ext)), mmScale(bs.v, ext)),
            mmAdd(mmSub(o.origin, mmScale(bs.u, ext)), mmScale(bs.v, ext)),
          ].map(q => proj3(q[0], q[1], q[2]));
          let m = 1e18;
          for (let i = 0; i < 4; i++) {
            const A = cs[i], B = cs[(i + 1) % 4];
            m = Math.min(m, distPtSeg(px, py, A.sx, A.sy, B.sx, B.sy));
          }
          if (m <= 10) consider(o, m + 4);
        }
      } else if (o.kind === "solid3" && o.V) {
        let m = 1e18;
        const P = o.V.map(v => proj3(v[0], v[1], v[2]));
        for (const f of o.F || []) {
          for (let i = 0; i < f.length; i++) {
            const A = P[f[i]], B = P[f[(i + 1) % f.length]];
            if (!A || !B) continue;
            m = Math.min(m, distPtSeg(px, py, A.sx, A.sy, B.sx, B.sy));
          }
        }
        if (m <= 12) consider(o, m + 3);
      } else if (o.kind === "measure3d") {
        // đo: khó nhấp chính xác -> bỏ qua trừ khi rất gần label (đã vẽ ở centroid)
      }
    } catch {}
  }
  return best ? { obj: best, d: bd } : null;
}
/* ---------------- CAMERA cinematic ---------------- */
let mmFlyRaf = 0;
function mmFlyTo(target, dur) {
  dur = dur || 700;
  try { if (mmFlyRaf) cancelAnimationFrame(mmFlyRaf); } catch {}
  const from = { ...state.view3d };
  const t0 = performance.now();
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const step = (now) => {
    const k = clamp((now - t0) / dur, 0, 1), e = ease(k);
    for (const key of ["az", "el", "scale", "tx", "ty", "tz"]) {
      if (isFinite(target[key]) && isFinite(from[key])) state.view3d[key] = from[key] + (target[key] - from[key]) * e;
    }
    draw();
    if (k < 1) mmFlyRaf = requestAnimationFrame(step);
    else { mmFlyRaf = 0; persist(); }
  };
  mmFlyRaf = requestAnimationFrame(step);
}
function mmObjCenter3D(o) {
  if (!o) return [0, 0, 0];
  if (o.kind === "point3d") return [o.x, o.y, o.z];
  if (o.kind === "point") return [o.x, o.y, 0];
  if (["line3d", "segment3d", "ray3d", "vector3d"].includes(o.kind)) return mmMid(o.a, o.b);
  if (o.kind === "plane3d") return o.origin.slice();
  if (o.kind === "circle3d" || o.kind === "sphere3d") return o.center.slice();
  if (o.kind === "polygon3d") {
    const c = [0, 0, 0];
    o.vertices.forEach(v => { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; });
    return mmScale(c, 1 / o.vertices.length);
  }
  if (o.kind === "solid3" && o.V && o.V.length) {
    const c = [0, 0, 0];
    o.V.forEach(v => { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; });
    return mmScale(c, 1 / o.V.length);
  }
  return [0, 0, 0];
}
function mmFocusObject(o) {
  if (!o) { toast("Hãy chọn một đối tượng 3D trước.", "err"); return; }
  const c = mmObjCenter3D(o);
  let size = 4;
  try {
    if (o.kind === "sphere3d" || o.kind === "circle3d") size = Math.max(2, o.radius * 3);
    else if (o.kind === "solid3" && o.V) {
      size = 0;
      o.V.forEach(v => { size = Math.max(size, mmDist(v, c)); });
      size = Math.max(2, size * 2.2);
    }
  } catch {}
  const sc = clamp(Math.min(W, H) / Math.max(1, size), 8, 400);
  // hướng nhìn vuông góc vật: giữ az hiện tại, nâng el ~ 0.9 (chính diện trên-nghiêng)
  mmFlyTo({ az: state.view3d.az, el: 0.85, scale: sc, tx: c[0], ty: c[1], tz: c[2] }, 750);
  toast(`Camera → ${o.name} (chính diện).`, "ok");
}
/* ---------------- NET panel + animation ---------------- */
function mmOpenNetPanel(o) {
  const panel = document.getElementById("m3dNetPanel");
  const nm = document.getElementById("m3dNetName");
  const sl = document.getElementById("m3dNetSlider");
  if (!panel) return;
  panel.hidden = false;
  if (nm) nm.textContent = o ? o.name : "";
  if (sl && o) sl.value = String(Math.round((o.netT || 0) * 100));
}
function mmNetSet(o, t) {
  if (!o) return;
  o.netT = clamp(t, 0, 1);
  const sl = document.getElementById("m3dNetSlider");
  if (sl && state.selectedId === o.id) sl.value = String(Math.round(o.netT * 100));
  draw(); persist();
}
let mmNetRaf = 0;
function mmNetPlay(o, open) {
  if (!o) return;
  try { if (mmNetRaf) cancelAnimationFrame(mmNetRaf); } catch {}
  const from = o.netT || 0, to = open ? 1 : 0;
  const t0 = performance.now(), dur = 1600;
  const step = (now) => {
    const k = clamp((now - t0) / dur, 0, 1);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    mmNetSet(o, from + (to - from) * e);
    if (k < 1) mmNetRaf = requestAnimationFrame(step);
    else { mmNetRaf = 0; toast(open ? `Đã khai triển ${o.name}.` : `Đã gập lại ${o.name}.`, "ok"); }
  };
  mmNetRaf = requestAnimationFrame(step);
}
/* ---------------- DEMO SCENES (regression + WOW) ---------------- */
function mmDemoWOW() {
  // Scene: A,B,C -> tam giác + MP ABC + D trên cao + chóp + cầu tâm D + giao cầu-MP + vector AD + đo
  try {
    if (state.mode !== "3d") setMode("3d");
    const A = mmAddDirect3D("point3d", { x: -2, y: -1.5, z: 0 }, { name: "A" });
    const B = mmAddDirect3D("point3d", { x: 2, y: -1.5, z: 0 }, { name: "B" });
    const C = mmAddDirect3D("point3d", { x: 0, y: 2, z: 0 }, { name: "C" });
    const D = mmAddDirect3D("point3d", { x: 0, y: 0, z: 3 }, { name: "D" });
    const tri = mmAddDirect3D("polygon3d", { vertices: [[A.x, A.y, A.z], [B.x, B.y, B.z], [C.x, C.y, C.z]] },
      { parents: [A.id, B.id, C.id], def: { type: "polygon3d", vIds: [A.id, B.id, C.id] } });
    let pl = null;
    try {
      const p = mmPlaneFrom3([A.x, A.y, A.z], [B.x, B.y, B.z], [C.x, C.y, C.z]);
      pl = mmAddDirect3D("plane3d", { origin: p.origin, normal: p.normal, extent: 3.4 },
        { parents: [A.id, B.id, C.id], def: { type: "plane3", p1: A.id, p2: B.id, p3: C.id } });
    } catch (e) { toast(e.message, "err"); }
    const pyr = mmAddDirect3D("solid3", { solid3: "pyramid", ...(mmBuildSolid3("pyramid", { polyId: tri.id, apexId: D.id }, (id) => mmGetObj(id)) || { V: [], F: [] }) },
      { parents: [tri.id, D.id], def: { type: "pyramid", polyId: tri.id, apexId: D.id } });
    const sp = mmAddDirect3D("sphere3d", { center: [D.x, D.y, D.z], radius: 2.2 },
      { parents: [D.id], def: { type: "sphereCR", cId: D.id, r: 2.2 } });
    if (pl) { try { mmDoIntersect(pl, sp); } catch (e) { toast(e.message, "err"); } }
    mmAddDirect3D("vector3d", { a: [A.x, A.y, A.z], b: [D.x, D.y, D.z] }, { parents: [A.id, D.id], def: { type: "line", p1: A.id, p2: D.id } });
    mmAddDirect3D("measure3d", { mtype: "dist", mvalue: mmDist([A.x, A.y, A.z], [B.x, B.y, B.z]), mrefs: [A.name, B.name] },
      { parents: [A.id, B.id], def: { type: "measure", p1: A.id, p2: B.id } });
    mmFlyTo({ az: -0.65, el: 0.9, scale: 44, tx: 0, ty: 0, tz: 1 }, 900);
    toast("Demo WOW: chóp ABCD + mặt ABC + cầu tâm D + giao tuyến. Thử Khai triển / Quay trục / Chính diện.", "ok");
  } catch (e) { toast(e.message, "err"); }
}

/* ---------------- boot ---------------- */
function seed() {
  const saved = store.load();
  if (saved) {
    try {
      state.seq = saved.seq || 0; colorIdx = saved.colorIdx || 0;
      state.params = saved.params || {};
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
  $("#setGlow").checked = state.opts.glow;
  const m3 = $("#setMesh3d"); if (m3) m3.checked = state.opts.mesh3d !== false;
  const sp = $("#setSpin3d"); if (sp) sp.checked = !!state.opts.spin3d;
  const q3 = $("#setQuality3d"); if (q3) { q3.value = state.opts.quality3d || 32; $("#q3Val").textContent = state.opts.quality3d || 32; }
  const an = $("#setAnimate"); if (an) an.checked = state.opts.animate !== false;
  const ad = $("#setAnimDur"); if (ad) { ad.value = state.opts.animDur || 1.4; $("#animVal").textContent = Number(state.opts.animDur || 1.4).toFixed(1); }
  $("#setGrid").value = state.opts.gridStep; $("#gridVal").textContent = Number(state.opts.gridStep).toFixed(1);
  $("#setThick").value = state.opts.thick; $("#thickVal").textContent = Number(state.opts.thick).toFixed(1);
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


