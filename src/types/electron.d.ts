export {};

declare global {
  type DesktopUpdateState = {
    status: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "unsupported";
    version?: string;
    percent?: number;
    message?: string;
  };

  interface Window {
    tvApp?: {
      platform: () => Promise<string>;
      setStreamRequestContext: (context: { originUrl: string; headers: Record<string, string> } | null) => Promise<{ active: boolean }>;
      getUpdateState: () => Promise<DesktopUpdateState>;
      checkForUpdates: () => Promise<{ accepted: boolean }>;
      downloadUpdate: () => Promise<{ accepted: boolean }>;
      installUpdate: () => Promise<{ accepted: boolean }>;
      onUpdateState: (listener: (state: DesktopUpdateState) => void) => () => void;
    };
  }
}
