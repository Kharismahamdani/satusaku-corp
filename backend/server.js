const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'products.json');
const CACHE_TTL = 15 * 60 * 1000;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ===================== NEW ROUTES =====================
const authRoutes = require('./routes/auth');
const affiliateRoutes = require('./routes/affiliate');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');

app.use('/api/auth', authRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/shop', publicRoutes);
app.use('/', publicRoutes); // For referral redirects /r/:code

let config = {
    username: '',
    apiKeyDev: '',
    apiKeyProd: '',
    isDevelopment: true,
    margin: 0
};

function getActiveApiKey() {
    if (config.isDevelopment) return config.apiKeyDev || config.apiKeyProd;
    return config.apiKeyProd || config.apiKeyDev;
}

function generateSignature(username, apiKey, extra) {
    return crypto.createHash('md5').update(username + apiKey + extra).digest('hex');
}

function getBaseUrl() { return 'https://api.digiflazz.com/v1'; }

function checkConfig() {
    if (!config.username || !getActiveApiKey()) return { ok: false, message: 'Konfigurasi belum diisi.' };
    return { ok: true };
}

function getTestingFlag(override) {
    return override !== undefined ? override : (config.isDevelopment ? true : false);
}

// ===================== CACHE HELPERS =====================
function loadCache(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Date.now() - data.timestamp > CACHE_TTL) return null;
        return data.products;
    } catch (e) { return null; }
}

function saveCache(filePath, products) {
    try {
        fs.writeFileSync(filePath, JSON.stringify({ timestamp: Date.now(), products }, null, 2), 'utf8');
    } catch (e) { /* ignore */ }
}

// ===================== RC CODE REFERENCE =====================
const RC_CODES = {
    "00": { message: "Transaksi Sukses", status: "success", solusi: "Transaksi berhasil diproses." },
    "01": { message: "Saldo tidak cukup", status: "error", solusi: "Isi saldo deposit Anda di dashboard Digiflazz." },
    "02": { message: "Produk tidak aktif / tidak ditemukan", status: "error", solusi: "Periksa kode produk, mungkin sudah tidak tersedia." },
    "03": { message: "Transaksi Pending", status: "pending", solusi: "Tunggu beberapa saat, cek status dengan ref_id yang sama." },
    "04": { message: "Nomor pelanggan tidak valid", status: "error", solusi: "Periksa format nomor tujuan (HP/PLN/E-Money)." },
    "05": { message: "Duplicate ref_id", status: "error", solusi: "Gunakan ref_id yang berbeda untuk setiap transaksi." },
    "40": { message: "Payload Error", status: "error", solusi: "Periksa kembali data request yang dikirim." },
    "41": { message: "Signature tidak valid", status: "error", solusi: "1) IP belum di-whitelist 2) API Key salah 3) Mode Dev/Prod tidak sesuai." },
    "43": { message: "SKU tidak ditemukan", status: "error", solusi: "Kode produk tidak terdaftar. Cek daftar harga terbaru." },
    "44": { message: "Saldo tidak cukup", status: "error", solusi: "Deposit saldo terlebih dahulu." },
    "45": { message: "IP tidak dikenali", status: "error", solusi: "Daftarkan IP server di Pengaturan Koneksi API Digiflazz." },
    "49": { message: "Ref ID tidak unik", status: "error", solusi: "Gunakan ref_id yang berbeda dari transaksi sebelumnya." },
    "52": { message: "Prefix tidak sesuai", status: "error", solusi: "Kode produk tidak cocok dengan operator/nomor tujuan." },
    "54": { message: "Nomor tujuan salah", status: "error", solusi: "Periksa nomor pelanggan (jumlah digit / format)." },
    "55": { message: "Produk gangguan", status: "error", solusi: "Produk sedang gangguan. Coba produk lain atau tunggu." },
    "57": { message: "Digit kurang/lebih", status: "error", solusi: "Jumlah digit nomor tidak sesuai ketentuan operator." },
    "58": { message: "Sedang cut off", status: "error", solusi: "Transaksi di luar jam operasional. Coba lagi nanti." },
    "99": { message: "Error sistem / DF Router Issue", status: "pending", solusi: "Gangguan sistem Digiflazz. Hubungi support." }
};

