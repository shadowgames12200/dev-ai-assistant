import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Streamdown } from "streamdown";
import {
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
  Pencil,
  Check,
  X,
  Bot,
  User,
  Loader2,
  Code2,
  Zap,
  Brain,
  Paperclip,
  FileText,
  FileCode,
  FileJson,
  File,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DbMessage = {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  fileUrl?: string;
  fileName?: string;
  createdAt: Date;
};

type Conversation = {
  id: number;
  userId: number;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

const SUGGESTED_PROMPTS = [
  { icon: Code2, text: "Crie um script Python para automatizar tarefas do dia a dia", desc: "Automação" },
  { icon: Brain, text: "Explique como funciona um sistema de autenticação JWT", desc: "Conceito" },
  { icon: Zap, text: "Monte uma API REST completa em Node.js com Express", desc: "Projeto" },
  { icon: MessageSquarePlus, text: "Me ajude a organizar minha rotina diária", desc: "Dia a dia" },
];

// Tipos de arquivo suportados para análise de texto
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "json", "xml", "yaml", "yml",
  "toml", "ini", "env", "log", "sh", "bash",
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "py", "rb", "php", "java", "kt", "scala",
  "c", "cpp", "h", "hpp", "cs", "go", "rs",
  "swift", "dart", "lua", "r", "sql", "graphql",
  "html", "htm", "css", "scss", "vue", "svelte",
  "dockerfile", "makefile", "gitignore",
]);

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (["js", "jsx", "ts", "tsx", "py", "java", "go", "rs", "c", "cpp", "cs"].includes(ext))
    return FileCode;
  if (["json", "yaml", "yml", "toml", "xml"].includes(ext))
    return FileJson;
  if (["txt", "md", "log", "csv"].includes(ext))
    return FileText;
  return File;
}

function isTextFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return file.type.startsWith("text/") ||
    file.type === "application/json" ||
    file.type === "application/javascript" ||
    TEXT_EXTENSIONS.has(ext);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Extrai o nome do arquivo de uma mensagem com conteúdo de arquivo
function extractFileName(content: string): string | null {
  const match = content.match(/\[Conteúdo do arquivo '([^']+)'/);
  return match ? match[1] : null;
}

// Verifica se uma mensagem contém conteúdo de arquivo embutido
function hasEmbeddedFile(content: string): boolean {
  return content.includes("[Conteúdo do arquivo '");
}

// Extrai a mensagem do usuário antes do conteúdo do arquivo
function extractUserMessage(content: string): string {
  const idx = content.indexOf("[Conteúdo do arquivo '");
  if (idx === -1) return content;
  return content.slice(0, idx).trim();
}

