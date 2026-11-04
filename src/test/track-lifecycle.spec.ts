import { describe, expect, it } from "vitest";
import { deriveLifecycleEvents, trackColor } from "../panels/track-debugger";
import type { TrackFrame } from "../panels/track-debugger";

const frames: TrackFrame[] = [
  {
    frame: 0,
    timestampNs: 0,
    tracks: [
      { track_id: 1, bbox: [10, 10, 60, 120], class_id: 0, confidence: 0.9, time_since_update: 0, hit_streak: 1, is_confirmed: false },
      { track_id: 2, bbox: [200, 80, 260, 190], class_id: 1, confidence: 0.5, time_since_update: 0, hit_streak: 1, is_confirmed: false },
    ],
  },
  {
    frame: 1,
    timestampNs: 200_000_000,
    tracks: [
      { track_id: 1, bbox: [12, 10, 64, 120], class_id: 0, confidence: 0.92, time_since_update: 0, hit_streak: 2, is_confirmed: true },
      { track_id: 2, bbox: [202, 80, 262, 190], class_id: 1, confidence: 0.4, time_since_update: 1, hit_streak: 1, is_confirmed: false },
    ],
  },
  {
    frame: 2,
    timestampNs: 400_000_000,
    tracks: [
      { track_id: 1, bbox: [14, 10, 66, 120], class_id: 0, confidence: 0.93, time_since_update: 0, hit_streak: 3, is_confirmed: true },
    ],
  },
];

describe("deriveLifecycleEvents", () => {
  it("derives birth, confirm, occlusion, and drop events in time order", () => {
    const evs = deriveLifecycleEvents(frames);
    expect(evs.map((e) => `${e.trackId}:${e.kind}`)).toEqual([
      "1:born",
      "2:born",
      "1:confirmed",
      "2:occluded",
      "2:dropped",
    ]);
  });

  it("orders events by timestamp", () => {
    const evs = deriveLifecycleEvents(frames);
    const ts = evs.map((e) => e.timestampNs);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });

  it("colors are stable per track id", () => {
    expect(trackColor(1)).toBe(trackColor(1));
    expect(trackColor(1)).not.toBe(trackColor(2));
  });
});
