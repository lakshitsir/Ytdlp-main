import express from "express";
import YtDlpWrap from "yt-dlp-wrap";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const ytDlp = new YtDlpWrap();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TMP_DIR = path.join(__dirname, "tmp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

const MAX_CONCURRENT = 5;
let activeJobs = 0;
const jobQueue = [];

const PROXIES = [
  null,
  "http://proxy1:port",
  "http://proxy2:port"
];

const COOKIES_FILE = fs.existsSync(path.join(__dirname, "cookies.txt"))
  ? path.join(__dirname, "cookies.txt")
  : null;

function runNextJob() {
  if (activeJobs >= MAX_CONCURRENT || jobQueue.length === 0) return;
  const job = jobQueue.shift();
  activeJobs++;
  job()
    .catch(() => {})
    .finally(() => {
      activeJobs--;
      runNextJob();
    });
}

function enqueue(job) {
  return new Promise((resolve, reject) => {
    jobQueue.push(async () => {
      try {
        const result = await job();
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
    runNextJob();
  });
}

function pickProxy() {
  const usable = PROXIES.filter(p => p);
  if (usable.length === 0) return null;
  return usable[Math.floor(Math.random() * usable.length)];
}

async function downloadWithRetry(url, format, output) {
  let lastError = null;

  const fallbackFormats = [
    format,
    "bestvideo+bestaudio/best",
    "best"
  ];

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const fmt of fallbackFormats) {
      try {
        const args = [
          url,
          "-f", fmt,
          "-o", output,
          "--merge-output-format", "mp4",
          "--no-playlist",
          "--no-warnings",
          "--quiet"
        ];

        const proxy = pickProxy();
        if (proxy) args.push("--proxy", proxy);
        if (COOKIES_FILE) args.push("--cookies", COOKIES_FILE);

        await ytDlp.exec(args);
        return true;
      } catch (e) {
        lastError = e;
      }
    }
  }

  throw lastError || new Error("All download attempts failed");
}

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Lakshit PVT API Running",
    queue: jobQueue.length,
    active: activeJobs,
    dev: "@lakshitpatidar"
  });
});

app.get("/api", async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.json({
      status: "error",
      message: "Missing url parameter",
      dev: "@lakshitpatidar"
    });
  }

  enqueue(async () => {
    let format = "bestvideo+bestaudio/best";

    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      format =
        "bestvideo[height<=480]+bestaudio/best[height<=480]/best[height<=360]/best[height<=240]";
    }

    const filename = `file_${Date.now()}_${Math.random().toString(36).slice(2)}.%(ext)s`;
    const output = path.join(TMP_DIR, filename);

    await downloadWithRetry(url, format, output);

    const files = fs.readdirSync(TMP_DIR)
      .filter(f => f.startsWith("file_"))
      .sort();

    const finalFile = files.pop();
    const unifiedUrl = `${req.protocol}://${req.get("host")}/file/${finalFile}`;

    res.json({
      status: "success",
      url: unifiedUrl,
      queue: jobQueue.length,
      dev: "@lakshitpatidar"
    });
  }).catch(err => {
    res.json({
      status: "error",
      message: err.message || "Download failed",
      dev: "@lakshitpatidar"
    });
  });
});

app.get("/file/:name", (req, res) => {
  const filePath = path.join(TMP_DIR, req.params.name);
  if (!fs.existsSync(filePath)) return res.status(404).send("File expired");

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", `inline; filename="${req.params.name}"`);

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);

  stream.on("close", () => {
    setTimeout(() => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }, 180000);
  });
});

export default app;
