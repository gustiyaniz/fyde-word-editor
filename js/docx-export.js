(() => {
  "use strict";

  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const encoder = new TextEncoder();

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function u16(n) { return new Uint8Array([n & 255, (n >>> 8) & 255]); }
  function u32(n) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
  function concat(parts) {
    const len = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(len);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }
  function dosDateTime(d = new Date()) {
    const year = Math.max(1980, d.getFullYear());
    const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    return {date, time};
  }

  class ZipWriter {
    constructor() { this.files = []; }
    add(path, data) {
      let bytes;
      if (typeof data === "string") bytes = encoder.encode(data);
      else if (data instanceof Uint8Array) bytes = data;
      else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else throw new Error("ZIP data tidak didukung");
      this.files.push({path, bytes});
    }
    build() {
      const locals = [], central = [];
      let offset = 0;
      const dt = dosDateTime();
      for (const f of this.files) {
        const name = encoder.encode(f.path);
        const crc = crc32(f.bytes);
        const local = concat([
          u32(0x04034b50), u16(20), u16(0), u16(0), u16(dt.time), u16(dt.date),
          u32(crc), u32(f.bytes.length), u32(f.bytes.length), u16(name.length), u16(0), name, f.bytes
        ]);
        locals.push(local);
        const cen = concat([
          u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(dt.time), u16(dt.date),
          u32(crc), u32(f.bytes.length), u32(f.bytes.length), u16(name.length), u16(0), u16(0),
          u16(0), u16(0), u32(0), u32(offset), name
        ]);
        central.push(cen);
        offset += local.length;
      }
      const centralBytes = concat(central);
      const end = concat([
        u32(0x06054b50), u16(0), u16(0), u16(this.files.length), u16(this.files.length),
        u32(centralBytes.length), u32(offset), u16(0)
      ]);
      return concat([...locals, centralBytes, end]);
    }
  }

  function esc(s) {
    return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
  }
  function pxToTwips(v) { return Math.round(parseFloat(v || 0) * 15); }
  function ptToHalfPoints(v) { return Math.max(2, Math.round(parseFloat(v || 11) * 2)); }
  function cssColorToHex(v) {
    if (!v) return null;
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.slice(1).toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(v)) return v.slice(1).split("").map(x=>x+x).join("").toUpperCase();
    const m = v.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) return [m[1],m[2],m[3]].map(x=>Number(x).toString(16).padStart(2,"0")).join("").toUpperCase();
    const named = {yellow:"FFFF00",red:"FF0000",blue:"0000FF",green:"008000",black:"000000",white:"FFFFFF",gray:"808080",grey:"808080"};
    return named[v.toLowerCase()] || null;
  }
  function highlightName(v) {
    const h = cssColorToHex(v);
    const map = {"FFFF00":"yellow","00FF00":"green","00FFFF":"cyan","FF00FF":"magenta","0000FF":"blue","FF0000":"red","000000":"black","FFFFFF":"white","808080":"darkGray"};
    return map[h] || null;
  }

  function styleStateFor(el, inherited = {}) {
    const s = {...inherited};
    if (!el || el.nodeType !== 1) return s;
    const tag = el.tagName.toLowerCase();
    if (tag === "b" || tag === "strong") s.bold = true;
    if (tag === "i" || tag === "em") s.italic = true;
    if (tag === "u") s.underline = true;
    if (tag === "s" || tag === "strike" || tag === "del") s.strike = true;
    if (tag === "sup") s.vert = "superscript";
    if (tag === "sub") s.vert = "subscript";
    const st = el.style;
    if (st) {
      if (st.fontWeight && (st.fontWeight === "bold" || parseInt(st.fontWeight,10) >= 600)) s.bold = true;
      if (st.fontStyle === "italic") s.italic = true;
      if ((st.textDecoration || "").includes("underline")) s.underline = true;
      if ((st.textDecoration || "").includes("line-through")) s.strike = true;
      if (st.fontFamily) s.font = st.fontFamily.split(",")[0].replace(/["']/g, "").trim();
      if (st.fontSize) {
        if (st.fontSize.endsWith("pt")) s.size = parseFloat(st.fontSize);
        else if (st.fontSize.endsWith("px")) s.size = parseFloat(st.fontSize) * 0.75;
      }
      if (st.color) s.color = cssColorToHex(st.color);
      if (st.backgroundColor) s.highlight = highlightName(st.backgroundColor);
      if (st.verticalAlign === "super") s.vert = "superscript";
      if (st.verticalAlign === "sub") s.vert = "subscript";
    }
    if (el.getAttribute("face")) s.font = el.getAttribute("face");
    const sizeAttr = parseInt(el.getAttribute("size") || "0",10);
    if (tag === "font" && sizeAttr) s.size = ({1:8,2:10,3:12,4:14,5:18,6:24,7:36})[sizeAttr] || 11;
    if (el.getAttribute("color")) s.color = cssColorToHex(el.getAttribute("color"));
    return s;
  }

  function runProps(s) {
    const x = [];
    if (s.bold) x.push("<w:b/>");
    if (s.italic) x.push("<w:i/>");
    if (s.underline) x.push('<w:u w:val="single"/>');
    if (s.strike) x.push("<w:strike/>");
    if (s.font) x.push(`<w:rFonts w:ascii="${esc(s.font)}" w:hAnsi="${esc(s.font)}"/>`);
    if (s.size) x.push(`<w:sz w:val="${ptToHalfPoints(s.size)}"/><w:szCs w:val="${ptToHalfPoints(s.size)}"/>`);
    if (s.color) x.push(`<w:color w:val="${s.color}"/>`);
    if (s.highlight) x.push(`<w:highlight w:val="${s.highlight}"/>`);
    if (s.vert) x.push(`<w:vertAlign w:val="${s.vert}"/>`);
    return x.length ? `<w:rPr>${x.join("")}</w:rPr>` : "";
  }

  function textRuns(text, style) {
    if (!text) return "";
    const parts = String(text).split(/(\t|\n)/);
    return parts.map(p => {
      const rp = runProps(style);
      if (p === "\t") return `<w:r>${rp}<w:tab/></w:r>`;
      if (p === "\n") return `<w:r>${rp}<w:br/></w:r>`;
      if (!p) return "";
      const preserve = /^\s|\s$| {2,}/.test(p) ? ' xml:space="preserve"' : "";
      return `<w:r>${rp}<w:t${preserve}>${esc(p)}</w:t></w:r>`;
    }).join("");
  }

  function dataUrlToBytes(src) {
    const m = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!m) return null;
    const mime = m[1] || "application/octet-stream";
    let bytes;
    if (m[2]) {
      const bin = atob(m[3]); bytes = new Uint8Array(bin.length);
      for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    } else bytes = encoder.encode(decodeURIComponent(m[3]));
    return {mime, bytes};
  }
  function extForMime(m) { return ({"image/png":"png","image/jpeg":"jpg","image/gif":"gif","image/bmp":"bmp","image/webp":"webp","image/svg+xml":"svg"})[m] || "png"; }

  class ExportContext {
    constructor() { this.rels = []; this.media = []; this.nextRid = 5; this.nextImg = 1; this.nextDocPr = 1; }
    addRel(type, target, mode) {
      const id = `rId${this.nextRid++}`;
      this.rels.push({id, type, target, mode});
      return id;
    }
    addImage(img) {
      const data = dataUrlToBytes(img.src || "");
      if (!data) return null;
      const ext = extForMime(data.mime);
      const name = `image${this.nextImg++}.${ext}`;
      this.media.push({name, mime:data.mime, bytes:data.bytes});
      const rid = this.addRel("http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", `media/${name}`);
      const widthPx = parseFloat(img.style.width) || img.naturalWidth || img.width || 320;
      const heightPx = parseFloat(img.style.height) || img.naturalHeight || img.height || Math.round(widthPx * .7);
      return {rid, cx:Math.round(widthPx*9525), cy:Math.round(heightPx*9525), docPr:this.nextDocPr++};
    }
  }

  function imageRun(img, ctx) {
    const im = ctx.addImage(img);
    if (!im) return "";
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${im.cx}" cy="${im.cy}"/><wp:docPr id="${im.docPr}" name="Picture ${im.docPr}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Picture"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${im.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${im.cx}" cy="${im.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }

  function inlineXml(node, ctx, inherited = {}) {
    if (node.nodeType === Node.TEXT_NODE) return textRuns(node.nodeValue || "", inherited);
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") return `<w:r>${runProps(inherited)}<w:br/></w:r>`;
    if (tag === "img") return imageRun(el, ctx);
    const style = styleStateFor(el, inherited);
    if (tag === "a") {
      const href = el.getAttribute("href");
      const inner = Array.from(el.childNodes).map(n => inlineXml(n,ctx,style)).join("");
      if (!href) return inner;
      const rid = ctx.addRel("http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", href, "External");
      return `<w:hyperlink r:id="${rid}">${inner}</w:hyperlink>`;
    }
    return Array.from(el.childNodes).map(n => inlineXml(n,ctx,style)).join("");
  }

  function paragraphProps(el, listInfo = null) {
    const p = [];
    const tag = el.tagName?.toLowerCase?.() || "p";
    if (/^h[1-6]$/.test(tag)) p.push(`<w:pStyle w:val="Heading${tag.slice(1)}"/>`);
    const ta = el.style?.textAlign;
    if (ta) p.push(`<w:jc w:val="${ta === "justify" ? "both" : ta}"/>`);
    const ml = el.style?.marginLeft, mr = el.style?.marginRight, ti = el.style?.textIndent;
    if (ml || mr || ti) {
      const attrs=[];
      if (ml) attrs.push(`w:left="${pxToTwips(ml)}"`);
      if (mr) attrs.push(`w:right="${pxToTwips(mr)}"`);
      if (ti) { const n=pxToTwips(ti); attrs.push(n>=0?`w:firstLine="${n}"`:`w:hanging="${Math.abs(n)}"`); }
      p.push(`<w:ind ${attrs.join(" ")}/>`);
    }
    const mt = el.style?.marginTop, mb = el.style?.marginBottom, lh = el.style?.lineHeight;
    if (mt || mb || lh) {
      const attrs=[];
      if (mt) attrs.push(`w:before="${pxToTwips(mt)}"`);
      if (mb) attrs.push(`w:after="${pxToTwips(mb)}"`);
      if (lh && !lh.endsWith("px") && !lh.endsWith("pt")) attrs.push(`w:line="${Math.round(parseFloat(lh)*240)}" w:lineRule="auto"`);
      p.push(`<w:spacing ${attrs.join(" ")}/>`);
    }
    if (listInfo) p.push(`<w:numPr><w:ilvl w:val="${listInfo.level}"/><w:numId w:val="${listInfo.ordered?2:1}"/></w:numPr>`);
    return p.length ? `<w:pPr>${p.join("")}</w:pPr>` : "";
  }

  function paragraphXml(el, ctx, listInfo=null) {
    const inner = Array.from(el.childNodes).map(n => inlineXml(n,ctx,{})).join("") || "<w:r><w:t></w:t></w:r>";
    return `<w:p>${paragraphProps(el,listInfo)}${inner}</w:p>`;
  }

  function tableXml(table, ctx) {
    let rows = "";
    for (const tr of Array.from(table.rows || [])) {
      let cells = "";
      for (const td of Array.from(tr.cells || [])) {
        const tcPr = td.colSpan > 1 ? `<w:tcPr><w:gridSpan w:val="${td.colSpan}"/></w:tcPr>` : "<w:tcPr/>";
        let body = "";
        for (const ch of Array.from(td.children)) {
          if (ch.tagName === "TABLE") body += tableXml(ch,ctx);
          else if (/^(P|H[1-6]|DIV)$/i.test(ch.tagName)) body += paragraphXml(ch,ctx);
          else body += paragraphXml(wrapElementAsParagraph(ch),ctx);
        }
        if (!body) body = `<w:p>${inlineXml(td,ctx,{})}</w:p>`;
        cells += `<w:tc>${tcPr}${body}</w:tc>`;
      }
      rows += `<w:tr>${cells}</w:tr>`;
    }
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="666666"/><w:left w:val="single" w:sz="4" w:color="666666"/><w:bottom w:val="single" w:sz="4" w:color="666666"/><w:right w:val="single" w:sz="4" w:color="666666"/><w:insideH w:val="single" w:sz="4" w:color="AAAAAA"/><w:insideV w:val="single" w:sz="4" w:color="AAAAAA"/></w:tblBorders></w:tblPr>${rows}</w:tbl>`;
  }

  function wrapElementAsParagraph(el) {
    const p = document.createElement("p");
    p.innerHTML = el.outerHTML || el.textContent || "";
    return p;
  }

  function listXml(list, ctx, level=0) {
    let out="";
    const ordered = list.tagName.toLowerCase() === "ol";
    for (const li of Array.from(list.children).filter(x=>x.tagName?.toLowerCase()==="li")) {
      const clone = li.cloneNode(true);
      Array.from(clone.children).filter(x=>/^(UL|OL)$/i.test(x.tagName)).forEach(x=>x.remove());
      out += paragraphXml(clone,ctx,{ordered,level:Math.min(level,8)});
      for (const nested of Array.from(li.children).filter(x=>/^(UL|OL)$/i.test(x.tagName))) out += listXml(nested,ctx,level+1);
    }
    return out;
  }

  function bodyXml(editor, ctx) {
    let out="";
    for (const el of Array.from(editor.children)) {
      const tag = el.tagName.toLowerCase();
      if (/^(p|h[1-6]|div)$/.test(tag)) out += paragraphXml(el,ctx);
      else if (tag === "ul" || tag === "ol") out += listXml(el,ctx,0);
      else if (tag === "table") out += tableXml(el,ctx);
      else if (tag === "hr" && el.classList.contains("page-break")) out += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      else out += paragraphXml(wrapElementAsParagraph(el),ctx);
    }
    return out || "<w:p/>";
  }

  function headerXml(text="") {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p></w:hdr>`;
  }
  function pageFieldRun() {
    return `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  }
  function footerXml(text="", pageNumberMode="none") {
    const p = [];
    if (text) p.push(`<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`);
    if (pageNumberMode !== "none") {
      const jc = pageNumberMode === "center" ? "center" : pageNumberMode === "right" ? "right" : "left";
      p.push(`<w:p><w:pPr><w:jc w:val="${jc}"/></w:pPr>${pageFieldRun()}</w:p>`);
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${p.join("") || "<w:p/>"}</w:ftr>`;
  }

  function pageSect(options={}) {
    const landscape = options.orientation === "landscape";
    const w = landscape ? 16838 : 11906, h = landscape ? 11906 : 16838;
    const margin = options.marginTwips || {top:1440,right:1440,bottom:1440,left:1440};
    const refs = `${options.headerText ? '<w:headerReference w:type="default" r:id="rId3"/>' : ''}${(options.footerText || (options.pageNumberMode && options.pageNumberMode !== "none")) ? '<w:footerReference w:type="default" r:id="rId4"/>' : ''}`;
    return `<w:sectPr>${refs}<w:pgSz w:w="${w}" w:h="${h}"${landscape?' w:orient="landscape"':''}/><w:pgMar w:top="${margin.top}" w:right="${margin.right}" w:bottom="${margin.bottom}" w:left="${margin.left}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  }

  function stylesXml() {
    let headings="";
    const sizes=[32,28,26,24,22,20];
    for(let i=1;i<=6;i++) headings += `<w:style w:type="paragraph" w:styleId="Heading${i}"><w:name w:val="heading ${i}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="${9+i}"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:color w:val="2F5496"/><w:sz w:val="${sizes[i-1]}"/><w:szCs w:val="${sizes[i-1]}"/></w:rPr></w:style>`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${headings}</w:styles>`;
  }

  function numberingXml() {
    let bulletLvls="", decLvls="";
    for(let i=0;i<9;i++) {
      bulletLvls += `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${720+i*360}"/></w:tabs><w:ind w:left="${720+i*360}" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr></w:lvl>`;
      decLvls += `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${i+1}."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="${720+i*360}"/></w:tabs><w:ind w:left="${720+i*360}" w:hanging="360"/></w:pPr></w:lvl>`;
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>${bulletLvls}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/>${decLvls}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
  }

  function contentTypes(ctx, options={}) {
    const defaults = new Map([["rels","application/vnd.openxmlformats-package.relationships+xml"],["xml","application/xml"]]);
    for (const m of ctx.media) defaults.set(m.name.split(".").pop().toLowerCase(), m.mime);
    const hf = `${options.headerText ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}${(options.footerText || (options.pageNumberMode && options.pageNumberMode !== "none")) ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' : ''}`;
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${Array.from(defaults).map(([e,t])=>`<Default Extension="${esc(e)}" ContentType="${esc(t)}"/>`).join("")}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>${hf}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  }

  function documentRels(ctx, options={}) {
    const base = [
      {id:"rId1",type:"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",target:"styles.xml"},
      {id:"rId2",type:"http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering",target:"numbering.xml"}
    ];
    if (options.headerText) base.push({id:"rId3",type:"http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",target:"header1.xml"});
    if (options.footerText || (options.pageNumberMode && options.pageNumberMode !== "none")) base.push({id:"rId4",type:"http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",target:"footer1.xml"});
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[...base,...ctx.rels].map(r=>`<Relationship Id="${r.id}" Type="${r.type}" Target="${esc(r.target)}"${r.mode?` TargetMode="${r.mode}"`:""}/>`).join("")}</Relationships>`;
  }

  function coreXml(title) {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>Fyde Word</dc:creator><cp:lastModifiedBy>Fyde Word</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  }

  async function exportDocx(editor, options={}) {
    const ctx = new ExportContext();
    const body = bodyXml(editor,ctx);
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}${pageSect(options)}</w:body></w:document>`;

    const zip = new ZipWriter();
    zip.add("[Content_Types].xml", contentTypes(ctx, options));
    zip.add("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    zip.add("word/document.xml", documentXml);
    zip.add("word/styles.xml", stylesXml());
    zip.add("word/numbering.xml", numberingXml());
    zip.add("word/_rels/document.xml.rels", documentRels(ctx, options));
    if (options.headerText) zip.add("word/header1.xml", headerXml(options.headerText));
    if (options.footerText || (options.pageNumberMode && options.pageNumberMode !== "none")) zip.add("word/footer1.xml", footerXml(options.footerText, options.pageNumberMode || "none"));
    zip.add("docProps/core.xml", coreXml(options.title || "Document"));
    zip.add("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Fyde Word</Application><AppVersion>5.0</AppVersion></Properties>`);
    for (const m of ctx.media) zip.add(`word/media/${m.name}`, m.bytes);
    return new Blob([zip.build()], {type:DOCX_MIME});
  }

  window.FydeDocxExport = {DOCX_MIME, exportDocx};
})();
