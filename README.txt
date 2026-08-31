FYDE WORD — STAGE 5 v5.0
============================

FITUR BARU
- Print Layout multi-page: A4/landscape tampil sebagai lembar terpisah.
- Reflow otomatis antar halaman pada batas blok/paragraf.
- Page Break memaksa halaman baru.
- Page X of Y mengikuti halaman aktif/terlihat.
- Header dan Footer.
- Page Number: none / left / center / right.
- Header/footer/page number ikut diekspor ke DOCX v1.
- Print Layout dan Web Layout.
- Zoom berlaku ke seluruh tumpukan halaman.
- Margin/orientation berlaku ke semua halaman.
- Status bar tetap terkunci di bawah.
- Semua fitur Stage 4 tetap ada: DOCX import/export, Open with, Recent, drag-drop, offline PWA.

CATATAN PAGINATION v1
Pagination memindahkan elemen blok ke halaman berikutnya saat penuh. Paragraf teks biasa yang sangat panjang
dapat dipecah otomatis. Tabel/gambar tunggal yang ukurannya lebih tinggi dari satu halaman belum dipecah penuh;
halaman akan diberi indikator overflow untuk kasus tersebut.

PENGUJIAN
1. Deploy via HTTPS.
2. Pastikan cache fyde-word-stage5-v5.0.0 aktif.
3. Tutup/buka ulang PWA; bila perlu uninstall versi lama lalu install ulang.
4. Buat dokumen panjang dan cek Page 2 muncul di bawah Page 1.
5. Coba Insert > Page Break.
6. Coba Header, Footer, Page Number.
7. Save As DOCX lalu buka di Word/LibreOffice.
8. Uji kembali tanpa internet.
