export {};
declare global { interface Window { tvApp: { loadPlaylist: () => Promise<string> } } }
