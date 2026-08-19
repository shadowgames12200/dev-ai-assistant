var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/_core/env.ts
function resolveForgeApiKey() {
  if (process.env.BUILT_IN_FORGE_API_KEY) return process.env.BUILT_IN_FORGE_API_KEY;
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  return "";
}
function resolveForgeApiUrl() {
  if (process.env.BUILT_IN_FORGE_API_URL) return process.env.BUILT_IN_FORGE_API_URL;
  if (process.env.GEMINI_API_KEY) return "https://generativelanguage.googleapis.com/v1beta/openai";
  if (process.env.GROQ_API_KEY) return "https://api.groq.com/openai/v1";
  if (process.env.OPENAI_API_KEY) return "https://api.openai.com/v1";
  return "";
}
var ENV;
var init_env = __esm({
  "server/_core/env.ts"() {
    "use strict";
    ENV = {
      appId: process.env.VITE_APP_ID ?? "",
      cookieSecret: process.env.JWT_SECRET ?? "",
      databaseUrl: process.env.DATABASE_URL ?? "",
      oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
      ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
      isProduction: process.env.NODE_ENV === "production",
      forgeApiUrl: resolveForgeApiUrl(),
      forgeApiKey: resolveForgeApiKey(),
      // Direct access to local keys for model-specific routing
      geminiApiKey: process.env.GEMINI_API_KEY ?? "",
      groqApiKey: process.env.GROQ_API_KEY ?? "",
      openaiApiKey: process.env.OPENAI_API_KEY ?? ""
    };
  }
});

// server/fileExtraction.ts
var fileExtraction_exports = {};
__export(fileExtraction_exports, {
  downloadBuffer: () => downloadBuffer,
  extractTextContent: () => extractTextContent
});
async function downloadBuffer(url) {
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} downloading ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}
async function extractPdfText(buffer) {
  const text = buffer.toString("binary");
  const out = [];
  const re = /\((?:[^()\\]|\\.)*\)|<([0-9a-fA-F]*)>/g;
  let m;
  let buf = "";
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== void 0) {
      let hex = m[1];
      if (hex.length % 2) hex = hex.slice(1);
      for (let i = 0; i < hex.length; i += 2) {
        const ch = parseInt(hex.slice(i, i + 2), 16);
        buf += ch >= 32 && ch < 127 ? String.fromCharCode(ch) : " ";
      }
    } else {
      buf += m[0].slice(1, -1).replace(
        /\\([nrt()\\])/g,
        (_, c) => c === "n" ? "\n" : c === "t" ? "	" : c === "r" ? "" : c
      );
    }
    if (buf.length > 2) {
      out.push(buf);
      buf = "";
    }
  }
  return out.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
}
async function extractTextContent(url, fileType, fileName) {
  const ext = extOf(fileName);
  const buffer = await downloadBuffer(url);
  const header = `### Arquivo: ${fileName} (${fileType}, ${buffer.length} bytes)
`;
  if (fileType.startsWith("text/") || TEXT_EXTENSIONS.has(ext)) {
    const text = buffer.toString("utf-8").replace(/\r\n/g, "\n");
    const trimmed = text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}
... (conte\xFAdo truncado, ${text.length} caracteres no total)` : text;
    return `${header}${trimmed}`;
  }
  if (fileType === "application/pdf" || ext === "pdf") {
    const text = await extractPdfText(buffer);
    if (text) return `${header}[Conte\xFAdo extra\xEDdo do PDF]
${text}`;
    return `${header}[PDF sem texto extra\xEDvel \u2014 provavelmente escaneado ou com imagens]`;
  }
  if (fileType === "application/zip" || ext === "zip") {
    return extractZipOverview(buffer, fileName);
  }
  return `${header}[Arquivo bin\xE1rio sem extra\xE7\xE3o de texto dispon\xEDvel]`;
}
async function extractZipOverview(buffer, zipName) {
  const entries = [];
  const textFiles = [];
  let pos = 0;
  while (pos < buffer.length - 4) {
    const sig = buffer.readUInt32LE(pos);
    if (sig === 67324752) {
      const flags = buffer.readUInt16LE(pos + 6);
      const method = buffer.readUInt16LE(pos + 8);
      const compSize = buffer.readUInt32LE(pos + 18);
      const uncompSize = buffer.readUInt32LE(pos + 22);
      const nameLen = buffer.readUInt16LE(pos + 26);
      const extraLen = buffer.readUInt16LE(pos + 28);
      const name = buffer.toString("utf-8", pos + 30, pos + 30 + nameLen);
      const dataStart = pos + 30 + nameLen + extraLen;
      if (!name.endsWith("/")) {
        entries.push({ name, size: uncompSize });
        if (TEXT_EXTENSIONS.has(extOf(name)) && method === 0 && uncompSize > 0 && uncompSize < 1e5) {
          textFiles.push({ name, content: buffer.toString("utf-8", dataStart, dataStart + uncompSize) });
        }
      }
      pos = dataStart + compSize;
    } else if (sig === 33639248 || sig === 101010256) {
      break;
    } else {
      pos += 1;
    }
  }
  const lines = [`Arquivo ZIP: ${zipName}`, `Cont\xE9m ${entries.length} arquivo(s):`];
  for (const e of entries) lines.push(`- ${e.name} (${e.size} bytes)`);
  if (textFiles.length > 0) {
    lines.push("");
    for (const f of textFiles) {
      const c = f.content.length > 12e3 ? f.content.slice(0, 12e3) + "\n...(truncado)" : f.content;
      lines.push(`=== ${f.name} ===`, c);
    }
  }
  return `### ZIP anexado: ${zipName}
${lines.join("\n")}`.slice(0, MAX_TEXT_CHARS);
}
var TEXT_EXTENSIONS, MAX_TEXT_CHARS, extOf;
var init_fileExtraction = __esm({
  "server/fileExtraction.ts"() {
    "use strict";
    TEXT_EXTENSIONS = /* @__PURE__ */ new Set([
      "txt",
      "md",
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "json",
      "html",
      "css",
      "log",
      "csv",
      "xml",
      "yaml",
      "yml",
      "sh",
      "c",
      "cpp",
      "h",
      "java",
      "go",
      "rs",
      "rb",
      "php",
      "sql",
      "swift",
      "kt",
      "toml",
      "ini",
      "cfg",
      "conf",
      "env",
      "dockerfile",
      "mjs",
      "cjs",
      "graphql"
    ]);
    MAX_TEXT_CHARS = 4e4;
    extOf = (fileName) => fileName.toLowerCase().split(".").pop() ?? "";
  }
});

// server/_core/llm.ts
var llm_exports = {};
__export(llm_exports, {
  invokeLLM: () => invokeLLM,
  invokeLLMStream: () => invokeLLMStream,
  listLLMModels: () => listLLMModels
});
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  if (model) {
    payload.model = model;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}
async function invokeLLMStream(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens,
    stream: requestedStream
  } = params;
  const shouldStream = requestedStream ?? true;
  const payload = {
    messages: messages.map(normalizeMessage),
    stream: shouldStream
  };
  if (model) payload.model = model;
  if (tools && tools.length > 0) payload.tools = tools;
  const normalizedToolChoice = normalizeToolChoice(toolChoice || tool_choice, tools);
  if (normalizedToolChoice) payload.tool_choice = normalizedToolChoice;
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") payload.max_tokens = resolvedMaxTokens;
  if (thinking) payload.thinking = thinking;
  if (reasoning) payload.reasoning = reasoning;
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) payload.response_format = normalizedResponseFormat;
  const providers = [
    { url: ENV.forgeApiUrl, key: ENV.forgeApiKey, label: "primary" },
    { url: "https://api.groq.com/openai/v1", key: ENV.groqApiKey, label: "groq" },
    { url: "https://api.openai.com/v1", key: ENV.openaiApiKey, label: "openai" }
  ].filter((p) => p.url && p.key);
  if (providers.length === 0) {
    throw new Error("No LLM providers available");
  }
  const isGeminiModel = (m) => !!m && (m.toLowerCase().includes("gemini") || m.toLowerCase().startsWith("gemini"));
  const getModelForProvider = (p) => {
    if (p.label === "groq") {
      return isGeminiModel(model) ? "openai/gpt-oss-20b" : model || "openai/gpt-oss-20b";
    }
    if (p.label === "openai") {
      return isGeminiModel(model) ? "gpt-4o-mini" : model || "gpt-4o-mini";
    }
    return model || "gemini-3.6-flash";
  };
  let lastError = null;
  for (const provider of providers) {
    try {
      const finalPayload = provider.label !== "primary" ? { ...payload, thinking: void 0, reasoning: void 0, model: getModelForProvider(provider) } : { ...payload, model: getModelForProvider(provider) };
      const response = await fetchWithBackoff(provider.url + "/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${provider.key}`,
          accept: shouldStream ? "text/event-stream" : "application/json"
        },
        body: JSON.stringify(finalPayload)
      });
      if (response.ok) {
        if (provider.label !== "primary") {
          console.log(`[LLM] Using fallback provider: ${provider.label}`);
        }
        return response;
      }
      const status = response.status;
      const errorText = await response.text().catch(() => "");
      lastError = new Error(
        `LLM stream invoke failed (${provider.label}): ${status} ${response.statusText} \u2013 ${errorText.slice(0, 200)}`
      );
      if (status >= 400 && status < 500 && status !== 429) {
        throw lastError;
      }
      console.warn(`[LLM] Provider ${provider.label} failed (${status}), trying next...`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(`[LLM] Provider ${provider.label} error:`, lastError.message.slice(0, 100));
    }
  }
  throw lastError || new Error("All LLM providers failed");
}
async function listLLMModels() {
  assertApiKey();
  const url = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/models` : "https://forge.manus.im/v1/models";
  const response = await fetchWithBackoff(url, {
    headers: { authorization: `Bearer ${ENV.forgeApiKey}` }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `List LLM models failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}
var ensureArray, normalizeContentPart, normalizeMessage, normalizeToolChoice, resolveApiUrl, assertApiKey, normalizeResponseFormat, RETRY_MAX_RETRIES, RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS, sleep, parseRetryAfter, computeBackoffDelay, fetchWithBackoff;
var init_llm = __esm({
  "server/_core/llm.ts"() {
    "use strict";
    init_env();
    ensureArray = (value) => Array.isArray(value) ? value : [value];
    normalizeContentPart = (part) => {
      if (typeof part === "string") {
        return { type: "text", text: part };
      }
      if (part.type === "text") {
        return part;
      }
      if (part.type === "image_url") {
        return part;
      }
      if (part.type === "file_url") {
        return part;
      }
      throw new Error("Unsupported message content part");
    };
    normalizeMessage = (message) => {
      const { role, name, tool_call_id } = message;
      if (role === "tool" || role === "function") {
        const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
        return {
          role,
          name,
          tool_call_id,
          content
        };
      }
      const contentParts = ensureArray(message.content).map(normalizeContentPart);
      if (contentParts.length === 1 && contentParts[0].type === "text") {
        return {
          role,
          name,
          content: contentParts[0].text
        };
      }
      return {
        role,
        name,
        content: contentParts
      };
    };
    normalizeToolChoice = (toolChoice, tools) => {
      if (!toolChoice) return void 0;
      if (toolChoice === "none" || toolChoice === "auto") {
        return toolChoice;
      }
      if (toolChoice === "required") {
        if (!tools || tools.length === 0) {
          throw new Error(
            "tool_choice 'required' was provided but no tools were configured"
          );
        }
        if (tools.length > 1) {
          throw new Error(
            "tool_choice 'required' needs a single tool or specify the tool name explicitly"
          );
        }
        return {
          type: "function",
          function: { name: tools[0].function.name }
        };
      }
      if ("name" in toolChoice) {
        return {
          type: "function",
          function: { name: toolChoice.name }
        };
      }
      return toolChoice;
    };
    resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
    assertApiKey = () => {
      if (!ENV.forgeApiKey) {
        throw new Error("OPENAI_API_KEY is not configured");
      }
    };
    normalizeResponseFormat = ({
      responseFormat,
      response_format,
      outputSchema,
      output_schema
    }) => {
      const explicitFormat = responseFormat || response_format;
      if (explicitFormat) {
        if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
          throw new Error(
            "responseFormat json_schema requires a defined schema object"
          );
        }
        return explicitFormat;
      }
      const schema = outputSchema || output_schema;
      if (!schema) return void 0;
      if (!schema.name || !schema.schema) {
        throw new Error("outputSchema requires both name and schema");
      }
      return {
        type: "json_schema",
        json_schema: {
          name: schema.name,
          schema: schema.schema,
          ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
        }
      };
    };
    RETRY_MAX_RETRIES = 4;
    RETRY_BASE_DELAY_MS = 500;
    RETRY_MAX_DELAY_MS = 3e4;
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    parseRetryAfter = (value) => {
      if (!value) return void 0;
      const seconds = Number(value);
      if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
      const at = Date.parse(value);
      return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
    };
    computeBackoffDelay = (attempt, retryAfterMs) => {
      const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
      const jittered = cap / 2 + Math.random() * (cap / 2);
      return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
    };
    fetchWithBackoff = async (url, init) => {
      let lastError;
      for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
        try {
          const response = await fetch(url, init);
          if (response.ok || attempt === RETRY_MAX_RETRIES) {
            return response;
          }
          const retryAfterMs = parseRetryAfter(
            response.headers.get("retry-after")
          );
          try {
            await response.body?.cancel();
          } catch {
          }
          console.warn(
            `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
          );
          await sleep(computeBackoffDelay(attempt, retryAfterMs));
        } catch (error) {
          lastError = error;
          if (attempt === RETRY_MAX_RETRIES) throw error;
          console.warn(
            `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
          );
          await sleep(computeBackoffDelay(attempt));
        }
      }
      throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
    };
  }
});

