import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

import {
  Paperclip,
  Send,
  Loader2,
  FileText,
  Image as ImageIcon,
  Archive,
  Cpu,
  CircleAlert,
  Sparkles,
} from "lucide-react";

import { trpc } from "@/lib/trpc";

import {
  buildCreditBlockedMessage,
  formatCreditLabel,
  getChatCreditUiState,
} from "@/lib/credits";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type DBMessage = {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  fileUrl?: string | null;
  fileName?: string | null;
  createdAt: Date;
};

function fileIcon(type: string) {
  if (type.startsWith("image/")) return ImageIcon;
  if (type.includes("zip")) return Archive;
  return FileText;
}

function formatRole(role: string) {
  return role === "assistant" ? "DevAI" : "Você";
}

export default function ChatView({
  conversationId,
}: {
  conversationId: number;
}) {
  const [, setLocation] = useLocation();

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<DBMessage[]>([]);
  const [pendingContent, setPendingContent] = useState("");

  const [isStreaming, setIsStreaming] = useState(false);
  const [isAgentMode, setIsAgentMode] = useState(false);
  const [creditNotice, setCreditNotice] = useState<string | null>(null);

  const [attachments, setAttachments] = useState<
    Array<{
      id: number;
      fileName: string;
      fileType: string;
      storageUrl: string;
    }>
  >([]);

  const [selectedAttIds, setSelectedAttIds] = useState<number[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const sendMutation = trpc.chat.send.useMutation();
  const uploadMutation = trpc.upload.file.useMutation();

  const {
    data: credits,
    isLoading: isCreditsLoading,
  } = trpc.credits.me.useQuery();

  const { data: capacity } = trpc.chat.checkCapacity.useQuery(undefined, {
    refetchInterval: 10000,
  });

  const creditUiState = getChatCreditUiState(credits);

  const creditsExhausted =
    !isCreditsLoading && creditUiState.blocked;

  const capacityExhausted =
    capacity !== undefined && !capacity.available;

  const inputDisabled =
    isStreaming || creditsExhausted || capacityExhausted;

  const { data: messagesData } =
    trpc.chat.conversations.messages.useQuery(
      { id: conversationId },
      { enabled: !!conversationId }
    );

  const { data: attachmentsData } =
    trpc.chat.conversations.attachments.useQuery(
      { conversationId },
      { enabled: !!conversationId }
    );

  useEffect(() => {
    if (!conversationId) return;

    setMessages((messagesData as DBMessage[]) ?? []);
  }, [conversationId, messagesData]);

  useEffect(() => {
    setAttachments((attachmentsData as any[]) ?? []);
  }, [attachmentsData]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pendingContent]);

  /*
   * Mantém o input focado quando ele estiver disponível.
   * Isso também ajuda no celular quando o componente sofre
   * uma atualização causada pelo React Query.
   */
  useEffect(() => {
    if (!inputDisabled) {
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      return () => window.clearTimeout(timer);
    }
  }, [inputDisabled, conversationId]);

  const streamResponse = async (convId: number, content: string) => {
    setIsStreaming(true);
    setPendingContent("");

    try {
      await sendMutation.mutateAsync({
        conversationId: convId,
        content,
        attachmentIds: selectedAttIds,
      });

      const msgs =
        await utils.chat.conversations.messages.fetch({
          id: convId,
        });

      setMessages(msgs as DBMessage[]);
    } catch (err: any) {
      toast.error(
        err?.message || "Erro ao enviar mensagem."
      );
    } finally {
      setIsStreaming(false);
      setPendingContent("");
      setSelectedAttIds([]);

      utils.credits.me.invalidate();
    }
  };

  const handleSend = () => {
    const content = input.trim();

    if (!content || isStreaming) return;

    if (creditsExhausted) {
      setCreditNotice(
        buildCreditBlockedMessage(
          credits?.balance || 0,
          1
        )
      );
      return;
    }

    if (capacityExhausted) {
      toast.error(
        capacity?.message ||
          "O sistema está com muitos acessos. Tente novamente em instantes."
      );
      return;
    }

    setCreditNotice(null);

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        conversationId,
        role: "user",
        content,
        createdAt: new Date(),
      },
    ]);

    /*
     * Guarda o conteúdo antes de limpar o input.
     * Isso evita problemas de estado assíncrono.
     */
    setInput("");

    void streamResponse(conversationId, content);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();

      if (!e.shiftKey) {
        handleSend();
      }
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setInput(e.target.value);
  };

  const handleInputPointerDown = () => {
    if (!inputDisabled) {
      window.setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      toast.error(
        "Arquivo muito grande. O limite é 4MB."
      );
      return;
    }

    try {
      const base64 = await fileToBase64(file);

      await uploadMutation.mutateAsync({
        conversationId,
        fileName: file.name,
        fileType:
          file.type || "application/octet-stream",
        base64,
      });

      utils.chat.conversations.attachments.invalidate();

      toast.success(
        `Arquivo "${file.name}" anexado.`
      );
    } catch (error: any) {
      console.error("[Upload] Error:", error);

      toast.error(
        error?.message ||
          "Erro ao enviar arquivo. Tente novamente."
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const fileToBase64 = (
    file: File
  ): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = reader.result as string;

        resolve(dataUrl.split(",")[1]);
      };

      reader.onerror = reject;

      reader.readAsDataURL(file);
    });

  const toggleAttachment = (id: number) => {
    setSelectedAttIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  };

  const allMessages = [
    ...messages,
    ...(pendingContent
      ? [
          {
            id: -1,
            conversationId,
            role: "assistant",
            content: pendingContent,
            createdAt: new Date(),
            isPending: true,
          } as DBMessage & {
            isPending: boolean;
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 p-4">
        <ScrollArea
          ref={scrollRef as any}
          className="h-full pr-3"
        >
          <div className="flex flex-col gap-4 max-w-3xl mx-auto">
            {allMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
                <div className="h-14 w-14 rounded-xl bg-violet-500/20 flex items-center justify-center">
                  <Sparkles className="h-7 w-7 text-violet-400" />
                </div>

                <h2 className="text-lg font-semibold text-foreground">
                  Como posso ajudar com programação e produtividade?
                </h2>

                <p className="text-sm text-muted-foreground max-w-sm">
                  Pergunte sobre código, debug,
                  arquitetura de software,
                  organização de tarefas e
                  ferramentas de produtividade.
                </p>
              </div>
            )}

            {allMessages.map((msg) => {
              const isAssistant =
                msg.role === "assistant";

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    isAssistant
                      ? ""
                      : "justify-end"
                  }`}
                >
                  {isAssistant && (
                    <Avatar className="h-8 w-8 shrink-0 bg-violet-500/20">
                      <AvatarFallback className="text-xs text-violet-300">
                        AI
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-3 max-w-[80%] ${
                      isAssistant
                        ? "bg-muted text-foreground"
                        : "bg-violet-600 text-white"
                    }`}
                  >
                    {!isAssistant && (
                      <p className="text-xs opacity-70 mb-1">
                        {formatRole(msg.role)}
                      </p>
                    )}

                    {isAssistant ? (
                      <div className="chat-markdown">
                        {isAgentMode &&
                          (msg as any).isPending && (
                            <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-amber-400">
                              <Cpu className="h-3.5 w-3.5" />
                              <span>
                                Modo Agente (5 créditos)
                              </span>
                            </div>
                          )}

                        <Streamdown>
                          {msg.content}
                        </Streamdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    )}
                  </div>

                  {!isAssistant && (
                    <Avatar className="h-8 w-8 shrink-0 bg-foreground/10">
                      <AvatarFallback className="text-xs">
                        EU
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })}

            {isStreaming &&
              pendingContent === "" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando resposta...
                </div>
              )}
          </div>
        </ScrollArea>
      </div>

      {attachments.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {attachments.map((att) => (
            <button
              key={att.id}
              type="button"
              onClick={() =>
                toggleAttachment(att.id)
              }
              className={`flex items-center gap-2 text-xs rounded-lg border px-2 py-1.5 transition-colors ${
                selectedAttIds.includes(att.id)
                  ? "border-violet-500 bg-violet-500/10 text-violet-300"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {(() => {
                const Icon = fileIcon(
                  att.fileType
                );

                return (
                  <Icon className="h-3.5 w-3.5" />
                );
              })()}

              <span className="truncate max-w-[180px]">
                {att.fileName}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="border-t bg-background p-3">
        {(creditsExhausted ||
          creditNotice ||
          capacityExhausted) && (
          <div
            role="alert"
            className={`mx-auto mb-3 flex max-w-3xl items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
              capacityExhausted
                ? "border-blue-400/30 bg-blue-400/10 text-blue-100"
                : "border-amber-400/30 bg-amber-400/10 text-amber-100"
            }`}
          >
            <CircleAlert
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                capacityExhausted
                  ? "text-blue-300"
                  : "text-amber-300"
              }`}
            />

            <div className="flex-1">
              <p className="font-medium">
                {capacityExhausted
                  ? "Capacidade máxima"
                  : "Créditos insuficientes"}
              </p>

              <p className="mt-0.5 opacity-80">
                {capacityExhausted
                  ? capacity?.message ||
                    "O sistema está com muitos acessos. Tente novamente em instantes."
                  : creditNotice ||
                    creditUiState.notice ||
                    buildCreditBlockedMessage(
                      credits?.balance || 0,
                      1
                    )}
              </p>

              {!capacityExhausted && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-[10px]"
                  onClick={() =>
                    setLocation("/recharge")
                  }
                >
                  Recarregar créditos
                </Button>
              )}
            </div>
          </div>
        )}

        <form
          className="flex items-end gap-2 max-w-3xl mx-auto"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 bg-transparent"
            onClick={() =>
              fileInputRef.current?.click()
            }
            disabled={inputDisabled}
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />

          <Input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPointerDown={handleInputPointerDown}
            placeholder={
              isStreaming
                ? "Aguarde a resposta..."
                : capacityExhausted
                ? "Capacidade máxima atingida..."
                : creditsExhausted
                ? "Créditos insuficientes..."
                : "Pergunte sobre programação ou produtividade..."
            }
            disabled={inputDisabled}
            autoComplete="off"
            autoCorrect="on"
            spellCheck={true}
            className="flex-1 bg-muted border-none focus-visible:ring-1 focus-visible:ring-violet-500"
          />

          <Button
            type="submit"
            size="icon"
            className="shrink-0 bg-violet-600 hover:bg-violet-500 text-white"
            disabled={
              !input.trim() ||
              isStreaming ||
              creditsExhausted ||
              capacityExhausted
            }
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
