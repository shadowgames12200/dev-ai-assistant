export type CreditSnapshot =
  | {
      balance?: number;
      unlimited?: boolean;
    }
  | null
  | undefined;

export function hasAvailableCredits(credits: CreditSnapshot): boolean {
  return credits?.unlimited === true || Number(credits?.balance ?? 0) > 0;
}

export function formatCreditLabel(credits: CreditSnapshot): string {
  if (credits?.unlimited) return "Créditos ilimitados";

  const balance = Math.max(0, Number(credits?.balance ?? 0));
  return `${balance} crédito${balance === 1 ? "" : "s"}`;
}

export function buildCreditBlockedMessage(balance?: number, requiredCredits?: number): string {
  const current = Math.max(0, Number(balance ?? 0));
  const required = Math.max(1, Number(requiredCredits ?? 1));

  if (current === 0) {
    return "Você está sem créditos. Entre em contato com o administrador para recarregar e continuar usando o chat.";
  }

  return `Você tem ${current} crédito${current === 1 ? "" : "s"}, mas esta tarefa precisa de ${required} créditos. Envie uma mensagem comum ou peça ao administrador uma recarga.`;
}

export function getChatCreditUiState(credits: CreditSnapshot) {
  const blocked = !hasAvailableCredits(credits);
  return {
    blocked,
    notice: blocked ? buildCreditBlockedMessage(credits?.balance, 1) : null,
  };
}

export function parseCreditAdjustment(input: string, sign: 1 | -1): number | null {
  const amount = Number(input);
  if (!Number.isInteger(amount) || amount <= 0) return null;
  return amount * sign;
}
