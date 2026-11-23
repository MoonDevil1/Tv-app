import type { StreamHeaders } from "./models";

type DesktopUpdateState = {
  status: "idle" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | "unsupported";
  version?: string;
  percent?: number;
  message?: string;
};

declare global {
  interface Window {
    tvApp?: {
      platform(): Promise<string>;
      reportDiagnostic(report: Record<string, unknown>): Promise<{ saved: boolean }>;
      openFeedbackReport(report: Record<string, unknown>): Promise<{ opened: boolean }>;
      fetchRemoteText(url: string, headers?: StreamHeaders, requestId?: string): Promise<{ text: string; url: string; status: number }>;
      cancelRemoteText(requestId: string): Promise<{ cancelled: boolean }>;
      setStreamRequestContext(context: { originUrl: string; headers: StreamHeaders; licenseUrl?: string; licenseHeaders?: StreamHeaders } | null): Promise<{ active: boolean }>;
      getUpdateState(): Promise<DesktopUpdateState>;
      checkForUpdates(): Promise<{ accepted: boolean }>;
      downloadUpdate(): Promise<{ accepted: boolean }>;
      installUpdate(): Promise<{ accepted: boolean }>;
      onUpdateState(listener: (state: DesktopUpdateState) => void): () => void;
    };
  }
}
export {};
