// ===== 国内源优先 + 备用 =====
const SOURCES = [
  {
    name: "npmmirror(registry)",
    ffmpeg: "https://registry.npmmirror.com/@ffmpeg/ffmpeg/0.12.15/files/dist/esm/index.js",
    util:  "https://registry.npmmirror.com/@ffmpeg/util/0.12.2/files/dist/esm/index.js",
    ffmpegWorkerBase: "https://registry.npmmirror.com/@ffmpeg/ffmpeg/0.12.15/files/dist/esm",
    coreBaseMT: "https://registry.npmmirror.com/@ffmpeg/core-mt/0.12.10/files/dist/esm",
    coreBaseST: "https://registry.npmmirror.com/@ffmpeg/core/0.12.10/files/dist/esm",
  },
  {
    name: "jsDelivr",
    ffmpeg: "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js",
    util:  "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js",
    ffmpegWorkerBase: "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm",
    coreBaseMT: "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm",
    coreBaseST: "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm",
  }
];

const JSZIP_URLS = [
  "https://cdn.staticfile.org/jszip/3.10.1/jszip.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
];

const $ = (id) => document.getElementById(id);

const loadBtn = $("loadBtn");
const startBtn = $("startBtn");
const stopBtn = $("stopBtn");
const clearBtn = $("clearBtn");
const pickBtn = $("pickBtn");
const picker = $("picker");
const drop = $("drop");
const tbody = $("tbody");
const logEl = $("log");
const summary = $("summary");
const zipBtn = $("zipBtn");

const crfEl = $("crf");
const crfVal = $("crfVal");
const scaleEl = $("scale");
const presetEl = $("preset");
const abEl = $("ab");
const autoDownloadEl = $("autoDownload");

crfEl.addEventListener("input", () => (crfVal.textContent = crfEl.value));

let FFmpeg, fetchFile, toBlobURL;
let ffmpeg = null;
let loaded = false;
let loading = false;
let activeSource = null;

let queue = []; // {id, file, ui..., outBlob, outName, status}
let running = false;
let stopRequested = false;
let currentItemId = null;
let currentItemDurationSec = 0;
const EXEC_TIMEOUT_MS = 8 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowId = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const humanSize = (bytes) => {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${u[i]}`;
};

function log(line) {
  logEl.style.display = "block";
  logEl.textContent += line + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

function refreshButtons() {
  const hasItems = queue.length > 0;
  const hasDone = queue.some((x) => x.status === "done" && x.outBlob && x.outName);
  loadBtn.disabled = loaded || loading;
  startBtn.disabled = !loaded || running || !hasItems;
  stopBtn.disabled = !running;
  clearBtn.disabled = running;
  zipBtn.disabled = running || !hasDone;

  loadBtn.textContent = loaded
    ? "已加载 ✅"
    : (loading ? "加载中…" : "1) 加载压缩引擎（国内源优先）");
}

function setSummary() {
  const total = queue.length;
  const done = queue.filter((x) => x.status === "done").length;
  const fail = queue.filter((x) => x.status === "error").length;
  const wait = queue.filter((x) => x.status === "queued").length;
  const work = queue.filter((x) => x.status === "working").length;
  summary.innerHTML = total === 0
    ? ""
    : `共 <b>${total}</b> 个｜完成 <b>${done}</b>｜进行中 <b>${work}</b>｜等待 <b>${wait}</b>｜失败 <b>${fail}</b>`;
}

function setRowStatus(item, text, cls = "") {
  item.statusEl.textContent = text;
  item.statusEl.className = "status " + cls;
}

function setRowProgress(item, p) {
  const pct = Math.max(0, Math.min(100, Math.round((p || 0) * 100)));
  item.barFill.style.width = pct + "%";
  item.pctEl.textContent = pct + "%";
}

function parseClockToSeconds(clock) {
  const m = String(clock || "").match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function extractProgressFromLog(message, durationSec) {
  if (!durationSec || durationSec <= 0) return null;
  const m = String(message || "").match(/time=(\d+:\d+:\d+(?:\.\d+)?)/);
  if (!m) return null;
  const sec = parseClockToSeconds(m[1]);
  if (!Number.isFinite(sec) || sec < 0) return null;
  return Math.max(0, Math.min(1, sec / durationSec));
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 15000);
}

function sanitizeName(name) {
  return name.replace(/[\\/:*?"<>|]+/g, "_");
}

// 把 worker/core/wasm 转成 blobURL，避免跨域 Worker 限制
async function toBlobURL2(url, mime) {
  log(`拉取资源：${url}`);
  const r = await fetch(url, { cache: "force-cache" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status}: ${url}`);
  const b = await r.blob();
  return URL.createObjectURL(new Blob([b], { type: mime }));
}

