import {
  clearInviteReturn,
  consumeInviteReturn,
  leaveCollabEntry,
  needsCollabEntry,
  rememberInviteReturn,
} from "./entryRoute";

const path =
  "/?collabStorage=supabase&invite=00000000-0000-4000-8000-000000000001#room=sc_aaaaaaaaaaaaaaaaaaaa,AAAAAAAAAAAAAAAAAAAAAA";
const key = "personal-cloud:invite-return:v1";
beforeEach(() => {
  window.history.replaceState({}, "", "/");
  sessionStorage.clear();
});
afterEach(() => {
  window.history.replaceState({}, "", "/");
  sessionStorage.clear();
});

it.each([
  "/?collabStorage=unknown",
  "/?invite=x",
  "/#room=sc_bad,key",
  "/#room=SC_bad,key",
])("blocks personal or malformed entry markers: %s", (value) => {
  expect(needsCollabEntry(new URL(value, location.origin).href)).toBe(true);
});
it.each([
  "/",
  "/#room=aaaaaaaaaaaaaaaaaaaa,AAAAAAAAAAAAAAAAAAAAAA",
  "/#json=id,key",
  "/?drawing=foo",
  "/#url=example",
])("preserves legacy route %s", (value) => {
  expect(needsCollabEntry(new URL(value, location.origin).href)).toBe(false);
});
it("normalizes return data and consumes it once", () => {
  rememberInviteReturn(
    new URL(path.replace("?", "?tracking=drop&"), location.origin).href,
    sessionStorage,
    100,
  );
  expect(consumeInviteReturn(sessionStorage, 101)).toBe(path);
  expect(consumeInviteReturn(sessionStorage, 101)).toBeNull();
});
it("discards expired data", () => {
  rememberInviteReturn(
    new URL(path, location.origin).href,
    sessionStorage,
    100,
  );
  expect(consumeInviteReturn(sessionStorage, 300100)).toBeNull();
});
it.each([
  `https://evil.test${path}`,
  `//evil.test${path}`,
  `/elsewhere${path.slice(1)}`,
  "broken",
])("discards unsafe or invalid returns: %s", (value) => {
  sessionStorage.setItem(key, JSON.stringify({ path: value, expiresAt: 200 }));
  expect(consumeInviteReturn(sessionStorage, 100)).toBeNull();
  expect(sessionStorage.getItem(key)).toBeNull();
});
it("rejects external-origin OAuth return storage", () => {
  expect(() => rememberInviteReturn(`https://evil.test${path}`)).toThrow();
  expect(sessionStorage.getItem(key)).toBeNull();
});
it("closes without triggering canvas initialization and preserves unrelated query", () => {
  window.history.replaceState({}, "", path.replace("?", "?lang=ko&"));
  const hash = vi.fn();
  window.addEventListener("hashchange", hash);
  leaveCollabEntry();
  expect(location.search).toBe("?lang=ko");
  expect(location.hash).toBe("");
  expect(hash).not.toHaveBeenCalled();
  window.removeEventListener("hashchange", hash);
});
it("explicitly clears a pending login return", () => {
  rememberInviteReturn(new URL(path, location.origin).href);
  clearInviteReturn();
  expect(consumeInviteReturn()).toBeNull();
});
