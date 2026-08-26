(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  let startDistance = 0;
  let startZoom = 1;
  let pendingZoom = 1;
  let raf = 0;
  let switching = false;
  let lastRequestedBand = '';

  const previewStage = () => $('.camera-stage');
  const previewVideo = () => $('#previewVideo');
  const localTrack = () => previewVideo()?.srcObject?.getVideoTracks?.()[0] || null;

  function distance(touches) {
    return Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    );
  }

  function getZoomCaps(track = localTrack()) {
    try {
      const zoom = track?.getCapabilities?.()?.zoom;
      if (zoom && Number.isFinite(zoom.min) && Number.isFinite(zoom.max) && zoom.max > zoom.min) return zoom;
    } catch {}
    return null;
  }

  function currentFacing(track = localTrack()) {
    const settings = track?.getSettings?.() || {};
    if (settings.facingMode) return settings.facingMode;
    return /front|frontal|facetime|user/i.test(track?.label || '') ? 'user' : 'environment';
  }

  function fmtZoom(z) {
    if (!Number.isFinite(z)) return '1×';
    const rounded = Math.abs(z - Math.round(z)) < 0.06 ? Math.round(z) : Math.round(z * 10) / 10;
    return `${String(rounded).replace('.', ',')}×`;
  }

  function inferredZoom(track = localTrack()) {
    const settings = track?.getSettings?.() || {};
    if (Number.isFinite(settings.zoom)) return settings.zoom;
    const label = (track?.label || '').toLowerCase();
    if (/ultra|0[,.]5|ultrawide|ultra wide/.test(label)) return 0.5;
    const teleMatch = label.match(/(?:tele|\b)([235])\s*x/);
    if (teleMatch) return Number(teleMatch[1]);
    if (/tele/.test(label)) return 3;
    return 1;
  }

  function ensureHud() {
    const stage = previewStage();
    if (!stage) return null;
    let hud = $('#previewZoomHud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'previewZoomHud';
      hud.className = 'preview-zoom-hud';
      hud.innerHTML = '<span class="preview-zoom-value">1×</span><small>Pellizca para cambiar de lente</small>';
      stage.appendChild(hud);
    }
    return hud;
  }

  function renderHud(forcedZoom) {
    const hud = ensureHud();
    const track = localTrack();
    if (!hud || !track) return;
    const facing = currentFacing(track);
    const zoom = Number.isFinite(forcedZoom) ? forcedZoom : inferredZoom(track);
    const value = hud.querySelector('.preview-zoom-value');
    const hint = hud.querySelector('small');

    if (facing === 'user') {
      if (value) value.textContent = 'FRONTAL';
      if (hint) hint.textContent = 'Usa ↔ para cambiar a la cámara trasera';
      hud.classList.add('front');
    } else {
      if (value) value.textContent = fmtZoom(zoom);
      if (hint) hint.textContent = zoom < 0.85 ? 'Ultra gran angular' : zoom >= 2.4 ? 'Teleobjetivo' : 'Cámara principal';
      hud.classList.remove('front');
    }
  }

  async function applyTrackZoom(value) {
    const track = localTrack();
    const caps = getZoomCaps(track);
    if (!track || !caps) return false;
    const zoom = Math.max(caps.min, Math.min(caps.max, value));
    try {
      await track.applyConstraints({ advanced: [{ zoom }] });
      pendingZoom = zoom;
      renderHud(zoom);
      return true;
    } catch {
      return false;
    }
  }

  function cameraOptions() {
    const select = $('#cameraSelect');
    return select ? [...select.options] : [];
  }

  function isFrontOption(option) {
    return /front|frontal|facetime|user/i.test(option?.textContent || '');
  }

  function lensType(option) {
    const text = (option?.textContent || '').toLowerCase();
    if (/ultra|0[,.]5|ultrawide|ultra wide/.test(text)) return 'ultra';
    if (/tele|\b3\s*x|\b5\s*x|teleobjetivo/.test(text)) return 'tele';
    if (/back|rear|trasera|principal|wide|cámara/i.test(text) && !isFrontOption(option)) return 'main';
    return 'other';
  }

  async function switchFallbackLens(targetZoom) {
    if (switching || currentFacing() === 'user') return;
    const select = $('#cameraSelect');
    if (!select) return;
    const options = cameraOptions().filter(o => !isFrontOption(o));
    if (!options.length) return;

    const band = targetZoom < 0.82 ? 'ultra' : targetZoom >= 2.35 ? 'tele' : 'main';
    if (band === lastRequestedBand) {
      renderHud(targetZoom);
      return;
    }

    let choice = options.find(o => lensType(o) === band);
    if (!choice && band === 'tele') choice = options.find(o => lensType(o) === 'main');
    if (!choice && band === 'ultra') choice = options.find(o => lensType(o) === 'main');
    if (!choice) choice = options.find(o => lensType(o) === 'main') || options[0];
    if (!choice || choice.value === select.value) {
      lastRequestedBand = band;
      renderHud(targetZoom);
      return;
    }

    switching = true;
    lastRequestedBand = band;
    select.value = choice.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    renderHud(targetZoom);
    setTimeout(() => {
      switching = false;
      renderHud();
    }, 650);
  }

  async function setPreviewZoom(value, final = false) {
    if (currentFacing() === 'user') {
      renderHud();
      return;
    }
    const caps = getZoomCaps();
    if (caps) {
      await applyTrackZoom(value);
    } else {
      pendingZoom = Math.max(0.5, Math.min(5, value));
      renderHud(pendingZoom);
      if (final) await switchFallbackLens(pendingZoom);
    }
  }

  function installPreviewPinch() {
    const stage = previewStage();
    if (!stage || stage.dataset.lumaPreviewPinch === '1') return;
    stage.dataset.lumaPreviewPinch = '1';
    ensureHud();
    renderHud();

    stage.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
    stage.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });

    stage.addEventListener('touchstart', e => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      startDistance = distance(e.touches);
      startZoom = inferredZoom();
      pendingZoom = startZoom;
      ensureHud()?.classList.add('active');
    }, { passive: false });

    stage.addEventListener('touchmove', e => {
      if (e.touches.length !== 2 || !startDistance) return;
      e.preventDefault();
      const caps = getZoomCaps();
      const min = caps?.min ?? 0.5;
      const max = caps?.max ?? 5;
      pendingZoom = Math.max(min, Math.min(max, startZoom * (distance(e.touches) / startDistance)));
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setPreviewZoom(pendingZoom, false));
    }, { passive: false });

    stage.addEventListener('touchend', e => {
      if (e.touches.length >= 2 || !startDistance) return;
      startDistance = 0;
      ensureHud()?.classList.remove('active');
      setPreviewZoom(pendingZoom, true);
    }, { passive: true });
  }

  function observeTrackChanges() {
    const video = previewVideo();
    if (!video) return;
    const refresh = () => setTimeout(() => {
      lastRequestedBand = '';
      renderHud();
    }, 120);
    video.addEventListener('loadedmetadata', refresh);
    video.addEventListener('playing', refresh);
    $('#flipCameraBtn')?.addEventListener('click', () => setTimeout(refresh, 500), true);
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
  }

  function boot() {
    installPreviewPinch();
    observeTrackChanges();
    const observer = new MutationObserver(() => {
      installPreviewPinch();
      if ($('#prejoinView')?.classList.contains('active')) renderHud();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