// 生成同源 worker 启动脚本，再由该脚本加载远程 ESM worker
async function toWorkerBootstrapBlobURL(workerURL) {
  log(`拉取资源：${workerURL}`);
  const code = `import "${workerURL}";`;
  return URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
}

async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  for (const url of JSZIP_URLS) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url;
        s.onload = resolve;
        s.onerror = () => reject(new Error("JSZip 加载失败：" + url));
        document.head.appendChild(s);
      });
      if (window.JSZip) return window.JSZip;
    } catch (e) {
      log(String(e));
    }
  }
  throw new Error("无法加载 JSZip");
}

async function loadFFmpegModules() {
  let lastErr = null;
  for (const s of SOURCES) {
    try {
      log(`尝试加载模块：${s.name}`);
      const m1 = await import(s.ffmpeg);
      const m2 = await import(s.util);
      FFmpeg = m1.FFmpeg;
      fetchFile = m2.fetchFile;
      toBlobURL = m2.toBlobURL;
      activeSource = s;
      log(`模块加载成功：${s.name}`);
      return;
    } catch (e) {
      lastErr = e;
      log(`加载失败：${s.name}｜${String(e)}`);
      await sleep(200);
    }
  }
  throw lastErr || new Error("无法加载 @ffmpeg/ffmpeg 模块");
}

// ===== UI：拖拽/多选 =====
pickBtn.addEventListener("click", () => picker.click());
picker.addEventListener("change", () => {
  if (picker.files?.length) addFiles([...picker.files]);
  picker.value = "";
});

drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("dragover"); });
drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("dragover");
  const files = [...(e.dataTransfer?.files || [])].filter((f) => (f.type || "").startsWith("video/"));
  if (files.length) addFiles(files);
});

function addFiles(files) {
  for (const file of files) {
    const id = nowId();
    const item = makeRow(id, file);
    queue.push(item);
  }
  setSummary();
  refreshButtons();
}

