/**
 * XV10 Downloader — Backend Serverless v6
 * Optimized for Vercel Deployment
 */

const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, version: '6.0.0', environment: 'Vercel Serverless' });
});

// Helper HTTP Request
function doReq(opts, body = null, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const protocol = (opts.protocol === 'http:' || (opts.hostname && opts.hostname.startsWith('http:'))) ? http : https;
    const req = protocol.request(opts, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error(`Timeout request to ${opts.hostname}`));
    });
    if (body) req.write(body);
    req.end();
  });
}

function detectPlatform(url) {
  if (url.includes('tiktok.com') || url.includes('vm.tiktok') || url.includes('vt.tiktok')) return 'TikTok';
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  return 'Video';
}

function normalizeUrl(raw) {
  let u = raw.trim();
  if (u.includes('youtu.be/') || u.includes('youtube.com')) {
    try {
      const parsed = new URL(u);
      const v = parsed.searchParams.get('v') || parsed.pathname.split('/').pop();
      if (v && v.length === 11) u = `https://www.youtube.com/watch?v=${v}`;
    } catch (e) {}
  }
  return u;
}

// ── Extraction Logic ──
async function dlTikwm(url, format) {
  const body = new URLSearchParams({ url, hd: '1' }).toString();
  const r = await doReq({
    hostname: 'www.tikwm.com',
    path: '/api/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);

  const j = JSON.parse(r.body);
  if (j.code !== 0 || !j.data) throw new Error(`TikWM Error: ${j.msg || 'No data'}`);
  const d = j.data;
  const links = [];

  if (format === 'mp3') {
    const audioUrl = d.music_info?.play || d.music;
    if (audioUrl) links.push({ label: '⬇️ MP3 Audio', url: audioUrl, filename: 'tiktok_audio.mp3' });
  } else {
    if (d.hdplay) links.push({ label: '⬇️ HD Tanpa Watermark', url: d.hdplay, filename: 'tiktok_hd.mp4' });
    if (d.play) links.push({ label: '⬇️ Tanpa Watermark', url: d.play, filename: 'tiktok.mp4' });
    if (d.wmplay) links.push({ label: '⬇️ Dengan Watermark', url: d.wmplay, filename: 'tiktok_wm.mp4' });
    if (d.music) links.push({ label: '🎵 Audio MP3', url: d.music, filename: 'audio.mp3' });
  }

  if (!links.length) throw new Error('TikWM: Link tidak ditemukan');
  return {
    title: d.title || 'TikTok Video',
    thumbnail: d.cover || '',
    platform: 'TikTok',
    author: d.author?.nickname || '',
    duration: d.duration ? `${d.duration}s` : '',
    links
  };
}

async function dlSaveInsta(url) {
  const body = new URLSearchParams({ url }).toString();
  const r = await doReq({
    hostname: 'saveinsta.app',
    path: '/action?lang=en',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Referer': 'https://saveinsta.app/',
      'Origin': 'https://saveinsta.app',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);

  const links = [];
  const re = /href="(https:\/\/[^"]{20,}?)"\s[^>]*>\s*(?:Download|Unduh)/gi;
  let m;
  while ((m = re.exec(r.body)) !== null && links.length < 4) {
    if (!m[1].includes('saveinsta') && !m[1].includes('ads')) {
      links.push({ label: `⬇️ Download Video ${links.length + 1}`, url: m[1], filename: `instagram_${links.length + 1}.mp4` });
    }
  }

  if (!links.length) throw new Error('SaveInsta: Link tidak ditemukan');
  return { title: 'Instagram Media', thumbnail: '', platform: 'Instagram', links };
}

async function dlY2Mate(url, format) {
  const body1 = JSON.stringify({ q: url, vt: 'home' });
  const r1 = await doReq({
    hostname: 'www.y2mate.com',
    path: '/mates/analyzeV2/ajax',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://www.y2mate.com/',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Length': Buffer.byteLength(body1)
    }
  }, body1);

  const j1 = JSON.parse(r1.body);
  if (!j1.links) throw new Error('Y2Mate: Analisis link gagal');

  const pool = format === 'mp3' ? (j1.links?.mp3 || {}) : (j1.links?.mp4 || {});
  const entry = Object.entries(pool).find(([, v]) => v.k);
  if (!entry) throw new Error('Y2Mate: Format tidak tersedia');

  const [, val] = entry;
  const body2 = JSON.stringify({ vid: j1.vid, k: val.k });
  const r2 = await doReq({
    hostname: 'www.y2mate.com',
    path: '/mates/convertV2/index',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://www.y2mate.com/',
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Length': Buffer.byteLength(body2)
    }
  }, body2, 25000);

  const j2 = JSON.parse(r2.body);
  if (!j2.dlink) throw new Error('Y2Mate: Konversi gagal');

  const ytId = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1] || '';
  return {
    title: j1.title || 'YouTube Video',
    thumbnail: ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '',
    platform: 'YouTube',
    links: [{ label: `⬇️ ${format.toUpperCase()} ${val.q || ''}`.trim(), url: j2.dlink, filename: `youtube.${format}` }]
  };
}

