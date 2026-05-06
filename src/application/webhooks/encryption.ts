export interface WebhookSecretCryptoOptions {
  keyMaterial?: string;
}

const PREFIX = "whsec:v1";
const IV_BYTES = 12;

export async function encryptWebhookSecret(
  plaintext: string,
  options: WebhookSecretCryptoOptions = {},
): Promise<string> {
  const key = await importAesKey(resolveKeyMaterial(options));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  return [
    PREFIX,
    base64UrlEncode(iv),
    base64UrlEncode(new Uint8Array(ciphertext)),
  ].join(":");
}

export async function decryptWebhookSecret(
  encrypted: string,
  options: WebhookSecretCryptoOptions = {},
): Promise<string> {
  const [prefix, version, encodedIv, encodedCiphertext] = encrypted.split(":");
  if (`${prefix}:${version}` !== PREFIX || !encodedIv || !encodedCiphertext) {
    throw new Error("webhook secret decrypt failed");
  }

  try {
    const key = await importAesKey(resolveKeyMaterial(options));
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlDecode(encodedIv) },
      key,
      base64UrlDecode(encodedCiphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("webhook secret decrypt failed");
  }
}

function resolveKeyMaterial(options: WebhookSecretCryptoOptions): string {
  const material = options.keyMaterial ?? process.env["FULCRUM_WEBHOOK_SECRET_KEY"];
  if (!material || material.length < 16) {
    throw new Error("FULCRUM_WEBHOOK_SECRET_KEY must be at least 16 characters");
  }
  return material;
}

async function importAesKey(material: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlDecode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}