export default function ChatView() {
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [useAdvancedReasoning, setUseAdvancedReasoning] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const conversationsQuery = trpc.conversations.list.useQuery();
  const messagesQuery = trpc.messages.list.useQuery(
    { conversationId: activeConversationId ?? -1 },
    { enabled: activeConversationId !== null }
  );

  const createConversationMutation = trpc.conversations.create.useMutation({
    onSuccess: (data) => {
      setActiveConversationId(data.id);
      setMessages([]);
      queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
    },
  });

  const deleteConversationMutation = trpc.conversations.delete.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
      if (activeConversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    },
  });

  const renameConversationMutation = trpc.conversations.rename.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
      setEditingId(null);
      setEditingTitle("");
    },
  });

  const chatMutation = trpc.chat.send.useMutation({
    onSuccess: (data) => {
      setMessages(data.messages);
      setIsLoading(false);
      queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
    },
    onError: () => {
      toast.error("Erro ao enviar mensagem. Tente novamente.");
      setIsLoading(false);
    },
  });

  const uploadFileMutation = trpc.upload.uploadFile.useMutation({
    onSuccess: (data) => {
      setMessages(data.messages);
      setIsLoading(false);
      setSelectedFile(null);
      setInput("");
      queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
      toast.success("Arquivo analisado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao processar o arquivo. Tente novamente.");
      setIsLoading(false);
      setSelectedFile(null);
    },
  });

  useEffect(() => {
    if (messagesQuery.data) {
      setMessages(messagesQuery.data as DbMessage[]);
    }
  }, [messagesQuery.data]);

  const scrollToBottom = useCallback(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLDivElement;
    if (viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleNewConversation = () => {
    createConversationMutation.mutate({ title: "Nova conversa" });
    setInput("");
    setSelectedFile(null);
    textareaRef.current?.focus();
  };

  const handleSendMessage = (content: string) => {
    if (!content.trim() || isLoading) return;

    let convId = activeConversationId;

    if (!convId) {
      const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
      createConversationMutation.mutate(
        { title },
        {
          onSuccess: (data) => {
            setActiveConversationId(data.id);
            setIsLoading(true);
            setInput("");
            chatMutation.mutate({ conversationId: data.id, content, useAdvancedReasoning });
          },
        }
      );
      return;
    }

    setIsLoading(true);
    setInput("");
    chatMutation.mutate({ conversationId: convId, content: content.trim(), useAdvancedReasoning });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Limite de 100MB
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Limite: 100MB.");
      return;
    }

    setSelectedFile(file);
    // Foca no textarea para o usuário digitar uma mensagem opcional
    setTimeout(() => textareaRef.current?.focus(), 100);

    // Reset o input de arquivo para permitir selecionar o mesmo arquivo novamente
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileUpload = async (convId: number) => {
    if (!selectedFile || isLoading) return;

    setIsLoading(true);
    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = () => {
      const base64Content = (reader.result as string).split(",")[1];
      uploadFileMutation.mutate({
        conversationId: convId,
        fileName: selectedFile.name,
        fileContent: base64Content,
        fileType: selectedFile.type || "application/octet-stream",
        userMessage: input.trim() || undefined,
      });
    };
    reader.onerror = () => {
      toast.error("Erro ao ler o arquivo.");
      setIsLoading(false);
    };
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (selectedFile) {
      // Se há arquivo selecionado, precisa de uma conversa ativa
      if (!activeConversationId) {
        const title = selectedFile.name.slice(0, 50);
        createConversationMutation.mutate(
          { title: `Arquivo: ${title}` },
          {
            onSuccess: (data) => {
              setActiveConversationId(data.id);
              handleFileUpload(data.id);
            },
          }
        );
      } else {
        handleFileUpload(activeConversationId);
      }
    } else {
      handleSendMessage(input);
    }
  };

  const handleDeleteConversation = (id: number) => {
    deleteConversationMutation.mutate({ id });
  };

  const handleStartRename = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleConfirmRename = (id: number) => {
    if (editingTitle.trim()) {
      renameConversationMutation.mutate({ id, title: editingTitle.trim() });
    }
  };

  const displayMessages = messages.filter((m) => m.role !== "system");

  const FileIcon = selectedFile ? getFileIcon(selectedFile.name) : Paperclip;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ─── Sidebar ─── */}
      <div className="hidden lg:flex w-72 flex-col border-r bg-sidebar/50">
        <div className="p-3">
          <Button
            onClick={handleNewConversation}
            className="w-full justify-start gap-2 font-medium"
            size="default"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Nova conversa
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <div className="space-y-0.5">
            {conversationsQuery.data?.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nenhuma conversa ainda.<br />Inicie uma nova!
              </div>
            )}
            {conversationsQuery.data?.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const isEditing = editingId === conv.id;

              return (
                <div
                  key={conv.id}
                  className={cn(
                    "group flex items-center gap-1.5 rounded-lg px-3 py-2.5 cursor-pointer transition-all",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50 text-sidebar-foreground"
                  )}
                  onClick={() => { if (!isEditing) setActiveConversationId(conv.id); }}
                >
                  {isEditing ? (
                    <div className="flex flex-1 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleConfirmRename(conv.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="flex-1 min-w-0 rounded border bg-background px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                      <button onClick={() => handleConfirmRename(conv.id)} className="shrink-0 rounded p-1 hover:bg-accent">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="shrink-0 rounded p-1 hover:bg-accent">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <MessageSquarePlus className="h-4 w-4 shrink-0 opacity-60" />
                      <span className="flex-1 truncate text-sm">{conv.title}</span>
                      <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); handleStartRename(conv); }} className="rounded p-1 hover:bg-accent" title="Renomear">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }} className="rounded p-1 hover:bg-destructive/20 hover:text-destructive" title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Main Chat Area ─── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="lg:hidden flex items-center gap-2 border-b px-4 py-2.5 bg-background/80 backdrop-blur">
          <Button onClick={handleNewConversation} size="sm" className="gap-1.5">
            <MessageSquarePlus className="h-4 w-4" /> Nova
          </Button>
          <div className="flex-1" />
          {activeConversationId && (
            <Button variant="ghost" size="sm" onClick={() => { setActiveConversationId(null); setMessages([]); }}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div ref={scrollAreaRef} className="flex-1 overflow-y-auto">
          {displayMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="max-w-2xl w-full space-y-8">
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/25">
                    <Sparkles className="h-8 w-8 text-white" />
                  </div>
                  <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight">DevAI Assistant</h1>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Seu assistente de programação e produtividade. Pergunte qualquer coisa sobre código, projetos ou envie um arquivo para análise.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SUGGESTED_PROMPTS.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => handleSendMessage(prompt.text)}
                      disabled={isLoading}
                      className="group flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:shadow-md hover:border-primary/30 hover:bg-accent/50 disabled:opacity-50"
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                        <prompt.icon className="h-4 w-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-tight">{prompt.desc}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{prompt.text}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
              {displayMessages.map((message) => {
                const isFileMessage = hasEmbeddedFile(message.content);
                const fileName = message.fileName || (isFileMessage ? extractFileName(message.content) : null);
                const userText = isFileMessage ? extractUserMessage(message.content) : message.content;
                const FileIconComp = fileName ? getFileIcon(fileName) : FileText;

                return (
                  <div key={message.id} className={cn("flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}>
                    {message.role === "assistant" && (
                      <div className="shrink-0 mt-0.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm">
                          <Sparkles className="h-4 w-4 text-white" />
                        </div>
                      </div>
                    )}

                    <div className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border shadow-sm"
                    )}>
                      {message.role === "user" && isFileMessage ? (
                        // Mensagem de usuário com arquivo anexado
                        <div className="space-y-2">
                          {userText && (
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{userText}</p>
                          )}
                          <div className={cn(
                            "flex items-center gap-2 rounded-lg px-3 py-2",
                            "bg-primary-foreground/10 border border-primary-foreground/20"
                          )}>
                            <FileIconComp className="h-4 w-4 shrink-0 opacity-80" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{fileName}</p>
                              {message.fileUrl && (
                                <a
                                  href={message.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs opacity-70 hover:opacity-100 underline"
                                >
                                  Ver arquivo
                                </a>
                              )}
                            </div>
                            <Badge variant="secondary" className="shrink-0 text-xs bg-primary-foreground/20 text-primary-foreground border-0">
                              Analisado
                            </Badge>
                          </div>
                        </div>
                      ) : message.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg">
                          <Streamdown>{message.content}</Streamdown>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                      )}
                    </div>

                    {message.role === "user" && (
                      <div className="shrink-0 mt-0.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted border shadow-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="shrink-0 mt-0.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-card border shadow-sm px-4 py-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">
                        {selectedFile ? `Analisando ${selectedFile.name}...` : "DevAI está pensando..."}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Input Area ─── */}
        <div className="p-4 border-t bg-background/80 backdrop-blur">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Preview do arquivo selecionado */}
            {selectedFile && (
              <div className="flex items-center gap-2 rounded-xl border bg-muted/50 px-3 py-2">
                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                    {isTextFile(selectedFile) ? " · Conteúdo será lido pela IA" : " · Arquivo binário"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="shrink-0 rounded-full p-1 hover:bg-accent text-muted-foreground"
                  title="Remover arquivo"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="flex items-end gap-3">
              <div className="relative flex-1">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleFormSubmit(e);
                    }
                    if (e.key === "Escape") setSelectedFile(null);
                  }}
                  placeholder={
                    selectedFile
                      ? "Adicione uma mensagem sobre o arquivo (opcional)..."
                      : "Pergunte sobre programação, projetos ou qualquer coisa..."
                  }
                  className="flex-1 resize-none min-h-[44px] max-h-32 pr-10 rounded-xl border bg-background focus-visible:ring-1 focus-visible:ring-primary"
                  rows={1}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept="*/*"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full transition-colors",
                    selectedFile
                      ? "text-primary hover:bg-primary/10"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                  title="Anexar arquivo para análise"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              </div>

              <Button
                type="submit"
                size="icon"
                disabled={(!input.trim() && !selectedFile) || isLoading}
                className="shrink-0 h-11 w-11 rounded-xl shadow-md"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>

            <p className="text-center text-[11px] text-muted-foreground/70">
              DevAI pode cometer erros. Verifique informações importantes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
