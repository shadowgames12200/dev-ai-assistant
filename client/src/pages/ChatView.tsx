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
  Image as ImageIcon,
  FileArchive,
  AlertCircle,
  RefreshCw,
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

// Tipos MIME de imagens para preview
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml",
]);

function isImageFile(file: File): boolean {
  return IMAGE_MIME_TYPES.has(file.type.toLowerCase());
}

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
  const codeExts = ["js", "jsx", "ts", "tsx", "py", "java", "go", "rs", "c", "cpp", "h", "cs", "php", "rb", "swift", "kt", "dart", "lua", "r"];
  const docExts = ["json", "xml", "yaml", "yml", "md", "csv", "txt", "log", "env", "ini", "toml", "cfg", "conf", "sql", "graphql"];

  if (imageExts.includes(ext)) return ImageIcon;
  if (codeExts.includes(ext)) return Code2;
  if (docExts.includes(ext)) return FileJson;
  if (ext === "zip" || ext === "rar" || ext === "7z" || ext === "tar" || ext === "gz") return FileArchive;
  return File;
}

export default function ChatView() {
  const queryClient = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [useAdvancedReasoning, setUseAdvancedReasoning] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const conversationsQuery = trpc.conversations.list.useQuery(undefined, {
    enabled: true,
    staleTime: 30_000,
  });



  const createConversationMutation = trpc.conversations.create.useMutation({
    onSuccess: (data) => {
      setActiveConversationId(data.id);
      queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
    },
  });

  const deleteConversationMutation = trpc.conversations.delete.useMutation({
    onSuccess: () => {
      if (activeConversationId === undefined) return;
      setActiveConversationId(null);
      setMessages([]);
      queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
      toast.success("Conversa deletada.");
    },
  });

  const renameConversationMutation = trpc.conversations.rename.useMutation({
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
      toast.success("Conversa renomeada.");
    },
  });

  // Carregar mensagens da conversa ativa
  const [conversationMessages, setConversationMessages] = useState<DbMessage[]>([]);

  const handleConversationSelect = useCallback((convId: number) => {
    setActiveConversationId(convId);
  }, []);

  // Efeito para carregar mensagens quando a conversa muda
  useEffect(() => {
    if (!activeConversationId) {
      setConversationMessages([]);
      setMessages([]);
      return;
    }

    // Usar tRPC para buscar mensagens da conversa
    trpc.conversations.messages.query(
      { id: activeConversationId },
      {
        onSuccess: (data) => {
          setConversationMessages(data);
          setMessages(data);
        },
        onError: (error) => {
          console.error("Failed to fetch messages:", error);
          setConversationMessages([]);
          setMessages([]);
        },
      }
    );
  }, [activeConversationId]);

  const chatMutation = trpc.chat.send.useMutation({
    onSuccess: (data) => {
      setMessages(data.messages);
      setConversationMessages(data.messages);
      setIsLoading(false);
      setInput("");
      queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
    },
    onError: (error: any) => {
      handleApiError(error, "chat");
      setIsLoading(false);
    },
  });

  const uploadFileMutation = trpc.upload.uploadFile.useMutation({
    onSuccess: (data) => {
      setMessages(data.messages);
      setConversationMessages(data.messages);
      setIsLoading(false);
      setSelectedFile(null);
      setImagePreview(null);
      setInput("");
      queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
      toast.success("Arquivo analisado com sucesso!");
    },
    onError: (error: any) => {
      handleApiError(error, "upload");
      setIsLoading(false);
      setSelectedFile(null);
      setImagePreview(null);
    },
  });

  // Função unificada para tratar erros de API
  function handleApiError(error: any, context: string) {
    console.error(`[${context}] Error:`, error);
    const msg = error?.message || error?.toString() || "";

    // Detectar erros de parse JSON (servidor retornando HTML)
    if (msg.includes("Unexpected token") || msg.includes("is not valid JSON")) {
      toast.error(
        "Erro de conexão com o servidor. Verifique se a GROQ_API_KEY está configurada nas variáveis de ambiente do Vercel.",
        { duration: 8000 }
      );
      return;
    }

    // Detectar erros de API key
    if (msg.includes("GROQ_API_KEY")) {
      toast.error(
        "Configuração necessária: Adicione a variável GROQ_API_KEY nas configurações do Vercel (Settings > Environment Variables).",
        { duration: 10000 }
      );
      return;
    }

    // Detectar rate limit
    if (msg.includes("rate limit") || msg.includes("429")) {
      toast.error("Limite de requisições atingido. Aguarde um momento e tente novamente.");
      return;
    }

    // Erro genérico
    toast.error(msg || `Erro ao enviar ${context === "upload" ? "arquivo" : "mensagem"}. Tente novamente.`);
  }



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
    setImagePreview(null);
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
          onError: (error) => {
            handleApiError(error, "chat");
            setIsLoading(false);
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

    // Limite de 100MB para upload via JSON
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`Arquivo muito grande. Limite: ${maxSize / 1024 / 1024}MB.`);
      return;
    }

    // Aviso para arquivos grandes no Vercel (limite de 4.5MB no plano free)
    const vercelLimit = 4.5 * 1024 * 1024;
    if (file.size > vercelLimit) {
      toast.info(`Arquivo de ${Math.round(file.size / 1024 / 1024)}MB. Se estiver usando Vercel free, o limite é 4.5MB.`, {
        duration: 6000,
      });
    }

    setSelectedFile(file);

    // Gerar preview para imagens
    if (isImageFile(file)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }

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
      setSelectedFile(null);
      setImagePreview(null);
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
            onError: (error) => {
              handleApiError(error, "upload");
              setIsLoading(false);
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
            {conversationsQuery.data?.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex items-center gap-1 rounded-md px-3 py-2 text-sm transition-colors",
                  activeConversationId === conv.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/50"
                )}
                onClick={() => handleConversationSelect(conv.id)}
              >
                {editingId === conv.id ? (
                  <div className="flex flex-1 items-center gap-1">
                    <input
                      className="flex-1 rounded border bg-background px-2 py-1 text-sm outline-none"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleConfirmRename(conv.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfirmRename(conv.id);
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 truncate">{conv.title}</span>
                    <div className="hidden gap-1 group-hover:flex">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(conv);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(conv.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t p-3">
          <div className="text-xs text-muted-foreground">
            Powered by <span className="font-semibold text-primary">Groq AI</span>
          </div>
        </div>
      </div>

      {/* ─── Main Chat Area ─── */}
      <div className="flex flex-1 flex-col">
        {displayMessages.length === 0 ? (
          /* Empty State */
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-lg text-center space-y-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">DevAI Assistant</h2>
                <p className="text-muted-foreground">
                  Seu assistente de programação e produtividade. Envie arquivos (imagens, código, documentos) para análise e receba feedback inteligente via Groq AI.
                </p>
              </div>
              <div className="grid gap-3 text-left">
                {[
                  { icon: Code2, title: "Automação", desc: "Crie um script Python para automatizar tarefas do dia a dia" },
                  { icon: Brain, title: "Conceito", desc: "Explique como funciona um sistema de autenticação JWT" },
                  { icon: Zap, title: "Projeto", desc: "Monte uma API REST completa em Node.js com Express" },
                  { icon: FileText, title: "Dia a dia", desc: "Me ajude a organizar minha rotina diária" },
                ].map((item) => (
                  <button
                    key={item.title}
                    onClick={() => handleSendMessage(item.desc)}
                    className="flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <item.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="text-sm text-muted-foreground">{item.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Messages */
          <ScrollArea ref={scrollAreaRef} className="flex-1">
            <div className="p-4 space-y-4">
              {displayMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl px-4 py-2",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    {msg.fileName && (
                      <div className="mb-1 flex items-center gap-1 text-xs opacity-70">
                        {(() => {
                          const Icon = getFileIcon(msg.fileName);
                          return <Icon className="h-3 w-3" />;
                        })()}
                        {msg.fileName}
                      </div>
                    )}
                    {msg.role === "assistant" ? (
                      <Streamdown>{msg.content}</Streamdown>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-muted px-4 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">
                      Pensando...
                    </span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {/* ─── Input Area ─── */}
        <div className="border-t bg-background p-3">
          {imagePreview && (
            <div className="mb-2 relative inline-block">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-h-32 rounded-lg border"
              />
              <Button
                size="icon"
                variant="destructive"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                onClick={() => {
                  setImagePreview(null);
                  setSelectedFile(null);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          {selectedFile && !imagePreview && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <FileIcon className="h-4 w-4 text-primary" />
              <span className="text-sm truncate flex-1">{selectedFile.name}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => {
                  setSelectedFile(null);
                  setImagePreview(null);
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          <form onSubmit={handleFormSubmit} className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.js,.jsx,.ts,.tsx,.py,.java,.go,.rs,.c,.cpp,.h,.cs,.php,.rb,.swift,.kt,.dart,.lua,.r,.sql,.json,.xml,.yaml,.yml,.md,.txt,.csv,.log,.env,.html,.css,.sh,.bash,.dockerfile,.makefile,.gitignore,.zip,.tar,.gz,.pdf,.doc,.docx"
              onChange={handleFileChange}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="shrink-0"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre programação, projetos ou envie um arquivo para análise..."
              className="min-h-[60px] max-h-[200px] resize-none flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleFormSubmit(e);
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || (!input.trim() && !selectedFile)}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          {useAdvancedReasoning && (
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Brain className="h-3 w-3" />
              <span>Modo raciocínio avançado ativado (Llama 3.3 70B)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
