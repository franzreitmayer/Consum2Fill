import { API_PATHS, adminUserPath } from "@c2r/shared";
import type { Express } from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { hashPassword, verifyPassword } from "../auth/passwords.js";
import { createSeededContext, loginAs } from "../testSupport.js";

vi.mock("../auth/passwords.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth/passwords.js")>();
  return {
    ...actual,
    hashPassword: vi.fn(actual.hashPassword),
    verifyPassword: vi.fn(actual.verifyPassword),
  };
});

const CHANGED_PASSWORD = "passwort-des-wechsels";
const RESET_PASSWORD = "passwort-des-resets";

type Agent = ReturnType<typeof request.agent>;
type AsyncFunction<Args extends unknown[], Result> = (...args: Args) => Promise<Result>;

// Stops one operation at a known point, until the test has run another one through.
interface Hold {
  reached: Promise<void>;
  release: () => void;
}

function createSignal() {
  let resolve = () => undefined as void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve() };
}

function wrapWithHold<Args extends unknown[], Result>(
  original: AsyncFunction<Args, Result>,
): { hold: Hold; held: AsyncFunction<Args, Result> } {
  const reached = createSignal();
  const gate = createSignal();
  return {
    hold: { reached: reached.promise, release: gate.resolve },
    held: async (...args) => {
      reached.resolve();
      await gate.promise;
      return original(...args);
    },
  };
}

function holdNextHashing<Args extends unknown[], Result>(
  mock: Mock<AsyncFunction<Args, Result>>,
): Hold {
  const original = mock.getMockImplementation();
  if (!original) throw new Error("The mock has no implementation");
  const { hold, held } = wrapWithHold(original);
  mock.mockImplementationOnce(held);
  return hold;
}

function holdNextStoreCall<Method extends string, Call extends AsyncFunction<never[], unknown>>(
  store: Record<Method, Call>,
  method: Method,
): Hold {
  const original = store[method];
  const { hold, held } = wrapWithHold(original as unknown as AsyncFunction<unknown[], unknown>);
  const once: AsyncFunction<unknown[], unknown> = (...args) => {
    store[method] = original;
    return held(...args);
  };
  store[method] = once as unknown as Call;
  return hold;
}

function nextHashFinished(): Promise<void> {
  const mock = vi.mocked(hashPassword);
  const original = mock.getMockImplementation();
  if (!original) throw new Error("The mock has no implementation");
  const finished = createSignal();
  mock.mockImplementationOnce(async (password) => {
    const hash = await original(password);
    finished.resolve();
    return hash;
  });
  return finished.promise;
}

// Lets a request that came through its hashing run as far as it can. It must end up waiting for the
// lock, which cannot be observed from outside. The time only matters when the lock is missing: the
// write then happens first and the test fails. With the lock, the result does not depend on it.
async function untilPastHashing(finished: Promise<void>): Promise<void> {
  await finished;
  await new Promise((resolve) => setTimeout(resolve, 50));
}

// Supertest only sends a request once it is awaited
function send<Response>(pending: PromiseLike<Response>): Promise<Response> {
  return Promise.resolve(pending);
}

function login(target: Express | Agent, username: string, password: string) {
  const agent = typeof target === "function" ? request(target) : target;
  return agent.post(API_PATHS.login).send({ username, password });
}

function changeOwn(agent: Agent, currentPassword = "user", newPassword = CHANGED_PASSWORD) {
  return agent.put(API_PATHS.ownPassword).send({ currentPassword, newPassword });
}

