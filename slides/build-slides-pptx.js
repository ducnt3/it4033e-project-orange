// Builds slides/slides.pptx: same content as slides.tex, with English speaker notes.
const path = require("path");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
// Optional: SKILL_DIR points at a pptx skill that ships scripts/apply_theme.js (writes THEME colours
// into the theme part). Without it the deck still builds, with Office default theme colours.
const applyTheme = process.env.SKILL_DIR
  ? require(process.env.SKILL_DIR + "/scripts/apply_theme.js").applyTheme
  : null;

const OUT = path.resolve(process.argv[2]);

const THEME = {
  name: "Project Orange",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1F2328", lt1: "FFFFFF", dk2: "3A3F47", lt2: "F2F3F5",
    accent1: "E8710A", accent2: "1F6F78", accent3: "F6C08F", accent4: "8A919C",
    accent5: "2E7D32", accent6: "B3261E", hlink: "1F6F78", folHlink: "6B4C9A",
  },
};
const H = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.author = "Nguyen Tien Duc, Hoang Huy Chien";
pres.title = "Mathematical modelling of T-Adaptive Segment Routing";
const C = pres.SchemeColor;
const W = 13.333;

// ---------- layouts ----------
pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: C.text1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.8, y: 1.7, w: 11.7, h: 1.7, fontSize: 40, bold: true, color: C.background1, valign: "bottom", fontFace: "Cambria" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.8, y: 3.55, w: 11.7, h: 0.7, fontSize: 22, color: C.accent3, valign: "top" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background1 },
  margin: [0.5, 0.6, 0.7, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.1, h: 0.85, fontSize: 32, bold: true, color: C.text1, valign: "middle", fontFace: "Cambria" }, text: "" } },
    { text: { text: "Project Orange · T-Adaptive Segment Routing · IT4033E", options: { x: 0.6, y: 7.0, w: 8, h: 0.3, fontSize: 10, color: C.accent4, margin: 0 } } },
  ],
  slideNumber: { x: 12.2, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: C.accent4, align: "right" },
});

// ---------- helpers ----------
async function icon(Comp, hex) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + hex, size: 256 }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

// "x^{dt}_{ij}" -> runs with sub/superscript; base options merged into each run.
function mathRuns(s, base = {}) {
  const runs = [];
  const re = /([_^])\{([^}]*)\}/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index), options: { ...base } });
    runs.push({ text: m[2], options: { ...base, [m[1] === "_" ? "subscript" : "superscript"]: true } });
    last = re.lastIndex;
  }
  if (last < s.length) runs.push({ text: s.slice(last), options: { ...base } });
  return runs;
}

// Bullet list: items are strings or arrays of runs; "**x**" prefix marks a bold lead-in.
function bullets(slide, items, opts) {
  const runs = [];
  items.forEach((it, i) => {
    const last = i === items.length - 1;
    const para = { bullet: { indent: 18 }, align: "left", paraSpaceAfter: opts.gap ?? 8 };
    let parts = [];
    if (typeof it === "string") {
      const mm = it.match(/^\*\*(.+?)\*\*(.*)$/);
      parts = mm ? [{ text: mm[1], options: { bold: true, color: C.accent1 } }, ...mathRuns(mm[2])] : mathRuns(it);
    } else parts = it;
    parts.forEach((p, j) => {
      const o = { ...p.options };
      Object.assign(o, para);
      if (j === parts.length - 1 && !last) o.breakLine = true;
      runs.push({ text: p.text, options: o });
    });
  });
  slide.addText(runs, { isTextBox: true, valign: "top", fontSize: 16, color: C.text1, margin: 0, ...opts.box });
}

function card(slide, name, x, y, w, h, fillColor) {
  slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    objectName: name, x, y, w, h, rectRadius: 0.12, fill: { color: fillColor || C.background2 }, line: { type: "none" },
  });
}

function stat(slide, name, x, y, w, big, label, bigColor) {
  slide.addText(big, { objectName: name + " value", isTextBox: true, x, y, w, h: 0.75, fontSize: 36, bold: true, color: bigColor || C.accent1, fontFace: "Cambria", margin: 0, valign: "bottom" });
  slide.addText(label, { objectName: name + " label", isTextBox: true, x, y: y + 0.8, w, h: 0.7, fontSize: 13, color: C.text2, margin: 0, valign: "top" });
}

// Results table from the generated LaTeX rows; collapses "model too large" rows into one line.
const HEAD = ["Inst", "n", "m", "|D|", "vars", "opt/runs", "MLU", "no-wp", "gap (%)", "CPU (s)", "nodes"];
function resultsTable(slide, rows, tooLarge, y, fontSize) {
  const hdr = HEAD.map((t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text1 }, align: t === "Inst" ? "left" : "right" } }));
  const body = rows.map((r, i) => {
    const improved = parseFloat(r[6]) < parseFloat(r[7]) - 1e-9;
    const allOpt = /^(\d+)\/\1$/.test(r[5]);
    const fill = { color: i % 2 ? C.background2 : C.background1 };
    return r.map((v, k) => ({
      text: v,
      options: {
        fill, align: k === 0 ? "left" : "right",
        bold: (k === 6 && improved) || (k === 5 && allOpt),
        color: k === 6 && improved ? C.accent5 : C.text1,
      },
    }));
  });
  const tl = [{ text: tooLarge, options: { colspan: 11, italic: true, color: C.text2, fill: { color: C.background2 }, align: "left" } }];
  slide.addTable([hdr, ...body, tl], {
    x: 0.6, y, w: 12.1, fontSize, fontFace: "Calibri", rowH: 0.27, margin: [0, 0.08, 0, 0.08], valign: "middle",
    border: { type: "solid", pt: 0.5, color: H.lt2 },
    colW: [0.8, 0.8, 0.9, 0.9, 1.2, 1.3, 1.1, 1.1, 1.3, 1.4, 1.3],
  });
}

