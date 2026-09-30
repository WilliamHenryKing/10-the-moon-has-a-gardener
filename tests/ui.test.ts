import { afterEach, describe, expect, test } from "bun:test";
import { clock } from "../src/ui/clock";
import { banner, hud, say } from "../src/ui/hud-store";

afterEach(() => hud.reset());

describe("mission clock readouts", () => {
  test("rounded seconds carry into the next minute instead of showing :60", () => {
    expect(clock(59.9)).toBe("1:00");
    expect(clock(119.9)).toBe("2:00");
    expect(clock(18 * 60)).toBe("18:00");
    expect(clock(60.1)).toBe("1:00");
  });
  test("expired or invalid clocks render a stable zero", () => {
    for (const value of [-1, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(clock(value)).toBe("0:00");
    }
  });
});

describe("clean HUD ownership", () => {
  test("reset clears guide, ending, controls, readiness and messages with fresh inventory", () => {
    hud.reset();
    const first = hud.get();
    hud.set({
      ready: true,
      reduced: true,
      controls: true,
      shipLanded: true,
      guide: { text: "Plant" },
      ending: { medal: "silver", minutes: 3, plants: 5, species: 1 },
      known: ["mooncress"],
      seeds: { ...first.seeds, mooncress: 9 },
    });
    say("Suit", "old mission");
    banner("old milestone", "old sub");
    let notifications = 0;
    const unsubscribe = hud.subscribe(() => notifications++);
    hud.reset();
    expect(notifications).toBe(1);
    unsubscribe();
    const next = hud.get();
    expect(next).toMatchObject({
      ready: false,
      reduced: false,
      controls: false,
      shipLanded: false,
      guide: null,
      ending: null,
      banner: null,
      radio: [],
      known: [],
    });
    expect(next.seeds).not.toBe(first.seeds);
    expect(next.seeds.mooncress).toBe(0);
    expect(next.known).not.toBe(first.known);
  });

  test("new mission radio and banner IDs reset, and only the last three radio lines remain", () => {
    hud.reset();
    for (let i = 0; i < 5; i++) say("Mission Control", `line ${i}`);
    expect(hud.get().radio.map((line) => line.id)).toEqual([3, 4, 5]);
    banner("one", "first");
    banner("two", "second");
    expect(hud.get().banner?.id).toBe(2);
    hud.reset();
    say("Suit", "fresh");
    banner("new", "mission");
    expect(hud.get().radio[0]?.id).toBe(1);
    expect(hud.get().banner?.id).toBe(1);
  });
});
