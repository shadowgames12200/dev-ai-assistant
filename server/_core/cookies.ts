const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: any) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers?.["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some((proto: string) => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(req: any) {
  const hostname = req.hostname || req.headers?.host?.split(":")[0] || "";
  const isLocal = LOCAL_HOSTS.has(hostname) || isIpAddress(hostname);

  return {
    httpOnly: true,
    path: "/",
    // Usamos SameSite=Lax para garantir que o cookie de sessão seja enviado 
    // após redirecionamentos do Supabase, evitando o loop de login.
    sameSite: "lax" as const,
    secure: isSecureRequest(req),
  };
}
