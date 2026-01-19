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

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Lakshit PVT API Running",
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

  try {
    let format = "bestvideo+bestaudio/best";

    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      format =
        "bestvideo[height<=480]+bestaudio/best[height<=480]/best[height<=360]/best[height<=240]";
    }

    const filename = `file_${Date.now()}.%(ext)s`;
    const output = path.join(TMP_DIR, filename);

    await ytDlp.exec([
      url,
      "-f", format,
      "-o", output,
      "--merge-output-format", "mp4",
      "--no-playlist",
      "--no-warnings",
      "--quiet"
    ]);

    const files = fs.readdirSync(TMP_DIR).filter(f => f.startsWith("file_"));
    const finalFile = files.sort().pop();

    const unifiedUrl = `${req.protocol}://${req.get("host")}/file/${finalFile}`;

    res.json({
      status: "success",
      url: unifiedUrl,
      dev: "@lakshitpatidar"
    });

  } catch (err) {
    res.json({
      status: "error",
      message: err.message || "Download failed",
      dev: "@lakshitpatidar"
    });
  }
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
    }, 120000); // auto delete after 2 min
  });
});

export default app;
