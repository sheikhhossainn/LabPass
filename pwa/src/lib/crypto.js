/**
 * LabPass PWA — Payload Encryption (MVP)
 *
 * For MVP: base64 encodes the payload JSON.
 * TODO: Upgrade to Web Crypto API AES-GCM encryption for production.
 */

export function encryptPayload(data) {
  const json = JSON.stringify(data);
  return btoa(unescape(encodeURIComponent(json)));
}

export function decryptPayload(encoded) {
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Decode a Google ID token (JWT) to extract user info.
 * Only decodes the payload — does NOT verify the signature.
 * Verification should be done server-side.
 */
export function decodeIdToken(idToken) {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(decodeURIComponent(escape(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))));

    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      sub: payload.sub,
      emailVerified: payload.email_verified,
    };
  } catch {
    return null;
  }
}
