import { Action, ActionPanel, Icon, List, open } from "@raycast/api";
import { basename, dirname } from "path";
import { useEffect, useState } from "react";
import { fileURLToPath } from "url";
import { useRecentEntries, getBuildScheme } from "./lib/db";
import { build } from "./lib/preferences";
import { EntryType, EntryLike } from "./lib/types";
import {
  isFileEntry,
  isFolderEntry,
  isRemoteEntry,
  isRemoteWorkspaceEntry,
  isWorkspaceEntry,
  filterEntriesByType,
} from "./lib/utils";
import { getEditorApplication } from "./lib/editor";

export default function Command() {
  const { data, isLoading, error } = useRecentEntries();
  const [type, setType] = useState<EntryType | null>(null);

  // Debug logging
  console.log("Debug - data:", data);
  console.log("Debug - isLoading:", isLoading);
  console.log("Debug - error:", error);
  console.log("Debug - filtered length:", data?.filter(filterEntriesByType(type))?.length ?? 0);

  if (error) {
    return (
      <List>
        <List.EmptyView
          title="Failed to load recent projects"
          description={`Could not read the ${build} state database. Make sure ${build} is installed.`}
          icon={Icon.ExclamationMark}
        />
      </List>
    );
  }

  const filtered = data?.filter(filterEntriesByType(type)) ?? [];

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search recent projects..."
      searchBarAccessory={<EntryTypeDropdown onChange={setType} />}
    >
      {filtered.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No recent projects found"
          description="Open some projects in VS Code first"
          icon={Icon.Folder}
        />
      ) : (
        filtered.map((entry: EntryLike, index: number) => (
          <EntryItem key={index} entry={entry} />
        ))
      )}
    </List>
  );
}

function EntryTypeDropdown(props: { onChange: (type: EntryType) => void }) {
  return (
    <List.Dropdown
      tooltip="Filter project types"
      defaultValue={EntryType.AllTypes}
      storeValue
      onChange={(value) => props.onChange(value as EntryType)}
    >
      <List.Dropdown.Item title="All Types" value="All Types" />
      <List.Dropdown.Section>
        {Object.values(EntryType)
          .filter((key) => key !== "All Types")
          .sort()
          .map((key) => (
            <List.Dropdown.Item key={key} title={key} value={key} />
          ))}
      </List.Dropdown.Section>
    </List.Dropdown>
  );
}

function EntryItem(props: { entry: EntryLike }) {
  if (isWorkspaceEntry(props.entry)) {
    return (
      <LocalItem uri={props.entry.workspace.configPath} entry={props.entry} />
    );
  } else if (isFolderEntry(props.entry)) {
    return <LocalItem uri={props.entry.folderUri} entry={props.entry} />;
  } else if (isRemoteEntry(props.entry)) {
    return (
      <RemoteItem
        uri={props.entry.folderUri}
        label={props.entry.label}
        entry={props.entry}
      />
    );
  } else if (isRemoteWorkspaceEntry(props.entry)) {
    return (
      <RemoteItem
        uri={props.entry.workspace.configPath}
        label={props.entry.label || "/"}
        entry={props.entry}
      />
    );
  } else if (isFileEntry(props.entry)) {
    return <LocalItem uri={props.entry.fileUri} entry={props.entry} />;
  } else {
    return null;
  }
}

function LocalItem(props: { uri: string; entry: EntryLike }) {
  const name = decodeURIComponent(basename(props.uri));
  const path = fileURLToPath(props.uri);
  const subtitle = dirname(path);

  const [editorApp, setEditorApp] =
    useState<Awaited<ReturnType<typeof getEditorApplication>>>(undefined);

  useEffect(() => {
    getEditorApplication(build).then(setEditorApp);
  }, []);

  const handleOpen = async () => {
    if (editorApp) {
      await open(path, editorApp);
    } else {
      await open(path);
    }
  };

  return (
    <List.Item
      title={name}
      subtitle={subtitle}
      icon={{ fileIcon: path }}
      accessories={
        isFolderEntry(props.entry)
          ? [{ icon: Icon.Folder }]
          : isWorkspaceEntry(props.entry)
            ? [{ icon: Icon.Document }]
            : [{ icon: Icon.File }]
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action
              title={`Open in ${build}`}
              icon={editorApp ? { fileIcon: editorApp.path } : Icon.Globe}
              onAction={handleOpen}
            />
            <Action.ShowInFinder path={path} />
            <Action.OpenWith
              path={path}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
            />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy Name"
              content={name}
              shortcut={{ modifiers: ["cmd"], key: "." }}
            />
            <Action.CopyToClipboard
              title="Copy Path"
              content={path}
              shortcut={{ modifiers: ["cmd", "shift"], key: "." }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function RemoteItem(props: { uri: string; label: string; entry: EntryLike }) {
  const name = decodeURI(basename(props.uri));
  const scheme = getBuildScheme();
  const uri = props.uri.replace(
    "vscode-remote://",
    `${scheme}://vscode-remote/`,
  );

  return (
    <List.Item
      title={name}
      subtitle={props.label || "/"}
      icon={Icon.Globe}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.OpenInBrowser title={`Open in ${build}`} url={uri} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard title="Copy Name" content={name} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