// 137 Game brands for matching
const SKU_PREFIX_MAP = [
    { prefixes: ['GARENA', 'GAR'], name: 'Garena' },
    { prefixes: ['ML', 'ML_', 'ML-', 'MOBILE LEGENDS', 'MOBILE LEGEND', 'MOBILELEGENDS', 'MOBILELEGEND', 'MLBB', 'MLBB_', 'DIAMOND ML', 'ML DIAMOND', 'ML DM'], name: 'Mobile Legends' },
    { prefixes: ['PB', 'POINT BLANK', 'POINTBLANK'], name: 'Point Blank' },
    { prefixes: ['RAGNAROKM', 'RAGNAROK M', 'ROM'], name: 'Ragnarok M Eternal Love' },
    { prefixes: ['FF', 'FREE FIRE', 'FREEFIRE'], name: 'Free Fire' },
    { prefixes: ['AOV', 'ARENA OF VALOR'], name: 'Arena of Valor' },
    { prefixes: ['PUBG', 'PUBGMOBILE'], name: 'PUBG Mobile' },
    { prefixes: ['AU2', 'AUDIO SURGE'], name: 'AU2 Mobile' },
    { prefixes: ['COD', 'CALL OF DUTY'], name: 'Call of Duty Mobile' },
    { prefixes: ['LAPLACE'], name: 'Laplace M' },
    { prefixes: ['LORDS', 'LORDMOBILE'], name: 'Lords Mobile' },
    { prefixes: ['SPEED'], name: 'Speed Drifters' },
    { prefixes: ['HEROES EVOLVED', 'HEROESEVOLVED'], name: 'Heroes Evolved' },
    { prefixes: ['WEREWOLF'], name: 'Werewolf Party Game' },
    { prefixes: ['LIFEAFTER'], name: 'LifeAfter Credits' },
    { prefixes: ['VALORANT', 'VAL'], name: 'Valorant' },
    { prefixes: ['TOM JERRY', 'TOMANDJERRY'], name: 'Tom and Jerry Chase' },
    { prefixes: ['ONEPUNCH', 'ONE PUNCH'], name: 'One Punch Man' },
    { prefixes: ['SAUSAGE'], name: 'Sausage Man' },
    { prefixes: ['GENSHIN', 'GENSHINIMPACT'], name: 'Genshin Impact' },
    { prefixes: ['WR', 'WILD RIFT', 'LOL WR'], name: 'League of Legends Wild Rift' },
    { prefixes: ['BETHEKING', 'BE THE KING'], name: 'Be The King' },
    { prefixes: ['STATE OF SURVIVAL', 'STATEOF'], name: 'State of Survival' },
    { prefixes: ['SUPER SUS'], name: 'Super Sus' },
    { prefixes: ['TOWER OF FANTASY', 'TOWEROF'], name: 'Tower of Fantasy' },
    { prefixes: ['MUORIGIN3', 'MU ORIGIN 3'], name: 'MU Origin 3' },
    { prefixes: ['STUMBLE'], name: 'Stumble Guys' },
    { prefixes: ['HONKAI3', 'HONKAI IMPACT'], name: 'Honkai Impact 3' },
    { prefixes: ['RAGNAROK ORIGIN'], name: 'Ragnarok Origin' },
    { prefixes: ['REVELATION'], name: 'Revelation Infinite Journey' },
    { prefixes: ['HSR', 'HONKAI STAR', 'STAR RAIL'], name: 'Honkai Star Rail' },
    { prefixes: ['FC MOBILE', 'FCMOBILE'], name: 'FC Mobile' },
    { prefixes: ['SEAL M'], name: 'Seal M Sea' },
    { prefixes: ['UNDAWN'], name: 'Undawn' },
    { prefixes: ['ZEPETO'], name: 'Zepeto' },
    { prefixes: ['KINGS CHOICE'], name: 'Kings Choice' },
    { prefixes: ['HARRY POTTER'], name: 'Harry Potter Magic Awakened' },
    { prefixes: ['ARENA BREAKOUT'], name: 'Arena Breakout' },
    { prefixes: ['GROWTOPIA'], name: 'Growtopia' },
    { prefixes: ['IDENTITY V'], name: 'Identity V' },
    { prefixes: ['FOOTBALL MASTER'], name: 'Football Master 2' },
    { prefixes: ['METAL SLUG'], name: 'Metal Slug Awakening' },
    { prefixes: ['ANTS'], name: 'The Ants Underground Kingdom' },
    { prefixes: ['EGGY'], name: 'Eggy Party' },
    { prefixes: ['PUBG NEW STATE', 'NEW STATE'], name: 'PUBG New State Mobile' },
    { prefixes: ['SNOWBREAK'], name: 'Snowbreak Containment Zone' },
    { prefixes: ['LOL PC', 'LEAGUE OF LEGENDS'], name: 'League of Legends PC' },
    { prefixes: ['WHITEOUT'], name: 'Whiteout Survival Frost Star' },
    { prefixes: ['WATCHER'], name: 'Watcher of Realms' },
    { prefixes: ['DRAGONHEIR'], name: 'Dragonheir Silent Gods' },
    { prefixes: ['ASPHALT'], name: 'Asphalt 9' },
    { prefixes: ['TFT', 'TEAMFIGHT'], name: 'Teamfight Tactics Mobile' },
    { prefixes: ['HOK', 'HONOR OF KINGS'], name: 'Honor of Kings' },
    { prefixes: ['BLOOD STRIKE'], name: 'Blood Strike' },
    { prefixes: ['PUNISHING', 'GRAY RAVEN'], name: 'Punishing Gray Raven' },
    { prefixes: ['OCTOPATH'], name: 'Octopath Traveler' },
    { prefixes: ['PIXEL GUN'], name: 'Pixel Gun 3D' },
    { prefixes: ['MLA', 'MOBILE LEGENDS ADVENTURE'], name: 'Mobile Legends Adventure' },
    { prefixes: ['HEROIC'], name: 'Heroic Uncle Kim' },
    { prefixes: ['AETHER'], name: 'Aether Gazer' },
    { prefixes: ['WORLD WAR'], name: 'World War Heroes' },
    { prefixes: ['MOONLIGHT'], name: 'Moonlight Blade M' },
    { prefixes: ['FF MAX', 'FREE FIRE MAX', 'FREEFIREMAX'], name: 'Free Fire Max' },
    { prefixes: ['GUNS OF GLORY'], name: 'Guns of Glory' },
    { prefixes: ['SMASH LEGENDS'], name: 'Smash Legends' },
    { prefixes: ['ZZZ', 'ZENLESS'], name: 'Zenless Zone Zero' },
    { prefixes: ['KING OF AVALON'], name: 'King of Avalon' },
    { prefixes: ['DRACONIA'], name: 'Draconia Saga' },
    { prefixes: ['GHOST STORY'], name: 'Ghost Story' },
    { prefixes: ['ONMYOJI'], name: 'Onmyoji Arena' },
    { prefixes: ['PUBG LITE', 'PUBGMOBILELITE'], name: 'PUBG Mobile Lite' },
    { prefixes: ['AGE OF EMPIRES'], name: 'Age of Empires Mobile' },
    { prefixes: ['POKEMON'], name: 'Pokemon Unite' },
    { prefixes: ['MAGIC CHESS', 'MAGICCHESS'], name: 'Magic Chess' },
    { prefixes: ['MOB RUSH'], name: 'Mob Rush' },
    { prefixes: ['MEIQJAM'], name: 'Meiqjam' },
    { prefixes: ['AFK'], name: 'AFK Journey' },
    { prefixes: ['ASTRA KNIGHTS', 'VEDA'], name: 'Astra Knights of Veda' },
    { prefixes: ['CAPTAIN TSUBASA', 'TSUBASA'], name: 'Captain Tsubasa Ace' },
    { prefixes: ['NBA'], name: 'NBA Infinite' },
    { prefixes: ['SOUL LAND'], name: 'Soul Land New World' },
    { prefixes: ['ISEKAI'], name: 'Isekai Feast' },
    { prefixes: ['DELTA FORCE'], name: 'Delta Force' },
    { prefixes: ['DESTINY M'], name: 'Destiny M' },
    { prefixes: ['HEAVEN BURNS'], name: 'Heaven Burns Red' },
    { prefixes: ['NARUTO'], name: 'Naruto Shippuden' },
    { prefixes: ['MARVEL RIVALS'], name: 'Marvel Rivals' },
    { prefixes: ['CULINARY'], name: 'Culinary Tour' },
    { prefixes: ['RAGNAROK M CLASSIC', 'ROM CLASSIC'], name: 'Ragnarok M Classic' },
    { prefixes: ['RAGNAROK IDLE', 'RAGNAROKIDLE'], name: 'Ragnarok Idle Adventure Plus' },
    { prefixes: ['WAR ROBOTS'], name: 'War Robots' },
    { prefixes: ['RACING MASTER'], name: 'Racing Master' },
    { prefixes: ['T3 ARENA'], name: 'T3 Arena' },
    { prefixes: ['WUTHERING', 'WUWA'], name: 'Wuthering Waves' },
    { prefixes: ['ONCE HUMAN'], name: 'Once Human' },
    { prefixes: ['LINEAGE2', 'LINEAGE 2'], name: 'Lineage2M' },
    { prefixes: ['CRYSTAL OF ATLAN'], name: 'Crystal of Atlan' },
    { prefixes: ['MIRREN'], name: 'Mirren Star Legends' },
    { prefixes: ['TRAILS OF COLD', 'COLD STEEL'], name: 'Trails of Cold Steel NW' },
    { prefixes: ['DRAGON NEST'], name: 'Dragon Nest M Classic' },
    { prefixes: ['HAIKYU'], name: 'Haikyu Fly High' },
    { prefixes: ['PERFECT WORLD'], name: 'Perfect World 2' },
    { prefixes: ['PAW TALES'], name: 'Paw Tales Eternal Bond' },
    { prefixes: ['MACHINA'], name: 'Machina Waking' },
    { prefixes: ['MODERN COMBAT'], name: 'Modern Combat 5' },
    { prefixes: ['DRAGON CITY'], name: 'Dragon City' },
    { prefixes: ['CAPTAIN TSUBASA DT', 'TSUBASA DREAM'], name: 'Captain Tsubasa Dream Team' },
    { prefixes: ['SWORD OF JUSTICE'], name: 'Sword of Justice' },
    { prefixes: ['REMEVENTO'], name: 'Remevento White Shadow' },
    { prefixes: ['OXIDE'], name: 'Oxide Survival Island' },
    { prefixes: ['DESTINY RISING'], name: 'Destiny Rising' },
    { prefixes: ['INDUS'], name: 'Indus Battle Royale Mobile' },
    { prefixes: ['BLUE PROTOCOL'], name: 'Blue Protocol Star Resonance' },
    { prefixes: ['SLIME HAVEN'], name: 'Slime Haven' },
    { prefixes: ['FRAG'], name: 'FRAG Pro Shooter' },
    { prefixes: ['CASTLE DUELS'], name: 'Castle Duels' },
    { prefixes: ['MU ORIGIN 2', 'MUORIGIN2'], name: 'MU Origin 2' },
    { prefixes: ['TACTICOOL'], name: 'Tacticool' },
    { prefixes: ['PERSONA 5'], name: 'Persona 5 The Phantom X' },
    { prefixes: ['MOONLIT OATH'], name: 'The Moonlit Oath' },
    { prefixes: ['RAGNAROK TWILIGHT'], name: 'Ragnarok Twilight' },
    { prefixes: ['WHERE WINDS'], name: 'Where Winds Meet' },
    { prefixes: ['BLEACH'], name: 'Bleach Soul Resonance' },
    { prefixes: ['CROSSFIRE'], name: 'Crossfire' },
    { prefixes: ['GALACTIO'], name: 'Foundation Galactio Frontier' },
    { prefixes: ['DUET NIGHT'], name: 'Duet Night Abyss' },
    { prefixes: ['FARLIGHT'], name: 'Farlight 84' },
    { prefixes: ['SEGA'], name: 'Sega Football Club Champions' },
    { prefixes: ['HEARTOPIA'], name: 'Heartopia' },
    { prefixes: ['BANISHERS'], name: 'Banishers Faiths Entwined' },
    { prefixes: ['RAINBOW SIX'], name: 'Rainbow Six Mobile' },
    { prefixes: ['INFINITE BORDERS'], name: 'Infinite Borders' },
    { prefixes: ['KINGSHOT'], name: 'Kingshot' },
    { prefixes: ['DIVISION'], name: 'The Division Resurgence' },
    { prefixes: ['LEGENDS OF RUNETERRA', 'RUNETERRA', 'LOR'], name: 'Legends of Runeterra' },
    { prefixes: ['BATTLE THROUGH'], name: 'Battle Through the Heavens 3D Fight' },
    { prefixes: ['OVERMORTAL'], name: 'Overmortal' },
];

