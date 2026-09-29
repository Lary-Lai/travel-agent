/**
 * Local image uploads: the profile avatar and banner path.
 *
 *     node scripts/smoke-uploads.mjs [baseUrl]
 *
 * The interesting assertions are the hostile ones. A file upload is the one
 * endpoint where a browser hands the server bytes and a filename of its own
 * choosing, so "it accepted my JPEG" is the least informative thing to check.
 * What matters is that a mislabelled file, a traversal name, and an SVG are all
 * refused, and that a stored file cannot be served back as anything but an image.
 */
import { readFileSync, readdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3001";

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const login = async (email, password) => {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (response.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { status: response.status, cookie };
};

const upload = async (cookie, file, kind = "avatar") => {
  const body = new FormData();
  body.append("file", file);
  body.append("kind", kind);
  const response = await fetch(`${BASE}/api/uploads`, {
    method: "POST",
    headers: cookie ? { Cookie: cookie } : {},
    body,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
};

// ---------------------------------------------------------------- fixtures

/** A real PNG, built by hand so the test does not depend on a checked-in image. */
function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // One filter byte + RGBA per pixel, per row.
  const raw = Buffer.concat(
    Array.from({ length: height }, () =>
      Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4, 0x40)]),
    ),
  );

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  console.log("\n— who may upload at all");

  const anonymous = await upload(null, new File([makePng(8, 8)], "a.png", { type: "image/png" }));
  check("signed out -> 401", anonymous.status === 401, `got ${anonymous.status}`);

  const { cookie } = await login("demo@travel-agent.dev", "Demo1234");
  check("demo account can log in", Boolean(cookie));

  console.log("\n— the happy path");

  const png = makePng(640, 480);
  const ok = await upload(cookie, new File([png], "holiday.png", { type: "image/png" }));
  check("a PNG uploads -> 200", ok.status === 200, `got ${ok.status}`);

  const media = ok.body?.data;
  check("it returns a media URL", /^\/api\/media\/avatar-[0-9a-f]{16}\.png$/.test(media?.url ?? ""), String(media?.url));
  check("the byte count is reported", media?.bytes === png.length, `${media?.bytes} vs ${png.length}`);
  // Read from the header, not guessed: this is what lets the UI tell a 40x40
  // avatar from a 2000px banner.
  check("the real dimensions are read from the header", media?.width === 640 && media?.height === 480, `${media?.width}x${media?.height}`);
  check("the mime type is the sniffed one", media?.mimeType === "image/png", String(media?.mimeType));

  console.log("\n— the stored file is served back");

  const served = await fetch(`${BASE}${media.url}`);
  check("the media URL serves -> 200", served.status === 200, `got ${served.status}`);
  check(
    "with the image content type",
    served.headers.get("content-type") === "image/png",
    String(served.headers.get("content-type")),
  );
  check(
    "and nosniff, so the browser cannot re-interpret it",
    served.headers.get("x-content-type-options") === "nosniff",
    String(served.headers.get("x-content-type-options")),
  );
  const roundTrip = Buffer.from(await served.arrayBuffer());
  check("the bytes round-trip exactly", roundTrip.equals(png), `${roundTrip.length} bytes back`);

  console.log("\n— a JPEG from the repo, for the other code path");

  // The listing photos that ship with the project are real JPEGs with real
  // EXIF-less SOF headers, which exercises the segment walk.
  const photoDir = path.join(process.cwd(), "public", "listings");
  const photo = readdirSync(photoDir).find((name) => name.endsWith(".jpg"));
  if (photo) {
    const bytes = readFileSync(path.join(photoDir, photo));
    const jpeg = await upload(cookie, new File([bytes], "cover.jpg", { type: "image/jpeg" }), "cover");
    check("a JPEG uploads -> 200", jpeg.status === 200, `got ${jpeg.status}`);
    const data = jpeg.body?.data;
    check("stored with a .jpg extension", /^\/api\/media\/cover-[0-9a-f]{16}\.jpg$/.test(data?.url ?? ""), String(data?.url));
    check(
      "its dimensions were parsed out of the SOF marker",
      typeof data?.width === "number" && data.width > 100 && data.height > 100,
      `${data?.width}x${data?.height}`,
    );
    check("and it is served as image/jpeg", data?.mimeType === "image/jpeg", String(data?.mimeType));
  } else {
    check("a JPEG fixture exists in public/listings", false, "no .jpg found");
  }

  console.log("\n— what must be refused");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>`;
  const svgAttempt = await upload(cookie, new File([svg], "evil.svg", { type: "image/svg+xml" }));
  check("an SVG is refused (it can carry script)", svgAttempt.status === 400, `got ${svgAttempt.status}`);
  check(
    "and the reason says so",
    /SVG/i.test(String(svgAttempt.body?.error?.message)),
    String(svgAttempt.body?.error?.message),
  );

  // A file whose declared type says image but whose bytes say otherwise.
  const lie = await upload(
    cookie,
    new File([Buffer.from("#!/bin/sh\necho not an image\n")], "innocent.png", { type: "image/png" }),
  );
  check("a mislabelled non-image is refused", lie.status === 400, `got ${lie.status}`);

  const scriptFile = await upload(
    cookie,
    new File([Buffer.from("<html><script>alert(1)</script></html>")], "page.html", { type: "text/html" }),
  );
  check("an HTML file is refused", scriptFile.status === 400, `got ${scriptFile.status}`);

  const empty = await upload(cookie, new File([], "empty.png", { type: "image/png" }));
  check("an empty file is refused", empty.status === 400, `got ${empty.status}`);

  const huge = await upload(
    cookie,
    new File([Buffer.concat([makePng(8, 8), Buffer.alloc(5 * 1024 * 1024)])], "big.png", {
      type: "image/png",
    }),
  );
  check("a file over the size cap is refused", huge.status === 400, `got ${huge.status}`);

  // The filename is attacker-controlled, so it must never reach the filesystem.
  const traversal = await upload(
    cookie,
    new File([png], "../../../evil.png", { type: "image/png" }),
  );
  check("a traversal filename is stored under a generated name", traversal.status === 200, `got ${traversal.status}`);
  check(
    "and the generated name ignores the supplied one",
    /^\/api\/media\/avatar-[0-9a-f]{16}\.png$/.test(traversal.body?.data?.url ?? ""),
    String(traversal.body?.data?.url),
  );

  const badKind = await upload(cookie, new File([png], "x.png", { type: "image/png" }), "payload");
  check("an unknown kind is refused", badKind.status === 400, `got ${badKind.status}`);

  console.log("\n— the media route cannot be walked out of");

  for (const probe of ["..%2F.env", "....//.env", "avatar-0000000000000000.svg", "nope.png"]) {
    const response = await fetch(`${BASE}/api/media/${probe}`);
    check(`GET /api/media/${probe} -> 404`, response.status === 404, `got ${response.status}`);
  }

  console.log("\n— the profile accepts what the upload produced");

  const saved = await fetch(`${BASE}/api/users/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "演示用户", avatar: media.url, coverImage: media.url }),
  });
  check("saving the uploaded URLs on the profile -> 200", saved.status === 200, `got ${saved.status}`);
  const profile = (await saved.json()).data?.user;
  check("the avatar is stored", profile?.avatar === media.url, String(profile?.avatar));
  check("the banner is stored", profile?.coverImage === media.url, String(profile?.coverImage));

  // A path we did not mint is still rejected, so the field cannot point anywhere.
  const forged = await fetch(`${BASE}/api/users/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "演示用户", coverImage: "/api/media/../secret.png" }),
  });
  check("a forged media path is rejected by the profile API", forged.status === 400, `got ${forged.status}`);

  const external = await fetch(`${BASE}/api/users/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "演示用户", coverImage: "https://example.com/x.png" }),
  });
  check("an absolute https URL is still allowed", external.status === 200, `got ${external.status}`);

  // Leave the demo account as we found it.
  await fetch(`${BASE}/api/users/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "演示用户", avatar: "/avatars/avatar-8.svg", coverImage: "" }),
  });

  console.log(`\n${"=".repeat(58)}`);
  console.log(`PASSED: ${passed}   FAILED: ${failed}`);
  console.log("=".repeat(58));
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
