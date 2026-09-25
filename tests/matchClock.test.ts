import { describe, expect, it } from "vitest";
import { deriveClockState, isBettingOpen } from "@/lib/domain/matchClock";

const KICKOFF = new Date("2026-11-14T14:00:00Z").getTime();
const MIN = 60_000;
const open = { status: "open" as const, kickoffAt: KICKOFF };

describe("deriveClockState", () => {
  it("shows the kickoff time before kickoff", () => {
    expect(deriveClockState(open, KICKOFF - 5 * MIN).phase).toBe("upcoming");
  });

  it("reads 1' at the instant of kickoff", () => {
    const s = deriveClockState(open, KICKOFF);
    expect(s.phase).toBe("first_half");
    expect(s.display).toBe("1'");
    expect(s.isLive).toBe(true);
  });

  it("reads mid first half correctly", () => {
    expect(deriveClockState(open, KICKOFF + 30 * MIN).display).toBe("30'");
  });

  it("shows added time once regulation first-half time is passed", () => {
    expect(deriveClockState(open, KICKOFF + 46 * MIN).display).toBe("45+1'");
  });

  it("switches to HT after 45+2", () => {
    const s = deriveClockState(open, KICKOFF + 47 * MIN);
    expect(s.phase).toBe("halftime");
    expect(s.display).toBe("HT");
    expect(s.isLive).toBe(false);
  });

  it("stays HT for the full 15-minute countdown", () => {
    expect(deriveClockState(open, KICKOFF + 61 * MIN).phase).toBe("halftime");
  });

  it("resumes second half at 46'", () => {
    const s = deriveClockState(open, KICKOFF + 62 * MIN);
    expect(s.phase).toBe("second_half");
    expect(s.display).toBe("46'");
    expect(s.isLive).toBe(true);
  });

  it("reaches 90' correctly", () => {
    expect(deriveClockState(open, KICKOFF + 106 * MIN).display).toBe("90'");
  });

  it("shows second-half added time before FT", () => {
    expect(deriveClockState(open, KICKOFF + 108 * MIN).display).toBe("90+2'");
  });

  it("reaches FT after 45+2 / HT / 45+2 have all elapsed (109 minutes)", () => {
    const s = deriveClockState(open, KICKOFF + 109 * MIN);
    expect(s.phase).toBe("full_time");
    expect(s.display).toBe("FT");
    expect(s.isLive).toBe(false);
  });

  it("stays FT indefinitely until the admin settles or voids it", () => {
    expect(deriveClockState(open, KICKOFF + 5 * 24 * 60 * MIN).phase).toBe("full_time");
  });

  it("settled/voided/postponed always override the clock, even mid-match", () => {
    expect(deriveClockState({ status: "settled", kickoffAt: KICKOFF }, KICKOFF + 10 * MIN).display).toBe("FT");
    expect(deriveClockState({ status: "voided", kickoffAt: KICKOFF }, KICKOFF + 10 * MIN).phase).toBe("final");
    expect(deriveClockState({ status: "postponed", kickoffAt: KICKOFF }, KICKOFF + 10 * MIN).display).toBe("POSTPONED");
  });
});

describe("isBettingOpen", () => {
  it("is open when status is open and kickoff hasn't happened", () => {
    expect(isBettingOpen(open, KICKOFF - MIN)).toBe(true);
  });

  it("closes automatically at the instant of kickoff, even if admin never closed it", () => {
    expect(isBettingOpen(open, KICKOFF)).toBe(false);
    expect(isBettingOpen(open, KICKOFF + MIN)).toBe(false);
  });

  it("is never open for a non-open status", () => {
    expect(isBettingOpen({ status: "scheduled", kickoffAt: KICKOFF }, KICKOFF - MIN)).toBe(false);
    expect(isBettingOpen({ status: "live", kickoffAt: KICKOFF }, KICKOFF - MIN)).toBe(false);
  });
});