function guessBrand(productName, skuCode, apiBrand) {
    // First, try to match the API brand field directly
    if (apiBrand) {
        const b = apiBrand.toUpperCase().trim();
        for (const entry of SKU_PREFIX_MAP) {
            for (const prefix of entry.prefixes) {
                const p = prefix.toUpperCase();
                if (b === p || b.includes(p)) return entry.name;
            }
        }
    }
    const sku = (skuCode || '').toUpperCase().trim();
    const name = (productName || '').toLowerCase().trim();
    const fullLower = (name + ' ' + sku).toLowerCase();
    const skuStr = sku.replace(/[^A-Z0-9]/g, '');
    for (const entry of SKU_PREFIX_MAP) {
        for (const prefix of entry.prefixes) {
            const p = prefix.toUpperCase();
            if (sku.startsWith(p) || sku.startsWith(p + '_') || sku.startsWith(p + '-')) return entry.name;
        }
    }
    for (const entry of SKU_PREFIX_MAP) {
        for (const prefix of entry.prefixes) {
            const p = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (p.length >= 2 && skuStr.includes(p)) return entry.name;
        }
    }
    let bestMatch = { name: '', score: 0 };
    for (const entry of SKU_PREFIX_MAP) {
        let score = 0;
        for (const prefix of entry.prefixes) {
            const lowerP = prefix.toLowerCase();
            const nameWords = name.split(/\s+/).filter(w => w.length > 1);
            if (lowerP.length <= 2) {
                // For short prefixes (e.g. "PB", "FF"), only match as exact word in product name
                if (nameWords.some(w => w === lowerP)) score += 5;
                continue;
            }
            if (nameWords.some(w => w === lowerP)) score += 5;
            else if (fullLower.includes(lowerP)) score += 2;
        }
        if (score > bestMatch.score) bestMatch = { name: entry.name, score };
    }
    if (bestMatch.score >= 1) return bestMatch.name;
    return null;
}

