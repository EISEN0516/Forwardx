import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import test from "node:test";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { COOKIE_NAME } from "../shared/const";
import { ENV } from "./env";
import {
  assertAuthSourceAllowed,
  isAuthSourceAllowed,
  issueAuthSession,
  normalizeAuthSource,
} from "./services/authSessionService";
import {
  verifyXboardSsoToken,
  XboardSsoError,
  XboardSsoReplayStore,
} from "./xboardSso";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ISSUER = "https://xb.senlimm.top";
const AUDIENCE = "forwardx";
const KEY_ID = "xboard-main-2026";
const NOW = 1_800_000_000;

function signToken(
  overrides: Record<string, unknown> = {},
  options: { algorithm?: "RS256" | "HS256"; keyId?: string } = {},
) {
  const algorithm = options.algorithm || "RS256";
  const payload = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: "xboard:user:7",
    role: "admin",
    xboard_user_id: 7,
    iat: NOW,
    nbf: NOW - 5,
    exp: NOW + 60,
    jti: randomUUID(),
    ...overrides,
  };
  for (const key of Object.keys(payload)) {
    if ((payload as Record<string, unknown>)[key] === undefined) delete (payload as Record<string, unknown>)[key];
  }
  return jwt.sign(payload, algorithm === "RS256" ? privateKey : "test-hmac-secret", {
    algorithm,
    keyid: options.keyId ?? KEY_ID,
  });
}

function verify(token: string, replayStore = new XboardSsoReplayStore()) {
  return verifyXboardSsoToken(token, {
    publicKey,
    issuer: ISSUER,
    audience: AUDIENCE,
    keyId: KEY_ID,
    replayStore,
    nowSeconds: NOW,
  });
}

function expectSsoError(action: () => unknown, code: string) {
  assert.throws(action, (error: unknown) => error instanceof XboardSsoError && error.code === code);
}

test("Xboard SSO accepts a strict admin token only once", () => {
  const store = new XboardSsoReplayStore();
  const token = signToken();
  const claims = verify(token, store);
  assert.equal(claims.xboard_user_id, 7);
  assert.equal(claims.sub, "xboard:user:7");
  expectSsoError(() => verify(token, store), "replayed_token");
});

test("Xboard SSO rejects algorithm downgrade and an unexpected key id", () => {
  expectSsoError(() => verify(signToken({}, { algorithm: "HS256" })), "invalid_token_header");
  expectSsoError(() => verify(signToken({}, { keyId: "retired-key" })), "invalid_token_header");
});

test("Xboard SSO binds administrator role, user id, subject, issuer, and audience", () => {
  expectSsoError(() => verify(signToken({ role: "user" })), "admin_required");
  expectSsoError(() => verify(signToken({ sub: "xboard:user:8" })), "invalid_subject");
  expectSsoError(() => verify(signToken({ id: 8 })), "invalid_claims");
  expectSsoError(() => verify(signToken({ iss: "https://attacker.invalid" })), "invalid_token");
  expectSsoError(() => verify(signToken({ aud: "another-service" })), "invalid_token");
});

test("Xboard SSO requires a short, complete time window and UUID jti", () => {
  expectSsoError(() => verify(signToken({ nbf: undefined })), "invalid_claims");
  expectSsoError(() => verify(signToken({ iat: NOW + 30, nbf: NOW, exp: NOW + 60 })), "invalid_token_lifetime");
  expectSsoError(() => verify(signToken({ exp: NOW + 121 })), "invalid_token_lifetime");
  expectSsoError(() => verify(signToken({ jti: "not-a-uuid" })), "invalid_jti");
});

test("SSO-only mode accepts only Xboard SSO sessions, including legacy token normalization", () => {
  assert.equal(isAuthSourceAllowed("xboard_sso", true), true);
  assert.equal(isAuthSourceAllowed("local", true), false);
  assert.equal(isAuthSourceAllowed("telegram", true), false);
  assert.equal(normalizeAuthSource(undefined, "browser"), "local");
  assert.equal(normalizeAuthSource(undefined, "mobile"), "local");
  assert.equal(normalizeAuthSource(undefined, "telegram"), "telegram");
  assert.throws(
    () => assertAuthSourceAllowed("local", true),
    (error: any) => error?.code === "FORBIDDEN",
  );
});

test("shared auth session service stores the session and signs its source into the cookie", async () => {
  let stored: Record<string, any> | undefined;
  let cookie: { name: string; value: string; options: Record<string, any> } | undefined;
  const req = {
    protocol: "https",
    headers: { "x-forwarded-proto": "https" },
  } as unknown as Request;
  const res = {
    cookie(name: string, value: string, options: Record<string, any>) {
      cookie = { name, value, options };
      return this;
    },
  } as unknown as Response;

  const result = await issueAuthSession({
    req,
    res,
    user: { id: 19, username: "admin@example.com", role: "admin", accountEnabled: true, password: "hidden" },
    kind: "browser",
    authSource: "xboard_sso",
  }, {
    sidFactory: () => "fixed-session-id",
    now: () => NOW * 1000,
    createSessionRecord: async (input) => {
      stored = input;
    },
  });

  assert.equal(stored?.userId, 19);
  assert.equal(stored?.sid, "fixed-session-id");
  assert.equal(cookie?.name, COOKIE_NAME);
  assert.equal(cookie?.options.httpOnly, true);
  assert.equal(cookie?.options.secure, true);
  const payload = jwt.verify(cookie!.value, ENV.cookieSecret) as jwt.JwtPayload;
  assert.equal(payload.authSource, "xboard_sso");
  assert.equal(payload.kind, "browser");
  assert.equal((result as any).password, undefined);
});
