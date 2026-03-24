(function () {
  "use strict";

  var MAX_EDGE = 1024;
  var ANALYSIS_MAX_EDGE = 256;
  var MIN_COLORS = 2;
  var MAX_COLORS = 8;
  var DEFAULT_COLORS = 4;
  var DEBOUNCE_MS = 320;
  var MASK_TRACE_DEBOUNCE_MS = 420;
  var PRINT_SAFE_PREVIEW_DEBOUNCE_MS = 150;

  var fileInput = document.getElementById("fileInput");
  var dropzone = document.getElementById("dropzone");
  var colorCount = document.getElementById("colorCount");
  var colorCountOut = document.getElementById("colorCountOut");
  var scaleNote = document.getElementById("scaleNote");
  var errorBox = document.getElementById("errorBox");
  var statusBox = document.getElementById("statusBox");
  var btnDownloadSvg = document.getElementById("btnDownloadSvg");
  var btnDownloadZip = document.getElementById("btnDownloadZip");
  var btnDownloadBambu3mf = document.getElementById("btnDownloadBambu3mf");
  var btn3dPrintSelected = document.getElementById("btn3dPrintSelected");
  var bambu3mfPanel = document.getElementById("bambu3mfPanel");
  var bambuCylinderDiamMm = document.getElementById("bambuCylinderDiamMm");
  var bambuCylinderHeightMm = document.getElementById("bambuCylinderHeightMm");
  var bambuPlateCenterXMm = document.getElementById("bambuPlateCenterXMm");
  var bambuPlateCenterYMm = document.getElementById("bambuPlateCenterYMm");
  var bambuEmbossDepthMm = document.getElementById("bambuEmbossDepthMm");
  var originalStageHost = document.getElementById("originalStageHost");
  var svgHost = document.getElementById("svgHost");
  var colorsEmpty = document.getElementById("colorsEmpty");
  var colorsGrid = document.getElementById("colorsGrid");
  var colorsHint = document.getElementById("colorsHint");
  var colorsToolbar = document.getElementById("colorsToolbar");
  var btnMergeColors = document.getElementById("btnMergeColors");
  var btnClearColorSelection = document.getElementById("btnClearColorSelection");
  var maskToolbar = document.getElementById("maskToolbar");
  var maskHelp = document.getElementById("maskHelp");
  var maskHelpBody = document.getElementById("maskHelpBody");
  var maskHelpBtn = document.getElementById("maskHelpBtn");
  var sourcePreviewToolbox = document.getElementById("sourcePreviewToolbox");
  var btnToggleMaskEdit = document.getElementById("btnToggleMaskEdit");
  var maskTool = document.getElementById("maskTool");
  var brushSize = document.getElementById("brushSize");
  var brushSizeOut = document.getElementById("brushSizeOut");
  var btnClearMask = document.getElementById("btnClearMask");
  var registrationMarksEnabled = document.getElementById("registrationMarksEnabled");
  var printSafeEnabled = document.getElementById("printSafeEnabled");
  var printSafeFields = document.getElementById("printSafeFields");
  var printSafeWidthMm = document.getElementById("printSafeWidthMm");
  var printSafeNozzleMm = document.getElementById("printSafeNozzleMm");
  var layerLightbox = document.getElementById("layerLightbox");
  var layerLightboxInner = document.getElementById("layerLightboxInner");
  var layerLightboxClose = layerLightbox
    ? layerLightbox.querySelector(".layer-lightbox-close")
    : null;
  var layerLightboxBackdrop = layerLightbox
    ? layerLightbox.querySelector(".layer-lightbox-backdrop")
    : null;
  var paletteSwatches = document.getElementById("paletteSwatches");
  var btnPaletteResample = document.getElementById("btnPaletteResample");

  var objectUrl = null;
  var loadedImage = null;
  var scaledForTrace = null;
  var lastCombinedSvg = "";
  var lastLayers = [];
  var lastBaseName = "trace";
  var suppressColorInput = false;
  /** @type {Set<string>} normalized #rrggbb */
  var selectedHexes = new Set();
  /** @type {string[]} normalized #rrggbb, length matches color count */
  var pickedPalette = [];
  var selectedPaletteIndex = 0;
  var samplingFromImage = false;
  var maskEditActive = false;
  /** Snapshot of the first scaled trace raster (clone); palette swatches are sampled from this. */
  var sourceTraceImageData = null;

  var maskCanvas = null;
  var maskCtx = null;
  var overlayCanvas = null;
  var overlayCtx = null;
  var isPainting = false;
  var lastPaintX = 0;
  var lastPaintY = 0;

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(null, args);
      }, ms);
    };
  }

  function setError(msg) {
    if (msg) {
      errorBox.textContent = msg;
      errorBox.hidden = false;
    } else {
      errorBox.hidden = true;
      errorBox.textContent = "";
    }
  }

  function drawToImageData(img, maxEdge) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var scale = Math.min(1, maxEdge / Math.max(w, h));
    var tw = Math.max(1, Math.round(w * scale));
    var th = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, tw, th);
    return {
      canvas: canvas,
      imageData: ctx.getImageData(0, 0, tw, th),
      scaled: scale < 1,
      tw: tw,
      th: th,
    };
  }

  function suggestColorCount(imageData) {
    var data = imageData.data;
    var map = new Map();
    var counted = 0;
    for (var i = 0; i < data.length; i += 4) {
      var a = data[i + 3];
      if (a < 40) continue;
      var r = data[i] >> 4;
      var g = data[i + 1] >> 4;
      var b = data[i + 2] >> 4;
      var key = (r << 8) | (g << 4) | b;
      map.set(key, (map.get(key) || 0) + 1);
      counted++;
    }
    if (counted === 0) return DEFAULT_COLORS;
    var total = counted;
    var bins = Array.from(map.entries()).sort(function (a, b) {
      return b[1] - a[1];
    });
    var cum = 0;
    var n = 0;
    for (var j = 0; j < bins.length; j++) {
      cum += bins[j][1];
      n++;
      if (cum / total >= 0.93) break;
    }
    n = Math.max(MIN_COLORS, Math.min(MAX_COLORS, n));
    if (n >= 5 && n <= 7) {
      var cum4 = 0;
      for (var k = 0; k < Math.min(4, bins.length); k++) {
        cum4 += bins[k][1];
      }
      if (cum4 / total >= 0.84) n = 4;
    }
    return n;
  }

  var MASK_ALPHA_EXCLUDE = 48;

  /**
   * 8-connected components of excluded (masked) pixels.
   * labels[idx]: -1 = not excluded, 0 = excluded but unassigned (internal use), 1..K = component id.
   */
  function labelExclusionComponents(maskData, w, h, thresh) {
    var wh = w * h;
    var labels = new Int32Array(wh);
    for (var idx = 0; idx < wh; idx++) {
      var i = idx * 4;
      labels[idx] = maskData[i + 3] > thresh ? 0 : -1;
    }
    var nextId = 0;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = y * w + x;
        if (labels[idx] !== 0) continue;
        nextId++;
        var queue = [idx];
        labels[idx] = nextId;
        for (var head = 0; head < queue.length; head++) {
          var cur = queue[head];
          var cx = cur % w;
          var cy = (cur / w) | 0;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              var nx = cx + dx;
              var ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              var nidx = ny * w + nx;
              if (labels[nidx] !== 0) continue;
              labels[nidx] = nextId;
              queue.push(nidx);
            }
          }
        }
      }
    }
    return { labels: labels, count: nextId };
  }

  /**
   * Per-component mean RGB of unmasked 8-neighbors (each outsider pixel counted once per component).
   */
  function buildComponentBoundaryFills(srcData, labels, w, h, numComp) {
    var fills = new Array(numComp + 1);
    fills[0] = null;
    var seen = new Uint8Array(w * h);
    for (var c = 1; c <= numComp; c++) {
      for (var s = 0; s < seen.length; s++) seen[s] = 0;
      var rs = [];
      var gs = [];
      var bs = [];
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var idx = y * w + x;
          if (labels[idx] !== c) continue;
          for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              var nx = x + dx;
              var ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              var nidx = ny * w + nx;
              if (labels[nidx] !== -1) continue;
              if (seen[nidx]) continue;
              seen[nidx] = 1;
              var j = nidx * 4;
              rs.push(srcData[j]);
              gs.push(srcData[j + 1]);
              bs.push(srcData[j + 2]);
            }
          }
        }
      }
      if (!rs.length) {
        fills[c] = { r: 120, g: 120, b: 130 };
      } else {
        var sumR = 0;
        var sumG = 0;
        var sumB = 0;
        for (var k = 0; k < rs.length; k++) {
          sumR += rs[k];
          sumG += gs[k];
          sumB += bs[k];
        }
        var n = rs.length;
        fills[c] = {
          r: Math.round(sumR / n),
          g: Math.round(sumG / n),
          b: Math.round(sumB / n),
        };
      }
    }
    return fills;
  }

  function computeExclusionInpaintPlan(srcData, maskData, w, h) {
    var labeled = labelExclusionComponents(maskData, w, h, MASK_ALPHA_EXCLUDE);
    if (labeled.count === 0) return null;
    return {
      labels: labeled.labels,
      fills: buildComponentBoundaryFills(srcData, labeled.labels, w, h, labeled.count),
    };
  }

  function maskHasExclude() {
    if (!maskCtx || !maskCanvas) return false;
    var id = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    var p = id.data;
    for (var i = 3; i < p.length; i += 4) {
      if (p[i] > MASK_ALPHA_EXCLUDE) return true;
    }
    return false;
  }

  function rgbToHex(r, g, b) {
    function c(v) {
      var x = Math.max(0, Math.min(255, Math.round(v)));
      return x.toString(16).padStart(2, "0");
    }
    return ("#" + c(r) + c(g) + c(b)).toLowerCase();
  }

  function normalizeHexFromString(hex) {
    var s = String(hex).trim();
    if (!s) return "";
    if (s[0] !== "#") s = "#" + s;
    s = s.toLowerCase();
    if (s.length === 4 && /^#[0-9a-f]{3}$/.test(s)) {
      return ("#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    }
    if (s.length === 7 && /^#[0-9a-f]{6}$/.test(s)) return s;
    return "";
  }

  function srgbChannelToLinear(u) {
    u /= 255;
    return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  }

  function rgbToLab(r, g, b) {
    var R = srgbChannelToLinear(r);
    var G = srgbChannelToLinear(g);
    var B = srgbChannelToLinear(b);
    var X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
    var Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
    var Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
    var Xn = 0.95047;
    var Yn = 1.0;
    var Zn = 1.08883;
    var xr = X / Xn;
    var yr = Y / Yn;
    var zr = Z / Zn;
    function f(t) {
      return t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116;
    }
    var fx = f(xr);
    var fy = f(yr);
    var fz = f(zr);
    return {
      L: 116 * fy - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz),
    };
  }

  function labDistSq(A, B) {
    var dL = A.L - B.L;
    var da = A.a - B.a;
    var db = A.b - B.b;
    return dL * dL + da * da + db * db;
  }

  /**
   * Bucketed samples from the first scaled raster (opaque pixels only).
   */
  function collectRepresentativeSampleColors(imgd) {
    var w = imgd.width;
    var h = imgd.height;
    var d = imgd.data;
    var stepX = Math.max(1, Math.floor(w / 32));
    var stepY = Math.max(1, Math.floor(h / 32));
    /** @type {Map<number, {rs:number,gs:number,bs:number,n:number}>} */
    var buckets = new Map();
    for (var y = 0; y < h; y += stepY) {
      for (var x = 0; x < w; x += stepX) {
        var yy = Math.min(h - 1, y);
        var xx = Math.min(w - 1, x);
        var idx = (yy * w + xx) * 4;
        if (d[idx + 3] < 14) continue;
        var r = d[idx];
        var g = d[idx + 1];
        var b = d[idx + 2];
        var key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        var ent = buckets.get(key);
        if (!ent) {
          buckets.set(key, { rs: r, gs: g, bs: b, n: 1 });
        } else {
          ent.rs += r;
          ent.gs += g;
          ent.bs += b;
          ent.n++;
        }
      }
    }
    var out = [];
    buckets.forEach(function (ent) {
      out.push({
        r: Math.round(ent.rs / ent.n),
        g: Math.round(ent.gs / ent.n),
        b: Math.round(ent.bs / ent.n),
      });
    });
    return out;
  }

  /**
   * Pick n colors from candidates that maximize spread (greedy farthest-in-min-distance in CIELAB).
   */
  function selectHighContrastPalette(candidatesRgb, n) {
    if (!candidatesRgb.length || n < 1) return [];
    if (candidatesRgb.length === 1) {
      var u = candidatesRgb[0];
      var hx = rgbToHex(u.r, u.g, u.b);
      var pad = [];
      for (var p = 0; p < n; p++) pad.push(hx);
      return pad;
    }
    var labs = [];
    for (var i = 0; i < candidatesRgb.length; i++) {
      var c = candidatesRgb[i];
      labs.push(rgbToLab(c.r, c.g, c.b));
    }
    var chosenIdx = [];
    if (n === 1) {
      var sumL = 0;
      var suma = 0;
      var sumb = 0;
      for (var j = 0; j < labs.length; j++) {
        sumL += labs[j].L;
        suma += labs[j].a;
        sumb += labs[j].b;
      }
      var nlab = labs.length;
      var cL = sumL / nlab;
      var ca = suma / nlab;
      var cb = sumb / nlab;
      var bestI = 0;
      var bestD = -1;
      for (var k = 0; k < labs.length; k++) {
        var dk = labDistSq(labs[k], { L: cL, a: ca, b: cb });
        if (dk > bestD) {
          bestD = dk;
          bestI = k;
        }
      }
      chosenIdx.push(bestI);
    } else {
      var maxPair = -1;
      var i0 = 0;
      var j0 = 1;
      for (var a = 0; a < labs.length; a++) {
        for (var b = a + 1; b < labs.length; b++) {
          var ds = labDistSq(labs[a], labs[b]);
          if (ds > maxPair) {
            maxPair = ds;
            i0 = a;
            j0 = b;
          }
        }
      }
      chosenIdx.push(i0, j0);
      var used = new Set(chosenIdx);
      while (chosenIdx.length < n) {
        var bestIdx = -1;
        var bestMinDist = -1;
        for (var cidx = 0; cidx < candidatesRgb.length; cidx++) {
          if (used.has(cidx)) continue;
          var minD = Infinity;
          for (var s = 0; s < chosenIdx.length; s++) {
            var ds2 = labDistSq(labs[cidx], labs[chosenIdx[s]]);
            if (ds2 < minD) minD = ds2;
          }
          if (minD > bestMinDist) {
            bestMinDist = minD;
            bestIdx = cidx;
          }
        }
        if (bestIdx < 0) break;
        chosenIdx.push(bestIdx);
        used.add(bestIdx);
      }
      var alt = 0;
      while (chosenIdx.length < n) {
        chosenIdx.push(chosenIdx[alt % chosenIdx.length]);
        alt++;
      }
    }
    var outHex = [];
    for (var t = 0; t < n; t++) {
      var rgb = candidatesRgb[chosenIdx[t]];
      outHex.push(rgbToHex(rgb.r, rgb.g, rgb.b));
    }
    return outHex;
  }

  function extractPaletteFromImageData(imgd, n) {
    if (!imgd || !imgd.data || n < 1) return [];
    var candidates = collectRepresentativeSampleColors(imgd);
    if (!candidates.length) {
      var out = [];
      for (var f = 0; f < n; f++) out.push("#6a6a6a");
      return out;
    }
    return selectHighContrastPalette(candidates, n);
  }

  function syncPaletteFromSourceImage(n) {
    n = Math.max(MIN_COLORS, Math.min(MAX_COLORS, n));
    if (sourceTraceImageData) {
      pickedPalette = extractPaletteFromImageData(sourceTraceImageData, n);
    } else {
      pickedPalette = [];
      for (var p = 0; p < n; p++) {
        pickedPalette.push("#5c6570");
      }
    }
    if (selectedPaletteIndex >= n) {
      selectedPaletteIndex = n - 1;
    }
    if (selectedPaletteIndex < 0) {
      selectedPaletteIndex = 0;
    }
  }

  function clearPaletteSamplingMode() {
    samplingFromImage = false;
    if (overlayCanvas) overlayCanvas.classList.remove("sampling-palette");
    syncOverlayPaintCursor();
  }

  function syncOverlayPaintCursor() {
    if (!overlayCanvas) return;
    overlayCanvas.classList.toggle("mask-layer--paint-ready", maskEditActive);
  }

  function renderPaletteSwatches() {
    if (!paletteSwatches) return;
    paletteSwatches.innerHTML = "";
    for (var i = 0; i < pickedPalette.length; i++) {
      (function (idx) {
        var btn = document.createElement("button");
        btn.type = "button";
        var armed = samplingFromImage && selectedPaletteIndex === idx;
        btn.className =
          "palette-swatch" +
          (idx === selectedPaletteIndex ? " selected" : "") +
          (armed ? " palette-swatch--armed" : "");
        btn.style.background = pickedPalette[idx];
        btn.setAttribute("role", "listitem");
        btn.setAttribute(
          "aria-label",
          "Palette color " + (idx + 1) + " " + pickedPalette[idx] + ", click then click preview to pick from image"
        );
        btn.setAttribute("aria-pressed", idx === selectedPaletteIndex ? "true" : "false");
        btn.addEventListener("click", function () {
          if (samplingFromImage && selectedPaletteIndex === idx) {
            clearPaletteSamplingMode();
            statusBox.textContent = "Pick-from-image cancelled.";
            renderPaletteSwatches();
            return;
          }
          selectedPaletteIndex = idx;
          if (scaledForTrace && overlayCanvas) {
            samplingFromImage = true;
            overlayCanvas.classList.add("sampling-palette");
            statusBox.textContent = "Click the preview image to set this swatch…";
          } else {
            clearPaletteSamplingMode();
            statusBox.textContent = "Load an image to pick colors from the preview.";
          }
          renderPaletteSwatches();
        });
        paletteSwatches.appendChild(btn);
      })(i);
    }
  }

  function setPickedSwatchHex(hex) {
    var norm = normalizeHexFromString(hex);
    if (!norm) return;
    if (selectedPaletteIndex < 0 || selectedPaletteIndex >= pickedPalette.length) return;
    pickedPalette[selectedPaletteIndex] = norm;
    renderPaletteSwatches();
    debouncedTrace();
  }

  function sampleColorFromImageAtClient(clientX, clientY) {
    if (!scaledForTrace || !scaledForTrace.canvas) return;
    var canvas = scaledForTrace.canvas;
    var rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    var x = Math.floor((clientX - rect.left) * (canvas.width / rect.width));
    var y = Math.floor((clientY - rect.top) * (canvas.height / rect.height));
    x = Math.max(0, Math.min(canvas.width - 1, x));
    y = Math.max(0, Math.min(canvas.height - 1, y));
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var p = ctx.getImageData(x, y, 1, 1).data;
    setPickedSwatchHex(rgbToHex(p[0], p[1], p[2]));
  }

  function resetPaletteFromSourceImage() {
    clearPaletteSamplingMode();
    var n = parseInt(colorCount.value, 10);
    if (isNaN(n)) n = DEFAULT_COLORS;
    n = Math.max(MIN_COLORS, Math.min(MAX_COLORS, n));
    syncPaletteFromSourceImage(n);
    renderPaletteSwatches();
    debouncedTrace();
    statusBox.textContent = sourceTraceImageData
      ? "Palette re-sampled from image."
      : "Load an image to sample the trace palette.";
  }

  /**
   * ImageTracer: options.pal uses fixed colors; colorquantcycles must be 1 or k-means overwrites pal.
   */
  function buildTracerOptions(n) {
    var opts = {
      numberofcolors: n,
      colorsampling: 0,
      colorquantcycles: 3,
      blurradius: 3,
      blurdelta: 32,
      strokewidth: 0,
      pathomit: 8,
      rightangleenhance: true,
      ltres: 1,
      qtres: 1,
      roundcoords: 1,
      viewbox: true,
      linefilter: false,
      layering: 0,
      lcpr: 0,
      qcpr: 0,
    };
    if (pickedPalette.length === n && pickedPalette.length >= MIN_COLORS) {
      opts.colorquantcycles = 1;
      opts.pal = [];
      for (var i = 0; i < n; i++) {
        var rgb = hexToRgb(pickedPalette[i] || "#808080");
        opts.pal.push({ r: rgb.r, g: rgb.g, b: rgb.b, a: 255 });
      }
    }
    return opts;
  }

  function rgbStringToHex(s) {
    var m = String(s).match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (!m) return null;
    function to2(x) {
      var n = Number(x);
      return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
    }
    return ("#" + to2(m[1]) + to2(m[2]) + to2(m[3])).toLowerCase();
  }

  function normalizeFillKey(fillAttr) {
    if (!fillAttr) return "";
    var hex = rgbStringToHex(fillAttr);
    if (hex) return hex;
    var f = fillAttr.trim().toLowerCase();
    if (f[0] === "#" && f.length === 4) {
      return ("#" + f[1] + f[1] + f[2] + f[2] + f[3] + f[3]).toLowerCase();
    }
    if (f[0] === "#") return f;
    return f;
  }

  function parseViewBoxNumbers(viewBoxAttr) {
    if (!viewBoxAttr || typeof viewBoxAttr !== "string") return null;
    var parts = viewBoxAttr
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(parseFloat);
    if (parts.length < 4 || parts.some(isNaN)) return null;
    var vbW = parts[2];
    var vbH = parts[3];
    if (!(vbW > 0) || !(vbH > 0)) return null;
    return { minX: parts[0], minY: parts[1], w: vbW, h: vbH };
  }

  /**
   * Sets root width/height in mm from viewBox and clamps path stroke-width to at least nozzle size in user units.
   */
  function apply3dPrintSafeSvg(svgString, widthMm, nozzleMm) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(svgString, "image/svg+xml");
    if (doc.querySelector("parsererror")) return svgString;
    var svg = doc.querySelector("svg");
    if (!svg) return svgString;

    var vb = parseViewBoxNumbers(svg.getAttribute("viewBox"));
    if (!vb) {
      var wEl = parseFloat(svg.getAttribute("width"));
      var hEl = parseFloat(svg.getAttribute("height"));
      if (wEl > 0 && hEl > 0 && !isNaN(wEl) && !isNaN(hEl)) {
        vb = { minX: 0, minY: 0, w: wEl, h: hEl };
        svg.setAttribute("viewBox", "0 0 " + wEl + " " + hEl);
      } else {
        return svgString;
      }
    }

    var vbW = vb.w;
    var vbH = vb.h;
    var heightMm = (widthMm * vbH) / vbW;

    svg.setAttribute("width", Math.round(widthMm * 1000) / 1000 + "mm");
    svg.setAttribute("height", Math.round(heightMm * 1000) / 1000 + "mm");

    var minStrokeUser = (nozzleMm * vbW) / widthMm;
    var paths = svg.querySelectorAll("path");
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      var swAttr = p.getAttribute("stroke-width");
      var sw = 0;
      if (swAttr !== null && swAttr !== "") {
        sw = parseFloat(String(swAttr).replace(/[a-z%]+/gi, "").trim()) || 0;
      }
      var nextSw = sw > minStrokeUser ? sw : minStrokeUser;
      p.setAttribute("stroke-width", String(Math.round(nextSw * 10000) / 10000));
      if (!p.getAttribute("stroke-linejoin")) {
        p.setAttribute("stroke-linejoin", "round");
      }
      if (!p.getAttribute("stroke-linecap")) {
        p.setAttribute("stroke-linecap", "round");
      }
    }

    return new XMLSerializer().serializeToString(svg);
  }

  function validatePrintSafeExport() {
    if (!printSafeEnabled.checked) {
      return { ok: true, apply: false, widthMm: 0, nozzleMm: 0, message: null };
    }
    var w = parseFloat(printSafeWidthMm.value);
    var n = parseFloat(printSafeNozzleMm.value);
    if (!(w > 0) || !(n > 0)) {
      return {
        ok: false,
        apply: false,
        widthMm: 0,
        nozzleMm: 0,
        message: "3D print safe: enter a positive width (mm) and min line / nozzle (mm).",
      };
    }
    return { ok: true, apply: true, widthMm: w, nozzleMm: n, message: null };
  }

  function prepareSvgForDownload(svgString) {
    var v = validatePrintSafeExport();
    if (!v.ok) return { ok: false, svg: svgString, message: v.message };
    if (!v.apply) return { ok: true, svg: svgString, message: null };
    return {
      ok: true,
      svg: apply3dPrintSafeSvg(svgString, v.widthMm, v.nozzleMm),
      message: null,
    };
  }

  /** Combined SVG string shown in the main preview (raw when print-safe off or invalid). */
  function getPreviewCombinedSvgString() {
    if (!lastCombinedSvg) return "";
    var v = validatePrintSafeExport();
    if (v.ok && v.apply) {
      return apply3dPrintSafeSvg(lastCombinedSvg, v.widthMm, v.nozzleMm);
    }
    return lastCombinedSvg;
  }

  /** Layer SVG for card mini-preview / lightbox (same rules as combined preview). */
  function getPreviewLayerSvgAt(index) {
    if (!lastLayers[index]) return "";
    var v = validatePrintSafeExport();
    if (v.ok && v.apply) {
      return apply3dPrintSafeSvg(lastLayers[index].svg, v.widthMm, v.nozzleMm);
    }
    return lastLayers[index].svg;
  }

  function refreshSvgPreviews() {
    if (!lastCombinedSvg) {
      svgHost.innerHTML = "";
      return;
    }
    renderCombinedSvg(getPreviewCombinedSvgString());
  }

  function openLayerLightbox(svgString) {
    if (!layerLightbox || !layerLightboxInner) return;
    layerLightboxInner.innerHTML = svgString;
    layerLightbox.hidden = false;
    document.body.classList.add("lightbox-open");
  }

  function closeLayerLightbox() {
    if (!layerLightbox || !layerLightboxInner) return;
    layerLightbox.hidden = true;
    layerLightboxInner.innerHTML = "";
    document.body.classList.remove("lightbox-open");
  }

  function hexToRgb(hex) {
    var h = String(hex).replace(/^#/, "");
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (h.length !== 6) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  function updateColorsPanelChrome() {
    var has = lastLayers.length > 0;
    colorsHint.hidden = !has;
    colorsToolbar.hidden = !has;
    updateMergeControls();
  }

  function hideBambuStudioPanel() {
    if (bambu3mfPanel) bambu3mfPanel.hidden = true;
    updateBambuExportControls();
  }

  /** Layer rows for colors currently selected in the grid (order matches card order). */
  function getSelectedLayersForBambu() {
    var out = [];
    for (var i = 0; i < lastLayers.length; i++) {
      if (selectedHexes.has(lastLayers[i].hex)) out.push(lastLayers[i]);
    }
    return out;
  }

  function updateBambuExportControls() {
    if (bambu3mfPanel && selectedHexes.size === 0) {
      bambu3mfPanel.hidden = true;
    }
    var panelOpen = bambu3mfPanel && !bambu3mfPanel.hidden;
    if (btn3dPrintSelected) {
      btn3dPrintSelected.disabled = lastLayers.length === 0 || selectedHexes.size < 1;
    }
    if (btnDownloadBambu3mf) {
      var nSel = getSelectedLayersForBambu().length;
      btnDownloadBambu3mf.disabled = !panelOpen || nSel === 0;
    }
  }

  function updateMergeControls() {
    btnMergeColors.disabled = selectedHexes.size < 2 || !lastCombinedSvg;
    btnClearColorSelection.disabled = selectedHexes.size === 0;
    updateBambuExportControls();
  }

  function clearColorSelection() {
    selectedHexes.clear();
    var cards = colorsGrid.querySelectorAll(".color-card.selected");
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.remove("selected");
    }
    hideBambuStudioPanel();
    updateMergeControls();
  }

  /**
   * Rewrites paths whose fill is in hexSet to a single averaged RGB (ImageTracer-style attributes).
   */
  function mergeSelectedInSvg(svgString, hexSet) {
    if (hexSet.size < 2) return svgString;
    var parser = new DOMParser();
    var doc = parser.parseFromString(svgString, "image/svg+xml");
    if (doc.querySelector("parsererror")) return svgString;
    var svg = doc.querySelector("svg");
    if (!svg) return svgString;

    var hexList = Array.from(hexSet);
    var sumR = 0;
    var sumG = 0;
    var sumB = 0;
    for (var h = 0; h < hexList.length; h++) {
      var rgb = hexToRgb(hexList[h]);
      sumR += rgb.r;
      sumG += rgb.g;
      sumB += rgb.b;
    }
    var nColors = hexList.length;
    var tr = Math.round(sumR / nColors);
    var tg = Math.round(sumG / nColors);
    var tb = Math.round(sumB / nColors);

    var paths = svg.querySelectorAll("path");
    var opacitySum = 0;
    var opacityCount = 0;
    var toPaint = [];
    for (var i = 0; i < paths.length; i++) {
      var path = paths[i];
      var fill = path.getAttribute("fill");
      if (!fill) continue;
      var key = normalizeFillKey(fill);
      if (hexSet.has(key)) {
        toPaint.push(path);
        var op = parseFloat(path.getAttribute("opacity"));
        if (isNaN(op)) op = 1;
        opacitySum += op;
        opacityCount++;
      }
    }
    if (toPaint.length === 0) return svgString;
    var ta = opacityCount ? opacitySum / opacityCount : 1;
    var taRounded = Math.round(ta * 1000) / 1000;
    var fillStr = "rgb(" + tr + "," + tg + "," + tb + ")";
    for (var j = 0; j < toPaint.length; j++) {
      var p = toPaint[j];
      p.setAttribute("fill", fillStr);
      p.setAttribute("stroke", fillStr);
      p.setAttribute("opacity", String(taRounded));
    }
    return new XMLSerializer().serializeToString(svg);
  }

  function applyMergedSvg() {
    lastLayers = splitSvgByFill(lastCombinedSvg);
    refreshSvgPreviews();
    clearColorSelection();
    renderColorLayers(lastLayers);
    btnDownloadZip.disabled = lastLayers.length === 0;
    updateColorsPanelChrome();
  }

  /**
   * Same corner squares in every layer SVG (user space) so multi-layer / Bambu overlays stay aligned.
   * Filled with the layer color so each modifier remains a single filament.
   */
  function appendRegistrationMarksToLayerSvg(svgEl, hexKey) {
    var xmlns = "http://www.w3.org/2000/svg";
    var vb = parseViewBoxNumbers(svgEl.getAttribute("viewBox"));
    if (!vb) {
      var wAttr = parseFloat(svgEl.getAttribute("width"));
      var hAttr = parseFloat(svgEl.getAttribute("height"));
      if (wAttr > 0 && hAttr > 0 && !isNaN(wAttr) && !isNaN(hAttr)) {
        vb = { minX: 0, minY: 0, w: wAttr, h: hAttr };
      } else {
        return;
      }
    }
    var mx = vb.minX;
    var my = vb.minY;
    var w = vb.w;
    var h = vb.h;
    var dim = Math.min(w, h);
    var inset = Math.max(1.5, dim * 0.014);
    var side = Math.max(3, Math.min(dim * 0.028, dim * 0.06));
    if (inset + side > dim * 0.45) {
      side = Math.max(2, dim * 0.02);
      inset = Math.max(1, dim * 0.01);
    }

    var fillAttr = hexKey.indexOf("#") === 0 ? hexKey : "#" + hexKey;

    var g = document.createElementNS(xmlns, "g");
    g.setAttribute("id", "img-to-svg-registration");
    g.setAttribute("class", "registration-marks");
    g.setAttribute("aria-hidden", "true");

    function cornerRect(cx, cy) {
      var r = document.createElementNS(xmlns, "rect");
      r.setAttribute("x", String(Math.round(cx * 1000) / 1000));
      r.setAttribute("y", String(Math.round(cy * 1000) / 1000));
      r.setAttribute("width", String(Math.round(side * 1000) / 1000));
      r.setAttribute("height", String(Math.round(side * 1000) / 1000));
      r.setAttribute("fill", fillAttr);
      r.setAttribute("stroke", "none");
      return r;
    }

    g.appendChild(cornerRect(mx + inset, my + inset));
    g.appendChild(cornerRect(mx + w - inset - side, my + inset));
    g.appendChild(cornerRect(mx + inset, my + h - inset - side));
    g.appendChild(cornerRect(mx + w - inset - side, my + h - inset - side));

    svgEl.appendChild(g);
  }

  function splitSvgByFill(svgString) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(svgString, "image/svg+xml");
    var parseErr = doc.querySelector("parsererror");
    if (parseErr) {
      return [];
    }
    var svg = doc.querySelector("svg");
    if (!svg) return [];

    var xmlns = "http://www.w3.org/2000/svg";
    var groups = new Map();

    var paths = svg.querySelectorAll("path");
    for (var i = 0; i < paths.length; i++) {
      var path = paths[i];
      var fill = path.getAttribute("fill");
      if (!fill) continue;
      var key = normalizeFillKey(fill);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(path);
    }

    var viewBox = svg.getAttribute("viewBox");
    var width = svg.getAttribute("width");
    var height = svg.getAttribute("height");

    var result = [];
    groups.forEach(function (nodes, hexKey) {
      var outSvg = document.createElementNS(xmlns, "svg");
      outSvg.setAttribute("xmlns", xmlns);
      outSvg.setAttribute("version", "1.1");
      if (viewBox) outSvg.setAttribute("viewBox", viewBox);
      else if (width && height) {
        outSvg.setAttribute("width", width);
        outSvg.setAttribute("height", height);
      }
      for (var j = 0; j < nodes.length; j++) {
        outSvg.appendChild(nodes[j].cloneNode(true));
      }
      if (registrationMarksEnabled && registrationMarksEnabled.checked) {
        appendRegistrationMarksToLayerSvg(outSvg, hexKey);
      }
      var ser = new XMLSerializer();
      result.push({
        hex: hexKey.indexOf("#") === 0 ? hexKey : "#" + hexKey,
        svg: ser.serializeToString(outSvg),
      });
    });

    result.sort(function (a, b) {
      return a.hex.localeCompare(b.hex);
    });
    return result;
  }

  function getBrushRadius() {
    var v = parseInt(brushSize.value, 10);
    return Math.max(2, isNaN(v) ? 14 : v);
  }

  function getMaskToolMode() {
    return maskTool.value === "include" ? "include" : "exclude";
  }

  function getCanvasCoords(canvas, clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var sx = canvas.width / rect.width;
    var sy = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * sx,
      y: (clientY - rect.top) * sy,
    };
  }

  function redrawMaskOverlay() {
    if (!overlayCtx || !maskCanvas || !overlayCanvas || !scaledForTrace) return;
    var w = overlayCanvas.width;
    var h = overlayCanvas.height;
    if (!maskEditActive) {
      overlayCtx.clearRect(0, 0, w, h);
      return;
    }
    var srcCtx = scaledForTrace.canvas.getContext("2d");
    if (!srcCtx) return;
    var src = srcCtx.getImageData(0, 0, w, h);
    var md = maskCtx.getImageData(0, 0, w, h);
    var plan = computeExclusionInpaintPlan(src.data, md.data, w, h);
    var od = overlayCtx.createImageData(w, h);
    var m = md.data;
    var o = od.data;
    for (var i = 0; i < m.length; i += 4) {
      if (m[i + 3] <= 8) continue;
      var idx = i >> 2;
      var fr = 100;
      var fg = 120;
      var fb = 150;
      if (plan) {
        var cid = plan.labels[idx];
        if (cid >= 1 && plan.fills[cid]) {
          fr = plan.fills[cid].r;
          fg = plan.fills[cid].g;
          fb = plan.fills[cid].b;
        }
      }
      o[i] = fr;
      o[i + 1] = fg;
      o[i + 2] = fb;
      o[i + 3] = Math.min(200, Math.round(m[i + 3] * 0.5));
    }
    overlayCtx.putImageData(od, 0, 0);
  }

  function paintDot(x, y) {
    if (!maskCtx) return;
    var r = getBrushRadius();
    var mode = getMaskToolMode();
    maskCtx.save();
    maskCtx.beginPath();
    maskCtx.arc(x, y, r, 0, Math.PI * 2);
    if (mode === "exclude") {
      maskCtx.globalCompositeOperation = "source-over";
      maskCtx.fillStyle = "rgba(255,255,255,1)";
    } else {
      maskCtx.globalCompositeOperation = "destination-out";
      maskCtx.fillStyle = "rgba(255,255,255,1)";
    }
    maskCtx.fill();
    maskCtx.restore();
    redrawMaskOverlay();
  }

  function paintLine(x0, y0, x1, y1) {
    if (!maskCtx) return;
    var r = getBrushRadius();
    var mode = getMaskToolMode();
    maskCtx.save();
    maskCtx.lineCap = "round";
    maskCtx.lineJoin = "round";
    maskCtx.lineWidth = r * 2;
    if (mode === "exclude") {
      maskCtx.globalCompositeOperation = "source-over";
      maskCtx.strokeStyle = "rgba(255,255,255,1)";
    } else {
      maskCtx.globalCompositeOperation = "destination-out";
      maskCtx.strokeStyle = "rgba(255,255,255,1)";
    }
    maskCtx.beginPath();
    maskCtx.moveTo(x0, y0);
    maskCtx.lineTo(x1, y1);
    maskCtx.stroke();
    maskCtx.restore();
    redrawMaskOverlay();
  }

  function getMaskedImageData(excludeActive) {
    if (!scaledForTrace) return null;
    var w = scaledForTrace.tw;
    var h = scaledForTrace.th;
    var srcCtx = scaledForTrace.canvas.getContext("2d");
    if (!srcCtx) return scaledForTrace.imageData;
    var raw = srcCtx.getImageData(0, 0, w, h);
    if (!maskCtx || !excludeActive) return raw;
    var mask = maskCtx.getImageData(0, 0, w, h);
    var plan = computeExclusionInpaintPlan(raw.data, mask.data, w, h);
    if (!plan) return raw;
    var d = raw.data;
    var m = mask.data;
    var labels = plan.labels;
    var fills = plan.fills;
    for (var idx = 0; idx < w * h; idx++) {
      var i = idx * 4;
      if (m[i + 3] <= MASK_ALPHA_EXCLUDE) continue;
      var c = labels[idx];
      if (c < 1) continue;
      var fill = fills[c];
      if (!fill) continue;
      d[i] = fill.r;
      d[i + 1] = fill.g;
      d[i + 2] = fill.b;
      d[i + 3] = 255;
    }
    return raw;
  }

  function onWindowMouseMove(e) {
    if (!isPainting || !overlayCanvas) return;
    var p = getCanvasCoords(overlayCanvas, e.clientX, e.clientY);
    paintLine(lastPaintX, lastPaintY, p.x, p.y);
    lastPaintX = p.x;
    lastPaintY = p.y;
  }

  function onWindowMouseUp() {
    endMaskPaintingStroke();
  }

  function onOverlayMouseDown(e) {
    if (e.button !== 0 || !overlayCanvas) return;
    if (samplingFromImage) {
      e.preventDefault();
      sampleColorFromImageAtClient(e.clientX, e.clientY);
      clearPaletteSamplingMode();
      statusBox.textContent = "Palette color updated.";
      renderPaletteSwatches();
      return;
    }
    if (!maskEditActive) return;
    e.preventDefault();
    isPainting = true;
    var p = getCanvasCoords(overlayCanvas, e.clientX, e.clientY);
    lastPaintX = p.x;
    lastPaintY = p.y;
    paintDot(p.x, p.y);
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
  }

  function onWindowTouchMove(e) {
    if (!isPainting || !overlayCanvas || !e.touches.length) return;
    e.preventDefault();
    var t = e.touches[0];
    var p = getCanvasCoords(overlayCanvas, t.clientX, t.clientY);
    paintLine(lastPaintX, lastPaintY, p.x, p.y);
    lastPaintX = p.x;
    lastPaintY = p.y;
  }

  var touchMoveOpts = { passive: false };

  function onWindowTouchEnd() {
    endMaskPaintingStroke();
  }

  function onOverlayTouchStart(e) {
    if (!overlayCanvas || !e.touches.length) return;
    if (samplingFromImage) {
      e.preventDefault();
      var t0 = e.touches[0];
      sampleColorFromImageAtClient(t0.clientX, t0.clientY);
      clearPaletteSamplingMode();
      statusBox.textContent = "Palette color updated.";
      renderPaletteSwatches();
      return;
    }
    if (!maskEditActive) return;
    e.preventDefault();
    isPainting = true;
    var t = e.touches[0];
    var p = getCanvasCoords(overlayCanvas, t.clientX, t.clientY);
    lastPaintX = p.x;
    lastPaintY = p.y;
    paintDot(p.x, p.y);
    window.addEventListener("touchmove", onWindowTouchMove, touchMoveOpts);
    window.addEventListener("touchend", onWindowTouchEnd);
    window.addEventListener("touchcancel", onWindowTouchEnd);
  }

  function renderOriginalWithMask() {
    if (!scaledForTrace || !scaledForTrace.canvas) return;
    endMaskPaintingStroke();
    originalStageHost.innerHTML = "";
    maskEditActive = false;
    if (btnToggleMaskEdit) {
      btnToggleMaskEdit.setAttribute("aria-pressed", "false");
      btnToggleMaskEdit.classList.remove("preview-toolbox-btn--active");
      btnToggleMaskEdit.title = "Exclusion mask";
      btnToggleMaskEdit.setAttribute("aria-label", "Paint exclusion mask on the source image");
    }
    maskToolbar.hidden = true;
    maskHelp.hidden = true;
    if (maskHelpBody && maskHelpBtn) {
      maskHelpBody.hidden = true;
      maskHelpBtn.setAttribute("aria-expanded", "false");
    }
    if (sourcePreviewToolbox) sourcePreviewToolbox.hidden = false;

    var tw = scaledForTrace.tw;
    var th = scaledForTrace.th;
    var stage = document.createElement("div");
    stage.className = "mask-stage";

    var src = scaledForTrace.canvas;
    src.className = "mask-layer mask-layer--source";
    stage.appendChild(src);

    maskCanvas = document.createElement("canvas");
    maskCanvas.width = tw;
    maskCanvas.height = th;
    maskCtx = maskCanvas.getContext("2d");

    overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = tw;
    overlayCanvas.height = th;
    overlayCanvas.className = "mask-layer mask-layer--overlay";
    overlayCtx = overlayCanvas.getContext("2d");
    stage.appendChild(overlayCanvas);

    originalStageHost.appendChild(stage);

    redrawMaskOverlay();

    overlayCanvas.addEventListener("mousedown", onOverlayMouseDown);
    overlayCanvas.addEventListener("touchstart", onOverlayTouchStart, { passive: false });
    syncOverlayPaintCursor();
  }

  function renderCombinedSvg(svgString) {
    svgHost.innerHTML = "";
    var doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
    var svg = doc.querySelector("svg");
    if (!svg) return;
    svgHost.appendChild(document.importNode(svg, true));
  }

  function renderColorLayers(layers) {
    colorsGrid.innerHTML = "";
    if (!layers.length) {
      colorsEmpty.hidden = false;
      colorsGrid.hidden = true;
      colorsHint.hidden = true;
      colorsToolbar.hidden = true;
      selectedHexes.clear();
      hideBambuStudioPanel();
      updateMergeControls();
      return;
    }
    colorsEmpty.hidden = true;
    colorsGrid.hidden = false;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers[i];
      var previewSvg = getPreviewLayerSvgAt(i);
      var card = document.createElement("div");
      card.className = "color-card";
      card.dataset.hex = layer.hex;
      if (selectedHexes.has(layer.hex)) {
        card.classList.add("selected");
      }
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-pressed", selectedHexes.has(layer.hex) ? "true" : "false");
      card.addEventListener("click", function (ev) {
        if (ev.target.closest(".color-card-fs")) return;
        var c = ev.currentTarget;
        var hx = c.dataset.hex;
        if (!hx) return;
        if (selectedHexes.has(hx)) {
          selectedHexes.delete(hx);
          c.classList.remove("selected");
        } else {
          selectedHexes.add(hx);
          c.classList.add("selected");
        }
        c.setAttribute("aria-pressed", selectedHexes.has(hx) ? "true" : "false");
        updateMergeControls();
      });
      card.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          if (ev.target.closest(".color-card-fs")) return;
          ev.preventDefault();
          ev.currentTarget.click();
        }
      });
      var header = document.createElement("div");
      header.className = "color-card-header";
      var sw = document.createElement("div");
      sw.className = "color-card-swatch";
      sw.style.background = layer.hex;
      var fsBtn = document.createElement("button");
      fsBtn.type = "button";
      fsBtn.className = "color-card-fs";
      fsBtn.setAttribute("aria-label", "Fullscreen preview for " + layer.hex);
      fsBtn.setAttribute("title", "Fullscreen preview");
      fsBtn.innerHTML =
        '<svg class="color-card-fs-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
        '<path fill="currentColor" d="M12 9a3 3 0 100 6 3 3 0 000-6zm0-4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5z"/>' +
        "</svg>";
      (function (svgForLightbox) {
        fsBtn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          openLayerLightbox(svgForLightbox);
        });
      })(previewSvg);
      header.appendChild(sw);
      header.appendChild(fsBtn);
      var label = document.createElement("div");
      label.className = "color-card-hex";
      label.textContent = layer.hex;
      var prev = document.createElement("div");
      prev.className = "color-card-preview";
      prev.innerHTML = previewSvg;
      card.appendChild(header);
      card.appendChild(label);
      card.appendChild(prev);
      colorsGrid.appendChild(card);
    }
    updateColorsPanelChrome();
  }

  function runTrace() {
    if (!scaledForTrace || !window.ImageTracer || typeof window.ImageTracer.imagedataToSVG !== "function") {
      return;
    }
    setError("");
    var n = parseInt(colorCount.value, 10);
    if (isNaN(n)) n = DEFAULT_COLORS;
    n = Math.max(MIN_COLORS, Math.min(MAX_COLORS, n));

    statusBox.textContent = "Tracing…";
    btnDownloadSvg.disabled = true;
    btnDownloadZip.disabled = true;
    hideBambuStudioPanel();

    window.setTimeout(function () {
      try {
        var excludeActive = maskHasExclude();
        var imgd = getMaskedImageData(excludeActive);
        if (!imgd) {
          statusBox.textContent = "Could not read pixels for tracing.";
          btnDownloadSvg.disabled = !lastCombinedSvg;
          btnDownloadZip.disabled = lastLayers.length === 0;
          updateBambuExportControls();
          return;
        }
        var svgString = window.ImageTracer.imagedataToSVG(imgd, buildTracerOptions(n));
        lastCombinedSvg = svgString;
        selectedHexes.clear();
        lastLayers = splitSvgByFill(svgString);
        refreshSvgPreviews();
        hideBambuStudioPanel();
        renderColorLayers(lastLayers);
        btnDownloadSvg.disabled = false;
        btnDownloadZip.disabled = lastLayers.length === 0;
        statusBox.textContent =
          "Done — " + lastLayers.length + " color layer(s), " + n + " palette color(s) from image.";
      } catch (e) {
        setError(e && e.message ? e.message : String(e));
        statusBox.textContent = "Trace failed.";
        lastCombinedSvg = "";
        lastLayers = [];
        refreshSvgPreviews();
        renderColorLayers([]);
      }
    }, 0);
  }

  var debouncedTrace = debounce(runTrace, DEBOUNCE_MS);
  var debouncedMaskTrace = debounce(runTrace, MASK_TRACE_DEBOUNCE_MS);
  var debouncedPrintSafePreview = debounce(function () {
    refreshSvgPreviews();
    if (lastLayers.length) {
      renderColorLayers(lastLayers);
    }
  }, PRINT_SAFE_PREVIEW_DEBOUNCE_MS);

  function endMaskPaintingStroke() {
    window.removeEventListener("mousemove", onWindowMouseMove);
    window.removeEventListener("mouseup", onWindowMouseUp);
    window.removeEventListener("touchmove", onWindowTouchMove, touchMoveOpts);
    window.removeEventListener("touchend", onWindowTouchEnd);
    window.removeEventListener("touchcancel", onWindowTouchEnd);
    if (isPainting) {
      isPainting = false;
      debouncedMaskTrace();
    }
  }

  function setMaskEditActive(on) {
    on = !!on;
    if (!on) {
      endMaskPaintingStroke();
    } else if (samplingFromImage) {
      clearPaletteSamplingMode();
      renderPaletteSwatches();
      statusBox.textContent = "Pick-from-image cancelled.";
    }
    maskEditActive = on;
    if (btnToggleMaskEdit) {
      btnToggleMaskEdit.setAttribute("aria-pressed", on ? "true" : "false");
      btnToggleMaskEdit.classList.toggle("preview-toolbox-btn--active", on);
      btnToggleMaskEdit.title = on ? "Close mask editor" : "Exclusion mask";
      btnToggleMaskEdit.setAttribute(
        "aria-label",
        on ? "Close exclusion mask editor" : "Paint exclusion mask on the source image"
      );
    }
    maskToolbar.hidden = !on;
    maskHelp.hidden = !on;
    if (!on && maskHelpBody && maskHelpBtn) {
      maskHelpBody.hidden = true;
      maskHelpBtn.setAttribute("aria-expanded", "false");
    }
    syncOverlayPaintCursor();
    redrawMaskOverlay();
  }

  function onImageReady(img, baseName) {
    loadedImage = img;
    lastBaseName = baseName || "trace";
    samplingFromImage = false;

    var tracePack = drawToImageData(img, MAX_EDGE);
    scaledForTrace = tracePack;
    var id0 = tracePack.imageData;
    sourceTraceImageData = new ImageData(new Uint8ClampedArray(id0.data), id0.width, id0.height);
    if (tracePack.scaled) {
      scaleNote.textContent =
        "Large image scaled to " + tracePack.tw + "×" + tracePack.th + " px for tracing (max edge " + MAX_EDGE + ").";
      scaleNote.hidden = false;
    } else {
      scaleNote.hidden = true;
    }

    renderOriginalWithMask();

    var analysis = drawToImageData(img, ANALYSIS_MAX_EDGE);
    var suggested = suggestColorCount(analysis.imageData);
    suppressColorInput = true;
    colorCount.value = String(suggested);
    colorCountOut.textContent = String(suggested);
    suppressColorInput = false;

    var nPick = parseInt(colorCount.value, 10);
    if (isNaN(nPick)) nPick = DEFAULT_COLORS;
    nPick = Math.max(MIN_COLORS, Math.min(MAX_COLORS, nPick));
    syncPaletteFromSourceImage(nPick);
    selectedPaletteIndex = 0;
    renderPaletteSwatches();

    runTrace();
  }

  function loadFile(file) {
    if (!file || !/^image\/(jpeg|png|jpg)$/i.test(file.type)) {
      setError("Please choose a JPG or PNG file.");
      return;
    }
    setError("");
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    objectUrl = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var base = file.name.replace(/\.[^.]+$/, "") || "trace";
      onImageReady(img, base);
    };
    img.onerror = function () {
      setError("Could not read image.");
      statusBox.textContent = "Load failed.";
      if (sourcePreviewToolbox) sourcePreviewToolbox.hidden = true;
      setMaskEditActive(false);
      sourceTraceImageData = null;
      var ne = parseInt(colorCount.value, 10);
      syncPaletteFromSourceImage(isNaN(ne) ? DEFAULT_COLORS : ne);
      renderPaletteSwatches();
    };
    img.src = objectUrl;
  }

  colorCount.addEventListener("input", function () {
    colorCountOut.textContent = colorCount.value;
    if (suppressColorInput) return;
    var nc = parseInt(colorCount.value, 10);
    if (!isNaN(nc)) {
      nc = Math.max(MIN_COLORS, Math.min(MAX_COLORS, nc));
      syncPaletteFromSourceImage(nc);
      renderPaletteSwatches();
    }
    debouncedTrace();
  });

  fileInput.addEventListener("change", function () {
    var f = fileInput.files && fileInput.files[0];
    if (f) loadFile(f);
  });

  // Dropzone is a <label> wrapping the file input — no programmatic click() or the dialog opens twice.

  dropzone.addEventListener("dragover", function (e) {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", function () {
    dropzone.classList.remove("dragover");
  });
  dropzone.addEventListener("drop", function (e) {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  btnDownloadSvg.addEventListener("click", function () {
    if (!lastCombinedSvg) return;
    var prep = prepareSvgForDownload(lastCombinedSvg);
    if (!prep.ok) {
      setError(prep.message || "Export check failed.");
      return;
    }
    setError("");
    var blob = new Blob([prep.svg], { type: "image/svg+xml;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = lastBaseName + ".svg";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  btnMergeColors.addEventListener("click", function () {
    if (selectedHexes.size < 2 || !lastCombinedSvg) return;
    setError("");
    var mergedCount = selectedHexes.size;
    lastCombinedSvg = mergeSelectedInSvg(lastCombinedSvg, selectedHexes);
    statusBox.textContent = "Merged " + mergedCount + " colors into one layer (average fill).";
    applyMergedSvg();
  });

  btnClearColorSelection.addEventListener("click", function () {
    clearColorSelection();
  });

  if (btn3dPrintSelected) {
    btn3dPrintSelected.addEventListener("click", function () {
      if (selectedHexes.size < 1 || !lastLayers.length) return;
      if (bambu3mfPanel) {
        bambu3mfPanel.hidden = false;
        updateBambuExportControls();
        bambu3mfPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
        if (bambuCylinderDiamMm) bambuCylinderDiamMm.focus();
      }
    });
  }

  btnDownloadZip.addEventListener("click", function () {
    if (!lastLayers.length || typeof window.JSZip !== "function") {
      setError("JSZip not loaded.");
      return;
    }
    var v = validatePrintSafeExport();
    if (!v.ok) {
      setError(v.message || "Export check failed.");
      return;
    }
    setError("");
    var zip = new window.JSZip();
    for (var i = 0; i < lastLayers.length; i++) {
      var layer = lastLayers[i];
      var hex = layer.hex.replace(/^#/, "");
      var name = "color-" + String(i + 1).padStart(2, "0") + "-" + hex + ".svg";
      var layerSvg = layer.svg;
      if (v.apply) {
        layerSvg = apply3dPrintSafeSvg(layer.svg, v.widthMm, v.nozzleMm);
      }
      zip.file(name, layerSvg);
    }
    zip.generateAsync({ type: "blob" }).then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = lastBaseName + "-svg-layers.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  });

  if (btnDownloadBambu3mf) {
    btnDownloadBambu3mf.addEventListener("click", function () {
      if (typeof window.JSZip !== "function") {
        setError("JSZip not loaded.");
        return;
      }
      if (typeof window.buildBambu3mfZip !== "function") {
        setError("Bambu 3MF builder not loaded.");
        return;
      }
      if (!lastLayers.length) {
        setError("Trace the image first to build color layers.");
        return;
      }
      if (!bambu3mfPanel || bambu3mfPanel.hidden) {
        setError('Use “3D print selected…” in the layer toolbar to open Bambu Studio options.');
        return;
      }
      var bambuLayers = getSelectedLayersForBambu();
      if (bambuLayers.length === 0) {
        setError("Select one or more layer colors to export in the 3MF.");
        return;
      }
      setError("");
      var diam = bambuCylinderDiamMm ? parseFloat(bambuCylinderDiamMm.value) : 100;
      var heightMm = bambuCylinderHeightMm ? parseFloat(bambuCylinderHeightMm.value) : 3;
      var plateCx = bambuPlateCenterXMm ? parseFloat(bambuPlateCenterXMm.value) : 128;
      var plateCy = bambuPlateCenterYMm ? parseFloat(bambuPlateCenterYMm.value) : 128;
      var depthMm = bambuEmbossDepthMm ? parseFloat(bambuEmbossDepthMm.value) : 0.6;
      if (!(diam > 0) || !(heightMm > 0)) {
        setError("Bambu 3MF: enter a positive cylinder diameter and height (mm).");
        return;
      }
      var nozzleMm = printSafeNozzleMm ? parseFloat(printSafeNozzleMm.value) : NaN;
      if (!(nozzleMm > 0)) {
        nozzleMm = 0.4;
      }
      var exportLayers = [];
      for (var bi = 0; bi < bambuLayers.length; bi++) {
        var scaledForPrint = apply3dPrintSafeSvg(bambuLayers[bi].svg, diam, nozzleMm);
        exportLayers.push({
          hex: bambuLayers[bi].hex,
          svg: scaledForPrint,
        });
      }
      window
        .buildBambu3mfZip({
          layers: exportLayers,
          JSZip: window.JSZip,
          diameterMm: diam,
          heightMm: heightMm,
          embossDepthMm: depthMm,
          plateCenterXMm: plateCx,
          plateCenterYMm: plateCy,
          objectName: lastBaseName + " — cylinder (top) + SVG modifiers",
        })
        .then(function (blob) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = lastBaseName + "-bambu.3mf";
          a.click();
          URL.revokeObjectURL(a.href);
          statusBox.textContent =
            "Bambu 3MF exported — cylinder (top-face modifiers) + " +
            exportLayers.length +
            " selected SVG modifier volume(s).";
        })
        .catch(function (err) {
          setError(err && err.message ? err.message : String(err));
        });
    });
  }

  brushSize.addEventListener("input", function () {
    brushSizeOut.textContent = brushSize.value;
  });

  btnClearMask.addEventListener("click", function () {
    if (!maskCtx || !overlayCanvas) return;
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    redrawMaskOverlay();
    debouncedMaskTrace();
  });

  printSafeEnabled.addEventListener("change", function () {
    printSafeFields.hidden = !printSafeEnabled.checked;
    debouncedPrintSafePreview();
  });

  if (registrationMarksEnabled) {
    registrationMarksEnabled.addEventListener("change", function () {
      if (lastCombinedSvg) applyMergedSvg();
    });
  }

  printSafeWidthMm.addEventListener("input", function () {
    debouncedPrintSafePreview();
  });
  printSafeNozzleMm.addEventListener("input", function () {
    debouncedPrintSafePreview();
  });

  if (btnPaletteResample) {
    btnPaletteResample.addEventListener("click", function () {
      resetPaletteFromSourceImage();
    });
  }

  if (btnToggleMaskEdit) {
    btnToggleMaskEdit.addEventListener("click", function () {
      setMaskEditActive(!maskEditActive);
    });
  }

  syncPaletteFromSourceImage(
    Math.max(MIN_COLORS, Math.min(MAX_COLORS, parseInt(colorCount.value, 10) || DEFAULT_COLORS))
  );
  renderPaletteSwatches();

  if (layerLightboxClose) {
    layerLightboxClose.addEventListener("click", function () {
      closeLayerLightbox();
    });
  }
  if (layerLightboxBackdrop) {
    layerLightboxBackdrop.addEventListener("click", function () {
      closeLayerLightbox();
    });
  }
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (layerLightbox && !layerLightbox.hidden) {
      closeLayerLightbox();
      return;
    }
    if (samplingFromImage) {
      clearPaletteSamplingMode();
      statusBox.textContent = "Pick-from-image cancelled.";
      renderPaletteSwatches();
      return;
    }
    if (maskEditActive) {
      setMaskEditActive(false);
    }
  });

  if (!window.ImageTracer || typeof window.ImageTracer.imagedataToSVG !== "function") {
    setError("ImageTracer failed to load. Check network or script URL.");
  }

  document.querySelectorAll(".help-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var panelId = btn.getAttribute("aria-controls");
      var panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) return;
      var expanding = panel.hidden;
      panel.hidden = !expanding;
      btn.setAttribute("aria-expanded", expanding ? "true" : "false");
    });
  });
})();
