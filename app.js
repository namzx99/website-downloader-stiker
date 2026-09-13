/* ═══════════════════════════════════════
   XV10 Downloader — App Logic Fix
═══════════════════════════════════════ */

// BACKEND otomatis menggunakan window.location.origin
const BACKEND = window.location.origin;

const S = {
  platform: 'tiktok',
  format: 'mp4',
  page: 'dl'
};

async function apiFetch(path, opts) {
  let res;
  try {
    res = await fetch(`${BACKEND}${path}`, opts);
  } catch (netErr) {
    throw new Error(`Gagal terhubung ke server. Cek koneksi internet Anda.`);
  }
  return res;
}

const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);
const esc = s => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initDownloader();
  goTo('dl');
});

function initNav() {
  $$('.sb-link, .bn').forEach(b => {
    b.addEventListener('click', () => { const p = b.dataset.p; if (p) { goTo(p); closeSidebar(); } });
  });
  $('menuBtn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.add('open');
    $('mobOverlay')?.classList.add('show');
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
  document.getElementById('sidebar')?.classList.remove('open');
  $('mobOverlay')?.classList.remove('show');
}

/* ══════════════════════════════════════
    DOWNLOADER LOGIC
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
      if ($('dlUrl')) $('dlUrl').value = t; 
      toast('Link berhasil ditempel!', 'success'); 
    } catch { 
      toast('Izin clipboard ditolak', 'error'); 
    }
  });

  $('dlBtn')?.addEventListener('click', startDl);
}

const DL_META = {
  tiktok:    { cls:'tt', icon:'<i class="fa-brands fa-tiktok"></i>', title:'TikTok Downloader', sub:'Tanpa watermark · MP4 / MP3', ph:'https://www.tiktok.com/@user/video/...', mp3:true },
  instagram: { cls:'ig', icon:'<i class="fa-brands fa-instagram"></i>', title:'Instagram Downloader', sub:'Reels / Post / Carousel · MP4', ph:'https://www.instagram.com/reel/...', mp3:false },
  youtube:   { cls:'yt', icon:'<i class="fa-brands fa-youtube"></i>', title:'YouTube Downloader', sub:'Video / Audio · MP4 / MP3', ph:'https://www.youtube.com/watch?v=...', mp3:true },
};

function updateDlUI(plat) {
  const m = DL_META[plat] || DL_META.tiktok;
  const icon = $('dlIcon'); 
  if (icon) { icon.className = `dl-icon ${m.cls}`; icon.innerHTML = m.icon; }
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

async function startDl() {
  const url = $('dlUrl')?.value.trim();
  if (!url) { toast('Masukkan link video dulu!', 'error'); return; }

  resetDlUI();
  if ($('dlLoading')) $('dlLoading').style.display = 'block';
  if ($('dlBtn')) $('dlBtn').disabled = true;

  try {
    const res = await apiFetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, platform: S.platform, format: S.format }),
    });

    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Terjadi kesalahan pada server');

    if ($('dlLoading')) $('dlLoading').style.display = 'none';
    renderDlResult(data);
  } catch (err) {
    if ($('dlLoading')) $('dlLoading').style.display = 'none';
    if ($('dlError')) $('dlError').style.display = 'block';
    if ($('dlErrMsg')) $('dlErrMsg').textContent = err.message;
    toast(err.message, 'error');
  } finally { 
    if ($('dlBtn')) $('dlBtn').disabled = false; 
  }
}

function renderDlResult(data) {
  if ($('dlThumb')) $('dlThumb').src = data.thumbnail || 'https://placehold.co/130x90/0c0e1c/7c6fff?text=Media';
  if ($('dlResTitle')) $('dlResTitle').textContent = data.title || 'Media Downloader';
  if ($('dlResMeta')) $('dlResMeta').textContent = (data.platform || 'MEDIA').toUpperCase();

  const btns = $('dlrBtns'); 
  if (!btns) return;
  btns.innerHTML = '';

  if (data.fallback && data.message) {
    const n = document.createElement('div'); 
    n.className = 'fallback-note';
    n.style.cssText = 'color: #ffcc00; margin-bottom: 10px; font-size: 14px;';
    n.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${data.message}`; 
    btns.appendChild(n);
  }

  (data.links || []).forEach(lnk => {
    const isFb = lnk.fallback || lnk.label.startsWith('🌐');
    const btn = document.createElement('button');
    btn.className = 'dlr-btn' + (isFb ? ' fb' : '');
    btn.innerHTML = `<i class="fa-solid ${isFb ? 'fa-arrow-up-right-from-square' : 'fa-download'}"></i> ${lnk.label}`;

    btn.addEventListener('click', () => { 
      if (isFb) {
        window.open(lnk.url, '_blank');
      } else {
        proxyDownload(lnk.url, lnk.filename || 'video.mp4', btn); 
      }
    });
    btns.appendChild(btn);
  });

  if ($('dlResult')) $('dlResult').style.display = 'block';
  toast(data.fallback ? 'Klik tombol untuk membuka download 🔗' : 'Media siap didownload! 🎉', data.fallback ? 'info' : 'success');
}

async function proxyDownload(fileUrl, filename, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true; 
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengunduh...';

  try {
    const proxyUrl = `${BACKEND}/api/proxy-download?url=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(filename)}`;
    const res = await fetch(proxyUrl);

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
    toast('Gagal mengunduh langsung, mengalihkan ke tab baru...', 'info');
    window.open(fileUrl, '_blank');
  } finally { 
    btn.disabled = false; 
    btn.innerHTML = orig; 
  }
}

function toast(msg, type = 'info') {
  const icons = { success:'fa-circle-check', error:'fa-circle-exclamation', info:'fa-circle-info' };
  const el = document.createElement('div'); 
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type]||icons.info}"></i> <span>${esc(msg)}</span>`;

  let container = $('toasts');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toasts';
    document.body.appendChild(container);
  }

  container.appendChild(el);
  setTimeout(() => { 
    el.style.transition='all .28s ease'; 
    el.style.opacity='0'; 
    el.style.transform='translateX(16px)'; 
    setTimeout(()=>el.remove(),280); 
  }, 3400);
}
