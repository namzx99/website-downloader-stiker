import cors from 'cors';
import fetch from 'node-fetch';

const COBALT_INSTANCES = [
  'https://cobalt-api.kwiatekm.tokyo',
  'https://api.cobalt.tools',
  'https://co.wuk.sh'
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
        if (['tunnel', 'redirect', 'picker'].includes(data.status)) {
          return { data, instance };
        }
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Semua server pengunduh sedang sibuk.');
}

export default async function handler(req, res) {
  // Biarkan CORS jalan
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { url, platform, format } = req.body || {};

  // Handling untuk Proxy Download
  if (req.method === 'GET' && req.query.url) {
    const fileUrl = req.query.url;
    const filename = req.query.filename || 'download.mp4';
    try {
      const response = await fetch(fileUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
      const arrayBuffer = await response.arrayBuffer();
      return res.status(200).send(Buffer.from(arrayBuffer));
    } catch (err) {
      return res.redirect(fileUrl);
    }
  }

  // Handling untuk Request Download Utama
  if (req.method === 'POST') {
    if (!url) return res.status(400).json({ error: 'URL wajib diisi' });
    const isAudio = format === 'mp3';

    try {
      const { data } = await fetchFromCobalt(url, isAudio);
      let links = [];

      if (data.status === 'redirect' || data.status === 'tunnel') {
        links.push({
          url: data.url,
          label: isAudio ? 'Download MP3' : 'Download Video (HD)',
          filename: `xv10-${platform}-${Date.now()}.${isAudio ? 'mp3' : 'mp4'}`
        });
      } else if (data.status === 'picker') {
        data.picker.forEach((item, index) => {
          links.push({
            url: item.url,
            label: `Download Media #${index + 1}`,
            filename: `xv10-${platform}-${index + 1}-${Date.now()}.${item.type === 'photo' ? 'jpg' : 'mp4'}`
          });
        });
      }

      return res.status(200).json({
        success: true,
        platform: platform || 'media',
        title: `${(platform || 'Media').toUpperCase()} Downloader`,
        thumbnail: data.picker?.[0]?.thumb || null,
        links: links
      });
    } catch (cobaltErr) {
      return res.status(200).json({
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
  }

  return res.status(404).json({ error: 'Endpoint tidak ditemukan' });
}