function makeRow(id, file) {
  const tr = document.createElement("tr");

  const tdName = document.createElement("td");
  const nameDiv = document.createElement("div");
  nameDiv.className = "name";
  nameDiv.title = file.name;
  nameDiv.textContent = file.name;

  const sub = document.createElement("div");
  sub.className = "muted";
  sub.textContent = file.type || "video";
  tdName.appendChild(nameDiv);
  tdName.appendChild(sub);

  const tdSize = document.createElement("td");
  const sizeDiv = document.createElement("div");
  sizeDiv.innerHTML = `<b>${humanSize(file.size)}</b>`;

  const outDiv = document.createElement("div");
  outDiv.className = "muted";
  outDiv.textContent = "—";
  tdSize.appendChild(sizeDiv);
  tdSize.appendChild(outDiv);

  const tdProg = document.createElement("td");
  const bar = document.createElement("div");
  bar.className = "bar";
  const fill = document.createElement("div");
  bar.appendChild(fill);

  const pLine = document.createElement("div");
  pLine.style.display = "flex";
  pLine.style.justifyContent = "space-between";
  pLine.style.marginTop = "8px";

  const status = document.createElement("div");
  status.className = "status";
  status.textContent = "等待压缩";

  const pct = document.createElement("div");
  pct.className = "status";
  pct.textContent = "0%";

  pLine.appendChild(status);
  pLine.appendChild(pct);

  tdProg.appendChild(bar);
  tdProg.appendChild(pLine);

  const tdAct = document.createElement("td");
  const acts = document.createElement("div");
  acts.className = "actions";

  const dlBtn = document.createElement("button");
  dlBtn.className = "mini";
  dlBtn.textContent = "下载";
  dlBtn.disabled = true;

  const delBtn = document.createElement("button");
  delBtn.className = "mini linkbtn";
  delBtn.textContent = "移除";

  acts.appendChild(dlBtn);
  acts.appendChild(delBtn);
  tdAct.appendChild(acts);

  tr.appendChild(tdName);
  tr.appendChild(tdSize);
  tr.appendChild(tdProg);
  tr.appendChild(tdAct);
  tbody.appendChild(tr);

  const item = {
    id,
    file,
    tr,
    outBlob: null,
    outName: null,
    status: "queued",
    outDiv,
    barFill: fill,
    statusEl: status,
    pctEl: pct,
    dlBtn,
    delBtn
  };

  dlBtn.onclick = () => {
    if (item.outBlob && item.outName) downloadBlob(item.outBlob, item.outName);
  };

  delBtn.onclick = () => {
    if (running && currentItemId === id) return alert("当前正在压缩这个文件，不能移除。先点“停止”。");
    queue = queue.filter((x) => x.id !== id);
    tr.remove();
    setSummary();
    refreshButtons();
  };

  return item;
}

// ===== 加载引擎（加载中状态 + 失败详细日志）=====
async function loadEngine() {
  if (loaded || loading) return;

  loading = true;
  refreshButtons();
  logEl.textContent = "";
  logEl.style.display = "block";

  try {
    await loadFFmpegModules();

    ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      if (!currentItemId) return;
      const item = queue.find((x) => x.id === currentItemId);
      if (item && item.status === "working") setRowProgress(item, progress || 0);
    });
    ffmpeg.on("log", ({ message }) => {
      if (!message) return;
      if (currentItemId && currentItemDurationSec > 0) {
        const item = queue.find((x) => x.id === currentItemId);
        if (item && item.status === "working") {
          const p = extractProgressFromLog(message, currentItemDurationSec);
          if (p !== null) setRowProgress(item, p);
        }
      }
      if (/time=|speed=|frame=|Error|error|failed|Invalid/i.test(message)) {
        log(message);
      }
    });

    const useMT = crossOriginIsolated;
    const coreBase = useMT ? activeSource.coreBaseMT : activeSource.coreBaseST;
    const workerBase = activeSource.ffmpegWorkerBase;
    if (!useMT) {
      log("当前环境不是 crossOriginIsolated，自动降级到单线程 core（可正常压缩）。");
    }

    log("开始加载核心（core/wasm/worker）…");

    // 逐个拉取 + 明确报错点
    let coreURL, wasmURL, workerURL, classWorkerURL;
    try {
      coreURL = await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript");
      log("core.js ✅");
    } catch (e) {
      throw new Error("core.js 加载失败：\n" + String(e));
    }

    try {
      wasmURL = await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm");
      log("core.wasm ✅");
    } catch (e) {
      throw new Error("core.wasm 加载失败：\n" + String(e));
    }

    if (useMT) {
      try {
        workerURL = await toBlobURL(`${coreBase}/ffmpeg-core.worker.js`, "text/javascript");
        log("core.worker.js ✅");
      } catch (e) {
        throw new Error("core.worker.js 加载失败：\n" + String(e));
      }
    }

    try {
      // 直接跨域构造 Worker 会触发 SecurityError，改为同源 blob 启动脚本
      classWorkerURL = await toWorkerBootstrapBlobURL(`${workerBase}/worker.js`);
      log("worker.js ✅（classWorkerURL）");
    } catch (e) {
      throw new Error("worker.js 设置失败：\n" + String(e));
    }

    log("调用 ffmpeg.load() …");
    const loadConfig = { coreURL, wasmURL, classWorkerURL };
    if (useMT && workerURL) loadConfig.workerURL = workerURL;
    await ffmpeg.load(loadConfig);
    log("执行自检 ffmpeg.exec(-version) …");
    await ffmpeg.exec(["-hide_banner", "-version"], 30_000);
    log("ffmpeg.exec 自检 ✅");

    loaded = true;
    log(`ffmpeg 引擎加载完成 ✅（来源：${activeSource.name}）`);
  } catch (e) {
    console.error(e);
    log("加载失败 ❌：\n" + String(e?.stack || e));
    alert("加载 ffmpeg 失败：\n\n" + String(e));
  } finally {
    loading = false;
    refreshButtons();
  }
}

