import initSqlJs from "sql.js/dist/sql-asm.js";
import fs from "fs";
import { homedir } from "os";
import path from "path";
import { EntryLike } from "./types";
import { isWin } from "./utils";
import { build } from "./preferences";

let sqlJsInitialized = false;
let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

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

function getGlobalStoragePath() {
  const buildName = getBuildName();
  if (isWin) {
    return path.join(
      homedir(),
      "AppData",
      "Roaming",
      buildName,
      "User",
      "globalStorage",
    );
  }
  return path.join(
    homedir(),
    "Library",
    "Application Support",
    buildName,
    "User",
    "globalStorage",
  );
}

function getDBPath() {
  return path.join(getGlobalStoragePath(), "state.vscdb");
}

function getStorageJsonPath() {
  return path.join(getGlobalStoragePath(), "storage.json");
}

function getWorkspaceStoragePath() {
  const buildName = getBuildName();
  if (isWin) {
    return path.join(
      homedir(),
      "AppData",
      "Roaming",
      buildName,
      "User",
      "workspaceStorage",
    );
  }
  return path.join(
    homedir(),
    "Library",
    "Application Support",
    buildName,
    "User",
    "workspaceStorage",
  );
}

function buildUriTimestampMap(): Map<string, number> {
  const wsPath = getWorkspaceStoragePath();
  const map = new Map<string, number>();
  if (!fs.existsSync(wsPath)) return map;

  try {
    const dirs = fs.readdirSync(wsPath);
    for (const dir of dirs) {
      const fullDir = path.join(wsPath, dir);
      const wsJsonPath = path.join(fullDir, "workspace.json");
      if (!fs.existsSync(wsJsonPath)) continue;
      try {
        const wsData = JSON.parse(fs.readFileSync(wsJsonPath, "utf8"));
        const uri = wsData.folder || wsData.workspace?.configPath;
        if (uri) {
          const stat = fs.statSync(fullDir);
          map.set(uri, stat.mtimeMs);
        }
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }
  return map;
}

function getEntryUri(entry: EntryLike): string {
  if ("folderUri" in entry) return entry.folderUri;
  if ("fileUri" in entry) return entry.fileUri;
  if ("workspace" in entry) return entry.workspace.configPath;
  return "";
}

function sortByRecency(entries: EntryLike[]): EntryLike[] {
  const timestampMap = buildUriTimestampMap();
  return [...entries].sort((a, b) => {
    const ta = timestampMap.get(getEntryUri(a)) ?? 0;
    const tb = timestampMap.get(getEntryUri(b)) ?? 0;
    return tb - ta;
  });
}

export function getBuildScheme(): string {
  const scheme = buildSchemes[getBuildName()] as string | undefined;
  if (!scheme || scheme.length <= 0) return buildSchemes.Code;
  return scheme;
}

function parseUriToEntry(uri: string): EntryLike | null {
  if (uri.startsWith("vscode-remote://")) {
    const withoutScheme = uri.slice("vscode-remote://".length);
    const slashIndex = withoutScheme.indexOf("/");
    if (slashIndex === -1) return null;
    const remoteAuthority = decodeURIComponent(withoutScheme.slice(0, slashIndex));
    const remotePath = withoutScheme.slice(slashIndex);
    if (remotePath.endsWith(".code-workspace")) {
      return {
        workspace: { configPath: `vscode-remote://${remoteAuthority}${remotePath}` },
        remoteAuthority,
        label: "/",
      };
    }
    return {
      folderUri: `vscode-remote://${remoteAuthority}${remotePath}`,
      remoteAuthority,
      label: remotePath,
    };
  }

  if (uri.startsWith("vscode-vfs://")) {
    const withoutScheme = uri.slice("vscode-vfs://".length);
    const slashIndex = withoutScheme.indexOf("/");
    if (slashIndex === -1) return null;
    const remoteAuthority = decodeURIComponent(withoutScheme.slice(0, slashIndex));
    const remotePath = withoutScheme.slice(slashIndex);
    return {
      folderUri: uri,
      remoteAuthority,
      label: remotePath,
    };
  }

  if (uri.endsWith(".code-workspace")) {
    return { workspace: { configPath: uri } };
  }

  return { folderUri: uri };
}

function readFromStorageJson(): EntryLike[] | null {
  const storageJsonPath = getStorageJsonPath();
  if (!fs.existsSync(storageJsonPath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(storageJsonPath, "utf8"));
    const workspaces: Record<string, string> = data?.profileAssociations?.workspaces ?? {};
    const entries: EntryLike[] = [];
    const seen = new Set<string>();

    for (const uri of Object.keys(workspaces)) {
      if (seen.has(uri)) continue;
      seen.add(uri);
      const entry = parseUriToEntry(uri);
      if (entry) entries.push(entry);
    }

    const backupFolders: Array<{ folderUri: string; remoteAuthority?: string }> =
      data?.backupWorkspaces?.folders ?? [];
    for (const f of backupFolders) {
      if (seen.has(f.folderUri)) continue;
      seen.add(f.folderUri);
      if (f.remoteAuthority) {
        entries.push({
          folderUri: f.folderUri,
          remoteAuthority: f.remoteAuthority,
          label: f.folderUri,
        });
      } else {
        const entry = parseUriToEntry(f.folderUri);
        if (entry) entries.push(entry);
      }
    }

    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
}

export async function useRecentEntries() {
  const dbPath = getDBPath();

  if (!fs.existsSync(dbPath)) {
    const storageEntries = readFromStorageJson();
    if (storageEntries) {
      return { data: sortByRecency(storageEntries), isLoading: false, error: false as const };
    }
    return { data: undefined, isLoading: false, error: true as const };
  }

  try {
    console.log("Initializing sql.js...");

    if (!sqlJsInitialized || !SQL) {
      SQL = await initSqlJs();
      sqlJsInitialized = true;
    }

    if (!SQL) {
      const storageEntries = readFromStorageJson();
      if (storageEntries) {
        return { data: sortByRecency(storageEntries), isLoading: false, error: false as const };
      }
      return { data: undefined, isLoading: false, error: true as const };
    }

    console.log("Reading database file...");
    const fileBuffer = fs.readFileSync(dbPath);
    console.log("Creating database...");
    const db = new SQL.Database(fileBuffer);

    console.log("Executing query...");
    const result = db.exec(
      "SELECT json_extract(value, '$.entries') as entries FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'",
    );

    db.close();

    console.log("Query result:", result);
    const entries =
      result.length > 0 && result[0].values.length > 0
        ? (result[0].values[0][0] as string)
        : undefined;

    if (entries) {
      const parsedEntries = JSON.parse(entries) as EntryLike[];
      console.log("Parsed entries:", parsedEntries?.length);
      return { data: sortByRecency(parsedEntries), isLoading: false, error: false as const };
    }

    const storageEntries = readFromStorageJson();
    if (storageEntries) {
      console.log("Entries from storage.json:", storageEntries.length);
      return { data: sortByRecency(storageEntries), isLoading: false, error: false as const };
    }

    return { data: undefined, isLoading: false, error: false as const };
  } catch (e) {
    console.log("Error:", e);
    const storageEntries = readFromStorageJson();
    if (storageEntries) {
      return { data: sortByRecency(storageEntries), isLoading: false, error: false as const };
    }
    return { data: undefined, isLoading: false, error: true as const };
  }
}
