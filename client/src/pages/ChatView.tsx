import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type DbMessage = {
  fileUrl?: string;
  fileName?: string;
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
      queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] });
    },
  });

  const deleteConversationMutation = trpc.conversations.delete.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] });
      if (activeConversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    },
  });

  const renameConversationMutation = trpc.conversations.rename.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] });
      setEditingId(null);
      setEditingTitle("");
    },
  });

  const chatMutation = trpc.chat.send.useMutation({
    onSuccess: (data) => {
      setMessages(data.messages);
      setIsLoading(false);
      queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] });
    },
    onError: (error) => {
      toast.error("Erro ao enviar mensagem. Tente novamente.");
      setIsLoading(false);
    },
  });

  // Sync messages from query
  useEffect(() => {
    if (messagesQuery.data) {
      setMessages(messagesQuery.data);
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
    textareaRef.current?.focus();
  };

  const handleSendMessage = (content: string) => {
    if (!content.trim() || isLoading) return;

    let convId = activeConversationId;

    // If no active conversation, create one
    if (!convId) {
      convId = -1; // placeholder
      // We need to create first, then send
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

  const uploadFileMutation = trpc.upload.uploadFile.useMutation({
    onSuccess: (data) => {
      setMessages(data.messages);
      setIsLoading(false);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["conversations", "list"] });
    },
    onError: (error) => {
      toast.error("Erro ao fazer upload do arquivo. Tente novamente.");
      setIsLoading(false);
      setSelectedFile(null);
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setInput(""); // Clear text input when file is selected
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile || isLoading || !activeConversationId) return;

    setIsLoading(true);
    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = () => {
      const base64Content = (reader.result as string).split(",")[1];
      uploadFileMutation.mutate({
        conversationId: activeConversationId,
        fileName: selectedFile.name,
        fileContent: base64Content,
        fileType: selectedFile.type,
      });
    };
    reader.onerror = (error) => {
      toast.error("Erro ao ler o arquivo.");
      setIsLoading(false);
    };
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFile) {
      handleFileUpload();
    } else {
      handleSendMessage(input);
    }
  };
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ─── Sidebar ─── */}
      <div className="hidden lg:flex w-72 flex-col border-r bg-sidebar/50">
        {/* New Chat Button */}
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

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <div className="space-y-0.5">
            {conversationsQuery.data?.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nenhuma conversa ainda.
                <br />
                Inicie uma nova!
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
                  onClick={() => {
                    if (!isEditing) {
                      setActiveConversationId(conv.id);
                    }
                  }}
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
                      <button
                        onClick={() => handleConfirmRename(conv.id)}
                        className="shrink-0 rounded p-1 hover:bg-accent"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="shrink-0 rounded p-1 hover:bg-accent"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <MessageSquarePlus className="h-4 w-4 shrink-0 opacity-60" />
                      <span className="flex-1 truncate text-sm">{conv.title}</span>
                      <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(conv);
                          }}
                          className="rounded p-1 hover:bg-accent"
                          title="Renomear"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteConversation(conv.id);
                          }}
                          className="rounded p-1 hover:bg-destructive/20 hover:text-destructive"
                          title="Excluir"
                        >
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
        {/* Mobile New Chat */}
        <div className="lg:hidden flex items-center gap-2 border-b px-4 py-2.5 bg-background/80 backdrop-blur">
          <Button
            onClick={handleNewConversation}
            size="sm"
            className="gap-1.5"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Nova
          </Button>
          <div className="flex-1" />
          {activeConversationId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveConversationId(null);
                setMessages([]);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Messages */}
        <div ref={scrollAreaRef} className="flex-1 overflow-y-auto">
          {displayMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8">
              <div className="max-w-2xl w-full space-y-8">
                {/* Logo / Header */}
                <div className="flex flex-col items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/25">
                    <Sparkles className="h-8 w-8 text-white" />
                  </div>
                  <div className="text-center space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight">
                      DevAI Assistant
                    </h1>
                    <p className="text-sm text-muted-foreground max-w-md">
                      Seu assistente de programação e produtividade. Pergunte qualquer coisa sobre código, projetos ou tarefas do dia a dia.
                    </p>
                  </div>
                </div>

                {/* Suggested Prompts */}
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
                        <p className="text-sm font-medium leading-tight">
                          {prompt.desc}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {prompt.text}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">
              {displayMessages.map((message, index) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user"
                      ? "justify-end"
                      : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="shrink-0 mt-0.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm">
                        <Sparkles className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  )}

                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border shadow-sm"
                    )}
                  >
                    {message.fileUrl && message.fileName ? (
                      <div className="flex items-center gap-2">
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        <a
                          href={message.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-500 hover:underline"
                        >
                          {message.fileName}
                        </a>
                      </div>
                    ) : message.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted prose-pre:border prose-pre:border-border prose-pre:rounded-lg">
                        <Streamdown>{message.content}</Streamdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </p>
                    )}
                  </div>

                  {message.role === "user" && (
                    <div className="shrink-0 mt-0.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                        <User className="h-4 w-4 text-secondary-foreground" />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3">
                  <div className="shrink-0 mt-0.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-card border shadow-sm px-4 py-3">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">{useAdvancedReasoning ? "Raciocínio avançado em andamento..." : "Pensando..."}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:backdrop-blur px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={handleFormSubmit}
              className="flex flex-col gap-3"
            >
              <div className="flex items-center gap-2 px-1">
                <div className="flex items-center gap-2 ml-auto">
                  <Brain className="h-4 w-4 text-violet-500" />
                  <label className="text-xs font-medium text-muted-foreground cursor-pointer">
                    Raciocínio Avançado
                  </label>
                  <input
                    type="checkbox"
                    checked={useAdvancedReasoning}
                    onChange={(e) => setUseAdvancedReasoning(e.target.checked)}
                    disabled={isLoading}
                    className="w-4 h-4 rounded border-gray-300 text-violet-500 focus:ring-violet-500 cursor-pointer"
                  />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSelectedFile(null);
                    }
                  }}
                  placeholder={selectedFile ? `Anexado: ${selectedFile.name}` : "Pergunte sobre programação, projetos ou qualquer coisa..."}
                  className="flex-1 resize-none min-h-[44px] max-h-32 pr-10 rounded-xl border bg-background focus-visible:ring-1 focus-visible:ring-primary"
                  rows={1}
                  disabled={!!selectedFile}
                />
                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="absolute right-12 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-accent text-muted-foreground"
                    title="Remover anexo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-accent text-muted-foreground"
                  title="Anexar arquivo"
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
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
              </div>
            </form>
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground/70">
              DevAI pode cometer erros. Verifique informações importantes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(input);
                    }
                  }}
                  placeholder="Pergunte sobre programação, projetos ou qualquer coisa..."
                  className="flex-1 resize-none min-h-[44px] max-h-32 pr-10 rounded-xl border bg-background focus-visible:ring-1 focus-visible:ring-primary"
                  rows={1}
                />
              </div>
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading}
                className="shrink-0 h-11 w-11 rounded-xl shadow-md"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
              </div>
            </form>
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground/70">
              DevAI pode cometer erros. Verifique informações importantes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