loadBtn.addEventListener("click", loadEngine);

// ===== 队列压缩 =====
startBtn.addEventListener("click", async () => {
  if (!loaded || running || queue.length === 0) return;

  if (!queue.some((x) => x.status === "queued")) {
    for (const item of queue) {
      item.status = "queued";
      item.outBlob = null;
      item.outName = null;
      item.outDiv.innerHTML = `<b>${humanSize(item.file.size)}</b><br><span class="muted">—</span>`;
      item.dlBtn.disabled = true;
      setRowProgress(item, 0);
      setRowStatus(item, "待压缩");
    }
    log("未发现待压缩任务，已重置现有文件并重新开始。");
  }

  stopRequested = false;
  running = true;
  refreshButtons();

  try {
    for (const item of queue) {
      if (stopRequested) break;
      if (item.status !== "queued") continue;
      await compressOne(item);
    }
  } finally {
    running = false;
    currentItemId = null;
    setSummary();
    refreshButtons();
  }
});

stopBtn.addEventListener("click", () => {
  stopRequested = true;
  log("已请求停止：会在当前文件结束/失败后停下。");
});

clearBtn.addEventListener("click", () => {
  if (running) return alert("压缩中不能清空，先点“停止”。");
  queue = [];
  tbody.innerHTML = "";
  setSummary();
  refreshButtons();
});

async function safeDelete(path) {
  try { await ffmpeg.deleteFile(path); } catch (_) {}
}

