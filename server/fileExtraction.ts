/**
 * Extracts text content from non-image files for inclusion in the chat prompt.
 * Supported: plain text (.txt, .md, .js, .ts, .tsx, .jsx, .py, .json, .html, .css,
 * .log, .csv, .xml, .yaml, .yml, .sh, .c, .cpp, .h, .java, .go, .rs, .rb, .php,
 * .sql, .swift, .kt), PDF (via simple text extraction) and ZIP archives
 * (lists entries and extracts text from contained text-like files).
 */
import { Readable } from "node:stream";

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "js", "jsx", "ts", "tsx", "py", "json", "html", "css", "log",
  "csv", "xml", "yaml", "yml", "sh", "c", "cpp", "h", "java", "go", "rs", "rb",
  "php", "sql", "swift", "kt", "toml", "ini", "cfg", "conf", "env", "dockerfile",
  "mjs", "cjs", "graphql",
]);

const MAX_TEXT_CHARS = 40_000; // keep prompt size bounded

export async function downloadBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} downloading ${url}`);
  return Buffer.from(await resp.arrayBuffer());
}

const extOf = (fileName: string): string =>
  fileName.toLowerCase().split(".").pop() ?? "";

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Lightweight PDF text extraction without native dependencies:
  // extract text between BT/ET stream markers using a simple heuristic.
  const text = buffer.toString("binary");
  const out: string[] = [];
  const re = /\((?:[^()\\]|\\.)*\)|<([0-9a-fA-F]*)>/g;
  let m: RegExpExecArray | null;
  let buf = "";
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) {
      // hex string: decode pairs
      let hex = m[1];
      if (hex.length % 2) hex = hex.slice(1);
      for (let i = 0; i < hex.length; i += 2) {
        const ch = parseInt(hex.slice(i, i + 2), 16);
        buf += ch >= 32 && ch < 127 ? String.fromCharCode(ch) : " ";
      }
    } else {
      buf += m[0].slice(1, -1).replace(/\\([nrt()\\])/g, (_, c) =>
        c === "n" ? "\n" : c === "t" ? "\t" : c === "r" ? "" : c,
      );
    }
    if (buf.length > 2) {
      out.push(buf);
      buf = "";
    }
  }
  return out.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_CHARS);
}

export async function extractTextContent(
  url: string,
  fileType: string,
  fileName: string,
): Promise<string> {
  const ext = extOf(fileName);
  const buffer = await downloadBuffer(url);

  const header = `### Arquivo: ${fileName} (${fileType}, ${buffer.length} bytes)\n`;

  if (fileType.startsWith("text/") || TEXT_EXTENSIONS.has(ext)) {
    const text = buffer.toString("utf-8").replace(/\r\n/g, "\n");
    const trimmed = text.length > MAX_TEXT_CHARS
      ? `${text.slice(0, MAX_TEXT_CHARS)}\n... (conteúdo truncado, ${text.length} caracteres no total)`
      : text;
    return `${header}${trimmed}`;
  }

  if (fileType === "application/pdf" || ext === "pdf") {
    const text = await extractPdfText(buffer);
    if (text) return `${header}[Conteúdo extraído do PDF]\n${text}`;
    return `${header}[PDF sem texto extraível — provavelmente escaneado ou com imagens]`;
  }

  if (fileType === "application/zip" || ext === "zip") {
    return extractZipOverview(buffer, fileName);
  }

  return `${header}[Arquivo binário sem extração de texto disponível]`;
}

async function extractZipOverview(buffer: Buffer, zipName: string): Promise<string> {
  // ZIP central directory entries are after the local file headers; use a
  // simple scan of the End of Central Directory record to locate files.
  const entries: { name: string; size: number }[] = [];
  const textFiles: { name: string; content: string }[] = [];

  let pos = 0;
  while (pos < buffer.length - 4) {
    const sig = buffer.readUInt32LE(pos);
    if (sig === 0x04034b50) {
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
        if (TEXT_EXTENSIONS.has(extOf(name)) && method === 0 && uncompSize > 0 && uncompSize < 100_000) {
          textFiles.push({ name, content: buffer.toString("utf-8", dataStart, dataStart + uncompSize) });
        }
      }
      pos = dataStart + compSize;
    } else if (sig === 0x02014b50 || sig === 0x06054b50) {
      break;
    } else {
      pos += 1;
    }
  }

  const lines = [`Arquivo ZIP: ${zipName}`, `Contém ${entries.length} arquivo(s):`];
  for (const e of entries) lines.push(`- ${e.name} (${e.size} bytes)`);
  if (textFiles.length > 0) {
    lines.push("");
    for (const f of textFiles) {
      const c = f.content.length > 12_000 ? f.content.slice(0, 12_000) + "\n...(truncado)" : f.content;
      lines.push(`=== ${f.name} ===`, c);
    }
  }
  return `### ZIP anexado: ${zipName}\n${lines.join("\n")}`.slice(0, MAX_TEXT_CHARS);
}
