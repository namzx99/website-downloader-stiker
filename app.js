document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('dlForm') || document.querySelector('form');
  const urlInput = document.getElementById('urlInput') || document.querySelector('input[type="url"], input[type="text"]');
  const platformSelect = document.getElementById('platformSelect') || document.querySelector('select[name="platform"]');
  const formatSelect = document.getElementById('formatSelect') || document.querySelector('select[name="format"]');
  const resultDiv = document.getElementById('resultContainer') || document.getElementById('result');
  const btnSubmit = document.getElementById('btnSubmit') || document.querySelector('button[type="submit"]');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const url = urlInput ? urlInput.value.trim() : '';
      const platform = platformSelect ? platformSelect.value : 'auto';
      const format = formatSelect ? formatSelect.value : 'mp4';

      if (!url) {
        alert('Silakan masukkan link video!');
        return;
      }

      // Tampilan Loading
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerText = 'Memproses...';
      }
      if (resultDiv) {
        resultDiv.innerHTML = '<div class="loading">Sedang mengambil data video...</div>';
      }

      try {
        const response = await fetch('/api/download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url, platform, format })
        });

        const contentType = response.headers.get('content-type');
        
        // Cek jika response bukan JSON (seperti error 405 HTML)
        if (!contentType || !contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(`Server Error (${response.status}): ${text.substring(0, 100)}`);
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Gagal memproses request.');
        }

        // Render Hasil Download
        renderResult(data);

      } catch (err) {
        if (resultDiv) {
          resultDiv.innerHTML = `<div class="error-box" style="color:red; padding:10px; border:1px solid red; margin-top:10px;">
            ⚠️ Error: ${err.message}
          </div>`;
        }
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerText = 'Download';
        }
      }
    });
  }

  function renderResult(data) {
    if (!resultDiv) return;

    let linksHtml = data.links.map(link => `
      <a href="${link.url}" target="_blank" rel="noopener noreferrer" download="${link.filename}" 
         style="display:inline-block; padding:10px 15px; background:#2563eb; color:white; text-decoration:none; border-radius:5px; margin-top:10px;">
         ${link.label}
      </a>
    `).join('');

    resultDiv.innerHTML = `
      <div class="result-card" style="border:1px solid #ccc; padding:15px; border-radius:8px; margin-top:15px;">
        <h3>${data.title}</h3>
        <p><strong>Platform:</strong> ${data.platform} | <strong>Author:</strong> ${data.author}</p>
        ${data.thumbnail ? `<img src="${data.thumbnail}" alt="Thumbnail" style="max-width:150px; border-radius:5px;"/>` : ''}
        <div>${linksHtml}</div>
      </div>
    `;
  }
});
