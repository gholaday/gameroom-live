import { describe, expect, it } from "vitest";
import { preferCodec } from "./codecs";

describe("preferCodec", () => {
  const codecs = [{ mimeType: "video/VP8" }, { mimeType: "video/H264", p: 1 }, { mimeType: "video/rtx" }, { mimeType: "video/H264", p: 2 }];

  it("moves every matching profile first and keeps the rest in order", () => {
    expect(preferCodec(codecs, "video/h264")).toEqual([codecs[1], codecs[3], codecs[0], codecs[2]]);
  });

  it("leaves the list alone when the codec is missing", () => {
    expect(preferCodec(codecs, "video/AV1")).toBe(codecs);
  });
});
