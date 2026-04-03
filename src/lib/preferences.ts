import { getPreferenceValues } from "@raycast/api";

const preferences = getPreferenceValues<ExtensionPreferences>();

export const build = preferences.build;
