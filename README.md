# Kickoff Manager — starter project

Starter project untuk melanjutkan prototipe menjadi game football manager Android + layanan akun/cloud-save.

## Isi proyek
- `web/index.html`: prototipe game dan panel akun/cloud-save.
- `server/`: REST API Node.js, autentikasi email/kata sandi, JWT, PostgreSQL, dan penyimpanan karier.
- `android/`: catatan langkah untuk membungkus web app dengan Capacitor.
- `docker-compose.yml`: PostgreSQL lokal untuk pengembangan.
- `.env.example`: konfigurasi server contoh.

## Status saat ini
Ini **starter project**, bukan APK final dan bukan server yang sudah online. Akun online baru aktif setelah backend dipasang di hosting HTTPS, database dibuat, dan URL API dimasukkan pada panel akun di game. Game masih memakai pemain/klub contoh. Database dunia, lisensi data, engine simulasi lengkap, pengujian, dan publikasi store masih merupakan pekerjaan lanjutan.

## Jalankan prototipe lokal
Buka `web/index.html` di browser. Untuk menguji login/cloud-save, jalankan backend di bawah dan isi URL API sesuai alamat server yang dapat dijangkau perangkat.

## Jalankan server lokal
Prasyarat: Node.js 20+ dan Docker Compose.

1. Salin `.env.example` menjadi `server/.env` lalu ubah `JWT_SECRET` menjadi nilai acak yang kuat.
2. Jalankan database: `docker compose up -d db`
3. Masuk ke folder `server`: `cd server`
4. Instal dependensi: `npm install`
5. Jalankan server: `npm run dev`
6. API berjalan di `http://localhost:8080`. Untuk ponsel fisik, `localhost` berarti ponsel itu sendiri; gunakan IP LAN komputer saat tes jaringan lokal, atau deploy ke hosting HTTPS.
7. Masukkan URL API pada panel akun.

## Android APK dan Google Play
Prasyarat: Node.js, Android Studio, JDK yang sesuai dengan versi Android Gradle Plugin, dan Android SDK.

Dari folder proyek:
1. `npm install`
2. `npm run android:add`
3. `npm run android:sync`
4. `npm run android:open`
5. Uji di emulator dan perangkat fisik.
6. Untuk rilis, buat Android App Bundle (AAB) bertanda tangan dari Android Studio; APK debug hanya untuk pengujian.
7. Periksa persyaratan Google Play yang berlaku saat rilis: target API, deklarasi data/privasi, penghapusan akun bila diwajibkan, rating konten, dan aset store.

Konfigurasi Capacitor pada proyek web ditambahkan setelah langkah instalasi melalui `capacitor.config.ts`. Lihat `package.json`.

## Keamanan sebelum publikasi
- Jangan pernah mengirim `JWT_SECRET` atau kredensial database ke aplikasi Android.
- Gunakan HTTPS di produksi, rahasiakan `.env`, batasi CORS ke domain yang benar, dan aktifkan backup database.
- Tambahkan verifikasi email, reset kata sandi, pembatasan percobaan login, monitoring, dan kebijakan penghapusan akun sebelum rilis publik.
- Jangan gunakan logo, foto, nama kompetisi, atau database pemain/klub tanpa memeriksa hak dan lisensi. Statistik demo adalah data fiktif.
- Endpoint simpanan memiliki batas ukuran dan validasi dasar; lakukan audit keamanan sebelum digunakan publik.
