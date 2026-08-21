export function generatePixPayload(pkg: any) {
  const receiverName = process.env.PIX_RECEIVER_NAME || "Charles Henrique";
  const city = process.env.PIX_CITY || "Pirapora";
  const key = process.env.PIX_KEY || "charleshenriquegonsalves05@gmail.com";
  const amount = (pkg.amountCents / 100).toFixed(2);
  
  // Payload estático simplificado para o exemplo
  return `00020101021226580014br.gov.bcb.pix0136${key}520400005303986540${amount.length.toString().padStart(2, '0')}${amount}5802BR59${receiverName.length.toString().padStart(2, '0')}${receiverName}60${city.length.toString().padStart(2, '0')}${city}62070503***6304`;
}

export function buildStaticPixBrCode(pkg: any) {
  return generatePixPayload(pkg);
}
