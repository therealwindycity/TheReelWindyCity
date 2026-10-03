#!/usr/bin/env node
/** Minimal static file server for previewing the exported site (`npm run preview`). */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve(process.argv[2] || "out");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".pdf": "application/pdf", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".webp": "image/webp", ".wasm": "application/wasm",
};

createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  let filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end("Forbidden"); return; }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = path.join(filePath, "index.html");
  if (!existsSync(filePath)) {
    const asIndex = path.join(root, urlPath, "index.html");
    if (existsSync(asIndex)) filePath = asIndex;
    else { res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }); res.end("<h1>404</h1>"); return; }
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
  if (req.method === "HEAD") { res.end(); return; }
  createReadStream(filePath).pipe(res);
}).listen(port, host, () => console.log(`Serving ${root} at http://${host}:${port}`));
