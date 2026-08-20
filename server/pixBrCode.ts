import { getPixConfig, type PixPackage } from "./pixConfig";

const ALPHANUMERIC_PIX = /[^A-Z0-9 $%*+\-./:]/g;

function tlv(id: string, value: string): string {
  if (!/^\d{2}$/.test(id)) throw new Error("Identificador TLV inválido.");
  if (value.length < 1 || value.length > 99) throw new Error("Campo Pix fora do tamanho permitido.");
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function normalizePixText(value: string, maxLength: number, fallback: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(ALPHANUMERIC_PIX, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return normalized || fallback;
}

function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildStaticPixBrCode(pkg: PixPackage): string {
  const config = getPixConfig();
  const key = normalizePixText(config.key, 77, "CHAVEPIX");
  const receiverName = normalizePixText(config.receiverName, 25, "RECEBEDOR");
  const city = normalizePixText(config.city, 15, "CIDADE");
  const amount = (pkg.amountCents / 100).toFixed(2);
  const merchantAccount = tlv("00", "BR.GOV.BCB.PIX") + tlv("01", key);
  const additionalData = tlv("05", "***");
  const payload = [
    tlv("00", "01"),
    tlv("01", "11"),
    tlv("26", merchantAccount),
    tlv("52", "0000"),
    tlv("53", "986"),
    tlv("54", amount),
    tlv("58", "BR"),
    tlv("59", receiverName),
    tlv("60", city),
    tlv("62", additionalData),
    "6304",
  ].join("");

  return `${payload}${crc16Ccitt(payload)}`;
}

export const internalPixCrc16 = crc16Ccitt;
