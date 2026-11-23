import test from "node:test";
import assert from "node:assert/strict";
import { channelKey, useAppStore } from "../src/app/store";
import type { Playlist, TvChannel } from "../src/app/models";

const channel: TvChannel = {
  id: "channel-1", name: "Test Channel", group: "News", sources: [],
  rawAttributes: {}
};
const playlist: Playlist = {
  id: "playlist-1", name: "Test playlist", source: "https://example.test/list.m3u",
  channels: [channel], groups: ["News"], epgUrls: [], importedAt: 1,
  refreshIntervalMs: 0, requestHeaders: {}
};

test("application settings update without replacing unrelated preferences", () => {
  const store = useAppStore.getState();
  store.updateSettings({ theme: "dark" });
  store.updateSettings({ preferredQuality: "720p" });
  const settings = useAppStore.getState().settings;
  assert.equal(settings.theme, "dark");
  assert.equal(settings.preferredQuality, "720p");
  assert.equal(settings.defaultRefreshIntervalMs, 300000);
  store.updateSettings({ theme: "light", preferredQuality: "auto" });
});

test("playlist collection replaces by ID and removes playlist-scoped user data", () => {
  const store = useAppStore.getState();
  store.addPlaylist(playlist);
  store.toggleFavorite(playlist.id, channel.id);
  store.recordRecentChannel(playlist.id, channel);
  assert.deepEqual(useAppStore.getState().favorites, [channelKey(playlist.id, channel.id)]);
  assert.equal(useAppStore.getState().recentChannels.length, 1);
  store.addPlaylist({ ...playlist, name: "Updated name" });
  assert.equal(useAppStore.getState().playlists.length, 1);
  assert.equal(useAppStore.getState().playlists[0].name, "Updated name");
  useAppStore.getState().removePlaylist(playlist.id);
  assert.equal(useAppStore.getState().playlists.length, 0);
  assert.equal(useAppStore.getState().favorites.length, 0);
  assert.equal(useAppStore.getState().recentChannels.length, 0);
});

test("channel history records the most recent watch first and de-duplicates channels", () => {
  const store = useAppStore.getState();
  store.recordRecentChannel("playlist-a", channel);
  store.recordRecentChannel("playlist-b", { ...channel, id: "channel-2", name: "Another Channel" });
  store.recordRecentChannel("playlist-a", channel);
  const recent = useAppStore.getState().recentChannels;
  assert.equal(recent.length, 2);
  assert.equal(recent[0].playlistId, "playlist-a");
  assert.equal(recent[0].channelId, "channel-1");
  useAppStore.setState({ recentChannels: [] });
});
