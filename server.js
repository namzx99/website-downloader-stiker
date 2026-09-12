/**
 * XV10 AI — Backend Server v6
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
// File-file frontend (index.html, style.css, app.js) ada di folder yang
// sama dengan server.js, jadi static file di-serve langsung dari __dirname.
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
// FREE AI  POST /api/ai  — Pollinations text (gratis, no key)
// ════════════════════════════════════════════════════════
app.post('/api/ai', async (req, res) => {
  const { messages, system } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'messages required' });

  // Build prompt string
  const sysPart = system ? `System: ${system}\n\n` : '';
  const convPart = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
  const fullPrompt = sysPart + convPart + '\nAssistant:';

  const payload = JSON.stringify({
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages,
    ],
    model: 'openai',
    seed: Math.floor(Math.random() * 99999),
    stream: false,
  });

  // Try Pollinations chat API
  try {
    const result = await new Promise((resolve, reject) => {
      const body = payload;
      const opt = {
        hostname: 'text.pollinations.ai',
        path: '/openai',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'XV10AI/1.0',
        },
      };
      const pr = https.request(opt, pres => {
        const chunks = [];
        pres.on('data', c => chunks.push(c));
        pres.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString();
            const j = JSON.parse(raw);
            const text = j.choices?.[0]?.message?.content || j.output || j.text;
            if (text) resolve(text);
            else reject(new Error('no text in response: ' + raw.slice(0, 200)));
          } catch (e) { reject(e); }
        });
      });
      pr.on('error', reject);
      pr.setTimeout(30000, () => { pr.destroy(); reject(new Error('timeout')); });
      pr.write(body);
      pr.end();
    });
    return res.json({ reply: result });
  } catch (e1) {
    console.log('[AI] Pollinations chat failed:', e1.message, '— trying text endpoint');
  }

  // Fallback: simple text endpoint
  try {
    const encoded = encodeURIComponent(fullPrompt);
    const result = await new Promise((resolve, reject) => {
      const opt = {
        hostname: 'text.pollinations.ai',
        path: `/${encoded}`,
        method: 'GET',
        headers: { 'User-Agent': 'XV10AI/1.0' },
      };
      const pr = https.request(opt, pres => {
        const chunks = [];
        pres.on('data', c => chunks.push(c));
        pres.on('end', () => {
          const text = Buffer.concat(chunks).toString().trim();
          if (text.length > 2) resolve(text);
          else reject(new Error('empty response'));
        });
      });
      pr.on('error', reject);
      pr.setTimeout(30000, () => { pr.destroy(); reject(new Error('timeout')); });
      pr.end();
    });
    return res.json({ reply: result });
  } catch (e2) {
    console.log('[AI] Fallback failed:', e2.message);
    return res.status(502).json({ error: 'AI tidak tersedia saat ini, coba lagi.' });
  }
});

// ════════════════════════════════════════════════════════
// GEMINI PROXY  POST /api/gemini  (jika user punya key)
// ════════════════════════════════════════════════════════
app.post('/api/gemini', (req, res) => {
  const { contents, systemPrompt, apiKey } = req.body;
  if (!contents) return res.status(400).json({ error: 'contents required' });
  if (!apiKey)   return res.status(400).json({ error: 'Gemini API Key belum diisi.' });

  const payload = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt || '' }] },
    contents,
    generationConfig: { temperature: 0.85, maxOutputTokens: 2048 },
  });
  const opt = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
  };
  const pr = https.request(opt, pres => {
    let raw = '';
    pres.on('data', c => (raw += c));
    pres.on('end', () => {
      try {
        const j = JSON.parse(raw);
        if (pres.statusCode !== 200) return res.status(pres.statusCode).json({ error: j?.error?.message || `HTTP ${pres.statusCode}` });
        const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) return res.status(500).json({ error: 'Gemini kosong' });
        res.json({ reply: text });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  });
  pr.on('error', e => res.status(502).json({ error: e.message }));
  pr.setTimeout(30000, () => { pr.destroy(); res.status(504).json({ error: 'Gemini timeout' }); });
  pr.write(payload);
  pr.end();
});

// ════════════════════════════════════════════════════════
// OPENAI PROXY  POST /api/openai
// Key dipegang di server via env var, TIDAK pernah dikirim ke browser.
// Set env var di hosting kamu: OPENAI_API_KEY=sk-proj-xxxxx
// ════════════════════════════════════════════════════════
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
app.post('/api/openai', async (req, res) => {
  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY belum diset di server (env var).' });
  const { messages, system } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'messages required' });

  const payload = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: system || '' }, ...messages],
    temperature: 0.8,
    max_tokens: 2048,
  });

  const opt = {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Length': Buffer.byteLength(payload),
    },
  };
  const pr = https.request(opt, pres => {
    let raw = '';
    pres.on('data', c => (raw += c));
    pres.on('end', () => {
      try {
        const j = JSON.parse(raw);
        if (pres.statusCode !== 200) return res.status(pres.statusCode).json({ error: j?.error?.message || `HTTP ${pres.statusCode}` });
        const reply = j.choices?.[0]?.message?.content;
        if (!reply) return res.status(500).json({ error: 'OpenAI tidak mengembalikan jawaban.' });
        res.json({ reply });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  });
  pr.on('error', e => res.status(502).json({ error: e.message }));
  pr.setTimeout(45000, () => { pr.destroy(); res.status(504).json({ error: 'OpenAI timeout' }); });
  pr.write(payload);
  pr.end();
});

// ════════════════════════════════════════════════════════
// DOWNLOAD API  POST /api/download
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

// ── URL normalizer ────────────────────────────────────────
function normalizeUrl(raw) {
  let u = raw.trim();
  // TikTok mobile share link (vm.tiktok.com / vt.tiktok.com) — keep as is, tikwm handles it
  // Remove tracking params from YouTube
  if (u.includes('youtu.be/') || u.includes('youtube.com')) {
    try {
      const parsed = new URL(u);
      const v = parsed.searchParams.get('v') || parsed.pathname.split('/').pop();
      if (v && v.length === 11) u = `https://www.youtube.com/watch?v=${v}`;
    } catch {}
  }
  return u;
}

function getStrategies(url, plat, format) {
  if (plat === 'TikTok') return [
    { name: 'tikwm',     fn: () => dlTikwm(url, format) },
    { name: 'musicaldown', fn: () => dlMusicalDown(url, format) },
    { name: 'ytdlp',     fn: () => dlYtdlp(url, format) },
  ];
  if (plat === 'Instagram') return [
    { name: 'snapsave',  fn: () => dlSnapSave(url) },
    { name: 'saveinsta', fn: () => dlSaveInsta(url) },
    { name: 'ytdlp',     fn: () => dlYtdlp(url, format) },
  ];
  if (plat === 'YouTube') return [
    { name: 'ytdlp',     fn: () => dlYtdlp(url, format) },
    { name: 'y2mate',    fn: () => dlY2Mate(url, format) },
  ];
  return [{ name: 'ytdlp', fn: () => dlYtdlp(url, format) }];
}

// ── helpers ───────────────────────────────────────────────
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

// ── TikWM ─────────────────────────────────────────────────
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

// ── MusicalDown (TikTok backup) ───────────────────────────
async function dlMusicalDown(url, format) {
  // Step 1: get token
  const home = await doReq({ hostname: 'musicaldown.com', path: '/', method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } });
  const tokenMatch = home.body.match(/name="[^"]*token[^"]*"\s+value="([^"]+)"/i);
  const idMatch    = home.body.match(/name="id"\s+value="([^"]*)"/i);
  const token = tokenMatch?.[1] || '';
  const idVal = idMatch?.[1] || '';

  const body = new URLSearchParams({ url, id: idVal, token }).toString();
  const r = await doReq({
    hostname: 'musicaldown.com', path: '/download', method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://musicaldown.com/',
      'Origin': 'https://musicaldown.com',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  const links = [];
  const dlRegex = /href="(https:\/\/[^"]+?)"[^>]*class="[^"]*btn[^"]*"/gi;
  let m;
  while ((m = dlRegex.exec(r.body)) !== null && links.length < 4) {
    const u = m[1];
    if (!u.includes('musicaldown') && u.length > 30) {
      links.push({ label: `⬇️ Download ${links.length + 1}`, url: u, filename: `tiktok_${links.length + 1}.mp4` });
    }
  }
  if (!links.length) throw new Error('musicaldown: no links');
  return { title: 'TikTok Video', thumbnail: '', platform: 'TikTok', links };
}

// ── SnapSave (Instagram) ──────────────────────────────────
async function dlSnapSave(url) {
  const home = await doReq({ hostname: 'snapsave.app', path: '/', method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
  const tokenMatch = home.body.match(/name="token"\s+value="([^"]+)"/);
  const token = tokenMatch?.[1] || '';

  const body = new URLSearchParams({ url, token }).toString();
  const r = await doReq({
    hostname: 'snapsave.app', path: '/action?lang=id', method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://snapsave.app/',
      'Origin': 'https://snapsave.app',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  const links = [];
  const patterns = [
    /href="(https:\/\/[^"]{20,}?\.mp4[^"]*?)"/gi,
    /href="(https:\/\/[^"]{20,}?cdninstagram[^"]*?)"/gi,
    /href="(https:\/\/[^"]{20,}?fbcdn[^"]*?)"/gi,
    /href="(https:\/\/[^"]{20,}?scontent[^"]*?)"/gi,
  ];
  for (const p of patterns) {
    let m; p.lastIndex = 0;
    while ((m = p.exec(r.body)) !== null && links.length < 4) {
      if (!m[1].includes('snapsave') && !m[1].includes('ads') && !links.find(l => l.url === m[1])) {
        links.push({ label: `⬇️ Video ${links.length + 1}`, url: m[1], filename: `ig_${links.length + 1}.mp4` });
      }
    }
    if (links.length) break;
  }
  if (!links.length) throw new Error('snapsave: no links');
  return { title: 'Instagram', thumbnail: '', platform: 'Instagram', links };
}

// ── SaveInsta (IG backup) ─────────────────────────────────
async function dlSaveInsta(url) {
  const body = new URLSearchParams({ url }).toString();
  const r = await doReq({
    hostname: 'saveinsta.app', path: '/action?lang=en', method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://saveinsta.app/',
      'Origin': 'https://saveinsta.app',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
  const links = [];
  const re = /href="(https:\/\/[^"]{20,}?)"\s[^>]*>\s*(?:Download|Unduh)/gi;
  let m;
  while ((m = re.exec(r.body)) !== null && links.length < 4) {
    if (!m[1].includes('saveinsta') && !m[1].includes('ads')) {
      links.push({ label: `⬇️ Download ${links.length + 1}`, url: m[1], filename: `ig_${links.length + 1}.mp4` });
    }
  }
  if (!links.length) throw new Error('saveinsta: no links');
  return { title: 'Instagram', thumbnail: '', platform: 'Instagram', links };
}

// ── Y2Mate (YouTube) ──────────────────────────────────────
async function dlY2Mate(url, format) {
  const body1 = JSON.stringify({ q: url, vt: 'home' });
  const r1 = await doReq({
    hostname: 'www.y2mate.com', path: '/mates/analyzeV2/ajax', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.y2mate.com/', 'X-Requested-With': 'XMLHttpRequest', 'Content-Length': Buffer.byteLength(body1) },
  }, body1);
  const j1 = JSON.parse(r1.body);
  if (!j1.links) throw new Error('y2mate: no links');
  const pool = format === 'mp3' ? (j1.links?.mp3 || {}) : (j1.links?.mp4 || {});
  const entry = Object.entries(pool).find(([,v]) => v.k);
  if (!entry) throw new Error('y2mate: empty pool');
  const [, val] = entry;
  const body2 = JSON.stringify({ vid: j1.vid, k: val.k });
  const r2 = await doReq({
    hostname: 'www.y2mate.com', path: '/mates/convertV2/index', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.y2mate.com/', 'X-Requested-With': 'XMLHttpRequest', 'Content-Length': Buffer.byteLength(body2) },
  }, body2, 35000);
  const j2 = JSON.parse(r2.body);
  if (!j2.dlink) throw new Error('y2mate: no dlink');
  const ytId = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1] || '';
  return {
    title: j1.title || 'YouTube Video',
    thumbnail: ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : '',
    platform: 'YouTube',
    links: [{ label: `⬇️ ${format.toUpperCase()} ${val.q || ''}`.trim(), url: j2.dlink, filename: `youtube.${format}` }],
  };
}

// ── yt-dlp ────────────────────────────────────────────────
function dlYtdlp(url, format) {
  return new Promise((resolve, reject) => {
    // Coba yt-dlp dari PATH, lalu yt-dlp.exe yang ditaruh sefolder server.js
    // (gampang buat Windows — nggak perlu ubah PATH sistem), baru fallback python.
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
    TikTok:    [{ label:'🌐 SSSTik', url:`https://ssstik.io/#url=${enc}` }, { label:'🌐 SnapTik', url:`https://snaptik.app/?url=${enc}` }, { label:'🌐 TikDownload', url:`https://tikdownload.io/#${enc}` }],
    Instagram: [{ label:'🌐 SaveInsta', url:`https://saveinsta.app/?url=${enc}` }, { label:'🌐 SnapSave', url:`https://snapsave.app/` }, { label:'🌐 InSave', url:`https://insave.io/?url=${enc}` }],
    YouTube:   [{ label:'🌐 Y2Mate', url:`https://www.y2mate.com/youtube/${enc}` }, { label:'🌐 9xBuddy', url:`https://9xbuddy.in/process?url=${enc}` }, { label:'🌐 SaveFrom', url:`https://en.savefrom.net/#url=${enc}` }],
  };
  const links = (map[plat]||[{ label:'🌐 SaveFrom', url:`https://en.savefrom.net/#url=${enc}` }]).map(l=>({...l,filename:'video.mp4',fallback:true}));
  return { title:'Buka via website downloader', thumbnail:'', platform:plat, fallback:true, message:'Klik tombol → paste link di website tersebut', links };
}

// ════════════════════════════════════════════════════════
// PROXY DOWNLOAD  GET /api/proxy-download
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
// Catch-all buat SPA fallback — pakai regex (bukan string '*') biar kompatibel
// dengan Express 5 juga (Express 5 ganti cara parsing wildcard string).
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
      console.error(`\n❌ Port ${PORT} udah dipakai proses lain! Tutup dulu proses node yang lama (Task Manager → cari "node.exe" → End Task), atau ganti PORT.\n`);
    } else {
      console.error('\n❌ Gagal start server:\n', err);
    }
    process.exit(1);
  });
}
