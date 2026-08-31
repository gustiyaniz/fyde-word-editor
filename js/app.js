(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const editor = $("editor");
  const page = $("page");
  const workspace = $("workspace");
  const title = $("documentTitle");
  const fileInput = $("fileInput");
  const imageInput = $("imageInput");
  let currentFileHandle = null;
  let currentFileType = "html";
  let deferredInstallPrompt = null;
  let dirty = false;
  let autosaveTimer = null;

  const stateKey = "fydeword-stage3-autosave";
  const prefsKey = "fydeword-stage3-prefs";

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
        html: editor.innerHTML,
        savedAt: Date.now()
      }));
      $("saveState").textContent = "Autosaved";
    }, 600);
  }

  function updateStats() {
    const text = editor.innerText.replace(/\u00A0/g, " ").trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    $("wordCount").textContent = `Words: ${words}`;
    $("charCount").textContent = `Characters: ${text.length}`;

    const paperHeightPx = page.dataset.orientation === "landscape" ? 794 : 1123;
    const contentHeight = Math.max(editor.scrollHeight, paperHeightPx);
    const pages = Math.max(1, Math.ceil(contentHeight / paperHeightPx));
    $("pageCount").textContent = `Page 1 of ${pages}`;
  }

  function exec(cmd, value = null) {
    editor.focus();
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
    editor.innerHTML = "<p><br></p>";
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
        editor.innerHTML = result.html || "<p><br></p>";
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
      editor.innerHTML = "";
      const p = document.createElement("p");
      p.textContent = text;
      editor.appendChild(p);
    } else {
      currentFileType = "html";
      const parsed = new DOMParser().parseFromString(text, "text/html");
      editor.innerHTML = parsed.body?.innerHTML || text;
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
<body>${editor.innerHTML}</body>
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
      orientation: page.dataset.orientation || "portrait",
      marginTwips:{top:tw(mm.top),right:tw(mm.right),bottom:tw(mm.bottom),left:tw(mm.left)}
    };
  }

  async function buildDocx() {
    if (!window.FydeDocxExport) throw new Error("DOCX exporter tidak tersedia");
    return await window.FydeDocxExport.exportDocx(editor, pageOptions());
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
    editor.focus();
    const sel = window.getSelection();
    let node = sel?.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const block = node?.closest?.("p,h1,h2,h3,h4,h5,h6,li,td");
    if (block && editor.contains(block)) block.style.lineHeight = String(n);
    else editor.style.lineHeight = String(n);
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
  });

  const marginMap = {
    normal: "25.4mm",
    narrow: "12.7mm",
    moderate: "19.05mm 25.4mm",
    wide: "25.4mm 50.8mm"
  };
  $("marginPreset").addEventListener("change", e => {
    editor.style.padding = marginMap[e.target.value] || marginMap.normal;
    savePrefs();
    setDirty();
  });

  $("orientation").addEventListener("change", e => {
    page.dataset.orientation = e.target.value;
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

    // Chromium/FydeOS: CSS zoom participates in layout, so the page keeps
    // its real scrollable size and never visually overlaps the status bar.
    if ("zoom" in page.style) {
      page.style.zoom = `${value}%`;
      page.style.transform = "none";
      page.style.marginBottom = "0";
    } else {
      // Fallback for engines without CSS zoom.
      page.style.zoom = "";
      page.style.transform = `scale(${value / 100})`;
      page.style.transformOrigin = "top center";
      page.style.marginBottom = `${Math.max(0, (value - 100) * 8)}px`;
    }
    savePrefs();
  }

  $("zoomRange").addEventListener("input", e => setZoom(+e.target.value));
  $("zoomOutBtn").addEventListener("click", () => setZoom(+$("zoomRange").value - 10));
  $("zoomInBtn").addEventListener("click", () => setZoom(+$("zoomRange").value + 10));

  function savePrefs() {
    localStorage.setItem(prefsKey, JSON.stringify({
      zoom: +$("zoomRange").value,
      orientation: page.dataset.orientation,
      margin: $("marginPreset").value,
      rulerHidden: $("ruler").classList.contains("hidden"),
      noShadow: workspace.classList.contains("no-shadow")
    }));
  }

  function restorePrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(prefsKey) || "{}");
      if (p.zoom) setZoom(p.zoom);
      if (p.orientation) {
        page.dataset.orientation = p.orientation;
        $("orientation").value = p.orientation;
      }
      if (p.margin && marginMap[p.margin]) {
        $("marginPreset").value = p.margin;
        editor.style.padding = marginMap[p.margin];
      }
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

  editor.addEventListener("input", () => {
    setDirty();
    updateStats();
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

  async function handleLaunchQueue() {
    if (!("launchQueue" in window)) return;
    launchQueue.setConsumer(async launchParams => {
      const fileHandle = launchParams.files?.[0];
      if (!fileHandle) return;
      currentFileHandle = fileHandle;
      const file = await fileHandle.getFile();
      await loadFile(file);
    });
  }

  function restoreAutosave() {
    try {
      const saved = JSON.parse(localStorage.getItem(stateKey) || "null");
      if (!saved?.html) return;
      const ageHours = (Date.now() - saved.savedAt) / 3600000;
      if (ageHours < 168 && confirm(`Pulihkan autosave "${saved.title}"?`)) {
        title.value = saved.title || "Document1";
        editor.innerHTML = saved.html;
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
  updateStats();
  handleLaunchQueue();
  editor.focus();
})();
