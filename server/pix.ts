export function generatePixPayload(pkg: any) {
  const receiverName = process.env.PIX_RECEIVER_NAME || "Charles Henrique";
  const city = process.env.PIX_CITY || "Pirapora";
  const key = process.env.PIX_KEY || "charleshenriquegonsalves05@gmail.com";
  const amount = (pkg.amountCents / 100).toFixed(2);
  
  // Payload estático simplificado para o exemplo
  const payload = [
    "000201",
    "010212",
    `26${(36 + key.length).toString().padStart(2, '0')}0014br.gov.bcb.pix01${key.length.toString().padStart(2, '0')}${key}`,
    "52040000",
    "5303986",
    `54${amount.length.toString().padStart(2, '0')}${amount}`,
    "5802BR",
    `59${receiverName.length.toString().padStart(2, '0')}${receiverName}`,
    `60${city.length.toString().padStart(2, '0')}${city}`,
    "62070503***"
  ].join("");
  
  // Função simples para calcular CRC16 CCITT
  function crc16(str: string) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x8000) !== 0) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc <<= 1;
        }
      }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  }

  const payloadWithCrcPlaceholder = payload + "6304";
  return payloadWithCrcPlaceholder + crc16(payloadWithCrcPlaceholder);
}

export function buildStaticPixBrCode(pkg: any) {
  return generatePixPayload(pkg);
}
