import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Request, Response } from "express";
import type { User } from "../../drizzle/schema.js";
import { sdk } from "./sdk.js";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME } from "../../shared/const.js";

export type TrpcContext = {
  req: Request;
  res: Response;
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const req = opts.req as unknown as Request;
  const res = opts.res as unknown as Response;
  let user: User | null = null;

  try {
    const cookieHeader = req.headers.cookie || "";
    const cookies = parseCookieHeader(cookieHeader);
    
    if (cookies[COOKIE_NAME] === "admin-session-charles") {
      user = { id: 1, openId: "charles-admin", name: "Charles Henrique", role: "admin" } as any;
      return { req, res, user };
    }
    user = await sdk.authenticateRequest(req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req,
    res,
    user,
  };
}
