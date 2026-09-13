// ════════════════════════════════════════════════════════
// DOWNLOAD STRATEGIES & COBALT API INTEGRATION
// ════════════════════════════════════════════════════════

function getStrategies(url, plat, format) {
  if (plat === 'TikTok') return [
    { name: 'tikwm',     fn: () => dlTikwm(url, format) },
    { name: 'cobalt',    fn: () => dlCobalt(url, format) },
    { name: 'ytdlp',     fn: () => dlYtdlp(url, format) },
  ];
  if (plat === 'Instagram') return [
    { name: 'cobalt',    fn: () => dlCobalt(url, format) },
    { name: 'ytdlp',     fn: () => dlYtdlp(url, format) },
  ];
  if (plat === 'YouTube') return [
    { name: 'cobalt',    fn: () => dlCobalt(url, format) },
    { name: 'ytdlp',     fn: () => dlYtdlp(url, format) },
  ];
  return [
    { name: 'cobalt',    fn: () => dlCobalt(url, format) },
    { name: 'ytdlp',     fn: () => dlYtdlp(url, format) }
  ];
}

// ── Cobalt API Downloader (Support IG, YouTube, TikTok) ──
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
    throw new Error(`cobalt error: ${j.error?.code || 'unknown'}`);
  }

  const links = [];
  const plat = detectPlatform(url);

  // Jika response berupa stream/redirect URL langsung
  if (j.status === 'redirect' || j.status === 'stream') {
    links.push({
      label: format === 'mp3' ? '⬇️ Download MP3' : '⬇️ Download MP4',
      url: j.url,
      filename: `${plat.toLowerCase()}_media.${format}`
    });
  } 
  // Jika response berupa multiple picker (misal carousel Instagram / multiple media)
  else if (j.status === 'picker' && Array.isArray(j.picker)) {
    j.picker.forEach((item, idx) => {
      links.push({
        label: `⬇️ Media ${idx + 1} (${item.type.toUpperCase()})`,
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
