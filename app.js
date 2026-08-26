(() => {
  'use strict';
  const chunks = [1,2,3,4,5,6].map(n => `./v14/app-${String(n).padStart(2,'0')}.txt?v=14`);

  async function bootV14() {
    try {
      const parts = [];
      for (const url of chunks) {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`No se pudo cargar ${url}: ${response.status}`);
        parts.push(await response.text());
      }
      // Los seis fragmentos son el app.js V14 probado, concatenado byte a byte.
      (0, eval)(parts.join(''));
      if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
        navigator.serviceWorker.register('./sw.js?v=14').catch(() => {});
      }
    } catch (err) {
      console.error('LUMA V14 no pudo arrancar', err);
      const toast = document.getElementById('toast');
      const text = document.getElementById('toastText');
      if (text) text.textContent = 'No se pudo iniciar LUMA';
      toast?.classList.add('show');
    }
  }

  bootV14();
})();
