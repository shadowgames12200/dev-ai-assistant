/**
 * File Analyzer Module
 * Analisa arquivos binários (ZIP, executáveis, documentos, etc.)
 * Extrai informações, lista conteúdo de ZIPs, detecta tipo de arquivo
 * e gera uma descrição detalhada para enviar ao modelo de IA.
 */

// ─── Shared Type Helpers ───

export const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "json", "xml", "yaml", "yml",
  "toml", "ini", "env", "log", "sh", "bash",
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "py", "rb", "php", "java", "kt", "scala",
  "c", "cpp", "h", "hpp", "cs", "go", "rs",
  "swift", "dart", "lua", "r", "sql", "graphql",
  "html", "htm", "css", "scss", "vue", "svelte",
  "dockerfile", "makefile", "gitignore", "toml", "cfg", "conf",
]);

export const IMAGE_MIME_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml",
]);

export function isTextFile(fileName: string, fileType: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return fileType.startsWith("text/") ||
    fileType === "application/json" ||
    fileType === "application/javascript" ||
    fileType === "application/typescript" ||
    TEXT_EXTENSIONS.has(ext);
}

export function isImageFile(fileType: string): boolean {
  return IMAGE_MIME_TYPES.has(fileType.toLowerCase());
}

export function extractTextFromBuffer(buffer: Buffer, fileName: string, fileType: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const isText = isTextFile(fileName, fileType);

  if (isText) {
    const text = buffer.toString("utf-8");
    return text.length > 80000 ? text.slice(0, 80000) + "\n\n[... conteúdo truncado ...]" : text;
  }

  // Para PDFs
  if (fileType === "application/pdf" || ext === "pdf") {
    return "[Arquivo PDF anexado - conteúdo binário não pode ser lido diretamente como texto.]";
  }

  return `[Arquivo binário: ${fileName} (${fileType || 'tipo desconhecido'})]`;
}

// ─── ZIP Analysis ───

/**
 * Magic bytes para detectar tipo de arquivo pelo header
 */
const MAGIC_HEADERS: Record<string, { hex: string; type: string; description: string }> = {
  "504b0304": { hex: "504b0304", type: "ZIP", description: "Arquivo ZIP (pode conter executáveis, documentos, etc.)" },
  "504b0506": { hex: "504b0506", type: "ZIP_EMPTY", description: "Arquivo ZIP vazio" },
  "504b0708": { hex: "504b0708", type: "ZIP_SPANNED", description: "Arquivo ZIP multi-volume" },
  "25504446": { hex: "25504446", type: "PDF", description: "Documento PDF" },
  "4d5a9000": { hex: "4d5a9000", type: "EXE", description: "Executável Windows (PE/EXE)" },
  "7f454c46": { hex: "7f454c46", type: "ELF", description: "Executável Linux (ELF)" },
  "cafebabe": { hex: "cafebabe", type: "JAVA", description: "Java Class File" },
  "4d5a5000": { hex: "4d5a5000", type: "DLL", description: "DLL Windows" },
  "52617221": { hex: "52617221", type: "RAR", description: "Arquivo RAR" },
  "377abcaf271c": { hex: "377abcaf271c", type: "7Z", description: "Arquivo 7-Zip" },
  "1f8b": { hex: "1f8b", type: "GZIP", description: "Arquivo GZIP comprimido" },
  "d0cf11e0": { hex: "d0cf11e0", type: "DOC_OLE", description: "Documento Microsoft Office (OLE2 - DOC/XLS/PPT)" },
  "504b0304": { hex: "504b0304", type: "DOCX", description: "Documento Office OOXML (DOCX/XLSX/PPTX)" },
};

/**
 * Detecta o tipo de arquivo pelo header (magic bytes)
 */
