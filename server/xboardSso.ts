import fs from "fs";
import type { Request, Response } from "express";
import jwt, { type JwtPayload, type Secret } from "jsonwebtoken";
import { ENV } from "./env";
import * as db from "./db";
import { revokeUserAuthSessions } from "./repositories/sessionRepository";
import { issueAuthSession } from "./services/authSessionService";

const DEFAULT_CLOCK_TOLERANCE_SECONDS = 5;
const DEFAULT_MAX_TOKEN_LIFETIME_SECONDS = 120;
const MAX_TOKEN_LENGTH = 16_384;
const MAX_REPLAY_STORE_SIZE = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class XboardSsoError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
  ) {
    super(message);
    this.name = "XboardSsoError";
  }
}

export interface XboardSsoClaims extends JwtPayload {
  sub: string;
  role: "admin";
  xboard_user_id: number;
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
}

export class XboardSsoReplayStore {
  private readonly consumed = new Map<string, number>();

  consume(jti: string, expiresAtSeconds: number, nowSeconds = Math.floor(Date.now() / 1000)) {
    for (const [storedJti, expiresAt] of this.consumed) {
      if (expiresAt + DEFAULT_CLOCK_TOLERANCE_SECONDS < nowSeconds) this.consumed.delete(storedJti);
    }
    if (this.consumed.has(jti)) return false;
    while (this.consumed.size >= MAX_REPLAY_STORE_SIZE) {
      const oldest = this.consumed.keys().next().value;
      if (!oldest) break;
      this.consumed.delete(oldest);
    }
    this.consumed.set(jti, expiresAtSeconds);
    return true;
  }
}

export interface VerifyXboardSsoTokenOptions {
  publicKey: Secret;
  issuer: string;
  audience: string;
  keyId: string;
  replayStore: XboardSsoReplayStore;
  nowSeconds?: number;
  clockToleranceSeconds?: number;
  maxTokenLifetimeSeconds?: number;
}

function requiredIntegerClaim(payload: JwtPayload, name: string) {
  const value = payload[name];
  if (!Number.isSafeInteger(value)) {
    throw new XboardSsoError("invalid_claims", 401, `JWT claim ${name} must be an integer`);
  }
  return Number(value);
}

function resolveXboardUserId(payload: JwtPayload) {
  const canonical = payload.xboard_user_id;
  const compatibilityId = payload.id;
  if (canonical !== undefined && !Number.isSafeInteger(canonical)) {
    throw new XboardSsoError("invalid_claims", 401, "JWT claim xboard_user_id must be an integer");
  }
  if (compatibilityId !== undefined && !Number.isSafeInteger(compatibilityId)) {
    throw new XboardSsoError("invalid_claims", 401, "JWT claim id must be an integer");
  }
  if (canonical !== undefined && compatibilityId !== undefined && canonical !== compatibilityId) {
    throw new XboardSsoError("invalid_claims", 401, "JWT user id claims do not match");
  }
  const id = Number(canonical ?? compatibilityId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new XboardSsoError("invalid_claims", 401, "JWT is missing a valid Xboard user id");
  }
  return id;
}

export function verifyXboardSsoToken(tokenInput: unknown, options: VerifyXboardSsoTokenOptions): XboardSsoClaims {
  const token = typeof tokenInput === "string" ? tokenInput.trim() : "";
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw new XboardSsoError("invalid_token", 401);
  }

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded !== "object" || !decoded.header) {
    throw new XboardSsoError("invalid_token", 401);
  }
  if (decoded.header.alg !== "RS256" || decoded.header.kid !== options.keyId) {
    throw new XboardSsoError("invalid_token_header", 401);
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const clockToleranceSeconds = options.clockToleranceSeconds ?? DEFAULT_CLOCK_TOLERANCE_SECONDS;
  let payload: JwtPayload;
  try {
    const verified = jwt.verify(token, options.publicKey, {
      algorithms: ["RS256"],
      issuer: options.issuer,
      audience: options.audience,
      clockTimestamp: nowSeconds,
      clockTolerance: clockToleranceSeconds,
    });
    if (!verified || typeof verified !== "object") throw new Error("JWT payload must be an object");
    payload = verified;
  } catch (error) {
    throw new XboardSsoError(
      "invalid_token",
      401,
      error instanceof Error ? error.message : "JWT verification failed",
    );
  }

  if (payload.iss !== options.issuer || payload.aud !== options.audience) {
    throw new XboardSsoError("invalid_claims", 401);
  }
  if (payload.role !== "admin") {
    throw new XboardSsoError("admin_required", 403);
  }

  const xboardUserId = resolveXboardUserId(payload);
  const expectedSubject = `xboard:user:${xboardUserId}`;
  if (payload.sub !== expectedSubject) {
    throw new XboardSsoError("invalid_subject", 401);
  }

  const issuedAt = requiredIntegerClaim(payload, "iat");
  const notBefore = requiredIntegerClaim(payload, "nbf");
  const expiresAt = requiredIntegerClaim(payload, "exp");
  const maxTokenLifetimeSeconds = options.maxTokenLifetimeSeconds ?? DEFAULT_MAX_TOKEN_LIFETIME_SECONDS;
  if (
    issuedAt > nowSeconds + clockToleranceSeconds
    || Math.abs(notBefore - issuedAt) > clockToleranceSeconds
    || expiresAt <= Math.max(issuedAt, notBefore)
    || expiresAt - issuedAt > maxTokenLifetimeSeconds
  ) {
    throw new XboardSsoError("invalid_token_lifetime", 401);
  }

  const jti = typeof payload.jti === "string" ? payload.jti.trim() : "";
  if (!UUID_PATTERN.test(jti)) {
    throw new XboardSsoError("invalid_jti", 401);
  }
  if (!options.replayStore.consume(jti, expiresAt, nowSeconds)) {
    throw new XboardSsoError("replayed_token", 401);
  }

  return {
    ...payload,
    sub: expectedSubject,
    role: "admin",
    xboard_user_id: xboardUserId,
    iat: issuedAt,
    nbf: notBefore,
    exp: expiresAt,
    jti,
  } as XboardSsoClaims;
}

