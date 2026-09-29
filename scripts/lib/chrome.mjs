/**
 * Minimal Chrome DevTools Protocol driver.
 *
 * Dependency-free on purpose: Node 24 ships a global `WebSocket`, and Chrome is
 * already installed on the machine, so driving a real browser needs no
 * automation package and no download step. That matters because some of what
 * these scripts check is invisible to HTTP assertions — a React component that
 * throws on render still returns 200 with server-rendered HTML.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 9333;

/**
 * Throwaway browser state belongs in the system temp dir, not in the repo.
 * Chrome unpacks its extensions into the profile, and a profile inside the
 * project makes `eslint .` lint megabytes of third-party bundle JS.
 */
const USER_DATA = path.join(tmpdir(), "ta-chrome-profile");

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
    this.process = spawn(
      findBrowser(),
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${USER_DATA}`,
        `--window-size=${this.width},${this.height}`,
        "--hide-scrollbars",
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
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
    const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
      method: "PUT",
    }).then((r) => r.json());

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    this.socket = socket;
    this.nextId = 1;
    this.pending.clear();
    this.errors = [];

    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
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
    await fetch(`http://127.0.0.1:${PORT}/json/close/${tabId}`).catch(() => {});
  }

  stop() {
    this.process?.kill();
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
