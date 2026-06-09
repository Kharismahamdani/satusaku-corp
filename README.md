# ⚡ SATUSAKU CORP.

Platform **affiliate game top-up** yang memungkinkan kamu menyewakan tools ini ke user lain untuk berjualan produk game dari Digiflazz.

## 🎯 Konsep

```
SATUSAKU CORP. (Kamu)
  ↓ Setup harga markup 5-8%
  ↓
AFFILIATE (User daftar via link referral)
  ↓ Share link mereka ke komunitas
  ↓
CUSTOMER (End user)
  ↓ Order produk game via link affiliate
  ↓
SISTEM forward ke Digiflazz API pakai master account kamu
  ↓
AFFILIATE dapat komisi 1-2% per order
KAMU dapat markup profit
```

**Skema Tanpa Modal:**
- User bayar deposit → langsung ke Digiflazz (lewat webhook auto-approve)
- Affiliate share link → dapat komisi otomatis
- Kamu tidak pegang uang user sama sekali
- Profit dari markup (5-8%) + 1 level referral commission

## 💰 Paket Pendaftaran Affiliate

| Paket | Harga | Komisi/Order | Bonus |
|-------|-------|--------------|-------|
| **💎 Basic** | Rp 10.000 (sekali) | 1% | - |
| **👑 Pro** | Rp 50.000 (sekali) | 2% | Saldo Rp 25.000 |

## 🛠️ Tech Stack

- **Backend:** Node.js + Express.js
- **Database:** SQLite (better-sqlite3)
- **Auth:** JWT (jsonwebtoken) + bcrypt
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **API Integrasi:** Digiflazz API + Webhook/Callback

## 📦 Struktur Project

```
digiflaz/
├── backend/
│   ├── server.js              # Express main server
│   ├── database.js            # SQLite setup & queries
│   ├── auth.js                # JWT middleware
│   └── routes/
│       ├── auth.js            # Login, register
│       ├── affiliate.js       # Affiliate dashboard API
│       ├── admin.js           # Admin dashboard API
│       └── public.js          # Public shop + webhook
├── public/
│   ├── index.html             # Master tools (admin)
│   ├── login.html             # Login/Register
│   ├── dashboard.html         # Affiliate dashboard
│   ├── admin.html             # Admin dashboard
│   ├── shop.html              # Public catalog
│   └── deposit.html           # User deposit page
├── data/                       # SQLite DB + cache (auto-created)
├── render.yaml                 # Render deployment config
├── Procfile                    # Heroku/Render process file
├── deploy.bat                  # Quick deploy helper (Windows)
├── .gitignore
├── package.json
└── README.md
```

## 🚀 Quick Start (Local)

```bash
# Install dependencies
npm install

# Start server
node backend/server.js

# Akses di browser:
# http://localhost:3000
```

**Default Admin Login:** `admin` / `admin123` (ganti segera untuk production!)

## 🌐 Deploy ke Render (Gratis Selamanya)

### Persiapan
1. Install **Git**: https://git-scm.com
2. Buat akun **GitHub**: https://github.com
3. Buat akun **Render**: https://render.com

### Step 1: Push ke GitHub
```bash
# Cara paling mudah: double-click deploy.bat
deploy.bat

# Atau manual:
git init
git add .
git commit -m "SATUSAKU CORP."
git remote add origin https://github.com/USERNAME/satusaku-corp.git
git push -u origin main
```

### Step 2: Deploy di Render
1. Login ke https://render.com
2. Klik **"New +"** → **"Web Service"**
3. Pilih repository `satusaku-corp`
4. Setting:
   - **Build Command:** `npm install`
   - **Start Command:** `node backend/server.js`
   - **Instance Type:** Free
5. Klik **"Create Web Service"**
6. Tunggu 2-5 menit → Dapat URL: `https://satusaku-corp.onrender.com`

### Step 3: Konfigurasi Digiflazz Webhook
Lihat [DIGIFLAZZ_CALLBACK_SETUP.md](./DIGIFLAZZ_CALLBACK_SETUP.md) untuk setup webhook/callback agar deposit & order auto-approve.

## 🔌 API Endpoints

### Auth
- `POST /api/auth/register` — Register affiliate baru
- `POST /api/auth/login` — Login
- `GET /api/auth/profile` — Profile user

### Affiliate (perlu token)
- `GET /api/affiliate/dashboard` — Dashboard data
- `GET /api/affiliate/orders` — Riwayat order
- `GET /api/affiliate/commissions` — Riwayat komisi
- `POST /api/affiliate/withdraw` — Request penarikan
- `GET /api/affiliate/withdrawals` — Riwayat withdraw

