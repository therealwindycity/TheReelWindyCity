import archiveSnapshot from "@/data/archive-tree.json";
import transcriptSnapshot from "@/data/transcript-tree.json";
import { ARCHIVE_REPO, TRANSCRIPT_REPO, REPOSITORIES, asset, type SourceFile } from "./civic-data";

type TreeEntry = { path: string; type: string; sha: string; size?: number };
export type GithubTree = { tree?: TreeEntry[]; truncated?: boolean; sha?: string; message?: string };

export function toSourceFiles(tree: TreeEntry[], repo: string): SourceFile[] {
  return tree.filter((entry) => entry.type === "blob").map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size || 0, repo,
    type: entry.path.toLowerCase().endsWith(".pdf") ? "PDF" as const : entry.path.includes("transcripts/") && entry.path.endsWith(".md") ? "Transcript" as const : "Source" as const,
  })).sort((a, b) => a.path.localeCompare(b.path));
}

/** Bundled snapshot of a repository index (used at build time and as the instant client-side seed). */
export function getSnapshot(repo = ARCHIVE_REPO) {
  const data = repo === TRANSCRIPT_REPO ? (transcriptSnapshot as GithubTree) : (archiveSnapshot as GithubTree);
  return { files: toSourceFiles(data.tree || [], repo), snapshot: true, sha: data.sha || "" };
}

/**
 * Load the complete file index for an archive repository.
 * On this static deployment the indexes ship with the site (public/data/<repo>.json),
 * refreshed from GitHub by `npm run data:refresh`.
 */
export async function fetchArchive(repo: string): Promise<{ files: SourceFile[]; snapshot: boolean; sha: string }> {
  if (!REPOSITORIES.some((r) => r.id === repo)) throw new Error("Unknown repository");
  const res = await fetch(asset(`data/${repo}.json`));
  if (!res.ok) throw new Error("The repository index is unavailable. Please retry or open the original archive on GitHub.");
  const data: GithubTree = await res.json();
  if (!data.tree || data.truncated) throw new Error("Repository index is incomplete");
  return { files: toSourceFiles(data.tree, repo), snapshot: true, sha: data.sha || "" };
}
