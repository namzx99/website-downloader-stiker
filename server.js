const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Melayani file frontend statis (index.html, style.css, app.js)
app.use(express.static(path.join(__dirname)));

// Handler Utama API Downloader
const handleDownload = async (req, res) => {
  const { url, platform, format } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: 'URL tidak boleh kosong!' });
  }

  try {
    // 1. TikTok Downloader (via TikWM API)
    if (platform === 'tiktok' || url.includes('tiktok.com')) {
      const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (data.code !== 0 || !data.data) {
        throw new Error('Gagal mengambil video TikTok. Pastikan link publik.');
      }

      const videoData = data.data;
      const downloadUrl = format === 'mp3' ? videoData.music : (videoData.hdplay || videoData.play);

      return res.status(200).json({
        platform: 'TikTok',
        title: videoData.title || 'TikTok Video',
        author: videoData.author?.nickname || 'Creator',
        duration: videoData.duration ? `${videoData.duration}s` : 'Unknown',
        thumbnail: videoData.cover,
        links: [
          {
            label: format === 'mp3' ? 'Download Audio (MP3)' : 'Download Video (No Watermark)',
            url: downloadUrl,
            filename: `tiktok-${videoData.id}.${format === 'mp3' ? 'mp3' : 'mp4'}`
          }
        ]
      });
    }

    // 2. Instagram & YouTube Downloader (via Cobalt API)
    if (
      platform === 'instagram' || url.includes('instagram.com') ||
      platform === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')
    ) {
      const response = await fetch('https://api.cobalt.tools/api/json', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          downloadMode: format === 'mp3' ? 'audio' : 'auto'
        })
      });

      const data = await response.json();

      if (data.status === 'error' || !data.url) {
        throw new Error(data.text || 'Gagal memproses link media. Coba link lain.');
      }

      return res.status(200).json({
        platform: platform ? platform.toUpperCase() : 'Media',
        title: 'Hasil Download',
        author: 'User',
        thumbnail: 'https://placehold.co/130x90/111827/ffffff?text=Media',
        links: [
          {
            label: format === 'mp3' ? 'Download Audio (MP3)' : 'Download Video (MP4)',
            url: data.url,
            filename: `download-${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`
          }
        ]
      });
    }

    return res.status(400).json({ error: 'Platform tidak didukung.' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Terjadi kesalahan pada server.' });
  }
};

// Routing Express untuk Local
app.post('/api/download', handleDownload);

// Compatibility Export untuk Vercel Serverless Function
module.exports = app;
module.exports.default = (req, res) => {
  if (req.method === 'POST') {
    return handleDownload(req, res);
  }
  return res.status(405).json({ error: 'Method Not Allowed' });
};

// Jalankan Server jika di Local
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => console.log(`Server aktif di http://localhost:${PORT}`));
}
