const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Endpoint Downloader
app.post('/api/download', async (req, res) => {
  const { url, platform, format } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL tidak boleh kosong!' });
  }

  try {
    // 1. TikTok Downloader (Menggunakan API TikWM)
    if (platform === 'tiktok' || url.includes('tiktok.com')) {
      const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (data.code !== 0 || !data.data) {
        throw new Error('Gagal mengambil video TikTok. Pastikan link publik.');
      }

      const videoData = data.data;
      const downloadUrl = format === 'mp3' ? videoData.music : videoData.play;

      return res.json({
        platform: 'TikTok',
        title: videoData.title || 'TikTok Video',
        author: videoData.author?.nickname || 'Creator',
        duration: `${videoData.duration || 0}s`,
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

    // 2. Instagram Downloader (Menggunakan Cobalt API / Third-Party)
    if (platform === 'instagram' || url.includes('instagram.com')) {
      const response = await fetch('https://co.wuk.sh/api/json', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      if (!data.url) {
        throw new Error('Gagal memproses link Instagram. Pastikan akun tidak diprivat.');
      }

      return res.json({
        platform: 'Instagram',
        title: 'Instagram Media',
        author: 'Instagram User',
        thumbnail: 'https://placehold.co/130x90/e1306c/ffffff?text=Instagram',
        links: [
          {
            label: 'Download Media (MP4)',
            url: data.url,
            filename: `instagram-${Date.now()}.mp4`
          }
        ]
      });
    }

    // 3. YouTube Downloader (Menggunakan Cobalt API)
    if (platform === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
      const response = await fetch('https://co.wuk.sh/api/json', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url,
          isAudioOnly: format === 'mp3'
        })
      });

      const data = await response.json();
      if (!data.url) {
        throw new Error('Gagal memproses video YouTube.');
      }

      return res.json({
        platform: 'YouTube',
        title: 'YouTube Media',
        author: 'YouTube Channel',
        thumbnail: 'https://placehold.co/130x90/ff0000/ffffff?text=YouTube',
        links: [
          {
            label: format === 'mp3' ? 'Download Audio (MP3)' : 'Download Video (MP4)',
            url: data.url,
            filename: `youtube-${Date.now()}.${format === 'mp3' ? 'mp3' : 'mp4'}`
          }
        ]
      });
    }

    return res.status(400).json({ error: 'Platform tidak didukung.' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Terjadi kesalahan pada server.' });
  }
});

// Endpoint Proxy Download (Mencegah CORS saat mengunduh blob file)
app.get('/api/proxy-download', async (req, res) => {
  const fileUrl = req.query.url;
  const filename = req.query.filename || 'download.mp4';

  if (!fileUrl) {
    return res.status(400).send('URL missing');
  }

  try {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error('Gagal mengambil file asal.');

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (err) {
    res.status(500).send(`Error proxy download: ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});
