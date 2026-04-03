# VSCode Workspace - Raycast Extension 実装計画

## 概要

Flow.Launcher用プラグイン [Flow.Plugin.VSCodeWorkspace](https://github.com/taooceros/Flow.Plugin.VSCodeWorkspace) および [PowerToys VSCodeWorkspaces](https://github.com/microsoft/PowerToys/tree/main/src/modules/launcher/Plugins/Community.PowerToys.Run.Plugin.VSCodeWorkspaces) を参考に、VSCodeが起動していなくてもワークスペースを検索・開けるRaycast拡張機能を作成する。

## 今回実装する内容

### 1. 型定義 (`src/lib/types.ts`)

- `Workspace` 型: `{ path, folderName, type: "folder" | "workspace" }`
- `VSCodeInstance` 型: `{ name, appDataPath }`

### 2. ユーティリティ (`src/lib/utils.ts`)

- `file:///` URI → ローカルパス変換（Windows/macOS対応）
- リモートURI（`vscode-remote://`）のスキップ判定
- パス正規化

### 3. VSCodeインストール検出 (`src/lib/vscode-instance.ts`)

- Windows: `%APPDATA%\Code`, `%APPDATA%\Code - Insiders` の存在確認
- macOS: `~/Library/Application Support/Code`, `~/Library/Application Support/Code - Insiders`
- 存在するディレクトリを `VSCodeInstance[]` として返す

### 4. ワークスペース発見 (`src/lib/workspace-discovery.ts`)

- **データソース1**: `state.vscdb` (SQLite DB, VSCode v1.64+)
  - パス: `{AppData}\User\globalStorage\state.vscdb`
  - クエリ: `SELECT value FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'`
  - `entries[].folderUri` → フォルダワークスペース
  - `entries[].workspace.configPath` → `.code-workspace` ファイル
- **データソース2**: `storage.json` (レガシーフォールバック)
  - パス: `{AppData}\storage.json`
  - `openedPathsList.entries[].folderUri`
  - `openedPathsList.workspaces3[]` (さらに古い形式)
- ローカル(`file:///`)エントリのみ抽出
- ディスク上のパス存在検証 (`existsSync`)
- 重複排除
- `sql.js` (Pure WASM SQLite) を使用してDB読み取り

### 5. メインコマンドUI (`src/search-workspace.tsx`)

- `usePromise` で非同期にワークスペース一覧を取得
- `List` コンポーネントで検索・フィルタリング
- アクション:
  - VSCodeで開く (`code` コマンド)
  - VSCode Insidersで開く (`code-insiders`)
  - パスをクリップボードにコピー
  - Finder/エクスプローラーで表示

### 6. パッケージ設定更新 (`package.json`)

- `sql.js` を依存関係に追加
- `@types/sql.js` をdevDependenciesに追加

---

## 今回実装しないが次回以降実装する内容

### リモートワークスペース対応

- Remote SSH: `settings.json` から `remote.SSH.configFile` を読み、SSH config をパースしてリモートホスト一覧を表示
- Remote WSL: `vscode-remote://wsl+<distro>/` URI のパース
- Dev Container: `vscode-remote://dev-container+<id>/` URI のパース
- GitHub Codespaces: `vscode-remote://vsonline+<id>/` URI のパース
- Remote Tunnel: `tunnel+<machine>` のパース
- SSH config パーサーの実装

### VSCodeフォーク対応

- Cursor: `%APPDATA%\Cursor` → `cursor` CLI
- VSCodium: `%APPDATA%\VSCodium` → `codium` CLI
- Windsurf: `%APPDATA%\Windsurf` → `windsurf` CLI
- Positron, Trae, Kiro 等
- 各フォークのCLIパス検出 (`PATH` スキャン)
- Preferences でフォークの選択を可能にする

### UI拡張

- ワークスペースのピン留め機能（`useCachedState` 使用）
- ワークスペースの削除機能（DB書き戻し）
- Grid表示モード
- Git ブランチ表示
- ワークスペースアイコン（フォルダパスから推測）
- 最近開いた順ソート（`state.vscdb` の順序を維持）

### 追加コマンド

- "Open with VSCode" (Finder連携, no-view)
- "Open New Window" (no-view)
- ワークスペースのブックマーク/カスタム登録

### 高度な機能

- ポータブルモードの自動検出（VSCodeインストールディレクトリに `data` フォルダがある場合）
- `history.recentlyOpenedPathsList` 以外のキーからのワークスペース発見
- ワークスペースメタデータのキャッシュ（高速化）
- ファジーマッチングによる検索（Raycastのビルトイン検索以外）

---

## 参考リンク

- [Flow.Plugin.VSCodeWorkspace](https://github.com/taooceros/Flow.Plugin.VSCodeWorkspace)
- [PowerToys VSCodeWorkspaces](https://github.com/microsoft/PowerToys/tree/main/src/modules/launcher/Plugins/Community.PowerToys.Run.Plugin.VSCodeWorkspaces)
- 既存Raycast VSCode拡張機能: `C:\Users\mikan\.config\raycast-x\extensions\95e41a2e-a943-4d49-b0df-152c3db2f7e0`
