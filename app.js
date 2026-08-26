(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  const els = {
    homeView: $("homeView"),
    prejoinView: $("prejoinView"),
    callView: $("callView"),
    createCallBtn: $("createCallBtn"),
    openJoinBtn: $("openJoinBtn"),
    joinModal: $("joinModal"),
    closeJoinBtn: $("closeJoinBtn"),
    joinLinkInput: $("joinLinkInput"),
    joinFromLinkBtn: $("joinFromLinkBtn"),
    brandBtn: $("brandBtn"),
    previewVideo: $("previewVideo"),
    localVideo: $("localVideo"),
    remoteVideo: $("remoteVideo"),
    videoEmpty: $("videoEmpty"),
    cameraSelect: $("cameraSelect"),
    cameraCount: $("cameraCount"),
    lensRow: $("lensRow"),
    flipCameraBtn: $("flipCameraBtn"),
    preMicBtn: $("preMicBtn"),
    preCamBtn: $("preCamBtn"),
    callMicBtn: $("callMicBtn"),
    callCamBtn: $("callCamBtn"),
    callFlipBtn: $("callFlipBtn"),
    callXtremeBtn: $("callXtremeBtn"),
    statsBtn: $("statsBtn"),
    closeStatsBtn: $("closeStatsBtn"),
    statsDrawer: $("statsDrawer"),
    endCallBtn: $("endCallBtn"),
    qualityHint: $("qualityHint"),
    xtremeCard: $("xtremeCard"),
    xtremeStatusLabel: $("xtremeStatusLabel"),
    directOnlyToggle: $("directOnlyToggle"),
    enterCallBtn: $("enterCallBtn"),
    enterCallText: $("enterCallText"),
    cancelPrejoinBtn: $("cancelPrejoinBtn"),
    prejoinTitle: $("prejoinTitle"),
    prejoinSubtitle: $("prejoinSubtitle"),
    captureSummary: $("captureSummary"),
    inviteModal: $("inviteModal"),
    closeInviteBtn: $("closeInviteBtn"),
    inviteUrlText: $("inviteUrlText"),
    copyInviteBtn: $("copyInviteBtn"),
    nativeShareBtn: $("nativeShareBtn"),
    emailInviteBtn: $("emailInviteBtn"),
    waitingShareBtn: $("waitingShareBtn"),
    shareMiniBtn: $("shareMiniBtn"),
    remoteWaiting: $("remoteWaiting"),
    routePill: $("routePill"),
    routeText: $("routeText"),
    callDuration: $("callDuration"),
    liveModeBadge: $("liveModeBadge"),
    liveResolution: $("liveResolution"),
    liveBitrate: $("liveBitrate"),
    qualityLive: $("qualityLive"),
    localPip: $("localPip"),
    statResolution: $("statResolution"),
    statCodec: $("statCodec"),
    statBitrateOut: $("statBitrateOut"),
    statFps: $("statFps"),
    statRtt: $("statRtt"),
    statLoss: $("statLoss"),
    statRouteDot: $("statRouteDot"),
    statRoute: $("statRoute"),
    statCandidates: $("statCandidates"),
    requestedQuality: $("requestedQuality"),
    actualQuality: $("actualQuality"),
    toast: $("toast"),
    toastText: $("toastText"),
    installBtn: $("installBtn")
  };

  const state = {
    mode: "normal",
    directOnly: false,
    host: false,
    room: null,
    key: null,
    inviteUrl: null,
    localStream: null,
    remoteStream: new MediaStream(),
    sdk: null,
    streamID: null,
    viewedStreams: new Set(),
    cameras: [],
    facing: "user",
    selectedDeviceId: "",
    micEnabled: true,
    camEnabled: true,
    active: false,
    connectedAt: null,
    durationTimer: null,
    statsTimer: null,
    statsPrev: new Map(),
    peerUUIDs: new Set(),
    pcSet: new Set(),
    deferredInstall: null,
    wakeLock: null,
    currentZoom: null
  };

  const PROFILE = {
    normal: {
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 60 }
      },
      bitrate: 12_000_000,
      label: "AUTO"
    },
    xtreme: {
      video: {
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 60, max: 60 }
      },
      bitrate: 60_000_000,
      label: "XTREME"
    }
  };

  function installPeerConnectionObserver() {
    if (!window.RTCPeerConnection || window.__lumaPCObserverInstalled) return;
    try {
      const NativePC = window.RTCPeerConnection;
      const proxied = new Proxy(NativePC, {
        construct(target, args, newTarget) {
          const pc = Reflect.construct(target, args, newTarget);
          state.pcSet.add(pc);
          pc.addEventListener("connectionstatechange", () => {
            if (pc.connectionState === "closed") state.pcSet.delete(pc);
          });
          return pc;
        }
      });
      window.RTCPeerConnection = proxied;
      window.__lumaPCObserverInstalled = true;
    } catch (err) {
      console.warn("No se pudo activar telemetría avanzada RTC", err);
    }
  }

  function randomId(prefix = "") {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";
    let out = "";
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return prefix + out;
  }

  function randomKey() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }

  function makeInviteUrl(room, key) {
    const base = location.href.split("#")[0];
    const params = new URLSearchParams({ room, key });
    return `${base}#${params.toString()}`;
  }

  function parseInvite(input = location.href) {
    try {
      let raw = input.trim();
      let hash = "";
      if (raw.startsWith("#")) hash = raw.slice(1);
      else {
        const u = new URL(raw, location.href);
        hash = u.hash.slice(1);
      }
      const params = new URLSearchParams(hash);
      const room = params.get("room");
      const key = params.get("key");
      if (!room || !key) return null;
      if (!/^[A-Za-z0-9_]{8,80}$/.test(room)) return null;
      if (!/^[a-f0-9]{32,128}$/i.test(key)) return null;
      return { room, key };
    } catch {
      return null;
    }
  }

  function showView(view) {
    [els.homeView, els.prejoinView, els.callView].forEach(v => v.classList.remove("active"));
    view.classList.add("active");
  }

  function toast(message, type = "ok") {
    els.toastText.textContent = message;
    const dot = els.toast.querySelector(".toast-dot");
    dot.style.background = type === "error" ? "#ff4d62" : type === "warn" ? "#ffad55" : "#5cf2ad";
    dot.style.boxShadow = `0 0 9px ${dot.style.background}`;
    els.toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  function openModal(modal) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function syncMediaButtons() {
    [els.preMicBtn, els.callMicBtn].forEach(b => b.classList.toggle("active", state.micEnabled));
    [els.preCamBtn, els.callCamBtn].forEach(b => b.classList.toggle("active", state.camEnabled));
  }

  function cameraConstraints(deviceId = state.selectedDeviceId) {
    const profile = PROFILE[state.mode].video;
    const video = {
      ...profile,
      facingMode: deviceId ? undefined : { ideal: state.facing },
      resizeMode: "none"
    };
    if (deviceId) video.deviceId = { exact: deviceId };
    Object.keys(video).forEach(k => video[k] === undefined && delete video[k]);
    return video;
  }

  function audioConstraints() {
    return {
      echoCancellation: true,
      noiseSuppression: state.mode !== "xtreme",
      autoGainControl: state.mode !== "xtreme",
      channelCount: { ideal: 2 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 }
    };
  }

  async function acquireMedia({ preserveAudio = false } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Este navegador no permite usar cámara y micrófono.");
    }

    const oldStream = state.localStream;
    const oldAudio = preserveAudio ? oldStream?.getAudioTracks()?.[0] : null;
    let stream;

    if (preserveAudio && oldAudio) {
      const videoOnly = await navigator.mediaDevices.getUserMedia({
        video: cameraConstraints(),
        audio: false
      });
      stream = new MediaStream([videoOnly.getVideoTracks()[0], oldAudio]);
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: cameraConstraints(),
          audio: audioConstraints()
        });
      } catch (err) {
        if (state.mode === "xtreme" && ["OverconstrainedError", "NotReadableError", "TypeError"].includes(err.name)) {
          const fallbackVideo = {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          };
          if (state.selectedDeviceId) fallbackVideo.deviceId = { exact: state.selectedDeviceId };
          else fallbackVideo.facingMode = { ideal: state.facing };
          stream = await navigator.mediaDevices.getUserMedia({ video: fallbackVideo, audio: audioConstraints() });
          toast("iOS ha reducido la captura máxima disponible", "warn");
        } else {
          throw err;
        }
      }
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      try { videoTrack.contentHint = state.mode === "xtreme" ? "detail" : "motion"; } catch {}
    }

    state.localStream = stream;
    state.localStream.getAudioTracks().forEach(t => t.enabled = state.micEnabled);
    state.localStream.getVideoTracks().forEach(t => t.enabled = state.camEnabled);

    els.previewVideo.srcObject = stream;
    els.localVideo.srcObject = stream;
    els.videoEmpty.style.display = "none";

    await refreshDevices();
    updateFacingFromTrack();
    updateCaptureSummary();
    renderLensControls();
    return { stream, oldStream };
  }

  async function refreshDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      state.cameras = devices.filter(d => d.kind === "videoinput");
      const previous = state.selectedDeviceId;
      els.cameraSelect.innerHTML = "";
      state.cameras.forEach((cam, index) => {
        const option = document.createElement("option");
        option.value = cam.deviceId;
        option.textContent = friendlyCameraName(cam, index);
        els.cameraSelect.appendChild(option);
      });
      if (previous && state.cameras.some(c => c.deviceId === previous)) {
        els.cameraSelect.value = previous;
      } else {
        const currentId = state.localStream?.getVideoTracks()[0]?.getSettings()?.deviceId;
        if (currentId && state.cameras.some(c => c.deviceId === currentId)) {
          state.selectedDeviceId = currentId;
          els.cameraSelect.value = currentId;
        } else if (state.cameras[0]) {
          state.selectedDeviceId = state.cameras[0].deviceId;
        }
      }
      els.cameraCount.textContent = `${state.cameras.length} ${state.cameras.length === 1 ? "cámara" : "cámaras"} expuestas`;
    } catch {
      els.cameraCount.textContent = "Selección automática";
    }
  }

  function friendlyCameraName(cam, index) {
    const label = (cam.label || "").trim();
    if (label) {
      const lower = label.toLowerCase();
      if (/front|frontal|user|facetime/.test(lower)) return `Frontal · ${label}`;
      if (/ultra|0\.5|wide angle/.test(lower)) return `Ultra gran angular · ${label}`;
      if (/tele|3x|5x/.test(lower)) return `Teleobjetivo · ${label}`;
      if (/back|rear|trasera|environment/.test(lower)) return `Trasera · ${label}`;
      return label;
    }
    return `Cámara ${index + 1}`;
  }

  function updateFacingFromTrack() {
    const track = state.localStream?.getVideoTracks()[0];
    if (!track) return;
    const settings = track.getSettings?.() || {};
    const label = (track.label || "").toLowerCase();
    if (settings.facingMode) state.facing = settings.facingMode;
    else if (/front|frontal|facetime/.test(label)) state.facing = "user";
    else if (/back|rear|trasera|environment|wide|tele/.test(label)) state.facing = "environment";
    els.previewVideo.parentElement.classList.toggle("environment", state.facing === "environment");
    els.localPip.classList.toggle("environment", state.facing === "environment");
  }

  function updateCaptureSummary() {
    const track = state.localStream?.getVideoTracks()[0];
    if (!track) {
      els.captureSummary.textContent = "—";
      return;
    }
    const s = track.getSettings?.() || {};
    const parts = [];
    if (s.width && s.height) parts.push(`${s.width}×${s.height}`);
    if (s.frameRate) parts.push(`${Math.round(s.frameRate)} FPS`);
    els.captureSummary.textContent = parts.join(" · ") || "Cámara activa";
  }

  function renderLensControls() {
    const track = state.localStream?.getVideoTracks()[0];
    if (!track?.getCapabilities) {
      els.lensRow.hidden = true;
      return;
    }
    let caps = {};
    try { caps = track.getCapabilities(); } catch {}
    const zoom = caps.zoom;
    if (!zoom || typeof zoom.min !== "number" || typeof zoom.max !== "number" || zoom.max <= zoom.min) {
      els.lensRow.hidden = true;
      els.lensRow.innerHTML = "";
      return;
    }

    const wanted = [0.5, 1, 2, 3, 5].filter(v => v >= zoom.min && v <= zoom.max);
    if (!wanted.length) {
      els.lensRow.hidden = true;
      return;
    }

    els.lensRow.innerHTML = "";
    wanted.forEach(value => {
      const b = document.createElement("button");
      b.className = "lens-btn";
      b.textContent = `${value}×`;
      b.addEventListener("click", () => setZoom(value, b));
      els.lensRow.appendChild(b);
    });
    els.lensRow.hidden = false;
  }

  async function setZoom(value, button) {
    const track = state.localStream?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: value }] });
      state.currentZoom = value;
      $$(".lens-btn").forEach(b => b.classList.toggle("active", b === button));
      toast(`Zoom ${value}× aplicado`);
    } catch {
      toast("Esta lente no admite control web", "warn");
    }
  }

  async function switchCamera(deviceId) {
    if (!deviceId || deviceId === state.selectedDeviceId && state.localStream) return;
    const oldTrack = state.localStream?.getVideoTracks()[0];
    state.selectedDeviceId = deviceId;
    try {
      const { stream } = await acquireMedia({ preserveAudio: true });
      const newTrack = stream.getVideoTracks()[0];
      if (state.active && state.sdk && oldTrack && newTrack) {
        try { await state.sdk.replaceTrack(oldTrack, newTrack); }
        catch (err) { console.warn("replaceTrack SDK", err); }
      }
      if (oldTrack && oldTrack !== newTrack) oldTrack.stop();
      await applyXtremeSenderTuning();
      updateCaptureSummary();
    } catch (err) {
      console.error(err);
      toast("No se ha podido cambiar de cámara", "error");
    }
  }

  async function flipCamera() {
    if (!state.cameras.length) return;
    const current = els.cameraSelect.value || state.selectedDeviceId;
    let idx = state.cameras.findIndex(c => c.deviceId === current);
    idx = (idx + 1) % state.cameras.length;
    els.cameraSelect.value = state.cameras[idx].deviceId;
    await switchCamera(state.cameras[idx].deviceId);
  }

  async function setMode(mode, { reCapture = true } = {}) {
    state.mode = mode;
    const xtreme = mode === "xtreme";
    $$(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
    els.xtremeCard.classList.toggle("visible", xtreme);
    els.xtremeStatusLabel.textContent = xtreme ? "ARMED" : "OFF";
    els.qualityHint.textContent = xtreme ? "Máximo potencial disponible" : "Equilibrio perfecto";
    if (xtreme) {
      state.directOnly = true;
      els.directOnlyToggle.checked = true;
    }
    els.requestedQuality.textContent = xtreme ? "4K · 60 FPS · 60 Mb/s" : "AUTO · adaptativa";
    els.liveModeBadge.textContent = PROFILE[mode].label;
    els.callXtremeBtn.classList.toggle("active", xtreme);
    els.qualityLive.classList.toggle("xtreme", xtreme);

    if (reCapture && state.localStream) {
      const oldTrack = state.localStream.getVideoTracks()[0];
      try {
        const { stream } = await acquireMedia({ preserveAudio: true });
        const newTrack = stream.getVideoTracks()[0];
        if (state.active && state.sdk && oldTrack && newTrack) {
          try { await state.sdk.replaceTrack(oldTrack, newTrack); } catch {}
        }
        if (oldTrack && oldTrack !== newTrack) oldTrack.stop();
        await applyXtremeSenderTuning();
      } catch (err) {
        console.warn("Cambio de perfil", err);
        toast("El navegador ha mantenido la calidad anterior", "warn");
      }
    }
  }

  async function applyXtremeSenderTuning() {
    if (!state.pcSet.size) return;
    for (const pc of state.pcSet) {
      if (pc.connectionState === "closed") continue;
      for (const sender of pc.getSenders?.() || []) {
        if (sender.track?.kind !== "video" || !sender.getParameters || !sender.setParameters) continue;
        try {
          const p = sender.getParameters();
          if (!p.encodings?.length) p.encodings = [{}];
          for (const enc of p.encodings) {
            enc.maxBitrate = PROFILE[state.mode].bitrate;
            if (state.mode === "xtreme") {
              if ("maxFramerate" in enc || typeof enc.maxFramerate === "undefined") enc.maxFramerate = 60;
              if ("scaleResolutionDownBy" in enc || typeof enc.scaleResolutionDownBy === "undefined") enc.scaleResolutionDownBy = 1;
              try { enc.priority = "high"; } catch {}
              try { enc.networkPriority = "high"; } catch {}
            } else {
              enc.maxFramerate = 60;
            }
          }
          await sender.setParameters(p);
        } catch (err) {
          console.debug("El navegador no aceptó todos los parámetros XTREME", err);
        }
      }
    }
  }

  async function beginPrejoin({ host, room, key }) {
    state.host = host;
    state.room = room;
    state.key = key;
    state.inviteUrl = makeInviteUrl(room, key);
    history.replaceState(null, "", `#${new URLSearchParams({ room, key }).toString()}`);

    els.prejoinTitle.textContent = host ? "Tu llamada está lista." : "Te están invitando.";
    els.prejoinSubtitle.textContent = host
      ? "Comprueba la imagen. Después podrás compartir un enlace privado."
      : "No necesitas cuenta. Comprueba cámara y micrófono y entra.";
    els.enterCallText.textContent = host ? "Iniciar llamada" : "Entrar a la llamada";

    showView(els.prejoinView);
    try {
      await acquireMedia();
      await refreshDevices();
    } catch (err) {
      console.error(err);
      els.videoEmpty.style.display = "flex";
      els.videoEmpty.querySelector("span").textContent =
        err.name === "NotAllowedError" ? "Necesitamos permiso de cámara y micrófono" : "No se ha podido abrir la cámara";
      toast("Comprueba los permisos de cámara y micrófono", "error");
    }
  }

  function createCall() {
    const room = randomId("room_");
    const key = randomKey();
    beginPrejoin({ host: true, room, key });
  }

  async function enterCall() {
    if (!state.localStream) {
      try { await acquireMedia(); }
      catch {
        toast("No puedo entrar sin acceso multimedia", "error");
        return;
      }
    }
    if (typeof window.VDONinjaSDK !== "function") {
      toast("No se ha cargado el motor P2P", "error");
      return;
    }

    els.enterCallBtn.disabled = true;
    els.enterCallText.textContent = "Conectando…";
    state.directOnly = els.directOnlyToggle.checked;

    try {
      state.streamID = randomId(state.host ? "host_" : "guest_");
      state.remoteStream = new MediaStream();
      els.remoteVideo.srcObject = state.remoteStream;
      state.viewedStreams.clear();

      state.sdk = new VDONinjaSDK({
        password: state.key,
        debug: false,
        turnServers: state.directOnly ? false : null,
        autoRelay: !state.directOnly,
        forceTURN: false,
        autoRecover: true,
        label: state.host ? "Host" : "Guest"
      });

      bindSDKEvents();

      await state.sdk.connect();
      await state.sdk.joinRoom({ room: state.room, password: state.key });
      await state.sdk.publish(state.localStream, {
        streamID: state.streamID,
        room: state.room,
        password: state.key,
        label: state.host ? "Host" : "Guest"
      });

      state.active = true;
      state.connectedAt = Date.now();
      showView(els.callView);
      els.remoteWaiting.classList.remove("hidden");
      updateInviteUI();
      startDuration();
      startStats();
      await requestWakeLock();
      setRoute("CONNECTING");
      await new Promise(r => setTimeout(r, 500));
      await applyXtremeSenderTuning();
      if (state.host) setTimeout(() => openModal(els.inviteModal), 550);
    } catch (err) {
      console.error(err);
      els.enterCallBtn.disabled = false;
      els.enterCallText.textContent = state.host ? "Iniciar llamada" : "Entrar a la llamada";
      setRoute("FAILED");
      toast(state.directOnly ? "No se pudo crear una ruta P2P directa" : "No se pudo iniciar la llamada", "error");
    }
  }

  function bindSDKEvents() {
    const sdk = state.sdk;

    const onListing = (event) => {
      const streamID = event.detail?.streamID;
      if (streamID && streamID !== state.streamID) viewRemote(streamID);
    };

    sdk.addEventListener("listing", onListing);
    sdk.addEventListener("peerListing", (event) => {
      const detail = event.detail || {};
      const items = detail.listing || detail.peers || detail.streams || [];
      if (Array.isArray(items)) {
        items.forEach(item => {
          const id = typeof item === "string" ? item : item.streamID || item.streamid || item.id;
          if (id && id !== state.streamID) viewRemote(id);
        });
      } else if (detail.streamID && detail.streamID !== state.streamID) {
        viewRemote(detail.streamID);
      }
    });

    sdk.addEventListener("track", (event) => {
      const track = event.detail?.track;
      if (!track) return;
      if (!state.remoteStream.getTracks().some(t => t.id === track.id)) state.remoteStream.addTrack(track);
      els.remoteVideo.srcObject = state.remoteStream;
      els.remoteVideo.play().catch(() => {});
      els.remoteWaiting.classList.add("hidden");
    });

    sdk.addEventListener("peerConnected", (event) => {
      const uuid = event.detail?.uuid;
      if (uuid) state.peerUUIDs.add(uuid);
      setRoute("DIRECT");
      setTimeout(applyXtremeSenderTuning, 350);
    });

    sdk.addEventListener("peerDisconnected", (event) => {
      const uuid = event.detail?.uuid;
      if (uuid) state.peerUUIDs.delete(uuid);
      if (!state.peerUUIDs.size) {
        state.remoteStream = new MediaStream();
        els.remoteVideo.srcObject = state.remoteStream;
        els.remoteWaiting.classList.remove("hidden");
        setRoute("WAITING");
      }
    });

    sdk.addEventListener("relayEscalated", () => setRoute("RELAY"));
    sdk.addEventListener("relayRestored", () => setRoute("DIRECT"));
    sdk.addEventListener("connectionFailed", () => {
      if (state.directOnly) {
        setRoute("FAILED");
        toast("La red exige relay y XTREME está en P2P only", "warn");
      }
    });
    sdk.addEventListener("error", (event) => console.warn("VDO.Ninja SDK", event.detail?.error || event.detail));
  }

  async function viewRemote(streamID) {
    if (!state.sdk || state.viewedStreams.has(streamID) || streamID === state.streamID) return;
    state.viewedStreams.add(streamID);
    try {
      await state.sdk.view(streamID, { audio: true, video: true, label: "LUMA viewer" });
      setTimeout(applyXtremeSenderTuning, 500);
    } catch (err) {
      state.viewedStreams.delete(streamID);
      console.debug("Stream todavía no disponible", streamID, err);
    }
  }

  function setRoute(route, details = "") {
    const normalized = String(route || "").toUpperCase();
    els.routeText.textContent = normalized;
    els.routePill.classList.toggle("relay", normalized === "RELAY");
    els.routePill.classList.toggle("failed", normalized === "FAILED");
    els.statRouteDot.className = `status-dot ${normalized === "DIRECT" ? "direct" : normalized === "RELAY" ? "relay" : ""}`;
    els.statRoute.textContent =
      normalized === "DIRECT" ? "Conexión directa P2P" :
      normalized === "RELAY" ? "Tráfico pasando por TURN relay" :
      normalized === "FAILED" ? "No hay ruta compatible" :
      normalized === "WAITING" ? "Esperando otro dispositivo" : "Negociando ruta…";
    if (details) els.statCandidates.textContent = details;
  }

  async function collectStats() {
    let best = null;
    let candidateInfo = null;
    let codecName = "";
    let rtt = null;
    let lossPct = null;
    let outBps = null;

    for (const pc of state.pcSet) {
      if (pc.connectionState === "closed") continue;
      let report;
      try { report = await pc.getStats(); } catch { continue; }

      const byId = new Map();
      report.forEach(r => byId.set(r.id, r));

      report.forEach(r => {
        if (r.type === "candidate-pair" && r.state === "succeeded" && (r.nominated || r.selected)) {
          const local = byId.get(r.localCandidateId);
          const remote = byId.get(r.remoteCandidateId);
          const relay = local?.candidateType === "relay" || remote?.candidateType === "relay";
          candidateInfo = {
            relay,
            local: local?.candidateType || "?",
            remote: remote?.candidateType || "?",
            protocol: local?.protocol || remote?.protocol || ""
          };
          if (typeof r.currentRoundTripTime === "number") rtt = r.currentRoundTripTime * 1000;
        }

        if (r.type === "outbound-rtp" && r.kind === "video" && !r.isRemote) {
          const previous = state.statsPrev.get(r.id);
          if (previous && r.timestamp > previous.timestamp && r.bytesSent >= previous.bytes) {
            outBps = ((r.bytesSent - previous.bytes) * 8 * 1000) / (r.timestamp - previous.timestamp);
          }
          state.statsPrev.set(r.id, { bytes: r.bytesSent || 0, timestamp: r.timestamp });

          const codec = byId.get(r.codecId);
          if (codec?.mimeType) codecName = codec.mimeType.replace("video/", "");

          const candidate = {
            width: r.frameWidth,
            height: r.frameHeight,
            fps: r.framesPerSecond,
            qualityLimitationReason: r.qualityLimitationReason
          };
          if (!best || (candidate.width || 0) * (candidate.height || 0) > (best.width || 0) * (best.height || 0)) best = candidate;
        }

        if (r.type === "remote-inbound-rtp" && r.kind === "video") {
          const lost = r.packetsLost;
          const received = r.packetsReceived;
          if (typeof lost === "number" && typeof received === "number" && lost + received > 0) {
            lossPct = (lost / (lost + received)) * 100;
          }
          if (typeof r.roundTripTime === "number" && rtt == null) rtt = r.roundTripTime * 1000;
        }
      });
    }

    if (candidateInfo) {
      setRoute(candidateInfo.relay ? "RELAY" : "DIRECT",
        `${candidateInfo.local} ↔ ${candidateInfo.remote}${candidateInfo.protocol ? ` · ${candidateInfo.protocol.toUpperCase()}` : ""}`);
    }

    const localSettings = state.localStream?.getVideoTracks()[0]?.getSettings?.() || {};
    const width = best?.width || localSettings.width;
    const height = best?.height || localSettings.height;
    const fps = best?.fps || localSettings.frameRate;

    if (width && height) {
      const res = `${width}×${height}`;
      els.statResolution.textContent = res;
      els.liveResolution.textContent = `${res}${fps ? ` · ${Math.round(fps)} FPS` : ""}`;
      els.actualQuality.textContent = `${res}${fps ? ` · ${Math.round(fps)} FPS` : ""}`;
    }
    els.statFps.textContent = fps ? `${Math.round(fps)} FPS` : "—";
    els.statCodec.textContent = codecName ? `${codecName} · WebRTC` : "WebRTC · cifrado";
    els.statBitrateOut.textContent = outBps != null ? formatBitrate(outBps) : "—";
    els.liveBitrate.textContent = outBps != null ? `${formatBitrate(outBps)} enviados` : "Midiendo bitrate…";
    els.statRtt.textContent = rtt != null ? `${Math.round(rtt)} ms` : "—";
    els.statLoss.textContent = lossPct != null ? `${lossPct.toFixed(lossPct < 1 ? 2 : 1)}%` : "—";
  }

  function formatBitrate(bps) {
    if (!Number.isFinite(bps)) return "—";
    if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(bps >= 10_000_000 ? 1 : 2)} Mb/s`;
    if (bps >= 1_000) return `${Math.round(bps / 1_000)} kb/s`;
    return `${Math.round(bps)} b/s`;
  }

  function startStats() {
    clearInterval(state.statsTimer);
    state.statsTimer = setInterval(() => collectStats().catch(() => {}), 1000);
    collectStats().catch(() => {});
  }

  function startDuration() {
    clearInterval(state.durationTimer);
    const tick = () => {
      if (!state.connectedAt) return;
      const secs = Math.floor((Date.now() - state.connectedAt) / 1000);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      els.callDuration.textContent = h ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    };
    tick();
    state.durationTimer = setInterval(tick, 1000);
  }

  function updateInviteUI() {
    if (!state.inviteUrl) return;
    els.inviteUrlText.textContent = state.inviteUrl;
  }

  async function shareInvite() {
    updateInviteUI();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Videollamada privada · LUMA",
          text: "Únete a mi videollamada privada. No necesitas registrarte.",
          url: state.inviteUrl
        });
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }
    openModal(els.inviteModal);
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(state.inviteUrl);
      els.copyInviteBtn.textContent = "Copiado";
      toast("Enlace copiado");
      setTimeout(() => els.copyInviteBtn.textContent = "Copiar", 1600);
    } catch {
      toast("No se pudo copiar el enlace", "error");
    }
  }

  function emailInvite() {
    const subject = encodeURIComponent("Videollamada privada");
    const body = encodeURIComponent(`Entra en la videollamada desde este enlace:\n\n${state.inviteUrl}\n\nNo necesitas registrarte ni instalar nada.`);
    location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function toggleMic() {
    state.micEnabled = !state.micEnabled;
    state.localStream?.getAudioTracks().forEach(t => t.enabled = state.micEnabled);
    syncMediaButtons();
  }

  function toggleCam() {
    state.camEnabled = !state.camEnabled;
    state.localStream?.getVideoTracks().forEach(t => t.enabled = state.camEnabled);
    syncMediaButtons();
  }

  async function toggleXtremeInCall() {
    const next = state.mode === "xtreme" ? "normal" : "xtreme";
    if (next === "xtreme" && !state.directOnly) {
      toast("XTREME activado sobre la ruta ya negociada", "warn");
    }
    await setMode(next);
    await applyXtremeSenderTuning();
  }

  async function endCall({ goHome = true } = {}) {
    state.active = false;
    clearInterval(state.durationTimer);
    clearInterval(state.statsTimer);
    state.durationTimer = null;
    state.statsTimer = null;
    state.connectedAt = null;

    try { state.sdk?.stopPublishing?.(); } catch {}
    try {
      for (const id of state.viewedStreams) state.sdk?.stopViewing?.(id);
    } catch {}
    try { await state.sdk?.disconnect?.(); } catch {}

    state.sdk = null;
    state.peerUUIDs.clear();
    state.viewedStreams.clear();
    state.pcSet.clear();
    state.statsPrev.clear();
    state.remoteStream = new MediaStream();
    els.remoteVideo.srcObject = state.remoteStream;
    state.localStream?.getTracks().forEach(t => t.stop());
    state.localStream = null;
    await releaseWakeLock();

    els.enterCallBtn.disabled = false;
    els.enterCallText.textContent = "Entrar a la llamada";
    closeModal(els.inviteModal);
    els.statsDrawer.classList.remove("open");
    if (goHome) {
      history.replaceState(null, "", location.pathname + location.search);
      resetHomeState();
      showView(els.homeView);
    }
  }

  function resetHomeState() {
    state.host = false;
    state.room = null;
    state.key = null;
    state.inviteUrl = null;
    state.streamID = null;
    state.selectedDeviceId = "";
    state.cameras = [];
    state.mode = "normal";
    state.directOnly = false;
    els.directOnlyToggle.checked = false;
    setMode("normal", { reCapture: false });
    syncMediaButtons();
  }

  async function requestWakeLock() {
    try {
      if ("wakeLock" in navigator) state.wakeLock = await navigator.wakeLock.request("screen");
    } catch {}
  }

  async function releaseWakeLock() {
    try { await state.wakeLock?.release?.(); } catch {}
    state.wakeLock = null;
  }

  function initPWA() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      state.deferredInstall = e;
      els.installBtn.hidden = false;
    });
    els.installBtn.addEventListener("click", async () => {
      if (!state.deferredInstall) {
        toast("En iPhone: Compartir → Añadir a pantalla de inicio");
        return;
      }
      state.deferredInstall.prompt();
      await state.deferredInstall.userChoice;
      state.deferredInstall = null;
      els.installBtn.hidden = true;
    });
  }

  function bindUI() {
    els.createCallBtn.addEventListener("click", createCall);
    els.openJoinBtn.addEventListener("click", () => openModal(els.joinModal));
    els.closeJoinBtn.addEventListener("click", () => closeModal(els.joinModal));
    els.joinFromLinkBtn.addEventListener("click", () => {
      const invite = parseInvite(els.joinLinkInput.value);
      if (!invite) return toast("Ese enlace no parece una invitación válida", "error");
      closeModal(els.joinModal);
      beginPrejoin({ host: false, ...invite });
    });
    els.joinLinkInput.addEventListener("keydown", e => {
      if (e.key === "Enter") els.joinFromLinkBtn.click();
    });

    els.brandBtn.addEventListener("click", async () => {
      if (state.active) {
        if (!confirm("¿Quieres terminar la llamada?")) return;
        await endCall();
      } else {
        state.localStream?.getTracks().forEach(t => t.stop());
        state.localStream = null;
        history.replaceState(null, "", location.pathname + location.search);
        resetHomeState();
        showView(els.homeView);
      }
    });

    $$(".mode-btn").forEach(btn => btn.addEventListener("click", () => setMode(btn.dataset.mode)));
    els.directOnlyToggle.addEventListener("change", () => state.directOnly = els.directOnlyToggle.checked);
    els.cameraSelect.addEventListener("change", () => switchCamera(els.cameraSelect.value));
    els.flipCameraBtn.addEventListener("click", flipCamera);
    els.callFlipBtn.addEventListener("click", flipCamera);
    els.preMicBtn.addEventListener("click", toggleMic);
    els.callMicBtn.addEventListener("click", toggleMic);
    els.preCamBtn.addEventListener("click", toggleCam);
    els.callCamBtn.addEventListener("click", toggleCam);
    els.callXtremeBtn.addEventListener("click", toggleXtremeInCall);
    els.enterCallBtn.addEventListener("click", enterCall);
    els.cancelPrejoinBtn.addEventListener("click", async () => {
      state.localStream?.getTracks().forEach(t => t.stop());
      state.localStream = null;
      history.replaceState(null, "", location.pathname + location.search);
      resetHomeState();
      showView(els.homeView);
    });

    els.statsBtn.addEventListener("click", () => els.statsDrawer.classList.toggle("open"));
    els.closeStatsBtn.addEventListener("click", () => els.statsDrawer.classList.remove("open"));
    els.endCallBtn.addEventListener("click", () => endCall());

    [els.waitingShareBtn, els.shareMiniBtn].forEach(b => b.addEventListener("click", shareInvite));
    els.closeInviteBtn.addEventListener("click", () => closeModal(els.inviteModal));
    els.copyInviteBtn.addEventListener("click", copyInvite);
    els.nativeShareBtn.addEventListener("click", shareInvite);
    els.emailInviteBtn.addEventListener("click", emailInvite);

    [els.inviteModal, els.joinModal].forEach(modal => {
      modal.addEventListener("click", e => { if (e.target === modal) closeModal(modal); });
    });

    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.active && !state.wakeLock) requestWakeLock();
    });
  }

  async function bootstrap() {
    installPeerConnectionObserver();
    bindUI();
    initPWA();
    resetHomeState();

    const invite = parseInvite();
    if (invite) {
      await beginPrejoin({ host: false, ...invite });
    } else {
      showView(els.homeView);
    }
  }

  bootstrap().catch(err => {
    console.error(err);
    toast("No se pudo iniciar LUMA", "error");
  });
})();
