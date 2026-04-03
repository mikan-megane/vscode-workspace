import { useSQL } from "@raycast/utils";
import fs from "fs";
import { homedir } from "os";
import path from "path";
import { EntryLike, RecentEntries } from "./types";
import { isWin } from "./utils";
import { build } from "./preferences";

const buildSchemes: Record<string, string> = {
  Antigravity: "antigravity",
  Code: "vscode",
  "Code - Insiders": "vscode-insiders",
  Cursor: "cursor",
  Kiro: "kiro",
  VSCodium: "vscode-oss",
  Positron: "positron",
  Windsurf: "windsurf",
  Trae: "trae",
  "Trae CN": "trae-cn",
  Lingma: "lingma",
};

function getBuildName(): string {
  return build;
}

function getDBPath() {
  const buildName = getBuildName();
  if (isWin) {
    return path.join(
      homedir(),
      "AppData",
      "Roaming",
      buildName,
      "User",
      "globalStorage",
      "state.vscdb",
    );
  }
  return path.join(
    homedir(),
    "Library",
    "Application Support",
    buildName,
    "User",
    "globalStorage",
    "state.vscdb",
  );
}

export function getBuildScheme(): string {
  const scheme = buildSchemes[getBuildName()] as string | undefined;
  if (!scheme || scheme.length <= 0) return buildSchemes.Code;
  return scheme;
}

export function useRecentEntries() {
  const dbPath = getDBPath();

  if (!fs.existsSync(dbPath)) {
    return { data: undefined, isLoading: false, error: true as const };
  }

  const { data, isLoading, revalidate } = useSQL<RecentEntries>(
    dbPath,
    "SELECT json_extract(value, '$.entries') as entries FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'",
  );

  const entries = data && data.length ? data[0].entries : undefined;
  const parsedEntries = entries
    ? (JSON.parse(entries) as EntryLike[])
    : undefined;

  return { data: parsedEntries, isLoading, revalidate };
}
