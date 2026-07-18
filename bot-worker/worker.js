// Telegram bot on Cloudflare Workers (webhook mode).
//
// Same behaviour as the old polling bot.js: user sends a photo with a caption,
// the caption becomes the filename, the image is committed to the site repo
// under public/images/ and the bot replies with the public URL.
//
// No npm dependencies — everything runs on the Workers fetch runtime, so cold
// starts are instant and there is no Node-compat surface to break.

const GITHUB_OWNER = 'seyran14';
const GITHUB_REPO = 'oneforlalrofeno';
const GITHUB_PATH = 'public/images';
const BRANCH = 'main';

export default {
  async fetch(request, env, ctx) {
    // Health check / anything that isn't a Telegram webhook POST.
    if (request.method !== 'POST') {
      return new Response('🤖 Bot worker is running', { status: 200 });
    }

    // Only Telegram (which knows the secret) may push updates here.
    if (env.WEBHOOK_SECRET) {
      const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (secret !== env.WEBHOOK_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    // Answer Telegram immediately; do the slow upload work in the background.
    ctx.waitUntil(handleUpdate(update, env));
    return new Response('OK', { status: 200 });
  },
};

async function handleUpdate(update, env) {
  const msg = update.message || update.channel_post;
  if (!msg) return;

  const chatId = msg.chat.id;
  const token = env.TELEGRAM_TOKEN;

  if (msg.photo) {
    const caption = (msg.caption || '').trim();
    if (!caption) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Send a caption with the photo — it will be used as the filename.\nExample: caption = "concert-2024"',
      });
      return;
    }

    const filename = caption.replace(/[^a-zA-Z0-9._-]/g, '-') + '.jpg';
    const filePath = `${GITHUB_PATH}/${filename}`;

    await tg(token, 'sendMessage', { chat_id: chatId, text: 'Uploading...' });

    try {
      const photo = msg.photo[msg.photo.length - 1];

      const fileInfo = await tg(token, 'getFile', { file_id: photo.file_id });
      const tgFilePath = fileInfo?.result?.file_path;
      if (!tgFilePath) throw new Error('Could not resolve Telegram file path');

      const fileUrl = `https://api.telegram.org/file/bot${token}/${tgFilePath}`;
      const imgResp = await fetch(fileUrl);
      if (!imgResp.ok) throw new Error(`Telegram file download ${imgResp.status}`);

      const base64 = arrayBufferToBase64(await imgResp.arrayBuffer());

      // Look up the existing file's sha (needed to overwrite it).
      let sha;
      const getResp = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${BRANCH}`,
        { headers: ghHeaders(env) }
      );
      if (getResp.ok) {
        sha = (await getResp.json()).sha;
      }

      const putResp = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
        {
          method: 'PUT',
          headers: ghHeaders(env),
          body: JSON.stringify({
            message: `add image: ${filename}`,
            content: base64,
            branch: BRANCH,
            ...(sha ? { sha } : {}),
          }),
        }
      );
      if (!putResp.ok) {
        throw new Error(`GitHub ${putResp.status}: ${await putResp.text()}`);
      }

      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: `✅ Done!\n\nPath for Notion:\nhttps://seyran.cc/images/${filename}`,
      });
    } catch (err) {
      await tg(token, 'sendMessage', { chat_id: chatId, text: `❌ Error: ${err.message}` });
    }
    return;
  }

  if (msg.text) {
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: '📸 Send a photo with a caption.\nThe caption becomes the filename — Latin letters, numbers, hyphens.',
    });
  }
}

async function tg(token, method, body) {
  const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp.json();
}

function ghHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'seyran-telegram-bot-worker',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