// ===================== CONFIG (Save to file for public routes) =====================
function saveMasterConfig() {
  try {
    const cfgPath = path.join(DATA_DIR, 'config.json');
    fs.writeFileSync(cfgPath, JSON.stringify({
      username: config.username,
      apiKey: getActiveApiKey(),
      isDevelopment: config.isDevelopment
    }));
  } catch (e) {}
}

app.post('/api/config', (req, res) => {
    const { username, apiKeyDev, apiKeyProd, isDevelopment, margin } = req.body;
    if (!username || (!apiKeyDev && !apiKeyProd)) return res.status(400).json({ success: false, message: 'Username dan minimal satu API Key wajib' });
    config.username = username;
    if (apiKeyDev) config.apiKeyDev = apiKeyDev;
    if (apiKeyProd) config.apiKeyProd = apiKeyProd;
    config.isDevelopment = isDevelopment !== undefined ? isDevelopment : true;
    if (margin !== undefined) config.margin = parseInt(margin) || 0;
    saveMasterConfig();
    res.json({ success: true, message: 'Konfigurasi disimpan', config: { username: config.username, apiKeyDev: config.apiKeyDev ? '***' : '', apiKeyProd: config.apiKeyProd ? '***' : '', isDevelopment: config.isDevelopment, margin: config.margin } });
});