function buildFallback(url, plat) {
  const enc = encodeURIComponent(url);
  const map = {
    TikTok: [
      { label: '🌐 SSSTik', url: `https://ssstik.io/#url=${enc}` },
      { label: '🌐 SnapTik', url: `https://snaptik.app/?url=${enc}` }
    ],
    Instagram: [
      { label: '🌐 SaveInsta', url: `https://saveinsta.app/?url=${enc}` },
      { label: '🌐 SnapSave', url: `https://snapsave.app/` }
    ],
    YouTube: [
      { label: '🌐 Y2Mate', url: `https://www.y2mate.com/youtube/${enc}` },
      { label: '🌐 SaveFrom', url: `https://en.savefrom.net/#url=${enc}` }
    ]
  };

  const links = (map[plat] || [{ label: '🌐 SaveFrom', url: `https://en.savefrom.net/#url=${enc}` }])
    .map(l => ({ ...l, filename: 'video.mp4', fallback: true }));

  return {
    title: 'Gunakan Link Alternatif Downloader',
    thumbnail: '',
    platform: plat,
    fallback: true,
    message: 'Proses otomatis dibatasi oleh serverless, silakan buka link alternatif di bawah:',
    links
  };
}

// ── Downloader API Route ──
app.post('/api/download', async (req, res) => {
  try {
    const { url, format = 'mp4' } = req.body;
    if (!url) return res.status(400).json({ error: 'URL tidak boleh kosong' });

    const cleanUrl = normalizeUrl(url);
    const plat = detectPlatform(cleanUrl);

    if (plat === 'TikTok') {
      try {
        const result = await dlTikwm(cleanUrl, format);
        return res.json(result);
      } catch (e) {}
    } else if (plat === 'Instagram') {
      try {
        const result = await dlSaveInsta(cleanUrl);
        return res.json(result);
      } catch (e) {}
    } else if (plat === 'YouTube') {
      try {
        const result = await dlY2Mate(cleanUrl, format);
        return res.json(result);
      } catch (e) {}
    }

    return res.json(buildFallback(cleanUrl, plat));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Terjadi kesalahan pada server' });
  }
});

// ── Proxy Download Route ──
app.get('/api/proxy-download', (req, res) => {
  const { url, filename = 'download' } = req.query;
  if (!url) return res.status(400).json({ error: 'Parameter URL diperlukan' });

  let target;
  try {
    target = new URL(decodeURIComponent(url));
  } catch (e) {
    return res.status(400).json({ error: 'URL tidak valid' });
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const lib = target.protocol === 'https:' ? https : http;

  const pr = lib.request({
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: target.pathname + target.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Accept': '*/*',
      'Referer': target.origin
    }
  }, (pres) => {
    if ([301, 302, 303, 307, 308].includes(pres.statusCode) && pres.headers.location) {
      const loc = pres.headers.location.startsWith('http') ? pres.headers.location : `${target.origin}${pres.headers.location}`;
      return res.redirect(`/api/proxy-download?url=${encodeURIComponent(loc)}&filename=${safeName}`);
    }

    if (pres.statusCode !== 200) {
      return res.status(502).json({ error: `Server sumber mengembalikan HTTP status ${pres.statusCode}` });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Type', pres.headers['content-type'] || 'application/octet-stream');
    if (pres.headers['content-length']) res.setHeader('Content-Length', pres.headers['content-length']);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');

    pres.pipe(res);
  });

  pr.on('error', (e) => {
    if (!res.headersSent) res.status(502).json({ error: e.message });
  });
  pr.setTimeout(30000, () => {
    pr.destroy();
    if (!res.headersSent) res.status(504).json({ error: 'Download timeout' });
  });
  pr.end();
});

module.exports = app;

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));
}