export function detectFileTypeByHeader(buffer: Buffer): { type: string; description: string; confidence: "high" | "medium" | "low" } {
  const hex = buffer.toString("hex", 0, Math.min(12, buffer.length)).toLowerCase();

  // ZIP (também é DOCX/XLSX/PPTX)
  if (hex.startsWith("504b0304")) {
    return { type: "ZIP", description: "Arquivo ZIP/Office (DOCX/XLSX/PPTX)", confidence: "high" };
  }

  // PDF
  if (hex.startsWith("25504446")) {
    return { type: "PDF", description: "Documento PDF", confidence: "high" };
  }

  // EXE Windows
  if (hex.startsWith("4d5a")) {
    return { type: "EXE", description: "Executável Windows (PE)", confidence: "high" };
  }

  // ELF Linux
  if (hex.startsWith("7f454c46")) {
    return { type: "ELF", description: "Executável Linux (ELF)", confidence: "high" };
  }

  // RAR
  if (hex.startsWith("52617221")) {
    return { type: "RAR", description: "Arquivo RAR comprimido", confidence: "high" };
  }

  // 7-Zip
  if (hex.startsWith("377abcaf271c")) {
    return { type: "7Z", description: "Arquivo 7-Zip comprimido", confidence: "high" };
  }

  // GZIP
  if (hex.startsWith("1f8b")) {
    return { type: "GZIP", description: "Arquivo GZIP comprimido", confidence: "high" };
  }

  // OLE2 (DOC/XLS antigo)
  if (hex.startsWith("d0cf11e0")) {
    return { type: "OLE2", description: "Documento Microsoft Office antigo (DOC/XLS/PPT)", confidence: "high" };
  }

  return { type: "UNKNOWN", description: "Tipo de arquivo desconhecido", confidence: "low" };
}

/**
 * Lista o conteúdo de um arquivo ZIP (entries) sem extrair
 * Lê o central directory do ZIP para listar os arquivos
 */
export function listZipContents(buffer: Buffer): { name: string; size: number; compressed: boolean }[] {
  const entries: { name: string; size: number; compressed: boolean }[] = [];

  try {
    // Procurar pelo End of Central Directory (EOCD)
    // O EOCD termina com a signature 0x06054b50 (PK\x05\x06)
    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
      if (
        buffer[i] === 0x50 &&
        buffer[i + 1] === 0x4b &&
        buffer[i + 2] === 0x05 &&
        buffer[i + 3] === 0x06
      ) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      return [{ name: "(erro ao ler ZIP: Central Directory não encontrado)", size: 0, compressed: false }];
    }

    // Extrair informações do EOCD
    const numEntries = buffer.readUInt16LE(eocdOffset + 10);
    const cdSize = buffer.readUInt32LE(eocdOffset + 12);
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

    // Ler cada entrada do Central Directory
    let offset = cdOffset;
    for (let i = 0; i < numEntries; i++) {
      if (offset + 46 > buffer.length) break;

      // Verificar signature do Central Directory File Header
      if (
        buffer[offset] !== 0x50 ||
        buffer[offset + 1] !== 0x4b ||
        buffer[offset + 2] !== 0x01 ||
        buffer[offset + 3] !== 0x02
      ) {
        break;
      }

      const nameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const uncompressedSize = buffer.readUInt32LE(offset + 24);
      const compressionMethod = buffer.readUInt16LE(offset + 10);

      const name = buffer.toString("utf-8", offset + 46, offset + 46 + nameLength);
      const isCompressed = compressionMethod !== 0;

      entries.push({
        name: name || "(sem nome)",
        size: uncompressedSize,
        compressed: isCompressed,
      });

      offset += 46 + nameLength + extraLength + commentLength;
    }
  } catch (err) {
    return [{ name: "(erro ao analisar ZIP)", size: 0, compressed: false }];
  }

  return entries;
}

/**
 * Analisa um arquivo binário e retorna uma descrição detalhada
 */
