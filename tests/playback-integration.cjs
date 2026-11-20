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
fs.mkdirSync(hlsDir);
fs.mkdirSync(dashDir);

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
  runFfmpeg(["-i", source, "-c", "copy", "-f", "hls", "-hls_time", "1", "-hls_list_size", "0",
    "-hls_segment_filename", path.join(hlsDir, "segment%03d.ts"), path.join(hlsDir, "index.m3u8")]);
  runFfmpeg(["-i", source, "-c", "copy", "-f", "dash", "-seg_duration", "1", "-use_template", "1",
    "-use_timeline", "1", path.join(dashDir, "manifest.mpd")]);
}

const page = '<!doctype html><html><head><meta charset="utf-8"><script src="/hls.js"></script><script src="/shaka.js"></script></head><body><video id="video" muted playsinline></video><script>' +
'window.runPlaybackTests = async () => {' +
' const results=[]; const video=document.getElementById("video");' +
' const wait=async()=>{ await Promise.race([new Promise((resolve,reject)=>{video.addEventListener("playing",resolve,{once:true});video.addEventListener("error",()=>reject(new Error("Media error "+(video.error?.code||"unknown"))),{once:true});}),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Playback start timeout")),15000))]); const start=Date.now(); while(video.currentTime<1.2&&Date.now()-start<10000) await new Promise(r=>setTimeout(r,100)); if(video.currentTime<1.2) throw new Error("Playback did not advance"); };' +
' try { if(!window.Hls||!Hls.isSupported()) throw new Error("hls.js/MSE unavailable"); const hls=new Hls({enableWorker:false}); await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error("HLS manifest timeout")),15000);hls.on(Hls.Events.MANIFEST_PARSED,()=>{clearTimeout(timeout);resolve();});hls.on(Hls.Events.ERROR,(_e,d)=>{if(d.fatal){clearTimeout(timeout);reject(new Error("HLS: "+d.details));}});hls.loadSource("/hls/index.m3u8");hls.attachMedia(video);}); await video.play(); await wait(); results.push({format:"HLS",passed:true,seconds:Number(video.currentTime.toFixed(2))}); hls.destroy(); } catch(e) { results.push({format:"HLS",passed:false,error:String(e)}); }' +
' try { video.pause();video.removeAttribute("src");video.load();const player=new shaka.Player();await player.attach(video);await player.load("/dash/manifest.mpd");await video.play();await wait();results.push({format:"DASH",passed:true,seconds:Number(video.currentTime.toFixed(2))});await player.destroy(); } catch(e) { results.push({format:"DASH",passed:false,error:String(e)}); }' +
' return results; };</script></body></html>';

function startServer() {
  const hlsEntry = require.resolve("hls.js");
  const shakaEntry = require.resolve("shaka-player");
  return createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    let file;
    if (pathname === "/") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(page); return; }
    if (pathname === "/hls.js") file = hlsEntry;
    else if (pathname === "/shaka.js") file = shakaEntry;
    else if (pathname.startsWith("/hls/")) file = path.join(hlsDir, path.basename(pathname));
    else if (pathname.startsWith("/dash/")) file = path.join(dashDir, path.basename(pathname));
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end("not found"); return; }
    const type = file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : file.endsWith(".mpd") ? "application/dash+xml" :
      file.endsWith(".ts") ? "video/mp2t" : file.endsWith(".m4s") ? "video/iso.segment" : "application/octet-stream";
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
    const results = await window.webContents.executeJavaScript("window.runPlaybackTests()");
    for (const result of results) console.log(JSON.stringify(result));
    app.exit(results.length === 2 && results.every(result => result.passed) ? 0 : 1);
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
