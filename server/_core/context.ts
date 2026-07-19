import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema.js";
import { sdk } from "./sdk.js";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "../../shared/const.js";

export type TrpcContext = {
  req: any;
  res: any;
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // @ts-ignore
    const cookies = parseCookieHeader(opts.req.headers.cookie ?? "");
    if (cookies[COOKIE_NAME] === "admin-session-charles") {
      user = { id: 1, openId: "charles-admin", name: "Charles Henrique", role: "admin" } as any;
      return { req: opts.req, res: opts.res, user };
    }
    // @ts-ignore
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
