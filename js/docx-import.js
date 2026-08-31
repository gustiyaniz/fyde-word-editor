(() => {
  "use strict";

  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const td = new TextDecoder("utf-8");

  function localName(node) { return node?.localName || node?.nodeName?.split(":").pop() || ""; }
  function children(node, name) { return Array.from(node?.children || []).filter(n => localName(n) === name); }
  function child(node, name) { return children(node, name)[0] || null; }
  function descendants(node, name) { return Array.from(node?.getElementsByTagName("*") || []).filter(n => localName(n) === name); }
  function attr(node, name) {
    if (!node) return null;
    for (const a of Array.from(node.attributes || [])) {
      if (a.localName === name || a.name === name || a.name.endsWith(":" + name)) return a.value;
    }
    return null;
  }
  function parseXml(text) {
    const x = new DOMParser().parseFromString(text, "application/xml");
    if (x.querySelector("parsererror")) throw new Error("XML DOCX tidak valid");
    return x;
  }

  class ZipReader {
    constructor(buffer) {
      this.buffer = buffer;
      this.view = new DataView(buffer);
      this.bytes = new Uint8Array(buffer);
      this.entries = new Map();
      this._readDirectory();
    }
    _u16(o) { return this.view.getUint16(o, true); }
    _u32(o) { return this.view.getUint32(o, true); }
    _readDirectory() {
      const min = Math.max(0, this.bytes.length - 65557);
      let eocd = -1;
      for (let i = this.bytes.length - 22; i >= min; i--) {
        if (this._u32(i) === 0x06054b50) { eocd = i; break; }
      }
      if (eocd < 0) throw new Error("File bukan ZIP/DOCX yang valid");
      const count = this._u16(eocd + 10);
      let p = this._u32(eocd + 16);
      for (let i = 0; i < count; i++) {
        if (this._u32(p) !== 0x02014b50) throw new Error("Central directory DOCX rusak");
        const method = this._u16(p + 10);
        const compressedSize = this._u32(p + 20);
        const uncompressedSize = this._u32(p + 24);
        const nameLen = this._u16(p + 28);
        const extraLen = this._u16(p + 30);
        const commentLen = this._u16(p + 32);
        const localOffset = this._u32(p + 42);
        const name = td.decode(this.bytes.slice(p + 46, p + 46 + nameLen));
        this.entries.set(name, {name, method, compressedSize, uncompressedSize, localOffset});
        p += 46 + nameLen + extraLen + commentLen;
      }
    }
    has(name) { return this.entries.has(name); }
    async bytesOf(name) {
      const e = this.entries.get(name);
      if (!e) throw new Error("Entry tidak ditemukan: " + name);
      const p = e.localOffset;
      if (this._u32(p) !== 0x04034b50) throw new Error("Local ZIP header rusak");
      const nameLen = this._u16(p + 26), extraLen = this._u16(p + 28);
      const start = p + 30 + nameLen + extraLen;
      const compressed = this.bytes.slice(start, start + e.compressedSize);
      if (e.method === 0) return compressed;
      if (e.method === 8) {
        if (!("DecompressionStream" in window)) throw new Error("Browser ini belum mendukung decompression DOCX offline");
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      throw new Error("Metode kompresi DOCX tidak didukung: " + e.method);
    }
    async text(name) { return td.decode(await this.bytesOf(name)); }
  }

  function resolvePath(base, target) {
    if (!target) return null;
    if (target.startsWith("/")) return target.slice(1);
    const parts = base.split("/"); parts.pop();
    for (const bit of target.split("/")) {
      if (bit === "..") parts.pop(); else if (bit !== ".") parts.push(bit);
    }
    return parts.join("/");
  }

  async function relationshipMap(zip, relPath, basePath) {
    const map = new Map();
    if (!zip.has(relPath)) return map;
    const xml = parseXml(await zip.text(relPath));
    for (const r of descendants(xml, "Relationship")) {
      const id = attr(r, "Id"), target = attr(r, "Target"), type = attr(r, "Type") || "";
      if (id) map.set(id, {target, path: resolvePath(basePath, target), type});
    }
    return map;
  }

  async function loadStyles(zip) {
    const styles = new Map();
    if (!zip.has("word/styles.xml")) return styles;
    const xml = parseXml(await zip.text("word/styles.xml"));
    for (const s of descendants(xml, "style")) {
      const id = attr(s, "styleId");
      if (!id) continue;
      const name = attr(child(s, "name"), "val") || id;
      styles.set(id, {name, type: attr(s, "type") || "paragraph"});
    }
    return styles;
  }

  async function loadNumbering(zip) {
    const nums = new Map(), abstracts = new Map();
    if (!zip.has("word/numbering.xml")) return {nums, abstracts};
    const xml = parseXml(await zip.text("word/numbering.xml"));
    for (const a of descendants(xml, "abstractNum")) {
      const aid = attr(a, "abstractNumId");
      const levels = new Map();
      for (const lvl of children(a, "lvl")) {
        const ilvl = attr(lvl, "ilvl") || "0";
        const fmt = attr(child(lvl, "numFmt"), "val") || "bullet";
        const text = attr(child(lvl, "lvlText"), "val") || (fmt === "bullet" ? "•" : "%1.");
        levels.set(ilvl, {fmt, text});
      }
      abstracts.set(aid, levels);
    }
    for (const n of descendants(xml, "num")) {
      const numId = attr(n, "numId");
      const aid = attr(child(n, "abstractNumId"), "val");
      if (numId) nums.set(numId, aid);
    }
    return {nums, abstracts};
  }

  function mimeFor(path) {
    const ext = (path.split(".").pop() || "").toLowerCase();
    return ({png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",bmp:"image/bmp",svg:"image/svg+xml",webp:"image/webp",emf:"image/emf",wmf:"image/wmf"})[ext] || "application/octet-stream";
  }
  function bytesToBase64(bytes) {
    let out = "", step = 0x8000;
    for (let i=0;i<bytes.length;i+=step) out += String.fromCharCode(...bytes.subarray(i,i+step));
    return btoa(out);
  }

  function applyRunProps(el, rPr) {
    if (!rPr) return;
    const css = [];
    if (child(rPr,"b")) el.style.fontWeight = "700";
    if (child(rPr,"i")) el.style.fontStyle = "italic";
    if (child(rPr,"u")) el.style.textDecoration = "underline";
    if (child(rPr,"strike")) el.style.textDecoration = (el.style.textDecoration ? el.style.textDecoration + " " : "") + "line-through";
    const color = attr(child(rPr,"color"),"val"); if (color && color !== "auto") el.style.color = "#" + color;
    const sz = parseInt(attr(child(rPr,"sz"),"val") || "0",10); if (sz) el.style.fontSize = (sz/2) + "pt";
    const fonts = child(rPr,"rFonts"); const f = attr(fonts,"ascii") || attr(fonts,"hAnsi"); if (f) el.style.fontFamily = `'${f.replaceAll("'","")}', sans-serif`;
    const hi = attr(child(rPr,"highlight"),"val"); if (hi) el.style.backgroundColor = hi;
    const vert = attr(child(rPr,"vertAlign"),"val"); if (vert === "superscript") el.style.verticalAlign = "super"; if (vert === "subscript") el.style.verticalAlign = "sub";
  }

  async function renderDrawing(run, ctx) {
    const blip = descendants(run,"blip")[0];
    const rid = attr(blip,"embed");
    if (!rid || !ctx.rels.has(rid)) return null;
    const rel = ctx.rels.get(rid); const path = rel.path;
    if (!path || !ctx.zip.has(path)) return null;
    const bytes = await ctx.zip.bytesOf(path);
    const img = document.createElement("img");
    img.src = `data:${mimeFor(path)};base64,${bytesToBase64(bytes)}`;
    img.alt = path.split("/").pop() || "DOCX image";
    const extent = descendants(run,"extent")[0];
    const cx = parseInt(attr(extent,"cx")||"0",10), cy=parseInt(attr(extent,"cy")||"0",10);
    if (cx) img.style.width = Math.round(cx / 9525) + "px";
    if (cy) img.style.height = Math.round(cy / 9525) + "px";
    return img;
  }

  async function renderRun(run, ctx) {
    const span = document.createElement("span");
    applyRunProps(span, child(run,"rPr"));
    let has = false;
    for (const n of Array.from(run.childNodes)) {
      const name = localName(n);
      if (name === "t" || name === "instrText") { span.appendChild(document.createTextNode(n.textContent || "")); has = true; }
      else if (name === "tab") { span.appendChild(document.createTextNode("\t")); has = true; }
      else if (name === "br" || name === "cr") { span.appendChild(document.createElement("br")); has = true; }
      else if (name === "drawing" || name === "pict") { const img = await renderDrawing(run,ctx); if (img) {span.appendChild(img); has=true;} }
    }
    return has ? span : null;
  }

  function paragraphMeta(p, ctx) {
    const pPr = child(p,"pPr");
    const styleId = attr(child(pPr,"pStyle"),"val");
    const styleName = (ctx.styles.get(styleId)?.name || styleId || "").toLowerCase();
    let tag = "p";
    const hm = styleName.match(/heading\s*([1-6])/i) || (styleId||"").match(/Heading([1-6])/i);
    if (hm) tag = "h" + hm[1];
    const numPr=child(pPr,"numPr");
    let list=null;
    if (numPr) {
      const numId=attr(child(numPr,"numId"),"val"), ilvl=attr(child(numPr,"ilvl"),"val")||"0";
      const aid=ctx.numbering.nums.get(numId), lvl=ctx.numbering.abstracts.get(aid)?.get(ilvl);
      list={numId, ilvl:+ilvl, ordered: !!lvl && lvl.fmt !== "bullet" && lvl.fmt !== "none"};
    }
    return {tag,pPr,list};
  }

  function applyParagraphProps(el,pPr) {
    if (!pPr) return;
    const jc=attr(child(pPr,"jc"),"val");
    if (jc) el.style.textAlign=({both:"justify",distribute:"justify",start:"left",end:"right"})[jc]||jc;
    const ind=child(pPr,"ind");
    const left=parseInt(attr(ind,"left")||"0",10), right=parseInt(attr(ind,"right")||"0",10), first=parseInt(attr(ind,"firstLine")||"0",10), hanging=parseInt(attr(ind,"hanging")||"0",10);
    if(left) el.style.marginLeft=(left/20)+"pt"; if(right) el.style.marginRight=(right/20)+"pt"; if(first) el.style.textIndent=(first/20)+"pt"; if(hanging) el.style.textIndent=(-hanging/20)+"pt";
    const spacing=child(pPr,"spacing"); const before=parseInt(attr(spacing,"before")||"0",10), after=parseInt(attr(spacing,"after")||"0",10), line=parseInt(attr(spacing,"line")||"0",10);
    if(before) el.style.marginTop=(before/20)+"pt"; if(after) el.style.marginBottom=(after/20)+"pt"; if(line) el.style.lineHeight=(line/240).toFixed(2);
  }

  async function renderParagraph(p,ctx,forceTag=null) {
    const meta=paragraphMeta(p,ctx); const el=document.createElement(forceTag||meta.tag); applyParagraphProps(el,meta.pPr);
    for (const n of Array.from(p.children)) {
      const name=localName(n);
      if(name==="r") { const r=await renderRun(n,ctx); if(r) el.appendChild(r); }
      else if(name==="hyperlink") {
        const rid=attr(n,"id"), rel=ctx.rels.get(rid); const a=document.createElement("a");
        if(rel?.target) a.href=rel.target; a.target="_blank"; a.rel="noopener noreferrer";
        for(const rNode of children(n,"r")){const rr=await renderRun(rNode,ctx);if(rr)a.appendChild(rr);} el.appendChild(a);
      }
      else if(name==="fldSimple") {
        for(const rNode of children(n,"r")){const rr=await renderRun(rNode,ctx);if(rr)el.appendChild(rr);}
      }
    }
    if(!el.childNodes.length) el.appendChild(document.createElement("br"));
    return {el,meta};
  }

  async function renderTable(tbl,ctx) {
    const table=document.createElement("table");
    for(const tr of children(tbl,"tr")){
      const row=document.createElement("tr");
      for(const tc of children(tr,"tc")){
        const cell=document.createElement("td");
        const gridSpan=parseInt(attr(child(child(tc,"tcPr"),"gridSpan"),"val")||"1",10); if(gridSpan>1) cell.colSpan=gridSpan;
        for(const n of Array.from(tc.children)){
          if(localName(n)==="p") cell.appendChild((await renderParagraph(n,ctx)).el);
          else if(localName(n)==="tbl") cell.appendChild(await renderTable(n,ctx));
        }
        if(!cell.childNodes.length) cell.appendChild(document.createElement("br"));
        row.appendChild(cell);
      }
      table.appendChild(row);
    }
    return table;
  }

  async function importDocx(file) {
    const buffer=await file.arrayBuffer();
    const zip=new ZipReader(buffer);
    if(!zip.has("word/document.xml")) throw new Error("word/document.xml tidak ditemukan");
    const doc=parseXml(await zip.text("word/document.xml"));
    const rels=await relationshipMap(zip,"word/_rels/document.xml.rels","word/document.xml");
    const styles=await loadStyles(zip); const numbering=await loadNumbering(zip);
    const ctx={zip,rels,styles,numbering};
    const body=descendants(doc,"body")[0]; if(!body) throw new Error("Body DOCX tidak ditemukan");
    const out=document.createElement("div");
    let currentList=null, currentKey=null;
    function closeList(){currentList=null;currentKey=null;}
    for(const n of Array.from(body.children)){
      const name=localName(n);
      if(name==="p"){
        const meta=paragraphMeta(n,ctx);
        if(meta.list){
          const key=`${meta.list.numId}:${meta.list.ilvl}:${meta.list.ordered}`;
          if(key!==currentKey){currentList=document.createElement(meta.list.ordered?"ol":"ul");out.appendChild(currentList);currentKey=key;}
          const item=(await renderParagraph(n,ctx,"li")).el; currentList.appendChild(item);
        } else { closeList(); out.appendChild((await renderParagraph(n,ctx)).el); }
      } else if(name==="tbl"){ closeList(); out.appendChild(await renderTable(n,ctx)); }
    }
    return {html:out.innerHTML, warnings:[], meta:{fileName:file.name, styleCount:styles.size, relationshipCount:rels.size}};
  }

  window.FydeDocx={DOCX_MIME,importDocx};
})();
