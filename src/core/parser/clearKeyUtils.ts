import type { DrmConfig } from "../types";

const HEX = /^[0-9a-f]+$/i;
const B64URL = /^[A-Za-z0-9_-]+$/;

export function hexToBase64Url(hex: string): string {
  const clean = hex.trim().replace(/^0x/i, "");
  if (!clean || clean.length % 2 || !HEX.test(clean)) throw new TypeError("Invalid hexadecimal ClearKey value.");
  const bytes = Uint8Array.from(clean.match(/.{2}/g)!, pair => parseInt(pair, 16));
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function normalizeKey(value: string): string {
  const clean = value.trim().replace(/^0x/i, "");
  if (HEX.test(clean) && clean.length % 2 === 0) return hexToBase64Url(clean);
  if (B64URL.test(clean)) return clean.replace(/=+$/g, "");
  throw new TypeError("ClearKey values must be hexadecimal or base64url.");
}

export function parseClearKeys(input: string | Record<string, string>): Record<string, string> {
  if (typeof input !== "string") {
    return Object.fromEntries(Object.entries(input).map(([kid, key]) => [normalizeKey(kid), normalizeKey(key)]));
  }
  const raw = input.trim();
  if (!raw) return {};
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw) as { keys?: Array<{ kid: string; k: string }> };
    if (Array.isArray(parsed.keys)) return Object.fromEntries(parsed.keys.map(item => [normalizeKey(item.kid), normalizeKey(item.k)]));
    throw new TypeError("ClearKey JSON must contain a keys array.");
  }
  const pairs = raw.split(",").map(pair => pair.trim()).filter(Boolean);
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const separator = pair.indexOf(":");
    if (separator < 1) throw new TypeError("ClearKey entries must use keyId:key pairs.");
    result[normalizeKey(pair.slice(0, separator))] = normalizeKey(pair.slice(separator + 1));
  }
  return result;
}

export function createClearKeyDrm(licenseType: string | undefined, licenseKey: string | undefined): DrmConfig | undefined {
  if (!licenseType && !licenseKey) return undefined;
  if ((licenseType ?? "clearkey").toLowerCase() !== "clearkey") return undefined;
  if (!licenseKey) return { scheme: "clearkey" };
  if (/^https?:\/\//i.test(licenseKey.trim())) return { scheme: "clearkey", licenseUrl: licenseKey.trim() };
  return { scheme: "clearkey", clearKeys: parseClearKeys(licenseKey) };
}
