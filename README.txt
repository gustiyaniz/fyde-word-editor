FYDE WORD STAGE 4 v4.0

Stage 4 mempertahankan DOCX Import/Export dan UI Fix v3.1, lalu menambahkan:
- File Handling API .docx/.html/.txt untuk Open with pada FydeOS/Chromium yang mendukung.
- launchQueue: file dari Files/Open with langsung dibuka.
- Drag & drop dokumen ke workspace.
- Recent Documents (metadata lokal, maksimal 12).
- Shortcut PWA: New Document dan Open Document.
- Cache offline v4.0.0.
- Status bar tetap terkunci di bawah seperti UI Fix v3.1.

Catatan Recent:
Browser tidak mengizinkan penyimpanan file handle secara permanen hanya lewat localStorage.
Pada sesi yang sama recent dapat memakai handle yang masih tersedia; setelah aplikasi restart,
pengguna mungkin perlu memilih file lagi. Daftar nama dokumen tetap tersimpan lokal.

Uji FydeOS:
1. Deploy seluruh folder melalui HTTPS.
2. Hapus/uninstall PWA versi lama jika asosiasi file belum diperbarui.
3. Buka URL, tunggu service worker v4 aktif, install PWA.
4. Files > klik kanan file DOCX > Open with > Fyde Word (jika FydeOS expose File Handling API).
5. Uji drag-drop DOCX.
6. Uji Recent.
7. Matikan internet dan buka ulang.