let publicKeyCache: { path: string; modifiedAtMs: number; value: Buffer } | null = null;

function readConfiguredPublicKey(filePath: string) {
  const normalizedPath = filePath.trim();
  if (!normalizedPath) throw new XboardSsoError("sso_not_configured", 503);
  try {
    const stat = fs.statSync(normalizedPath);
    if (!stat.isFile()) throw new Error("public key path is not a file");
    if (publicKeyCache?.path === normalizedPath && publicKeyCache.modifiedAtMs === stat.mtimeMs) {
      return publicKeyCache.value;
    }
    const value = fs.readFileSync(normalizedPath);
    if (!value.length) throw new Error("public key file is empty");
    publicKeyCache = { path: normalizedPath, modifiedAtMs: stat.mtimeMs, value };
    return value;
  } catch (error) {
    throw new XboardSsoError(
      "sso_not_configured",
      503,
      error instanceof Error ? error.message : "Xboard SSO public key is unavailable",
    );
  }
}

const replayStore = new XboardSsoReplayStore();

interface XboardSsoHandlerDependencies {
  getUserByUsername?: typeof db.getUserByUsername;
  revokeUserSessions?: typeof revokeUserAuthSessions;
  issueSession?: typeof issueAuthSession;
}

export function createXboardSsoHandler(dependencies: XboardSsoHandlerDependencies = {}) {
  return async function handleXboardSso(req: Request, res: Response) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Referrer-Policy", "no-referrer");

    try {
      if (!ENV.xboardSsoEnabled) throw new XboardSsoError("sso_disabled", 404);
      const requiredConfig = {
        issuer: ENV.xboardSsoIssuer.trim(),
        audience: ENV.xboardSsoAudience.trim(),
        keyId: ENV.xboardSsoKeyId.trim(),
        username: ENV.xboardSsoForwardxUsername.trim(),
      };
      if (!requiredConfig.issuer || !requiredConfig.audience || !requiredConfig.keyId || !requiredConfig.username) {
        throw new XboardSsoError("sso_not_configured", 503);
      }

      const claims = verifyXboardSsoToken(req.query.token, {
        publicKey: readConfiguredPublicKey(ENV.xboardSsoPublicKeyPath),
        issuer: requiredConfig.issuer,
        audience: requiredConfig.audience,
        keyId: requiredConfig.keyId,
        replayStore,
      });

      const getUserByUsername = dependencies.getUserByUsername || db.getUserByUsername;
      const user = await getUserByUsername(requiredConfig.username);
      if (!user || user.username !== requiredConfig.username || user.role !== "admin" || user.accountEnabled === false) {
        throw new XboardSsoError("forwardx_admin_unavailable", 403);
      }

      const revokeUserSessions = dependencies.revokeUserSessions || revokeUserAuthSessions;
      await revokeUserSessions(
        user.id,
        ENV.xboardSsoOnly
          ? { reason: "xboard_sso_login" }
          : { kind: "browser", reason: "xboard_sso_login" },
      );
      const issueSession = dependencies.issueSession || issueAuthSession;
      await issueSession({
        req,
        res,
        user,
        kind: "browser",
        authSource: "xboard_sso",
      });

      console.info(`[XboardSSO] Login success xboardUserId=${claims.xboard_user_id} forwardxUserId=${user.id}`);
      res.status(303).location("/").end();
    } catch (error) {
      const failure = error instanceof XboardSsoError
        ? error
        : new XboardSsoError("sso_login_failed", 500);
      console.warn(`[XboardSSO] Login rejected code=${failure.code}`);
      res.status(failure.status).type("text/plain; charset=utf-8").send(`ForwardX SSO 登录失败（${failure.code}）`);
    }
  };
}

export const xboardSsoHandler = createXboardSsoHandler();
