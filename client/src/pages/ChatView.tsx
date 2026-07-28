import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback, Component, ReactNode } from "react";
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

  // Ajuste para altura total em dispositivos móveis (evita problemas com barra de endereço)
  useEffect(() => {
    const setAppHeight = () => {
      document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    };
    window.addEventListener('resize', setAppHeight);
    setAppHeight();
    return () => window.removeEventListener('resize', setAppHeight);
  }, []);

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

  // Hook tRPC correto para buscar mensagens da conversa ativa
  const messagesQuery = trpc.conversations.messages.useQuery(
    { id: activeConversationId! },
    { enabled: !!activeConversationId }
  );

  // Sincronizar mensagens quando a query retornar dados
  useEffect(() => {
    if (!activeConversationId) {
      setConversationMessages([]);
      setMessages([]);
      return;
    }
    if (messagesQuery.data) {
      setConversationMessages(messagesQuery.data);
      setMessages(messagesQuery.data);
    }
    if (messagesQuery.error) {
      console.error("Failed to fetch messages:", messagesQuery.error);
      setConversationMessages([]);
      setMessages([]);
    }
  }, [activeConversationId, messagesQuery.data, messagesQuery.error]);

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
        "Erro de conexão com o servidor. Verifique se a GROQ_API_KEY está configurada nas variáveis de ambiente.",
        { duration: 8000 }
      );
      return;
    }

    // Detectar erros de API key
    if (msg.includes("GROQ_API_KEY")) {
      toast.error(
        "Configuração necessária: Adicione a variável GROQ_API_KEY nas variáveis de ambiente do servidor.",
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

    // Limite de 150MB para upload via JSON
    const maxSize = 150 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`Arquivo muito grande. Limite: ${maxSize / 1024 / 1024}MB.`);
      return;
    }

    // Aviso para arquivos grandes
    const fileSizeLimit = 150 * 1024 * 1024; // 150MB
    if (file.size > fileSizeLimit) {
      toast.error(`Arquivo de ${Math.round(file.size / 1024 / 1024)}MB excede o limite de ${fileSizeLimit / 1024 / 1024}MB.`, {
        duration: 6000,
      });
      return;
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

  /**
 * ErrorBoundary local para proteger a renderização de mensagens.
 * O erro insertBefore ocorre quando o DOM é manipulado enquanto React
 * tenta re-renderizar (ex: após aprovação ou update simultâneo).
 * Este boundary captura o erro e força um re-render seguro.
 */
class MessageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-center text-sm text-muted-foreground">
          <p>Erro de renderização. <button onClick={() => this.setState({ hasError: false, error: null })} className="underline text-primary">Tentar novamente</button></p>
        </div>
      );
    }
    return this.props.children;
  }
}

function MessageItem({ msg }: { msg: DbMessage }) {
  return (
    <div
      key={msg.id}
      className={cn(
        "flex gap-3 w-full",
        msg.role === "user" ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        msg.role === "assistant" ? "bg-primary/10" : "bg-muted"
      )}>
        {msg.role === "assistant" ? <Bot className="h-4 w-4 text-primary" /> : <User className="h-4 w-4" />}
      </div>

      {/* Mensagem do usuário com arquivo: blocos separados e limpos */}
      {msg.role === "user" && msg.fileName ? (
        <div className="flex flex-col items-end gap-2 max-w-[85%] sm:max-w-[75%]">
          {/* Bloco do arquivo - separado e destacado */}
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 shadow-sm">
            {(() => {
              const Icon = getFileIcon(msg.fileName);
              return <Icon className="h-4 w-4 text-muted-foreground shrink-0" />;
            })()}
            <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{msg.fileName}</span>
            {msg.fileUrl && (
              <a href={msg.fileUrl} download={msg.fileName} className="text-muted-foreground hover:text-primary transition-colors">
                <FileText className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          {/* Texto da mensagem do usuário - bolha separada e limpa */}
          {msg.content && (
            <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-none px-4 py-3 shadow-sm">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
            </div>
          )}
        </div>
      ) : msg.role === "user" ? (
        /* Mensagem do usuário sem arquivo - bolha normal */
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-none max-w-[85%] sm:max-w-[75%] px-4 py-3 shadow-sm">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
        </div>
      ) : (
        /* Mensagem do assistente */
        <div className="bg-card border border-border rounded-2xl rounded-tl-none max-w-[85%] sm:max-w-[75%] px-4 py-3 shadow-sm">
          {msg.fileName && (
            <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg p-2 mb-3 text-xs">
              {(() => {
                const Icon = getFileIcon(msg.fileName);
                return <Icon className="h-4 w-4" />;
              })()}
              <span className="font-medium truncate">{msg.fileName}</span>
            </div>
          )}
          <div className="prose prose-sm max-w-none break-words dark:prose-invert">
            <Streamdown>{msg.content}</Streamdown>
          </div>
        </div>
      )}
    </div>
  );
}

const displayMessages = messages.filter((m) => m.role !== "system");

  const FileIcon = selectedFile ? getFileIcon(selectedFile.name) : Paperclip;

  return (
    <div 
      className="flex overflow-hidden w-full" 
      style={{ height: 'calc(var(--vh, 1vh) * 100 - 3.5rem)' }}
    >
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
	          <div 
	            ref={scrollAreaRef} 
	            className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
	            style={{ height: '100%' }}
	          >
	            {displayMessages.map((msg) => (
	              <MessageErrorBoundary key={msg.id}>
	                <MessageItem msg={msg} />
	              </MessageErrorBoundary>
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
        )}

        {/* ─── Input Area ─── */}
        <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-3 pb-safe">
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
              accept="*/*"
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
