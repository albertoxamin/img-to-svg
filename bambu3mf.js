/**
 * Build a Bambu Studio–style 3MF: vertical cylinder body + per-color SVG modifier volumes
 * aligned to the flat top face (lithophane-style), with embedded layer SVGs (BambuStudioShape / filepath3mf).
 * Geometry and metadata follow BambuStudio bbs_3mf export conventions.
 */
(function (global) {
  "use strict";

  function escapeXml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtNum(n) {
    var x = Number(n);
    if (!isFinite(x)) return "0";
    return String(Math.round(x * 1e9) / 1e9);
  }

  /**
   * @returns {{ vertices: {x:number,y:number,z:number}[], triangles: [number,number,number][] }}
   */
  function buildCylinderMesh(radius, height, segments) {
    var R = radius;
    var H = height;
    var seg = Math.max(8, Math.floor(segments) || 48);
    var verts = [];
    var tris = [];
    function pushV(x, y, z) {
      verts.push({ x: x, y: y, z: z });
      return verts.length - 1;
    }
    var bottom = [];
    var top = [];
    for (var i = 0; i < seg; i++) {
      var t = (2 * Math.PI * i) / seg;
      var x = R * Math.cos(t);
      var y = R * Math.sin(t);
      bottom.push(pushV(x, y, 0));
      top.push(pushV(x, y, H));
    }
    var bottomCenter = pushV(0, 0, 0);
    var topCenter = pushV(0, 0, H);
    for (var j = 0; j < seg; j++) {
      var j2 = (j + 1) % seg;
      tris.push([bottom[j], bottom[j2], bottomCenter]);
      tris.push([top[j2], top[j], topCenter]);
      var b1 = bottom[j];
      var b2 = bottom[j2];
      var t1 = top[j];
      var t2 = top[j2];
      tris.push([b1, b2, t2]);
      tris.push([b1, t2, t1]);
    }
    return { vertices: verts, triangles: tris };
  }

  /**
   * Axis-aligned box [x0,x1]×[y0,y1]×[z0,z1]
   */
  function buildBoxMesh(x0, x1, y0, y1, z0, z1) {
    var v = [
      { x: x0, y: y0, z: z0 },
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y1, z: z0 },
      { x: x0, y: y1, z: z0 },
      { x: x0, y: y0, z: z1 },
      { x: x1, y: y0, z: z1 },
      { x: x1, y: y1, z: z1 },
      { x: x0, y: y1, z: z1 },
    ];
    var tris = [
      [0, 2, 1],
      [0, 3, 2],
      [4, 5, 6],
      [4, 6, 7],
      [0, 1, 5],
      [0, 5, 4],
      [1, 2, 6],
      [1, 6, 5],
      [2, 3, 7],
      [2, 7, 6],
      [3, 0, 4],
      [3, 4, 7],
    ];
    return { vertices: v, triangles: tris };
  }

  /** Bambu production extension UUID suffixes (bbs_3mf). */
  var BBS_BACKUP_ID = 1;
  var OBJECT_UUID_SUFFIX = "-61cb-4c03-9d28-80fed5dfa1dc";
  var COMPONENT_UUID_SUFFIX = "-b206-40ff-9872-83e8017abed1";
  var SUB_OBJECT_UUID_SUFFIX = "-81cb-4c03-9d28-80fed5dfa1dc";
  var BUILD_ROOT_UUID = "2c7c17d8-22b5-4d84-8835-1976022ea369";
  var BUILD_ITEM_UUID_SUFFIX = "-b1ec-4553-aec9-835e5b724bb4";
  var OBJECTS_MODEL_PATH = "/3D/Objects/object_1.model";

  /**
   * Bambu _handle_end_metadata only sets m_is_bbl_3mf when Application starts with "BambuStudio-".
   * Without that, the archive is treated as third-party and SVG emboss volumes often stay as raw
   * placeholder meshes until a gizmo edit retriggers processing.
   * Version suffix must parse as Semver in Bambu (see bbs_3mf.cpp).
   */
  var BAMBU_APPLICATION_VALUE = "BambuStudio-01.09.05.51";

  function hex8u32(n) {
    var h = (n >>> 0).toString(16);
    return ("00000000" + h).slice(-8);
  }

  function compositeObjectPUuid() {
    return hex8u32(BBS_BACKUP_ID) + OBJECT_UUID_SUFFIX;
  }

  function subObjectPUuid(volumeIndex0) {
    return hex8u32((BBS_BACKUP_ID << 16) + volumeIndex0) + SUB_OBJECT_UUID_SUFFIX;
  }

  function componentPUuid(volumeIndex0) {
    return hex8u32((BBS_BACKUP_ID << 16) + volumeIndex0) + COMPONENT_UUID_SUFFIX;
  }

  function buildItemPUuid(compositeObjectId) {
    return hex8u32(compositeObjectId) + BUILD_ITEM_UUID_SUFFIX;
  }

  function meshTo3mfObjectXml(objectId, objectType, mesh, prodUuid) {
    var verts = mesh.vertices;
    var tris = mesh.triangles;
    var i;
    var lines = [];
    var open = '  <object id="' + objectId + '" type="' + objectType + '"';
    if (prodUuid) {
      open += ' p:UUID="' + prodUuid + '"';
    }
    lines.push(open + ">");
    lines.push("   <mesh>");
    lines.push("    <vertices>");
    for (i = 0; i < verts.length; i++) {
      var p = verts[i];
      lines.push(
        '     <vertex x="' +
          fmtNum(p.x) +
          '" y="' +
          fmtNum(p.y) +
          '" z="' +
          fmtNum(p.z) +
          '"/>'
      );
    }
    lines.push("    </vertices>");
    lines.push("    <triangles>");
    for (i = 0; i < tris.length; i++) {
      var t = tris[i];
      lines.push('     <triangle v1="' + t[0] + '" v2="' + t[1] + '" v3="' + t[2] + '"/>');
    }
    lines.push("    </triangles>");
    lines.push("   </mesh>");
    lines.push("  </object>");
    return lines.join("\n");
  }

  function transformIdentity3x4() {
    return "1 0 0 0 1 0 0 0 1 0 0 0";
  }

  /** 3MF / Bambu: 3×4 column-major, translation in world mm (last three values). */
  function transformTranslation3x4(tx, ty, tz) {
    return (
      "1 0 0 0 1 0 0 0 1 " +
      fmtNum(tx) +
      " " +
      fmtNum(ty) +
      " " +
      fmtNum(tz)
    );
  }

  function matrixIdentity4x4() {
    return "1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1";
  }

  /** Largest viewBox side from SVG markup (Bambu Studio uses ~1024 for similar exports). */
  function parseSvgViewBoxMaxDim(svgString) {
    var s = String(svgString || "");
    var m = s.match(/viewBox\s*=\s*"([^"]+)"/i);
    if (!m) m = s.match(/viewBox\s*=\s*'([^']+)'/i);
    if (!m) return 1024;
    var parts = m[1]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(parseFloat);
    if (parts.length < 4 || parts.some(isNaN)) return 1024;
    var w = parts[2];
    var h = parts[3];
    if (!(w > 0) || !(h > 0)) return 1024;
    return Math.max(w, h);
  }

  /**
   * Match parkrun-moomin.3mf convention: scale 1e-5 at viewBox 1024, scaled for other view sizes.
   */
  function bambuShapeScaleFromViewBox(vbMax) {
    var REF_VB = 1024;
    var REF_SCALE = 1e-5;
    return (REF_SCALE * REF_VB) / Math.max(vbMax, 1e-9);
  }

  function formatShapeScale(scale) {
    var x = Number(scale);
    if (!isFinite(x) || x <= 0) x = 1e-5;
    return x.toExponential(15);
  }

  /**
   * @param {object} opts
   * @param {{ hex: string, svg: string }[]} opts.layers
   * @param {number} opts.diameterMm
   * @param {number} opts.heightMm
   * @param {number} [opts.segments] cylinder side segments (default 48, min 8)
   * @param {number} [opts.embossDepthMm]
   * @param {number} [opts.plateCenterXMm] world X (mm) for build/assemble — centers cylinder on bed
   * @param {number} [opts.plateCenterYMm] world Y (mm)
   * @param {typeof JSZip} opts.JSZip
   */
  function buildBambu3mfZip(opts) {
    var JSZip = opts.JSZip;
    if (typeof JSZip !== "function") {
      return Promise.reject(new Error("JSZip not available"));
    }
    var layers = opts.layers || [];
    if (!layers.length) {
      return Promise.reject(new Error("No layers to export"));
    }
    var diameterMm = Number(opts.diameterMm);
    var heightMm = Number(opts.heightMm);
    if (!(diameterMm > 0) || !(heightMm > 0)) {
      return Promise.reject(new Error("Cylinder diameter and height must be positive"));
    }
    var R = diameterMm / 2;
    var H = heightMm;
    var embossDepth = opts.embossDepthMm != null ? Number(opts.embossDepthMm) : 0.6;
    if (!isFinite(embossDepth) || embossDepth <= 0) embossDepth = 0.6;

    var plateCx = opts.plateCenterXMm != null ? Number(opts.plateCenterXMm) : 128;
    var plateCy = opts.plateCenterYMm != null ? Number(opts.plateCenterYMm) : 128;
    if (!isFinite(plateCx)) plateCx = 128;
    if (!isFinite(plateCy)) plateCy = 128;

    var segments = opts.segments != null ? Math.floor(Number(opts.segments)) : 48;
    if (!isFinite(segments) || segments < 8) segments = 48;

    // Cylinder on the bed (z = 0 … H); circular top at z = H is the flat face for the art.
    var cylBody = buildCylinderMesh(R, H, segments);
    // Modifier boxes only cover the top region so emboss projects onto the flat cap, not the curved wall.
    var topSlabThick = Math.min(H, Math.max(embossDepth * 3, 0.8));
    var zModBottom = H - topSlabThick;
    var modTopSlab = buildBoxMesh(-R, R, -R, R, zModBottom, H);

    var volumeMeshes = [cylBody];
    for (var m = 0; m < layers.length; m++) {
      volumeMeshes.push(modTopSlab);
    }

    var nVol = volumeMeshes.length;
    var compositeId = nVol + 1;

    var modelNs =
      "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";
    var bambuNs = "http://schemas.bambulab.com/package/2021";
    var prodNs = "http://schemas.microsoft.com/3dmanufacturing/production/2015/06";
    var modelOpen =
      '<model unit="millimeter" xml:lang="en-US" xmlns="' +
      modelNs +
      '" xmlns:BambuStudio="' +
      bambuNs +
      '" xmlns:p="' +
      prodNs +
      '" requiredextensions="p">';

    var tfLocal = transformIdentity3x4();
    var buildTf = transformTranslation3x4(plateCx, plateCy, 0);

    var subXml = [];
    subXml.push('<?xml version="1.0" encoding="UTF-8"?>');
    subXml.push(modelOpen);
    subXml.push(' <metadata name="BambuStudio:3mfVersion">1</metadata>');
    subXml.push(" <resources>");
    for (var sv = 0; sv < nVol; sv++) {
      var stype = sv === 0 ? "model" : "other";
      subXml.push(meshTo3mfObjectXml(sv + 1, stype, volumeMeshes[sv], subObjectPUuid(sv)));
    }
    subXml.push(" </resources>");
    subXml.push(" <build/>");
    subXml.push("</model>");

    var mainXml = [];
    mainXml.push('<?xml version="1.0" encoding="UTF-8"?>');
    mainXml.push(modelOpen);
    mainXml.push(
      ' <metadata name="Application">' + escapeXml(BAMBU_APPLICATION_VALUE) + "</metadata>"
    );
    mainXml.push(' <metadata name="BambuStudio:3mfVersion">1</metadata>');
    mainXml.push(" <resources>");
    mainXml.push(
      '  <object id="' +
        compositeId +
        '" p:UUID="' +
        compositeObjectPUuid() +
        '" type="model">'
    );
    mainXml.push("   <components>");
    for (var cv = 0; cv < nVol; cv++) {
      mainXml.push(
        '    <component p:path="' +
          OBJECTS_MODEL_PATH +
          '" objectid="' +
          (cv + 1) +
          '" p:UUID="' +
          componentPUuid(cv) +
          '" transform="' +
          tfLocal +
          '"/>'
      );
    }
    mainXml.push("   </components>");
    mainXml.push("  </object>");
    mainXml.push(" </resources>");
    mainXml.push(' <build p:UUID="' + BUILD_ROOT_UUID + '">');
    mainXml.push(
      '  <item objectid="' +
        compositeId +
        '" p:UUID="' +
        buildItemPUuid(compositeId) +
        '" transform="' +
        buildTf +
        '" printable="1"/>'
    );
    mainXml.push(" </build>");
    mainXml.push("</model>");

    var zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
        ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
        ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
        ' <Default Extension="svg" ContentType="image/svg+xml"/>\n' +
        "</Types>"
    );
    zip.folder("_rels").file(
      ".rels",
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
        ' <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n' +
        "</Relationships>"
    );
    zip.folder("3D").file("3dmodel.model", mainXml.join("\n"));
    zip.folder("3D").folder("Objects").file("object_1.model", subXml.join("\n"));
    zip.folder("3D").folder("_rels").file(
      "3dmodel.model.rels",
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
        ' <Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n' +
        "</Relationships>\n"
    );

    var shapeEntries = [];
    for (var li = 0; li < layers.length; li++) {
      var hexShort = String(layers[li].hex || "")
        .replace(/^#/, "")
        .replace(/[^0-9a-fA-F]/g, "");
      var basename =
        "layer-" + String(li + 1).padStart(2, "0") + "-" + (hexShort || "color") + ".svg";
      var zipPath = "3D/" + basename;
      shapeEntries.push({ zipPath: zipPath, basename: basename });
      zip.file(zipPath, layers[li].svg || '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>');
    }

    var cfg = [];
    cfg.push('<?xml version="1.0" encoding="UTF-8"?>');
    cfg.push("<config>");
    cfg.push('  <object id="' + compositeId + '">');
    cfg.push(
      '    <metadata key="name" value="' +
        escapeXml(opts.objectName || "Cylinder with SVG modifiers (top face)") +
        '"/>'
    );

    function partBlock(volIdx, subtype, name, extruder, extraShapeXml, filamentColour) {
      var mesh = volumeMeshes[volIdx];
      var triCount = mesh.triangles.length;
      var lines = [];
      lines.push('    <part id="' + (volIdx + 1) + '" subtype="' + subtype + '">');
      if (name) {
        lines.push('      <metadata key="name" value="' + escapeXml(name) + '"/>');
      }
      lines.push('      <metadata key="matrix" value="' + matrixIdentity4x4() + '"/>');
      if (extruder != null) {
        lines.push('      <metadata key="extruder" value="' + extruder + '"/>');
      }
      if (filamentColour) {
        lines.push('      <metadata key="filament_colour" value="' + escapeXml(filamentColour) + '"/>');
      }
      if (extraShapeXml) {
        lines.push(extraShapeXml);
      }
      lines.push(
        "      <mesh_stat " +
          'face_count="' +
          triCount +
          '" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>'
      );
      lines.push("    </part>");
      return lines.join("\n");
    }

    cfg.push(
      partBlock(
        0,
        "normal_part",
        "Cylinder body",
        1,
        null,
        null
      )
    );

    for (var pi = 0; pi < layers.length; pi++) {
      var se = shapeEntries[pi];
      var zipPath = se.zipPath;
      var basename = se.basename;
      var layerHex = layers[pi].hex || "#808080";
      var colourMeta = layerHex.indexOf("#") === 0 ? layerHex : "#" + layerHex;
      var vbMax = parseSvgViewBoxMaxDim(layers[pi].svg || "");
      var shapeScale = bambuShapeScaleFromViewBox(vbMax);
      // Omit filepath: only filepath3mf + embedded SVG bytes. A basename-only filepath makes
      // NSVGUtils::init_image look on disk and skip file_data; shapes stay empty until the user edits.
      // Omit unhealed: missing => healed (read_emboss_shape: unhealed != 1).
      var shapeLine =
        '      <BambuStudioShape filepath3mf="' +
        escapeXml(zipPath) +
        '" scale="' +
        formatShapeScale(shapeScale) +
        '" depth="' +
        fmtNum(embossDepth) +
        '" transform="' +
        transformIdentity3x4() +
        '"/>';
      cfg.push(
        partBlock(
          pi + 1,
          "modifier_part",
          basename.replace(/\.svg$/i, ""),
          pi + 2,
          shapeLine,
          colourMeta
        )
      );
    }

    cfg.push("  </object>");

    cfg.push("  <plate>");
    cfg.push('    <metadata key="plater_id" value="1"/>');
    cfg.push('    <metadata key="plater_name" value=""/>');
    cfg.push('    <metadata key="locked" value="false"/>');
    cfg.push("    <model_instance>");
    cfg.push('      <metadata key="object_id" value="' + compositeId + '"/>');
    cfg.push('      <metadata key="instance_id" value="0"/>');
    cfg.push('      <metadata key="identify_id" value="1"/>');
    cfg.push("    </model_instance>");
    cfg.push("  </plate>");

    cfg.push("  <assemble>");
    cfg.push(
      '   <assemble_item object_id="' +
        compositeId +
        '" instance_id="0" transform="' +
        buildTf +
        '" offset="0 0 0"/>'
    );
    cfg.push("  </assemble>");
    cfg.push("</config>");

    zip.file("Metadata/model_settings.config", cfg.join("\n"));

    return zip.generateAsync({ type: "blob" });
  }

  global.buildBambu3mfZip = buildBambu3mfZip;
})(typeof window !== "undefined" ? window : this);
