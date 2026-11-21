import type { EpgProgram } from "../store/appStore";

export function parseXmltvDate(value: string): number {
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?\s*$/);
  if (!match) return Number.NaN;
  const [, y, mo, d, h, mi, s, sign, oh = "00", om = "00"] = match;
  const year = +y, month = +mo, day = +d, hour = +h, minute = +mi, second = +s;
  const offsetHour = +oh, offsetMinute = +om;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59 ||
      offsetHour > 23 || offsetMinute > 59) return Number.NaN;
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(utc);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return Number.NaN;
  const offset = (offsetHour * 60 + offsetMinute) * 60_000 * (sign === "+" ? 1 : -1);
  return utc - offset;
}

export function parseXmltv(xml: string): Record<string, EpgProgram[]> {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The EPG file is not valid XMLTV.");
  const result: Record<string, EpgProgram[]> = {};
  for (const node of Array.from(document.querySelectorAll("programme"))) {
    const channelId = node.getAttribute("channel") ?? "";
    const start = parseXmltvDate(node.getAttribute("start") ?? "");
    const stop = parseXmltvDate(node.getAttribute("stop") ?? "");
    const title = node.querySelector("title")?.textContent?.trim() ?? "";
    if (!channelId || !title || !Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) continue;
    const description = node.querySelector("desc")?.textContent?.trim() || undefined;
    (result[channelId] ??= []).push({ channelId, title, description, start, stop });
  }
  for (const programs of Object.values(result)) programs.sort((a, b) => a.start - b.start);
  return result;
}

export function currentAndNext(programs: EpgProgram[] = [], now = Date.now()): { current?: EpgProgram; next?: EpgProgram } {
  return {
    current: programs.find(program => program.start <= now && program.stop > now),
    next: programs.find(program => program.start > now)
  };
}


type LiveTgProgramme = {
  title?: unknown;
  start?: unknown;
  stop?: unknown;
  startTime?: unknown;
  stopTime?: unknown;
  desc?: unknown;
  description?: unknown;
};

function guideTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

export function parseLiveTgGuide(payload: unknown, channelId: string): EpgProgram[] {
  if (!payload || typeof payload !== "object" || !channelId) return [];
  const data = payload as { nowPlaying?: LiveTgProgramme | null; upNext?: LiveTgProgramme | null; upcoming?: LiveTgProgramme[]; guide?: LiveTgProgramme[] };
  const entries = [...(Array.isArray(data.guide) ? data.guide : []), ...(Array.isArray(data.upcoming) ? data.upcoming : []), data.nowPlaying, data.upNext].filter((item): item is LiveTgProgramme => !!item && typeof item === "object");
  const unique = new Map<string, EpgProgram>();
  for (const item of entries) {
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const start = guideTimestamp(item.start ?? item.startTime);
    const stop = guideTimestamp(item.stop ?? item.stopTime);
    if (!title || !Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) continue;
    const program: EpgProgram = { channelId, title, description: typeof (item.desc ?? item.description) === "string" ? String(item.desc ?? item.description).trim() || undefined : undefined, start, stop };
    unique.set(`${start}:${stop}:${title}`, program);
  }
  return [...unique.values()].sort((a, b) => a.start - b.start);
}
