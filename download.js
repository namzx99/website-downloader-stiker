export default async function handler(req, res) {
  // Hanya izinkan method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { url, platform, format } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: 'URL tidak boleh kosong!' });
  }

  try {
    // 1. TikTok Downloader (TikWM API)
    if (platform === 'tiktok' || url.includes('tiktok.com')) {
      const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
      const data = await response.json();

      if (data.code !== 0 || !data.data) {
        throw new Error('Gagal mengambil video TikTok. Pastikan link publik.');
      }

      const videoData = data.data;
      const downloadUrl = format === 'mp3' ? videoData.music : videoData.play;

      return res.status(200).json({
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

    // 2. Instagram & YouTube (Cobalt API)
    if (
      platform === 'instagram' || url.includes('instagram.com') ||
      platform === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')
    ) {
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
        throw new Error('Gagal memproses link media. Coba link lain.');
      }

      return res.status(200).json({
        platform: platform || 'Media',
        title: 'Download Ready',
        author: 'User',
        thumbnail: 'https://placehold.co/130x90/333/ffffff?text=Media',
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
    return res.status(500).json({ error: err.message || 'Terjadi kesalahan server.' });
  }
}