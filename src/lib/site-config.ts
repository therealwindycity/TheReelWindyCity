export const SITE_ORIGIN = "https://therealwindycity.github.io";
export const SITE_NAME = "Civic Cheyenne";
export const SITE_DESCRIPTION =
  "Explore Cheyenne, Wyoming’s real public meetings, agendas, minutes, and archived records. An independent civic-learning project—not an official City of Cheyenne service.";

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/TheReelWindyCity";
const normalizedBasePath = configuredBasePath.split("/").filter(Boolean).join("/");
export const SITE_BASE_PATH = normalizedBasePath ? `/${normalizedBasePath}` : "";
export const SITE_URL = `${SITE_ORIGIN}${SITE_BASE_PATH}/`;

/** Build an absolute canonical URL beneath the GitHub Pages project path. */
export function siteUrl(path = ""): string {
  const relativePath = path.replace(/^\/+/, "");
  return relativePath ? new URL(relativePath, SITE_URL).toString() : SITE_URL;
}