const P0 = [
  ["01", "20", "80", "40", "0.02M", "10/10", "0.929", "1.000", "0.0", "4.0", "1.0"],
  ["02", "30", "150", "45", "0.04M", "10/10", "0.549", "1.000", "0.0", "27.8", "1.0"],
  ["03", "50", "250", "20", "0.05M", "10/10", "0.944", "1.000", "0.0", "16.3", "1.0"],
  ["04", "50", "250", "200", "0.49M", "0/10", "0.675", "0.692", "31.5", "1819.3", "0.0"],
  ["05", "100", "396", "100", "0.99M", "4/10", "0.135", "0.333", "12.6", "1578.5", "0.4"],
  ["06", "100", "500", "500", "4.95M", "0/10", "1.000", "1.000", "100.0", "2056.4", "0.0"],
  ["07", "100", "500", "800", "7.92M", "2/10", "0.908", "0.908", "80.0", "2069.4", "0.2"],
  ["08", "150", "654", "200", "4.47M", "1/10", "0.800", "1.000", "53.8", "12450.4", "0.1"],
  ["09", "150", "750", "200", "4.47M", "0/10", "0.611", "0.611", "17.3", "2403.3", "0.0"],
  ["10", "150", "966", "1000", "22.35M", "0/10", "1.000", "1.000", "100.0", "2989.6", "0.0"],
  ["11", "200", "1000", "400", "15.92M", "0/10", "1.000", "1.000", "100.0", "2430.3", "0.0"],
  ["12", "200", "898", "400", "15.92M", "0/10", "1.000", "1.000", "100.0", "2342.9", "0.0"],
  ["14", "250", "1108", "600", "37.35M", "0/10", "1.000", "1.000", "100.0", "3032.5", "0.0"],
  ["15", "250", "1250", "600", "37.35M", "0/10", "1.000", "1.000", "100.0", "2826.6", "0.0"],
];
const P01 = [
  ["01", "20", "80", "40", "0.05M", "10/10", "0.929", "1.000", "0.0", "23.4", "11.0"],
  ["02", "30", "150", "45", "0.12M", "7/10", "0.942", "1.098", "5.2", "2386.5", "6.1"],
  ["03", "50", "250", "20", "0.15M", "3/10", "0.961", "1.000", "24.0", "3109.1", "44.4"],
  ["04", "50", "250", "200", "1.47M", "0/10", "0.898", "1.000", "32.9", "3638.6", "0.0"],
  ["05", "100", "396", "100", "2.97M", "0/10", "0.865", "1.000", "77.1", "5198.7", "0.0"],
  ["06", "100", "500", "500", "14.85M", "0/5", "1.000", "1.000", "100.0", "3893.4", "0.0"],
  ["08", "150", "654", "200", "13.41M", "0/1", "1.000", "1.000", "68.1", "3892.2", "0.0"],
  ["09", "150", "750", "200", "13.41M", "0/5", "1.000", "1.000", "66.0", "3869.9", "0.0"],
];
const P01ON = [
  ["01", "20", "80", "40", "0.05M", "10/10", "0.929", "1.000", "0.0", "32.6", "1.0"],
  ["02", "30", "150", "45", "0.12M", "2/10", "1.053", "1.098", "42.9", "3224.8", "0.7"],
  ["03", "50", "250", "20", "0.15M", "4/10", "0.946", "1.000", "11.5", "2840.8", "0.8"],
];

