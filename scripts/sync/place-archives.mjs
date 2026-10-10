#!/usr/bin/env node
/**
 * Copy public documents for every Wyoming city, town, and county into that
 * place's archive repo. Volume 1 is civic-wy-<layer>-<id>. When it holds
 * PLACE_DOC_VOLUME files, the next copy opens civic-wy-<layer>-<id>-docs-N.
 *
 *   --provision     create any missing archive repo (needs a token that can)
 *   --harvest       fetch same-host documents from confirmed public pages
 *   --offline       do not call government sites; still write the roster
 *   --limit <n>     cap downloads this run
 *
 * Files also land in public/place-docs/ so the site can serve a copy even
 * when the token cannot push to another repository.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parse } from "node-html-parser";
import { COUNTIES, MUNICIPALITIES } from "../data/wyoming-ecosystem-catalog.mjs";

export const OWNER = "therealwindycity";
export const VOLUME = 250;
const UA = "CivicCheyenne-Watcher/1.0 (public-record copy; +https://therealwindycity.github.io/TheReelWindyCity/)";

export function repoName(layer, id, volume = 1) {
  const base = `civic-wy-${layer}-${id}`;
  return volume <= 1 ? base : `${base}-docs-${volume}`;
}

export function volumeForCount(existingFiles) {
  return Math.floor(Math.max(0, existingFiles) / VOLUME) + 1;
}

export function roster() {
  return [
    ...MUNICIPALITIES.map((place) => ({
      id: place.id,
      layer: "place",
      name: place.name,
      url: place.posting?.url || (place.website && place.website.verification !== "directory-domain" ? place.website.url : null),
    })),
    ...COUNTIES.map((county) => ({
      id: county.id,
      layer: "county",
      name: `${county.name} County`,
      url: county.clerk.website.url,
    })),
  ];
}

export function documentLinks(html, pageUrl) {
  const root = parse(html);
  const host = new URL(pageUrl).hostname.replace(/^www\./, "");
  const links = [];
  for (const el of root.querySelectorAll("a")) {
    const href = el.getAttribute("href") || "";
    let url;
    try { url = new URL(href, pageUrl); } catch { continue; }
    if (url.hostname.replace(/^www\./, "") !== host) continue;
    if (!/\.(pdf|docx?)($|\?)/i.test(url.pathname)) continue;
    url.hash = "";
    links.push(url.toString());
  }
  return [...new Set(links)];
}

function token() {
  return process.env.PLACE_ARCHIVE_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
}

async function github(pathname, options = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token()}`,
      "user-agent": UA,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const error = new Error(`${response.status} ${pathname}: ${body.message || text}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function ensureRepo(entry) {
  const name = repoName(entry.layer, entry.id, entry.volume || 1);
  try {
    await github(`/repos/${OWNER}/${name}`);
    return { name, created: false };
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  await github("/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name,
      description: `Public documents copied for ${entry.name}, Wyoming. Not an official government site.`,
      homepage: `https://therealwindycity.github.io/TheReelWindyCity/civic/${entry.layer === "county" ? "counties" : "places"}/${entry.id}/`,
      private: false,
      auto_init: true,
    }),
  });
  return { name, created: true };
}

function readme(entry) {
  return `# ${entry.name}\n\nPublic documents copied from this government's own website by the Civic Cheyenne scraper.\n\nThis is not an official ${entry.name} site. A file is copied only when it was linked on the pinned host. When this repo passes ${VOLUME} files, the scraper opens \`${repoName(entry.layer, entry.id, 2)}\` and continues there.\n\nCivic page: https://therealwindycity.github.io/TheReelWindyCity/civic/${entry.layer === "county" ? "counties" : "places"}/${entry.id}/\n`;
}

function localDir(entry, volume = 1) {
  return path.join("public", "place-docs", entry.layer, entry.id, volume === 1 ? "docs" : `docs-${volume}`);
}

function countLocal(entry) {
  const root = path.join("public", "place-docs", entry.layer, entry.id);
  if (!existsSync(root)) return 0;
  let count = 0;
  for (const folder of readdirSync(root)) {
    const dir = path.join(root, folder);
    if (!statSync(dir).isDirectory()) continue;
    count += readdirSync(dir).filter((name) => name !== "README.md").length;
  }
  return count;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/pdf" }, redirect: "follow" });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  const finalHost = new URL(response.url || url).hostname.replace(/^www\./, "");
  if (finalHost !== new URL(url).hostname.replace(/^www\./, "")) throw new Error(`Host drift from ${url} to ${response.url}`);
  return { body: Buffer.from(await response.arrayBuffer()), type: response.headers.get("content-type") || "", finalUrl: response.url || url };
}

function flag(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const entries = roster();
  const manifest = { owner: OWNER, volumeSize: VOLUME, generatedAt: new Date().toISOString(), places: [] };
  let created = 0;
  let copied = 0;
  const limit = Number(flag("--limit") ?? 40);
  if (process.argv.includes("--provision")) {
    if (!token()) console.warn("No GitHub token; archive repos were not created.");
    else {
      for (const entry of entries) {
        try {
          const result = await ensureRepo(entry);
          if (result.created) created += 1;
        } catch (error) {
          console.warn(`Repo ${repoName(entry.layer, entry.id)} was not created: ${error.message}`);
          if (error.status === 403 || error.status === 401) break;
        }
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    }
  }
  for (const entry of entries) {
    const docs = [];
    if (process.argv.includes("--harvest") && !process.argv.includes("--offline") && entry.url && copied < limit) {
      try {
        const page = await fetchText(entry.url);
        const html = page.body.toString("utf8");
        const links = /\.pdf($|\?)/i.test(entry.url) ? [entry.url] : documentLinks(html, page.finalUrl);
        for (const link of links) {
          if (copied >= limit) break;
          const file = await fetchText(link);
          if (!/pdf|officedocument|msword/i.test(file.type) && !file.body.subarray(0, 5).toString().startsWith("%PDF")) continue;
          const volume = volumeForCount(countLocal(entry));
          if (volume > 1 && token()) await ensureRepo({ ...entry, volume }).catch(() => {});
          const dir = localDir(entry, volume);
          mkdirSync(dir, { recursive: true });
          const filename = path.basename(new URL(link).pathname) || `document-${copied}.pdf`;
          writeFileSync(path.join(dir, filename), file.body);
          docs.push({ name: filename, sourceUrl: link, volume, repo: repoName(entry.layer, entry.id, volume) });
          copied += 1;
        }
      } catch (error) {
        docs.push({ error: error.message });
      }
    }
    manifest.places.push({
      id: entry.id,
      layer: entry.layer,
      name: entry.name,
      repo: repoName(entry.layer, entry.id),
      repoUrl: `https://github.com/${OWNER}/${repoName(entry.layer, entry.id)}`,
      sourceUrl: entry.url,
      documents: docs.filter((item) => item.name),
      errors: docs.filter((item) => item.error).map((item) => item.error),
    });
  }
  mkdirSync("src/data", { recursive: true });
  mkdirSync("public/place-docs", { recursive: true });
  writeFileSync("src/data/place-archives.json", `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync("public/place-docs/README.md", "# Wyoming place archives\n\nCopied public documents, one folder per government. The GitHub repo for each place is named civic-wy-place-<id> or civic-wy-county-<id>.\n");
  for (const entry of entries) mkdirSync(path.join("public", "place-docs", entry.layer, entry.id), { recursive: true });
  console.log(JSON.stringify({ governments: entries.length, reposCreated: created, filesCopied: copied }));
}

if (process.argv[1] && process.argv[1].endsWith("place-archives.mjs")) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
