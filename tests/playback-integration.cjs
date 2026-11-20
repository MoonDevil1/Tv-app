const { app, BrowserWindow } = require("electron");
const { createServer } = require("node:http");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-gpu");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "tg-iptv-playback-"));
const hlsDir = path.join(temp, "hls");
const dashDir = path.join(temp, "dash");
const videoDir = path.join(hlsDir, "video");
const audioEnDir = path.join(hlsDir, "audio-en");
const audioHiDir = path.join(hlsDir, "audio-hi");
const subtitlesDir = path.join(hlsDir, "subs-en");
fs.mkdirSync(hlsDir);
fs.mkdirSync(dashDir);
fs.mkdirSync(videoDir);
fs.mkdirSync(audioEnDir);
fs.mkdirSync(audioHiDir);
fs.mkdirSync(subtitlesDir);

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("ffmpeg failed: " + result.stderr);
}

function createFixtures() {
  const source = path.join(temp, "source.mp4");
  runFfmpeg(["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000",
    "-t", "5", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-g", "24", "-keyint_min", "24",
    "-sc_threshold", "0", "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", source]);
  runFfmpeg(["-i", source, "-an", "-c:v", "copy", "-f", "hls", "-hls_time", "1", "-hls_list_size", "0",
    "-hls_segment_filename", path.join(videoDir, "segment%03d.ts"), path.join(videoDir, "index.m3u8")]);
  for (const [frequency, directory] of [[440, audioEnDir], [880, audioHiDir]]) {
    runFfmpeg(["-f", "lavfi", "-i", `sine=frequency=${frequency}:sample_rate=48000`, "-t", "5", "-c:a", "aac", "-b:a", "64k",
      "-f", "hls", "-hls_time", "1", "-hls_list_size", "0", "-hls_segment_filename", path.join(directory, "segment%03d.ts"),
      path.join(directory, "index.m3u8")]);
  }
  fs.writeFileSync(path.join(subtitlesDir, "captions.vtt"), "WEBVTT\n\n00:00:00.000 --> 00:00:04.800\nStreamEngine subtitle test\n");
  fs.writeFileSync(path.join(subtitlesDir, "index.m3u8"), "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:5\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:5.0,\ncaptions.vtt\n#EXT-X-ENDLIST\n");
  fs.writeFileSync(path.join(hlsDir, "master.m3u8"),
    '#EXTM3U\n#EXT-X-VERSION:3\n' +
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="audio-en/index.m3u8"\n' +
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Hindi",LANGUAGE="hi",DEFAULT=NO,AUTOSELECT=YES,URI="audio-hi/index.m3u8"\n' +
    '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,URI="subs-en/index.m3u8"\n' +
    '#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=320x180,CODECS="avc1.42c00c",AUDIO="audio",SUBTITLES="subs"\nvideo/index.m3u8\n');
  runFfmpeg(["-i", source, "-c", "copy", "-f", "dash", "-seg_duration", "1", "-use_template", "1",
    "-use_timeline", "1", path.join(dashDir, "manifest.mpd")]);
}

const page = '<!doctype html><html><head><meta charset="utf-8"></head><body><video id="video" muted playsinline></video><script type="module" src="/playback-engine.js"></script></body></html>';

function startServer() {
  const engineBundle = path.resolve("tests/.playback-dist/playback-engine.js");
  return createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    let file;
    if (pathname === "/") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(page); return; }
    if (pathname === "/playback-engine.js") file = engineBundle;
    else if (pathname.startsWith("/hls/")) file = path.join(hlsDir, pathname.slice("/hls/".length));
    else if (pathname.startsWith("/dash/")) file = path.join(dashDir, path.basename(pathname));
    if (!file || (file !== engineBundle && !file.startsWith(temp + path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
    const type = file.endsWith(".js") ? "application/javascript" : file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : file.endsWith(".mpd") ? "application/dash+xml" : file.endsWith(".vtt") ? "text/vtt" :
      file.endsWith(".ts") ? "video/mp2t" : file.endsWith(".m4s") || file.endsWith(".mp4") ? "video/mp4" : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
}

app.whenReady().then(async () => {
  let server;
  let window;
  try {
    createFixtures();
    server = startServer();
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const port = server.address().port;
    window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    await window.loadURL("http://127.0.0.1:" + port + "/");
    const results = await window.webContents.executeJavaScript(`(async () => {
      const hls = await window.runStreamEngineTest("/hls/master.m3u8", "hls");
      const dash = await window.runStreamEngineTest("/dash/manifest.mpd", "dash");
      return [{ format: "HLS", ...hls }, { format: "DASH", ...dash }];
    })()`);
    for (const result of results) console.log(JSON.stringify(result));
    app.exit(results.length === 2 && results.every(result => result.state === "playing" && result.seconds >= 1.2) ? 0 : 1);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    window?.destroy();
    server?.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
app.on("window-all-closed", () => {});