async function probeDurationSec(inPath) {
  const probePath = `${inPath}.duration.txt`;
  try {
    await safeDelete(probePath);
    await ffmpeg.ffprobe([
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      inPath,
      "-o", probePath
    ], 30_000);
    const raw = await ffmpeg.readFile(probePath, "utf8");
    const n = Number(String(raw || "").trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (_) {
    return 0;
  } finally {
    await safeDelete(probePath);
  }
}

async function compressOne(item) {
  const file = item.file;
  item.status = "working";
  currentItemId = item.id;
  setRowStatus(item, "压缩中…", "warn");
  setRowProgress(item, 0);
  item.dlBtn.disabled = true;

  const baseName = sanitizeName(file.name.replace(/\.[^.]+$/, ""));
  const outName = `${baseName}_compressed.mp4`;

  const inPath = `in_${item.id}`;
  const outPath = `out_${item.id}.mp4`;
  currentItemDurationSec = 0;
  let fallbackTimer = null;

  const scale = scaleEl.value;
  let vf = "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  if (scale !== "orig") {
    vf =
      `scale='if(gte(iw,ih),${scale},-2)':'if(gte(iw,ih),-2,${scale})',` +
      `scale=trunc(iw/2)*2:trunc(ih/2)*2`;
  } else {
    // 原始宽高的一半，并保证为偶数
    vf = "scale=trunc(iw/2/2)*2:trunc(ih/2/2)*2";
  }

  const crf = String(crfEl.value);
  const preset = presetEl.value;
  const ab = abEl.value;
  const threads = Math.max(1, Math.min(4, Number(navigator.hardwareConcurrency || 4)));

  const args = [
    "-hide_banner",
    "-loglevel", "info",
    "-nostdin",
    "-y",
    "-i", inPath,
    "-vf", vf, // 可选缩放 + 强制偶数分辨率
    "-c:v", "libx264", // 重新编码 为 H.264
    "-preset", preset,
    "-crf", crf, // 质量控制
    "-c:a", "aac",
    "-b:a", `${ab}k`,
    "-threads", String(threads),
    "-movflags", "+faststart",
    outPath
  ];

  try {
    log(`开始压缩：${file.name}｜preset=${preset}｜crf=${crf}｜threads=${threads}`);
    log("写入输入文件到 wasm FS …");
    await ffmpeg.writeFile(inPath, await fetchFile(file));
    currentItemDurationSec = await probeDurationSec(inPath);
    if (currentItemDurationSec > 0) {
      log(`时长探测：${currentItemDurationSec.toFixed(2)}s`);
    }
//    // 兜底进度：某些浏览器/内核不回传 progress 时，避免进度条长期停在 0%
//    fallbackTimer = setInterval(() => {
//      if (item.status !== "working") return;
//      const currentPct = Number(item.pctEl.textContent.replace("%", "")) || 0;
//      if (currentPct >= 95) return;
//      setRowProgress(item, (currentPct + 1) / 100);
//    }, 900);
    log("写入完成，开始执行 ffmpeg …");
    await ffmpeg.exec(args, EXEC_TIMEOUT_MS);
    log("ffmpeg 执行完成，开始读取输出文件 …");

    const data = await ffmpeg.readFile(outPath);
    const outBlob = new Blob([data.buffer], { type: "video/mp4" });

    item.outBlob = outBlob;
    item.outName = outName;
    item.outDiv.innerHTML = `<b>${humanSize(file.size)}</b><br><span class="muted">${humanSize(outBlob.size)}</span>`;

    item.status = "done";
    setRowProgress(item, 1);
    setRowStatus(item, "完成 ✅", "ok");
    item.dlBtn.disabled = false;

    await safeDelete(inPath);
    await safeDelete(outPath);

    if (autoDownloadEl.checked) downloadBlob(outBlob, outName);
  } catch (e) {
    console.error(e);
    item.status = "error";
    setRowStatus(item, "失败 ❌", "err");
    log(`文件失败：${file.name}\n${String(e?.stack || e)}\n`);
    await safeDelete(inPath);
    await safeDelete(outPath);
  } finally {
    if (fallbackTimer) clearInterval(fallbackTimer);
    currentItemDurationSec = 0;
    setSummary();
    refreshButtons();
  }
}

// ===== 批量下载（逐个下载全部已完成）=====
zipBtn.addEventListener("click", async () => {
  const doneItems = queue.filter((x) => x.status === "done" && x.outBlob && x.outName);
  if (doneItems.length === 0) return;

  zipBtn.disabled = true;
  const oldText = zipBtn.textContent;
  zipBtn.textContent = "下载中…";

  try {
    for (let i = 0; i < doneItems.length; i++) {
      const item = doneItems[i];
      zipBtn.textContent = `下载中…${i + 1}/${doneItems.length}`;
      downloadBlob(item.outBlob, item.outName);
      await sleep(250);
    }
  } catch (e) {
    console.error(e);
    alert("批量下载失败：\n" + String(e));
    log("批量下载失败：\n" + String(e?.stack || e));
  } finally {
    zipBtn.textContent = oldText;
    setSummary();
    refreshButtons();
  }
});

// 初始化
setSummary();
refreshButtons();
log("页面已打开，自动加载压缩引擎…");
void loadEngine();
