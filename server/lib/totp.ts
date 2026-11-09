import { createGuardrails, generateSecret, generateURI, verifySync } from 'otplib';

// Otplib 12 generated 10-byte secrets; existing users must remain able to sign in.
// New secrets use otplib 13's 20-byte default, without widening the token time window.
const legacySecretGuardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });

export function generateTOTP(): string {
  return generateSecret();
}

export function generateTOTPQRCode(username: string, secret: string): string {
  return generateURI({ issuer: 'Blinko', label: username, secret });
}

export function verifyTOTP(token: string, secret: string): boolean {
  try {
    return verifySync({ token, secret, guardrails: legacySecretGuardrails }).valid;
  } catch {
    return false;
  }
}