async function createRaceContext() {
  const context = await createSeededContext();
  const user = await context.stores.users.findByUsername("user");
  if (!user) throw new Error("The seeded user is missing");
  return {
    ...context,
    user,
    sessionsOfUser: () =>
      context.stores.sessions.all().filter((session) => session.userId === user.id),
    reset: (admin: Agent, password = RESET_PASSWORD) =>
      admin.put(`${adminUserPath(user.id)}/password`).send({ password }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("login during a password change", () => {
  it("opens no session when the password changes while it is verified", async () => {
    const { app, sessionsOfUser } = await createRaceContext();
    const changer = await loginAs(app, "user");

    const hold = holdNextHashing(vi.mocked(verifyPassword));
    const loggingIn = send(login(app, "user", "user"));
    await hold.reached;
    expect((await changeOwn(changer)).status).toBe(200);
    hold.release();
    const res = await loggingIn;

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Benutzername oder Passwort ist falsch." });
    expect(res.get("Set-Cookie")).toBeUndefined();
    expect(sessionsOfUser()).toHaveLength(1);
    expect((await changer.get(API_PATHS.me)).status).toBe(200);
  });

  it("orders the session of the login ahead of the deletion by the change", async () => {
    const { app, stores, sessionsOfUser } = await createRaceContext();
    const changer = await loginAs(app, "user");
    const loginAgent = request.agent(app);

    const hold = holdNextStoreCall(stores.sessions, "create");
    const loggingIn = send(login(loginAgent, "user", "user"));
    await hold.reached;
    const hashed = nextHashFinished();
    const changing = send(changeOwn(changer));
    await untilPastHashing(hashed);
    hold.release();
    const [loginRes, changeRes] = await Promise.all([loggingIn, changing]);

    expect(loginRes.status).toBe(200);
    expect(changeRes.status).toBe(200);
    expect((await loginAgent.get(API_PATHS.me)).status).toBe(401);
    expect(sessionsOfUser()).toHaveLength(1);
  });

  it("returns the freshly read user", async () => {
    const { app, stores, user } = await createRaceContext();

    const hold = holdNextHashing(vi.mocked(verifyPassword));
    const loggingIn = send(login(app, "user", "user"));
    await hold.reached;
    await stores.users.update(user.id, { displayName: "Neuer Name" });
    hold.release();
    const res = await loggingIn;

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe("Neuer Name");
  });
});

describe("own password change during an admin reset", () => {
  it("answers 400 when the reset lands while the new hash is computed", async () => {
    const { app, stores, sessionsOfUser, reset } = await createRaceContext();
    const admin = await loginAs(app, "admin");
    const changer = await loginAs(app, "user");
    const passwordHashBefore = (await stores.users.findByUsername("user"))?.passwordHash;

    const hold = holdNextHashing(vi.mocked(hashPassword));
    const changing = send(changeOwn(changer));
    await hold.reached;
    expect((await reset(admin)).status).toBe(204);
    hold.release();
    const res = await changing;

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "Das aktuelle Passwort ist falsch." });
    expect(res.get("Set-Cookie")).toBeUndefined();
    expect((await stores.users.findByUsername("user"))?.passwordHash).not.toBe(passwordHashBefore);
    expect(sessionsOfUser()).toEqual([]);
    expect((await changer.get(API_PATHS.me)).status).toBe(401);
    expect((await login(app, "user", CHANGED_PASSWORD)).status).toBe(401);
    expect((await login(app, "user", RESET_PASSWORD)).status).toBe(200);
  });

  it("answers 400 when the reset lands while the current password is verified", async () => {
    const { app, sessionsOfUser, reset } = await createRaceContext();
    const admin = await loginAs(app, "admin");
    const changer = await loginAs(app, "user");

    const hold = holdNextHashing(vi.mocked(verifyPassword));
    const changing = send(changeOwn(changer));
    await hold.reached;
    expect((await reset(admin)).status).toBe(204);
    hold.release();

    expect((await changing).status).toBe(400);
    expect(sessionsOfUser()).toEqual([]);
    expect((await login(app, "user", RESET_PASSWORD)).status).toBe(200);
  });
});

describe("admin reset during an own password change", () => {
  it("wins when the change completes while the reset hash is computed", async () => {
    const { app, sessionsOfUser, reset } = await createRaceContext();
    const admin = await loginAs(app, "admin");
    const changer = await loginAs(app, "user");

    const hold = holdNextHashing(vi.mocked(hashPassword));
    const resetting = send(reset(admin));
    await hold.reached;
    expect((await changeOwn(changer)).status).toBe(200);
    hold.release();

    expect((await resetting).status).toBe(204);
    expect(sessionsOfUser()).toEqual([]);
    expect((await changer.get(API_PATHS.me)).status).toBe(401);
    expect((await login(app, "user", CHANGED_PASSWORD)).status).toBe(401);
    expect((await login(app, "user", RESET_PASSWORD)).status).toBe(200);
  });

  it("waits for a change that is writing, so that the reset password holds", async () => {
    const { app, stores, sessionsOfUser, reset } = await createRaceContext();
    const admin = await loginAs(app, "admin");
    const changer = await loginAs(app, "user");

    const hold = holdNextStoreCall(stores.users, "update");
    const changing = send(changeOwn(changer));
    await hold.reached;
    const hashed = nextHashFinished();
    const resetting = send(reset(admin));
    await untilPastHashing(hashed);
    hold.release();
    const [changeRes, resetRes] = await Promise.all([changing, resetting]);

    expect(changeRes.status).toBe(200);
    expect(resetRes.status).toBe(204);
    expect(sessionsOfUser()).toEqual([]);
    expect((await changer.get(API_PATHS.me)).status).toBe(401);
    expect((await login(app, "user", CHANGED_PASSWORD)).status).toBe(401);
    expect((await login(app, "user", RESET_PASSWORD)).status).toBe(200);
  });

  it("makes a following change fail, when the reset is writing first", async () => {
    const { app, stores, sessionsOfUser, reset } = await createRaceContext();
    const admin = await loginAs(app, "admin");
    const changer = await loginAs(app, "user");

    const hold = holdNextStoreCall(stores.users, "update");
    const resetting = send(reset(admin));
    await hold.reached;
    const hashed = nextHashFinished();
    const changing = send(changeOwn(changer));
    await untilPastHashing(hashed);
    hold.release();
    const [changeRes, resetRes] = await Promise.all([changing, resetting]);

    expect(resetRes.status).toBe(204);
    expect(changeRes.status).toBe(400);
    expect(sessionsOfUser()).toEqual([]);
    expect((await login(app, "user", RESET_PASSWORD)).status).toBe(200);
  });
});

describe("what the lock leaves alone", () => {
  it("lets parallel logins of one user all succeed with their own sessions", async () => {
    const { app, sessionsOfUser } = await createRaceContext();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => send(login(app, "user", "user"))),
    );

    expect(responses.map((res) => res.status)).toEqual(Array(5).fill(200));
    expect(sessionsOfUser()).toHaveLength(5);
  });

  it("does not make a login wait for the verification of another one", async () => {
    const { app } = await createRaceContext();

    const hold = holdNextHashing(vi.mocked(verifyPassword));
    const slow = send(login(app, "user", "user"));
    await hold.reached;
    expect((await login(app, "manager", "manager")).status).toBe(200);
    hold.release();

    expect((await slow).status).toBe(200);
  });

  it("does not make a login wait for the hashing of a change or a reset", async () => {
    const { app, reset } = await createRaceContext();
    const admin = await loginAs(app, "admin");
    const changer = await loginAs(app, "user");

    const holdChange = holdNextHashing(vi.mocked(hashPassword));
    const changing = send(changeOwn(changer));
    await holdChange.reached;
    expect((await login(app, "manager", "manager")).status).toBe(200);
    holdChange.release();
    await changing;

    const holdReset = holdNextHashing(vi.mocked(hashPassword));
    const resetting = send(reset(admin));
    await holdReset.reached;
    expect((await login(app, "manager", "manager")).status).toBe(200);
    holdReset.release();
    await resetting;
  });

  it("does not delay a login with a wrong password, which never takes the lock", async () => {
    const { app, stores } = await createRaceContext();

    const hold = holdNextStoreCall(stores.sessions, "create");
    const holding = send(login(app, "user", "user"));
    await hold.reached;
    const res = await login(app, "manager", "falsch");
    hold.release();

    expect(res.status).toBe(401);
    expect((await holding).status).toBe(200);
  });
});

