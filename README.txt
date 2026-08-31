FYDE WORD — STAGE 2
====================

Stage 2 menambahkan DOCX Import v1 di atas fondasi Stage 1.

FITUR BARU STAGE 2
- Membuka .docx langsung dari Open.
- File handler manifest untuk .docx.
- Parser ZIP + OOXML lokal bawaan aplikasi; tidak memakai CDN saat runtime.
- Import paragraf dan Heading 1-6.
- Import bold, italic, underline, strikethrough.
- Import font, ukuran font, warna, highlight, superscript/subscript.
- Import alignment, indent, paragraph spacing, line spacing.
- Import bullets/numbering umum.
- Import hyperlink.
- Import tabel dasar termasuk colspan sederhana.
- Import gambar raster yang tertanam di DOCX sebagai data URL.
- Toolbar Subscript/Superscript.
- Kontrol line spacing sederhana.

KEAMANAN FILE DOCX
Stage 2 adalah IMPORT DOCX, bukan DOCX round-trip penuh. Jika dokumen .docx dibuka lalu diedit, Ctrl+S akan diarahkan ke Save As HTML. Aplikasi TIDAK menimpa .docx asli dengan HTML. Ini disengaja agar file DOCX asli tidak rusak.

FORMAT
DOCX: Open/Edit = ya, Save kembali DOCX = belum (Stage 3)
HTML: Open/Edit/Save = ya
TXT: Open/Edit = ya, Save default HTML

BATAS DOCX IMPORT V1
Belum ditargetkan: tracked changes, comments, footnote/endnote kompleks, floating text box, SmartArt, chart, equation, macro, section break kompleks, header/footer, embedded object, floating shape, field tingkat lanjut, dan fidelity pixel-perfect Word.

CARA UJI
1. Deploy seluruh folder melalui HTTPS (GitHub Pages/Vercel/server lain) atau localhost.
2. Jangan jalankan via file:// karena Service Worker tidak aktif.
3. Install sebagai PWA pada FydeOS/Chromium.
4. Buka file DOCX sederhana lalu cek teks, list, tabel, dan gambar.
5. Setelah cache selesai, matikan internet dan uji kembali.

LOCAL TEST
python3 -m http.server 8080
Buka http://localhost:8080

SHORTCUT
Ctrl+N New
Ctrl+O Open
Ctrl+S Save
Ctrl+Shift+S Save As
Ctrl+F Find
Ctrl+B/I/U format standar browser

STAGE 3 YANG DISARANKAN
DOCX Export v1 / round-trip dasar: membuat paket OOXML baru dari document model editor, termasuk paragraph/run formatting, list, table, image, page setup, dan metadata.
