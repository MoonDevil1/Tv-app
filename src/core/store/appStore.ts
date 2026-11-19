import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Channel, Playlist } from "../types";

export interface WatchedChannel { key: string; playlistId: string; channel: Channel; watchedAt: number; }
interface AppState {
  playlists: Playlist[];
  favorites: string[];
  recentlyWatched: WatchedChannel[];
  epgPrograms: Record<string, EpgProgram[]>;
  addPlaylist: (playlist: Playlist) => void;
  replacePlaylist: (playlist: Playlist) => void;
  removePlaylist: (id: string) => void;
  toggleFavorite: (key: string) => void;
  recordWatch: (playlistId: string, channel: Channel) => void;
  setEpgPrograms: (programs: Record<string, EpgProgram[]>) => void;
}
export interface EpgProgram { channelId: string; title: string; description?: string; start: number; stop: number; }

export const useAppStore = create<AppState>()(persist((set) => ({
  playlists: [],
  favorites: [],
  recentlyWatched: [],
  epgPrograms: {},
  addPlaylist: (playlist) => set((state) => ({ playlists: [...state.playlists.filter(item => item.id !== playlist.id), playlist] })),
  replacePlaylist: (playlist) => set((state) => ({ playlists: state.playlists.map(item => item.id === playlist.id ? playlist : item) })),
  removePlaylist: (id) => set((state) => ({
    playlists: state.playlists.filter(item => item.id !== id),
    favorites: state.favorites.filter(key => !key.startsWith(`${id}:`)),
    recentlyWatched: state.recentlyWatched.filter(item => item.playlistId !== id)
  })),
  toggleFavorite: (key) => set((state) => ({ favorites: state.favorites.includes(key) ? state.favorites.filter(item => item !== key) : [...state.favorites, key] })),
  recordWatch: (playlistId, channel) => set((state) => {
    const key = `${playlistId}:${channel.id}`;
    return { recentlyWatched: [{ key, playlistId, channel, watchedAt: Date.now() }, ...state.recentlyWatched.filter(item => item.key !== key)].slice(0, 30) };
  }),
  setEpgPrograms: (epgPrograms) => set({ epgPrograms })
}), { name: "tg-iptv-library-v1", storage: createJSONStorage(() => localStorage), partialize: (state) => ({
  playlists: state.playlists, favorites: state.favorites, recentlyWatched: state.recentlyWatched
}) }));
