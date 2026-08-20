export type PixConfig = {
  key: string;
  receiverName: string;
  city: string;
  ownerEmail: string;
  supportWhatsAppNumber: string;
};

export type PixPackage = {
  id: "basico" | "intermediario" | "avancado";
  label: string;
  amountCents: number;
  credits: number;
};

export const PIX_PACKAGES: readonly PixPackage[] = [
  { id: "basico", label: "Pacote básico", amountCents: 1000, credits: 25 },
  { id: "intermediario", label: "Pacote intermediário", amountCents: 2000, credits: 60 },
  { id: "avancado", label: "Pacote avançado", amountCents: 5000, credits: 180 },
] as const;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return value;
}

export function getPixConfig(): PixConfig {
  return {
    key: requiredEnv("PIX_KEY"),
    receiverName: requiredEnv("PIX_RECEIVER_NAME"),
    city: requiredEnv("PIX_CITY"),
    ownerEmail: requiredEnv("OWNER_NOTIFICATION_EMAIL"),
    supportWhatsAppNumber: requiredEnv("SUPPORT_WHATSAPP_NUMBER"),
  };
}

export function getPixPackage(packageId: string): PixPackage | null {
  return PIX_PACKAGES.find((item) => item.id === packageId) ?? null;
}
