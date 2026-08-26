(() => {
  'use strict';
  const load = src => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(script);
  });

  (async () => {
    try {
      await load('./app-v10-core.js?v=10');
      await load('./app-v10-call.js?v=10');
    } catch (err) {
      console.error(err);
      const toast = document.getElementById('toast');
      const text = document.getElementById('toastText');
      if (text) text.textContent = 'No se pudo iniciar LUMA';
      toast?.classList.add('show');
    }
  })();
})();