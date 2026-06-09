# 📡 Setup Webhook/Callback Digiflazz di Dashboard

Panduan ini menjelaskan cara mengkonfigurasi URL callback Digiflazz agar deposit dan order user di SATUSAKU CORP. terupdate otomatis.

---

## 🌐 URL Callback

URL endpoint callback kamu akan seperti ini (ganti domain dengan domain kamu):

```
https://[DOMAIN-KAMU]/api/shop/deposit/callback
```

**Contoh:**
- Local: `http://localhost:3000/api/shop/deposit/callback` (untuk testing via ngrok)
- Production Render: `https://satusaku-corp.onrender.com/api/shop/deposit/callback`
- Custom domain: `https://satusaku.com/api/shop/deposit/callback`

⚠️ **Penting:** URL **harus HTTPS** untuk production!

---

## 📋 Step-by-Step Setup di Dashboard Digiflazz

### Step 1: Login Dashboard Digiflazz
1. Buka **https://member.digiflazz.com** (atau URL baru jika ada)
2. Login dengan akun buyer kamu (akun master)

### Step 2: Navigasi ke Webhook Settings
1. Klik menu **"Pengaturan"** atau **"Settings"**
2. Pilih **"Koneksi API"** atau **"Webhook"**
3. Cari bagian **"URL Webhook"** atau **"Callback URL"**

### Step 3: Masukkan URL Callback
1. Paste URL callback kamu:
   ```
   https://[domain-kamu]/api/shop/deposit/callback
   ```
2. (Opsional) Centang opsi **"Aktifkan signature verification"** jika ada
3. Jika ada field **"Secret Key"**, masukkan string random (misal: `skatusaku-2024-webhook-secret-xyz123`)
4. Klik **"Simpan"** / **"Save"**

### Step 4: Test Ping
1. Cari tombol **"Test Webhook"** atau **"Ping"** di dashboard
2. Klik tombol tersebut
3. Cek log server kamu — akan ada baris:
   ```
   [WEBHOOK] UA: Digiflazz-Hookshot | Signature: none
   ```
4. Jika baris ini muncul → **koneksi berhasil!** ✅

### Step 5: Test End-to-End (Deposit)
1. Login ke SATUSAKU CORP. sebagai affiliate
2. Buka menu **Deposit**
3. Pilih nominal (misal Rp 50.000)
4. Submit → Catat **nomor rekening & kode unik (notes)** yang ditampilkan
5. Transfer ke rekening Digiflazz dengan nominal TEPAT + kode unik
6. Tunggu 1-5 menit → Cek status di halaman Deposit
7. **Saldo akan otomatis masuk** tanpa perlu approve manual! 🎉

---

## 📨 Format Payload yang Dikirim Digiflazz

### Prepaid/Deposit Status Update
```json
{
  "data": {
    "ref_id": "DEP-1234567890-1",
    "amount": 50000,
    "status": "Sukses",
    "rc": "00",
    "sn": "..."
  }
}
```

### Order Status Update
```json
{
  "data": {
    "ref_id": "TRX-123456",
    "customer_no": "123456789",
    "buyer_sku_code": "pre32031064",
    "status": "Sukses",
    "rc": "00",
    "sn": "1234-5678-9012-3456",
    "price": 10000
  }
}
```

---

## 🔐 Keamanan

### Validasi yang Sudah Diimplementasi:
- ✅ Auto-parse payload dari Digiflazz
- ✅ Filter status (Sukses / Pending / Gagal)
- ✅ Always return 200 OK (best practice)
- ✅ Idempotency: jika callback diterima 2x untuk ref_id sama, hanya diproses sekali
- ✅ Logging semua callback ke console server

### Rekomendasi Tambahan (Nanti):
- Whitelist IP Digiflazz (`52.74.250.133`) di firewall
- Setup HTTPS dengan SSL certificate (otomatis di Render)
- Tambah signature verification HMAC-SHA1

---

## 🧪 Testing Lokal dengan Ngrok

Untuk test callback di localhost:

```bash
# Install ngrok
npm install -g ngrok

# Jalankan server kamu
node backend/server.js

# Di terminal lain, expose port 3000
ngrok http 3000
```

Salin URL HTTPS dari ngrok (misal `https://abc123.ngrok.io`), lalu paste ke Digiflazz webhook settings.

---

## 🔄 Tipe Event yang Didukung

| Event | Kapan | Action |
|-------|-------|--------|
| `create` | Transaksi baru dibuat | Simpan ke database |
| `update` | Status berubah | Update status & balance |
| `resend` | Resend report (khusus hotel) | Forward ke sistem hotel |

Kami saat ini handle `update` event untuk semua transaksi. Untuk data hotel, perlu setup terpisah.

---

## 📊 Headers untuk Debugging

Saat callback diterima, server akan log:
```
[WEBHOOK] UA: Digiflazz-Hookshot | Signature: present
[WEBHOOK] Deposit #5 approved, user #3 credited Rp 50000
```

Atau:
```
[WEBHOOK] UA: Digiflazz-Pasca-Hookshot | Signature: none
[WEBHOOK] Deposit not found for ref_id: UNKNOWN
```

---

## ❓ Troubleshooting

| Issue | Solusi |
|-------|--------|
| Callback tidak pernah diterima | Cek IP whitelist Digiflazz, pastikan URL HTTPS |
| Status tidak berubah | Cek log server, pastikan ref_id tersimpan di database |
| Saldo tidak masuk | Cek field `status` di payload — harus "Sukses" (case insensitive) |
| Error 500 di endpoint | Cek log server, biasanya JSON parse error |

---

## ✅ Checklist Final

- [ ] Setup URL webhook di dashboard Digiflazz
- [ ] Test ping → log muncul di server
- [ ] Test deposit kecil (Rp 10.000)
- [ ] Saldo otomatis masuk ke akun
- [ ] Test order prepaid (Mobile Legends, dll)
- [ ] SN/kode voucher muncul di response

Jika semua ✅, **sistem siap production!** 🚀