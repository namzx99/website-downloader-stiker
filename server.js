/**
 * XV10 Downloader — Backend Server v6 (Fixed Cobalt & yt-dlp)
 * by Faiz
 */

const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const http    = require('http');
const { exec } = require('child_process');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(__dirname, { index: 'index.html' }));

// ── Upload ────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_')),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });
app.post('/api/upload', upload.array('files', 10), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'Tidak ada file' });
  res.json({ success: true, files: req.files.map(f => ({ originalName: f.originalname, url: `/uploads/${f.filename}`, size: f.size })) });
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ════════════════════════════════════════════════════════
// DOWNLOAD API POST /api/download
// ════════════════════════════════════════════════════════
app.post('/api/download', async (req, res) => {
  const { url, format = 'mp4' } = req.body;
  if (!url) return res.status(400).json({ error: 'URL harus diisi' });

  // Normalize & detect
  const cleanUrl = normalizeUrl(url);
  const plat = detectPlatform(cleanUrl);
  console.log(`\n[DL] ${plat} | ${format} | ${cleanUrl.slice(0,80)}`);

  const strategies = getStrategies(cleanUrl, plat, format);

  for (const s of strategies) {
    try {
      console.log(`[DL] trying: ${s.name}`);
      const r = await s.fn();
      if (r?.links?.length) {
        console.log(`[DL] ✓ ${s.name} → ${r.links.length} links`);
        return res.json(r);
      }
      console.log(`[DL] ${s.name}: 0 links`);
    } catch (e) {
      console.log(`[DL] ${s.name} err: ${e.message}`);
    }
  }

  console.log('[DL] all failed → fallback');
  res.json(buildFallback(cleanUrl, plat));
});

// ── URL Normalizer ────────────────────────────────────────
function normalizeUrl(raw) {
  let u = raw.trim();
  if (u.includes('youtu.be/') || u.includes('youtube.com')) {
    try {
      const parsed = new URL(u);
      const v = parsed.searchParams.get('v') || parsed.pathname.split('/').pop();
      if (v && v.length === 11) u = `https://www.youtube.com/watch?v=${v}`;
    } catch {}
  }
  return u;
}

// ── Strategy Selection ─────────────────────────────────────
function getStrategies(url, plat, format) {
  if (plat === 'TikTok') return [
    { name: 'tikwm',  fn: () => dlTikwm(url, format) },
    { name: 'cobalt', fn: () => dlCobalt(url, format) },
    { name: 'ytdlp',  fn: () => dlYtdlp(url, format) },
  ];
  return [
    { name: 'cobalt', fn: () => dlCobalt(url, format) },
    { name: 'ytdlp',  fn: () => dlYtdlp(url, format) },
  ];
}