export function analyzeBinaryFile(buffer: Buffer, fileName: string, fileType: string): string {
  const detection = detectFileTypeByHeader(buffer);
  const fileSize = buffer.length;
  const fileSizeKB = (fileSize / 1024).toFixed(1);
  const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

  let analysis = `📁 **Análise do arquivo: ${fileName}**\n\n`;
  analysis += `**Informações gerais:**\n`;
  analysis += `- Tamanho: ${fileSizeKB} KB (${fileSizeMB} MB)\n`;
  analysis += `- Tipo MIME detectado: ${fileType || "desconhecido"}\n`;
  analysis += `- Tipo pelo header: ${detection.type}\n`;
  analysis += `- Descrição: ${detection.description}\n`;
  analysis += `- Confiança da detecção: ${detection.confidence}\n\n`;

  // Análise específica por tipo
  if (detection.type === "ZIP") {
    const entries = listZipContents(buffer);
    analysis += `**Conteúdo do ZIP (${entries.length} arquivos):**\n\n`;
    analysis += "```\n";
    for (const entry of entries) {
      const sizeStr = entry.size > 1024 * 1024
        ? `${(entry.size / (1024 * 1024)).toFixed(1)} MB`
        : entry.size > 1024
        ? `${(entry.size / 1024).toFixed(1)} KB`
        : `${entry.size} bytes`;
      analysis += `  ${entry.compressed ? "📦" : "📄"} ${entry.name} (${sizeStr})\n`;
    }
    analysis += "```\n\n";

    // Detectar tipos de arquivos dentro do ZIP
    const extCounts: Record<string, number> = {};
    for (const entry of entries) {
      const ext = entry.name.split(".").pop()?.toLowerCase() || "";
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }

    if (Object.keys(extCounts).length > 0) {
      analysis += "**Tipos de arquivo encontrados:**\n";
      for (const [ext, count] of Object.entries(extCounts).sort((a, b) => b[1] - a[1])) {
        analysis += `- .${ext}: ${count} arquivo(s)\n`;
      }
      analysis += "\n";
    }

    // Detectar executáveis dentro do ZIP
    const executables = entries.filter(e => {
      const ext = e.name.split(".").pop()?.toLowerCase() || "";
      return ["exe", "dll", "bat", "cmd", "ps1", "scr", "msi"].includes(ext);
    });

    if (executables.length > 0) {
      analysis += `**⚠️ Arquivos executáveis encontrados (${executables.length}):**\n`;
      for (const exec of executables) {
        analysis += `- ${exec.name}\n`;
      }
      analysis += "\n";
    }

    // Detectar código-fonte dentro do ZIP
    const codeFiles = entries.filter(e => {
      const ext = e.name.split(".").pop()?.toLowerCase() || "";
      return ["js", "ts", "py", "java", "c", "cpp", "h", "cs", "go", "rs", "html", "css", "json", "xml", "sql", "sh", "bash", "rb", "php"].includes(ext);
    });

    if (codeFiles.length > 0) {
      analysis += `**📝 Arquivos de código encontrados (${codeFiles.length}):**\n`;
      for (const code of codeFiles) {
        analysis += `- ${code.name}\n`;
      }
      analysis += "\n";
    }

    // Tentar ler arquivos de texto dentro do ZIP
    const textFiles = entries.filter(e => {
      const ext = e.name.split(".").pop()?.toLowerCase() || "";
      return ["txt", "md", "cfg", "ini", "env", "log", "conf", "properties", "yaml", "yml", "toml"].includes(ext);
    });

    if (textFiles.length > 0) {
      analysis += `**📄 Arquivos de configuração/texto encontrados (${textFiles.length}):**\n`;
      for (const text of textFiles) {
        analysis += `- ${text.name}\n`;
      }
      analysis += "\n";
    }

    analysis += "**Nota:** Este ZIP pode conter executáveis, scripts ou configurações. Posso tentar extrair e ler os arquivos de texto/ código se você pedir.";

  } else if (detection.type === "EXE" || detection.type === "DLL") {
    // Análise básica de PE (Portable Executable)
    analysis += `**Análise do Executável Windows:**\n\n`;

    if (buffer.length >= 64) {
      const peOffset = buffer.readUInt32LE(0x3c);
      if (peOffset > 0 && peOffset + 4 < buffer.length) {
        analysis += `- PE Header offset: 0x${peOffset.toString(16).padStart(8, "0")}\n`;

        if (buffer[peOffset] === 0x50 && buffer[peOffset + 1] === 0x45) {
          const machine = buffer.readUInt16LE(peOffset + 4);
          const targetMachine = machine === 0x14c ? "x86 (32-bit)" : machine === 0x8664 ? "x64 (64-bit)" : `Desconhecida (0x${machine.toString(16)})`;
          analysis += `- Arquitetura: ${targetMachine}\n`;

          const numSections = buffer.readUInt16LE(peOffset + 6);
          analysis += `- Seções: ${numSections}\n`;

          // Tentar ler strings do executável
          const strings = extractStrings(buffer, 8, 20);
          if (strings.length > 0) {
            analysis += `- Strings relevantes encontradas: ${strings.length}\n`;
            analysis += `- Exemplos: ${strings.slice(0, 5).join(", ")}\n`;
          }
        }
      }
    }

    analysis += `\n**Nota:** Não posso executar este arquivo, mas posso analisar seu comportamento baseado no conteúdo e nas strings extraídas.`;

  } else if (detection.type === "ELF") {
    analysis += `**Análise do Executável Linux (ELF):**\n\n`;

    if (buffer.length >= 20) {
      const bitness = buffer[4] === 1 ? "32-bit" : buffer[4] === 2 ? "64-bit" : "desconhecida";
      analysis += `- Arquitetura: ${bitness}\n`;

      const machine = buffer.readUInt16LE(18);
      const machineName = machine === 0x3e ? "x86-64" : machine === 0x03 ? "x86" : machine === 0xb7 ? "AArch64" : `0x${machine.toString(16)}`;
      analysis += `- Machine: ${machineName}\n`;

      const strings = extractStrings(buffer, 8, 15);
      if (strings.length > 0) {
        analysis += `- Strings extraídas: ${strings.length}\n`;
        analysis += `- Exemplos: ${strings.slice(0, 5).join(", ")}\n`;
      }
    }

    analysis += `\n**Nota:** Este é um executável Linux. Posso analisar suas bibliotecas e comportamento baseado nas strings.`;

  } else if (detection.type === "PDF") {
    analysis += `**Análise do PDF:**\n\n`;
    const strings = extractStrings(buffer, 6, 30);
    if (strings.length > 0) {
      analysis += `- Texto extraído do PDF (${strings.length} strings):\n`;
      const combined = strings.join(" ").slice(0, 500);
      analysis += `- Conteúdo: "${combined}"\n`;
    }
    analysis += `\n**Nota:** Posso tentar converter páginas do PDF em imagens para análise visual.`;

  } else if (detection.type === "RAR" || detection.type === "7Z" || detection.type === "GZIP") {
    analysis += `**Arquivo comprimido:**\n`;
    analysis += `- Formato: ${detection.description}\n`;
    analysis += `- Tamanho: ${fileSizeKB} KB\n\n`;
    analysis += `**Nota:** Posso listar o conteúdo se você me pedir para extrair informações deste arquivo.`;

  } else if (detection.type === "DOCX") {
    analysis += `**Documento Office:**\n`;
    analysis += `- Formato: DOCX/XLSX/PPTX (Office OOXML)\n`;
    analysis += `- Tamanho: ${fileSizeMB} MB\n\n`;

    // DOCX é um ZIP, então listar conteúdo
    const entries = listZipContents(buffer);
    analysis += `**Conteúdo (${entries.length} arquivos internos):**\n`;
    analysis += "```\n";
    for (const entry of entries.slice(0, 20)) {
      analysis += `  ${entry.name}\n`;
    }
    if (entries.length > 20) {
      analysis += `  ... e mais ${entries.length - 20} arquivos\n`;
    }
    analysis += "```\n";

  } else {
    // Tipo desconhecido - tentar extrair strings
    const strings = extractStrings(buffer, 6, 20);
    analysis += `**Tipo não reconhecido:**\n\n`;

    if (strings.length > 0) {
      analysis += `**Strings extraídas (${strings.length}):**\n`;
      analysis += "```\n";
      for (const str of strings.slice(0, 15)) {
        analysis += `  ${str}\n`;
      }
      if (strings.length > 15) {
        analysis += `  ... e mais ${strings.length - 15} strings\n`;
      }
      analysis += "```\n";
    } else {
      analysis += `- Nenhuma string legível encontrada no arquivo.\n`;
      analysis += `- O arquivo pode ser criptografado ou conter dados puramente binários.\n`;
    }
  }

  return analysis;
}

/**
 * Extrai strings legíveis de um buffer binário
 */
function extractStrings(buffer: Buffer, minLength: number = 6, maxLength: number = 20): string[] {
  const strings: string[] = [];
  let current = "";

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= minLength && current.length <= maxLength) {
        // Filtrar strings que parecem ser caminhos ou identificadores úteis
        if (/[a-zA-Z]/.test(current) && !/^.{0,2}$/.test(current)) {
          strings.push(current);
        }
      }
      current = "";
    }
  }

  // Limpar duplicatas e limitar
  return [...new Set(strings)].slice(0, 50);
}
