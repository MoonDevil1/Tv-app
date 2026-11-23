import test from "node:test";
import assert from "node:assert/strict";
import { parseXmltv, parseXmltvDate } from "../src/core/epg/xmltv";
import type { TvChannel } from "../src/app/models";

const channels: TvChannel[] = [
  { id: "liveid:165", tvgId: "zee.cinema", name: "Zee Cinema HD", group: "Movies", sources: [], rawAttributes: {} },
  { id: "tvg:1839", tvgId: "pictures", name: "&Pictures HD", group: "Movies", sources: [], rawAttributes: {} }
];

test("parses XMLTV programme times with explicit timezone offsets", () => {
  assert.equal(parseXmltvDate("20261122120000 +0000"), Date.UTC(2026, 10, 22, 12));
  assert.equal(parseXmltvDate("20261122173000 +0530"), Date.UTC(2026, 10, 22, 12));
  assert.equal(parseXmltvDate("invalid"), undefined);
});

test("matches XMLTV IDs and unique display names, decodes entities and sorts schedules", () => {
  const xml = `<?xml version="1.0"?>
  <tv>
    <channel id="zee.cinema"><display-name>Zee Cinema</display-name></channel>
    <channel id="Pictures"><display-name>&amp;Pictures</display-name></channel>
    <programme start="20261122130000 +0000" stop="20261122140000 +0000" channel="zee.cinema"><title>Later &amp; Better</title><desc><![CDATA[An action & drama]]></desc></programme>
    <programme start="20261122120000 +0000" stop="20261122130000 +0000" channel="zee.cinema"><title>Morning Show</title></programme>
    <programme start="20261122120000 +0000" stop="20261122130000 +0000" channel="Pictures"><title>Movie Night</title></programme>
  </tv>`;
  const guide = parseXmltv(xml, channels);
  assert.deepEqual(guide["zee.cinema"].map(p => p.title), ["Morning Show", "Later & Better"]);
  assert.equal(guide["zee.cinema"][1].description, "An action & drama");
  assert.equal(guide["liveid:165"].length, 2);
  assert.equal(guide.pictures[0].title, "Movie Night");
  assert.equal(guide["tvg:1839"].length, 1);
});

test("rejects non-XMLTV data and ignores ambiguous channel-name matches", () => {
  assert.throws(() => parseXmltv("not xml", channels), /XMLTV/);
  const duplicate = [...channels, { ...channels[0], id: "duplicate" }];
  const xml = `<tv><channel id="unknown"><display-name>Zee Cinema</display-name></channel><programme start="20261122120000 +0000" stop="20261122130000 +0000" channel="unknown"><title>Should not map</title></programme></tv>`;
  assert.deepEqual(parseXmltv(xml, duplicate), {});
});
