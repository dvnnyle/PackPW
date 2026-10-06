import { Platform } from 'react-native';

// Remembers the last answer for each backend request on the device, so a page can show it instantly
// (even right after the app starts) while fresh data loads in the background.
// Phone: one JSON file in the app's document folder. Web: localStorage.
const STORAGE_KEY = 'playworld-api-cache';
const MAX_ENTRIES = 80; // oldest requests are dropped beyond this

function cacheFile() {
  const { File, Paths } = require('expo-file-system');
  return new File(Paths.document, 'api-cache.json');
}

function load() {
  try {
    if (Platform.OS === 'web') return JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '{}');
    const file = cacheFile();
    return file.exists ? JSON.parse(file.textSync()) : {};
  } catch {
    return {}; // missing or unreadable cache just means no instant data this time
  }
}

let entries = load(); // { [path]: { data, at } }
let saveTimer = null;

function save() {
  try {
    const text = JSON.stringify(entries);
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(STORAGE_KEY, text);
    } else {
      const file = cacheFile();
      if (!file.exists) file.create();
      file.write(text);
    }
  } catch {
    // Storage full or unavailable: the app still works, only without the instant start.
  }
}

export function readCache(path) {
  return entries[path]?.data;
}

export function writeCache(path, data) {
  entries[path] = { data, at: Date.now() };
  const paths = Object.keys(entries);
  if (paths.length > MAX_ENTRIES) {
    paths.sort((a, b) => entries[a].at - entries[b].at);
    for (const old of paths.slice(0, paths.length - MAX_ENTRIES)) delete entries[old];
  }
  // Several answers usually arrive together; write them to storage in one go.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}