app.get('/api/config', (req, res) => {
    res.json({ success: true, config: { username: config.username, apiKeyDev: config.apiKeyDev ? '***' : '', apiKeyProd: config.apiKeyProd ? '***' : '', isDevelopment: config.isDevelopment, margin: config.margin } });
});

// ===================== DEBUG SIGNATURE =====================
app.get('/api/debug-sign', (req, res) => {
    const check = checkConfig();
    if (!check.ok) return res.json({ success: false, message: check.message });
    const activeKey = getActiveApiKey();
    const signDepo = generateSignature(config.username, activeKey, 'depo');
    const signPricelist = generateSignature(config.username, activeKey, 'pricelist');
    const signDeposit = generateSignature(config.username, activeKey, 'deposit');
    const signTrans = generateSignature(config.username, activeKey, 'TESTREF123');
    res.json({
        success: true,
        debug: {
            username: config.username,
            apiKeyPrefix: activeKey.substring(0, 8) + '...' + activeKey.substring(activeKey.length - 4),
            apiKeyLength: activeKey.length,
            isDevelopment: config.isDevelopment,
            activeKeySource: config.isDevelopment ? (config.apiKeyDev ? 'Dev Key' : 'Prod Key (fallback)') : (config.apiKeyProd ? 'Prod Key' : 'Dev Key (fallback)'),
            signDepo,
            signPricelist,
            signDeposit,
            signTransaction: signTrans,
            formulas: {
                depo: `md5("${config.username}" + "[key]" + "depo") = ${signDepo}`,
                pricelist: `md5("${config.username}" + "[key]" + "pricelist") = ${signPricelist}`,
                deposit: `md5("${config.username}" + "[key]" + "deposit") = ${signDeposit}`,
                transaction: `md5("${config.username}" + "[key]" + "ref_id") = ${signTrans}`
            }
        }
    });
});

