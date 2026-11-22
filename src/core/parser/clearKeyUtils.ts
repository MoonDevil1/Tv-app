import type { DrmConfig } from "../types";

const HEX_128 = /^[0-9a-f]{32}$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export function hexToBase64Url(hex: string): string {
  const clean = hex.trim().replace(/^0x/i, "");
  if (!HEX_128.test(clean)) throw new TypeError("ClearKey hex values must be exactly 128 bits.");
  const bytes = Uint8Array.from(clean.match(/.{2}/g)!, pair => Number.parseInt(pair, 16));
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeBase64Url(value: string): string {
  const clean = value.trim().replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  if (!BASE64URL.test(clean) || clean.length !== 22) throw new TypeError("ClearKey values must encode exactly 128 bits.");
  const standard = clean.replace(/-/g, "+").replace(/_/g, "/");
  if (atob(standard + "==").length !== 16) throw new TypeError("ClearKey values must encode exactly 128 bits.");
  return clean;
}

function normalizeKeyMaterial(value: string): string {
  const clean = value.trim().replace(/^0x/i, "");
  const compactHex = clean.replace(/-/g, "");
  return HEX_128.test(compactHex) ? hexToBase64Url(compactHex) : normalizeBase64Url(clean);
}

function parseJwk(raw: string): Record<string, string> {
  const parsed = JSON.parse(raw) as { keys?: Array<{ kty?: string; kid?: string; k?: string }> };
  if (!Array.isArray(parsed.keys)) throw new TypeError("ClearKey JWK must contain a keys array.");
  const keys: Record<string, string> = {};
  for (const item of parsed.keys) {
    if (item.kty !== "oct" || typeof item.kid !== "string" || typeof item.k !== "string") {
      throw new TypeError("Only octet ClearKey JWK entries with kid and k are supported.");
    }
    keys[normalizeBase64Url(item.kid)] = normalizeBase64Url(item.k);
  }
  return keys;
}

export function parseClearKeys(input: string | Record<string, string>): Record<string, string> {
  if (typeof input !== "string") {
    return Object.fromEntries(Object.entries(input).map(([kid, key]) => [normalizeKeyMaterial(kid), normalizeKeyMaterial(String(key))]));
  }
  const raw = input.trim();
  if (!raw) return {};
  if (raw.startsWith("{")) return parseJwk(raw);
  if (raw.startsWith("data:")) {
    const comma = raw.indexOf(",");
    if (comma < 0) throw new TypeError("Malformed ClearKey data URI.");
    const meta = raw.slice(0, comma);
    const body = raw.slice(comma + 1);
    const decoded = meta.includes(";base64") ? atob(body) : decodeURIComponent(body);
    return parseJwk(decoded);
  }
  const keys: Record<string, string> = {};
  for (const pair of raw.split(/[;,]/).map(value => value.trim()).filter(Boolean)) {
    const separator = pair.indexOf(":");
    if (separator < 1) throw new TypeError("ClearKey entries must use keyId:key pairs.");
    const rawKid = pair.slice(0, separator);
    const rawKey = pair.slice(separator + 1);
    keys[normalizeKeyMaterial(rawKid)] = normalizeKeyMaterial(rawKey);
  }
  return keys;
}

export function createClearKeyDrm(type: string | undefined, license: string | undefined): DrmConfig | undefined {
  if (!type && !license) return undefined;
  const scheme = (type ?? "clearkey").toLowerCase();
  if (scheme.includes("widevine")) return license ? { scheme: "widevine", licenseUrl: license.trim() } : { scheme: "widevine" };
  if (!scheme.includes("clearkey")) return undefined;
  if (!license) return { scheme: "clearkey" };
  if (/^https?:\/\//i.test(license.trim())) return { scheme: "clearkey", licenseUrl: license.trim(), rawLicenseKey: license };
  return { scheme: "clearkey", clearKeys: parseClearKeys(license), rawLicenseKey: license };
}

export function clearKeyJwk(keys: Record<string, string>): string {
  return JSON.stringify({ keys: Object.entries(keys).map(([kid, k]) => ({ kty: "oct", kid, k, alg: "A128KW" })), type: "temporary" });
}

/** Convert non-standard ClearKey license bodies into the JWK response Shaka expects. */
export function normalizeClearKeyLicenseResponse(data: ArrayBuffer | ArrayBufferView<ArrayBufferLike>): Uint8Array | null {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const raw = new TextDecoder().decode(bytes).trim();
  if (!raw) return null;
  let input: string | Record<string, string> = raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | string | unknown[];
    if (typeof parsed === "string") input = parsed;
    else if (Array.isArray(parsed)) {
      const entries = parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
      input = Object.fromEntries(entries.map(item => [
        String(item.kid ?? item.keyId ?? item.key_id ?? ""),
        String(item.k ?? item.key ?? "")
      ]));
    } else if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.keys)) {
        const entries = parsed.keys.filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
        input = entries.every(item => item.kty === "oct" && typeof item.kid === "string" && typeof item.k === "string")
          ? raw
          : Object.fromEntries(entries.map(item => [
            String(item.kid ?? item.keyId ?? item.key_id ?? ""),
            String(item.k ?? item.key ?? "")
          ]));
      } else if (parsed.keys && typeof parsed.keys === "object") input = parsed.keys as Record<string, string>;
      else if ((parsed.keyId ?? parsed.kid) && (parsed.key ?? parsed.k)) {
        input = { [String(parsed.keyId ?? parsed.kid)]: String(parsed.key ?? parsed.k) };
      } else if (typeof parsed.license === "string") input = parsed.license;
      else if (typeof parsed.data === "string") input = parsed.data;
      else input = parsed as Record<string, string>;
    }
    const keys = typeof input === "string" ? parseClearKeys(input) : parseClearKeys(input);
    if (!Object.keys(keys).length) return null;
    return new TextEncoder().encode(clearKeyJwk(keys));
  } catch {
    return null;
  }
}
