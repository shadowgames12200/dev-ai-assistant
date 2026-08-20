import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Plus,
  MessageSquare,
  Trash2,
  Pencil,
  LogOut,
  Sparkles,
  Settings,
  Check,
  X,
  Coins,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import ChatView from "@/components/ChatView";
import { formatCreditLabel } from "@/lib/credits";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Chat() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [conversations, setConversations] = useState<
    Array<{ id: number; title: string; updatedAt: Date }>
  >([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const renameRef = useRef<HTMLInputElement>(null);

  const { data: convs } = trpc.chat.conversations.list.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: credits } = trpc.credits.me.useQuery(undefined, {
    enabled: !!user,
  });

  useEffect(() => {
    if (convs) setConversations(convs as any[]);
  }, [convs]);

  useEffect(() => {
    if (conversations.length > 0 && !selectedId) {
      setSelectedId(conversations[0].id);
    }
  }, [conversations, selectedId]);

  const createMutation = trpc.chat.conversations.create.useMutation({
    onSuccess: (data) => {
      utils.chat.conversations.list.invalidate();
      setSelectedId(data.id);
    },
    onError: (err) => toast.error("Erro ao criar conversa: " + err.message),
  });

  const deleteMutation = trpc.chat.conversations.delete.useMutation({
    onSuccess: () => {
      utils.chat.conversations.list.invalidate();
      setConversations((prev) => prev.filter((c) => c.id !== selectedId));
      setSelectedId(null);
      toast.success("Conversa excluída.");
    },
    onError: (err) => toast.error("Erro ao excluir: " + err.message),
  });

  const renameMutation = trpc.chat.conversations.rename.useMutation({
    onSuccess: () => {
      utils.chat.conversations.list.invalidate();
      setConversations((prev) =>
        prev.map((c) => (c.id === editingId ? { ...c, title: editingTitle } : c))
      );
      setEditingId(null);
      toast.success("Conversa renomeada.");
    },
    onError: (err) => toast.error("Erro ao renomear: " + err.message),
  });

  const handleCreate = () => createMutation.mutate({});

  const handleDelete = (id: number) => {
    if (window.confirm("Excluir esta conversa? Esta ação não pode ser desfeita.")) {
      deleteMutation.mutate({ id });
    }
  };

  const startRename = (c: { id: number; title: string }) => {
    setEditingId(c.id);
    setEditingTitle(c.title);
    setTimeout(() => renameRef.current?.focus(), 50);
  };

  const submitRename = (id: number) => {
    const title = editingTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    renameMutation.mutate({ id, title });
  };

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? "w-72" : "w-0"} shrink-0 border-r border-white/10 bg-[#0f0f16] flex flex-col transition-all duration-200 overflow-hidden`}
      >
        <div className="p-3 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-5 w-5 text-violet-400 shrink-0" />
            <span className="font-semibold truncate">DevAI Assistant</span>
          </div>
        </div>

        <div className="p-3">
          <Button
            onClick={handleCreate}
            className="w-full bg-violet-600 hover:bg-violet-500 text-white"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Nova conversa
          </Button>
        </div>

        <ScrollArea className="flex-1 px-3 pb-2">
          <div className="flex flex-col gap-1">
            {conversations.length === 0 && (
              <p className="text-xs text-zinc-500 text-center py-6">
                Nenhuma conversa ainda. Crie uma nova para começar.
              </p>
            )}
            {conversations.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-1 rounded-lg px-2 py-2 cursor-pointer transition-colors ${
                  selectedId === c.id ? "bg-white/10" : "hover:bg-white/5"
                }`}
                onClick={() => setSelectedId(c.id)}
              >
                <MessageSquare className="h-4 w-4 text-zinc-400 shrink-0" />
                {editingId === c.id ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <Input
                      ref={renameRef}
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(c.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="h-6 text-xs bg-[#1e1e28] border-white/10"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        submitRename(c.id);
                      }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm truncate flex-1">{c.title}</span>
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-zinc-400 hover:text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(c);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-zinc-400 hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(c.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-white/10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 w-full rounded-lg px-2 py-2 hover:bg-white/5 transition-colors text-left">
                <div className="h-8 w-8 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-medium text-violet-300">
                    {user?.name?.charAt(0).toUpperCase() ?? "U"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user?.name || "-"}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {user?.email || "-"}{" "}
                    {user?.role === "admin" && "(admin)"}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {user?.role === "admin" && (
                <DropdownMenuItem
                  onClick={() => setLocation("/admin")}
                  className="cursor-pointer"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Painel admin
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => logout()}
                className="cursor-pointer text-red-400 focus:text-red-400"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-12 border-b border-white/10 flex items-center justify-between px-3 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="text-zinc-400"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <span className="sr-only">Alternar painel</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </Button>
          <span className="text-sm font-medium truncate px-2">
            {conversations.find((c) => c.id === selectedId)?.title ?? "DevAI Assistant"}
          </span>
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-zinc-300">
            <Coins className="h-3.5 w-3.5 text-amber-300" />
            <span>{formatCreditLabel(credits)}</span>
          </div>
        </header>
        <div className="flex-1 min-h-0">
          {selectedId ? (
            <ChatView conversationId={selectedId} />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500">
              <p className="text-sm">
                Selecione uma conversa ou crie uma nova para começar.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
