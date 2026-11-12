import jwt from 'jsonwebtoken';

// A JWT (JSON Web Token) is three base64 parts joined by dots:
//   header.payload.signature
// The payload says who the token is for and when it expires. Anyone can READ
// it (it's not encrypted, so never put secrets in it), but only someone with
// JWT_SECRET can make a valid signature. If the payload is changed, the
// signature no longer matches and verification fails.

// How long a token stays valid. After this the user logs in again.
export const TOKEN_LIFETIME_SECONDS = 60 * 60; // 1 hour

// HS256 = HMAC with SHA-256: one shared secret both signs and checks.
const ALGORITHM = 'HS256';

// Read the secret only when it's needed (not when this file loads), so
// tests can set it first and the server can check it at startup.
export function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET is missing or shorter than 32 characters. Set it in .env (see .env.example).',
    );
  }
  return secret;
}

// Make a token for this user. 'subject' (stored as "sub") is the standard
// JWT field for "who this token is about".
export function signToken(username: string): string {
  return jwt.sign({}, getSecret(), {
    subject: username,
    algorithm: ALGORITHM,
    expiresIn: TOKEN_LIFETIME_SECONDS,
  });
}

// Check a token and return the username inside it. Throws if the signature
// is wrong, the token has expired, or it isn't a JWT at all.
export function verifyToken(token: string): string {
  // algorithms: only accept the one we sign with, so a forged token can't
  // claim a different (e.g. "none") algorithm to skip the signature check.
  const payload = jwt.verify(token, getSecret(), { algorithms: [ALGORITHM] });
  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    throw new Error('Token has no subject');
  }
  return payload.sub;
}
