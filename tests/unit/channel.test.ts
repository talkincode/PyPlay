import { describe, expect, it } from "vitest";
import { ChannelReader, ChannelWriter, createChannelBuffer } from "../../src/engines/channel";

describe("SharedArrayBuffer channel", () => {
  it("delivers messages in order and drains them", () => {
    const sab = createChannelBuffer();
    const w = new ChannelWriter(sab);
    const r = new ChannelReader(sab);
    w.send({ k: "input", v: "你好" });
    w.send({ k: "event", e: { type: "key", press: true, keysym: "Up", char: "" } });
    w.send({ k: "stop" });
    expect(r.take()).toEqual([
      { k: "input", v: "你好" },
      { k: "event", e: { type: "key", press: true, keysym: "Up", char: "" } },
      { k: "stop" },
    ]);
    expect(r.take()).toEqual([]);
  });

  it("times out when nothing arrives", () => {
    const r = new ChannelReader(createChannelBuffer());
    const t0 = performance.now();
    expect(r.wait(30)).toEqual([]);
    expect(performance.now() - t0).toBeGreaterThanOrEqual(25);
  });
});
