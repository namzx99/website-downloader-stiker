export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { url, platform, format } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: 'URL tidak boleh kosong!' });
  }

  try {
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

    return res.status(400).json({ error: 'Platform belum didukung. Coba link TikTok.' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Terjadi kesalahan pada server.' });
  }
}
