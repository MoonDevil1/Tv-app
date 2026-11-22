import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AppSection, AppSettings, EpgProgramme, Playlist, RecentChannel, TvChannel } from "./models";

interface AppState {
  activeSection: AppSection; settings: AppSettings; playlists: Playlist[]; favorites: string[];
  recentChannels: RecentChannel[]; guide: Record<string, EpgProgramme[]>;
  setActiveSection: (section: AppSection) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  addPlaylist: (playlist: Playlist) => void; replacePlaylist: (playlist: Playlist) => void;
  removePlaylist: (playlistId: string) => void; toggleFavorite: (playlistId: string, channelId: string) => void;
  recordRecentChannel: (playlistId: string, channel: TvChannel) => void;
  setGuide: (guide: Record<string, EpgProgramme[]>) => void;
}
export const channelKey = (playlistId: string, channelId: string) => `${playlistId}:${channelId}`;
const defaultSettings: AppSettings = {
  theme: "light", defaultRefreshIntervalMs: 300000, preferredQuality: "auto",
  autoplayNextChannel: false, showChannelNumbers: true, diagnosticsEnabled: true
};
export const useAppStore = create<AppState>()(persist((set) => ({
  activeSection: "Home", settings: defaultSettings, playlists: [], favorites: [], recentChannels: [], guide: {},
  setActiveSection: activeSection => set({ activeSection }),
  updateSettings: patch => set(state => ({ settings: { ...state.settings, ...patch } })),
  addPlaylist: playlist => set(state => ({ playlists: [...state.playlists.filter(item => item.id !== playlist.id), playlist] })),
  replacePlaylist: playlist => set(state => ({ playlists: state.playlists.map(item => item.id === playlist.id ? playlist : item) })),
  removePlaylist: playlistId => set(state => ({
    playlists: state.playlists.filter(item => item.id !== playlistId),
    favorites: state.favorites.filter(key => !key.startsWith(playlistId + ":")),
    recentChannels: state.recentChannels.filter(item => item.playlistId !== playlistId)
  })),
  toggleFavorite: (playlistId, channelId) => set(state => {
    const key = channelKey(playlistId, channelId);
    return { favorites: state.favorites.includes(key) ? state.favorites.filter(item => item !== key) : [...state.favorites, key] };
  }),
  recordRecentChannel: (playlistId, channel) => set(state => {
    const key = channelKey(playlistId, channel.id);
    return { recentChannels: [{ playlistId, channelId: channel.id, watchedAt: Date.now() }, ...state.recentChannels.filter(item => channelKey(item.playlistId, item.channelId) !== key)].slice(0, 50) };
  }),
  setGuide: guide => set({ guide })
}), {
  name: "tg-iptv-rebuild-v1", storage: createJSONStorage(() => localStorage),
  partialize: state => ({ activeSection: state.activeSection, settings: state.settings, favorites: state.favorites, recentChannels: state.recentChannels })
})));