// ===================== CEK SALDO =====================
app.post('/api/cek-saldo', async (req, res) => {
    const check = checkConfig();
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });
    try {
        const activeKey = getActiveApiKey();
        const sign = generateSignature(config.username, activeKey, 'depo');
        const payload = { username: config.username, sign };
        const response = await axios.post(`${getBaseUrl()}/cek-saldo`, payload, { headers: { 'Content-Type': 'application/json' } });
        res.json({ success: true, data: response.data });
    } catch (error) {
        const errData = error.response?.data || {};
        // Extract RC from nested data or root level
        const rc = errData?.data?.rc || errData.rc || errData?.rc || '';
        const errMsg = errData?.data?.message || errData.message || '';
        let hints = '';
        if (rc === '41' || rc === '45') {
            hints = `\n🔍 Kemungkinan:\n` +
                `1) IP server BELUM di-whitelist di dashboard Digiflazz\n` +
                `2) Mode Dev/Prod tidak sesuai - Cek toggle di sidebar\n` +
                `3) API Key salah (cek huruf besar/kecil, spasi)\n` +
                `4) Username salah - pastikan username DASHBOARD, BUKAN API Key\n` +
                `5) Key aktif saat ini: ${config.isDevelopment ? 'DEV Key' : 'PROD Key'}\n` +
                `6) Coba klik icon ⚡ Debug di UI untuk test signature`;
        }
        res.status(500).json({
            success: false,
            message: errMsg || 'Gagal cek saldo',
            error: errData,
            rc: rc,
            rc_info: RC_CODES[rc] || null,
            debug: {
                username: config.username,
                apiKeyPrefix: getActiveApiKey()?.substring(0, 8) + '...',
                apiKeyLength: getActiveApiKey()?.length || 0,
                activeMode: config.isDevelopment ? 'DEV' : 'PROD',
                keySource: config.isDevelopment ? (config.apiKeyDev ? 'Dev Key' : 'Prod Key (fallback)') : (config.apiKeyProd ? 'Prod Key' : 'Dev Key (fallback)'),
                hint: hints
            }
        });
    }
});
// ===================== CEK DEPOSIT =====================
app.post('/api/cek-deposit', async (req, res) => {
    const check = checkConfig();
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });
    try {
        const activeKey = getActiveApiKey();
        const sign = generateSignature(config.username, activeKey, 'deposit');
        const response = await axios.post(`${getBaseUrl()}/cek-saldo`, { username: config.username, sign }, { headers: { 'Content-Type': 'application/json' } });
        res.json({ success: true, data: response.data });
    } catch (error) {
        const errData = error.response?.data || {};
        res.status(500).json({ success: false, message: 'Gagal cek deposit', error: errData });
    }
});

