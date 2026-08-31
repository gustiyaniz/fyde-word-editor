FYDE WORD — STAGE 3
===================

Stage 3 menambahkan DOCX Export v1 dan round-trip dasar di atas Stage 2.

FITUR UTAMA STAGE 3
- Membuka DOCX secara offline menggunakan parser OOXML lokal.
- Mengedit isi dokumen di editor Word-like.
- Ctrl+S pada DOCX dapat menulis kembali file DOCX melalui File System Access API.
- Ctrl+Shift+S membuka Save As DOCX.
- Tombol Export DOCX untuk membuat salinan DOCX baru.
- DOCX baru dibuat langsung di browser tanpa CDN/server.
- ZIP writer lokal bawaan aplikasi (store/no-compression) sehingga tetap offline.
- Export paragraf dan Heading 1-6.
- Export bold, italic, underline, strike, font, ukuran, warna, highlight, superscript/subscript.
- Export alignment, indent, spacing dasar.
- Export bullets/numbering bertingkat dasar.
- Export hyperlink eksternal.
- Export tabel dan colspan sederhana.
- Export gambar data URL menjadi word/media.
- Export page break.
- Export page margin dan portrait/landscape.
- Metadata DOCX dasar.

PERILAKU SAVE
- Dokumen DOCX yang dibuka: Ctrl+S -> simpan kembali sebagai DOCX ke file yang sama jika permission tersedia.
- Dokumen baru: Ctrl+S -> Save As .docx.
- Ctrl+Shift+S -> selalu Save As .docx.
- HTML yang dibuka: Ctrl+S tetap menyimpan HTML.
- Tombol Export HTML tetap tersedia.

BATAS ROUND-TRIP V1
Stage 3 membuat DOCX baru dari model HTML editor. Elemen Word yang tidak didukung tidak dipertahankan secara lossless.
Belum ditargetkan: comments, tracked changes, footnote/endnote kompleks, SmartArt, chart, equation kompleks, embedded object/Excel, macro/VBA, floating shape/text box, section break kompleks, header/footer, custom XML, theme kompleks, content controls, bookmarks tingkat lanjut, fields tingkat lanjut, dan pixel-perfect layout.

PENTING
Sebelum menggunakan pada dokumen penting, uji terlebih dahulu pada salinan file. Stage 3 sudah dapat menghasilkan DOCX valid untuk dokumen umum, tetapi bukan clone layout engine Microsoft Word.

CARA UJI
1. Deploy folder melalui HTTPS atau localhost.
2. Jangan gunakan file:// karena Service Worker tidak aktif.
3. Install PWA di FydeOS/Chromium.
4. Buat dokumen baru -> isi teks, heading, list, tabel, gambar -> Save As DOCX.
5. Buka hasil DOCX dengan Microsoft Word/LibreOffice untuk validasi.
6. Buka DOCX sederhana -> edit -> Ctrl+S -> tutup -> buka ulang.
7. Setelah cache selesai, matikan internet dan ulangi pengujian.

LOCAL TEST
python3 -m http.server 8080
Buka http://localhost:8080

SHORTCUT
Ctrl+N New
Ctrl+O Open
Ctrl+S Save
Ctrl+Shift+S Save As DOCX
Ctrl+F Find
Ctrl+B/I/U format standar browser


STAGE 3.1 - UI LAYOUT FIX
=========================
- Memperbaiki status bar Page/Words/Characters/Zoom yang sebelumnya berada di tengah layar.
- Workspace dokumen sekarang memakai seluruh ruang di antara ruler dan status bar.
- Status bar selalu berada paling bawah seperti Microsoft Word.
- Zoom memakai CSS zoom pada Chromium/FydeOS agar ukuran layout ikut berubah dan halaman tidak menabrak status bar.
- Mendukung dynamic viewport height (100dvh).
- Service Worker cache dinaikkan ke fyde-word-stage3-ui-v3.1.0.
