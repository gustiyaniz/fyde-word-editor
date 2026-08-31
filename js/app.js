(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const editor = $("editor");
  const page = $("page");
  const workspace = $("workspace");
  const documentCanvas = $("documentCanvas");
  const title = $("documentTitle");
  const fileInput = $("fileInput");
  const imageInput = $("imageInput");
  let currentFileHandle = null;
  let currentFileType = "html";
  let deferredInstallPrompt = null;
  let dirty = false;
  let autosaveTimer = null;

  const stateKey = "fydeword-stage5-autosave";
  const prefsKey = "fydeword-stage5-prefs";
  let headerText = "";
  let footerText = "";
  let pageNumberMode = "center";
  let activeEditor = editor;
  let paginationLock = false;


  function pageBodies() {
    return Array.from(documentCanvas.querySelectorAll(".page-body"));
  }
  function pages() {
    return Array.from(documentCanvas.querySelectorAll(".document-page"));
  }
  function collectDocumentHTML() {
    const ps = pages();
    return ps.map((p, i) => {
      const body = p.querySelector(".page-body");
      const forced = p.dataset.forcedBreak === "1" && i < ps.length - 1 ? '<hr class="page-break">' : "";
      return body.innerHTML + forced;
    }).join("");
  }
  function collectDocumentText() {
    return pageBodies().map(b => b.innerText || "").join("\n");
  }
  function exportContainer() {
    const temp = document.createElement("div");
    const ps = pages();
    ps.forEach((p, i) => {
      const body = p.querySelector(".page-body");
      for (const node of Array.from(body.childNodes)) temp.appendChild(node.cloneNode(true));
      if (p.dataset.forcedBreak === "1" && i < ps.length - 1) {
        const hr = document.createElement("hr");
        hr.className = "page-break";
        temp.appendChild(hr);
      }
    });
    return temp;
  }
  function updatePageChrome(article, index) {
    const header = article.querySelector(".page-header");
    const footer = article.querySelector(".footer-text");
    const number = article.querySelector(".page-number");
    header.textContent = headerText;
    footer.textContent = footerText;
    if (pageNumberMode === "none") {
      number.textContent = "";
      number.removeAttribute("data-align");
    } else {
      number.textContent = String(index);
      number.dataset.align = pageNumberMode;
    }
    article.dataset.page = String(index);
  }
  function updateAllPageChrome() {
    pages().forEach((p, i) => updatePageChrome(p, i + 1));
  }
  function makePage(index) {
    const article = document.createElement("article");
    article.className = "page document-page";
    article.dataset.orientation = documentCanvas.dataset.orientation || "portrait";
    article.dataset.page = String(index);
    article.innerHTML = `<div class="page-header" data-role="header"></div>
      <div class="editor page-body" contenteditable="true" spellcheck="true"></div>
      <div class="page-footer" data-role="footer"><span class="footer-text"></span><span class="page-number"></span></div>`;
    documentCanvas.appendChild(article);
    updatePageChrome(article, index);
    return article;
  }
  function setDocumentHTML(html) {
    paginationLock = true;
    pages().slice(1).forEach(p => p.remove());
    delete pages()[0].dataset.forcedBreak;
    editor.innerHTML = html || "<p><br></p>";
    activeEditor = editor;
    paginationLock = false;
    requestAnimationFrame(() => paginateDocument(true));
  }
  function bodyOverflowing(body) {
    return body.scrollHeight > body.clientHeight + 2;
  }
  function splitSimpleParagraph(block, body, nextBody) {
    if (!block || !/^(P|H[1-6])$/.test(block.tagName) || block.children.length) return false;
    const text = block.textContent || "";
    const words = text.split(/(\s+)/);
    if (words.length < 6) return false;
    let lo = 1, hi = words.length - 1, fit = 0;
    const original = text;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      block.textContent = words.slice(0, mid).join("");
      if (!bodyOverflowing(body)) { fit = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    if (!fit || fit >= words.length) { block.textContent = original; return false; }
    const rest = words.slice(fit).join("").replace(/^\s+/, "");
    block.textContent = words.slice(0, fit).join("").replace(/\s+$/, "");
    const clone = block.cloneNode(false);
    clone.textContent = rest;
    nextBody.prepend(clone);
    return true;
  }
  function ensureNextPage(pageIndex) {
    const ps = pages();
    return ps[pageIndex + 1] || makePage(ps.length + 1);
  }
  function normalizeEmptyBody(body) {
    if (!body.children.length && !(body.textContent || "").trim()) body.innerHTML = "<p><br></p>";
  }
  function paginateDocument(force = false) {
    if (paginationLock || document.body.classList.contains("web-layout")) return;
    paginationLock = true;
    try {
      pageBodies().slice(1).forEach(b => {
        if (b.children.length === 1 && b.firstElementChild?.tagName === "P" && !(b.innerText || "").trim()) b.innerHTML = "";
      });

      let changed = true, guard = 0;
      while (changed && guard++ < 50) {
        changed = false;
        for (let i = 0; i < pageBodies().length; i++) {
          const body = pageBodies()[i];
          const br = body.querySelector(":scope > hr.page-break");
          if (!br) continue;
          const next = ensureNextPage(i).querySelector(".page-body");
          let n = br.nextSibling;
          const moving = [];
          while (n) { moving.push(n); n = n.nextSibling; }
          moving.forEach(node => next.appendChild(node));
          br.remove();
          pages()[i].dataset.forcedBreak = "1";
          changed = true;
        }
      }

      for (let i = 0; i < pageBodies().length; i++) {
        const body = pageBodies()[i];
        let guard2 = 0;
        pages()[i].classList.remove("page-overflow-warning");
        while (bodyOverflowing(body) && guard2++ < 200) {
          const next = ensureNextPage(i).querySelector(".page-body");
          const last = body.lastElementChild;
          if (!last) break;
          if (body.children.length === 1) {
            if (!splitSimpleParagraph(last, body, next)) {
              pages()[i].classList.add("page-overflow-warning");
              break;
            }
          } else {
            next.prepend(last);
          }
        }
      }

      for (let i = 0; i < pages().length - 1; i++) {
        const currentPage = pages()[i];
        if (currentPage.dataset.forcedBreak === "1") continue;
        const current = currentPage.querySelector(".page-body");
        const next = pages()[i + 1].querySelector(".page-body");
        let guard3 = 0;
        while (next.firstElementChild && guard3++ < 100) {
          const candidate = next.firstElementChild;
          current.appendChild(candidate);
          if (bodyOverflowing(current)) {
            next.prepend(candidate);
            break;
          }
        }
      }

      let ps = pages();
      while (ps.length > 1) {
        const last = ps[ps.length - 1];
        const b = last.querySelector(".page-body");
        if ((b.innerText || "").trim() || b.querySelector("img,table,hr")) break;
        last.remove();
        ps = pages();
      }
      pageBodies().forEach(normalizeEmptyBody);
      updateAllPageChrome();
      updateStats();
    } finally {
      paginationLock = false;
    }
  }
  function currentPageNumber() {
    const ps = pages();
    const focused = document.activeElement?.closest?.(".document-page");
    if (focused) return Math.max(1, ps.indexOf(focused) + 1);
    const wr = workspace.getBoundingClientRect();
    const center = wr.top + wr.height / 2;
    let best = 0, dist = Infinity;
    ps.forEach((p, i) => {
      const r = p.getBoundingClientRect();
      const d = Math.abs((r.top + r.bottom) / 2 - center);
      if (d < dist) { dist = d; best = i; }
    });
    return best + 1;
  }
  function highlightActivePage() {
    const n = currentPageNumber();
    pages().forEach((p, i) => p.classList.toggle("active-page", i === n - 1));
    return n;
  }

  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.add("hidden"), 2200);
  }

  function setDirty(value = true) {
    dirty = value;
    $("saveState").textContent = dirty ? "Belum disimpan" : "Tersimpan lokal";
    if (value) scheduleAutosave();
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      localStorage.setItem(stateKey, JSON.stringify({
        title: title.value || "Document1",
        html: collectDocumentHTML(),
        savedAt: Date.now()
      }));
      $("saveState").textContent = "Autosaved";
    }, 600);
  }

  function updateStats() {
    const text = collectDocumentText().replace(/\u00A0/g, " ").trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    $("wordCount").textContent = `Words: ${words}`;
    $("charCount").textContent = `Characters: ${text.length}`;
    const total = Math.max(1, pages().length);
    const current = Math.min(total, highlightActivePage());
    $("pageCount").textContent = `Page ${current} of ${total}`;
  }

  function exec(cmd, value = null) {
    const target = activeEditor && documentCanvas.contains(activeEditor) ? activeEditor : editor;
    if (!target.contains(window.getSelection()?.anchorNode)) target.focus();
    document.execCommand(cmd, false, value);
    setDirty();
    updateStats();
  }

  document.querySelectorAll("[data-command]").forEach(btn => {
    btn.addEventListener("click", () => exec(btn.dataset.command));
  });

  document.querySelectorAll("[data-block]").forEach(btn => {
    btn.addEventListener("click", () => exec("formatBlock", btn.dataset.block));
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".ribbon-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      $(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });

  $("fontName").addEventListener("change", e => exec("fontName", e.target.value));
  $("fontSize").addEventListener("change", e => {
    const pxMap = {8:1,9:1,10:2,11:2,12:3,14:4,16:4,18:5,20:5,24:6,28:6,32:6,36:7,48:7,72:7};
    exec("fontSize", pxMap[e.target.value] || 3);
  });
  $("foreColor").addEventListener("input", e => exec("foreColor", e.target.value));
  $("hiliteColor").addEventListener("input", e => exec("hiliteColor", e.target.value));

  $("pasteBtn").addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      exec("insertText", text);
    } catch {
      toast("Gunakan Ctrl+V untuk Paste");
    }
  });

  async function newDocument() {
    if (dirty && !confirm("Dokumen belum disimpan. Buat dokumen baru?")) return;
    currentFileHandle = null;
    currentFileType = "docx";
    title.value = "Document1";
    setDocumentHTML("<p><br></p>");
    setDirty(false);
    updateStats();
    editor.focus();
  }

  $("newBtn").addEventListener("click", newDocument);

  async function openWithPicker() {
    if ("showOpenFilePicker" in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{
            description: "Dokumen Fyde Word",
            accept: {
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
              "text/html": [".html", ".htm"],
              "text/plain": [".txt"]
            }
          }]
        });
        currentFileHandle = handle;
        const file = await handle.getFile();
        await loadFile(file);
        return;
      } catch (err) {
        if (err?.name !== "AbortError") toast("Gagal membuka file");
        return;
      }
    }
    fileInput.click();
  }

  $("openBtn").addEventListener("click", openWithPicker);
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (file) await loadFile(file);
    fileInput.value = "";
  });

  async function loadFile(file) {
    const name = file.name || "Document1";
    title.value = name.replace(/\.(docx|html?|txt)$/i, "");

    if (/\.docx$/i.test(name) || file.type === window.FydeDocx?.DOCX_MIME) {
      if (!window.FydeDocx) throw new Error("DOCX importer tidak tersedia");
      toast("Mengimpor DOCX…");
      try {
        const result = await window.FydeDocx.importDocx(file);
        setDocumentHTML(result.html || "<p><br></p>");
        currentFileType = "docx";
        setDirty(false);
        updateStats();
        toast(`DOCX berhasil diimpor: ${name}`);
      } catch (err) {
        console.error(err);
        toast("Gagal mengimpor DOCX");
        alert("DOCX tidak dapat dibuka.\n\n" + (err?.message || err));
      }
      return;
    }

    const text = await file.text();
    if (/\.txt$/i.test(name) || file.type === "text/plain") {
      currentFileType = "txt";
      const p = document.createElement("p");
      p.textContent = text;
      setDocumentHTML(p.outerHTML);
    } else {
      currentFileType = "html";
      const parsed = new DOMParser().parseFromString(text, "text/html");
      setDocumentHTML(parsed.body?.innerHTML || text);
    }
    setDirty(false);
    updateStats();
    toast(`Membuka ${name}`);
  }

  function documentHtml() {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title.value || "Document")}</title>
