FYDE WORD — STAGE 1
====================

Fitur utama:
- PWA offline penuh setelah cache pertama.
- Tampilan Word-like: title bar, ribbon, workspace, halaman A4, status bar.
- Editor dasar: bold, italic, underline, strike, warna teks, highlight.
- Paragraph: bullets, numbering, alignment, indent.
- Heading / normal style.
- Insert picture, link, tabel sederhana, page break.
- Layout: margin dan portrait/landscape.
- Zoom, ruler toggle, page shadow, focus mode.
- New, Open, Save, Save As, Export HTML, Print.
- File System Access API jika browser/FydeOS mendukung.
- Fallback download bila API save picker tidak tersedia.
- Autosave/recovery via localStorage.
- Shortcut:
  Ctrl+N = New
  Ctrl+O = Open
  Ctrl+S = Save
  Ctrl+Shift+S = Save As
  Ctrl+F = Find
  Ctrl+B/I/U = format standar browser

Format Stage 1:
- HTML / HTM: buka, edit, simpan.
- TXT: buka dan edit; penyimpanan default menjadi HTML.
- DOCX belum aktif pada Stage 1. Fondasi file handling sudah disiapkan untuk Stage berikutnya.

CARA MENJALANKAN
================
Service worker tidak akan aktif bila index.html dibuka langsung dengan file://.
Jalankan melalui HTTPS atau localhost.

Pilihan 1 - GitHub Pages / Vercel:
1. Upload seluruh isi folder ini.
2. Buka URL HTTPS hasil deploy.
3. Tunggu halaman selesai dimuat.
4. Install PWA dari browser/FydeOS.
5. Matikan internet dan coba buka kembali.

Pilihan 2 - lokal untuk pengujian:
Python:
  python3 -m http.server 8080

Kemudian buka:
  http://localhost:8080

INSTALL DI FYDEOS
=================
1. Buka aplikasi menggunakan Chromium/Chrome di FydeOS.
2. Klik tombol Install jika muncul, atau gunakan menu browser > Install app.
3. Jalankan Fyde Word dari launcher.
4. Setelah asset pernah tercache, aplikasi dapat dijalankan tanpa internet.

CATATAN
=======
- File Handling API tergantung dukungan Chromium/FydeOS dan instalasi PWA.
- Pada Stage 1 file_handlers hanya untuk .html/.htm/.txt.
- DOCX akan ditambahkan di Stage selanjutnya dengan parser/import-export khusus.
