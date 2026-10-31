// Renders ../pmt-film.html to ../pmt-film.mp4 (1080p, with the soundtrack).
//
//   cd portfolio-video/tools && npm install
//   node score.js score.wav        (once; then encode to ../pmt-film-score.m4a, see README)
//   node render.js [fps] [pieces]  (defaults: 60 fps, 3 pieces rendered one after another, ~15 min)
//   node render.js snap 12.5,40    (stills of those seconds into ./snaps)
//
// Needs Microsoft Edge or Chrome, and ffmpeg on the PATH.
const puppeteer = require("puppeteer-core");
const { spawn } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

const DIR = path.resolve(__dirname, "..");
const HTML = "file:///" + path.join(DIR, "pmt-film.html").replace(/\\/g, "/") + "?render=1";
const OUT = path.join(DIR, "pmt-film.mp4");
const AUDIO = path.join(DIR, "pmt-film-score.m4a");
const BROWSER = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => fs.existsSync(p));
if (!BROWSER) throw new Error("No Edge/Chrome found; set BROWSER in render.js");

// Starting the browser ourselves and attaching is more reliable than puppeteer.launch on locked-down Windows setups.
async function open(port) {
  const proc = spawn(BROWSER, ["--headless=new", `--remote-debugging-port=${port}`, "--user-data-dir=" + path.join(os.tmpdir(), "pmt-edge-" + port), "--no-first-run", "--force-device-scale-factor=1", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  let browser;
  for (let i = 0; i < 60 && !browser; i++) {
    await new Promise((r) => setTimeout(r, 300));
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, defaultViewport: null }).catch(() => null);
  }
  if (!browser) throw new Error("could not attach to the browser on port " + port);
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(HTML, { waitUntil: "networkidle0" });
  await page.waitForFunction("window.READY === true");
  return { browser, page, proc };
}

const run = (cmd, args) => new Promise((res, rej) => spawn(cmd, args, { stdio: ["ignore", "ignore", "inherit"] }).on("close", (c) => (c ? rej(new Error(cmd + " exit " + c)) : res())));

async function segment(fps, from, to, port, file) {
  const { browser, page, proc } = await open(port);
  const ff = spawn("ffmpeg", ["-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", file], { stdio: ["pipe", "ignore", "inherit"] });
  for (let f = from; f < to; f++) {
    await page.evaluate((t) => window.seek(t), f / fps);
    const buf = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if ((f - from) % 150 === 0) console.log(`[${port}] ${f - from}/${to - from}`);
  }
  ff.stdin.on("error", () => {});
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await browser.close();
  proc.kill();
}

(async () => {
  const [a1, a2] = process.argv.slice(2);
  if (a1 === "snap") {
    const { browser, page, proc } = await open(9333);
    const dir = path.join(process.cwd(), "snaps");
    fs.mkdirSync(dir, { recursive: true });
    for (const t of a2.split(",").map(Number)) {
      await page.evaluate((x) => window.seek(x), t);
      await page.screenshot({ path: path.join(dir, `t${t.toFixed(2)}.jpg`), type: "jpeg", quality: 85 });
    }
    await browser.close(); proc.kill();
    return;
  }
  if (a1 === "segment") { // internal: node render.js segment fps from to port file
    const [fps, from, to, port, file] = process.argv.slice(3);
    return segment(Number(fps), Number(from), Number(to), Number(port), file);
  }
  // Rendering is CPU-bound, so extra parallel browsers don't speed it up (measured). The film is cut into
  // pieces that render one after another; a failed piece can be re-run alone with the "segment" mode.
  const fps = Number(a1 || 60), workers = Number(a2 || 3);
  const probe = await open(9332);
  const dur = await probe.page.evaluate("window.DUR");
  await probe.browser.close(); probe.proc.kill();
  const frames = Math.round(dur * fps), per = Math.ceil(frames / workers);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pmt-render-"));
  const parts = [];
  const t0 = Date.now();
  for (let i = 0; i < workers; i++) {
    const from = i * per, to = Math.min(frames, from + per), file = path.join(tmp, `part${i}.mp4`);
    parts.push(file);
    await run(process.execPath, [__filename, "segment", fps, from, to, 9400, file]);
  }
  fs.writeFileSync(path.join(tmp, "list.txt"), parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
  const args = ["-y", "-f", "concat", "-safe", "0", "-i", path.join(tmp, "list.txt")];
  if (fs.existsSync(AUDIO)) args.push("-i", AUDIO, "-c:v", "copy", "-c:a", "copy", "-shortest");
  else args.push("-c:v", "copy");
  await run("ffmpeg", [...args, "-movflags", "+faststart", OUT]);
  console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min →`, OUT);
})().catch((e) => { console.error(e); process.exit(1); });
