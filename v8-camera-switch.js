(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const state = {
    lastRearId: '',
    lastFrontId: '',
    switching: false
  };

  const localTrack = () => $('#localVideo')?.srcObject?.getVideoTracks?.()[0] || $('#previewVideo')?.srcObject?.getVideoTracks?.()[0] || null;
  const select = () => $('#cameraSelect');

  function optionList() {
    return select() ? [...select().options] : [];
  }

  function isFrontLabel(text = '') {
    return /front|frontal|facetime|user|selfie/i.test(text);
  }

  function isRearLabel(text = '') {
    return /back|rear|trasera|environment|wide|ultra|tele|principal/i.test(text) && !isFrontLabel(text);
  }

  function currentFacing() {
    const track = localTrack();
    const settings = track?.getSettings?.() || {};
    if (settings.facingMode === 'user') return 'front';
    if (settings.facingMode === 'environment') return 'rear';

    const label = track?.label || '';
    if (isFrontLabel(label)) return 'front';
    if (isRearLabel(label)) return 'rear';

    const sel = select();
    const current = sel?.selectedOptions?.[0];
    if (isFrontLabel(current?.textContent || '')) return 'front';
    if (isRearLabel(current?.textContent || '')) return 'rear';

    return 'unknown';
  }

  function currentDeviceId() {
    const track = localTrack();
    return track?.getSettings?.()?.deviceId || select()?.value || '';
  }

  function rememberCurrent() {
    const id = currentDeviceId();
    if (!id) return;
    const facing = currentFacing();
    if (facing === 'front') state.lastFrontId = id;
    if (facing === 'rear') state.lastRearId = id;
  }

  function findFrontOption() {
    const options = optionList();
    if (state.lastFrontId) {
      const remembered = options.find(o => o.value === state.lastFrontId);
      if (remembered) return remembered;
    }
    return options.find(o => isFrontLabel(o.textContent || '')) || null;
  }

  function findRearOption() {
    const options = optionList();
    if (state.lastRearId) {
      const remembered = options.find(o => o.value === state.lastRearId);
      if (remembered) return remembered;
    }

    const explicitRear = options.filter(o => isRearLabel(o.textContent || ''));
    if (explicitRear.length) {
      // Prefer the main/rear camera over ultra/tele when switching sides.
      return explicitRear.find(o => /principal|back camera|rear camera|trasera/i.test(o.textContent || '') && !/ultra|tele/i.test(o.textContent || '')) || explicitRear[0];
    }

    // Fallback for iOS builds that expose generic names such as “Camera 1”.
    const front = findFrontOption();
    return options.find(o => !front || o.value !== front.value) || null;
  }

  async function switchTo(option, targetFacing) {
    const sel = select();
    if (!sel || !option || !option.value || state.switching) return;
    if (sel.value === option.value && currentDeviceId() === option.value) return;

    state.switching = true;
    sel.value = option.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));

    // The base app performs getUserMedia + replaceTrack asynchronously.
    // Wait until the new track appears, then remember it for the next toggle.
    const expected = option.value;
    const started = performance.now();
    const wait = () => {
      const id = currentDeviceId();
      if (id === expected || performance.now() - started > 1800) {
        if (targetFacing === 'front') state.lastFrontId = id || expected;
        if (targetFacing === 'rear') state.lastRearId = id || expected;
        state.switching = false;
        window.dispatchEvent(new CustomEvent('luma-camera-side-changed', { detail: { facing: targetFacing, deviceId: id || expected } }));
        return;
      }
      requestAnimationFrame(wait);
    };
    requestAnimationFrame(wait);
  }

  async function toggleSide() {
    rememberCurrent();
    const facing = currentFacing();

    if (facing === 'front') {
      const rear = findRearOption();
      if (rear) return switchTo(rear, 'rear');
    } else {
      const front = findFrontOption();
      if (front) return switchTo(front, 'front');
    }

    // Unknown labels: use remembered IDs first, otherwise alternate away from current.
    const current = currentDeviceId();
    const options = optionList();
    const preferred = state.lastRearId && current !== state.lastRearId
      ? options.find(o => o.value === state.lastRearId)
      : state.lastFrontId && current !== state.lastFrontId
        ? options.find(o => o.value === state.lastFrontId)
        : options.find(o => o.value !== current);
    if (preferred) await switchTo(preferred, isFrontLabel(preferred.textContent || '') ? 'front' : 'rear');
  }

  function installGlobalFlipInterceptor() {
    if (document.documentElement.dataset.lumaV8Flip === '1') return;
    document.documentElement.dataset.lumaV8Flip = '1';

    // Capture at document level so this runs before the older per-button handlers.
    document.addEventListener('click', e => {
      const button = e.target.closest?.('#flipCameraBtn, #callFlipBtn');
      if (!button) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      toggleSide().catch(() => {});
    }, true);
  }

  function observe() {
    const refresh = () => setTimeout(rememberCurrent, 250);
    $('#previewVideo')?.addEventListener('loadedmetadata', refresh);
    $('#previewVideo')?.addEventListener('playing', refresh);
    $('#localVideo')?.addEventListener('loadedmetadata', refresh);
    $('#localVideo')?.addEventListener('playing', refresh);
    window.addEventListener('luma-camera-side-changed', refresh);
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    setTimeout(rememberCurrent, 500);
  }

  function boot() {
    installGlobalFlipInterceptor();
    observe();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
