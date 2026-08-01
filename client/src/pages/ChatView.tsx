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
  Menu,
  ChevronLeft,
  History,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useJarvisVoice } from "@/hooks/useJarvisVoice";
import { JarvisVisualizer } from "@/components/JarvisVisualizer";

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

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/bmp", "image/svg+xml",
]);

function isImageFile(file: File): boolean {
  return IMAGE_MIME_TYPES.has(file.type.toLowerCase());
}

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
  const codeExts = ["js", "jsx", "ts", "tsx", "py", "java", "go", "rs", "c", "cpp", "h", "cs", "php", "rb", "swift", "kt", "dart", "lua", "r", "ps1", "bat", "sh", "ra"];
  const docExts = ["json", "xml", "yaml", "yml", "md", "csv", "txt", "log", "env", "ini", "toml", "cfg", "conf", "sql", "graphql"];

  if (imageExts.includes(ext)) return ImageIcon;
  if (codeExts.includes(ext)) return Code2;
  if (docExts.includes(ext)) return FileJson;
  if (ext === "zip" || ext === "rar" || ext === "7z" || ext === "tar" || ext === "gz") return FileArchive;
  return File;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Agora mesmo";
  if (minutes < 60) return `Há ${minutes} min`;
  if (hours < 24) return `Há ${hours}h`;
  if (days < 7) return `Há ${days}d`;
  return new Date(date).toLocaleDateString("pt-BR");
}

