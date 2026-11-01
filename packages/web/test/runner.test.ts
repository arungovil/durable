import { describe, expect, it, vi } from "vitest";

vi.mock("@durable/client/create", () => ({
  createCell: async () => ({
    ok: true,
    value: "3f2b8c1e-5d4a-4b7e-9c10-1a2b3c4d5e6f",
  }),
}));

import { matchCommands, parseCommand } from "../src/commands.ts";
import { createRunner, type Notice } from "../src/runner.ts";

const ID = "3f2b8c1e-5d4a-4b7e-9c10-1a2b3c4d5e6f";

function setup(init: { name?: string; cellId?: string; connected?: boolean }) {
  const state = { name: init.name ?? "", cellId: init.cellId ?? "" };
  const notices: Notice[] = [];
  const send = vi.fn(() => init.connected ?? true);
  const run = createRunner({
    ...state,
    setName: (n) => {
      state.name = n;
    },
    setCellId: (id) => {
      state.cellId = id;
    },
    send,
    notify: (n) => notices.push(n),
  });
  return { state, notices, send, run };
}

describe("parseCommand", () => {
  it("splits name and argument, and ignores plain text", () => {
    expect(parseCommand("/join  abc ")).toEqual({ name: "join", arg: "abc" });
    expect(parseCommand("/leave")).toEqual({ name: "leave", arg: "" });
    expect(parseCommand("hello /join")).toBeUndefined();
  });
});

describe("matchCommands", () => {
  const names = (t: string) => matchCommands(t).map((c) => c.name);
  it("offers every command for a bare slash and filters by prefix", () => {
    expect(names("/")).toHaveLength(3);
    expect(names("/j")).toEqual(["join"]);
    expect(names("/x")).toEqual([]);
  });
  it("closes once past the name or when a no-argument command is complete", () => {
    expect(names("/join ")).toEqual([]);
    expect(names("/create")).toEqual([]);
    expect(names("/leave")).toEqual([]);
    expect(names("hi /")).toEqual([]);
    expect(names("/join")).toEqual(["join"]);
  });
});

describe("createRunner", () => {
  it("needs a name for /create and /join when none is remembered", async () => {
    const { run, state, notices } = setup({});
    expect(await run(`/join ${ID}`)).toBe(false);
    expect(await run("/create")).toBe(false);
    expect(state.cellId).toBe("");
    expect(notices.at(-1)?.text).toMatch(/your name/);
  });

  it("rejects a bad name and changes nothing", async () => {
    const { run, state } = setup({});
    expect(await run("/create a:b")).toBe(false);
    expect(await run(`/join ${ID} a:b`)).toBe(false);
    expect(await run("/create two words")).toBe(false);
    expect(state).toEqual({ name: "", cellId: "" });
  });

  it("creates and joins with a name, and remembers it", async () => {
    const { run, state } = setup({});
    expect(await run("/create ann")).toBe(true);
    expect(state).toEqual({ name: "ann", cellId: ID });
    expect(await run(`/join ${ID} bob`)).toBe(true);
    expect(state.name).toBe("bob");
  });

  it("uses the remembered name when none is given", async () => {
    const { run, state } = setup({ name: "ann" });
    expect(await run(`/join ${ID}`)).toBe(true);
    expect(state).toEqual({ name: "ann", cellId: ID });
  });

  it("keeps the current cell when a join is bad", async () => {
    const { run, state } = setup({ name: "ann", cellId: ID });
    expect(await run("/join nonsense")).toBe(false);
    expect(await run(`/join ${ID} bob extra`)).toBe(false);
    expect(state).toEqual({ name: "ann", cellId: ID });
  });

  it("leaves only when in a cell", async () => {
    expect(await setup({ name: "ann" }).run("/leave")).toBe(false);
    const s = setup({ name: "ann", cellId: ID });
    expect(await s.run("/leave")).toBe(true);
    expect(s.state.cellId).toBe("");
  });

  it("sends plain text only inside a cell, and keeps it when disconnected", async () => {
    const out = setup({ name: "ann" });
    expect(await out.run("hi")).toBe(false);
    expect(out.send).not.toHaveBeenCalled();

    const down = setup({ name: "ann", cellId: ID, connected: false });
    expect(await down.run("hi")).toBe(false);

    const up = setup({ name: "ann", cellId: ID });
    expect(await up.run("hi")).toBe(true);
    expect(up.send).toHaveBeenCalledWith("hi");
  });

  it("rejects unknown commands", async () => {
    expect(await setup({}).run("/nope")).toBe(false);
  });
});