// ===================== PRICE LIST (GAME ONLY - REAL TIME) =====================
app.post('/api/price-list', async (req, res) => {
    const check = checkConfig();
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });

    try {
        const { code } = req.body;

        // Always fetch fresh from API (real-time)
        const sign = generateSignature(config.username, getActiveApiKey(), 'pricelist');
        const response = await axios.post(`${getBaseUrl()}/price-list`, {
            cmd: 'prepaid',
            username: config.username,
            sign
        }, { headers: { 'Content-Type': 'application/json' } });

        const responseData = response.data;
        let allProducts = [];
        if (responseData && responseData.data) {
            allProducts = Array.isArray(responseData.data) ? responseData.data : (responseData.data.data || []);
        } else if (Array.isArray(responseData)) {
            allProducts = responseData;
        }

        // Filter active products
        let products = allProducts.filter(p => p.buyer_product_status === true || p.buyer_product_status === 1);

        // Save to cache for offline reference
        saveCache(CACHE_FILE, products);

        let filtered = products;
        // Filter by search
        if (code && code.trim()) {
            const s = code.toLowerCase().trim();
            filtered = products.filter(p =>
                (p.buyer_sku_code && p.buyer_sku_code.toLowerCase().includes(s)) ||
                (p.product_name && p.product_name.toLowerCase().includes(s)) ||
                (p.brand && p.brand.toLowerCase().includes(s))
            );
        }

        // Categorize by brand
        const groups = {};
        let unmatched = [];
        filtered.forEach(p => {
            const brand = guessBrand(p.product_name, p.buyer_sku_code, p.brand);
            if (brand) {
                if (!groups[brand]) groups[brand] = [];
                groups[brand].push(p);
            } else {
                unmatched.push(p);
            }
        });

        const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
        if (unmatched.length > 0) sorted.push(['Lainnya', unmatched]);

        res.json({
            success: true,
            data: filtered,
            groups: sorted,
            total: filtered.length,
            totalGames: sorted.filter(([name]) => name !== 'Lainnya').length,
            fromCache: false,
            margin: config.margin
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal ambil harga',
            error: error.response?.data || error.message
        });
    }
});

// ===================== TRANSACTION =====================
app.post('/api/transaction', async (req, res) => {
    const check = checkConfig();
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });
    try {
        const { buyer_sku_code, customer_no, ref_id, testing } = req.body;
        if (!buyer_sku_code || !customer_no || !ref_id) return res.status(400).json({ success: false, message: 'buyer_sku_code, customer_no, ref_id wajib' });
        const sign = generateSignature(config.username, getActiveApiKey(), ref_id);
        const payload = { username: config.username, sign, buyer_sku_code, customer_no, ref_id, testing: getTestingFlag(testing) };
        const response = await axios.post(`${getBaseUrl()}/transaction`, payload, { headers: { 'Content-Type': 'application/json' } });
        const respData = response.data;
        const rc = respData?.data?.rc || '';
        res.json({
            success: true,
            data: respData,
            rc: rc,
            rc_info: RC_CODES[rc] || null
        });
    } catch (error) {
        const errData = error.response?.data || {};
        const rc = errData.rc || '';
        res.status(500).json({
            success: false,
            message: 'Gagal transaksi',
            error: errData,
            rc: rc,
            rc_info: RC_CODES[rc] || null
        });
    }
});

