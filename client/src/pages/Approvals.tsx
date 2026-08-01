import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Shield,
  Zap,
  AlertTriangle,
  ChevronRight,
  FileCode,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Proposal = {
  id: string;
  title: string;
  description: string;
  filesToChange: Array<{
    path: string;
    summary: string;
  }>;
  risks: string[];
  benefits: string[];
  estimatedTime: string;
  status: "pending" | "approved" | "rejected" | "in-progress" | "completed" | "failed";
};

function ProposalCard({ proposal, userRole, userEmail }: { proposal: Proposal; userRole?: string; userEmail?: string | null }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const approveMutation = trpc.selfImprove.approve.useMutation({
    onSuccess: (data) => {
      toast.success("Proposta aprovada! A IA está implementando a melhoria...");
      queryClient.invalidateQueries({ queryKey: ["selfImprove", "list"] });
      setApproving(false);
    },
    onError: (err) => {
      toast.error(`Erro: ${err.message}`);
      setApproving(false);
    },
  });

  const rejectMutation = trpc.selfImprove.reject.useMutation({
    onSuccess: () => {
      toast.success("Proposta rejeitada.");
      queryClient.invalidateQueries({ queryKey: ["selfImprove", "list"] });
      setRejecting(false);
    },
    onError: (err) => {
      toast.error(`Erro: ${err.message}`);
      setRejecting(false);
    },
  });

  const handleApprove = () => {
    setApproving(true);
    approveMutation.mutate({ proposalId: proposal.id, approvalKey: userRole === "admin" || userEmail === "charleshenriquegonsalves05@gmail.com" ? "" : undefined });
  };

  const handleReject = () => {
    setRejecting(true);
    rejectMutation.mutate({ proposalId: proposal.id });
  };

  const statusConfig = {
    pending: { color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", icon: Clock, label: "Pendente" },
    approved: { color: "bg-green-500/10 text-green-500 border-green-500/20", icon: CheckCircle, label: "Aprovada" },
    rejected: { color: "bg-red-500/10 text-red-500 border-red-500/20", icon: XCircle, label: "Rejeitada" },
    "in-progress": { color: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: Loader2, label: "Em Progresso" },
    completed: { color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", icon: Sparkles, label: "Concluída" },
    failed: { color: "bg-orange-500/10 text-orange-500 border-orange-500/20", icon: AlertTriangle, label: "Falhou" },
  };

  const status = statusConfig[proposal.status];
  const StatusIcon = status.icon;

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary shrink-0" />
            <CardTitle className="text-sm font-semibold">{proposal.title}</CardTitle>
          </div>
          <Badge variant="outline" className={cn("text-xs shrink-0", status.color)}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {status.label}
          </Badge>
        </div>
        <CardDescription className="text-xs mt-1">{proposal.description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {expanded && (
            <>
              {/* Arquivos a serem alterados */}
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Arquivos a alterar:</p>
                {proposal.filesToChange.map((file, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-muted/30 rounded px-2 py-1.5">
                    <FileCode className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-[10px] text-primary">{file.path}</span>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{file.summary}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Benefícios */}
              {proposal.benefits.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-green-500 uppercase tracking-wider mb-1">Benefícios:</p>
                  <ul className="space-y-0.5">
                    {proposal.benefits.map((b, i) => (
                      <li key={i} className="text-xs text-green-600 flex items-start gap-1">
                        <CheckCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Riscos */}
              {proposal.risks.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-amber-500 uppercase tracking-wider mb-1">Riscos:</p>
                  <ul className="space-y-0.5">
                    {proposal.risks.map((r, i) => (
                      <li key={i} className="text-xs text-amber-600 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground">
                Tempo estimado: <span className="font-medium">{proposal.estimatedTime}</span>
              </p>
            </>
          )}
        </div>

        {proposal.status === "pending" && (
          <div className="flex gap-2 mt-3 pt-3 border-t">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              className="flex-1 text-xs"
            >
              {expanded ? "Recolher" : "Ver detalhes"}
              <ChevronRight className={cn("h-3 w-3 ml-1 transition-transform", expanded && "rotate-90")} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
              onClick={handleReject}
              disabled={rejecting}
            >
              {rejecting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
              Rejeitar
            </Button>
            <Button
              size="sm"
              className="text-xs bg-green-600 hover:bg-green-700 text-white"
              onClick={handleApprove}
              disabled={approving}
            >
              {approving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
              Aprovar
            </Button>
          </div>
        )}

        {proposal.status !== "pending" && (
          <div className="flex gap-2 mt-3 pt-3 border-t">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              className="flex-1 text-xs"
            >
              {expanded ? "Recolher" : "Ver detalhes"}
              <ChevronRight className={cn("h-3 w-3 ml-1 transition-transform", expanded && "rotate-90")} />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovalsContent() {
  const { user } = useAuth();

  // Se não for admin ou o dono (Charles), não deve ver esta página
  const isAdmin = user?.role === "admin" || user?.email === "charleshenriquegonsalves05@gmail.com";
  if (!user || !isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-3">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-semibold">Acesso Restrito</h2>
          <p className="text-sm text-muted-foreground">
            Esta área é exclusiva para o administrador do sistema.
          </p>
        </div>
      </div>
    );
  }

  const proposalsQuery = trpc.selfImprove.list.useQuery(undefined, {
    refetchInterval: 10000, // Atualiza a cada 10 segundos
  });

  const pendingProposals = proposalsQuery.data?.filter(p => p.status === "pending") || [];
  const otherProposals = proposalsQuery.data?.filter(p => p.status !== "pending") || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Canal de Aprovação</h1>
            <p className="text-xs text-muted-foreground">
              Aprovações exclusivas do administrador
            </p>
          </div>
        </div>
        {pendingProposals.length > 0 && (
          <Badge variant="destructive" className="animate-pulse">
            {pendingProposals.length} pendente{pendingProposals.length > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Propostas Pendentes */}
          {pendingProposals.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                <h2 className="text-sm font-semibold text-yellow-500 uppercase tracking-wider">
                  Aguardando Aprovação
                </h2>
              </div>
              {pendingProposals.map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} userRole={user?.role} userEmail={user?.email} />
              ))}
            </div>
          )}

          {/* Histórico */}
          {otherProposals.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Histórico
                </h2>
              </div>
              {otherProposals.map((proposal) => (
                <ProposalCard key={proposal.id} proposal={proposal} userRole={user?.role} userEmail={user?.email} />
              ))}
            </div>
          )}

          {/* Estado vazio */}
          {proposalsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : proposalsQuery.data?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Shield className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                Nenhuma proposta de melhoria
              </h3>
              <p className="text-xs text-muted-foreground/60">
                As sugestões de auto-melhoria da IA aparecerão aqui
              </p>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function Approvals() {
  return (
    <DashboardLayout>
      <ApprovalsContent />
    </DashboardLayout>
  );
}
