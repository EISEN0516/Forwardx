import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { ACCOUNT_DISABLED_ERR_MSG, COOKIE_NAME } from "../../shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { ENV } from "../env";
import {
  SESSION_TOKEN_TTL_MS,
  SESSION_TOKEN_TTL_SECONDS,
  stripSessionSensitiveFields,
  type SessionKind,
} from "../session";
import { createAuthSession } from "../repositories/sessionRepository";

export type AuthSource = "local" | "telegram" | "xboard_sso";

export const XBOARD_SSO_ONLY_MESSAGE = "请从 Xboard 的转发管理入口登录";

export function normalizeAuthSource(value: unknown, sessionKind: SessionKind): AuthSource {
  const source = String(value || "").trim().toLowerCase();
  if (source === "xboard_sso") return "xboard_sso";
  if (source === "telegram" || sessionKind === "telegram") return "telegram";
  return "local";
}

export function isAuthSourceAllowed(source: AuthSource, ssoOnly = ENV.xboardSsoOnly) {
  return !ssoOnly || source === "xboard_sso";
}

export function assertAuthSourceAllowed(source: AuthSource, ssoOnly = ENV.xboardSsoOnly) {
  if (!isAuthSourceAllowed(source, ssoOnly)) {
    throw new TRPCError({ code: "FORBIDDEN", message: XBOARD_SSO_ONLY_MESSAGE });
  }
}

type CreateSessionRecord = typeof createAuthSession;

export interface IssueAuthSessionInput {
  req: Request;
  res: Response;
  user: Record<string, any>;
  kind: SessionKind;
  authSource: AuthSource;
  mobile?: boolean;
}

interface IssueAuthSessionDependencies {
  createSessionRecord?: CreateSessionRecord;
  sidFactory?: () => string;
  now?: () => number;
}

export async function issueAuthSession(
  input: IssueAuthSessionInput,
  dependencies: IssueAuthSessionDependencies = {},
) {
  assertAuthSourceAllowed(input.authSource);
  if (input.user?.accountEnabled === false) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: ACCOUNT_DISABLED_ERR_MSG });
  }

  const now = (dependencies.now || Date.now)();
  const sid = (dependencies.sidFactory || (() => nanoid(24)))();
  const createSessionRecord = dependencies.createSessionRecord || createAuthSession;
  await createSessionRecord({
    userId: input.user.id,
    sid,
    kind: input.kind,
    expiresAt: new Date(now + SESSION_TOKEN_TTL_MS),
  });

  const token = jwt.sign(
    {
      userId: input.user.id,
      sid,
      kind: input.kind,
      authSource: input.authSource,
    },
    ENV.cookieSecret,
    { expiresIn: SESSION_TOKEN_TTL_SECONDS },
  );
  input.res.cookie(COOKIE_NAME, token, getSessionCookieOptions(input.req));

  return {
    ...stripSessionSensitiveFields(input.user),
    mobileToken: input.mobile ? token : null,
  };
}