export default function ChatView() {
  const queryClient = useQueryClient();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(() => {
    const saved = localStorage.getItem("devai-last-conversation");
    return saved ? parseInt(saved, 10) : null;
  });
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [useAdvancedReasoning, setUseAdvancedReasoning] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [thinkingDots, setThinkingDots] = useState("");
  const [isJarvisMode, setIsJarvisMode] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const { isListening, isSpeaking, startListening, stopListening, speak } = useJarvisVoice((text) => {
    handleSendMessage(text);
  });

  useEffect(() => {
    if (!isLoading) {
      setThinkingDots("");
      return;
    }
    const interval = setInterval(() => {
      setThinkingDots(prev => prev.length >= 3 ? "" : prev + ".");
    }, 500);
    return () => clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem("devai-last-conversation", activeConversationId.toString());
    } else {
      localStorage.removeItem("devai-last-conversation");
    }
  }, [activeConversationId]);

  const handleConversationSelect = useCallback((convId: number) => {
    setActiveConversationId(convId);
    setSidebarOpen(false);
  }, []);

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
      setSidebarOpen(false);
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

  const messagesQuery = trpc.conversations.messages.useQuery(
    { id: activeConversationId! },
    { enabled: !!activeConversationId }
  );

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    if (messagesQuery.data) {
      setMessages(messagesQuery.data);
    }
    if (messagesQuery.error) {
      console.error("Failed to fetch messages:", messagesQuery.error);
      setMessages([]);
    }
  }, [activeConversationId, messagesQuery.data, messagesQuery.error]);

  const chatMutation = trpc.chat.send.useMutation({
    onSuccess: (data) => {
      setMessages(data.messages);
      setIsLoading(false);
      setInput("");
      queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });

      if (isJarvisMode) {
        const lastMsg = data.messages[data.messages.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          speak(lastMsg.content);
        }
      }
    },
    onError: (error: any) => {
      handleApiError(error, "chat");
      setIsLoading(false);
    },
  });

  const uploadFileMutation = trpc.upload.uploadFile.useMutation({
    onSuccess: (data) => {
      setMessages(data.messages);
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

  function handleApiError(error: any, context: string) {
    console.error(`[${context}] Error:`, error);
    const msg = error?.message || error?.toString() || "";

    if (msg.includes("Unexpected token") || msg.includes("is not valid JSON")) {
      toast.error("Erro de conexão com o servidor. Verifique se a GROQ_API_KEY está configurada.", { duration: 8000 });
      return;
    }
    if (msg.includes("GROQ_API_KEY")) {
      toast.error("Configuração necessária: Adicione GROQ_API_KEY nas variáveis de ambiente.", { duration: 10000 });
      return;
    }
    if (msg.includes("rate limit") || msg.includes("429")) {
      toast.error("Limite de requisições atingido. Aguarde um momento.");
      return;
    }
    toast.error(msg || `Erro ao enviar ${context === "upload" ? "arquivo" : "mensagem"}.`);
  }

  const scrollToBottom = useCallback(() => {
    const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLDivElement;
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

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    let convId = activeConversationId;

    if (!convId) {
      createConversationMutation.mutate(
        { title: content.slice(0, 50) },
        {
          onSuccess: (data) => {
            setActiveConversationId(data.id);
            handleSendMessage(content);
          }
        }
      );
      return;
    }

    setIsLoading(true);
    setInput("");

    if (isJarvisMode) {
      // MODO STREAMING PARA J.A.R.V.I.S. (Instantâneo)
      try {
        const response = await fetch(`/api/chat/stream?conversationId=${convId}&content=${encodeURIComponent(content)}`);
        if (!response.ok) throw new Error("Falha no streaming");

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let sentenceBuffer = "";

        // Adicionar mensagem do usuário localmente
        setMessages(prev => [...prev, { 
          id: Date.now(), 
          conversationId: convId!, 
          role: "user", 
          content, 
          createdAt: new Date() 
        }]);

        // Placeholder para a resposta do assistente
        const assistantMsgId = Date.now() + 1;
        setMessages(prev => [...prev, { 
          id: assistantMsgId, 
          conversationId: convId!, 
          role: "assistant", 
          content: "", 
          createdAt: new Date() 
        }]);

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              
              try {
                const { token } = JSON.parse(data);
                if (token) {
                  fullText += token;
                  sentenceBuffer += token;

                  // Atualizar UI em tempo real
                  setMessages(prev => prev.map(m => 
                    m.id === assistantMsgId ? { ...m, content: fullText } : m
                  ));

                  // Se detectou fim de frase, fala agora!
                  if (/[.!?\n]/.test(token) && sentenceBuffer.length > 20) {
                    speak(sentenceBuffer, true);
                    sentenceBuffer = "";
                  }
                }
              } catch (e) {}
            }
          }
        }
        
        // Fala o que sobrou
        if (sentenceBuffer.trim()) speak(sentenceBuffer, true);
        
        setIsLoading(false);
        queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
      } catch (err) {
        console.error("Streaming error:", err);
        setIsLoading(false);
        chatMutation.mutate({ conversationId: convId, content: content.trim(), useAdvancedReasoning });
      }
    } else {
      // MODO NORMAL (tRPC)
      chatMutation.mutate({ conversationId: convId, content: content.trim(), useAdvancedReasoning });
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const maxSize = 150 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`Arquivo muito grande. Limite: ${maxSize / 1024 / 1024}MB.`);
      return;
    }

    setSelectedFile(file);

    if (isImageFile(file)) {
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }

    setTimeout(() => textareaRef.current?.focus(), 100);
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

        {msg.role === "user" && msg.fileName ? (
          <div className="flex flex-col items-end gap-2 max-w-[85%] sm:max-w-[75%]">
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
            {msg.content && (
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-none px-4 py-3 shadow-sm">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              </div>
            )}
          </div>
        ) : msg.role === "user" ? (
          <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-none max-w-[85%] sm:max-w-[75%] px-4 py-3 shadow-sm">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
          </div>
        ) : (
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
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={cn(
        "fixed lg:relative inset-y-0 left-0 z-50 w-80 flex-col border-r bg-background transition-transform duration-300 ease-in-out lg:flex",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex items-center justify-between p-3 border-b">
          <h2 className="font-semibold text-sm flex items-center gap-2">
            <History className="h-4 w-4" />
            Conversas
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

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
          {conversationsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversationsQuery.data?.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Nenhuma conversa ainda.<br />Inicie uma nova!
            </div>
          ) : (
            <div className="space-y-0.5">
              {conversationsQuery.data?.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg px-3 py-2.5 text-sm transition-colors cursor-pointer",
                    activeConversationId === conv.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent/50 text-muted-foreground"
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
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleConfirmRename(conv.id); }}>
                        <Check className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setEditingId(null); }}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <span className="truncate block">{conv.title}</span>
                        <span className="text-[10px] opacity-60">{formatTimeAgo(conv.updatedAt)}</span>
                      </div>
                      <div className="hidden gap-1 group-hover:flex shrink-0">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleStartRename(conv); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t p-3">
          <div className="text-xs text-muted-foreground">
            Powered by <span className="font-semibold text-primary">Groq AI</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
              <span className="font-semibold text-sm">
              {activeConversationId
                ? conversationsQuery.data?.find(c => c.id === activeConversationId)?.title || "Conversa"
                : "J.A.R.V.I.S."
              }
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-full transition-all",
                useAdvancedReasoning ? "bg-primary/20 text-primary" : "text-muted-foreground"
              )}
              onClick={() => setUseAdvancedReasoning(!useAdvancedReasoning)}
              title="Raciocínio Avançado"
            >
              <Brain className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-full transition-all",
                isJarvisMode ? "bg-cyan-500/20 text-cyan-500" : "text-muted-foreground"
              )}
              onClick={() => {
                const newMode = !isJarvisMode;
                setIsJarvisMode(newMode);
                if (newMode) {
                  toast.info("J.A.R.V.I.S. Ativado");
                  speak("Sistemas online, senhor. Como posso ajudar?");
                } else {
                  stopListening();
                  toast.info("J.A.R.V.I.S. Desativado");
                }
              }}
              title="Modo J.A.R.V.I.S."
            >
              {isJarvisMode ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {displayMessages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-lg text-center space-y-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">J.A.R.V.I.S.</h2>
                <p className="text-muted-foreground">
                  Seu assistente de programação e produtividade. Envie arquivos para análise e receba feedback inteligente.
                </p>
              </div>
              <Button onClick={handleNewConversation} size="lg" className="gap-2">
                <MessageSquarePlus className="h-4 w-4" />
                Iniciar nova conversa
              </Button>
            </div>
          </div>
        ) : (
          <div
            ref={scrollAreaRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
            style={{ height: '100%' }}
          >
            {isJarvisMode && (
              <div className="flex justify-center py-8">
                <JarvisVisualizer isListening={isListening} isSpeaking={isSpeaking} />
              </div>
            )}
            {displayMessages.map((msg) => (
              <MessageErrorBoundary key={msg.id}>
                <MessageItem msg={msg} />
              </MessageErrorBoundary>
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">
                      Seu assistente está pensando{thinkingDots}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-3 pb-safe">
          {imagePreview && (
            <div className="mb-2 relative inline-block">
              <img src={imagePreview} alt="Preview" className="max-h-32 rounded-lg border" />
              <Button size="icon" variant="destructive" className="absolute -top-2 -right-2 h-6 w-6 rounded-full" onClick={() => { setImagePreview(null); setSelectedFile(null); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          {selectedFile && !imagePreview && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <FileIcon className="h-4 w-4 text-primary" />
              <span className="text-sm truncate flex-1">{selectedFile.name}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setSelectedFile(null); setImagePreview(null); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          <form onSubmit={handleFormSubmit} className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" className="hidden" accept="*/*" onChange={handleFileChange} />
            <Button type="button" size="icon" variant="outline" className="shrink-0" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre programação ou ative o J.A.R.V.I.S..."
              className="min-h-[60px] max-h-[200px] resize-none flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleFormSubmit(e);
                }
              }}
            />
            <div className="flex items-center gap-2">
              {isJarvisMode && (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={cn(
                    "h-10 w-10 rounded-xl transition-all shrink-0",
                    isListening ? "bg-red-500/10 border-red-500 text-red-500 animate-pulse" : "border-cyan-500/50 text-cyan-500"
                  )}
                  onClick={() => isListening ? stopListening() : startListening()}
                >
                  {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
              )}
              <Button type="submit" size="icon" disabled={isLoading || (!input.trim() && !selectedFile)} className="shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
