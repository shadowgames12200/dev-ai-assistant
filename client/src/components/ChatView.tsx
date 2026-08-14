import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import {
  Paperclip,
  Send,
  Trash2,
  Loader2,
  FileText,
  Image as ImageIcon,
  Archive,
  MoreVertical,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

export default function ChatView({ conversationId }: { conversationId: number }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<DBMessage[]>([]);
  const [pendingContent, setPendingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [attachments, setAttachments] = useState<
    Array<{ id: number; fileName: string; fileType: string; storageUrl: string }>
  >([]);
  const [selectedAttIds, setSelectedAttIds] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const sendMutation = trpc.chat.chat.send.useMutation();
  const uploadMutation = trpc.chat.upload.uploadFile.useMutation();

  const { data: messagesData } = trpc.chat.conversations.messages.useQuery(
    { id: conversationId },
    { enabled: !!conversationId }
  );

  const { data: attachmentsData } = trpc.chat.conversations.attachments.useQuery(
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pendingContent]);

  const streamResponse = async (convId: number) => {
    setIsStreaming(true);
    setPendingContent("");

    // Open SSE stream manually (tRPC mutation with SSE is handled server-side)
    const resp = await fetch("/api/trpc/chat.chat.send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "trpc-accept": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        json: { conversationId: convId, content: input.trim(), attachmentIds: selectedAttIds },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      let msg = "Erro ao enviar mensagem. Tente novamente.";
      if (errText.includes("no healthy upstream") || resp.status >= 500) {
        msg = "Serviço temporariamente indisponível. Tente novamente em instantes.";
      } else if (errText.includes("4MB")) {
        msg = "Arquivo muito grande. O limite é 4MB.";
      }
      toast.error(msg);
      setIsStreaming(false);
      setPendingContent("");
      return;
    }

    const reader = resp.body?.getReader();
    if (!reader) {
      toast.error("Erro ao receber resposta do assistente.");
      setIsStreaming(false);
      return;
    }

    const decoder = new TextDecoder();
    let done = false;
    while (!done) {
      const { done: d, value } = await reader.read();
      done = d;
      if (value) {
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (line.startsWith("data: ")) {
            const payload = line.slice(6);
            if (payload === "[DONE]") {
              done = true;
              break;
            }
            try {
              const json = JSON.parse(payload);
              if (json.content) {
                setPendingContent((prev) => prev + json.content);
              } else if (json.error) {
                toast.error(json.error);
                done = true;
                break;
              }
            } catch {
              // ignore
            }
          }
        }
      }
    }

    // Refresh messages from DB after streaming completes
    try {
      const msgs = await utils.chat.conversations.messages.fetch({ id: convId });
      setMessages(msgs as DBMessage[]);
    } catch {
      // keep pending content visible
    }
    setIsStreaming(false);
    setPendingContent("");
    setSelectedAttIds([]);
  };

  const handleSend = () => {
    const content = input.trim();
    if (!content || isStreaming) return;
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
    setInput("");
    streamResponse(conversationId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 4 * 1024 * 1024) {
      toast.error("Arquivo muito grande. O limite é 4MB.");
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      const result = await uploadMutation.mutateAsync({
        conversationId,
        fileName: file.name,
        fileContent: base64,
        fileType: file.type || "application/octet-stream",
      });
      setAttachments((prev) => [
        ...prev,
        { id: result.id, fileName: result.fileName, fileType: file.type, storageUrl: result.url },
      ]);
      toast.success(`Arquivo "${file.name}" anexado.`);
    } catch (error: any) {
      console.error("[Upload] Error:", error);
      toast.error(error?.message || "Erro ao enviar arquivo. Tente novamente.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
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
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const allMessages = [...messages, ...(pendingContent ? [{
    id: -1,
    conversationId,
    role: "assistant",
    content: pendingContent,
    createdAt: new Date(),
    isPending: true,
  } as DBMessage & { isPending: boolean }] : [])];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 p-4">
        <ScrollArea ref={scrollRef as any} className="h-full pr-3">
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
                  Pergunte sobre código, debug, arquitetura de software, organização de tarefas
                  e ferramentas de produtividade.
                </p>
              </div>
            )}
            {allMessages.map((msg) => {
              const isAssistant = msg.role === "assistant";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isAssistant ? "" : "justify-end"}`}
                >
                  {isAssistant && (
                    <Avatar className="h-8 w-8 shrink-0 bg-violet-500/20">
                      <AvatarFallback className="text-xs text-violet-300">AI</AvatarFallback>
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
                      <p className="text-xs opacity-70 mb-1">{formatRole(msg.role)}</p>
                    )}
                    {isAssistant ? (
                      <Streamdown>{msg.content}</Streamdown>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {!isAssistant && (
                    <Avatar className="h-8 w-8 shrink-0 bg-foreground/10">
                      <AvatarFallback className="text-xs">EU</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })}
            {isStreaming && pendingContent === "" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando resposta...
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {attachments.map((att) => (
            <button
              key={att.id}
              onClick={() => toggleAttachment(att.id)}
              className={`flex items-center gap-2 text-xs rounded-lg border px-2 py-1.5 transition-colors ${
                selectedAttIds.includes(att.id)
                  ? "border-violet-500 bg-violet-500/10 text-violet-300"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {(() => {
                const Icon = fileIcon(att.fileType);
                return <Icon className="h-3.5 w-3.5" />;
              })()}
              <span className="truncate max-w-[180px]">{att.fileName}</span>
            </button>
          ))}
          <p className="text-[10px] text-muted-foreground self-center">
            {selectedAttIds.length > 0
              ? `${selectedAttIds.length} selecionado(s) para o contexto`
              : "Clique em um arquivo para incluí-lo na próxima mensagem"}
          </p>
        </div>
      )}

      {/* Input area */}
      <div className="border-t bg-background p-3">
        <form
          className="flex items-end gap-2 max-w-3xl mx-auto"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 bg-transparent"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.txt,.md,.json,.js,.ts,.tsx,.py,.java,.c,.cpp,.h,.cs,.html,.css,.zip"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte sobre programação ou produtividade..."
            disabled={isStreaming}
            className="flex-1 bg-muted/50"
          />
          <Button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="shrink-0 bg-violet-600 hover:bg-violet-500"
          >
            {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Sparkles(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}
