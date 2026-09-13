import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();

app.use(cors());
app.use(express.json());

// List API Cobalt Publik
const COBALT_INSTANCES = [
  'https://api.cobalt.tools',
  'https://cobalt-api.kwiatekm.tokyo',
  'https://co.wuk.sh',
  'https://cobalt.twi.tf'
];

async function fetchFromCobalt(url, isAudioOnly = false) {
  let lastError = null;
  for (const instance of COBALT_INSTANCES) {
    try {
      const response = await fetch(instance, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        body: JSON.stringify({
          url: url,
          downloadMode: isAudioOnly ? 'audio' : 'auto',
          audioFormat: 'mp3',
          youtubeVideoCodec: 'h264'
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (['tunnel', 'redirect', 'picker', 'stream'].includes(data.status)) {
          return { data, instance };
        }
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Semua server pengunduh sedang sibuk.');
}

// Endpoint POST /api/download
app.post('/api/download', async (req, res) => {
  try {
    const { url, platform, format } = req.body;
    if (!url) return res.status(400).json({ error: 'URL wajib diisi' });

    const isAudio = format === 'mp3';

    try {
      const { data } = await fetchFromCobalt(url, isAudio);
      let links = [];

      if (['redirect', 'tunnel', 'stream'].includes(data.status)) {
        links.push({
          url: data.url,
          label: isAudio ? 'Download MP3' : 'Download Video (HD)',
          filename: `xv10-${platform || 'media'}-${Date.now()}.${isAudio ? 'mp3' : 'mp4'}`
        });
      } else if (data.status === 'picker') {
        data.picker.forEach((item, index) => {
          links.push({
            url: item.url,
            label: `Download Media #${index + 1}`,
            filename: `xv10-${platform || 'media'}-${index + 1}-${Date.now()}.${item.type === 'photo' ? 'jpg' : 'mp4'}`
          });
        });
      }

      return res.json({
        success: true,
        platform: platform || 'media',
        title: `${(platform || 'Media').toUpperCase()} Downloader`,
        thumbnail: data.picker?.[0]?.thumb || null,
        links: links
      });

    } catch (cobaltErr) {
      return res.json({
        success: true,
        fallback: true,
        platform: platform || 'media',
        title: `Download ${platform ? platform.toUpperCase() : 'Media'}`,
        message: 'Server otomatis sedang padat. Klik tombol di bawah untuk ambil media.',
        links: [
          {
            url: `https://cobalt.tools/?url=${encodeURIComponent(url)}`,
            label: '🌐 Buka Link Alternatif',
            fallback: true
          }
        ]
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message || 'Gagal memproses permintaan' });
  }
});

// Endpoint GET /api/proxy-download
app.get('/api/proxy-download', async (req, res) => {
  const fileUrl = req.query.url;
  const filename = req.query.filename || 'download.mp4';
  if (!fileUrl) return res.status(400).send('URL diperlukan');

  try {
    const response = await fetch(fileUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    
    response.body.pipe(res);
  } catch (err) {
    res.redirect(fileUrl);
  }
});

export default app;
