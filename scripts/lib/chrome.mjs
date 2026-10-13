/**
 * Minimal Chrome DevTools Protocol driver.
 *
 * Dependency-free on purpose: Node 24 ships a global `WebSocket`, and Chrome is
 * already installed on the machine, so driving a real browser needs no
 * automation package and no download step. That matters because some of what
 * these scripts check is invisible to HTTP assertions — a React component that
 * throws on render still returns 200 with server-rendered HTML.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * A **per-instance** debugging port and profile directory.
 *
 * Both used to be constants (port 9333, a single `ta-chrome-profile`), which was
 * harmless while every browser was shut down properly and quietly disastrous when one
 * was not: `stop()` killed only the launcher process, Chrome's children survived, and
 * the next run's port poll was answered by *the previous run's browser*. Measured, 13
 * orphaned Chrome processes had accumulated on one profile, and a suite would then
 * attach to a stale browser — hanging, or failing with no summary at all.
 *
 * Asking the OS for a free port and using a directory named after this process means a
 * leftover browser can no longer be mistaken for ours.
 */
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Throwaway browser state belongs in the system temp dir, not in the repo. */
const profileDir = (tag) => path.join(tmpdir(), `ta-chrome-${tag}`);

/** Any Chromium will do; `TA_CHROME` overrides the search for odd installs. */
export function findBrowser() {
  const candidates = [
    process.env.TA_CHROME,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `No Chrome/Edge found. Set TA_CHROME to the executable path.\nTried:\n  ${candidates.join("\n  ")}`,
    );
  }
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A browser session: one Chrome process, one tab per visit.
 *
 * `visit()` returns the page's uncaught exceptions and console errors, which is
 * the point of using a real browser at all.
 */
export class Browser {
  constructor({ width = 1280, height = 1100 } = {}) {
    this.width = width;
    this.height = height;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.process = null;
    this.errors = [];
    this.visits = 0;
  }

  async start() {
    this.port = await freePort();
    this.userDataDir = profileDir(`${process.pid}-${this.port}`);
    await mkdir(this.userDataDir, { recursive: true });

    this.process = spawn(
      findBrowser(),
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${this.userDataDir}`,
        `--window-size=${this.width},${this.height}`,
        "--hide-scrollbars",
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const version = await fetch(`http://127.0.0.1:${this.port}/json/version`).then((r) =>
          r.json(),
        );
        this.rootSocket = version.webSocketDebuggerUrl;
        return this;
      } catch {
        await sleep(250);
      }
    }
    throw new Error("Chrome did not open its debugging port");
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  /** Open a tab, attach listeners, navigate, and settle. */
  async visit(url, { cookies, settle = 2500 } = {}) {
    const target = await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, {
      method: "PUT",
    }).then((r) => r.json());

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    this.socket = socket;
    this.nextId = 1;
    this.pending.clear();
    this.errors = [];

    /*
     * A bound on opening the socket, and it is not paranoia.
     *
     * Without it, a CDP connection that never opens leaves an `await` pending; when
     * nothing else is keeping the event loop alive, Node **exits with code 0 and
     * prints no summary**, which reads exactly like a suite that passed quietly. Two
     * suites did that in one run and the batch reported "1002 passed, 0 failed" while
     * 113 assertions had never run. A timeout turns that into a sentence.
     */
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`CDP socket did not open within 15s (${target.webSocketDebuggerUrl})`));
      }, 15_000);

      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        (event) => {
          clearTimeout(timer);
          reject(new Error(`CDP socket failed: ${event?.message ?? "unknown"}`));
        },
        { once: true },
      );
    });

    const loaded = new Promise((resolve) => {
      const listener = (event) => {
        const message = JSON.parse(event.data);
        if (message.method === "Page.loadEventFired") {
          socket.removeEventListener("message", listener);
          resolve();
        }
      };
      socket.addEventListener("message", listener);
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }

      if (message.method === "Runtime.exceptionThrown") {
        const details = message.params?.exceptionDetails;
        this.errors.push(details?.exception?.description ?? details?.text ?? "unknown exception");
      }
      if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
        this.errors.push(
          (message.params.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" "),
        );
      }
    });

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
    await this.send("DOM.enable");
    await this.send("Emulation.setDeviceMetricsOverride", {
      width: this.width,
      height: this.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    if (cookies) await this.setCookies(cookies);

    await this.send("Page.navigate", { url });
    await loaded;
    await sleep(settle);

    this.visits++;
    return { tabId: target.id, errors: [...this.errors] };
  }

  async setCookies(cookieHeader) {
    for (const pair of cookieHeader.split("; ")) {
      const [name, ...rest] = pair.split("=");
      await this.send("Network.setCookie", {
        name,
        value: rest.join("="),
        domain: "localhost",
        path: "/",
      });
    }
  }

  /** Attach a local file to the first `input[type=file]` matching a selector. */
  async setFileInput(selector, filePath) {
    const { root } = await this.send("DOM.getDocument", { depth: -1 });
    const { nodeId } = await this.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (!nodeId) throw new Error(`no file input matched ${selector}`);
    await this.send("DOM.setFileInputFiles", { nodeId, files: [filePath] });
  }

  /** Evaluate an expression in the page and return its JSON value. */
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
    }
    return result.result.value;
  }

  async screenshot(file) {
    await mkdir(path.dirname(file), { recursive: true });
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    await writeFile(file, Buffer.from(data, "base64"));
    return file;
  }

  async closeTab(tabId) {
    await fetch(`http://127.0.0.1:${this.port}/json/close/${tabId}`).catch(() => {});
  }

  /**
   * Shut the browser down, **including its children**.
   *
   * `process.kill()` only signals the launcher; Chrome re-execs itself into a browser
   * process plus a renderer/GPU/utility family, and those keep the profile lock and the
   * debugging port. That is how orphans accumulated, each one making the next run less
   * reliable. `taskkill /T` walks the tree on Windows; a negative pid asks the OS for
   * the process group elsewhere.
   */
  stop() {
    const pid = this.process?.pid;
    if (!pid) return;

    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        this.process.kill("SIGKILL");
      }
    }

    // Best-effort: a leftover profile dir is only temp clutter, but on a machine that
    // has run these suites hundreds of times it is real clutter.
    if (this.userDataDir) {
      void rm(this.userDataDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/** Log in through the real endpoint and return a `Cookie:` header value. */
export async function loginCookie(base, email = "demo@travel-agent.dev", password = "Demo1234") {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`login failed: ${response.status}`);
  return (response.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}