describe("a failure inside the lock", () => {
  it("frees it after a failing login", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app, stores } = await createRaceContext();
    stores.sessions.create = vi
      .fn(stores.sessions.create)
      .mockRejectedValueOnce(new Error("db down"));

    const failed = await login(app, "user", "user");

    expect(failed.status).toBe(500);
    expect(failed.get("Set-Cookie")).toBeUndefined();
    expect((await login(app, "user", "user")).status).toBe(200);
  });

  it("frees it after a failing change, for the change and the reset", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app, stores, reset } = await createRaceContext();
    const admin = await loginAs(app, "admin");
    const changer = await loginAs(app, "user");
    stores.users.update = vi.fn(stores.users.update).mockRejectedValueOnce(new Error("db down"));

    expect((await changeOwn(changer)).status).toBe(500);

    expect((await changeOwn(changer)).status).toBe(200);
    expect((await reset(admin)).status).toBe(204);
  });

  it("frees it after a failing reset", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { app, stores, reset } = await createRaceContext();
    const admin = await loginAs(app, "admin");
    stores.sessions.deleteByUser = vi
      .fn(stores.sessions.deleteByUser)
      .mockRejectedValueOnce(new Error("db down"));

    expect((await reset(admin)).status).toBe(500);

    expect((await login(app, "user", RESET_PASSWORD)).status).toBe(200);
  });
});

describe("deleting the user meanwhile", () => {
  it("answers a login still being verified with 401", async () => {
    const { app, sessionsOfUser, user } = await createRaceContext();
    const admin = await loginAs(app, "admin");

    const hold = holdNextHashing(vi.mocked(verifyPassword));
    const loggingIn = send(login(app, "user", "user"));
    await hold.reached;
    expect((await admin.delete(adminUserPath(user.id))).status).toBe(204);
    hold.release();

    expect((await loggingIn).status).toBe(401);
    expect(sessionsOfUser()).toEqual([]);
  });

  it("leaves a session that is rejected, when the login is already in the lock", async () => {
    const { app, stores, user } = await createRaceContext();
    const admin = await loginAs(app, "admin");
    const loginAgent = request.agent(app);

    const hold = holdNextStoreCall(stores.sessions, "create");
    const loggingIn = send(login(loginAgent, "user", "user"));
    await hold.reached;
    expect((await admin.delete(adminUserPath(user.id))).status).toBe(204);
    hold.release();

    expect((await loggingIn).status).toBe(200);
    expect((await loginAgent.get(API_PATHS.me)).status).toBe(401);
  });

  it("answers a change with 401 and a reset with 404 after their hashing", async () => {
    const { app, user, reset } = await createRaceContext();
    const admin = await loginAs(app, "admin");
    const changer = await loginAs(app, "user");

    const holdChange = holdNextHashing(vi.mocked(hashPassword));
    const changing = send(changeOwn(changer));
    await holdChange.reached;
    const holdReset = holdNextHashing(vi.mocked(hashPassword));
    const resetting = send(reset(admin));
    await holdReset.reached;
    expect((await admin.delete(adminUserPath(user.id))).status).toBe(204);
    holdChange.release();
    holdReset.release();

    expect((await changing).status).toBe(401);
    expect((await resetting).status).toBe(404);
  });
});
