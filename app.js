/* ═══════════════════════════════════════
   XV10 Downloader — App Logic v5
   by Faiz
═══════════════════════════════════════ */

// ── CONFIG ────────────────────────────
const BACKEND = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? `http://localhost:${location.port || 3000}` 
  : 'https://namzx99.github.io/website-downloader-stiker/';
  
// ── STATE ─────────────────────────────
const S = {
  platform: 'tiktok',
  format: 'mp4',
  makerTab: 'stiker',
  stkBg: 'transparent',
  stkFw: '800',
  stkFs: 'normal',
  iqcFile: null,
  iqcFilter: 'none',
  iqcEmoji: '😀',
};

// ── DOWNLOAD LOGIC ────────────────────
Async function startDl() {
  const url = $('dlUrl')?.value.trim();
  if (!url) { toast('Masukkan link video dulu!', 'error'); return; }
  
  resetDlUI();
  $('dlLoading').style.display = 'block';
  $('dlBtn').disabled = true;

  try {
    let resultData = null;
    const makeHttps = u => u ? u.replace(/^http:\/\//i, 'https://') : '';
    const encodedUrl = encodeURIComponent(url);

    // ── 1. PLATFORM TIKTOK ─────────────────────────────────────────
    if (S.platform === 'tiktok') {
      if (!url.includes('tiktok.com')) {
        throw new Error('Link yang dimasukkan bukan link TikTok yang valid!');
      }

      const providers = [
        async () => {
          const res = await fetch(`https://www.tikwm.com/api/?url=${encodedUrl}`);
          const j = await res.json();
          if (j?.code === 0 && j?.data) {
            return {
              title: j.data.title || 'TikTok Video',
              author: j.data.author?.nickname || 'TikTok User',
              thumbnail: makeHttps(j.data.cover),
              links: [
                { label: 'Download Video (No WM)', url: makeHttps(j.data.play), filename: `tiktok-${Date.now()}.mp4` },
                { label: 'Download Audio (MP3)', url: makeHttps(j.data.music), filename: `tiktok-audio-${Date.now()}.mp3` }
              ].filter(l => l.url)
            };
          }
          return null;
        },
        async () => {
          const res = await fetch(`https://api.tiklydown.eu.org/api/download?url=${encodedUrl}`);
          const j = await res.json();
          if (j?.status !== false && j?.video) {
            return {
              title: j.title || 'TikTok Video',
              author: j.author?.name || 'TikTok User',
              thumbnail: makeHttps(j.cover || j.dynamic_cover),
              links: [
                { label: 'Download Video (No WM)', url: makeHttps(j.video.noWatermark || j.video.watermark), filename: `tiktok-${Date.now()}.mp4` },
                { label: 'Download Audio (MP3)', url: makeHttps(j.music?.play_url), filename: `tiktok-audio-${Date.now()}.mp3` }
              ].filter(l => l.url)
            };
          }
          return null;
        },
        async () => {
          const target = `https://www.tikwm.com/api/?url=${encodedUrl}`;
          const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`);
          const j = await res.json();
          if (j?.code === 0 && j?.data) {
            return {
              title: j.data.title || 'TikTok Video',
              author: j.data.author?.nickname || 'TikTok User',
              thumbnail: makeHttps(j.data.cover),
              links: [
                { label: 'Download Video (No WM)', url: makeHttps(j.data.play), filename: `tiktok-${Date.now()}.mp4` },
                { label: 'Download Audio (MP3)', url: makeHttps(j.data.music), filename: `tiktok-audio-${Date.now()}.mp3` }
              ].filter(l => l.url)
            };
          }
          return null;
        }
      ];

      for (const getApiData of providers) {
        try {
          resultData = await getApiData();
          if (resultData) break;
        } catch (e) {}
      }

    // ── 2. PLATFORM YOUTUBE & INSTAGRAM (COBALT API) ────────────────
    } else if (S.platform === 'youtube' || S.platform === 'instagram') {
      const isYt = S.platform === 'youtube';
      const isIg = S.platform === 'instagram';

      if (isYt && !url.match(/(youtube\.com|youtu\.be)/i)) {
        throw new Error('Link yang dimasukkan bukan link YouTube yang valid!');
      }
      if (isIg && !url.includes('instagram.com')) {
        throw new Error('Link yang dimasukkan bukan link Instagram yang valid!');
      }

      // Helper panggil Cobalt API
      const fetchCobalt = async (mode = 'auto') => {
        const res = await fetch('https://api.cobalt.tools/', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: url,
            downloadMode: mode, // 'auto' untuk MP4, 'audio' untuk MP3
            audioFormat: 'mp3',
            videoQuality: '1080'
          })
        });
        return await res.json();
      };

      // Tembak API paralel untuk MP4 dan MP3 sekaligus
      const [vData, aData] = await Promise.allSettled([
        fetchCobalt('auto'),
        fetchCobalt('audio')
      ]);

      const videoRes = vData.status === 'fulfilled' ? vData.value : null;
      const audioRes = aData.status === 'fulfilled' ? aData.value : null;

      const videoUrl = videoRes?.url;
      const audioUrl = audioRes?.url;

      if (!videoUrl && !audioUrl) {
        throw new Error('Gagal memproses media dari URL tersebut. Pastikan akun tidak di-private.');
      }

      const prefix = isYt ? 'youtube' : 'instagram';
      const titleName = isYt ? 'YouTube Media' : 'Instagram Media';

      resultData = {
        title: titleName,
        author: S.platform.toUpperCase(),
        thumbnail: '', // Cobalt tidak selalu mereturn thumbnail terpisah
        links: [
          videoUrl ? { label: 'Download Video (MP4)', url: videoUrl, filename: `${prefix}-${Date.now()}.mp4` } : null,
          audioUrl ? { label: 'Download Audio (MP3)', url: audioUrl, filename: `${prefix}-audio-${Date.now()}.mp3` } : null
        ].filter(Boolean)
      };

    } else {
      throw new Error(`Platform ${S.platform.toUpperCase()} tidak didukung.`);
    }

    if (!resultData) {
      throw new Error('Semua server downloader sedang padat. Coba beberapa detik lagi.');
    }

    $('dlLoading').style.display = 'none';
    renderDlResult(resultData);

  } catch (err) {
    $('dlLoading').style.display = 'none';
    $('dlError').style.display = 'block';
    $('dlErrMsg').textContent = err.message || 'Gagal mengambil data video';
    toast(err.message || 'Failed to fetch', 'error');
  } finally { 
    $('dlBtn').disabled = false; 
  }
}

// ── PROXY DOWNLOAD (TERSIMPAN LANGSUNG KE DEVICE) ────────────
async function proxyDownload(fileUrl, filename, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true; 
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
  
  try {
    // Ambil file sebagai Blob lalu buat Object URL untuk memicu unduhan langsung ke storage HP/PC
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Cleanup Memory
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    toast('Unduhan dimulai!', 'success');
  } catch (err) {
    // Fallback jika fetch terhalang CORS di HP
    const a = document.createElement('a');
    a.href = fileUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('Membuka tautan unduhan...', 'success');
  } finally { 
    btn.disabled = false; 
    btn.innerHTML = orig; 
  }
}

// ── PROXY DOWNLOAD (OPTIMIZED FOR HP) ────────────────────
async function proxyDownload(fileUrl, filename, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true; 
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
  
  try {
    // Di HP, cara paling aman dan stabil tanpa terhalang CORS blob adalah direct download / new tab
    const a = document.createElement('a');
    a.href = fileUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    toast('Membuat tautan unduhan...', 'success');
  } catch (err) {
    window.location.href = fileUrl;
  } finally { 
    btn.disabled = false; 
    btn.innerHTML = orig; 
  }
}

const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
const now = () => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const fmtBytes = b => b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1) + ' KB' : (b/1048576).toFixed(1) + ' MB';

function wrapText(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initMaker();
  initDownloader();
  goTo('dl');
});

/* ══════════════════════════════════════
    NAV
══════════════════════════════════════ */
function initNav() {
  $$('.sb-link, .bn').forEach(b => {
    b.addEventListener('click', () => { const p = b.dataset.p; if (p) { goTo(p); closeSidebar(); } });
  });
  $('menuBtn')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    $('mobOverlay').classList.add('show');
  });
  $('mobOverlay')?.addEventListener('click', closeSidebar);
}

function goTo(p) {
  S.page = p;
  $$('.page').forEach(x => x.classList.remove('active'));
  $$('.sb-link, .bn').forEach(x => x.classList.remove('active'));
  document.getElementById(`page-${p}`)?.classList.add('active');
  $$(`[data-p="${p}"]`).forEach(x => x.classList.add('active'));
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  $('mobOverlay').classList.remove('show');
}

/* ══════════════════════════════════════
    MAKER
══════════════════════════════════════ */
function initMaker() {
  $$('.tab-btn').forEach(b => b.addEventListener('click', () => {
    $$('.tab-btn').forEach(x => x.classList.remove('active'));
    $$('.tab-pane').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); S.makerTab = b.dataset.tab;
    document.getElementById(`tab-${b.dataset.tab}`)?.classList.add('active');
  }));
  initStikerMaker();
  initBratMaker();
  initIqcMaker();
}

/* ────── STIKER TEKS ────── */
function initStikerMaker() {
  $('stkSize')?.addEventListener('input', e => { $('stkSizeVal').textContent = e.target.value; });
  $$('.cp').forEach(cp => {
    cp.addEventListener('click', () => { $$('.cp').forEach(x => x.classList.remove('active')); cp.classList.add('active'); $('stkColor').value = cp.dataset.c; });
  });
  $$('#bgGrid .bg-opt').forEach(b => {
    b.addEventListener('click', () => {
      $$('#bgGrid .bg-opt').forEach(x => x.classList.remove('active')); b.classList.add('active');
      S.stkBg = b.dataset.bg;
      $('solidColor').style.display = S.stkBg === 'solid' ? 'block' : 'none';
    });
  });
  $$('#fontStylePills .pill').forEach(b => {
    b.addEventListener('click', () => { $$('#fontStylePills .pill').forEach(x => x.classList.remove('active')); b.classList.add('active'); S.stkFw = b.dataset.fw; S.stkFs = b.dataset.fs; });
  });
  $('btnMakeStiker')?.addEventListener('click', renderStiker);
  $('btnDlStiker')?.addEventListener('click', () => dlCanvas('stikerCanvas', `stiker-${Date.now()}.png`, 'image/png'));
  $('btnDlStikerWp')?.addEventListener('click', () => dlCanvas('stikerCanvas', `stiker-${Date.now()}.webp`, 'image/webp'));
  $('btnShareStiker')?.addEventListener('click', () => shareToWA('stikerCanvas', 'stiker.png'));
}

function renderStiker() {
  const text = $('stkText')?.value.trim();
  if (!text) { toast('Tulis teks stiker dulu!', 'error'); return; }
  const size = parseInt($('stkCanvas')?.value) || 512;
  const canvas = $('stikerCanvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const bgMap = { g1:['#667eea','#764ba2'], g2:['#f093fb','#f5576c'], g3:['#4facfe','#00f2fe'], g4:['#43e97b','#38f9d7'], g5:['#fa8231','#f7b731'], g6:['#2d3436','#636e72'] };
  if (S.stkBg === 'solid') {
    ctx.fillStyle = $('solidColor').value;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(0,0,size,size,size*.07); else ctx.rect(0,0,size,size); ctx.fill();
  } else if (bgMap[S.stkBg]) {
    const g = ctx.createLinearGradient(0,0,size,size); g.addColorStop(0,bgMap[S.stkBg][0]); g.addColorStop(1,bgMap[S.stkBg][1]);
    ctx.fillStyle = g; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(0,0,size,size,size*.07); else ctx.rect(0,0,size,size); ctx.fill();
  }
  const fs = parseInt($('stkSize')?.value) || 60;
  ctx.font = `${S.stkFs} ${S.stkFw} ${fs}px Inter,Arial,sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrapText(ctx, text, size - 60);
  const lh = fs * 1.28;
  const totalH = lines.length * lh;
  const sy = (size - totalH) / 2 + fs / 2;
  const outW = parseInt($('stkOutline')?.value) || 0;
  if (outW > 0) { ctx.strokeStyle = $('stkOutlineColor')?.value || '#000'; ctx.lineWidth = outW*2; ctx.lineJoin = 'round'; lines.forEach((l,i) => ctx.strokeText(l, size/2, sy + i*lh)); }
  ctx.fillStyle = $('stkColor')?.value || '#fff';
  lines.forEach((l,i) => ctx.fillText(l, size/2, sy + i*lh));
  $('stikerPh').classList.add('hidden');
  $('stikerActions').style.display = 'flex';
  toast('Stiker siap! ✨', 'success');
}

/* ────── BRAT MAKER ────── */
function initBratMaker() {
  let bratBg = '#8aba62', bratFg = '#000000';
  $$('.brat-th').forEach(b => {
    b.addEventListener('click', () => {
      $$('.brat-th').forEach(x => x.classList.remove('active')); b.classList.add('active');
      bratBg = b.dataset.bg; bratFg = b.dataset.fg;
      $('bratBg').value = bratBg; $('bratFg').value = bratFg;
      if ($('bratText').value.trim()) makeBrat(bratBg, bratFg);
    });
  });
  $('bratBg')?.addEventListener('input', e => { bratBg = e.target.value; $$('.brat-th').forEach(x => x.classList.remove('active')); });
  $('bratFg')?.addEventListener('input', e => { bratFg = e.target.value; $$('.brat-th').forEach(x => x.classList.remove('active')); });
  $('bratText')?.addEventListener('input', () => { if ($('bratText').value.trim()) makeBrat(bratBg, bratFg); });
  $('btnMakeBrat')?.addEventListener('click', () => { if (!$('bratText')?.value.trim()) { toast('Tulis teks BRAT dulu!', 'error'); return; } makeBrat(bratBg, bratFg); });
  $('btnDlBrat')?.addEventListener('click', () => dlCanvas('bratCanvas', `brat-${Date.now()}.png`, 'image/png'));
  $('btnShareBrat')?.addEventListener('click', () => shareToWA('bratCanvas', 'brat.png'));

  function makeBrat(bg, fg) {
    const text = $('bratText')?.value.trim(); if (!text) return;
    const ratio = $('bratRatio')?.value || '1:1';
    let cW = 1080, cH = 1080;
    if (ratio === '4:5') cH = 1350;
    if (ratio === '9:16') cH = 1920;
    const canvas = $('bratCanvas'); canvas.width = cW; canvas.height = cH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0,0,cW,cH);
    let fs = Math.min(cW * 0.2, 200);
    ctx.font = `italic 700 ${fs}px Arial,sans-serif`;
    const maxW = cW * 0.82;
    while (ctx.measureText(text).width > maxW && fs > 36) { fs -= 3; ctx.font = `italic 700 ${fs}px Arial,sans-serif`; }
    const lines = wrapText(ctx, text, maxW);
    ctx.filter = 'blur(1.2px)'; ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lh = fs * 1.3; const totalH = lines.length * lh; const sy = (cH - totalH) / 2 + fs / 2;
    lines.forEach((l,i) => ctx.fillText(l, cW/2, sy + i*lh));
    ctx.filter = 'none';
    $('bratPh').classList.add('hidden'); $('bratActions').style.display = 'flex';
  }
}

/* ────── IQC MAKER ────── */
const IQC_EMOJIS = ['👍','❤️','😂','😮','😢','🙏','🔥','💯','🥹','😍','🤩','😎','🥳','😤','🤯','👑','✨','🎉','💙','💚','🖤','🌈','⚡','🫶','👏','💪','🎵','🚀','🌸','😭'];
const IQC_DEFAULT_REACT = ['👍','❤️','😂','😮','🙏'];
let S_iqcReact = [...IQC_DEFAULT_REACT];
let iqcBubbleColor = 'out';

function initIqcMaker() {
  const picker = $('iqcEmojiPicker');
  if (picker) {
    IQC_EMOJIS.forEach(em => {
      const btn = document.createElement('button');
      btn.className = 'emoji-btn' + (S_iqcReact.includes(em) ? ' active' : '');
      btn.textContent = em;
      btn.addEventListener('click', () => {
        const i = S_iqcReact.indexOf(em);
        if (i > -1) {
          S_iqcReact.splice(i, 1);
          btn.classList.remove('active');
        } else {
          if (S_iqcReact.length >= 5) { toast('Maksimal 5 emoji reaksi', 'error'); return; }
          S_iqcReact.push(em);
          btn.classList.add('active');
        }
        renderIqc();
      });
      picker.appendChild(btn);
    });
  }

  $$('#iqcBubbleColor .mt-btn').forEach(b => b.addEventListener('click', () => {
    $$('#iqcBubbleColor .mt-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    iqcBubbleColor = b.dataset.c;
    renderIqc();
  }));

  $('iqcText')?.addEventListener('input', renderIqc);
  $('iqcTime')?.addEventListener('input', renderIqc);
  $('iqcRead')?.addEventListener('change', renderIqc);
  $('iqcShowMenu')?.addEventListener('change', renderIqc);

  $('btnMakeIqc')?.addEventListener('click', () => { renderIqc(); toast('IQC stiker siap! 🎉', 'success'); });
  $('btnDlIqc')?.addEventListener('click', () => dlCanvas('iqcCanvas', `iqc-stiker-${Date.now()}.png`, 'image/png'));
  $('btnShareIqc')?.addEventListener('click', () => shareToWA('iqcCanvas', 'iqc.png'));

  renderIqc();
}

function drawCheckmarks(ctx, x, y, isRead) {
  ctx.save();
  ctx.strokeStyle = isRead ? '#53bdeb' : 'rgba(255,255,255,.55)';
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const draw = ox => {
    ctx.beginPath();
    ctx.moveTo(x + ox, y + 4);
    ctx.lineTo(x + ox + 3, y + 7);
    ctx.lineTo(x + ox + 9, y - 2);
    ctx.stroke();
  };
  draw(0); draw(4);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = typeof r === 'number' ? { tl: r, tr: r, br: r, bl: r } : r;
  ctx.beginPath();
  ctx.moveTo(x + rr.tl, y);
  ctx.lineTo(x + w - rr.tr, y);
  ctx.arcTo(x + w, y, x + w, y + rr.tr, rr.tr);
  ctx.lineTo(x + w, y + h - rr.br);
  ctx.arcTo(x + w, y + h, x + w - rr.br, y + h, rr.br);
  ctx.lineTo(x + rr.bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr.bl, rr.bl);
  ctx.lineTo(x, y + rr.tl);
  ctx.arcTo(x, y, x + rr.tl, y, rr.tl);
  ctx.closePath();
}

function renderIqc() {
  const reactions = S_iqcReact.length ? S_iqcReact : IQC_DEFAULT_REACT;
  const mainText = $('iqcText')?.value?.trim() || 'selamat pagi 🎁🙏';
  const time = $('iqcTime')?.value?.trim() || now();
  const isRead = $('iqcRead')?.checked ?? true;
  const showMenu = $('iqcShowMenu')?.checked ?? true;
  const isOut = iqcBubbleColor === 'out';

  const bubbleBg = isOut ? '#144d43' : '#233138';
  const textColor = '#ffffff';
  const timeColor = 'rgba(255,255,255,.6)';

  const W = 460;
  const pad = 18;
  const bubbleMaxW = W - 60;

  const canvas = $('iqcCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  ctx.font = '400 24px Inter,Arial,sans-serif';
  const mainLines = wrapText(ctx, mainText, bubbleMaxW - pad * 2);
  let bubbleW = 0;
  mainLines.forEach(l => { bubbleW = Math.max(bubbleW, ctx.measureText(l).width); });
  bubbleW = Math.min(bubbleMaxW, Math.max(160, bubbleW + pad * 2 + 46));

  const lineH = 30;
  const bubbleH = 18 + mainLines.length * lineH + 26;

  const reactSize = 42;
  const reactGap = 6;
  const reactPillW = reactions.length * (reactSize + reactGap) + reactGap;
  const reactPillH = 58;

  const menuItems = [
    { label: 'Beri Bintang', icon: '★' },
    { label: 'Balas', icon: '↩' },
    { label: 'Teruskan', icon: '↪' },
  ];
  const menuW = 260, menuRowH = 52;
  const menuH = showMenu ? menuItems.length * menuRowH : 0;

  const topPad = 30, gap1 = 14, gap2 = 18, sidePad = 24;
  const canvasW = W;
  const canvasH = topPad + reactPillH + gap1 + bubbleH + (showMenu ? gap2 + menuH : 0) + 30;

  canvas.width = canvasW; canvas.height = canvasH;
  ctx.clearRect(0, 0, canvasW, canvasH);

  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvasH);
  bgGrad.addColorStop(0, '#12211f');
  bgGrad.addColorStop(1, '#0b1512');
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, canvasW, canvasH, 22);
  ctx.fill();
  ctx.save();
  ctx.filter = 'blur(28px)';
  ctx.globalAlpha = .35;
  ctx.fillStyle = '#1f6d5c';
  ctx.beginPath(); ctx.ellipse(canvasW * .8, canvasH * .25, 90, 60, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath(); ctx.ellipse(canvasW * .15, canvasH * .7, 100, 70, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  const pillX = (canvasW - reactPillW) / 2, pillY = topPad;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
  ctx.fillStyle = 'rgba(30,32,34,.92)';
  roundRect(ctx, pillX, pillY, reactPillW, reactPillH, reactPillH / 2); ctx.fill();
  ctx.restore();
  ctx.font = `${reactSize * 0.72}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  reactions.forEach((em, i) => {
    const cx = pillX + reactGap + i * (reactSize + reactGap) + reactSize / 2;
    ctx.fillText(em, cx, pillY + reactPillH / 2 + 1);
  });

  const bubbleX = canvasW - sidePad - bubbleW;
  const bubbleY = pillY + reactPillH + gap1;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  ctx.fillStyle = bubbleBg;
  roundRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, { tl: 14, tr: 4, br: 14, bl: 14 });
  ctx.fill();
  ctx.restore();

  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.font = '400 24px Inter,Arial,sans-serif';
  ctx.fillStyle = textColor;
  let ty = bubbleY + 14;
  mainLines.forEach(l => { ctx.fillText(l, bubbleX + pad, ty); ty += lineH; });

  ctx.font = '400 15px Inter,Arial,sans-serif';
  ctx.fillStyle = timeColor;
  ctx.textAlign = 'right';
  ctx.fillText(time, bubbleX + bubbleW - 14, bubbleY + bubbleH - 24);
  if (isOut) {
    const tw = ctx.measureText(time).width;
    drawCheckmarks(ctx, bubbleX + bubbleW - 20 - tw, bubbleY + bubbleH - 19, isRead);
  }

  if (showMenu) {
    const menuX = canvasW - sidePad - menuW;
    const menuY = bubbleY + bubbleH + gap2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'rgba(32,34,36,.96)';
    roundRect(ctx, menuX, menuY, menuW, menuH, 14);
    ctx.fill();
    ctx.restore();

    menuItems.forEach((it, i) => {
      const rowY = menuY + i * menuRowH;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '400 20px Inter,Arial,sans-serif';
      ctx.fillStyle = '#e9edef';
      ctx.fillText(it.label, menuX + 20, rowY + menuRowH / 2);

      ctx.textAlign = 'right';
      ctx.font = '400 20px Arial,sans-serif';
      ctx.fillStyle = '#8696a0';
      ctx.fillText(it.icon, menuX + menuW - 20, rowY + menuRowH / 2);

      if (i < menuItems.length - 1) {
        ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(menuX + 16, rowY + menuRowH);
        ctx.lineTo(menuX + menuW - 16, rowY + menuRowH);
        ctx.stroke();
      }
    });
  }

  $('iqcPh')?.classList.add('hidden');
  $('iqcActions') && ($('iqcActions').style.display = 'flex');
}

/* ────── Share ke WA langsung ────── */
async function shareToWA(canvasId, filename) {
  const canvas = $(canvasId);
  if (!canvas) return;

  canvas.toBlob(async blob => {
    const file = new File([blob], filename, { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'XV10 Downloader', text: '' });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }

    if (navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast('Gambar di-copy ke clipboard! Buka WA → Tempel', 'success');
        return;
      } catch {}
    }

    dlCanvas(canvasId, filename, 'image/png');
    toast('Tersimpan! Kirim file tersebut ke WA', 'info');
  }, 'image/png', 0.95);
}

/* ────── Canvas download ────── */
function dlCanvas(canvasId, filename, mime = 'image/png') {
  const canvas = $(canvasId); if (!canvas) return;
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    toast('File didownload! ✅', 'success');
  }, mime, 0.95);
}

/* ══════════════════════════════════════
    DOWNLOADER UI LOGIC
══════════════════════════════════════ */
function initDownloader() {
  $$('.plat-tab').forEach(b => b.addEventListener('click', () => {
    $$('.plat-tab').forEach(x => x.classList.remove('active')); b.classList.add('active');
    S.platform = b.dataset.plat; updateDlUI(S.platform);
  }));
  $$('.fmt-tab').forEach(b => b.addEventListener('click', () => {
    $$('.fmt-tab').forEach(x => x.classList.remove('active')); b.classList.add('active');
    S.format = b.dataset.fmt;
  }));
  $('dlPaste')?.addEventListener('click', async () => {
    try { 
      const t = await navigator.clipboard.readText(); 
      $('dlUrl').value = t; 
      toast('Link di-paste!', 'success'); 
    } catch { 
      toast('Izin clipboard ditolak', 'error'); 
    }
  });
  $('dlBtn')?.addEventListener('click', startDl);
}

const DL_META = {
  tiktok:    { cls:'tt', icon:'<i class="fa-brands fa-tiktok"></i>', title:'TikTok Downloader', sub:'Tanpa watermark · MP4 / MP3', ph:'https://www.tiktok.com/@user/video/...', mp3:true },
  instagram: { cls:'ig', icon:'<i class="fa-brands fa-instagram"></i>', title:'Instagram Downloader', sub:'Reels / Story / Post · MP4', ph:'https://www.instagram.com/reel/...', mp3:false },
  youtube:   { cls:'yt', icon:'<i class="fa-brands fa-youtube"></i>', title:'YouTube Downloader', sub:'Video / Audio · MP4 / MP3', ph:'https://www.youtube.com/watch?v=...', mp3:true },
};

function updateDlUI(plat) {
  const m = DL_META[plat];
  if (!m) return;
  const icon = $('dlIcon'); if (icon) { icon.className = `dl-icon ${m.cls}`; icon.innerHTML = m.icon; }
  if ($('dlTitle')) $('dlTitle').textContent = m.title; 
  if ($('dlSub')) $('dlSub').textContent = m.sub;
  if ($('dlUrl')) $('dlUrl').placeholder = m.ph;
  if ($('mp3Tab')) $('mp3Tab').style.display = m.mp3 ? 'flex' : 'none';
  if (!m.mp3 && S.format === 'mp3') {
    $$('.fmt-tab').forEach(x => x.classList.remove('active'));
    document.querySelector('.fmt-tab[data-fmt="mp4"]')?.classList.add('active'); 
    S.format = 'mp4';
  }
  resetDlUI();
}

function resetDlUI() {
  if ($('dlLoading')) $('dlLoading').style.display = 'none';
  if ($('dlResult')) $('dlResult').style.display = 'none';
  if ($('dlError')) $('dlError').style.display = 'none';
}
window.resetDl = resetDlUI;

function renderDlResult(data) {
  if ($('dlThumb')) $('dlThumb').src = data.thumbnail || 'https://placehold.co/130x90/0c0e1c/7c6fff?text=Video';
  if ($('dlResTitle')) $('dlResTitle').textContent = data.title || 'Video';
  let meta = data.platform || S.platform;
  if (data.author) meta += ' · ' + data.author;
  if (data.duration) meta += ' · ' + data.duration;
  if ($('dlResMeta')) $('dlResMeta').textContent = meta;
  
  const btns = $('dlrBtns'); 
  if (btns) {
    btns.innerHTML = '';
    if (data.fallback && data.message) {
      const n = document.createElement('div'); n.className = 'fallback-note';
      n.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${data.message}`; 
      btns.appendChild(n);
    }
    (data.links || []).forEach(lnk => {
      const isFb = lnk.fallback || lnk.label.startsWith('🌐');
      const btn = document.createElement('button');
      btn.className = 'dlr-btn' + (isFb ? ' fb' : '');
      btn.innerHTML = `<i class="fa-solid ${isFb ? 'fa-arrow-up-right-from-square' : 'fa-download'}"></i> ${lnk.label}`;
      btn.addEventListener('click', () => { 
        isFb ? window.open(lnk.url, '_blank') : proxyDownload(lnk.url, lnk.filename || 'video.mp4', btn); 
      });
      btns.appendChild(btn);
    });
  }
  
  if ($('dlResult')) $('dlResult').style.display = 'block';
  toast(data.fallback ? 'Klik tombol untuk download 🔗' : 'Siap didownload! 🎉', data.fallback ? 'info' : 'success');
}

async function proxyDownload(fileUrl, filename, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true; 
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengunduh...';
  
  try {
    // Mencoba fetch blob (berhasil jika CDN mendukung CORS)
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const bUrl = URL.createObjectURL(blob);
    const a = document.createElement('a'); 
    a.href = bUrl; 
    a.download = filename;
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(bUrl), 5000);
    toast('Download berhasil! ✅', 'success');
  } catch (err) {
    // Fallback otomatis ke tab baru jika terhalang CORS
    toast('Membuka file langsung di tab baru...', 'info');
    window.open(fileUrl, '_blank');
  } finally { 
    btn.disabled = false; 
    btn.innerHTML = orig; 
  }
}

/* ══════════════════════════════════════
    TOAST & UTILS
══════════════════════════════════════ */
function toast(msg, type = 'info') {
  const icons = { success:'fa-circle-check', error:'fa-circle-exclamation', info:'fa-circle-info' };
  const el = document.createElement('div'); el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type]||icons.info}"></i><span>${esc(msg)}</span>`;
  $('toasts')?.appendChild(el);
  setTimeout(() => { el.style.transition='all .28s ease'; el.style.opacity='0'; el.style.transform='translateX(16px)'; setTimeout(()=>el.remove(),280); }, 3400);
}

function toBase64(file) { return new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result.split(',')[1]); r.onerror=rej; r.readAsDataURL(file); }); }
function ficon(f) {
  if (f.type.startsWith('image/')) return { cls:'fi-img', icon:'fa-solid fa-image' };
  if (f.type === 'application/pdf') return { cls:'fi-pdf', icon:'fa-solid fa-file-pdf' };
  if (f.type.includes('word') || f.name.match(/\.docx?$/)) return { cls:'fi-doc', icon:'fa-solid fa-file-word' };
  if (f.type === 'text/plain') return { cls:'fi-txt', icon:'fa-solid fa-file-lines' };
  return { cls:'fi-oth', icon:'fa-solid fa-file' };
}
function mdToHtml(t) {
  if (!t) return '';
  return t
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_,l,c) => `<pre><code>${esc(c.trim())}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/^\- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>\n?)+/gs, m => `<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}