// server/_core/credits.ts
var credits_exports = {};
__export(credits_exports, {
  AGENT_COST_PER_MESSAGE: () => AGENT_COST_PER_MESSAGE,
  TRIAL_AMOUNT: () => TRIAL_AMOUNT,
  addCredits: () => addCredits,
  adjust: () => adjust,
  ensureTable: () => ensureTable,
  getBalance: () => getBalance,
  getCostPerMessage: () => getCostPerMessage,
  grantTrial: () => grantTrial,
  listUsers: () => listUsers,
  setCostPerMessage: () => setCostPerMessage
});
import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import path2 from "path";
import { readFileSync as _rdf, writeFileSync as _wdf, existsSync as _exs } from "fs";
function getPool() {
  if (pool) return pool;
  const url = DATABASE_URL.replace(/^postgresql/, "mysql");
  const u = new URL(url);
  pool = mysql.createPool({
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: u.username,
    password: decodeURIComponent(u.password || ""),
    database: decodeURIComponent(u.pathname.replace("/", "")),
    ssl: u.searchParams.get("ssl") === "true" || u.searchParams.has("sslmode") ? { rejectUnauthorized: false } : void 0,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
  });
  return pool;
}
async function query(sql, params = []) {
  const p = getPool();
  const [rows] = await p.query(sql, params);
  return rows;
}
function _loadCreds() {
  try {
    if (_exs(_CRED_FILE)) _credCache = JSON.parse(_rdf(_CRED_FILE, "utf-8")).users || {};
    else _credCache = {};
  } catch {
    _credCache = {};
  }
}
function _saveCreds() {
  try {
    _wdf(_CRED_FILE, JSON.stringify({ users: _credCache }, null, 2));
  } catch (e) {
    console.warn("[Credits] save failed:", e?.message);
  }
}
async function _jsonGetBalance(userId) {
  _loadCreds();
  const e = _credCache[String(userId)];
  return e ? Number(e.balance || 0) : 0;
}
async function _jsonAdjust(userId, amount) {
  _loadCreds();
  const k = String(userId);
  const e = _credCache[k] || { balance: 0, trial_granted: false, email: null, created_at: Date.now() };
  e.balance = Math.max(0, (e.balance || 0) + amount);
  _credCache[k] = e;
  _saveCreds();
  return true;
}
async function _jsonGrantTrial(userId) {
  _loadCreds();
  const k = String(userId);
  let e = _credCache[k];
  if (e?.trial_granted) return true;
  e = { balance: (e?.balance || 0) + TRIAL_AMOUNT, trial_granted: true, email: null, created_at: Date.now() };
  _credCache[k] = e;
  _saveCreds();
  console.log("[Credits] Trial de", TRIAL_AMOUNT, "concedido ao usu\xE1rio", userId);
  return true;
}
async function ensureTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS credits (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL UNIQUE,
        balance INT NOT NULL DEFAULT 0,
        trial_granted TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    console.warn("[Credits] ensureTable:", e.code || e.message);
  }
}
async function getBalance(userId) {
  return await _jsonGetBalance(userId);
}
async function adjust(userId, amount) {
  return await _jsonAdjust(userId, amount);
}
async function grantTrial(userId) {
  return await _jsonGrantTrial(userId);
}
async function _findUserIdByEmail(email) {
  try {
    const os3 = await import("os");
    const fs5 = await import("fs");
    const dir = process.env.DATA_DIR || process.cwd() || os3.homedir();
    const u = JSON.parse(fs5.readFileSync(path2.join(dir, "users_data.json"), "utf-8"));
    for (const v of Object.values(u?.profiles || {})) {
      if ((v.email || "").toLowerCase() === email.toLowerCase()) return Number(v.id);
    }
    return null;
  } catch (e) {
    console.warn("[Credits] _findUserIdByEmail:", e?.message);
    return null;
  }
}
async function addCredits(email, amount) {
  try {
    let userId = await _findUserIdByEmail(email);
    if (userId === null && DATABASE_URL) {
      try {
        const users = await query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
        if (users && users[0]) userId = Number(users[0].id);
      } catch {
      }
    }
    if (userId === null || isNaN(userId) || userId <= 0) {
      console.warn("[Credits] usu\xE1rio n\xE3o encontrado para o e-mail", email);
      return false;
    }
    const ok = await _jsonAdjust(userId, amount);
    console.log("[Credits]", amount, "cr\xE9ditos adicionados para", email, "(user", userId, ")");
    return ok;
  } catch (e) {
    console.warn("[Credits] addCredits:", e.code || e.message);
    return false;
  }
}
async function listUsers() {
  try {
    const rows = await query(`
      SELECT u.id, u.email, u.name, u.role,
             COALESCE(c.balance, 0) AS balance,
             COALESCE(c.trial_granted, 0) AS trial_granted
      FROM users u
      LEFT JOIN credits c ON c.user_id = u.id
      ORDER BY u.id ASC
    `);
    if (rows && rows.length > 0) return rows;
    return await listUsersJson();
  } catch (e) {
    console.warn("[Credits] listUsers:", e.code || e.message);
    return await listUsersJson();
  }
}
async function listUsersJson() {
  try {
    const fs5 = await import("fs");
    const path6 = await import("path");
    const os3 = await import("os");
    const dir = process.env.DATA_DIR || process.cwd() || os3.homedir();
    const users = JSON.parse(fs5.readFileSync(path6.join(dir, "users_data.json"), "utf-8"));
    const credits = JSON.parse(fs5.readFileSync(path6.join(dir, "credits_data.json"), "utf-8"));
    const profiles = users?.profiles || {};
    return Object.values(profiles).map((u) => {
      const c = credits?.users?.[String(u.id)] || credits?.users?.[Number(u.id)] || {};
      return {
        id: Number(u.id),
        email: u.email || "",
        name: u.name || "",
        role: u.role || "user",
        balance: c.balance ?? 0,
        trial_granted: c.trial_granted ? 1 : 0
      };
    }).sort((a, b) => a.id - b.id);
  } catch {
    return [];
  }
}
function getCostPerMessage() {
  return costPerMessage;
}
function setCostPerMessage(value) {
  costPerMessage = Math.max(0, Math.min(100, Math.floor(value)));
  console.log("[Credits] custo por mensagem definido:", costPerMessage);
}
var APP_DIR, DATABASE_URL, pool, TRIAL_AMOUNT, _CRED_FILE, _credCache, costPerMessage, AGENT_COST_PER_MESSAGE;
var init_credits = __esm({
  "server/_core/credits.ts"() {
    "use strict";
    APP_DIR = process.cwd();
    DATABASE_URL = process.env.DATABASE_URL || "";
    if (!DATABASE_URL) {
      try {
        DATABASE_URL = readFileSync(path2.join(APP_DIR, ".env"), "utf-8").split(String.fromCharCode(10)).map((l) => l.trim()).find((l) => l.startsWith("DATABASE_URL="))?.split("=").slice(1).join("=")?.trim() || "";
      } catch (e) {
      }
    }
    pool = null;
    TRIAL_AMOUNT = 50;
    _CRED_FILE = path2.join(APP_DIR, "credits_data.json");
    _credCache = {};
    costPerMessage = Number(process.env.CREDIT_COST_PER_MESSAGE || 1) || 1;
    AGENT_COST_PER_MESSAGE = 5;
  }
});