// ── Helpers ───────────────────────────────────────────────
function doReq(opts, body = null, ms = 20000) {
  return new Promise((resolve, reject) => {
    const lib = (opts.hostname || '').startsWith('http:') ? http : https;
    const req = (opts.protocol === 'http:' ? http : https).request(opts, resp => {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => resolve({ status: resp.statusCode, headers: resp.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.setTimeout(ms, () => { req.destroy(); reject(new Error(`timeout ${opts.hostname}`)); });
    if (body) req.write(body);
    req.end();
  });
}

// ── Cobalt API (Downloader Universal: IG, YT, TikTok, dll) ──
async function dlCobalt(url, format) {
  const payload = JSON.stringify({
    url: url,
    downloadMode: format === 'mp3' ? 'audio' : 'auto',
    audioFormat: 'mp3',
    youtubeVideoCodec: 'h264'
  });

  const r = await doReq({
    hostname: 'api.cobalt.tools',
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload, 15000);

  const j = JSON.parse(r.body);

  if (j.status === 'error') {
    throw new Error(`cobalt: ${j.error?.code || 'error'}`);
  }

  const links = [];
  const plat = detectPlatform(url);

  if (j.status === 'redirect' || j.status === 'stream') {
    links.push({
      label: format === 'mp3' ? '⬇️ Download MP3' : '⬇️ Download MP4',
      url: j.url,
      filename: `${plat.toLowerCase()}_media.${format}`
    });
  } else if (j.status === 'picker' && Array.isArray(j.picker)) {
    j.picker.forEach((item, idx) => {
      links.push({
        label: `⬇️ Media ${idx + 1} (${(item.type || 'media').toUpperCase()})`,
        url: item.url,
        filename: `${plat.toLowerCase()}_${idx + 1}.${item.type === 'video' ? 'mp4' : 'jpg'}`
      });
    });
  }

  if (!links.length) throw new Error('cobalt: no links returned');

  return {
    title: `${plat} Media`,
    thumbnail: j.picker?.[0]?.thumb || '',
    platform: plat,
    links: links
  };
}

// ── TikWM (Khusus TikTok) ──────────────────────────────────
async function dlTikwm(url, format) {
  const body = new URLSearchParams({ url, hd: '1' }).toString();
  const r = await doReq({
    hostname: 'www.tikwm.com', path: '/api/', method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', 'Content-Length': Buffer.byteLength(body) },
  }, body);
  const j = JSON.parse(r.body);
  if (j.code !== 0 || !j.data) throw new Error(`code=${j.code} ${j.msg}`);
  const d = j.data;
  const links = [];
  if (format === 'mp3') {
    if (d.music_info?.play) links.push({ label: '⬇️ MP3 Audio', url: d.music_info.play, filename: 'audio.mp3' });
    else if (d.music) links.push({ label: '⬇️ MP3 Audio', url: d.music, filename: 'audio.mp3' });
  } else {
    if (d.hdplay) links.push({ label: '⬇️ HD Tanpa WM', url: d.hdplay, filename: 'tiktok_hd.mp4' });
    if (d.play)   links.push({ label: '⬇️ Tanpa WM',    url: d.play,   filename: 'tiktok.mp4' });
    if (d.wmplay) links.push({ label: '⬇️ Dengan WM',   url: d.wmplay, filename: 'tiktok_wm.mp4' });
    if (d.music)  links.push({ label: '🎵 Audio',        url: d.music,  filename: 'audio.mp3' });
  }
  if (!links.length) throw new Error('tikwm: no links');
  return { title: d.title || 'TikTok', thumbnail: d.cover || '', platform: 'TikTok', author: d.author?.nickname || '', duration: d.duration ? d.duration + 's' : '', links };
}

// ── yt-dlp (Fallback Lokal) ────────────────────────────────
function dlYtdlp(url, format) {
  return new Promise((resolve, reject) => {
    const localExe = process.platform === 'win32'
      ? `"${path.join(__dirname, 'yt-dlp.exe')}"`
      : `"${path.join(__dirname, 'yt-dlp')}"`;
    const cmds = [
      `yt-dlp --dump-json --no-playlist --no-warnings "${url}"`,
      `${localExe} --dump-json --no-playlist --no-warnings "${url}"`,
      `python -m yt_dlp --dump-json --no-playlist --no-warnings "${url}"`,
    ];
    let tried = 0;
    function tryCmd() {
      exec(cmds[tried], { timeout: 40000 }, (err, stdout) => {
        if (err) {
          tried++;
          if (tried < cmds.length) return tryCmd();
          return reject(new Error('yt-dlp not available'));
        }
        try {
          const info = JSON.parse(stdout.trim().split('\n')[0]);
          const links = [];
          const plat  = detectPlatform(url);
          if (format === 'mp3') {
            const af = (info.formats || []).find(f => f.acodec !== 'none' && f.vcodec === 'none');
            if (af?.url) links.push({ label: '⬇️ MP3 Audio', url: af.url, filename: 'audio.mp3' });
            else if (info.url) links.push({ label: '⬇️ Audio', url: info.url, filename: 'audio.mp3' });
          } else {
            const fmts = (info.formats || [])
              .filter(f => f.ext === 'mp4' && f.vcodec !== 'none' && f.acodec !== 'none')
              .sort((a, b) => (b.height||0) - (a.height||0)).slice(0,3);
            fmts.forEach(f => { if (f.url) links.push({ label: `⬇️ MP4 ${f.height||''}p`, url: f.url, filename: `video_${f.height||'best'}.mp4` }); });
            if (!links.length && info.url) links.push({ label: '⬇️ MP4', url: info.url, filename: 'video.mp4' });
          }
          const dur = info.duration;
          resolve({ title: info.title || 'Video', thumbnail: info.thumbnail || '', platform: plat, duration: dur ? Math.floor(dur/60)+':'+String(dur%60).padStart(2,'0') : '', links });
        } catch (e) { reject(e); }
      });
    }
    tryCmd();
  });
}

// ── Fallback ──────────────────────────────────────────────
function buildFallback(url, plat) {
  const enc = encodeURIComponent(url);
  const map = {
    TikTok:    [{ label:'🌐 SSSTik', url:`https://ssstik.io/#url=${enc}` }, { label:'🌐 SnapTik', url:`https://snaptik.app/?url=${enc}` }],
    Instagram: [{ label:'🌐 SaveInsta', url:`https://saveinsta.app/?url=${enc}` }, { label:'🌐 SnapSave', url:`https://snapsave.app/` }],
    YouTube:   [{ label:'🌐 Y2Mate', url:`https://www.y2mate.com/youtube/${enc}` }, { label:'🌐 9xBuddy', url:`https://9xbuddy.in/process?url=${enc}` }],
  };
  const links = (map[plat]||[{ label:'🌐 SaveFrom', url:`https://en.savefrom.net/#url=${enc}` }]).map(l=>({...l,filename:'video.mp4',fallback:true}));
  return { title:'Buka via website downloader', thumbnail:'', platform:plat, fallback:true, message:'Klik tombol → paste link di website tersebut', links };
}

// ════════════════════════════════════════════════════════
// PROXY DOWNLOAD GET /api/proxy-download
// ════════════════════════════════════════════════════════
app.get('/api/proxy-download', (req, res) => {
  const { url, filename = 'download' } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });
  let target;
  try { target = new URL(decodeURIComponent(url)); } catch { return res.status(400).json({ error: 'invalid url' }); }
  if (!['http:','https:'].includes(target.protocol)) return res.status(400).json({ error: 'bad protocol' });

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const lib = target.protocol === 'https:' ? https : http;

  const pr = lib.request({
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: target.pathname + target.search,
    method: 'GET',
    headers: { 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept':'*/*', 'Referer': target.origin },
  }, pres => {
    if ([301,302,303,307,308].includes(pres.statusCode) && pres.headers.location) {
      const loc = pres.headers.location.startsWith('http') ? pres.headers.location : `${target.origin}${pres.headers.location}`;
      return res.redirect(`/api/proxy-download?url=${encodeURIComponent(loc)}&filename=${safeName}`);
    }
    if (pres.statusCode !== 200) return res.status(502).json({ error: `upstream ${pres.statusCode}` });
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Type', pres.headers['content-type'] || 'application/octet-stream');
    if (pres.headers['content-length']) res.setHeader('Content-Length', pres.headers['content-length']);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    pres.pipe(res);
    pres.on('error', () => res.end());
  });
  pr.on('error', e => { if (!res.headersSent) res.status(502).json({ error: e.message }); });
  pr.setTimeout(60000, () => { pr.destroy(); if (!res.headersSent) res.status(504).json({ error: 'Timeout' }); });
  pr.end();
});

// ── Utils ─────────────────────────────────────────────────
function detectPlatform(url) {
  if (url.includes('tiktok.com') || url.includes('vm.tiktok') || url.includes('vt.tiktok')) return 'TikTok';
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  return 'Video';
}

app.get('/api/health', (req, res) => res.json({ ok: true, v: '6.0.0' }));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get(/.*/, (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

process.on('uncaughtException', err => {
  console.error('\n❌ UNCAUGHT ERROR — server berhenti karena ini:\n', err);
  process.exit(1);
});
process.on('unhandledRejection', err => {
  console.error('\n❌ UNHANDLED REJECTION — server berhenti karena ini:\n', err);
  process.exit(1);
});

module.exports = app;

if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`\n  ⚡ XV10 Downloader v6 → http://localhost:${PORT}\n`));
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${PORT} udah dipakai proses lain! Tutup dulu proses node yang lama.\n`);
    } else {
      console.error('\n❌ Gagal start server:\n', err);
    }
    process.exit(1);
  });
}