<style>
body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.15;max-width:159mm;margin:25.4mm auto}
table{border-collapse:collapse}td,th{border:1px solid #555;padding:6px}
img{max-width:100%;height:auto}.page-break{page-break-after:always;border:0}
</style>
</head>
<body>${collectDocumentHTML()}</body>
</html>`;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }

  async function saveToHandle(handle, content) {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  function pageOptions() {
    const preset = $("marginPreset").value;
    const mm = {
      normal: {top:25.4,right:25.4,bottom:25.4,left:25.4},
      narrow: {top:12.7,right:12.7,bottom:12.7,left:12.7},
      moderate: {top:19.05,right:25.4,bottom:19.05,left:25.4},
      wide: {top:25.4,right:50.8,bottom:25.4,left:50.8}
    }[preset] || {top:25.4,right:25.4,bottom:25.4,left:25.4};
    const tw = x => Math.round(x / 25.4 * 1440);
    return {
      title: title.value || "Document1",
      orientation: documentCanvas.dataset.orientation || "portrait",
      headerText,
      footerText,
      pageNumberMode,
      marginTwips:{top:tw(mm.top),right:tw(mm.right),bottom:tw(mm.bottom),left:tw(mm.left)}
    };
  }

  async function buildDocx() {
    if (!window.FydeDocxExport) throw new Error("DOCX exporter tidak tersedia");
    return await window.FydeDocxExport.exportDocx(exportContainer(), pageOptions());
  }

  async function saveDocx(forceSaveAs = false) {
    const blob = await buildDocx();
    if (!forceSaveAs && currentFileHandle && "createWritable" in currentFileHandle) {
      try {
        const writable = await currentFileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        currentFileType = "docx";
        setDirty(false);
        toast("DOCX berhasil disimpan");
        return;
      } catch (err) {
        console.error(err);
        toast("Tidak dapat menulis ke DOCX asli; gunakan Save As");
        forceSaveAs = true;
      }
    }

    if ("showSaveFilePicker" in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: `${title.value || "Document1"}.docx`,
          types: [{
            description: "Word Document (.docx)",
            accept: {"application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"]}
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        currentFileHandle = handle;
        currentFileType = "docx";
        setDirty(false);
        toast("DOCX berhasil disimpan");
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.error(err);
      }
    }

    downloadBlob(blob, `${title.value || "Document1"}.docx`, window.FydeDocxExport.DOCX_MIME);
    currentFileType = "docx";
    setDirty(false);
  }

  async function saveHtml(forceSaveAs = false) {
    const html = documentHtml();
    if (!forceSaveAs && currentFileHandle && currentFileType === "html" && "createWritable" in currentFileHandle) {
      try {
        await saveToHandle(currentFileHandle, html);
        setDirty(false);
        toast("HTML berhasil disimpan");
        return;
      } catch {}
    }
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: `${title.value || "Document1"}.html`,
          types: [{description:"HTML Document",accept:{"text/html":[".html"]}}]
        });
        await saveToHandle(handle, html);
        currentFileHandle = handle;
        currentFileType = "html";
        setDirty(false);
        toast("HTML berhasil disimpan");
        return;
      } catch (err) { if (err?.name === "AbortError") return; }
    }
    downloadBlob(html, `${title.value || "Document1"}.html`, "text/html");
    setDirty(false);
  }

  async function saveDocument(forceSaveAs = false) {
    try {
      if (currentFileType === "html" && !forceSaveAs) return await saveHtml(false);
      return await saveDocx(forceSaveAs);
    } catch (err) {
      console.error(err);
      toast("Gagal menyimpan dokumen");
      alert("Dokumen tidak dapat disimpan.\n\n" + (err?.message || err));
    }
  }

  $("saveBtn").addEventListener("click", () => saveDocument(false));
  $("saveAsBtn").addEventListener("click", () => saveDocument(true));
  $("exportDocxBtn")?.addEventListener("click", () => saveDocx(true));
  $("exportHtmlBtn").addEventListener("click", () => {
    downloadBlob(documentHtml(), `${title.value || "Document1"}.html`, "text/html");
  });

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $("printBtn").addEventListener("click", () => window.print());

  $("docxInfoBtn")?.addEventListener("click", () => {
    alert("DOCX Import / Export v1 — Stage 3\n\nOpen: paragraf, heading, format teks, alignment, list, hyperlink, tabel dasar, dan gambar.\n\nSave DOCX: paragraf, heading, bold/italic/underline/strike, font/size/color/highlight, alignment, list, hyperlink, tabel, gambar data URL, page break, margin, dan orientation.\n\nFitur Word kompleks seperti comments, tracked changes, SmartArt, chart, text box dan macro belum dipertahankan.");
  });

  $("lineSpacingBtn")?.addEventListener("click", () => {
    const value = prompt("Line spacing (contoh 1, 1.15, 1.5, 2):", "1.15");
    const n = parseFloat(value);
    if (!n || n < 0.8 || n > 4) return;
    activeEditor.focus();
    const sel = window.getSelection();
    let node = sel?.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const block = node?.closest?.("p,h1,h2,h3,h4,h5,h6,li,td");
    if (block && documentCanvas.contains(block)) block.style.lineHeight = String(n);
    else activeEditor.style.lineHeight = String(n);
    setDirty();
  });

  $("insertImageBtn").addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => exec("insertImage", reader.result);
    reader.readAsDataURL(file);
    imageInput.value = "";
  });

  $("insertLinkBtn").addEventListener("click", () => {
    const url = prompt("Masukkan URL:");
    if (url) exec("createLink", url);
  });

  $("insertTableBtn").addEventListener("click", () => {
    const rows = Math.min(12, Math.max(1, parseInt(prompt("Jumlah baris:", "3") || "0")));
    const cols = Math.min(8, Math.max(1, parseInt(prompt("Jumlah kolom:", "3") || "0")));
    if (!rows || !cols) return;
    let html = "<table><tbody>";
    for (let r = 0; r < rows; r++) {
      html += "<tr>";
      for (let c = 0; c < cols; c++) html += "<td><br></td>";
      html += "</tr>";
    }
    html += "</tbody></table><p><br></p>";
    exec("insertHTML", html);
  });

  $("pageBreakBtn").addEventListener("click", () => {
    exec("insertHTML", '<hr class="page-break"><p><br></p>');
    requestAnimationFrame(() => paginateDocument(true));
  });

  $("headerBtn")?.addEventListener("click", () => {
    const v = prompt("Header dokumen (kosongkan untuk menghapus):", headerText);
    if (v === null) return;
    headerText = v.trim();
    updateAllPageChrome(); savePrefs(); setDirty();
  });

  $("footerBtn")?.addEventListener("click", () => {
    const v = prompt("Footer dokumen (kosongkan untuk menghapus):", footerText);
    if (v === null) return;
    footerText = v.trim();
    updateAllPageChrome(); savePrefs(); setDirty();
  });

  $("pageNumberBtn")?.addEventListener("click", () => {
    const v = prompt("Posisi nomor halaman: none, left, center, right", pageNumberMode);
    if (v === null) return;
    const mode = v.trim().toLowerCase();
    if (!["none","left","center","right"].includes(mode)) { toast("Gunakan none, left, center, atau right"); return; }
    pageNumberMode = mode;
    updateAllPageChrome(); savePrefs(); setDirty();
  });

  const marginMap = {
    normal: "25.4mm",
    narrow: "12.7mm",
    moderate: "19.05mm 25.4mm",
    wide: "25.4mm 50.8mm"
  };
  function applyMarginPreset(preset) {
    const map = {
      normal:["25.4mm","25.4mm","25.4mm","25.4mm"],
      narrow:["12.7mm","12.7mm","12.7mm","12.7mm"],
      moderate:["19.05mm","25.4mm","19.05mm","25.4mm"],
      wide:["25.4mm","50.8mm","25.4mm","50.8mm"]
    };
    const m = map[preset] || map.normal;
    documentCanvas.style.setProperty("--margin-top",m[0]);
    documentCanvas.style.setProperty("--margin-right",m[1]);
    documentCanvas.style.setProperty("--margin-bottom",m[2]);
    documentCanvas.style.setProperty("--margin-left",m[3]);
  }

  $("marginPreset").addEventListener("change", e => {
    applyMarginPreset(e.target.value);
    requestAnimationFrame(() => paginateDocument(true));
    savePrefs();
    setDirty();
  });

  $("orientation").addEventListener("change", e => {
    documentCanvas.dataset.orientation = e.target.value;
    pages().forEach(p => p.dataset.orientation = e.target.value);
    requestAnimationFrame(() => paginateDocument(true));
    savePrefs();
    updateStats();
  });

  $("toggleRulerBtn").addEventListener("click", () => {
    $("ruler").classList.toggle("hidden");
    savePrefs();
  });

  $("toggleGridBtn").addEventListener("click", () => {
    workspace.classList.toggle("no-shadow");
    savePrefs();
  });

  $("printLayoutBtn")?.addEventListener("click", () => {
    document.body.classList.remove("web-layout");
    $("printLayoutBtn").classList.add("view-active");
    $("webLayoutBtn")?.classList.remove("view-active");
    requestAnimationFrame(() => paginateDocument(true));
  });
  $("webLayoutBtn")?.addEventListener("click", () => {
    const merged = collectDocumentHTML();
    paginationLock = true;
    pages().slice(1).forEach(p => p.remove());
    delete pages()[0].dataset.forcedBreak;
    editor.innerHTML = merged;
    activeEditor = editor;
    paginationLock = false;
    document.body.classList.add("web-layout");
    $("webLayoutBtn").classList.add("view-active");
    $("printLayoutBtn")?.classList.remove("view-active");
    updateStats();
  });
  $("focusModeBtn").addEventListener("click", () => {
    document.body.classList.toggle("focus-mode");
  });

  $("fullscreenBtn").addEventListener("click", async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
    else await document.exitFullscreen?.();
  });

  function setZoom(value) {
    value = Math.min(160, Math.max(60, value));
    $("zoomRange").value = value;
    $("zoomValue").textContent = `${value}%`;
    if ("zoom" in documentCanvas.style) {
      documentCanvas.style.zoom = `${value}%`;
      documentCanvas.style.transform = "none";
    } else {
      documentCanvas.style.zoom = "";
      documentCanvas.style.transform = `scale(${value / 100})`;
      documentCanvas.style.transformOrigin = "top center";
    }
    savePrefs();
  }

  $("zoomRange").addEventListener("input", e => setZoom(+e.target.value));
  $("zoomOutBtn").addEventListener("click", () => setZoom(+$("zoomRange").value - 10));
  $("zoomInBtn").addEventListener("click", () => setZoom(+$("zoomRange").value + 10));

  function savePrefs() {
    localStorage.setItem(prefsKey, JSON.stringify({
      zoom: +$("zoomRange").value,
      orientation: documentCanvas.dataset.orientation,
      margin: $("marginPreset").value,
      rulerHidden: $("ruler").classList.contains("hidden"),
      noShadow: workspace.classList.contains("no-shadow"),
      headerText,
      footerText,
      pageNumberMode
    }));
  }

  function restorePrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(prefsKey) || "{}");
      if (p.zoom) setZoom(p.zoom);
      if (p.orientation) {
        documentCanvas.dataset.orientation = p.orientation;
        pages().forEach(pg => pg.dataset.orientation = p.orientation);
        $("orientation").value = p.orientation;
      }
      if (p.margin && marginMap[p.margin]) {
        $("marginPreset").value = p.margin;
        applyMarginPreset(p.margin);
      }
      headerText = p.headerText || "";
      footerText = p.footerText || "";
      pageNumberMode = p.pageNumberMode || "center";
      updateAllPageChrome();
      if (p.rulerHidden) $("ruler").classList.add("hidden");
      if (p.noShadow) workspace.classList.add("no-shadow");
    } catch {}
  }

  $("findBtn").addEventListener("click", openFind);
  $("closeFindBtn").addEventListener("click", () => $("findBar").classList.add("hidden"));
  $("findNextBtn").addEventListener("click", findNext);
  $("findInput").addEventListener("keydown", e => {
    if (e.key === "Enter") findNext();
    if (e.key === "Escape") $("findBar").classList.add("hidden");
  });

  function openFind() {
    $("findBar").classList.remove("hidden");
    $("findInput").focus();
    $("findInput").select();
  }

  function findNext() {
    const q = $("findInput").value.trim();
    if (!q) return;
    const found = window.find(q, false, false, true, false, true, false);
    if (!found) toast("Teks tidak ditemukan lagi");
  }

  documentCanvas.addEventListener("focusin", e => {
    const body = e.target.closest?.(".page-body");
    if (body) { activeEditor = body; updateStats(); }
  });
  documentCanvas.addEventListener("click", e => {
    const body = e.target.closest?.(".page-body");
    if (body) { activeEditor = body; updateStats(); }
    if (e.target.closest?.(".page-header") && e.detail === 2) $("headerBtn")?.click();
    if (e.target.closest?.(".page-footer") && e.detail === 2) $("footerBtn")?.click();
  });
  documentCanvas.addEventListener("input", e => {
    if (!e.target.closest?.(".page-body")) return;
    setDirty();
    updateStats();
    clearTimeout(documentCanvas._paginateTimer);
    documentCanvas._paginateTimer = setTimeout(() => paginateDocument(), 80);
  });
  workspace.addEventListener("scroll", () => {
    clearTimeout(workspace._pageTimer);
    workspace._pageTimer = setTimeout(updateStats, 60);
  });

  title.addEventListener("input", () => setDirty());

  window.addEventListener("keydown", e => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();

    if (key === "s") {
      e.preventDefault();
      saveDocument(e.shiftKey);
    } else if (key === "o") {
      e.preventDefault();
      openWithPicker();
    } else if (key === "n") {
      e.preventDefault();
      newDocument();
    } else if (key === "f") {
      e.preventDefault();
      openFind();
    }
  });

  window.addEventListener("beforeunload", e => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    $("installBtn").classList.remove("hidden");
  });

  $("installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("installBtn").classList.add("hidden");
  });

  function restoreAutosave() {
    try {
      const saved = JSON.parse(localStorage.getItem(stateKey) || "null");
      if (!saved?.html) return;
      const ageHours = (Date.now() - saved.savedAt) / 3600000;
      if (ageHours < 168 && confirm(`Pulihkan autosave "${saved.title}"?`)) {
        title.value = saved.title || "Document1";
        setDocumentHTML(saved.html);
        dirty = true;
        $("saveState").textContent = "Dipulihkan dari autosave";
      }
    } catch {}
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(console.error);
    });
  }

  restorePrefs();
  restoreAutosave();
  updateAllPageChrome();
  requestAnimationFrame(() => paginateDocument(true));
  updateStats();
  editor.focus();

  // ===== Stage 4: FydeOS integration =====
  const recentKey = "fydeword-stage5-recent";
  const recentHandles = new Map();
  function getRecent(){try{return JSON.parse(localStorage.getItem(recentKey)||"[]")}catch{return[]}}
  function saveRecent(items){localStorage.setItem(recentKey,JSON.stringify(items.slice(0,12)));renderRecent()}
  function addRecent(name,kind="document"){let a=getRecent().filter(x=>x.name!==name);a.unshift({name,kind,openedAt:Date.now()});saveRecent(a)}
  function formatRecentTime(ts){try{return new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short"}).format(new Date(ts))}catch{return new Date(ts).toLocaleString()}}
  function renderRecent(){
    const list=$("recentList");if(!list)return;const items=getRecent();
    if(!items.length){list.innerHTML='<div class="recent-empty">Belum ada dokumen terbaru.<br><small>Buka DOCX, HTML, atau TXT untuk menambahkannya.</small></div>';return}
    list.innerHTML="";
    items.forEach((item,index)=>{
      const row=document.createElement("div");row.className="recent-item";
      const icon=document.createElement("span");icon.className="recent-icon";icon.textContent=/\.docx$/i.test(item.name)?"📝":"📄";
      const meta=document.createElement("button");meta.className="recent-meta";meta.style.border="0";meta.style.background="transparent";meta.style.textAlign="left";
      meta.innerHTML=`<span class="recent-name">${escapeHtml(item.name)}</span><span class="recent-sub">${formatRecentTime(item.openedAt)}</span>`;
      meta.onclick=async()=>{const h=recentHandles.get(item.name);if(h){try{let p=await h.queryPermission?.({mode:"readwrite"});if(p==="granted"||(await h.requestPermission?.({mode:"readwrite"}))==="granted"){currentFileHandle=h;await loadFile(await h.getFile());$("recentPanel").classList.add("hidden");return}}catch{}}$("recentPanel").classList.add("hidden");toast("Pilih file kembali untuk memberi izin akses");openWithPicker()};
      const rm=document.createElement("button");rm.className="recent-remove";rm.textContent="✕";rm.onclick=()=>{let a=getRecent();a.splice(index,1);saveRecent(a)};
      row.append(icon,meta,rm);list.appendChild(row)
    })
  }
  $("recentBtn")?.addEventListener("click",()=>{renderRecent();$("recentPanel").classList.remove("hidden")});
  $("closeRecentBtn")?.addEventListener("click",()=>$("recentPanel").classList.add("hidden"));
  $("clearRecentBtn")?.addEventListener("click",()=>{localStorage.removeItem(recentKey);recentHandles.clear();renderRecent()});

  let dragDepth=0;
  window.addEventListener("dragenter",e=>{if(![...(e.dataTransfer?.types||[])].includes("Files"))return;e.preventDefault();dragDepth++;$("dropOverlay")?.classList.remove("hidden");workspace.classList.add("drag-active")});
  window.addEventListener("dragover",e=>{if([...(e.dataTransfer?.types||[])].includes("Files")){e.preventDefault();e.dataTransfer.dropEffect="copy"}});
  window.addEventListener("dragleave",e=>{if(![...(e.dataTransfer?.types||[])].includes("Files"))return;dragDepth=Math.max(0,dragDepth-1);if(!dragDepth){$("dropOverlay")?.classList.add("hidden");workspace.classList.remove("drag-active")}});
  window.addEventListener("drop",async e=>{e.preventDefault();dragDepth=0;$("dropOverlay")?.classList.add("hidden");workspace.classList.remove("drag-active");const f=e.dataTransfer?.files?.[0];if(!f)return;if(!/\.(docx|html?|txt)$/i.test(f.name)){toast("Format belum didukung");return}currentFileHandle=null;await loadFile(f)});

  const originalLoadFile=loadFile;
  loadFile=async function(file){await originalLoadFile(file);if(file?.name){addRecent(file.name,/\.docx$/i.test(file.name)?"docx":"text");if(currentFileHandle)recentHandles.set(file.name,currentFileHandle)}};

  if("launchQueue" in window){
    launchQueue.setConsumer(async params=>{const h=params.files?.[0];if(!h)return;try{currentFileHandle=h;const f=await h.getFile();recentHandles.set(f.name,h);await loadFile(f);toast(`Open with Fyde Word: ${f.name}`)}catch(err){console.error(err);toast("Gagal membuka file dari FydeOS")}})
  }
  renderRecent();

  const startupParams=new URLSearchParams(location.search);
  if(startupParams.get("new")==="1") setTimeout(()=>newDocument(),0);
  if(startupParams.get("open")==="1") setTimeout(()=>openWithPicker(),0);

})();