### Admin (perlu token + role admin)
- `GET /api/admin/dashboard` — Statistik admin
- `GET /api/admin/users` — List semua user
- `PUT /api/admin/users/:id/status` — Toggle status
- `POST /api/admin/users/:id/adjust` — Adjust balance
- `GET /api/admin/deposits` — List deposit
- `PUT /api/admin/deposits/:id` — Approve/reject deposit
- `GET /api/admin/withdrawals` — List withdrawal
- `PUT /api/admin/withdrawals/:id` — Approve/reject withdrawal
- `GET /api/admin/settings` — Get settings
- `PUT /api/admin/settings` — Update settings

### Public
- `GET /api/shop/products` — List semua produk
- `POST /api/shop/deposit-request` — Request deposit
- `GET /api/shop/deposit-status/:id` — Polling status deposit
- `POST /api/shop/deposit/callback` — Webhook dari Digiflazz
- `POST /api/shop/order` — Buat order
- `POST /api/shop/order-status` — Cek status order
- `GET /r/:code` — Redirect link referral

## 🎯 Alur Penggunaan

### Untuk Affiliate:
1. Daftar di `/login.html` → pilih paket (Basic/Pro)
2. Dapatkan **link referral** di dashboard
3. Share link ke komunitas (WhatsApp, Telegram, Instagram, dll)
4. User yang order via link → affiliate dapat komisi otomatis
5. Tarik komisi via menu "Penarikan" (min Rp 50.000, kelipatan)

### Untuk Customer (End User):
1. Klik link referral affiliate
2. Otomatis ter-redirect ke shop
3. Pilih produk → input ID Game + Server → order
4. (Untuk order pertama) Deposit dulu di menu Deposit
5. Saldo & status order di dashboard

### Untuk Admin (Kamu):
1. Login di `/login.html` dengan `admin / admin123`
2. Masuk `/admin.html`
3. Konfigurasi Digiflazz API Key di tab "Settings" (existing master tools)
4. Monitor orders, deposits, withdrawals
5. Approve penarikan via admin panel

## ⚙️ Konfigurasi Awal (PENTING!)

Setelah deploy, lakukan:

1. **Ganti admin password default** (`admin / admin123`)
2. **Setup Digiflazz API credentials** di tab Settings master tools
3. **Setup Webhook URL** di dashboard Digiflazz
4. **Test deposit kecil** (Rp 10.000) untuk memastikan auto-approve bekerja
5. **Custom domain** (opsional) di Render settings

## 🔐 Keamanan

- ✅ JWT token dengan expiry 7 hari
- ✅ Password di-hash dengan bcrypt
- ✅ Role-based access (admin / affiliate)
- ✅ Idempotency untuk webhook
- ⚠️ Ganti default admin password!
- ⚠️ Set JWT_SECRET via env var untuk production
- ⚠️ Whitelist IP Digiflazz di firewall (opsional)

## 📊 Skema Pendapatan

**Contoh Skenario (100 order/hari, avg Rp 10.000/order):**
```
Order Value:        Rp 10.000 × 100 = Rp 1.000.000/hari
Modal ke Digiflazz: ~Rp 950.000/hari (95%)
Markup kamu:        5-8% = Rp 50.000-80.000/hari
Komisi affiliate:   1-2% = Rp 10.000-20.000/hari
─────────────────────────────────────
PROFIT BERSIH KAMU:  Rp 30.000-70.000/hari
                    = Rp 900.000-2.100.000/bulan
```

**Tanpa modal, tanpa inventory, tanpa customer service berat.** 🚀

## 🐛 Troubleshooting

| Issue | Solusi |
|-------|--------|
| Login gagal | Pastikan username/password benar, default `admin / admin123` |
| Produk kosong | Konfigurasi Digiflazz API Key dulu di tab Settings |
| Deposit tidak masuk | Cek log server, pastikan webhook Digiflazz sudah setup |
| Webhook tidak diterima | Pastikan URL HTTPS, IP server di-whitelist |
| SQLite error | Hapus `data/*.db` dan restart server |
| Port 3000 sudah dipakai | Set `PORT=3001` di environment variable |

## 📜 Lisensi

Proprietary - Hanya untuk penggunaan internal kamu.

## 🙋 Support

Dibuat dengan ❤️ untuk SATUSAKU CORP.