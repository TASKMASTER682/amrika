import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/StringSession.js';

// Note: For production, store session string in DB/env securely
const apiId = Number(process.env.TELEGRAM_API_ID || '0');
const apiHash = process.env.TELEGRAM_API_HASH || '';

let clientInstance = null;

export async function getTelegramClient() {
  if (!apiId || !apiHash) {
    throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH env vars are required');
  }

  if (clientInstance) return clientInstance;

  const sessionStr = process.env.TELEGRAM_SESSION_STRING || '';
  const session = new StringSession(sessionStr);

  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
  });

  await client.connect();
  await client.start({
    botAuthToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
  });

  clientInstance = client;
  return client;
}

export async function sendTelegramMessage(toLinkOrHandle, messageText, imageBuffer = null) {
  if (!messageText && !imageBuffer) {
    throw new Error('Either message or image is required');
  }

  const client = await getTelegramClient();

  // Resolve username from link like https://t.me/username or @username
  let username = toLinkOrHandle || '';
  username = String(username).trim();

  if (username.startsWith('http://t.me/') || username.startsWith('https://t.me/')) {
    username = username.split('/').pop() || '';
  }
  if (username.startsWith('@')) {
    username = username.slice(1);
  }

  if (!username) {
    throw new Error(`Invalid telegram link/handle: ${toLinkOrHandle}`);
  }

  // Send to username (entity resolution handled by gramjs)
  const result = await client.sendMessage(username, {
    message: messageText || '',
    file: imageBuffer ? imageBuffer : undefined,
  });

  return result;
}
