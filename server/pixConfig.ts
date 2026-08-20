export type PixConfig = {
  key: string;
  receiverName: string;
  city: string;
  ownerEmail: string;
  supportWhatsAppNumber: string;
};

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