(async () => {
  const ic = {
    code: await icon(fa.FaCode, H.lt1),
    check: await icon(fa.FaCheckDouble, H.lt1),
    play: await icon(fa.FaPlay, H.lt1),
    dice: await icon(fa.FaDiceFive, H.lt1),
    server: await icon(fa.FaServer, H.lt1),
  };

  // ===== 1. Title =====
  pres.addSection({ title: "Introduction" });
  let s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Introduction" });
  s.addText("Mathematical modelling of T-Adaptive Segment Routing", { placeholder: "title" });
  s.addText("Project Orange — Challenge EURO/ROADEF 2026", { placeholder: "body" });
  s.addText([
    { text: "Nguyễn Tiến Đức (20252076M)  ·  Hoàng Huy Chiến (20261069M)", options: { breakLine: true, bold: true } },
    { text: "IT4033E Capstone, SoICT  ·  October 2026" },
  ], { objectName: "Authors", isTextBox: true, x: 0.8, y: 5.4, w: 11.7, h: 0.9, fontSize: 18, color: C.background1, margin: 0, paraSpaceAfter: 6 });
  s.addShape(pres.shapes.OVAL, { objectName: "Orange dot", x: 0.8, y: 1.05, w: 0.45, h: 0.45, fill: { color: C.accent1 }, line: { type: "none" } });
  s.addNotes("Good morning. We are Nguyen Tien Duc and Hoang Huy Chien. Our capstone project is Project Orange, taken from the EURO/ROADEF 2026 challenge: T-Adaptive Segment Routing. In about ten minutes we will describe the problem, our MILP model, how we validated it, and what happened when we solved the twenty instances of set A with an open-source solver.");

  // ===== 2. Problem =====
  pres.addSection({ title: "Problem and model" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Problem and model" });
  s.addText("Problem: T-Adaptive Segment Routing", { placeholder: "title" });
  bullets(s, [
    "IP backbone G = (V, A): link metric ω(a), capacity c(a); demands d = (s_{d}, t_{d}) with volume ν(d, t)",
    "Packets follow shortest paths; ties are split (ECMP). Congestion = high load λ(a, t) = flow(a, t) / c(a)",
    "**Segment Routing: **each demand gets at most maxSeg − 1 waypoints; shortest paths between consecutive waypoints bend flows away from hot links",
    "**Periods: **t = 0 nominal, t = 1 with links q(1) down; at most κ(1) segment changes between periods",
  ], { box: { x: 0.6, y: 1.45, w: 7.0, h: 3.9 }, gap: 12 });
  // goal card
  card(s, "Goal card", 0.6, 5.45, 7.0, 1.3, C.text1);
  s.addText([
    { text: "Goal  ", options: { bold: true, color: C.accent1 } },
    { text: "choose a segment path per demand and period to minimise link load. Experiments: period 0 alone, then periods {0, 1} with the budget, on the 20 instances of set A.", options: { color: C.background1 } },
  ], { objectName: "Goal text", isTextBox: true, x: 0.85, y: 5.55, w: 6.5, h: 1.1, fontSize: 15, margin: 0, valign: "middle" });
  // network sketch: direct path through hot link vs. path via waypoint w
  const N = { s: [8.4, 3.6], a: [10.0, 2.65], b: [11.6, 3.6], t: [12.4, 5.0], w: [10.0, 5.55], c: [8.9, 5.1] };
  const R = 0.26;
  const link = (p, q, color, wpt, dash, name) => {
    const [x1, y1] = N[p], [x2, y2] = N[q];
    s.addShape(pres.shapes.LINE, { objectName: name, x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.001, h: Math.abs(y2 - y1) || 0.001, flipH: (x2 - x1) * (y2 - y1) < 0, line: { color, width: wpt, dashType: dash || "solid" } });
  };
  link("s", "a", H.accent6, 4, null, "Hot link s-a");
  link("a", "b", H.accent6, 4, null, "Hot link a-b");
  link("b", "t", H.accent4, 1.5, null, "Link b-t");
  link("s", "c", H.accent1, 4, null, "Link s-c");
  link("c", "w", H.accent1, 4, null, "Link c-w");
  link("w", "t", H.accent1, 4, null, "Link w-t");
  link("a", "w", H.accent4, 1.5, "dash", "Link a-w");
  for (const [k, [x, y]] of Object.entries(N)) {
    const isWp = k === "w";
    s.addShape(pres.shapes.OVAL, { objectName: "Node " + k, x: x - R, y: y - R, w: 2 * R, h: 2 * R, fill: { color: isWp ? C.accent1 : C.text1 }, line: { color: C.background1, width: 1.5 } });
    if (["s", "t", "w"].includes(k)) s.addText(k, { objectName: "Label " + k, isTextBox: true, x: x - R, y: y - R, w: 2 * R, h: 2 * R, fontSize: 14, bold: true, italic: true, color: C.background1, align: "center", valign: "middle", margin: 0, fontFace: "Cambria" });
  }
  s.addText([
    { text: "Shortest path crosses a hot link", options: { color: C.accent6, bold: true, breakLine: true } },
    { text: "Waypoint w bends the flow away", options: { color: C.accent1, bold: true } },
  ], { objectName: "Sketch legend", isTextBox: true, x: 8.1, y: 1.45, w: 4.8, h: 0.7, fontSize: 14, margin: 0 });
  s.addText("Illustration only, not an instance from the data", { objectName: "Sketch caption", isTextBox: true, x: 8.1, y: 6.15, w: 4.8, h: 0.3, fontSize: 11, italic: true, color: C.text2, margin: 0 });
  s.addNotes(`The setting is an IP backbone network. Each link has a routing metric and a capacity, and each demand is a source-target pair with a traffic volume. Routers send packets along shortest paths and split ties evenly, which is called ECMP. Congestion is measured by link utilisation: flow divided by capacity.

Segment Routing lets the operator add up to maxSeg minus one waypoints to a demand. Between two consecutive waypoints the traffic still follows shortest paths, so waypoints bend flows away from hot links without changing the metrics. (Point at the sketch: the red shortest path versus the orange path through waypoint w.)

The T-adaptive part: there are several periods. Period 0 is the nominal network; in period 1 some links are down. Between periods we may change at most kappa segments, so we cannot re-optimise everything from scratch.

Our goal is to choose one segment path per demand and per period that minimises link load. We ran two experiments: period 0 alone, then periods 0 and 1 together with the change budget.`);

  // ===== 3. Data and r =====
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Problem and model" });
  s.addText("Data and split coefficients r(i, j, a, t)", { placeholder: "title" });
  bullets(s, [
    "**Input: **net.json (ω, c), tm.json (ν), scenario.json (maxSeg, κ, q)",
    "r(i, j, a, t) = fraction of a unit flow i → j in G(t) that crosses link a (course document)",
    "σ = number of shortest paths: one Dijkstra with path counting per source, O(n·m·log n)",
  ], { box: { x: 0.6, y: 1.45, w: 12.1, h: 1.6 }, gap: 8 });
  card(s, "Formula card", 0.6, 3.15, 12.1, 1.35);
  s.addText([
    ...mathRuns("r(i, j, a, t) = σ_{iu}(t) · σ_{vj}(t) / σ_{ij}(t)", { fontFace: "Cambria", fontSize: 26, color: C.text1 }),
    ...mathRuns("     if  d_{iu} + ω(a) + d_{vj} = d_{ij},  a = (u, v);  else 0", { fontFace: "Cambria", fontSize: 18, color: C.text2 }),
  ], { objectName: "Formula", isTextBox: true, x: 0.9, y: 3.15, w: 11.6, h: 1.35, valign: "middle", margin: 0 });
  s.addText("Path counting ≠ per-node ECMP: toy instance, r(v0, v5, a13, 0)", { objectName: "Toy heading", isTextBox: true, x: 0.6, y: 4.8, w: 12.1, h: 0.4, fontSize: 18, bold: true, color: C.text1, margin: 0 });
  stat(s, "Ours", 0.6, 5.25, 3.6, "1/3", "path counting (course definition, kept)", C.accent1);
  stat(s, "Subject", 4.6, 5.25, 3.6, "1/2", "per-node ECMP (subject's table)", C.accent4);
  s.addText("We keep the course definition and document the difference in the report.", { objectName: "Toy note", isTextBox: true, x: 8.6, y: 5.35, w: 4.1, h: 1.2, fontSize: 15, italic: true, color: C.text2, margin: 0, valign: "middle" });
  s.addNotes(`The input comes in three JSON files: the network, the traffic matrix, and the scenario with maxSeg, the budget kappa and the failed links.

The key precomputed data is r(i,j,a,t): the fraction of one unit of flow from i to j that crosses link a in period t. Following the course document, it is sigma(i,u) times sigma(v,j) over sigma(i,j), where sigma counts shortest paths, and it is nonzero only if a lies on a shortest path. We compute it with one Dijkstra with path counting per source.

One point we want to be transparent about: path counting is not the same as per-node ECMP splitting. On the toy instance we get one third where the subject's table says one half. We kept the course definition and documented the difference.`);

  // ===== 4. MILP =====
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Problem and model" });
  s.addText("MILP model", { placeholder: "title" });
  s.addText("Variables and objective", { objectName: "Var heading", isTextBox: true, x: 0.6, y: 1.4, w: 4.6, h: 0.4, fontSize: 18, bold: true, color: C.accent1, margin: 0 });
  bullets(s, [
    mathRuns("x^{dt}_{ij} ∈ {0, 1}: segment (i, j) ∈ K used by demand d in period t  (K = reachable pairs)"),
    mathRuns("U ≥ 0: maximum link utilisation (MLU)"),
    mathRuns("y^{dt}_{ij} ≥ 0 linearises |x^{dt}_{ij} − x^{d,t−1}_{ij}|"),
    [{ text: "Objective: min U", options: { bold: true } }, { text: "  (first criterion of the subject's lexicographic objective)" }],
  ], { box: { x: 0.6, y: 1.9, w: 4.6, h: 3.6 }, gap: 10 });
  const cons = [
    ["(1) Path in the segment graph", "∑_{j} x^{dt}_{ij} − ∑_{j} x^{dt}_{ji} = 1[i = s_{d}] − 1[i = t_{d}]"],
    ["(2) Segment limit", "∑_{(i,j)} x^{dt}_{ij} ≤ maxSeg"],
    ["(3) Load on every working link", "∑_{d} ∑_{(i,j)} r(i, j, a, t) · ν(d, t) · x^{dt}_{ij} ≤ U · c(a),   a ∉ q(t)"],
    ["(4) Change budget", "∑ y^{dt}_{ij} ≤ κ(t),   y ≥ x^{t} − x^{t−1},   y ≥ x^{t−1} − x^{t}"],
  ];
  cons.forEach(([lbl, f], i) => {
    const y = 1.4 + i * 1.08;
    card(s, "Constraint card " + (i + 1), 5.6, y, 7.1, 0.95);
    s.addText(lbl, { objectName: "Constraint label " + (i + 1), isTextBox: true, x: 5.85, y: y + 0.08, w: 6.7, h: 0.3, fontSize: 13, bold: true, color: C.accent1, margin: 0 });
    s.addText(mathRuns(f, { fontFace: "Cambria", fontSize: 17, color: C.text1 }), { objectName: "Constraint formula " + (i + 1), isTextBox: true, x: 5.85, y: y + 0.4, w: 6.7, h: 0.45, margin: 0, valign: "middle" });
  });
  card(s, "Size card", 0.6, 5.85, 12.1, 0.9, C.text1);
  s.addText([
    { text: "Size  ", options: { bold: true, color: C.accent1 } },
    { text: "|D| · |K| · |T| binaries with |K| ≤ n(n − 1): from 1.5 · 10⁴ (instance 01) to ≈ 10⁹ (instance 20)", options: { color: C.background1 } },
  ], { objectName: "Size text", isTextBox: true, x: 0.85, y: 5.85, w: 11.6, h: 0.9, fontSize: 17, margin: 0, valign: "middle" });
  s.addNotes(`The variables: x is one if demand d uses segment (i,j) in period t; K is the set of reachable pairs. U is the maximum link utilisation, and y linearises the absolute change between consecutive periods.

We minimise U, the first criterion of the subject's lexicographic objective.

Constraint 1 is flow conservation in the segment graph, so the chosen segments form a path from source to target. Constraint 2 limits the number of segments. Constraint 3 says the load on each working link, built from the r coefficients and the volumes, is at most U times the capacity. Constraint 4 is the change budget between periods.

The weak point is size: binaries = demands times segments times periods. It goes from fifteen thousand on instance 1 to about one billion on instance 20. This drives everything you will see in the results.`);

  // ===== 5. Implementation and validation =====
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Problem and model" });
  s.addText("Implementation and validation", { placeholder: "title" });
  const rows5 = [
    [ic.code, "Stack", "Julia 1.13 + JuMP 1.32 + HiGHS 1.15 (open-source branch-and-bound)"],
    [ic.check, "Validation first", "24 automated tests on the subject's toy instance; MILP optimum = brute-force enumeration of all segment paths"],
    [ic.play, "MIP start", "No-waypoint routing (segment s_{d} → t_{d} only) is always feasible with 0 changes; its MLU is the reference column no-wp"],
    [ic.dice, "Protocol", "10 runs per instance (HiGHS seeds 1–10, 1 thread each); limit 1800 s (period 0) / 3600 s (periods 0+1); gap = 1 − LB/UB; CPU = optimize! time only"],
    [ic.server, "Machine", "i9-14900K, 125 GB RAM (shared server); parallel runs through a memory-aware job queue"],
  ];
  rows5.forEach(([img, head, txt], i) => {
    const y = 1.45 + i * 1.05;
    s.addShape(pres.shapes.OVAL, { objectName: head + " icon circle", x: 0.6, y, w: 0.7, h: 0.7, fill: { color: C.accent1 }, line: { type: "none" } });
    s.addImage({ data: img, x: 0.78, y: y + 0.18, w: 0.34, h: 0.34, altText: head + " icon" });
    s.addText([{ text: head, options: { bold: true, color: C.text1, breakLine: true, fontSize: 17 } }, ...mathRuns(txt, { fontSize: 14, color: C.text2 })],
      { objectName: head + " text", isTextBox: true, x: 1.55, y: y - 0.05, w: 7.0, h: 0.95, margin: 0, valign: "top" });
  });
  card(s, "Toy result card", 9.0, 1.45, 3.7, 5.0, C.text1);
  s.addText("24", { objectName: "Tests value", isTextBox: true, x: 9.3, y: 1.55, w: 3.1, h: 0.9, fontSize: 54, bold: true, color: C.accent1, fontFace: "Cambria", margin: 0 });
  s.addText("automated tests pass", { objectName: "Tests label", isTextBox: true, x: 9.3, y: 2.45, w: 3.1, h: 0.4, fontSize: 14, color: C.background1, margin: 0 });
  s.addText("0.375", { objectName: "Toy MLU value", isTextBox: true, x: 9.3, y: 3.15, w: 3.1, h: 0.9, fontSize: 54, bold: true, color: C.accent1, fontFace: "Cambria", margin: 0 });
  s.addText("toy optimum MLU, waypoint v4: MILP = brute force", { objectName: "Toy MLU label", isTextBox: true, x: 9.3, y: 4.05, w: 3.1, h: 0.8, fontSize: 14, color: C.background1, margin: 0, valign: "top" });
  s.addText("10", { objectName: "Seeds value", isTextBox: true, x: 9.3, y: 5.0, w: 3.1, h: 0.8, fontSize: 54, bold: true, color: C.accent1, fontFace: "Cambria", margin: 0 });
  s.addText("seeded runs per instance", { objectName: "Seeds label", isTextBox: true, x: 9.3, y: 5.8, w: 3.1, h: 0.4, fontSize: 14, color: C.background1, margin: 0 });
  s.addNotes(`We implemented the model in Julia with JuMP and the open-source solver HiGHS.

Before any experiment we validated it on the subject's toy instance: 24 automated tests, and the MILP optimum equals brute-force enumeration of all segment paths, MLU 0.375 with waypoint v4.

We give HiGHS a MIP start: routing with no waypoints is always feasible and uses zero changes. Its MLU is the reference column no-wp in the tables.

Protocol: ten runs per instance, seeds 1 to 10, one thread each, time limit 30 minutes for period 0 and one hour for two periods. Gap is one minus lower bound over upper bound; CPU time is the optimize call only.

Everything ran on a shared server, i9-14900K with 125 GB of RAM, through a job queue that only starts a job when its measured memory fits.`);

  // ===== 6. Results period 0 =====
  pres.addSection({ title: "Results" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("Results — period 0 (averages over 10 runs)", { placeholder: "title" });
  resultsTable(s, P0, "13, 16–20: model too large to build in 125 GB (79.6M – 957.6M variables)", 1.35, 12);
  s.addText("Green MLU = waypoints beat the no-waypoint routing. Time limit 1800 s.", { objectName: "Table caption", isTextBox: true, x: 0.6, y: 6.55, w: 12.1, h: 0.3, fontSize: 11, italic: true, color: C.text2, margin: 0 });
  s.addNotes(`Period 0, averaged over ten runs. Columns: instance size, number of variables, number of proved optima, average MLU, the no-waypoint MLU for reference, gap, time and branch-and-bound nodes. Green MLU values are where waypoints beat plain shortest-path routing.

Read it top to bottom: small instances are solved, medium ones partly, large ones only return the MIP start, and the last ones are too large to build. The next slide explains each group.`);

  // ===== 7. Period 0 observations =====
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("Period 0 — observations", { placeholder: "title" });
  s.addChart(pres.charts.BAR, [
    { name: "MILP (avg of 10)", labels: P0.slice(0, 9).map((r) => r[0]), values: P0.slice(0, 9).map((r) => +r[6]) },
    { name: "No waypoint", labels: P0.slice(0, 9).map((r) => r[0]), values: P0.slice(0, 9).map((r) => +r[7]) },
  ], {
    objectName: "MLU chart", x: 0.6, y: 1.35, w: 5.6, h: 5.4, barDir: "col", barGrouping: "clustered", barGapWidthPct: 60,
    chartColors: [H.accent1, H.accent4], showLegend: true, legendPos: "b", legendFontSize: 12, legendFontFace: "+mn-lt",
    showTitle: true, title: "MLU, instances 01–09", titleFontSize: 14, titleColor: H.dk1, titleFontFace: "+mn-lt",
    catAxisLabelColor: H.dk2, valAxisLabelColor: H.dk2, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11,
    catAxisLabelFontFace: "+mn-lt", valAxisLabelFontFace: "+mn-lt",
    valAxisMinVal: 0, valAxisMaxVal: 1.1, valAxisLabelFormatCode: "0.0",
    valGridLine: { color: "E1E3E7", size: 0.5 }, catGridLine: { style: "none" },
  });
  bullets(s, [
    "**01–03: **optimal at the root node in seconds; MLU 1.00 → 0.93, 0.55, 0.94",
    "**04–05: **no proof in 30 min, all time in the root node. Strong seed effect: on 05, 4/10 seeds prove 0.1155; on 04 only 1/10 improves the MIP start → average over 10 seeds",
    "**06–12: **millions of binaries, LP relaxation takes most of the time. 08: 1 seed proves 0.319, 3 stop at 0.561, 6 keep 1.000. 10–12, 14, 15: MIP start, no lower bound (gap 100%)",
    "**Time limit: **HiGHS can overrun it, up to 51 940 s for an 1800 s limit (08)",
    "**13–20: **up to 9.6 · 10⁸ binaries; ≈ 2 GB per million variables → only 14, 15 fit in 125 GB",
  ], { box: { x: 6.6, y: 1.4, w: 6.1, h: 5.4, fontSize: 15 }, gap: 9 });
  s.addNotes(`Instances 1 to 3 are solved to optimality at the root node in seconds. Waypoints reduce the MLU from 1.00 to 0.93, 0.55 and 0.94; instance 2 shows the strongest gain. (The chart compares our average MLU with the no-waypoint MLU for instances 1 to 9.)

Instances 4 and 5 are not proved within 30 minutes; all the time is spent in the root node. The seed matters a lot: on instance 5, four of ten seeds prove the optimum 0.1155; on instance 4 only one seed improves the MIP start. That is why we average over ten seeds.

From instance 6 on there are millions of binaries. The LP relaxation takes most of the time and usually the MIP start is returned. On instance 8 one seed proves 0.319, three stop at 0.561 and six keep 1.0. Instances 10 to 12, 14 and 15 all stop with the MIP start and no lower bound.

HiGHS does not always respect the time limit: one run on instance 8 took 51,940 seconds for an 1,800-second limit. We report measured times as they are.

Instances 13 and 16 to 20 need up to 960 million binaries. At about 2 GB per million variables, only 14 and 15 fit in 125 GB.`);

  // ===== 8. Results periods 0+1 =====
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("Results — periods 0 and 1 (budget, presolve off)", { placeholder: "title" });
  resultsTable(s, P01, "07: ≈ 88 GB, can only run alone (not in this record).  10–20: model too large to build (47.8M – 2872.8M variables)", 1.35, 13);
  s.addText("Time limit 3600 s. Rows with fewer than 10 runs (06, 08, 09) were cut by time and memory limits; the report states this.", { objectName: "Table caption", isTextBox: true, x: 0.6, y: 4.4, w: 12.1, h: 0.5, fontSize: 12, italic: true, color: C.text2, margin: 0 });
  stat(s, "Inst 02", 0.6, 5.1, 3.8, "1.098 → 0.942", "instance 02: link down congests the network; waypoints bring average MLU below 1", C.accent5);
  stat(s, "Seeds", 4.9, 5.1, 3.6, "7/10", "seeds prove the optimum 0.903 on 02 (2/10 with presolve on)", C.accent1);
  stat(s, "Vars", 9.0, 5.1, 3.7, "× 3", "variables vs. period 0: two copies of x plus y", C.accent4);
  s.addNotes(`The two-period experiment with the change budget, run with presolve off; the next slide explains why.

Look at instance 2: when the link goes down, plain shortest-path routing has MLU 1.098, so the network is congested. With waypoints the average MLU is 0.942, and seven of ten seeds prove the optimum 0.903.

Rows with fewer than ten runs, and rows marked too large, come from time and memory limits, which the report states explicitly. Instance 7 needs about 88 GB in this model, so it can only run alone.`);

  // ===== 9. Two periods observations =====
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Results" });
  s.addText("Two periods — observations", { placeholder: "title" });
  // left: presolve stall story as three steps
  const steps = [
    ["Symptom", "HiGHS defaults: instance 04 stayed in presolve > 3 h for a 1 h limit"],
    ["Ablation (60 s limit)", "remove constraint (4) or turn presolve off → the limit is respected"],
    ["Decision", "the dense budget row blocks presolve → all two-period runs use presolve off"],
  ];
  s.addText("Presolve stall", { objectName: "Stall heading", isTextBox: true, x: 0.6, y: 1.4, w: 6, h: 0.4, fontSize: 18, bold: true, color: C.accent1, margin: 0 });
  steps.forEach(([h, t], i) => {
    const y = 1.95 + i * 1.6;
    card(s, "Step card " + (i + 1), 0.6, y, 6.0, 1.3);
    s.addShape(pres.shapes.OVAL, { objectName: "Step number circle " + (i + 1), x: 0.8, y: y + 0.375, w: 0.55, h: 0.55, fill: { color: C.accent1 }, line: { type: "none" } });
    s.addText(String(i + 1), { objectName: "Step number " + (i + 1), isTextBox: true, x: 0.8, y: y + 0.375, w: 0.55, h: 0.55, fontSize: 16, bold: true, color: C.background1, align: "center", valign: "middle", margin: 0 });
    s.addText([{ text: h, options: { bold: true, breakLine: true, fontSize: 15, color: C.text1 } }, { text: t, options: { fontSize: 14, color: C.text2 } }],
      { objectName: "Step text " + (i + 1), isTextBox: true, x: 1.55, y: y + 0.1, w: 4.9, h: 1.1, margin: 0, valign: "middle" });
  });
  bullets(s, [
    "**Instance 02: **the failed link makes the no-waypoint MLU 1.098 (congestion); optimum 0.903 proved by 7/10 seeds with presolve off vs. 2/10 with presolve on",
    "**Instance 05: **2/10 seeds find 0.323 (no-wp 1.000); the others keep the MIP start",
    "**Price of presolve off: **memory grows to 3.7–5.5 GB per million variables → model of 07 (≈ 88 GB) only alone; 10–20 cannot be built",
  ], { box: { x: 7.0, y: 1.45, w: 5.7, h: 5.3, fontSize: 16 }, gap: 14 });
  s.addNotes(`With two periods the model has about three times more variables: two copies of x plus y.

First problem: a presolve stall. With default settings, instance 4 stayed in presolve more than three hours with a one-hour limit. A small ablation with a 60-second limit showed that removing the budget constraint, or turning presolve off, each made the limit respected. So the dense budget row blocks presolve, and all two-period runs use presolve off.

Instance 2 is the interesting case: the link failure makes the no-waypoint MLU 1.098, so the network is congested. The optimum 0.903 is proved by seven of ten seeds with presolve off, against two of ten with presolve on.

On instance 5, two seeds find 0.323 against 1.0 without waypoints; the others keep the MIP start.

The price of presolve off is memory: 3.7 to 5.5 GB per million variables. The two-period model of instance 7 needs about 88 GB, so it can only run alone, and instances 10 to 20 cannot be built.`);

  // ===== 10. Trial and error =====
  pres.addSection({ title: "Wrap-up" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Wrap-up" });
  s.addText("Experimental process: trial and error", { placeholder: "title" });
  const te = [
    ["Toy: r = 1/3, subject says 1/2", "path counting ≠ per-node ECMP", "keep the course definition"],
    ["04: no feasible solution in 300 s", "stuck in the root node", "no-waypoint MIP start"],
    ["Laptop 24 GB too small", "measured ≈ 2–3 GB per million variables", "125 GB server + memory-aware queue"],
    ["Two-period build took 5428 s", "sum over a JuMP array is quadratic", "generator form: 1.4 s"],
    ["optimize! > 3 h with a 1 h limit", "ablation: presolve × budget row", "presolve off for two periods"],
    ["Runs far beyond the time limit", "HiGHS checks the limit between steps (likely)", "report measured time; reorder queue"],
  ];
  const teHead = ["Symptom", "Diagnosis", "Fix / consequence"].map((t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text1 } } }));
  s.addTable([teHead, ...te.map((r, i) => r.map((v, k) => ({ text: v, options: { fill: { color: i % 2 ? C.background2 : C.background1 }, color: k === 2 ? C.accent2 : C.text1, bold: k === 2 } })))], {
    x: 0.6, y: 1.35, w: 12.1, colW: [4.0, 4.2, 3.9], fontSize: 14, fontFace: "Calibri", rowH: 0.48, margin: [0, 0.1, 0, 0.1], valign: "middle",
    border: { type: "solid", pt: 0.5, color: H.lt2 },
  });
  card(s, "Lessons card", 0.6, 5.0, 12.1, 1.7, C.text1);
  s.addText([
    { text: "Lessons", options: { bold: true, color: C.accent1, breakLine: true, fontSize: 18 } },
    { text: "Validate on a toy instance against brute force first.  ·  Solver settings are part of the protocol.  ·  For exact MILPs of this size, memory is the first limit, before time.", options: { color: C.background1, fontSize: 16 } },
  ], { objectName: "Lessons text", isTextBox: true, x: 0.9, y: 5.1, w: 11.5, h: 1.5, margin: 0, valign: "middle" });
  s.addNotes(`Since the grading is on scientific method, we logged every problem. The main ones:

The toy split ratio disagreed with the subject: path counting versus ECMP; we kept the course definition.

Instance 4 found no feasible solution in 300 seconds, stuck in the root node: we added the no-waypoint MIP start.

The laptop's 24 GB was too small: we measured memory per million variables, moved to the 125 GB server and wrote a memory-aware queue.

Building the two-period model took 5,428 seconds because sum over a JuMP array is quadratic; the generator form takes 1.4 seconds.

Then the presolve stall, and the runs far beyond the time limit, which we report as measured.

Lessons: validate on a toy instance against brute force first; solver settings are part of the protocol; and for exact MILPs of this size, memory is the first limit, before time.`);

  // ===== 11. Conclusion =====
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Wrap-up" });
  s.addText("Conclusion", { placeholder: "title" });
  stat(s, "Gain", 0.6, 1.4, 3.8, "1.00 → 0.55", "MLU on instance 02 (period 0), proved optimal", C.accent5);
  stat(s, "Million", 4.8, 1.4, 3.8, "≈ 10⁶", "binaries: beyond this the solver rarely improves the MIP start", C.accent1);
  stat(s, "Build", 9.0, 1.4, 3.7, "≈ 6 · 10⁷", "variables (period 0): beyond this the model cannot be built in 125 GB", C.accent6);
  bullets(s, [
    "Compact MILP for T-ASR (segment variables, path-counting split ratios), validated against brute force",
    "Exact solving works for small instances and shows large MLU reductions",
    "**Next steps: **restrict candidate waypoints, column generation on segment paths, full lexicographic objective",
  ], { box: { x: 0.6, y: 3.3, w: 12.1, h: 2.0, fontSize: 17 }, gap: 10 });
  card(s, "Thanks card", 0.6, 5.55, 12.1, 1.15, C.accent1);
  s.addText("Thank you — questions?", { objectName: "Thanks", isTextBox: true, x: 0.6, y: 5.55, w: 12.1, h: 1.15, fontSize: 30, bold: true, color: C.background1, align: "center", valign: "middle", fontFace: "Cambria", margin: 0 });
  s.addNotes(`To conclude: we built a compact MILP for T-adaptive segment routing, with segment variables and path-counting split ratios, validated against brute force.

Exact solving works for small instances and gives large MLU reductions, for example 1.00 to 0.55 on instance 2.

Beyond about one million binaries the solver rarely improves the MIP start within the time limit; beyond about 60 million variables in period 0 the model cannot even be built in 125 GB.

Next steps: restrict the candidate waypoints, column generation on segment paths, and the full lexicographic objective.

Thank you; we are happy to take questions.`);

  // ===== 12. Backup =====
  pres.addSection({ title: "Backup" });
  s = pres.addSlide({ masterName: "CONTENT", sectionTitle: "Backup" });
  s.addText("Backup — periods 0 and 1 with presolve on", { placeholder: "title" });
  resultsTable(s, P01ON, "Only instances 01–03 were run with presolve on; on 04 presolve stalled for more than 3 h", 1.35, 14);
  stat(s, "On", 0.6, 3.3, 3.8, "2/10", "optimal on 02 with presolve on", C.accent4);
  stat(s, "Off", 4.8, 3.3, 3.8, "7/10", "optimal on 02 with presolve off", C.accent1);
  s.addNotes("Backup, only for questions: two-period results with HiGHS presolve on, small instances. Compare instance 2: two of ten optimal with presolve on versus seven of ten with presolve off.");

  await pres.writeFile({ fileName: OUT });
  // pptxgenjs repeats <a:pPr> before every run of a multi-run bulleted paragraph; keep only the first.
  const fs = require("fs");
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(fs.readFileSync(OUT));
  for (const name of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
    const xml = await zip.file(name).async("string");
    const fixed = xml.replace(/(<\/a:r>)(<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>.*?<\/a:pPr>)/g, "$1");
    if (fixed !== xml) zip.file(name, fixed);
  }
  fs.writeFileSync(OUT, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  if (applyTheme) await applyTheme(OUT, THEME);
  else console.warn("SKILL_DIR not set: theme colours not applied");
  console.log("wrote", OUT);
})();
