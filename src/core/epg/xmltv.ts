import type { EpgProgramme, TvChannel } from "../../app/models";

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([\da-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number: string) => String.fromCodePoint(Number(number)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&").trim();
}
function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(['\"])(.*?)\\1", "i"));
  return match?.[2] ? decodeXml(match[2]) : "";
}
export function parseXmltvDate(value: string): number | undefined {
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-])(\d{2})(\d{2}))?/);
  if (!match) return;
  const [, y, mo, d, h, mi, sec, sign, offH, offM] = match;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec));
  if (!sign) return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)).getTime();
  const offset = (Number(offH) * 60 + Number(offM)) * 60000 * (sign === "+" ? 1 : -1);
  return utc - offset;
}
function channelName(channel: TvChannel): string {
  return channel.name.toLowerCase().replace(/\b(?:hd|fhd|uhd|4k)\b/g, "").replace(/[^a-z0-9]/g, "");
}
export function parseXmltv(xml: string, channels: TvChannel[]): Record<string, EpgProgramme[]> {
  if (!/<tv(?:\s|>)/i.test(xml)) throw new Error("The EPG response is not a valid XMLTV document.");
  const byId = new Map<string, TvChannel[]>();
  const byName = new Map<string, TvChannel[]>();
  for (const channel of channels) {
    for (const id of [channel.tvgId, channel.id].filter(Boolean) as string[]) {
      const list = byId.get(id) ?? []; list.push(channel); byId.set(id, list);
    }
    const name = channelName(channel);
    if (name) { const list = byName.get(name) ?? []; list.push(channel); byName.set(name, list); }
  }
  const xmlNames = new Map<string, string>();
  for (const match of xml.matchAll(/<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi)) {
    const id = attribute(match[1], "id");
    const display = match[2].match(/<display-name\b[^>]*>([\s\S]*?)<\/display-name>/i)?.[1];
    if (id && display) xmlNames.set(id, decodeXml(display.replace(/<[^>]+>/g, "")));
  }
  const result: Record<string, EpgProgramme[]> = {};
  for (const match of xml.matchAll(/<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi)) {
    const channelId = attribute(match[1], "channel");
    const start = parseXmltvDate(attribute(match[1], "start"));
    const stop = parseXmltvDate(attribute(match[1], "stop"));
    if (!channelId || !start || !stop || stop <= start) continue;
    const body = match[2];
    const title = body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    if (!title) continue;
    const description = body.match(/<desc\b[^>]*>([\s\S]*?)<\/desc>/i)?.[1];
    let matches = byId.get(channelId) ?? [];
    if (!matches.length) {
      const name = channelName({ name: xmlNames.get(channelId) ?? "", id: "", group: "", sources: [], rawAttributes: {} });
      matches = byName.get(name) ?? [];
    }
    if (matches.length !== 1) continue;
    const programme: EpgProgramme = { channelId, title: decodeXml(title.replace(/<[^>]+>/g, "")), description: description ? decodeXml(description.replace(/<[^>]+>/g, "")) : undefined, start, stop };
    const channel = matches[0];
    for (const key of [channel.tvgId, channel.id].filter(Boolean) as string[]) (result[key] ??= []).push(programme);
  }
  for (const items of Object.values(result)) items.sort((a, b) => a.start - b.start);
  return result;
}