// ===================== REQUEST DEPOSIT =====================
app.post('/api/deposit', async (req, res) => {
    const check = checkConfig();
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });
    try {
        const { amount, bank, owner_name } = req.body;
        if (!amount || !bank || !owner_name) return res.status(400).json({ success: false, message: 'amount, bank, dan owner_name wajib' });
        const activeKey = getActiveApiKey();
        const sign = generateSignature(config.username, activeKey, 'deposit');
        const payload = { username: config.username, amount: parseInt(amount), bank, owner_name, sign };
        const response = await axios.post(`${getBaseUrl()}/deposit`, payload, { headers: { 'Content-Type': 'application/json' } });
        const respData = response.data;
        const rc = respData?.data?.rc || '';
        res.json({
            success: true,
            data: respData,
            rc: rc,
            rc_info: RC_CODES[rc] || null
        });
    } catch (error) {
        const errData = error.response?.data || {};
        const rc = errData.rc || '';
        res.status(500).json({
            success: false,
            message: 'Gagal request deposit',
            error: errData,
            rc: rc,
            rc_info: RC_CODES[rc] || null
        });
    }
});

// ===================== CEK STATUS =====================
app.post('/api/cek-status', async (req, res) => {
    const check = checkConfig();
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });
    try {
        const { ref_id, buyer_sku_code, customer_no, type } = req.body;
        if (!ref_id || !buyer_sku_code || !customer_no) return res.status(400).json({ success: false, message: 'ref_id, buyer_sku_code, dan customer_no wajib' });
        const sign = generateSignature(config.username, getActiveApiKey(), ref_id);
        const payload = { username: config.username, sign, buyer_sku_code, customer_no, ref_id };
        if (type === 'postpaid') payload.commands = 'status-pasca';
        const response = await axios.post(`${getBaseUrl()}/transaction`, payload, { headers: { 'Content-Type': 'application/json' } });
        const respData = response.data;
        const rc = respData?.data?.rc || '';
        res.json({
            success: true,
            data: respData,
            type: type || 'prepaid',
            rc: rc,
            rc_info: RC_CODES[rc] || null
        });
    } catch (error) {
        const errData = error.response?.data || {};
        const rc = errData.rc || '';
        res.status(500).json({ success: false, message: 'Gagal cek status', error: errData, rc: rc, rc_info: RC_CODES[rc] || null });
    }
});

// ===================== RC CODES =====================
app.get('/api/rc-codes', (req, res) => {
    res.json({ success: true, data: RC_CODES });
});

// ===================== CACHE INFO =====================
app.get('/api/cache-info', (req, res) => {
    const info = {};
    [CACHE_FILE].forEach(f => {
        try {
            if (fs.existsSync(f)) {
                const raw = fs.readFileSync(f, 'utf8');
                const data = JSON.parse(raw);
                info[path.basename(f)] = {
                    exists: true,
                    count: data.products?.length || 0,
                    age: Math.floor((Date.now() - data.timestamp) / 1000),
                    valid: (Date.now() - data.timestamp) < CACHE_TTL
                };
            } else {
                info[path.basename(f)] = { exists: false, count: 0, age: -1, valid: false };
            }
        } catch (e) {
            info[path.basename(f)] = { exists: false, count: 0, age: -1, valid: false, error: e.message };
        }
    });
    res.json({ success: true, data: info, ttlSeconds: CACHE_TTL / 1000 });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`============================================`);
    console.log(`  SATUSAKU CORP. v3.0`);
    console.log(`  Mode: Real-time (selalu fetch dari API) | Margin: ${config.margin}%`);
    console.log(`============================================`);
    console.log(`  Server: http://localhost:${PORT}`);
    console.log(`  Press Ctrl+C`);
    console.log(`============================================`);
});