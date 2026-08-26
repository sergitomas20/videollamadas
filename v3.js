(() => {
  "use strict";

  // LUMA v3 hardening layer. Loaded before the SDK so every RTCPeerConnection
  // can be observed without changing the P2P media path.
  const pcs = new Set();
  let pcSeq = 0;
  const NativePC = window.RTCPeerConnection;
  if (NativePC && !window.__lumaV3RTCWrapped) {
    try {
      window.RTCPeerConnection = new Proxy(NativePC, {
        construct(target, args, newTarget) {
          const pc = Reflect.construct(target, args, newTarget);
          pc.__lumaV3Id = ++pcSeq;
          pcs.add(pc);
          pc.addEventListener("connectionstatechange", () => {
            if (pc.connectionState === "closed") pcs.delete(pc);
          });
          return pc;
        }
      });
      window.__lumaV3RTCWrapped = true;
    } catch (e) {
      console.warn("LUMA v3: RTC observer unavailable", e);
    }
  }

  const $ = id => document.getElementById(id);
  const stats = {
    started: Date.now(), sent: 0, received: 0, bytePrev: new Map(), ratePrev: new Map(), freezePrev: new Map(),
    bitrateMin: Infinity, bitrateMax: 0, rttMin: Infinity, rttMax: 0, rttSum: 0, rttN: 0,
    incidents: 0, lastIncident: "Sin cortes detectados.", lastIncidentAt: 0, lastIncidentKey: "",
    health: 100, bottleneck: "Sin cuello de botella detectado.", ceiling: 1_000_000_000,
    stable: 0, lastTune: 0, lastMetrics: null
  };

  const fmtBytes = n => {
    if (!Number.isFinite(n) || n <= 0) return "0 MB";
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(n > 100 * 1024 ** 2 ? 0 : 1)} MB`;
    return `${Math.round(n / 1024)} KB`;
  };
  const fmtRate = n => !Number.isFinite(n) ? "—" : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 10e6 ? 1 : 2)} Mb/s` : `${Math.round(n / 1e3)} kb/s`;
  const fmtZoom = n => Number(n.toFixed(Math.abs(n - Math.round(n)) > .04 ? 1 : 0)).toString();

  function isXtreme() {
    return $("callXtremeBtn")?.classList.contains("active") || document.querySelector('.mode-btn[data-mode="xtreme"]')?.classList.contains("active");
  }
  function localTrack() {
    return $("localVideo")?.srcObject?.getVideoTracks?.()[0] || $("previewVideo")?.srcObject?.getVideoTracks?.()[0] || null;
  }
  function incident(message, key = message) {
    const now = Date.now();
    if (stats.lastIncidentKey === key && now - stats.lastIncidentAt < 5000) return;
    stats.lastIncidentAt = now; stats.lastIncidentKey = key; stats.incidents++;
    stats.lastIncident = `${new Date(now).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"})} · ${message}`;
  }

  async function applyMaximumCapture() {
    if (!isXtreme()) return;
    const track = localTrack();
    if (!track?.applyConstraints) return;
    let caps = {};
    try { caps = track.getCapabilities?.() || {}; } catch {}
    const width = caps.width?.max || 7680;
    const height = caps.height?.max || 4320;
    const fps = caps.frameRate?.max || 120;
    try {
      await track.applyConstraints({width:{ideal:width},height:{ideal:height},frameRate:{ideal:fps,max:fps},resizeMode:"none"});
    } catch {
      try { await track.applyConstraints({width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:120}}); } catch {}
    }
    try { track.contentHint = "detail"; } catch {}
    renderCameraHUD();
  }

  async function setSenderCeiling(ceiling = stats.ceiling) {
    for (const pc of pcs) {
      if (pc.connectionState === "closed") continue;
      for (const sender of pc.getSenders?.() || []) {
        if (sender.track?.kind !== "video" || !sender.getParameters || !sender.setParameters) continue;
        try {
          const p = sender.getParameters();
          if (!p.encodings?.length) p.encodings = [{}];
          for (const e of p.encodings) {
            e.maxBitrate = Math.round(ceiling); e.scaleResolutionDownBy = 1;
            const caps = sender.track.getCapabilities?.();
            e.maxFramerate = caps?.frameRate?.max || 120;
            try { e.priority = "high"; } catch {}
            try { e.networkPriority = "high"; } catch {}
          }
          try { p.degradationPreference = "maintain-resolution"; } catch {}
          await sender.setParameters(p);
        } catch (e) { console.debug("LUMA v3: sender limits partially rejected by browser", e); }
      }
    }
  }

  function zoomCaps() {
    const track = localTrack();
    try {
      const z = track?.getCapabilities?.().zoom;
      return z && Number.isFinite(z.min) && Number.isFinite(z.max) && z.max > z.min ? z : null;
    } catch { return null; }
  }
  async function setZoom(value, quiet = false) {
    const track = localTrack(), caps = zoomCaps();
    if (!track || !caps) return;
    const v = Math.max(caps.min, Math.min(caps.max, Number(value)));
    try {
      await track.applyConstraints({advanced:[{zoom:v}]});
      if ($("zoomReadout")) $("zoomReadout").textContent = `${fmtZoom(v)}×`;
      document.querySelectorAll("#callLensRow .lens-btn").forEach(b => b.classList.toggle("active", Math.abs(Number(b.dataset.zoom)-v)<.08));
      if (!quiet && window.navigator?.vibrate) navigator.vibrate(8);
    } catch {}
  }
  function renderCameraHUD() {
    const track = localTrack(); if (!track) return;
    const settings = track.getSettings?.() || {}, label = track.label || "Cámara";
    const facing = settings.facingMode || (/front|facetime|frontal/i.test(label) ? "user" : "environment");
    if ($("activeCameraSide")) $("activeCameraSide").textContent = facing === "user" ? "FRONT" : "BACK";
    if ($("activeCameraName")) $("activeCameraName").textContent = label;
    const caps = zoomCaps(), row = $("callLensRow"); if (!row) return;
    row.innerHTML = "";
    if (!caps) { row.hidden = true; if ($("zoomReadout")) $("zoomReadout").textContent = "1×"; return; }
    row.hidden = false;
    const current = Number(settings.zoom || 1);
    if ($("zoomReadout")) $("zoomReadout").textContent = `${fmtZoom(current)}×`;
    let values = [0.5,1,2,3,5,10].filter(v => v >= caps.min-.001 && v <= caps.max+.001);
    if (!values.some(v => Math.abs(v-caps.min)<.02)) values.unshift(caps.min);
    values = [...new Set(values.map(v => Number(v.toFixed(2))))].sort((a,b)=>a-b);
    values.forEach(v => {
      const b=document.createElement("button"); b.className="lens-btn"; b.dataset.zoom=v; b.textContent=`${fmtZoom(v)}×`;
      b.classList.toggle("active",Math.abs(v-current)<.08); b.addEventListener("click",()=>setZoom(v)); row.appendChild(b);
    });
  }
  function installPinchZoom() {
    const view=$("callView"); if (!view || view.dataset.v3pinch) return; view.dataset.v3pinch="1";
    let startDistance=0,startZoom=1,raf=0;
    const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
    view.addEventListener("gesturestart",e=>e.preventDefault(),{passive:false});
    view.addEventListener("gesturechange",e=>e.preventDefault(),{passive:false});
    view.addEventListener("touchstart",e=>{if(e.touches.length!==2||!zoomCaps())return;startDistance=dist(e.touches);startZoom=Number(localTrack()?.getSettings?.().zoom||1);e.preventDefault();},{passive:false});
    view.addEventListener("touchmove",e=>{const caps=zoomCaps();if(e.touches.length!==2||!caps||!startDistance)return;e.preventDefault();const target=Math.max(caps.min,Math.min(caps.max,startZoom*(dist(e.touches)/startDistance)));cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>setZoom(target,true));},{passive:false});
    view.addEventListener("touchend",e=>{if(e.touches.length<2)startDistance=0;},{passive:true});
  }

  function diagnose(m) {
    let health=100,bottleneck="Sin cuello de botella detectado.";
    if(m.loss!=null)health-=Math.min(48,m.loss*8);
    if(m.jitter!=null&&m.jitter>20)health-=Math.min(22,(m.jitter-20)/3);
    if(m.rtt!=null&&m.rtt>300)health-=Math.min(20,(m.rtt-300)/15);
    if(m.reason==="cpu"){health-=30;bottleneck="Cuello de botella probable: este dispositivo / codificador.";}
    else if(m.reason==="bandwidth"){health-=32;bottleneck="Cuello de botella probable: tu subida o la ruta de salida.";}
    else if(m.incomingFreeze&&(m.loss==null||m.loss<1.5)&&m.rtt!=null&&m.rtt<350){bottleneck="Problema probable en el dispositivo remoto o en su subida.";health-=22;}
    else if(m.loss!=null&&m.loss>2)bottleneck="Cuello de botella probable: ruta de Internet entre ambos dispositivos.";
    if(m.relay)bottleneck=bottleneck.startsWith("Sin")?"La ruta directa no está disponible: se está usando relay.":`${bottleneck} La llamada usa relay.`;
    stats.health=Math.max(0,Math.min(100,health));stats.bottleneck=bottleneck;
  }
  async function stabilityGuard(m) {
    if(!isXtreme())return;const now=Date.now();if(now-stats.lastTune<3000)return;
    const pressured=m.reason==="bandwidth"||(m.loss!=null&&m.loss>2.2)||(m.jitter!=null&&m.jitter>55);
    if(pressured){stats.stable=0;const estimate=m.availableOut&&m.availableOut>2e6?m.availableOut*.82:stats.ceiling*.76;const next=Math.max(5_000_000,Math.min(1_000_000_000,estimate));if(next<stats.ceiling*.94){stats.ceiling=next;stats.lastTune=now;await setSenderCeiling(next);}}
    else{stats.stable++;if(stats.stable>=8&&stats.ceiling<1_000_000_000){stats.stable=0;stats.ceiling=Math.min(1_000_000_000,stats.ceiling*1.22);stats.lastTune=now;await setSenderCeiling(stats.ceiling);}}
  }
  function updateUI(m) {
    if($("statDataTotal"))$("statDataTotal").textContent=fmtBytes(stats.sent+stats.received);
    if($("statDataBreakdown"))$("statDataBreakdown").textContent=`↑ ${fmtBytes(stats.sent)} · ↓ ${fmtBytes(stats.received)}`;
    if($("statBitrateRange"))$("statBitrateRange").textContent=Number.isFinite(stats.bitrateMin)?`${fmtRate(stats.bitrateMin)} / ${fmtRate(stats.bitrateMax)}`:"—";
    if($("statRttRange"))$("statRttRange").textContent=Number.isFinite(stats.rttMin)?`${Math.round(stats.rttMin)} / ${Math.round(stats.rttMax)} ms`:"—";
    if($("statRttAverage"))$("statRttAverage").textContent=stats.rttN?`Media ${Math.round(stats.rttSum/stats.rttN)} ms`:"Media —";
    if($("statInterruptions"))$("statInterruptions").textContent=String(stats.incidents);
    if($("statIncidentCount"))$("statIncidentCount").textContent=String(stats.incidents);
    if($("statLastIncident"))$("statLastIncident").textContent=stats.lastIncident;
    if($("statBottleneck"))$("statBottleneck").textContent=stats.bottleneck;
    if($("statHealthScore"))$("statHealthScore").textContent=String(Math.round(stats.health));
    if($("statHealthBar"))$("statHealthBar").style.width=`${stats.health}%`;
    if($("statHealth"))$("statHealth").textContent=stats.health>=90?"Excelente":stats.health>=72?"Estable":stats.health>=50?"Bajo presión":"Inestable";
    $("healthCard")?.classList.toggle("warn",stats.health<72&&stats.health>=50);$("healthCard")?.classList.toggle("bad",stats.health<50);
    if(isXtreme()&&$("requestedQuality"))$("requestedQuality").textContent="MAX cámara · FPS máximo · ceiling 1 Gb/s";
    if(m?.outBps!=null&&$("liveBitrate"))$("liveBitrate").textContent=`${fmtRate(m.outBps)} enviados`;
  }

  async function collect() {
    let outBps=0,hasOut=false,rtt=null,loss=null,jitter=null,reason="none",availableOut=null,relay=false,incomingFreeze=false;
    for(const pc of pcs){if(pc.connectionState==="closed")continue;let report;try{report=await pc.getStats();}catch{continue;}const byId=new Map();report.forEach(r=>byId.set(r.id,r));
      report.forEach(r=>{const prefix=`${pc.__lumaV3Id||0}:${r.id}`;
        if((r.type==="outbound-rtp"||r.type==="inbound-rtp")&&!r.isRemote){const outgoing=r.type==="outbound-rtp",abs=outgoing?r.bytesSent:r.bytesReceived;if(Number.isFinite(abs)){const key=`${prefix}:${outgoing?"o":"i"}`,prev=stats.bytePrev.get(key);if(Number.isFinite(prev)&&abs>=prev)outgoing?stats.sent+=abs-prev:stats.received+=abs-prev;stats.bytePrev.set(key,abs);}}
        if(r.type==="outbound-rtp"&&r.kind==="video"&&!r.isRemote){const prev=stats.ratePrev.get(prefix);if(prev&&r.timestamp>prev.t&&r.bytesSent>=prev.b){const bps=((r.bytesSent-prev.b)*8*1000)/(r.timestamp-prev.t);if(Number.isFinite(bps)){outBps+=bps;hasOut=true;}}stats.ratePrev.set(prefix,{b:r.bytesSent||0,t:r.timestamp});if(r.qualityLimitationReason&&r.qualityLimitationReason!=="none")reason=r.qualityLimitationReason;}
        if(r.type==="remote-inbound-rtp"&&r.kind==="video"){if(Number.isFinite(r.roundTripTime))rtt=r.roundTripTime*1000;const total=(r.packetsLost||0)+(r.packetsReceived||0);if(total>0)loss=((r.packetsLost||0)/total)*100;if(Number.isFinite(r.jitter))jitter=Math.max(jitter||0,r.jitter*1000);}
        if(r.type==="inbound-rtp"&&r.kind==="video"&&!r.isRemote){if(Number.isFinite(r.jitter))jitter=Math.max(jitter||0,r.jitter*1000);if(Number.isFinite(r.freezeCount)){const key=`${prefix}:freeze`,prev=stats.freezePrev.get(key);if(Number.isFinite(prev)&&r.freezeCount>prev)incomingFreeze=true;stats.freezePrev.set(key,r.freezeCount);}}
        if(r.type==="candidate-pair"&&r.state==="succeeded"&&(r.nominated||r.selected)){if(Number.isFinite(r.currentRoundTripTime))rtt=r.currentRoundTripTime*1000;if(Number.isFinite(r.availableOutgoingBitrate)&&r.availableOutgoingBitrate>0)availableOut=availableOut==null?r.availableOutgoingBitrate:Math.min(availableOut,r.availableOutgoingBitrate);const l=byId.get(r.localCandidateId),rr=byId.get(r.remoteCandidateId);relay||=l?.candidateType==="relay"||rr?.candidateType==="relay";}
      });
      if(pc.connectionState==="failed")incident("La conexión WebRTC ha fallado.",`pc-${pc.__lumaV3Id}-failed`);else if(pc.connectionState==="disconnected")incident("Se ha perdido temporalmente la ruta con el otro dispositivo.",`pc-${pc.__lumaV3Id}-disconnected`);
    }
    if(!hasOut)outBps=null;if(outBps!=null&&outBps>50_000){stats.bitrateMin=Math.min(stats.bitrateMin,outBps);stats.bitrateMax=Math.max(stats.bitrateMax,outBps);}if(rtt!=null&&rtt>0){stats.rttMin=Math.min(stats.rttMin,rtt);stats.rttMax=Math.max(stats.rttMax,rtt);stats.rttSum+=rtt;stats.rttN++;}
    const m={outBps,rtt,loss,jitter,reason,availableOut,relay,incomingFreeze};
    if(incomingFreeze){if(loss!=null&&loss>2)incident("Congelación: pérdida de paquetes en la ruta.","freeze-loss");else if(jitter!=null&&jitter>55)incident("Congelación: jitter elevado en la ruta.","freeze-jitter");else incident("Congelación: causa probable en el dispositivo remoto o su subida.","freeze-remote");}
    diagnose(m);updateUI(m);stats.lastMetrics=m;await stabilityGuard(m);
  }

  function arm(){installPinchZoom();document.addEventListener("click",e=>{const t=e.target.closest?.('.mode-btn[data-mode="xtreme"],#callXtremeBtn');if(!t)return;setTimeout(async()=>{if(isXtreme()){stats.ceiling=1_000_000_000;await applyMaximumCapture();await setSenderCeiling();renderCameraHUD();}},500);},true);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")renderCameraHUD();});setInterval(()=>{if(isXtreme()){applyMaximumCapture();setSenderCeiling();}renderCameraHUD();},7000);setInterval(()=>collect().catch(()=>{}),1000);setTimeout(renderCameraHUD,700);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",arm,{once:true});else arm();
})();
