/* JobsShadow — a pure front-end shadowing trainer for Steve Jobs' 1995 interview.
   All data lives in the browser (localStorage). No backend, no tracking. */

(function () {
  "use strict";

  // ---------- Defaults ----------
  // Only the widely-quoted "taste" line is pre-filled verbatim; the rest are
  // templates for you to fill while you calibrate timestamps against your video.
  const DEFAULT_SEGMENTS = [
    {
      id: "taste",
      title: "“No taste” — 论 Microsoft",
      start: 0, end: 0,
      text: "The only problem with Microsoft is they just have no taste. They have absolutely no taste. And I don't mean that in a small way, I mean that in a big way — in the sense that they don't think of original ideas, and they don't bring much culture into their products."
    },
    { id: "seg2", title: "片段 2（待填）", start: 0, end: 0, text: "" },
    { id: "seg3", title: "片段 3（待填）", start: 0, end: 0, text: "" }
  ];

  const DEFAULT_STATE = {
    segments: DEFAULT_SEGMENTS,
    practiced: {},        // { 'YYYY-MM-DD': minutesFloat }
    segCounts: {},        // { segId: count }
    goalMin: 15,
    remindTime: "20:00",
    ytId: "",
    currentSeg: "taste",
    lastReminderShown: ""
  };

  const LS_KEY = "jobsshadow.v1";

  // ---------- State ----------
  let S = load();
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return Object.assign(structuredClone(DEFAULT_STATE), parsed);
    } catch (e) { return structuredClone(DEFAULT_STATE); }
  }
  function save() { localStorage.setItem(LS_KEY, JSON.stringify(S)); }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // ---------- Tabs ----------
  $$(".tab").forEach((t) => t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.dataset.tab;
    $$(".view").forEach((v) => (v.hidden = true));
    $("#view-" + tab).hidden = false;
    if (tab === "dashboard") renderDashboard();
    if (tab === "segments") renderSegEditor();
  }));

  // ================= MEDIA ABSTRACTION =================
  let mediaMode = "youtube";
  let ytPlayer = null, ytReady = false;
  const localMedia = $("#localMedia");
  let currentRate = 1;
  let loopOn = false;
  let pollTimer = null;

  // YouTube IFrame API
  window.onYouTubeIframeAPIReady = function () {
    ytPlayer = new YT.Player("ytplayer", {
      height: "100%", width: "100%",
      playerVars: { rel: 0, modestbranding: 1 },
      events: { onReady: () => { ytReady = true; if (S.ytId) ytPlayer.cueVideoById(S.ytId); } }
    });
  };
  (function loadYT() {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  })();

  function parseYtId(input) {
    input = (input || "").trim();
    if (!input) return "";
    const m = input.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
    return "";
  }

  function mediaCurrentTime() {
    if (mediaMode === "youtube") return (ytReady && ytPlayer) ? ytPlayer.getCurrentTime() : 0;
    return localMedia.currentTime || 0;
  }
  function mediaSeek(t) {
    if (mediaMode === "youtube") { if (ytReady) ytPlayer.seekTo(t, true); }
    else { localMedia.currentTime = t; }
  }
  function mediaPlay() {
    if (mediaMode === "youtube") { if (ytReady) ytPlayer.playVideo(); }
    else { localMedia.play(); }
  }
  function mediaPause() {
    if (mediaMode === "youtube") { if (ytReady) ytPlayer.pauseVideo(); }
    else { localMedia.pause(); }
  }
  function mediaSetRate(r) {
    currentRate = r;
    if (mediaMode === "youtube") { if (ytReady) ytPlayer.setPlaybackRate(r); }
    else { localMedia.playbackRate = r; }
  }

  // A-B loop / segment enforcement
  function startPoll() {
    stopPoll();
    pollTimer = setInterval(() => {
      const seg = currentSegment();
      if (!seg || !seg.end || seg.end <= seg.start) return;
      const t = mediaCurrentTime();
      if (t >= seg.end) {
        if (loopOn) { mediaSeek(seg.start); }
        else { mediaPause(); stopPoll(); }
      }
    }, 200);
  }
  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  function playSegment() {
    const seg = currentSegment();
    if (!seg) return;
    if (seg.end && seg.end > seg.start) { mediaSeek(seg.start); }
    mediaSetRate(currentRate);
    mediaPlay();
    startPoll();
    interaction();
  }

  // Source toggle
  $("#srcYouTube").addEventListener("click", () => setSource("youtube"));
  $("#srcLocal").addEventListener("click", () => setSource("local"));
  function setSource(mode) {
    mediaMode = mode;
    $("#srcYouTube").classList.toggle("active", mode === "youtube");
    $("#srcLocal").classList.toggle("active", mode === "local");
    $("#youtubePane").hidden = mode !== "youtube";
    $("#localPane").hidden = mode !== "local";
  }

  // YouTube load
  $("#ytLoad").addEventListener("click", () => {
    const id = parseYtId($("#ytInput").value);
    if (!id) { alert("没识别出视频 ID，请粘贴完整 YouTube 链接或 11 位 ID。"); return; }
    S.ytId = id; save();
    if (ytReady) ytPlayer.cueVideoById(id);
  });
  $("#ytSearch").href = "https://www.youtube.com/results?search_query=" +
    encodeURIComponent("Steve Jobs 1995 interview taste lost interview");

  // Local file load
  $("#fileInput").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    localMedia.src = URL.createObjectURL(f);
    localMedia.playbackRate = currentRate;
  });

  // Speed buttons
  $("#speeds").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-rate]");
    if (!b) return;
    $$("#speeds button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    mediaSetRate(parseFloat(b.dataset.rate));
  });

  $("#loopToggle").addEventListener("click", () => {
    loopOn = !loopOn;
    const el = $("#loopToggle");
    el.classList.toggle("on", loopOn);
    el.textContent = "A-B 循环：" + (loopOn ? "开" : "关");
  });

  $("#playSeg").addEventListener("click", playSegment);
  $("#pauseBtn").addEventListener("click", () => { mediaPause(); stopPoll(); });
  $("#markStart").addEventListener("click", () => { setSegTime("start"); });
  $("#markEnd").addEventListener("click", () => { setSegTime("end"); });
  function setSegTime(which) {
    const seg = currentSegment(); if (!seg) return;
    seg[which] = Math.round(mediaCurrentTime() * 10) / 10;
    save(); renderSegMeta();
  }

  // ================= SEGMENTS =================
  function currentSegment() { return S.segments.find((s) => s.id === S.currentSeg) || S.segments[0]; }

  function fillSegSelect() {
    const sel = $("#segSelect");
    sel.innerHTML = "";
    S.segments.forEach((s) => {
      const o = document.createElement("option");
      o.value = s.id; o.textContent = s.title;
      if (s.id === S.currentSeg) o.selected = true;
      sel.appendChild(o);
    });
  }
  $("#segSelect").addEventListener("change", (e) => {
    S.currentSeg = e.target.value; save();
    renderSegMeta(); resetSteps();
  });

  function renderSegMeta() {
    const seg = currentSegment();
    $("#segTitle").textContent = seg.title;
    const tEl = $("#transcript");
    if (seg.text && seg.text.trim()) tEl.textContent = seg.text;
    else tEl.innerHTML = '<span class="empty">这个片段还没有文本。到「片段」页粘贴访谈原句，或在这里边听边补。</span>';
    const fmt = (x) => (x ? x.toFixed(1) + "s" : "—");
    $("#segTime").textContent = `起 ${fmt(seg.start)} · 止 ${fmt(seg.end)}`;
  }

  // ================= 5 STEPS =================
  function resetSteps() {
    $$("#steps input").forEach((c) => { c.checked = false; c.closest("li").classList.remove("done"); });
    updateStepFill();
  }
  $$("#steps input").forEach((c) => c.addEventListener("change", () => {
    c.closest("li").classList.toggle("done", c.checked);
    updateStepFill(); interaction();
  }));
  function updateStepFill() {
    const total = $$("#steps input").length;
    const done = $$("#steps input:checked").length;
    $("#stepFill").style.width = (done / total * 100) + "%";
  }

  // ================= RECORDER =================
  let mediaRecorder = null, recChunks = [], recBlob = null, recUrl = null;
  let audioCtx = null, analyser = null, micStream = null, rafId = null;
  const scope = $("#scope"), sctx = scope.getContext("2d");

  async function ensureMic() {
    if (micStream) return true;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaStreamSource(micStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      drawScope();
      return true;
    } catch (e) {
      alert("无法访问麦克风。请用 http://localhost 方式打开（见 README），并允许麦克风权限。");
      return false;
    }
  }

  function drawScope() {
    const buf = new Float32Array(analyser.fftSize);
    const draw = () => {
      rafId = requestAnimationFrame(draw);
      analyser.getFloatTimeDomainData(buf);
      // waveform
      const w = scope.width = scope.clientWidth, h = scope.height;
      sctx.clearRect(0, 0, w, h);
      sctx.lineWidth = 2; sctx.strokeStyle = "#6ee7a8"; sctx.beginPath();
      for (let i = 0; i < w; i++) {
        const v = buf[Math.floor(i / w * buf.length)];
        const y = h / 2 + v * h * 0.45;
        i === 0 ? sctx.moveTo(i, y) : sctx.lineTo(i, y);
      }
      sctx.stroke();
      // volume (RMS)
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      $("#volVal").textContent = Math.round(Math.min(1, rms * 4) * 100);
      // pitch (autocorrelation)
      const f = autoCorrelate(buf, audioCtx.sampleRate);
      $("#pitchVal").textContent = f > 0 ? Math.round(f) + " Hz" : "— Hz";
    };
    draw();
  }

  function autoCorrelate(buf, sampleRate) {
    let size = buf.length, rms = 0;
    for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    if (rms < 0.01) return -1;
    let r1 = 0, r2 = size - 1, thres = 0.2;
    for (let i = 0; i < size / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < size / 2; i++) if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }
    const b = buf.slice(r1, r2); size = b.length;
    const c = new Array(size).fill(0);
    for (let i = 0; i < size; i++) for (let j = 0; j < size - i; j++) c[i] += b[j] * b[j + i];
    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < size; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    let T0 = maxpos;
    if (T0 <= 0) return -1;
    const f = sampleRate / T0;
    return (f > 60 && f < 500) ? f : -1;
  }

  $("#recBtn").addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") { mediaRecorder.stop(); return; }
    if (!(await ensureMic())) return;
    recChunks = [];
    mediaRecorder = new MediaRecorder(micStream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      recBlob = new Blob(recChunks, { type: "audio/webm" });
      if (recUrl) URL.revokeObjectURL(recUrl);
      recUrl = URL.createObjectURL(recBlob);
      ["#playRec", "#compareBtn", "#dlRec"].forEach((s) => ($(s).disabled = false));
      document.body.classList.remove("recording");
      $("#recBtn").textContent = "● 录音";
    };
    mediaRecorder.start();
    document.body.classList.add("recording");
    $("#recBtn").textContent = "■ 停止";
    interaction();
  });

  const recAudio = new Audio();
  $("#playRec").addEventListener("click", () => { if (recUrl) { recAudio.src = recUrl; recAudio.playbackRate = 1; recAudio.play(); } });
  $("#dlRec").addEventListener("click", () => {
    if (!recUrl) return;
    const a = document.createElement("a");
    a.href = recUrl; a.download = `jobsshadow_${currentSegment().id}_${todayKey()}.webm`; a.click();
  });
  $("#compareBtn").addEventListener("click", () => {
    const seg = currentSegment();
    // play reference segment, then my recording
    if (seg.end && seg.end > seg.start) mediaSeek(seg.start);
    mediaSetRate(1); mediaPlay(); startPoll();
    const dur = (seg.end && seg.end > seg.start) ? (seg.end - seg.start) : 6;
    setTimeout(() => { mediaPause(); stopPoll(); if (recUrl) { recAudio.src = recUrl; recAudio.play(); } }, dur * 1000 + 300);
  });

  // ================= SESSION / STREAK =================
  let sessionOn = false, sessionStart = 0, swTimer = null;
  $("#sessionBtn").addEventListener("click", toggleSession);
  function toggleSession() {
    if (!sessionOn) {
      sessionOn = true; sessionStart = Date.now();
      $("#sessionBtn").textContent = "结束训练";
      swTimer = setInterval(updateStopwatch, 1000);
    } else { endSession(true); }
  }
  function updateStopwatch() {
    const s = Math.floor((Date.now() - sessionStart) / 1000);
    $("#stopwatch").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  function endSession(log) {
    if (!sessionOn) return;
    const mins = (Date.now() - sessionStart) / 60000;
    sessionOn = false; clearInterval(swTimer); swTimer = null;
    $("#sessionBtn").textContent = "开始训练";
    $("#stopwatch").textContent = "00:00";
    if (log && mins > 0.1) logPractice(mins);
  }
  let lastInteract = 0;
  function interaction() { lastInteract = Date.now(); }

  function logPractice(mins) {
    const k = todayKey();
    S.practiced[k] = (S.practiced[k] || 0) + mins;
    const seg = currentSegment();
    S.segCounts[seg.id] = (S.segCounts[seg.id] || 0) + 1;
    save(); updateNudge();
  }

  $("#finishSession").addEventListener("click", () => {
    // count minimum 1 min if no running session
    if (sessionOn) endSession(true);
    else logPractice(1);
    resetSteps();
    flash($("#finishSession"), "已记录 ✓");
  });
  function flash(btn, txt) {
    const old = btn.textContent; btn.textContent = txt;
    setTimeout(() => (btn.textContent = old), 1500);
  }

  // ---------- streak math ----------
  function computeStreak() {
    const days = Object.keys(S.practiced).filter((k) => S.practiced[k] > 0).sort();
    if (!days.length) return { current: 0, best: 0, total: days.length };
    const set = new Set(days);
    // best
    let best = 0;
    for (const d of days) {
      let n = 1, cur = new Date(d);
      while (true) { cur.setDate(cur.getDate() - 1); if (set.has(fmtD(cur))) n++; else break; }
      best = Math.max(best, n);
    }
    // current (ending today or yesterday)
    let cur = new Date(); let current = 0;
    if (!set.has(fmtD(cur))) cur.setDate(cur.getDate() - 1);
    while (set.has(fmtD(cur))) { current++; cur.setDate(cur.getDate() - 1); }
    return { current, best, total: days.length };
  }
  function fmtD(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

  // ================= DASHBOARD =================
  function renderDashboard() {
    const st = computeStreak();
    $("#stStreak").textContent = st.current;
    $("#stBest").textContent = st.best;
    $("#stDays").textContent = st.total;
    const totalMin = Object.values(S.practiced).reduce((a, b) => a + b, 0);
    $("#stMin").textContent = Math.round(totalMin);

    const today = S.practiced[todayKey()] || 0;
    const pct = Math.min(100, today / S.goalMin * 100);
    $("#goalFill").style.width = pct + "%";
    $("#goalLbl").textContent = `${S.goalMin} 分钟/天`;
    $("#todayMin").textContent = `今天已练 ${today.toFixed(1)} 分钟` + (pct >= 100 ? " · 目标达成 🎯" : "");

    // heatmap: last 84 days
    const hm = $("#heatmap"); hm.innerHTML = "";
    const days = 84; const start = new Date(); start.setDate(start.getDate() - (days - 1));
    // pad to start on Sunday column alignment
    for (let i = 0; i < days; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const m = S.practiced[fmtD(d)] || 0;
      const cell = document.createElement("div");
      cell.className = "hm-cell " + (m <= 0 ? "" : m < 5 ? "hm-1" : m < 15 ? "hm-2" : m < 30 ? "hm-3" : "hm-4");
      cell.title = `${fmtD(d)} · ${m.toFixed(1)} 分钟`;
      hm.appendChild(cell);
    }

    const ss = $("#segStats"); ss.innerHTML = "";
    S.segments.forEach((s) => {
      const row = document.createElement("div"); row.className = "seg-stat-row";
      row.innerHTML = `<span>${s.title}</span><span>${S.segCounts[s.id] || 0} 次</span>`;
      ss.appendChild(row);
    });
  }

  // ================= SEGMENT EDITOR =================
  function renderSegEditor() {
    const list = $("#segList"); list.innerHTML = "";
    S.segments.forEach((s, idx) => {
      const div = document.createElement("div"); div.className = "seg-edit";
      div.innerHTML = `
        <div class="row"><label>标题</label><input type="text" data-f="title" value="${escapeHtml(s.title)}" /></div>
        <div class="row">
          <label>起点(秒)</label><input type="number" data-f="start" step="0.1" value="${s.start}" />
          <label style="min-width:70px">终点(秒)</label><input type="number" data-f="end" step="0.1" value="${s.end}" />
        </div>
        <div class="row"><label>文本</label></div>
        <textarea data-f="text">${escapeHtml(s.text)}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn del" data-del="${idx}">删除此片段</button></div>`;
      div.querySelectorAll("[data-f]").forEach((inp) => inp.addEventListener("input", () => {
        const f = inp.dataset.f;
        s[f] = (f === "start" || f === "end") ? parseFloat(inp.value) || 0 : inp.value;
        save(); fillSegSelect(); if (s.id === S.currentSeg) renderSegMeta();
      }));
      div.querySelector("[data-del]").addEventListener("click", () => {
        if (S.segments.length <= 1) { alert("至少保留一个片段。"); return; }
        S.segments.splice(idx, 1);
        if (S.currentSeg === s.id) S.currentSeg = S.segments[0].id;
        save(); renderSegEditor(); fillSegSelect(); renderSegMeta();
      });
      list.appendChild(div);
    });
  }
  $("#addSeg").addEventListener("click", () => {
    S.segments.push({ id: "seg_" + Date.now(), title: "新片段", start: 0, end: 0, text: "" });
    save(); renderSegEditor(); fillSegSelect();
  });
  function escapeHtml(s) { return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ---------- import / export ----------
  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "jobsshadow-backup.json"; a.click();
  });
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { S = Object.assign(structuredClone(DEFAULT_STATE), JSON.parse(r.result)); save(); location.reload(); }
      catch (err) { alert("导入失败：文件格式不对。"); }
    };
    r.readAsText(f);
  });

  // ================= SETTINGS / REMINDER =================
  $("#goalInput").value = S.goalMin;
  $("#remindInput").value = S.remindTime;
  $("#goalInput").addEventListener("change", (e) => { S.goalMin = parseInt(e.target.value) || 15; save(); });
  $("#remindInput").addEventListener("change", (e) => { S.remindTime = e.target.value; save(); });
  $("#enableNotif").addEventListener("click", async () => {
    if (!("Notification" in window)) { alert("此浏览器不支持通知。"); return; }
    const p = await Notification.requestPermission();
    alert(p === "granted" ? "已开启，页面打开时会在提醒时间通知你。" : "未授予通知权限。");
  });

  function checkReminder() {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const k = todayKey();
    if (hhmm === S.remindTime && S.lastReminderShown !== k && !(S.practiced[k] > 0)) {
      S.lastReminderShown = k; save();
      new Notification("JobsShadow", { body: "该练乔布斯的腔调了 — 别断了连续记录 🔥" });
    }
  }
  setInterval(checkReminder, 30000);

  // ---------- streak nudge banner ----------
  function updateNudge() {
    const st = computeStreak();
    const practicedToday = (S.practiced[todayKey()] || 0) > 0;
    const n = $("#nudge");
    if (practicedToday) {
      n.hidden = false;
      n.textContent = `🔥 连续 ${st.current} 天 — 今天已完成，保持住。`;
    } else if (st.current > 0) {
      n.hidden = false;
      n.textContent = `⚠️ 你已连续 ${st.current} 天。今天还没练 — 别让连击断在这里。`;
    } else {
      n.hidden = false;
      n.textContent = `开始你的第 1 天。只练乔布斯，练透一个片段。`;
    }
  }

  // ================= INIT =================
  function init() {
    if (S.ytId) $("#ytInput").value = S.ytId;
    fillSegSelect();
    renderSegMeta();
    resetSteps();
    updateNudge();
    // save minutes if the tab is closed mid-session
    window.addEventListener("beforeunload", () => { if (sessionOn) endSession(true); save(); });
  }
  init();
})();
