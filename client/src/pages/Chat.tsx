import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
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
  MoreVertical,
  UserRoundCog,
  Menu,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import ChatView from "@/components/ChatView";
import { formatCreditLabel } from "@/lib/credits";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/useMobile";

export default function Chat() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const isMobile = useIsMobile();
  const [conversations, setConversations] = useState<
    Array<{ id: number; title: string; updatedAt: Date }>
  >([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false); // Iniciar fechado e abrir no mount se necessário
  const renameRef = useRef<HTMLInputElement>(null);
  const accountMenuRef = useRef<HTMLDetailsElement>(null);

  // Fechar menu da conta ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        accountMenuRef.current.removeAttribute('open');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    if (conversations.length > 0 && !selectedId && !isMobile) {
      setSelectedId(conversations[0].id);
    }
  }, [conversations, selectedId, isMobile]);

  useEffect(() => {
    if (isMobile !== undefined) {
      setSidebarOpen(!isMobile);
    }
  }, [isMobile]);

  const createMutation = trpc.chat.conversations.create.useMutation({
    onSuccess: (data) => {
      utils.chat.conversations.list.invalidate();
      setSelectedId(data.id);
      if (isMobile) setSidebarOpen(false);
    },
    onError: (err) => toast.error("Erro ao criar conversa: " + err.message),
  });

  const deleteMutation = trpc.chat.conversations.delete.useMutation({
    onSuccess: (_data, variables) => {
      utils.chat.conversations.list.invalidate();
      setConversations((prev) => prev.filter((c) => c.id !== variables.id));
      setSelectedId((currentId) => (currentId === variables.id ? null : currentId));
      toast.success("Conversa excluída.");
    },
    onError: (err) => toast.error("Erro ao excluir: " + err.message),
  });

  const clearMutation = trpc.chat.conversations.clear.useMutation({
    onSuccess: () => {
      utils.chat.conversations.list.invalidate();
      setConversations([]);
      setSelectedId(null);
      toast.success("Todas as conversas foram excluídas.");
    },
    onError: (err) => toast.error("Erro ao excluir todas: " + err.message),
  });

  const handleClearAll = () => {
    if (window.confirm("Excluir TODAS as conversas? Esta ação não pode ser desfeita.")) {
      clearMutation.mutate();
    }
  };

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
    <div className="flex h-screen bg-[#0a0a0f] text-foreground overflow-hidden relative">
      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity duration-300"
          onClick={(e) => {
            e.stopPropagation();
            setSidebarOpen(false);
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          ${sidebarOpen ? (isMobile ? "fixed inset-y-0 left-0 z-50 w-72" : "w-72") : (isMobile ? "fixed inset-y-0 left-0 z-50 w-0 -translate-x-full" : "w-0")} 
          shrink-0 border-r border-white/10 bg-[#0f0f16] flex flex-col transition-all duration-300 overflow-hidden
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-5 w-5 text-violet-400 shrink-0" />
            <span className="font-semibold truncate">DevAI Assistant</span>
          </div>
          {isMobile && (
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          )}
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

        {conversations.length > 0 && (
          <div className="px-3 pb-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={clearMutation.isPending}
              className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              {clearMutation.isPending ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400 mr-1" />
              ) : (
                <Trash2 className="h-3 w-3 mr-1" />
              )}
              Excluir todas
            </Button>
          </div>
        )}

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
                onClick={() => {
                  setSelectedId(c.id);
                  // Somente fechar se não estiver clicando no botão de menu de 3 pontos
                  // A propagação já está sendo parada no botão de menu, então isso deve funcionar
                  if (isMobile) setSidebarOpen(false);
                }}
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Mais ações para ${c.title}`}
                          title="Mais ações"
                          className={`h-7 w-7 shrink-0 text-zinc-400 hover:text-white transition-opacity ${isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        side="bottom"
                        className="w-44 bg-[#191923] border-white/10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem onClick={() => startRename(c)} className="cursor-pointer hover:bg-white/10">
                          <Pencil className="mr-2 h-4 w-4" />
                          Renomear
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(c.id)}
                          className="cursor-pointer text-red-400 focus:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir conversa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-white/10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full flex items-center gap-3 px-2 py-6 h-auto hover:bg-white/5 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
                  <span className="text-xs font-medium text-violet-300">
                    {user?.name?.charAt(0).toUpperCase() ?? "U"}
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium truncate">{user?.name || "-"}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {user?.email || "-"} {user?.role === "admin" && "(admin)"}
                  </p>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={10}
              className="w-64 bg-[#191923] border-white/10 p-1"
            >
              <DropdownMenuItem
                onClick={() => setLocation("/account")}
                className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-white/10"
              >
                <UserRoundCog className="h-4 w-4" />
                Conta
              </DropdownMenuItem>
              {user?.role === "admin" && (
                <DropdownMenuItem
                  onClick={() => setLocation("/admin")}
                  className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-white/10"
                >
                  <Settings className="h-4 w-4" />
                  Painel admin
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => logout()}
                className="flex items-center gap-2 px-2 py-2 cursor-pointer text-red-400 focus:text-red-400 hover:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 w-full relative">
        <header className="h-12 border-b border-white/10 flex items-center justify-between px-3 shrink-0 bg-[#0a0a0f]/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 lg:hidden"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSidebarOpen((v) => !v);
              }}
            >
              <Menu className="h-5 w-5" />
            </Button>
            {!isMobile && (
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
            )}
            <span className="text-sm font-medium truncate px-1">
              {conversations.find((c) => c.id === selectedId)?.title ?? "DevAI Assistant"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-zinc-300 shrink-0">
            <Coins className="h-3.5 w-3.5 text-amber-300" />
            <span>{formatCreditLabel(credits)}</span>
          </div>
        </header>
        <div className="flex-1 min-h-0 w-full">
          {selectedId ? (
            <ChatView conversationId={selectedId} />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500 p-4 text-center">
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
