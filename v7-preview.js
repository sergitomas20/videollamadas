(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const stage = () => $('.camera-stage');
  const video = () => $('#previewVideo');
  const track = () => video()?.srcObject?.getVideoTracks?.()[0] || null;
  const select = () => $('#cameraSelect');

  let gestureActive = false;
  let startZoom = 1;
  let pendingZoom = 1;
  let switching = false;
  let lastBand = '';
  const pointers = new Map();
  let pointerStartDistance = 0;
  let pointerStartZoom = 1;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const fmt = v => {
    const n = Math.abs(v - Math.round(v)) < .06 ? Math.round(v) : Math.round(v * 10) / 10;
    return `${String(n).replace('.', ',')}×`;
  };

  function caps() {
    try {
      const z = track()?.getCapabilities?.()?.zoom;
      return z && Number.isFinite(z.min) && Number.isFinite(z.max) && z.max > z.min ? z : null;
    } catch { return null; }
  }

  function facing() {
    const t = track(), s = t?.getSettings?.() || {}, label = t?.label || '';
    if (s.facingMode) return s.facingMode;
    return /front|frontal|facetime|selfie|user/i.test(label) ? 'user' : 'environment';
  }

  function options() { return select() ? [...select().options] : []; }
  function isFront(o) { return /front|frontal|facetime|selfie|user/i.test(o?.textContent || ''); }
  function lensType(o) {
    const x = (o?.textContent || '').toLowerCase();
    if (/ultra|0[,.]5|ultrawide|ultra wide/.test(x)) return 'ultra';
    if (/tele|teleobjetivo|\b3\s*x|\b5\s*x/.test(x)) return 'tele';
    return isFront(o) ? 'front' : 'main';
  }
  function hasLens(type) { return options().some(o => !isFront(o) && lensType(o) === type); }

  function inferredZoom() {
    const t = track(), s = t?.getSettings?.() || {}, label = (t?.label || '').toLowerCase();
    if (/ultra|0[,.]5|ultrawide|ultra wide/.test(label)) return .5;
    if (/5\s*x|5x/.test(label)) return 5;
    if (/3\s*x|3x|tele/.test(label)) return 3;
    if (Number.isFinite(s.zoom)) return s.zoom;
    return 1;
  }

  function logicalRange() {
    const c = caps();
    return {
      min: hasLens('ultra') ? .5 : (c?.min ?? .5),
      max: hasLens('tele') ? Math.max(5, c?.max || 1) : (c?.max ?? 5)
    };
  }

  function hud() {
    const s = stage();
    if (!s) return null;
    let h = $('#previewZoomHud');
    if (!h) {
      h = document.createElement('div');
      h.id = 'previewZoomHud';
      h.className = 'preview-zoom-hud';
      h.innerHTML = '<span class="preview-zoom-value">1×</span><small>Pellizca sobre la imagen</small>';
      s.appendChild(h);
    }
    return h;
  }

  function render(z = inferredZoom()) {
    const h = hud(); if (!h) return;
    const value = h.querySelector('.preview-zoom-value');
    const hint = h.querySelector('small');
    if (facing() === 'user') {
      value.textContent = 'FRONTAL';
      hint.textContent = 'Usa ↔ para volver a la trasera';
      h.classList.add('front');
      return;
    }
    h.classList.remove('front');
    value.textContent = fmt(z);
    hint.textContent = z < .82 ? 'Ultra gran angular' : z >= 2.35 ? 'Teleobjetivo' : 'Cámara principal';
  }

  async function applyContinuousZoom(z) {
    const t = track(), c = caps();
    if (!t || !c || z < c.min || z > c.max) return false;
    try {
      await t.applyConstraints({ advanced: [{ zoom: z }] });
      render(z);
      return true;
    } catch { return false; }
  }

  async function switchLens(z) {
    if (switching || facing() === 'user') return false;
    const sel = select(); if (!sel) return false;
    const rear = options().filter(o => !isFront(o));
    if (!rear.length) return false;

    const band = z < .82 ? 'ultra' : z >= 2.35 ? 'tele' : 'main';
    if (band === lastBand) return false;
    let choice = rear.find(o => lensType(o) === band);
    if (!choice && band !== 'main') choice = rear.find(o => lensType(o) === 'main');
    if (!choice) choice = rear[0];
    if (!choice || choice.value === sel.value) { lastBand = band; return false; }

    switching = true;
    lastBand = band;
    sel.value = choice.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    render(z);
    setTimeout(async () => {
      switching = false;
      const c = caps();
      if (c && z >= c.min && z <= c.max) await applyContinuousZoom(z);
      render();
    }, 700);
    return true;
  }

  async function setZoom(z, final = false) {
    if (facing() === 'user') { render(); return; }
    const r = logicalRange();
    z = clamp(z, r.min, r.max);
    pendingZoom = z;
    render(z);

    const c = caps();
    if (c && z >= c.min && z <= c.max) {
      await applyContinuousZoom(z);
      return;
    }

    if (final || z < (c?.min ?? .82) - .05 || z > (c?.max ?? 2.35) + .05) {
      await switchLens(z);
    }
  }

  function begin(z = inferredZoom()) {
    startZoom = z || 1;
    pendingZoom = startZoom;
    hud()?.classList.add('active');
  }
  function end() {
    hud()?.classList.remove('active');
    setZoom(pendingZoom, true);
  }

  function installSafariGesture(s) {
    s.addEventListener('gesturestart', e => {
      if (facing() === 'user') return;
      gestureActive = true;
      e.preventDefault();
      begin(inferredZoom());
    }, { passive: false });

    s.addEventListener('gesturechange', e => {
      if (!gestureActive) return;
      e.preventDefault();
      const r = logicalRange();
      pendingZoom = clamp(startZoom * Number(e.scale || 1), r.min, r.max);
      setZoom(pendingZoom, false);
    }, { passive: false });

    s.addEventListener('gestureend', e => {
      if (!gestureActive) return;
      e.preventDefault();
      gestureActive = false;
      end();
    }, { passive: false });
  }

  function pointerDistance() {
    const p = [...pointers.values()];
    if (p.length < 2) return 0;
    return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
  }

  function installPointerFallback(s) {
    s.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch' || gestureActive || facing() === 'user') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { s.setPointerCapture(e.pointerId); } catch {}
      if (pointers.size === 2) {
        pointerStartDistance = pointerDistance();
        pointerStartZoom = inferredZoom();
        begin(pointerStartZoom);
      }
    }, { passive: false });

    s.addEventListener('pointermove', e => {
      if (!pointers.has(e.pointerId) || gestureActive) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size !== 2 || !pointerStartDistance) return;
      e.preventDefault();
      const r = logicalRange();
      pendingZoom = clamp(pointerStartZoom * pointerDistance() / pointerStartDistance, r.min, r.max);
      setZoom(pendingZoom, false);
    }, { passive: false });

    const finish = e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2 && pointerStartDistance) {
        pointerStartDistance = 0;
        if (!gestureActive) end();
      }
    };
    s.addEventListener('pointerup', finish, { passive: true });
    s.addEventListener('pointercancel', finish, { passive: true });
  }

  function installTouchFallback(s) {
    let d0 = 0, z0 = 1;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    s.addEventListener('touchstart', e => {
      if (gestureActive || pointers.size || e.touches.length !== 2 || facing() === 'user') return;
      e.preventDefault(); d0 = dist(e.touches); z0 = inferredZoom(); begin(z0);
    }, { passive: false });
    s.addEventListener('touchmove', e => {
      if (gestureActive || pointers.size || e.touches.length !== 2 || !d0) return;
      e.preventDefault(); const r = logicalRange();
      pendingZoom = clamp(z0 * dist(e.touches) / d0, r.min, r.max);
      setZoom(pendingZoom, false);
    }, { passive: false });
    s.addEventListener('touchend', e => {
      if (!d0 || e.touches.length >= 2) return;
      d0 = 0; if (!gestureActive && !pointers.size) end();
    }, { passive: true });
  }

  function install() {
    const s = stage(); if (!s || s.dataset.lumaPinchV9 === '1') return;
    s.dataset.lumaPinchV9 = '1';
    hud(); render();
    installSafariGesture(s);
    installPointerFallback(s);
    installTouchFallback(s);

    const refresh = () => setTimeout(() => { lastBand = ''; render(); }, 250);
    video()?.addEventListener('loadedmetadata', refresh);
    video()?.addEventListener('playing', refresh);
    $('#flipCameraBtn')?.addEventListener('click', refresh, true);
    window.addEventListener('luma-camera-side-changed', refresh);
  }

  function boot() {
    install();
    new MutationObserver(() => {
      install();
      if ($('#prejoinView')?.classList.contains('active')) render();
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
