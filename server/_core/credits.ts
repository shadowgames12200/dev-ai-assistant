import * as db from "../db";

export const TRIAL_AMOUNT = 50;
export const AGENT_COST_PER_MESSAGE = 5;
let _costPerMessage = 1;

export async function getBalance(userId: number): Promise<number> {
  return await db.getUserCredits(userId);
}

export async function adjust(userId: number, amount: number): Promise<boolean> {
  if (amount < 0) {
    return await db.consumeCredits(userId, Math.abs(amount));
  } else {
    await db.addCredits(userId, amount);
    return true;
  }
}

export async function applyRechargeCredit(userId: number, amount: number, rechargeId: number) {
  if (!Number.isInteger(amount) || amount <= 0 || !rechargeId) {
    throw new Error("Recarga inválida para aplicação de créditos.");
  }
  await db.addCredits(userId, amount);
  const balance = await db.getUserCredits(userId);
  return { applied: true, balance };
}

export async function grantTrial(userId: number): Promise<boolean> {
  const current = await db.getUserCredits(userId);
  if (current > 0) return true;
  await db.addCredits(userId, TRIAL_AMOUNT);
  return true;
}

export async function addCredits(email: string, amount: number): Promise<boolean> {
  const user = await db.getUserByEmail(email);
  if (!user) return false;
  await db.addCredits(user.id, amount);
  return true;
}

export async function listUsers(): Promise<any[]> {
  const users = await db.getAllUsers();
  const result = [];
  for (const user of users) {
    const balance = await db.getUserCredits(user.id);
    result.push({
      ...user,
      balance,
      trial_granted: balance >= TRIAL_AMOUNT ? 1 : 0
    });
  }
  return result;
}

export function getCostPerMessage(): number {
  return _costPerMessage;
}

export function setCostPerMessage(value: number): void {
  _costPerMessage = Math.max(0, Math.min(100, Math.floor(value)));
}