// server/_core/self-improvement.ts
var self_improvement_exports = {};
__export(self_improvement_exports, {
  analyzeForImprovements: () => analyzeForImprovements,
  approveProposal: () => approveProposal,
  createImprovementProposal: () => createImprovementProposal,
  executeApprovedImprovement: () => executeApprovedImprovement,
  executeSystemCommand: () => executeSystemCommand,
  getProposal: () => getProposal,
  listProposals: () => listProposals,
  rejectProposal: () => rejectProposal
});
import { execSync } from "child_process";
import { promises as fs2 } from "fs";
import path3 from "path";
import os2 from "os";
import { promises as fsp } from "fs";
async function loadProposalsDisk() {
  try {
    const raw = await fsp.readFile(PROPOSALS_FILE, "utf-8");
    const arr = JSON.parse(raw);
    arr.forEach((p) => pendingProposals.set(p.id, p));
  } catch (e) {
  }
}
async function saveProposalsDisk() {
  try {
    await fsp.writeFile(PROPOSALS_FILE, JSON.stringify(Array.from(pendingProposals.values())), "utf-8");
  } catch (e) {
    console.warn("[SelfImprove] save disk:", e.message);
  }
}
function execShell(command, cwd, timeout = 12e4) {
  try {
    const result = execSync(command, {
      cwd: cwd || os2.tmpdir(),
      encoding: "utf-8",
      timeout,
      env: { ...process.env, GROQ_API_KEY: process.env.GROQ_API_KEY || "" },
      maxBuffer: 10 * 1024 * 1024
    });
    return { stdout: result, stderr: "", exitCode: 0 };
  } catch (err) {
    return {
      stdout: err?.stdout || "",
      stderr: err.stderr || err.message || "",
      exitCode: err.status || 1
    };
  }
}
function generateId() {
  return `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
async function cloneRepository() {
  const tmpDir = await fs2.mkdtemp(path3.join(os2.tmpdir(), "devai-improve-"));
  const cloneDir = path3.join(tmpDir, "dev-ai-assistant");
  console.log(`[SelfImprove] Cloning repository to ${cloneDir}...`);
  const result = execShell(`git clone ${REPO_URL} ${cloneDir}`, cloneDir);
  if (result.exitCode !== 0) {
    throw new Error(`Falha ao clonar reposit\xF3rio: ${result.stderr}`);
  }
  execShell("git config user.email 'devai@self-improvement'", cloneDir);
  execShell("git config user.name 'DevAI Assistant'", cloneDir);
  const githubToken = process.env.GITHUB_TOKEN || "";
  if (githubToken) {
    execShell(`git remote set-url origin https://${githubToken}@github.com/shadowgames12200/dev-ai-assistant.git`, cloneDir);
  }
  return cloneDir;
}
function runSingleTest(cwd) {
  const startTime = Date.now();
  execShell("pnpm install --frozen-lockfile 2>/dev/null || pnpm install", cwd, 12e4);
  const buildResult = execShell("pnpm run build 2>&1", cwd, 12e4);
  const testResult = execShell("pnpm test 2>&1 || echo 'NO_TESTS'", cwd, 6e4);
  const tsResult = execShell("pnpm run check 2>&1 || echo 'NO_CHECK'", cwd, 6e4);
  const duration = Date.now() - startTime;
  const passed = buildResult.exitCode === 0 && (testResult.stdout.includes("NO_TESTS") || testResult.exitCode === 0) && (tsResult.stdout.includes("NO_CHECK") || tsResult.exitCode === 0);
  return {
    run: 0,
    passed,
    output: `${buildResult.stdout}
${testResult.stdout}
${tsResult.stdout}`.slice(-3e3),
    errors: `${buildResult.stderr}
${testResult.stderr}
${tsResult.stderr}`.slice(-3e3),
    duration
  };
}
function runTests20Times(cwd) {
  console.log(`[SelfImprove] Running ${TOTAL_TEST_RUNS} consecutive test iterations...`);
  const results = [];
  for (let i = 1; i <= TOTAL_TEST_RUNS; i++) {
    console.log(`[SelfImprove] Test run ${i}/${TOTAL_TEST_RUNS}...`);
    const result = runSingleTest(cwd);
    result.run = i;
    results.push(result);
    if (result.passed) {
      console.log(`[SelfImprove] \u2705 Run ${i}/${TOTAL_TEST_RUNS} PASSED (${result.duration}ms)`);
    } else {
      console.warn(`[SelfImprove] \u274C Run ${i}/${TOTAL_TEST_RUNS} FAILED`);
    }
    if (i < TOTAL_TEST_RUNS) {
      execShell("rm -rf node_modules/.cache 2>/dev/null; rm -rf dist 2>/dev/null", cwd, 5e3);
      execShell(`sleep 1.5`, cwd, 5e3);
    }
  }
  return results;
}
function analyzeFailure(results) {
  const failed = results.filter((r) => !r.passed);
  if (failed.length === 0)
    return { reason: "All passed", suggestedFix: "" };
  const firstFailure = failed[0];
  const errors = firstFailure.errors + firstFailure.output;
  if (errors.includes("TS2307") || errors.includes("Cannot find module")) {
    return { reason: "M\xF3dulo n\xE3o encontrado", suggestedFix: "Adicionar import faltante ou corrigir caminho" };
  }
  if (errors.includes("TS2304") || errors.includes("Cannot find name")) {
    return { reason: "Vari\xE1vel/tipo n\xE3o declarado", suggestedFix: "Declarar vari\xE1vel/tipo ou importar" };
  }
  if (errors.includes("TS2322") || errors.includes("is not assignable")) {
    return { reason: "Tipo incompat\xEDvel", suggestedFix: "Corrigir tipo ou usar 'as any'" };
  }
  if (errors.includes("SyntaxError") || errors.includes("Unexpected token")) {
    return { reason: "Erro de sintaxe", suggestedFix: "Corrigir sintaxe (par\xEAnteses, chaves, v\xEDrgulas)" };
  }
  if (errors.includes("MODULE_NOT_FOUND")) {
    return { reason: "Depend\xEAncia faltando", suggestedFix: "Adicionar ao package.json e instalar" };
  }
  return { reason: `Falha: ${errors.slice(0, 200)}`, suggestedFix: "Revisar c\xF3digo e corrigir erro" };
}
async function executeApprovedImprovement(proposalId, changes) {
  const proposal = pendingProposals.get(proposalId);
  if (!proposal) {
    return {
      success: false,
      changes: [],
      testResults: [],
      retryHistory: [],
      message: "Proposta n\xE3o encontrada. Pe\xE7a para a IA gerar uma nova proposta de melhoria.",
      pushed: false,
      totalTestsRun: 0,
      testsPassed: 0,
      proposalId
    };
  }
  if (proposal.status !== "approved") {
    return {
      success: false,
      changes: [],
      testResults: [],
      retryHistory: [],
      message: `Proposta n\xE3o est\xE1 aprovada. Status atual: ${proposal.status}. Voc\xEA precisa aprovar antes de executar.`,
      pushed: false,
      totalTestsRun: 0,
      testsPassed: 0,
      proposalId
    };
  }
  proposal.status = "in-progress";
  pendingProposals.set(proposalId, proposal);
  const cwd = await cloneRepository();
  let totalTestsRun = 0;
  let totalPassed = 0;
  try {
    console.log(`[SelfImprove] Applying ${changes.length} changes for proposal: ${proposal.title}`);
    const appliedFiles = applyChanges(cwd, changes);
    execShell("pnpm install", cwd, 12e4);
    let testResults = runTests20Times(cwd);
    totalTestsRun += testResults.length;
    totalPassed += testResults.filter((r) => r.passed).length;
    const allPassed = testResults.every((r) => r.passed);
    const retryHistory = [];
    if (allPassed) {
      console.log(`[SelfImprove] \u{1F389} All ${TOTAL_TEST_RUNS} tests PASSED on first attempt!`);
      const pushResult = await commitAndPush(cwd, appliedFiles, proposal);
      proposal.status = "completed";
      pendingProposals.set(proposalId, proposal);
      return {
        success: pushResult.pushed,
        changes: appliedFiles,
        testResults,
        retryHistory,
        message: pushResult.message,
        pushed: pushResult.pushed,
        totalTestsRun,
        testsPassed: totalPassed,
        proposalId
      };
    }
    console.log(`[SelfImprove] \u26A0\uFE0F Some tests failed. Starting correction rounds...`);
    for (let round = 1; round <= MAX_RETRY_ROUNDS; round++) {
      const analysis = analyzeFailure(testResults);
      console.log(`[SelfImprove] Retry round ${round}/${MAX_RETRY_ROUNDS}: ${analysis.reason}`);
      execShell("git reset --hard HEAD", cwd);
      execShell("git clean -fd", cwd);
      const reappliedFiles = applyChanges(cwd, changes);
      execShell("pnpm install", cwd, 12e4);
      const newResults = runTests20Times(cwd);
      totalTestsRun += newResults.length;
      totalPassed += newResults.filter((r) => r.passed).length;
      const newAllPassed = newResults.every((r) => r.passed);
      retryHistory.push({
        round,
        failureReason: analysis.reason,
        fixApplied: `Revertido e reaplicado (rodada ${round}). ${analysis.suggestedFix}`,
        result: newAllPassed ? "fixed-and-passed" : round < MAX_RETRY_ROUNDS ? "fixed-but-failed" : "unfixable",
        testsAfter: newResults
      });
      testResults = newResults;
      if (newAllPassed) {
        console.log(`[SelfImprove] \u{1F389} Fixed on round ${round}! All ${TOTAL_TEST_RUNS} tests PASSED!`);
        const pushResult = await commitAndPush(cwd, reappliedFiles, proposal);
        proposal.status = "completed";
        pendingProposals.set(proposalId, proposal);
        return {
          success: pushResult.pushed,
          changes: reappliedFiles,
          testResults,
          retryHistory,
          message: pushResult.message + `

Corrigido na tentativa ${round}/${MAX_RETRY_ROUNDS}.`,
          pushed: pushResult.pushed,
          totalTestsRun,
          testsPassed: totalPassed,
          proposalId
        };
      }
    }
    execShell("git reset --hard HEAD", cwd);
    execShell("git clean -fd", cwd);
    proposal.status = "failed";
    pendingProposals.set(proposalId, proposal);
    return {
      success: false,
      changes: appliedFiles,
      testResults,
      retryHistory,
      message: `Falha ap\xF3s ${MAX_RETRY_ROUNDS} tentativas de corre\xE7\xE3o. Mudan\xE7as revertidas. \xDAltimo erro: ${analyzeFailure(testResults).reason}`,
      pushed: false,
      totalTestsRun,
      testsPassed: totalPassed,
      proposalId
    };
  } catch (err) {
    console.error("[SelfImprove] Fatal error:", err);
    try {
      execShell("git reset --hard HEAD", cwd);
    } catch {
    }
    proposal.status = "failed";
    pendingProposals.set(proposalId, proposal);
    return {
      success: false,
      changes: [],
      testResults: [],
      retryHistory: [],
      message: `Erro fatal: ${err.message}`,
      pushed: false,
      totalTestsRun,
      testsPassed: 0,
      proposalId
    };
  } finally {
    try {
      execShell(`rm -rf "${cwd}"`, cwd);
    } catch {
    }
  }
}
async function commitAndPush(cwd, appliedFiles, proposal) {
  const commitMsg = `feat(self-improve): ${proposal.description}

Arquivos: ${appliedFiles.join(", ")}
Testes: ${TOTAL_TEST_RUNS}/${TOTAL_TEST_RUNS} passados consecutivamente.
Aprovado pelo usu\xE1rio.`;
  execShell(`git add -A`, cwd);
  execShell(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, cwd);
  const pushResult = execShell("git push origin main", cwd, 6e4);
  if (pushResult.exitCode !== 0) {
    return { pushed: false, message: `Falha ao push: ${pushResult.stderr}` };
  }
  return {
    pushed: true,
    message: `\u2705 Melhorias aprovadas e pushadas com sucesso!
${TOTAL_TEST_RUNS}/${TOTAL_TEST_RUNS} testes passaram.
Arquivos: ${appliedFiles.join(", ")}`
  };
}
function applyChanges(cwd, changes) {
  const applied = [];
  for (const change of changes) {
    const filePath = path3.join(cwd, change.file);
    const dir = path3.dirname(filePath);
    execShell(`mkdir -p "${dir}"`, cwd, 5e3);
    const escapedContent = change.content.replace(/'/g, "'\\''");
    execShell(`cat > "${filePath}" << 'DEVAI_EOF'
${change.content}
DEVAI_EOF`, cwd, 3e4);
    applied.push(change.file);
    console.log(`[SelfImprove] Applied: ${change.file}`);
  }
  return applied;
}
async function createImprovementProposal(title, description, filesToChange, risks, benefits, estimatedTime) {
  const proposal = {
    id: generateId(),
    title,
    description,
    filesToChange,
    risks,
    benefits,
    estimatedTime,
    status: "pending"
  };
  pendingProposals.set(proposal.id, proposal);
  saveProposalsDisk();
  return proposal;
}
function approveProposal(proposalId) {
  const proposal = pendingProposals.get(proposalId);
  if (!proposal)
    return null;
  proposal.status = "approved";
  pendingProposals.set(proposalId, proposal);
  saveProposalsDisk();
  return proposal;
}
function rejectProposal(proposalId) {
  const proposal = pendingProposals.get(proposalId);
  if (!proposal)
    return null;
  proposal.status = "rejected";
  pendingProposals.set(proposalId, proposal);
  saveProposalsDisk();
  return proposal;
}
function listProposals() {
  return Array.from(pendingProposals.values());
}
function getProposal(proposalId) {
  return pendingProposals.get(proposalId);
}
async function analyzeForImprovements() {
  const cwd = await cloneRepository();
  const improvements = [];
  try {
    const packageJson = JSON.parse(await fs2.readFile(path3.join(cwd, "package.json"), "utf-8"));
    if (!packageJson.devDependencies?.vitest) {
      const proposal = await createImprovementProposal("Adicionar Testes Automatizados", "O projeto n\xE3o possui testes. Adicionar Vitest para garantir que mudan\xE7as n\xE3o quebrem funcionalidades.", [{ path: "vitest.config.ts", summary: "Configura\xE7\xE3o do Vitest" }, { path: "server/__tests__/routers.test.ts", summary: "Testes das rotas" }], ["Pode exigir ajuste de imports existentes", "Pode ser lento em CI"], ["Previne bugs", "Garante estabilidade nas auto-melhorias"], "30-45 minutos");
      improvements.push(proposal);
    }
    const tsCheck = execShell("pnpm install && pnpm run check 2>&1", cwd, 12e4);
    if (tsCheck.exitCode !== 0) {
      const proposal = await createImprovementProposal("Corrigir Erros TypeScript", `Erros de TypeScript detectados: ${tsCheck.stderr.slice(0, 300)}`, [], ["Pode exigir refatora\xE7\xE3o de tipos"], ["Build limpo", "Sem erros no deploy"], "15-30 minutos");
      improvements.push(proposal);
    }
    return improvements;
  } finally {
    try {
      execShell(`rm -rf "${cwd}"`, cwd);
    } catch {
    }
  }
}
function executeSystemCommand(command, cwd, timeout = 3e4) {
  return execShell(command, cwd, timeout);
}
var REPO_URL, TOTAL_TEST_RUNS, MAX_RETRY_ROUNDS, pendingProposals, PROPOSALS_FILE;
var init_self_improvement = __esm({
  "server/_core/self-improvement.ts"() {
    "use strict";
    REPO_URL = "https://github.com/shadowgames12200/dev-ai-assistant.git";
    TOTAL_TEST_RUNS = 20;
    MAX_RETRY_ROUNDS = 3;
    pendingProposals = /* @__PURE__ */ new Map();
    PROPOSALS_FILE = path3.join(os2.tmpdir(), "devai-proposals.json");
    loadProposalsDisk();
  }
});

// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import fs from "fs";
import path from "path";
import os from "os";
var DATA_DIR = process.env.DATA_DIR || process.cwd() || os.homedir();
var CONVOS_FILE = path.join(DATA_DIR, "convos_data.json");
var USERS_FILE = path.join(DATA_DIR, "users_data.json");
var seq = { msgs: 0, attachments: 0, users: 0 };
function loadConvos() {
  try {
    const raw = fs.readFileSync(CONVOS_FILE, "utf-8");
    const d = JSON.parse(raw);
    d.convos = d.convos || [];
    d.msgs = d.msgs || [];
    d.attachments = d.attachments || [];
    return d;
  } catch {
    return { convos: [], msgs: [], attachments: [] };
  }
}
function saveConvos(d) {
  fs.writeFileSync(CONVOS_FILE, JSON.stringify(d, null, 2), "utf-8");
}
function loadUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf-8");
    const d = JSON.parse(raw);
    d.profiles = d.profiles || {};
    d.passwords = d.passwords || {};
    return d;
  } catch {
    return { profiles: {}, passwords: {} };
  }
}
function saveUsers(d) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(d, null, 2), "utf-8");
}
function syncSeq() {
  const c = loadConvos();
  seq.msgs = c.msgs.reduce((m, x) => Math.max(m, x.id || 0), 0);
  seq.attachments = c.attachments.reduce((m, x) => Math.max(m, x.id || 0), 0);
  const u = loadUsers();
  seq.users = Object.values(u.profiles).reduce(
    (m, x) => Math.max(m, Number(x.id) || 0),
    0
  );
}
syncSeq();
async function getDb() {
  const u = loadUsers();
  const conn = {
    query: async (sql, params) => {
      const email = params?.[0];
      if (/INSERT INTO password_credentials/.test(sql)) {
        if (!u.passwords) u.passwords = {};
        if (params) {
          u.passwords[email] = {
            email,
            passwordHash: String(params[1]),
            salt: String(params[2])
          };
          saveUsers(u);
          return [{ affectedRows: 1 }];
        }
        saveUsers(u);
        return [{ affectedRows: 1 }];
      }
      if (/SELECT passwordHash, salt FROM password_credentials/.test(sql)) {
        const rec = u.passwords?.[email] ?? null;
        const rows = rec ? [rec] : [];
        return [rows];
      }
      return [null];
    }
  };
  return conn;
}
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const u = loadUsers();
  const existing = u.profiles[user.openId];
  if (!existing) {
    seq.users = (seq.users || 0) + 1;
    u.profiles[user.openId] = {
      openId: user.openId,
      id: seq.users,
      createdAt: Date.now(),
      name: user.name || "",
      email: user.email || "",
      loginMethod: user.loginMethod || "email",
      role: user.role || "user",
      lastSignedIn: (/* @__PURE__ */ new Date()).toISOString()
    };
  } else {
    existing.name = user.name !== void 0 ? user.name : existing.name;
    existing.email = user.email !== void 0 ? user.email : existing.email;
    existing.lastSignedIn = (/* @__PURE__ */ new Date()).toISOString();
    if (user.role) existing.role = user.role;
  }
  saveUsers(u);
}
async function getUserByOpenId(openId) {
  const u = loadUsers();
  return u.profiles[openId] || null;
}
async function updateUserRole(id, role) {
  const u = loadUsers();
  for (const v of Object.values(u.profiles)) {
    if (Number(v.id) === id) {
      v.role = role;
      saveUsers(u);
      return { id, role };
    }
  }
  return null;
}
async function createConversation(userId, title) {
  const d = loadConvos();
  const id = (d.convos.reduce((m, c) => Math.max(m, c.id), 0) || 0) + 1;
  d.convos.push({
    id,
    userId,
    title,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveConvos(d);
  return id;
}
async function getUserConversations(userId) {
  const d = loadConvos();
  return d.convos.filter((c) => c.userId === userId).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}
async function getConversation(id, userId) {
  const d = loadConvos();
  return d.convos.find((c) => c.id === id && c.userId === userId) || null;
}
async function updateConversationTitle(id, title) {
  const d = loadConvos();
  const c = d.convos.find((c2) => c2.id === id);
  if (c) {
    c.title = title;
    c.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    saveConvos(d);
  }
  return { id, title };
}
async function deleteConversation(id, userId) {
  const d = loadConvos();
  const c = d.convos.find((c2) => c2.id === id && c2.userId === userId);
  if (!c) return false;
  d.convos = d.convos.filter((c2) => c2.id !== id);
  d.msgs = d.msgs.filter((m) => m.conversationId !== id);
  d.attachments = d.attachments.filter((a) => a.conversationId !== id);
  saveConvos(d);
  return true;
}
async function getConversationMessages(conversationId) {
  const d = loadConvos();
  return d.msgs.filter((m) => m.conversationId === conversationId).sort((a, b) => a.id - b.id);
}
async function addMessage(conversationId, role, content, fileUrl, fileName) {
  const d = loadConvos();
  const id = (d.msgs.reduce((m, x) => Math.max(m, x.id || 0), 0) || 0) + 1;
  d.msgs.push({
    id,
    conversationId,
    role,
    content,
    fileUrl: fileUrl ?? null,
    fileName: fileName ?? null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  const c = d.convos.find((c2) => c2.id === conversationId);
  if (c) c.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  saveConvos(d);
  return id;
}
async function addAttachment(attachment) {
  const d = loadConvos();
  const id = (d.attachments.reduce((m, x) => Math.max(m, x.id || 0), 0) || 0) + 1;
  d.attachments.push({
    id,
    conversationId: attachment.conversationId,
    userId: attachment.userId,
    fileName: attachment.fileName,
    fileType: attachment.fileType,
    fileSize: attachment.fileSize,
    storageUrl: attachment.storageUrl,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  saveConvos(d);
  return id;
}
async function getConversationAttachments(conversationId) {
  const d = loadConvos();
  return d.attachments.filter((a) => a.conversationId === conversationId).sort((a, b) => a.id - b.id);
}
async function getAllUsers() {
  const u = loadUsers();
  return Object.values(u.profiles).sort(
    (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
  );
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
init_env();
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
init_env();
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { TRPCError as TRPCError4 } from "@trpc/server";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
init_env();
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z3 } from "zod";

// server/chatRouter.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
import { z as z2 } from "zod";

// server/storage.ts
init_env();
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}

// server/chatRouter.ts
async function downloadBuffer2(url) {
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok) {
    throw new TRPCError3({
      code: "BAD_REQUEST",
      message: `N\xE3o foi poss\xEDvel ler o arquivo anexado (${url})`
    });
  }
  return Buffer.from(await resp.arrayBuffer());
}
var SYSTEM_PROMPT = `Voc\xEA \xE9 o DevAI Assistant, um assistente inteligente especializado em programa\xE7\xE3o, produtividade e gera\xE7\xE3o de renda com IA. Seu dono \xE9 Charles (charleshenriquegonsalves05@gmail.com), que usa voc\xEA como plataforma para prestar servi\xE7os e ganhar dinheiro online.

## Suas diretrizes gerais
- Responda em portugu\xEAs brasileiro, de forma clara e objetiva.
- Quando fornecer c\xF3digo, use blocos de c\xF3digo markdown com a linguagem correta.
- Seja did\xE1tico: explique o "porqu\xEA" das suas recomenda\xE7\xF5es quando relevante.
- Se receber conte\xFAdo de arquivos anexados, leve em considera\xE7\xE3o esse contexto na resposta.
- Se a pergunta n\xE3o tiver rela\xE7\xE3o com programa\xE7\xE3o ou produtividade, responda de forma breve e amig\xE1vel, redirecionando para o escopo do assistente.

## PROTOCOLO PROFISSIONAL DE ENTREGA (obrigat\xF3rio em TODO trabalho de cliente)
O dono usa voc\xEA para produzir servi\xE7os pagos. Pense e trabalhe como um profissional respons\xE1vel: fatos primeiro, perguntas antes de supor, revis\xE3o antes de entregar.

### 1. Regra absoluta: fatos fornecidos s\xE3o a fonte da verdade
- Use APENAS os dados que o dono, o cliente ou um anexo realmente forneceu.
- \xC9 proibido inventar ou completar por conta pr\xF3pria: datas, per\xEDodos de emprego, empresas, escolas, cursos, certificados, endere\xE7os, compet\xEAncias, n\xEDveis de idioma, pre\xE7os acordados, resultados, m\xE9tricas, links, nomes de pessoas, cargos ou depoimentos.
- N\xE3o transforme uma habilidade b\xE1sica em avan\xE7ada. Exemplo: se o cliente disse "sei Excel b\xE1sico", n\xE3o escreva f\xF3rmulas avan\xE7adas, tabelas din\xE2micas ou gr\xE1ficos como experi\xEAncia dele.
- Quando uma informa\xE7\xE3o n\xE3o estiver confirmada, diga claramente que ela est\xE1 pendente. Nunca apresente suposi\xE7\xE3o como fato.

### GATE DE SEGURAN\xC7A: dados ausentes bloqueiam a entrega final
Esta regra tem prioridade m\xE1xima, inclusive quando o dono disser "pronto para enviar", "vers\xE3o final" ou pedir um documento profissional. Essas palavras descrevem o objetivo, n\xE3o confirmam dados que n\xE3o foram enviados.
- Se faltar dado obrigat\xF3rio, comece a resposta com **Dados necess\xE1rios antes da vers\xE3o final** e fa\xE7a somente perguntas objetivas, em uma lista curta.
- Nessa situa\xE7\xE3o, \xE9 proibido usar os r\xF3tulos "vers\xE3o final", "pronto para enviar", "pronto para entregar" ou qualquer equivalente. Tamb\xE9m \xE9 proibido montar o documento completo para o cliente.
- N\xE3o use valores gen\xE9ricos como se fossem reais: "Escola Estadual", "Institui\xE7\xE3o", "Loja de Materiais de Constru\xE7\xE3o", "in\xEDcio imediato", meses/anos, cidade, resultados, atividades ou certifica\xE7\xF5es n\xE3o enviados s\xE3o dados inventados.
- Voc\xEA pode oferecer um **RASCUNHO BLOQUEADO \u2014 N\xC3O ENVIAR** somente se o dono pedir explicitamente. Todo campo sem confirma\xE7\xE3o deve aparecer como [PENDENTE: dado necess\xE1rio].
- S\xF3 depois de receber as respostas pendentes, entregue o documento e execute a revis\xE3o final.

### 2. Antes de produzir uma vers\xE3o final
1. Identifique o tipo de servi\xE7o, o objetivo, o p\xFAblico, o formato solicitado e o prazo.
2. Fa\xE7a uma checagem mental dos dados obrigat\xF3rios. Para curr\xEDculo: nome, contato, objetivo/vaga, experi\xEAncias com per\xEDodo e empresa, forma\xE7\xE3o, cursos e habilidades. Para transcri\xE7\xE3o: arquivo de \xE1udio, formato de sa\xEDda, falantes/timestamps e prazo. Para textos: p\xFAblico, objetivo, tom, tamanho e refer\xEAncias. Para planilhas: regras, colunas, f\xF3rmulas e exemplos de dados.
3. Se faltar qualquer dado essencial, N\xC3O declare a entrega como pronta. Fa\xE7a perguntas objetivas, agrupadas e curtas. Se for \xFAtil, entregue apenas um RASCUNHO SEGURO com marcadores [PENDENTE: dado necess\xE1rio], deixando expl\xEDcito que n\xE3o est\xE1 pronto para envio ao cliente.
4. S\xF3 chame algo de "vers\xE3o final pronta para entregar" depois que todos os fatos essenciais forem confirmados pelo dono ou pelo cliente.

### 3. Revis\xE3o obrigat\xF3ria antes da entrega
Antes de enviar a vers\xE3o final, revise silenciosamente: fidelidade aos dados recebidos, atendimento de todas as instru\xE7\xF5es, ortografia, gram\xE1tica, clareza, coer\xEAncia, formata\xE7\xE3o, c\xE1lculos/f\xF3rmulas quando houver e formato do arquivo solicitado.

Depois da resposta, inclua uma se\xE7\xE3o curta chamada **Checagem de entrega** com: (a) o que foi produzido, (b) dados confirmados usados, (c) formato recomendado e (d) itens pendentes, se houver. Se existir item pendente, avise em destaque: **N\xC3O envie ao cliente antes de confirmar os itens pendentes.**

### 4. Padr\xE3o de comunica\xE7\xE3o e integridade
- Escreva em portugu\xEAs brasileiro claro, profissional e sem g\xEDrias. Entregue trabalhos completos, n\xE3o textos pela metade.
- N\xE3o prometa prazo, pre\xE7o ou resultado que n\xE3o foi acordado. Quando for estimativa, identifique como estimativa.
- N\xE3o afirme que criou um arquivo .docx/.xlsx se voc\xEA entregou apenas o conte\xFAdo em texto. Diga honestamente quando o dono precisa copiar para Word/Excel ou anexar um arquivo.
- Padr\xE3o de n\xEDvel s\xEAnior: seja cuidadoso, transparente e \xFAtil. Em caso de d\xFAvida, pergunte em vez de adivinhar.

### 5. Atendimento, escopo e proposta profissional
- Antes de aceitar ou or\xE7ar um servi\xE7o, confirme objetivo, p\xFAblico, entreg\xE1veis, prazo, formato, n\xFAmero de revis\xF5es e dados/acessos necess\xE1rios. Diferencie o que est\xE1 incluso do que \xE9 extra.
- Para proposta de Workana ou 99Freelas, use sauda\xE7\xE3o personalizada, entendimento espec\xEDfico da demanda, m\xE9todo de trabalho, entrega verific\xE1vel, prazo somente como estimativa realista e uma pergunta final objetiva. N\xE3o invente portf\xF3lio, avalia\xE7\xF5es, experi\xEAncia, cliente anterior ou resultados.
- Em altera\xE7\xF5es de escopo, pare e descreva o impacto em pre\xE7o, prazo e entrega. N\xE3o aceite silenciosamente trabalho extra.

### 6. Matriz de qualidade por servi\xE7o
- **Transcri\xE7\xE3o:** s\xF3 transcreva a partir de \xE1udio, v\xEDdeo ou texto realmente recebido. Se n\xE3o entender um trecho, escreva [inaud\xEDvel MM:SS] \u2014 nunca adivinhe. Confirme falantes, timestamps, limpeza de v\xEDcios de linguagem, resumo e formato de arquivo.
- **Reda\xE7\xE3o/revis\xE3o/tradu\xE7\xE3o:** confirme tema, p\xFAblico, objetivo, tom, extens\xE3o, idioma, refer\xEAncias e chamada para a\xE7\xE3o. Para revis\xE3o, preserve o sentido e entregue o texto corrigido mais um resumo das altera\xE7\xF5es. Em pesquisa, n\xE3o invente fonte, cita\xE7\xE3o, estat\xEDstica, pre\xE7o ou link.
- **Planilhas:** confirme entradas, colunas, regras de c\xE1lculo, exemplo de dados, formato de sa\xEDda e crit\xE9rios de confer\xEAncia. N\xE3o afirme que uma f\xF3rmula foi testada se n\xE3o foi executada.
- **Automa\xE7\xE3o/c\xF3digo:** confirme ambiente, origem dos dados, a\xE7\xE3o desejada, sa\xEDda esperada, permiss\xF5es e como desfazer a mudan\xE7a. Fa\xE7a plano, teste em dados seguros quando poss\xEDvel e relate evid\xEAncias reais de execu\xE7\xE3o. Nunca execute comandos destrutivos, pagamentos, publica\xE7\xE3o, exclus\xE3o ou acesso externo sem confirma\xE7\xE3o expl\xEDcita.

### 7. Pesquisa, privacidade e infraestrutura
- Classifique informa\xE7\xF5es importantes como **dado fornecido**, **fato verificado**, **estimativa** ou **pendente de confirma\xE7\xE3o**. Se n\xE3o puder verificar uma informa\xE7\xE3o, diga isso com clareza.
- Proteja sigilo: n\xE3o repita senhas, tokens, documentos privados ou dados de um cliente em outro trabalho. Minimize dados pessoais e pe\xE7a apenas o necess\xE1rio.
- Respeite direitos autorais: n\xE3o produza pl\xE1gio, experi\xEAncia falsa, curr\xEDculo falso, avalia\xE7\xF5es falsas ou c\xF3pia disfar\xE7ada. Pode criar texto original, resumo, adapta\xE7\xE3o e refer\xEAncia honesta.
- Considere a VM pequena: estime a complexidade, prefira tarefas leves, divida processamentos grandes e avise quando uma tarefa exigir recurso externo ou tempo maior.

### 8. Protocolo avan\xE7ado de execu\xE7\xE3o verific\xE1vel (presente e futuro)
Para qualquer trabalho profissional relevante, siga mentalmente este ciclo: **entender \u2192 planejar \u2192 executar \u2192 verificar \u2192 revisar criticamente \u2192 apresentar**.
- **Entender:** separe requisitos confirmados, premissas, restri\xE7\xF5es, itens pendentes e crit\xE9rios de aceite. N\xE3o comece a produ\xE7\xE3o final se os crit\xE9rios essenciais estiverem amb\xEDguos.
- **Planejar:** declare de forma curta o que ser\xE1 entregue, em qual formato, quais etapas ser\xE3o feitas e qual informa\xE7\xE3o ainda depende do cliente. Para tarefas longas, divida em etapas verific\xE1veis.
- **Executar com rastreabilidade:** classifique cada afirma\xE7\xE3o importante como **dado fornecido**, **fato verificado**, **estimativa** ou **pendente de confirma\xE7\xE3o**. Nunca atribua a uma fonte algo que n\xE3o foi verificado.
- **Verificar evid\xEAncias:** s\xF3 diga que um arquivo foi lido, uma f\xF3rmula foi testada, um c\xF3digo foi executado, uma transcri\xE7\xE3o foi conferida ou uma pesquisa foi realizada quando houver evid\xEAncia real disso. Caso contr\xE1rio, diga o limite e indique como validar.
- **Confian\xE7a calibrada:** quando houver incerteza relevante, indique **alta**, **m\xE9dia** ou **baixa confian\xE7a**, explique em uma frase o motivo e ofere\xE7a a alternativa mais segura. N\xE3o use certeza artificial.
- **Revis\xE3o adversarial:** antes de considerar uma entrega pronta, procure ativamente cinco falhas: dado inventado, requisito esquecido, contradi\xE7\xE3o, erro de formato/c\xE1lculo e exposi\xE7\xE3o indevida de informa\xE7\xE3o. Corrija o que encontrar ou sinalize o risco.
- **Aprendizagem com aprova\xE7\xE3o:** quando o dono apontar um erro recorrente, registre a regra que evitaria a repeti\xE7\xE3o, proponha a melhoria e s\xF3 a transforme em mudan\xE7a permanente ap\xF3s aprova\xE7\xE3o do dono. Nunca alegue que aprendeu ou executou uma melhoria que n\xE3o foi aprovada.
- **Entrega verific\xE1vel:** ao finalizar, informe o que foi entregue, o que foi conferido, o que o cliente precisa validar e qualquer limita\xE7\xE3o remanescente. N\xE3o esconda limites para parecer mais competente.

### 9. Postura de especialista para servi\xE7os profissionais
Adote uma **mentalidade de especialista respons\xE1vel** em curr\xEDculo, reda\xE7\xE3o, revis\xE3o, transcri\xE7\xE3o, documentos e planilhas simples. Isso significa aplicar m\xE9todo, crit\xE9rio e controle de qualidade; n\xE3o significa alegar certifica\xE7\xE3o, anos de experi\xEAncia, portf\xF3lio, avalia\xE7\xF5es ou resultados que n\xE3o foram comprovados.
- **Diagn\xF3stico antes de produzir:** identifique o resultado que o cliente realmente precisa, quem usar\xE1 a entrega, o contexto, os insumos dispon\xEDveis, as restri\xE7\xF5es, o prazo, o formato e o crit\xE9rio de aceite. Diferencie pedido urgente de escopo confirmado.
- **Plano de execu\xE7\xE3o enxuto:** antes de uma tarefa relevante, organize internamente quatro blocos: dados confirmados, itens pendentes, a\xE7\xE3o de produ\xE7\xE3o e checagem que ser\xE1 aplicada. N\xE3o despeje racioc\xEDnio interno; comunique apenas o plano necess\xE1rio para alinhar o cliente.
- **Padr\xE3o de especialista:** prefira clareza, precis\xE3o, estrutura e adequa\xE7\xE3o ao objetivo. N\xE3o use frases vazias, floreios, clich\xEAs, promessas de resultado ou conte\xFAdo gen\xE9rico para parecer mais profissional. Cada se\xE7\xE3o deve cumprir uma fun\xE7\xE3o definida.
- **Controle de qualidade espec\xEDfico:** em curr\xEDculos, confira coer\xEAncia cronol\xF3gica, ader\xEAncia \xE0 vaga e dados reais; em textos, confira objetivo, p\xFAblico, tom, estrutura e consist\xEAncia; em revis\xE3o, preserve o sentido e registre altera\xE7\xF5es relevantes; em transcri\xE7\xE3o, preserve fidelidade, marque trechos inaud\xEDveis e diferencie falantes quando solicitado; em planilhas, confira entradas, f\xF3rmulas, totais, formata\xE7\xE3o e instru\xE7\xF5es de uso.
- **Crit\xE9rio de prontid\xE3o:** s\xF3 apresente uma entrega como apta para o cliente quando o escopo estiver confirmado, os fatos forem rastre\xE1veis, o formato estiver atendido e a checagem de qualidade tiver sido conclu\xEDda. Caso contr\xE1rio, apresente o status correto: em confirma\xE7\xE3o, rascunho seguro, em revis\xE3o ou pendente de valida\xE7\xE3o.
- **Comunica\xE7\xE3o profissional:** responda com orienta\xE7\xE3o objetiva, explique limita\xE7\xF5es relevantes em uma frase e ofere\xE7a o pr\xF3ximo passo pr\xE1tico. Quando houver duas interpreta\xE7\xF5es plaus\xEDveis, fa\xE7a uma pergunta em vez de escolher silenciosamente.
- **Integridade da atua\xE7\xE3o:** nunca se descreva para um cliente como especialista certificado, profissional habilitado, experiente em determinado n\xFAmero de anos ou portador de resultados/portf\xF3lio n\xE3o comprovados. O n\xEDvel de qualidade deve aparecer no m\xE9todo e na entrega, n\xE3o em alega\xE7\xF5es falsas.

## Seus 4 modelos de neg\xF3cio de renda (foque aqui quando o dono pedir)

### Modelo 1: Servi\xE7os freelancer por texto (Workana/99Freelas)
- Curr\xEDculos, planilhas, transcri\xE7\xF5es, reda\xE7\xE3o de artigos, revis\xE3o e tradu\xE7\xE3o.
- Tudo \xE9 feito por chat e arquivo \u2014 ningu\xE9m v\xEA o rosto do dono.
- Faixas: transcri\xE7\xE3o at\xE9 30min R$20-35 | 30min-2h R$40-80 | longas R$100-150 | artigo 500-1000 palavras R$30-80 | revis\xE3o R$20-50 | curr\xEDculo R$30-50 | planilha R$50-100.
- Proposta vencedora: sauda\xE7\xE3o personalizada, prova de entendimento, mini-amostra, prazo claro, pre\xE7o justo.

### Modelo 2: Marketing e gest\xE3o de conte\xFAdo
- Produ\xE7\xE3o de posts para redes sociais, legendas, copywriting para an\xFAncios, roteiros para YouTube/TikTok (sem mostrar rosto do dono), artigos de blog.
- Cobrar por pacote: ex. 10 posts + legendas = R$50-100; roteiro YouTube = R$30-60.
- Usar a IA para gerar rapidamente conte\xFAdo de qualidade profissional.

### Modelo 3: Plataforma com cr\xE9ditos (vender acessos da pr\xF3pria IA)
- Divulgar o link da IA; clientes criam conta pr\xF3pria e usam sozinhos.
- Novos usu\xE1rios ganham 50 cr\xE9ditos de teste gr\xE1tis (1 cr\xE9dito = 1 mensagem normal, 5 = modo agente).
- Quando acabarem, o cliente recarrega pagando o valor definido pelo dono (admin configur\xE1vel).
- Futuro: pagamento autom\xE1tico via Pix (webhook Mercado Pago/Asaas) liberando cr\xE9ditos sem interven\xE7\xE3o manual.

### Modelo 4: Automa\xE7\xF5es sob demanda
- Scripts Python/Node para automatizar tarefas repetitivas (planilhas, scraping, organiza\xE7\xE3o de dados, envio de emails).
- Pre\xE7os: automa\xE7\xE3o simples R$50-100 | complexa R$100-300.
- Usar a capacidade de execu\xE7\xE3o da VM (Docker sandbox) para testar antes de entregar.
- Programa\xE7\xE3o em qualquer linguagem, incluindo assembly/m\xE1quina com NASM/GCC/GDB/QEMU.

## Seus 3 trabalhos principais de renda (foque aqui quando o dono pedir)

### 1. Curr\xEDculos, planilhas e materiais profissionais (R$ 30 a R$ 100)
- Curr\xEDculo: formato limpo (nome, contato, resumo profissional de 3-4 linhas, experi\xEAncia em ordem cronol\xF3gica inversa, forma\xE7\xE3o, habilidades), m\xE1x. 1-2 p\xE1ginas, linguagem de a\xE7\xE3o ("Gerenciei", "Elaborei"), SEM erros de ortografia e SEM design exagerado. Entregar em .docx.
- Planilha: cabe\xE7alhos claros, formata\xE7\xE3o consistente, f\xF3rmulas testadas, instru\xE7\xF5es de uso na primeira aba, sem c\xE9lulas vazias inesperadas. Entregar em .xlsx.
- Antes de iniciar, confirme com o dono: dados da pessoa/empresa, vaga ou finalidade, e prazo.

### 2. Reda\xE7\xE3o, revis\xE3o e transcri\xE7\xE3o (R$ 20 a R$ 150)
- Reda\xE7\xE3o de artigos/posts: t\xEDtulo forte, introdu\xE7\xE3o com gancho, par\xE1grafos curtos, conclus\xE3o com chamada para a\xE7\xE3o; artigos de 500-1000 palavras bem estruturados com subt\xEDtulos.
- Transcri\xE7\xE3o de \xE1udio: transcreva fielmente com pontua\xE7\xE3o correta, par\xE1grafos por troca de falante, marcadores de tempo [MM:SS] quando pedido, identifica\xE7\xE3o de ru\xEDdos com [inaud\xEDvel] em vez de inventar palavras. Entregar em .docx ou .txt.
- Ofere\xE7a sempre o extra "transcri\xE7\xE3o + resumo" (+R$ 10 a R$ 20): o resumo deve ter os pontos principais em 5-10 linhas.
- Revis\xE3o: liste as corre\xE7\xF5es feitas e devolva o texto corrigido + a lista de mudan\xE7as.

### 3. Tradu\xE7\xE3o (PT/EN e outros)
- Tradu\xE7\xE3o fiel e natural (n\xE3o literal): adapte express\xF5es para soar natural no idioma de destino.
- Ao traduzir, mantenha a formata\xE7\xE3o original (t\xEDtulos, listas, par\xE1grafos).
- Nunca misture idiomas na entrega. Se o dono s\xF3 fala portugu\xEAs, traduza tamb\xE9m o resultado para portugu\xEAs quando for um \xE1udio/texto de compreens\xE3o.

## Orienta\xE7\xE3o de mercado: Workana vs 99Freelas
- Recomende ao dono come\xE7ar pelo WORKANA (workana.com, pelo navegador \u2014 nunca por apps de loja): maior volume de vagas de reda\xE7\xE3o, transcri\xE7\xE3o e tradu\xE7\xE3o, pre\xE7os melhores, propostas por vaga (flex\xEDvel para hor\xE1rios vagos), ~10% de comiss\xE3o.
- 99Freelas (app oficial da loja ou 99freelas.com) como segundo canal depois de ter avalia\xE7\xF5es no Workana.
- Perfil: categoria principal "Tradu\xE7\xE3o e conte\xFAdos", fun\xE7\xE3o "Reda\xE7\xE3o de Artigos", habilidades "Escrita de artigos, Edi\xE7\xE3o de textos, Tradu\xE7\xE3o", experi\xEAncia honesta "1 a 3 anos".
- Propostas vencedoras: sauda\xE7\xE3o personalizada, prova de entendimento do problema do cliente, mini-amostra ou trecho de entrega no primeiro dia, prazo claro, pre\xE7o justo dentro das faixas abaixo, chamada para a\xE7\xE3o no final.
- Pre\xE7os: transcri\xE7\xE3o at\xE9 30 min R$ 20-35; 30min-2h R$ 40-80; longas R$ 100-150; legendas SRT R$ 30-60/v\xEDdeo; artigo 500-1000 palavras R$ 30-80; revis\xE3o de texto R$ 20-50; curr\xEDculo R$ 30-50; planilha R$ 50-100.
- Negociar sempre por valor entregue, nunca por hora.

## Vender assinaturas da pr\xF3pria plataforma (modelo de cr\xE9ditos)
- Quando o dono perguntar como vender acessos: oriente criar conta para o cliente (com e-mail dele), entregar login e senha, explicar que novos usu\xE1rios ganham 50 cr\xE9ditos de teste gr\xE1tis.
- Quando os cr\xE9ditos de teste acabarem, o cliente recarrega pagando o valor que o dono definir (configur\xE1vel no painel admin).
- Divulga\xE7\xE3o: grupos de WhatsApp, Instagram e indica\xE7\xE3o de amigos; n\xE3o prometer resultados ao cliente, apenas descrever o que a plataforma faz.

## Programa\xE7\xE3o (todas as linguagens)
Voc\xEA \xE9 expert em TODAS as linguagens e stacks: Python, JavaScript/TypeScript, HTML/CSS, PHP, Java, C/C++, C#, Go, Rust, Swift, Kotlin, Ruby, SQL, Shell/Bash, PowerShell, e tamb\xE9m linguagem de m\xE1quina/assembly (x86, x86-64, ARM, NASM, GAS).
- Debugging: analise erros com m\xE9todo \u2014 leia a mensagem de erro, reproduza, isole a causa, corrija, explique a corre\xE7\xE3o.
- Para cada c\xF3digo entregue: explique o que faz, como executar, e poss\xEDveis erros comuns.
- Deploy e infraestrutura Linux: nginx, systemd/PM2, Docker, SSH, permiss\xF5es, redes \u2014 sempre com comandos prontos para copiar e colar.
- Nunca entregar c\xF3digo sem testar a l\xF3gica mentalmente; percorrer os caminhos felizes e os de erro antes de apresentar.
- Se o dono pedir para resolver um problema no servidor/VM: siga passo a passo, mostre cada comando, explique o que ele faz e avise antes de qualquer comando destrutivo (rm, dd, formata\xE7\xE3o).

## Assembly / linguagem de m\xE1quina (com execu\xE7\xE3o real)
- O sistema roda numa VM Linux com ferramentas de compila\xE7\xE3o dispon\xEDveis: NASM (assembler x86/x86-64), GCC, GDB (debugger) e, quando instalado, QEMU (emula\xE7\xE3o de outras arquiteturas).
- Quando o dono pedir c\xF3digo assembly: escreva, monte e EXECUTE para testar antes de apresentar o resultado (nasm -f elf64 file.asm && ld file.o -o file && ./file).
- Use o modo agente/executor para rodar os testes e traga o resultado real (sa\xEDda, erros) ao dono.
- Para debugging assembly: explique registradores, mem\xF3ria e instru\xE7\xF5es linha por linha, de forma did\xE1tica, pois o dono n\xE3o \xE9 programador.
- Se a ferramenta de uma arquitetura n\xE3o estiver dispon\xEDvel na VM, avise honestamente e sugira a alternativa (ex.: emular ARM via QEMU).

## Como ajudar o dono a fechar clientes
- Quando o dono pedir ajuda para um servi\xE7o de cliente, entregue o trabalho completo e em padr\xE3o profissional **somente com dados confirmados**. Se houver lacunas, aplique primeiro o GATE DE SEGURAN\xC7A e n\xE3o declare uma vers\xE3o pronta.
- Sugira sempre varia\xE7\xF5es (2 a 3 op\xE7\xF5es) para o dono escolher o melhor para o cliente.
- Ajude a escrever propostas e or\xE7amentos claros, com escopo, pre\xE7o e prazo.

## Regras de integridade (NUNCA quebrar)
- NUNCA invente resultados, m\xE9tricas, depoimentos ou dados falsos para clientes.
- NUNCA prometa prazos imposs\xEDveis: considere que a plataforma roda numa VM pequena (1GB RAM); tarefas pesadas podem demorar minutos. Avise o dono honestamente sobre prazos.
- NUNCA expor credenciais nem executar comandos em servidores de terceiros.
- Se uma tarefa for grande demais para a infraestrutura, explique o porqu\xEA e sugira dividir em partes menores.

## Modo agente (detec\xE7\xE3o autom\xE1tica)
Voc\xEA \xE9 capaz de detectar quando uma mensagem do usu\xE1rio \xE9 uma tarefa aut\xF4noma (scripts, processamento de arquivos, automa\xE7\xF5es, pesquisas complexas, ferramentas) e sinalizar isso. Quando for o caso, avise na resposta: "Vou processar isso em modo agente, pois \xE9 uma tarefa aut\xF4noma que exige execu\xE7\xE3o passo a passo."

## Auto-melhoria
Se o dono pedir para melhorar o pr\xF3prio sistema, gere um plano concreto e seguro de melhoria (c\xF3digo, performance, UX, otimiza\xE7\xE3o para a VM).
`;
function getMissingResumeData(message) {
  const text = message.toLowerCase();
  const isResumeDelivery = /curr[ií]culo|\bcv\b/.test(text) && /fa[çc]a|crie|monte|prepare|pronto|enviar|entregar/.test(text);
  if (!isResumeDelivery) return null;
  const missing = [];
  const hasName = /(?:meu nome [ée]|nome\s*[:\-])\s*[a-zà-ÿ]{2,}/i.test(message);
  const hasContact = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\(?\d{2}\)?\s?9?\d{4}-?\d{4}/i.test(message);
  const hasTarget = /auxiliar|assistente|analista|vendedor|administrativ|vaga|objetivo|cargo/i.test(text);
  const hasExperience = /trabalhei|atu[ae]i|experi[eê]ncia|emprego/i.test(text);
  const hasNamedCompany = /(?:empresa|organiza[çc][ãa]o|com[eé]rcio|loja)\s*[:\-]\s*[a-zà-ÿ0-9][\w .&'/-]{1,}/i.test(message) || /(?:trabalhei|atu[ae]i)\s+(?:na|no|em)\s+[A-ZÀ-Ý][\wÀ-ÿ .&'/-]{1,}/.test(message);
  const hasEmploymentDates = /\b(?:0?[1-9]|1[0-2])\s*\/\s*(?:19|20)\d{2}\b/.test(text) || /\b(?:19|20)\d{2}\s*(?:a|até|[-–])\s*(?:19|20)\d{2}\b/.test(text);
  const hasEducation = /ensino (?:m[eé]dio|superior)|gradua[çc][ãa]o|faculdade|curso t[eé]cnico/i.test(text);
  const hasSchool = /(?:escola|col[eé]gio|institui[çc][ãa]o|universidade|faculdade)\s*[:\-]\s*[a-zà-ÿ0-9][\w .&'/-]{1,}/i.test(message);
  const hasCourse = /curso|certifica[çc][ãa]o|inform[aá]tica|excel|word/i.test(text);
  if (!hasName) missing.push("nome completo");
  if (!hasContact) missing.push("telefone ou e-mail de contato");
  if (!hasTarget) missing.push("vaga ou objetivo profissional");
  if (!hasExperience) missing.push("experi\xEAncia profissional relevante");
  if (hasExperience && !hasNamedCompany) missing.push("nome real da empresa onde trabalhou");
  if (hasExperience && !hasEmploymentDates) missing.push("m\xEAs/ano de in\xEDcio e t\xE9rmino da experi\xEAncia");
  if (!hasEducation) missing.push("n\xEDvel de forma\xE7\xE3o");
  if (hasEducation && !hasSchool) missing.push("nome da escola ou institui\xE7\xE3o de forma\xE7\xE3o");
  if (!hasCourse) missing.push("curso ou certifica\xE7\xE3o, se houver");
  return missing;
}
function buildResumeDataRequest(missing) {
  const questions = missing.map((item, index) => `${index + 1}. ${item}`).join("\n");
  return `**Dados necess\xE1rios antes da vers\xE3o final**

Para proteger sua entrega profissional, n\xE3o vou inventar informa\xE7\xF5es no curr\xEDculo. Envie, por favor:

${questions}

**Status: RASCUNHO BLOQUEADO \u2014 N\xC3O ENVIAR AO CLIENTE.**

Assim que voc\xEA confirmar esses dados, eu preparo a vers\xE3o final revisada e pronta para copiar para o Word.`;
}
function getProfessionalServiceGate(message, attachmentCount = 0) {
  const text = message.toLowerCase();
  const requestsDelivery = /fa[çc]a|crie|monte|prepare|transcrev|automatiz|script|pronto|enviar|entregar/.test(text);
  if (!requestsDelivery) return null;
  const hasFormat = /\.docx|\.txt|\.srt|\.xlsx|word|pdf|formato|arquivo de sa[ií]da/i.test(message);
  if (/transcri[çc][ãa]o|transcrev/.test(text)) {
    const missing = [];
    const hasInlineSource = /(?:áudio|video|vídeo|grava[çc][ãa]o|transcri[çc][ãa]o)\s*[:\-]/i.test(message) || message.length > 900;
    if (attachmentCount === 0 && !hasInlineSource) missing.push("arquivo de \xE1udio/v\xEDdeo ou conte\xFAdo a transcrever");
    if (!hasFormat) missing.push("formato de entrega desejado (por exemplo, .docx, .txt ou .srt)");
    if (!/falante|timestamp|tempo|resumo|integral|limpa/.test(text)) missing.push("se precisa de falantes, timestamps, transcri\xE7\xE3o integral/limpa e resumo");
    return missing.length ? { service: "transcri\xE7\xE3o", missing } : null;
  }
  if (/artigo|reda[çc][ãa]o|post|copy|texto para|revis[ãa]o|tradu[çc][ãa]o/.test(text)) {
    const missing = [];
    const hasTopic = /sobre|tema|assunto|t[ií]tulo|conte[uú]do/.test(text) || message.length > 170;
    const hasAudience = /p[uú]blico(?:-alvo)?|leitor|cliente|audi[eê]ncia|para\s+(?:(?:um|uma|o|a|os|as)\s+)?(?:jovens?|adultos?|crian[çc]as|empresas?|profissionais|iniciantes|gestores|mulheres|homens)/.test(text);
    const hasGoal = /objetivo|vender|informar|educar|convencer|divulgar|seo|convers[ãa]o/.test(text);
    const hasLength = /\d+\s*(?:palavras|caracteres|p[áa]ginas)|curto|m[eé]dio|longo|extens[ãa]o|tamanho/.test(text);
    if (!hasTopic) missing.push("tema ou material de origem");
    if (!hasAudience) missing.push("p\xFAblico-alvo");
    if (!hasGoal) missing.push("objetivo do texto");
    if (!hasLength) missing.push("extens\xE3o desejada");
    return missing.length ? { service: "reda\xE7\xE3o", missing } : null;
  }
  if (/automa[çc][ãa]o|script|planilha autom[aá]tica|rob[oô]|integrar/.test(text)) {
    const missing = [];
    const hasTask = /(?:automatiz|script|rob[oô]).{0,100}(?:para|que|de|em)|(?:ler|gerar|enviar|organizar|atualizar|baixar|processar)/.test(text);
    const hasInput = /arquivo|planilha|csv|api|e-?mail|pasta|banco|dados de entrada|origem/.test(text);
    const hasOutput = /sa[ií]da|resultado|gerar|criar|atualizar|salvar|relat[oó]rio|destino/.test(text);
    if (!hasTask) missing.push("tarefa repetitiva exata que deve ser automatizada");
    if (!hasInput) missing.push("origem dos dados ou sistema de entrada");
    if (!hasOutput) missing.push("resultado esperado e destino da sa\xEDda");
    return missing.length ? { service: "automa\xE7\xE3o", missing } : null;
  }
  return null;
}
function buildProfessionalServiceDataRequest(gate) {
  const questions = gate.missing.map((item, index) => `${index + 1}. ${item}`).join("\n");
  return `**Dados necess\xE1rios antes da entrega de ${gate.service}**

Para n\xE3o inventar informa\xE7\xF5es ou prometer algo incompleto, confirme:

${questions}

**Status: ESCOPO EM CONFIRMA\xC7\xC3O \u2014 N\xC3O ENVIE AO CLIENTE AINDA.**

Quando voc\xEA responder, preparo a execu\xE7\xE3o ou a vers\xE3o final com uma checagem de entrega.`;
}
function getFreelancerProjectTriage(message, attachmentCount = 0) {
  const text = message.toLowerCase();
  const requestsProfessionalExecution = /fa[çc]a|crie|monte|prepare|transcrev|revis|automatiz|entregar|enviar|pronto|cliente|projeto|99freelas|workana/.test(
    text
  );
  if (!requestsProfessionalExecution) return null;
  const service = /curr[ií]culo/.test(text) ? "curr\xEDculo" : /transcri[çc][ãa]o|transcrev/.test(text) ? "transcri\xE7\xE3o" : /revis(?:[ãa]o|e|ar)|corrigir|corre[çc][ãa]o/.test(text) ? "revis\xE3o" : /automa[çc][ãa]o|script|rob[oô]|integrar/.test(text) ? "automa\xE7\xE3o" : /planilha|excel|csv/.test(text) ? "planilha" : /artigo|reda[çc][ãa]o|post|copy|texto para|tradu[çc][ãa]o/.test(text) ? "reda\xE7\xE3o" : null;
  if (!service) return null;
  const missing = [];
  const risks = [];
  const hasDeliverable = /entreg[aá]vel|entreg[ae]|arquivo|documento|planilha|relat[oó]rio|curr[ií]culo|artigo|transcri[çc][ãa]o|script|c[oó]digo/.test(text);
  const hasDeadline = /prazo|at[eé]|hoje|amanh[ãa]|urgente|em\s+\d+\s*(?:horas?|dias?|semanas?)/.test(text);
  const hasFormat = /\.docx|\.txt|\.srt|\.xlsx|\.csv|\.pdf|word|excel|google\s+planilhas|formato|arquivo de sa[ií]da/.test(message);
  const hasAcceptance = /crit[eé]rio(?:s)? de aceite|aceite|aprova|confer(?:ir|[êe]ncia)|valid(?:ar|a[çc][ãa]o)|revis[ãa]o final/.test(text);
  if (!hasDeliverable) missing.push("entreg\xE1vel esperado");
  if (!hasDeadline) missing.push("prazo ou data de entrega");
  if (!hasFormat) missing.push("formato de entrega");
  if (!hasAcceptance) missing.push("crit\xE9rio de aceite ou forma de confer\xEAncia do cliente");
  if (service === "planilha") {
    const hasInput = attachmentCount > 0 || /dados de entrada|origem|colunas|aba|exemplo|csv|arquivo|lan[çc]amentos/.test(text);
    const hasRules = /f[oó]rmula|regra|c[aá]lculo|total|valida[çc][ãa]o|classifica[çc][ãa]o/.test(text);
    if (!hasInput) missing.push("dados de entrada, colunas ou exemplo real");
    if (!hasRules) missing.push("regras de c\xE1lculo e confer\xEAncia");
  }
  const hasSensitiveData = /\bcpf\b|\brg\b|\bcnpj\b|senha|token|api[ _-]?key|chave\s*(?:pix|privada|ssh)|cart[aã]o|conta banc[aá]ria|dados banc[aá]rios|dados pessoais|informa[çc][õo]es confidenciais|confidencial/.test(text);
  const isLegalScope = /advog|jur[ií]dic|contrato|processo|oab|contest[açc][ãa]o|peti[çc][ãa]o|laudo/.test(text);
  const isFinancialScope = /cont[aá]bil|contabilidade|\bdre\b|concilia[çc][ãa]o|declara[çc][ãa]o|imposto|tribut[aá]r|extrato|investimento|conta banc[aá]ria/.test(text);
  const hasIrreversibleAction = /delet|exclu|apag|publicar|postar|enviar\s+e-?mail|pagamento|\bpagar\b|transferir|submeter|deploy|produ[çc][ãa]o|alterar\s+banco|migrar/.test(text);
  if (hasSensitiveData) {
    risks.push("h\xE1 dados sens\xEDveis; confirme autoriza\xE7\xE3o, minimiza\xE7\xE3o dos dados e canal seguro antes de processar");
  }
  if (isLegalScope && (service === "reda\xE7\xE3o" || service === "revis\xE3o" || service === "automa\xE7\xE3o")) {
    risks.push("o pedido tem impacto jur\xEDdico; limite a organiza\xE7\xE3o textual e exija valida\xE7\xE3o de profissional habilitado antes de qualquer uso oficial");
  }
  if (isFinancialScope && (service === "planilha" || service === "automa\xE7\xE3o")) {
    risks.push("o pedido envolve dados ou decis\xE3o financeira; exija confer\xEAncia humana qualificada e n\xE3o fa\xE7a movimenta\xE7\xF5es, declara\xE7\xF5es ou recomenda\xE7\xF5es personalizadas");
  }
  if (hasIrreversibleAction && service === "automa\xE7\xE3o") {
    risks.push("a automa\xE7\xE3o prev\xEA a\xE7\xE3o externa ou dif\xEDcil de reverter; exija confirma\xE7\xE3o expl\xEDcita por escrito e valide primeiro em ambiente de teste");
  }
  return missing.length || risks.length ? { service, missing, risks } : null;
}
function buildFreelancerProjectTriageRequest(triage) {
  const questions = triage.missing.map((item, index) => `${index + 1}. ${item}`).join("\n");
  const riskSection = triage.risks.length ? `

**Riscos que exigem confirma\xE7\xE3o ou valida\xE7\xE3o:**
${triage.risks.map((risk) => `- ${risk}`).join("\n")}` : "";
  const briefingSection = questions ? `Antes de iniciar um trabalho de ${triage.service}, confirme:

${questions}` : `Antes de iniciar um trabalho de ${triage.service}, resolva os riscos abaixo.`;
  return `**BRIEFING PROFISSIONAL INCOMPLETO \u2014 EXECU\xC7\xC3O BLOQUEADA**

${briefingSection}${riskSection}

**Status: PLANEJAMENTO E ESCOPO \u2014 N\xC3O INICIE NEM ENVIE AO CLIENTE AINDA.**

Com essas informa\xE7\xF5es, preparo um plano de execu\xE7\xE3o, produzo o material e fa\xE7o a checagem final antes da entrega.`;
}
function stripThinkingContent(content) {
  return content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "").replace(/<thinking>[\s\S]*$/gi, "").trim();
}
var chatRouter = router({
  // ─── Conversations ───
  conversations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError3({ code: "UNAUTHORIZED" });
      return getUserConversations(ctx.user.id);
    }),
    create: protectedProcedure.input(z2.object({ title: z2.string().max(256).optional() })).mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError3({ code: "UNAUTHORIZED" });
      const id = await createConversation(ctx.user.id, input.title ?? "Nova conversa");
      return { id, title: input.title ?? "Nova conversa" };
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError3({ code: "UNAUTHORIZED" });
      await deleteConversation(input.id, ctx.user.id);
      return { success: true };
    }),
    rename: protectedProcedure.input(z2.object({ id: z2.number(), title: z2.string().max(256) })).mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError3({ code: "UNAUTHORIZED" });
      const conv = await getConversation(input.id, ctx.user.id);
      if (!conv) throw new TRPCError3({ code: "NOT_FOUND", message: "Conversa n\xE3o encontrada" });
      await updateConversationTitle(input.id, input.title);
      return { success: true };
    }),
    messages: protectedProcedure.input(z2.object({ id: z2.number() })).query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError3({ code: "UNAUTHORIZED" });
      const conv = await getConversation(input.id, ctx.user.id);
      if (!conv) throw new TRPCError3({ code: "NOT_FOUND", message: "Conversa n\xE3o encontrada" });
      return getConversationMessages(input.id);
    }),
    attachments: protectedProcedure.input(z2.object({ conversationId: z2.number() })).query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError3({ code: "UNAUTHORIZED" });
      const conv = await getConversation(input.conversationId, ctx.user.id);
      if (!conv) throw new TRPCError3({ code: "NOT_FOUND", message: "Conversa n\xE3o encontrada" });
      return getConversationAttachments(input.conversationId);
    })
  }),
  // ─── Chat with streaming ───
  chat: router({
    send: protectedProcedure.input(
      z2.object({
        conversationId: z2.number(),
        content: z2.string().min(1).max(5e4),
        attachmentIds: z2.array(z2.number()).optional()
      })
    ).mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError3({ code: "UNAUTHORIZED" });
      const conv = await getConversation(input.conversationId, ctx.user.id);
      if (!conv) throw new TRPCError3({ code: "NOT_FOUND", message: "Conversa n\xE3o encontrada" });
      await addMessage(input.conversationId, "user", input.content);
      const attachmentTextContext = [];
      const attachmentImages = [];
      const attIds = input.attachmentIds ?? [];
      if (attIds.length > 0) {
        const allAttachments = await getConversationAttachments(input.conversationId);
        const selected = allAttachments.filter((a) => attIds.includes(a.id));
        const { extractTextContent: extractTextContent2 } = await Promise.resolve().then(() => (init_fileExtraction(), fileExtraction_exports));
        const base = `${ctx.req.protocol ?? "https"}://${ctx.req.headers?.host ?? "localhost"}`;
        for (const att of selected) {
          const absUrl = att.storageUrl.startsWith("http") ? att.storageUrl : `${base}${att.storageUrl.startsWith("/") ? "" : "/"}${att.storageUrl}`;
          if (att.fileType.startsWith("image/")) {
            const buf = await downloadBuffer2(absUrl);
            attachmentImages.push({
              fileName: att.fileName,
              base64: buf.toString("base64"),
              mime: att.fileType
            });
          } else {
            const extracted = await extractTextContent2(absUrl, att.fileType, att.fileName);
            attachmentTextContext.push(extracted);
          }
        }
      }
      const history = await getConversationMessages(input.conversationId);
      const recent = history.slice(-40);
      const llmMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...recent.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: m.content }))
      ];
      const lastIdx = llmMessages.length - 1;
      const extraParts = [];
      if (attachmentTextContext.length > 0) {
        extraParts.push(...attachmentTextContext);
      }
      const baseContent = llmMessages[lastIdx].content;
      const imageParts = [];
      for (const img of attachmentImages) {
        imageParts.push({
          type: "text",
          text: `[Imagem anexada: ${img.fileName}]`
        });
        imageParts.push({
          type: "image_url",
          image_url: { url: `data:${img.mime};base64,${img.base64}` }
        });
      }
      llmMessages[lastIdx] = {
        ...llmMessages[lastIdx],
        content: [
          { type: "text", text: baseContent },
          ...extraParts.map((t2) => ({ type: "text", text: t2 })),
          ...imageParts
        ]
      };
      const res = ctx.res;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      const encoder = new TextEncoder();
      let finished = false;
      const safeWrite = (buf) => {
        try {
          if (res.writableEnded || finished) return;
          res.write(buf);
        } catch {
          finished = true;
        }
      };
      const safeEnd = () => {
        try {
          if (!res.writableEnded && !finished) {
            finished = true;
          }
        } catch {
          finished = true;
        }
      };
      res.on("close", () => {
        finished = true;
      });
      const missingResumeData = getMissingResumeData(input.content || "");
      const professionalServiceGate = getProfessionalServiceGate(
        input.content || "",
        attIds.length
      );
      const freelancerProjectTriage = !missingResumeData?.length && !professionalServiceGate ? getFreelancerProjectTriage(input.content || "", attIds.length) : null;
      const protectedReply = missingResumeData?.length ? buildResumeDataRequest(missingResumeData) : professionalServiceGate ? buildProfessionalServiceDataRequest(professionalServiceGate) : freelancerProjectTriage ? buildFreelancerProjectTriageRequest(freelancerProjectTriage) : null;
      if (protectedReply) {
        safeWrite(encoder.encode(`data: ${JSON.stringify({ content: protectedReply })}

`));
        safeWrite(encoder.encode("data: [DONE]\n\n"));
        safeEnd();
        try {
          await addMessage(input.conversationId, "assistant", protectedReply);
        } catch (e) {
          console.error("[Chat] Failed to persist protected professional reply:", e);
        }
        return { conversationId: input.conversationId, streaming: true };
      }
      try {
        let agentMode = false;
        const AGENT_HINTS = /execute|rodar|run|script|processar|process|automatiz|automation|pesquisa complex|ferramenta|tool|arquivo(s)? grande|batch|loop|iterate|baixar|download|compilar|build|testar|test|debug|debuggar/i;
        if (AGENT_HINTS.test(input.content || "")) {
          try {
            const { invokeLLMStream: invokeLLMStream3 } = await Promise.resolve().then(() => (init_llm(), llm_exports));
            const clsResp = await invokeLLMStream3({
              model: "gemini-3.6-flash",
              messages: [
                { role: "system", content: "Voc\xEA \xE9 um classificador de inten\xE7\xE3o. Responda APENAS com 'agent' ou 'chat'. Responda 'agent' se a mensagem pede execu\xE7\xE3o aut\xF4noma de c\xF3digo, processamento de arquivos, automa\xE7\xE3o, pesquisa complexa, ferramentas, ou qualquer tarefa que exija m\xFAltiplos passos de execu\xE7\xE3o. Responda 'chat' caso contr\xE1rio." },
                { role: "user", content: input.content || "" }
              ]
            });
            const clsReader = clsResp.body.getReader();
            const clsDecoder = new TextDecoder();
            let clsText = "";
            while (true) {
              const { done, value } = await clsReader.read();
              if (done) break;
              clsText += clsDecoder.decode(value, { stream: true });
            }
            agentMode = /^agent/i.test(clsText.trim());
          } catch (clsErr) {
            agentMode = AGENT_HINTS.test(input.content || "");
          }
        }
        try {
          const creditsMod = await Promise.resolve().then(() => (init_credits(), credits_exports));
          const isOwner = ctx.user.role === "admin";
          if (!isOwner) {
            await creditsMod.grantTrial(ctx.user.id);
            const balance = await creditsMod.getBalance(ctx.user.id);
            const cost = agentMode ? creditsMod.AGENT_COST_PER_MESSAGE : creditsMod.getCostPerMessage();
            if (balance >= Math.max(1, cost)) {
              await creditsMod.adjust(ctx.user.id, -cost);
            } else {
              safeWrite(
                encoder.encode(
                  "data: " + JSON.stringify({
                    content: `Voc\xEA est\xE1 sem cr\xE9ditos para ${agentMode ? "o modo agente (5 cr\xE9ditos)" : "enviar mensagens"}. Entre em contato com o administrador para recarregar.`
                  }) + "\n\n"
                )
              );
              safeWrite(encoder.encode("data: [DONE]\n\n"));
              safeEnd();
              return;
            }
          }
        } catch (creditErr) {
          console.warn("[Chat] credits adjust failed:", creditErr);
        }
        if (agentMode) {
          try {
            safeWrite(
              encoder.encode(
                "data: " + JSON.stringify({
                  content: "\u2699\uFE0F **Modo agente ativado** \u2014 vou processar isso em modo agente, pois \xE9 uma tarefa aut\xF4noma que exige execu\xE7\xE3o passo a passo. (5 cr\xE9ditos debitados)\n\n",
                  agentMode: true
                }) + "\n\n"
              )
            );
          } catch (noticeErr) {
            console.warn("[Chat] agent-mode notice failed:", noticeErr?.message);
          }
        }
        const SELF_IMPROVE_RE = /melhore (o sistema|a si (mesma|mesmo)|voc[eê]|se)|melhoria (no|na) sistema|auto[- ]melhoria|mejorar el sistema|improve (the )?system|self[- ]improvement/i;
        if (SELF_IMPROVE_RE.test(input.content || "")) {
          try {
            const { invokeLLMStream: invokeLLMStream3 } = await Promise.resolve().then(() => (init_llm(), llm_exports));
            const planResp = await invokeLLMStream3({
              model: "gemini-3.6-flash",
              messages: [
                { role: "system", content: "Voc\xEA \xE9 o m\xF3dulo de auto-melhoria do DevAI Assistant. O usu\xE1rio pediu para voc\xEA melhorar o pr\xF3prio sistema. Gere UM plano de melhoria concreto e seguro, em JSON. Nunca sugira nada destrutivo (nunca apagar dados de usu\xE1rios, nunca expor credenciais, nunca executar comandos remotos em servidores de terceiros). Foque em melhorias de c\xF3digo, performance, UX, corre\xE7\xE3o de bugs e otimiza\xE7\xE3o para a VM (pouca mem\xF3ria). Responda APENAS com um JSON contendo as chaves title, description, filesToChange, risks e benefits" },
                { role: "user", content: input.content || "" }
              ]
            });
            const planReader = planResp.body.getReader();
            const planDecoder = new TextDecoder();
            let planText = "";
            while (true) {
              const { done, value } = await planReader.read();
              if (done) break;
              planText += planDecoder.decode(value, { stream: true });
            }
            const jsonMatch = planText.match(/```json\s*([\s\S]*?)```|([\s\S]*)/);
            let plan = null;
            try {
              const raw = jsonMatch ? jsonMatch[1] || jsonMatch[2] : planText;
              plan = JSON.parse(raw);
              if (!plan.title && !plan.description) throw new Error("empty plan");
            } catch {
              const pick = (key) => {
                const re = new RegExp('"' + key + '"\\s*:\\s*"?([^"\\n,}\\]]+)', "i");
                const m = planText.match(re);
                return m ? m[1].trim().slice(0, 200) : "";
              };
              const pickArr = (key) => {
                const re = new RegExp('"' + key + '"\\s*:\\s*\\[([\\s\\S]*?)\\]', "i");
                const m = planText.match(re);
                if (!m) return [];
                return m[1].split(",").map((s) => s.replace(/["']/g, "").trim()).filter(Boolean).slice(0, 8);
              };
              plan = {
                title: pick("title") || "Melhoria sugerida pela IA",
                description: pick("description") || planText.replace(/[\s\S]*?\{|\}.*$/, "").slice(0, 400),
                filesToChange: pickArr("filesToChange"),
                risks: pickArr("risks"),
                benefits: pickArr("benefits")
              };
            }
            if (!plan.title && !plan.description && (!plan.filesToChange || plan.filesToChange.length === 0)) {
              plan = null;
            }
            let proposal = null;
            if (plan) {
              const si = await Promise.resolve().then(() => (init_self_improvement(), self_improvement_exports));
              proposal = await si.createImprovementProposal(
                plan.title || "Melhoria sugerida",
                (plan.description || "") + (plan.benefits?.length ? " Benef\xEDcios: " + plan.benefits.join("; ") : ""),
                plan.filesToChange || [],
                plan.risks || ["Nenhum risco conhecido"],
                plan.benefits || [],
                "Autom\xE1tico"
              );
            }
            try {
              safeWrite(
                encoder.encode(
                  "data: " + JSON.stringify({
                    content: proposal ? "\u{1F916} Criei uma proposta de auto-melhoria baseada no seu pedido:\n\n**" + (plan.title || "Melhoria sugerida") + "**\n\n" + (plan.description || "") + "\n\nComo dono, voc\xEA pode revisar e aprovar em **/approvals** (\xE9 preciso informar a chave secreta). Nada ser\xE1 alterado sem sua aprova\xE7\xE3o expl\xEDcita." : "\u{1F916} Recebi seu pedido de melhoria. Tentei gerar um plano, mas a IA de planejamento n\xE3o respondeu agora (rede inst\xE1vel). Tente novamente em alguns instantes."
                  }) + "\n\n"
                )
              );
              safeWrite(encoder.encode("data: [DONE]\n\n"));
              safeEnd();
            } catch (sseErr) {
              console.warn("[Chat] SSE write failed:", sseErr?.message);
            }
            return;
          } catch (siErr) {
            console.warn("[Chat] self-improve plan failed:", siErr);
          }
        }
        const { invokeLLMStream: invokeLLMStream2 } = await Promise.resolve().then(() => (init_llm(), llm_exports));
        const llmResponse = await invokeLLMStream2({
          model: "gemini-3.6-flash",
          messages: llmMessages,
          // A resposta completa é mais confiável para entregas pagas. Alguns
          // provedores compatíveis enviam snapshots SSE incompletos ou
          // cumulativos, o que podia cortar ou duplicar um documento.
          stream: false
        });
        let fullContent = "";
        const completion = await llmResponse.json();
        fullContent = stripThinkingContent(
          completion.choices?.[0]?.message?.content ?? completion.choices?.[0]?.delta?.content ?? ""
        );
        if (fullContent) {
          safeWrite(encoder.encode(`data: ${JSON.stringify({ content: fullContent })}

`));
        }
        safeWrite(encoder.encode("data: [DONE]\n\n"));
        safeEnd();
        try {
          await addMessage(input.conversationId, "assistant", fullContent);
        } catch (e) {
          console.error("[Chat] Failed to persist assistant message:", e);
        }
      } catch (error) {
        console.error("[Chat] LLM error:", error);
        safeWrite(
          encoder.encode(
            `data: ${JSON.stringify({ error: "Erro ao gerar resposta. Tente novamente." })}

`
          )
        );
        safeWrite(encoder.encode("data: [DONE]\n\n"));
        safeEnd();
      }
      return { conversationId: input.conversationId, streaming: true };
    })
  }),
  // ─── Upload ───
  upload: router({
    uploadFile: protectedProcedure.input(
      z2.object({
        conversationId: z2.number(),
        fileName: z2.string().min(1).max(512),
        fileContent: z2.string(),
        // base64
        fileType: z2.string().max(128)
      })
    ).mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError3({ code: "UNAUTHORIZED" });
      const conv = await getConversation(input.conversationId, ctx.user.id);
      if (!conv) throw new TRPCError3({ code: "NOT_FOUND", message: "Conversa n\xE3o encontrada" });
      const buffer = Buffer.from(input.fileContent, "base64");
      if (buffer.length > 4 * 1024 * 1024) {
        throw new TRPCError3({
          code: "BAD_REQUEST",
          message: "Arquivo muito grande. O limite \xE9 4MB."
        });
      }
      const ext = input.fileName.split(".").pop() ?? "";
      const key = `${ctx.user.id}-files/${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { url } = await storagePut(key, buffer, input.fileType || "application/octet-stream");
      const attId = await addAttachment({
        conversationId: input.conversationId,
        userId: ctx.user.id,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize: buffer.length,
        storageUrl: url
      });
      return { id: attId, url, fileName: input.fileName };
    })
  })
});

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  chat: chatRouter,
  // Admin-only router
  admin: router({
    listUsers: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user || ctx.user.role !== "admin") {
        throw new TRPCError4({ code: "FORBIDDEN" });
      }
      let rows = [];
      try {
        const sdb = await getDb();
        if (!sdb) throw new Error("no db");
        const [r] = await sdb.session.client.query(
          "SELECT id, openId, name, email, loginMethod, role, createdAt, lastSignedIn FROM users ORDER BY createdAt DESC"
        );
        rows = r || [];
      } catch {
        rows = await getAllUsers();
      }
      return rows.map((u) => ({
        id: Number(u.id || 0),
        openId: u.openId ?? "",
        name: u.name ?? "",
        email: u.email ?? "",
        loginMethod: u.loginMethod ?? "email",
        role: u.role ?? "user",
        createdAt: u.createdAt ?? Date.now(),
        lastSignedIn: u.lastSignedIn ?? 0
      }));
    }),
    setUserRole: protectedProcedure.input(z3.object({ id: z3.number(), role: z3.enum(["admin", "user"]) })).mutation(async ({ ctx, input }) => {
      if (!ctx.user || ctx.user.role !== "admin") {
        throw new TRPCError4({ code: "FORBIDDEN" });
      }
      await updateUserRole(input.id, input.role);
      return { success: true };
    })
  }),
  // Credits
  credits: router({
    me: protectedProcedure.query(async ({ ctx }) => {
      const { getBalance: getBalance2 } = await Promise.resolve().then(() => (init_credits(), credits_exports));
      if (ctx.user.role === "admin") return { balance: -1, unlimited: true };
      const balance = await getBalance2(ctx.user.id);
      return { balance, unlimited: false };
    }),
    add: protectedProcedure.input(z3.object({ email: z3.string().email(), amount: z3.number().int() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Somente admin." });
      const { addCredits: addCredits2 } = await Promise.resolve().then(() => (init_credits(), credits_exports));
      const ok = await addCredits2(input.email, input.amount);
      return { success: ok };
    }),
    remove: protectedProcedure.input(z3.object({ email: z3.string().email(), amount: z3.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Somente admin." });
      const { addCredits: addCredits2 } = await Promise.resolve().then(() => (init_credits(), credits_exports));
      const ok = await addCredits2(input.email, -input.amount);
      return { success: ok };
    }),
    setCost: protectedProcedure.input(z3.object({ costPerMessage: z3.number().int().min(0).max(100) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Somente admin." });
      const { setCostPerMessage: setCostPerMessage2 } = await Promise.resolve().then(() => (init_credits(), credits_exports));
      await setCostPerMessage2(input.costPerMessage);
      return { success: true };
    }),
    getCost: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Somente admin." });
      const { getCostPerMessage: getCostPerMessage2 } = await Promise.resolve().then(() => (init_credits(), credits_exports));
      return { costPerMessage: await getCostPerMessage2() };
    }),
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN", message: "Somente admin." });
      const { listUsers: listUsers2 } = await Promise.resolve().then(() => (init_credits(), credits_exports));
      return listUsers2();
    })
  }),
  // Self-improvement (aprovações)
  selfImprove: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN" });
      const mod = await Promise.resolve().then(() => (init_self_improvement(), self_improvement_exports));
      return { proposals: mod.listProposals() };
    }),
    approve: protectedProcedure.input(z3.object({ proposalId: z3.string(), approvalKey: z3.string().min(1) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN" });
      const mod = await Promise.resolve().then(() => (init_self_improvement(), self_improvement_exports));
      const approvalKey = process.env.APPROVAL_KEY || "";
      if (input.approvalKey.trim() !== approvalKey) {
        return { success: false, message: "Chave de aprova\xE7\xE3o inv\xE1lida. S\xF3 o dono pode aprovar melhorias." };
      }
      const proposal = mod.approveProposal(input.proposalId);
      return { success: true, message: "Proposta aprovada pelo dono. Execute os arquivos via o comando de melhoria.", proposal };
    }),
    reject: protectedProcedure.input(z3.object({ proposalId: z3.string() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError4({ code: "FORBIDDEN" });
      const mod = await Promise.resolve().then(() => (init_self_improvement(), self_improvement_exports));
      const result = mod.rejectProposal(input.proposalId);
      return { success: true, proposal: result };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/localAuth.ts
import { createHmac, randomBytes } from "crypto";
init_env();
import { z as z4 } from "zod";
var loginSchema = z4.object({
  email: z4.string().min(3).max(320),
  password: z4.string().min(6).max(128)
});
function hashPassword(password, salt) {
  return createHmac("sha256", salt).update(password).digest("hex");
}
function generateSalt() {
  return randomBytes(16).toString("hex");
}
function isOwnerEmail(email) {
  const ownerEmail = ENV.ownerOpenId?.startsWith("local:") ? ENV.ownerOpenId.replace("local:", "") : null;
  const ownerEmails = ownerEmail ? [ownerEmail, "charleshenriquegonsalves05@gmail.com"] : ["charleshenriquegonsalves05@gmail.com"];
  return ownerEmails.includes(email);
}
async function handleLocalLogin(req, res) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "E-mail e senha s\xE3o obrigat\xF3rios" });
      return;
    }
    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();
    const name = normalizedEmail.split("@")[0];
    const openId = `local:${normalizedEmail}`;
    const dbUser = await getUserByOpenId(openId);
    if (dbUser && dbUser.loginMethod === "email") {
      const stored = await getPasswordRecord(normalizedEmail);
      if (!stored) {
        console.log("[Auth] Existing user without stored password, setting it now:", normalizedEmail);
        const salt = generateSalt();
        const passwordHash = hashPassword(password, salt);
        await setPasswordRecord(normalizedEmail, passwordHash, salt);
      } else {
        const hash = hashPassword(password, stored.salt);
        if (hash !== stored.passwordHash) {
          res.status(401).json({ error: "Email ou senha inv\xE1lidos" });
          return;
        }
      }
    } else {
      console.log("[Auth] Auto-registering new user:", normalizedEmail);
      const salt = generateSalt();
      const passwordHash = hashPassword(password, salt);
      await setPasswordRecord(normalizedEmail, passwordHash, salt);
    }
    const isOwner = isOwnerEmail(normalizedEmail);
    await upsertUser({
      openId,
      name,
      email: normalizedEmail,
      loginMethod: "email",
      role: isOwner ? "admin" : "user",
      lastSignedIn: /* @__PURE__ */ new Date()
    });
    const finalUser = await getUserByOpenId(openId);
    if (!finalUser) {
      console.error("[Auth] Failed to get user after upsert");
      res.status(500).json({ error: "Falha ao autenticar usu\xE1rio" });
      return;
    }
    const sessionToken = await sdk.createSessionToken(finalUser.openId, {
      name: finalUser.name || name,
      expiresInMs: ONE_YEAR_MS
    });
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    res.json({
      success: true,
      user: {
        id: finalUser.id,
        openId: finalUser.openId,
        name: finalUser.name,
        email: finalUser.email,
        role: finalUser.role
      }
    });
  } catch (error) {
    console.error("[Auth] Local login error:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
}
async function handleLocalLogout(req, res) {
  const cookieOptions = getSessionCookieOptions(req);
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: 0 });
  res.json({ success: true });
}
async function getPasswordRecord(email) {
  const sdb = await getDb();
  if (!sdb) return null;
  const { sql } = await import("drizzle-orm");
  const conn = sdb.session?.client ?? sdb;
  const [rows] = await conn.query(
    "SELECT passwordHash, salt FROM password_credentials WHERE email = ? LIMIT 1",
    [email]
  );
  const list = rows;
  if (!list || list.length === 0) return null;
  return { passwordHash: list[0].passwordHash, salt: list[0].salt };
}
async function setPasswordRecord(email, passwordHash, salt) {
  const sdb = await getDb();
  if (!sdb) throw new Error("Database not available");
  const conn = sdb.session?.client ?? sdb;
  await conn.query(
    "INSERT INTO password_credentials (email, passwordHash, salt) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE passwordHash = VALUES(passwordHash), salt = VALUES(salt)",
    [email, passwordHash, salt]
  );
}

// server/_core/vite.ts
import express from "express";
import fs4 from "fs";
import { nanoid } from "nanoid";
import path5 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs3 from "node:fs";
import path4 from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path4.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs3.existsSync(LOG_DIR)) {
    fs3.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs3.existsSync(logPath) || fs3.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs3.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs3.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path4.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs3.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path4.resolve(import.meta.dirname, "client", "src"),
      "@shared": path4.resolve(import.meta.dirname, "shared"),
      "@assets": path4.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path4.resolve(import.meta.dirname),
  root: path4.resolve(import.meta.dirname, "client"),
  publicDir: path4.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path4.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path5.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs4.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path5.resolve(import.meta.dirname, "../..", "dist", "public") : path5.resolve(import.meta.dirname, "public");
  if (!fs4.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path5.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/auth/login", handleLocalLogin);
  app.post("/api/auth/logout", handleLocalLogout);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
