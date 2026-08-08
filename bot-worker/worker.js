// Telegram bot on Cloudflare Workers (webhook mode).
//
// Send the bot a photo or an audio track with a caption: the caption becomes
// the filename, the file is committed to the site repo (public/images/ for
// photos, public/audio/ for tracks) and the bot replies with the public URL to
// paste into Notion.
//
// No npm dependencies — everything runs on the Workers fetch runtime, so cold
// starts are instant and there is no Node-compat surface to break.

const GITHUB_OWNER = 'seyran14';
const GITHUB_REPO = 'oneforlalrofeno';
const IMAGES_PATH = 'public/images';
const AUDIO_PATH = 'public/audio';
const BRANCH = 'main';
const SITE_URL = 'https://seyran.cc';

// Форматы, которые точно играют в браузере
const BROWSER_AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'weba', 'flac'];

const MIME_TO_EXT = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/webm': 'weba',
};

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
  const caption = (msg.caption || '').trim();

  const audio = pickAudio(msg);

  if (msg.photo) {
    if (!caption) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Send a caption with the photo — it will be used as the filename.\nExample: caption = "concert-2024"',
      });
      return;
    }

    const filename = slugify(caption) + '.jpg';
    await upload(env, chatId, {
      fileId: msg.photo[msg.photo.length - 1].file_id,
      path: `${IMAGES_PATH}/${filename}`,
      filename,
      commitMessage: `add image: ${filename}`,
      publicUrl: `${SITE_URL}/images/${filename}`,
      notionHint: 'Paste it into the Photo URL column of the Memories database.',
    });
    return;
  }

  if (audio) {
    if (!caption) {
      await tg(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Send the track with a caption — it becomes the track title and the filename.\nExample: caption = "Night Drive"',
      });
      return;
    }

    const ext = audioExtension(audio);
    const filename = slugify(caption) + '.' + ext;
    const warning = BROWSER_AUDIO_EXTS.includes(ext)
      ? ''
      : `\n\n⚠️ .${ext} may not play in browsers — mp3 is the safest format.`;

    await upload(env, chatId, {
      fileId: audio.file_id,
      path: `${AUDIO_PATH}/${filename}`,
      filename,
      commitMessage: `add audio: ${filename}`,
      publicUrl: `${SITE_URL}/audio/${filename}`,
      notionHint: `Notion row → Title: ${caption}\nAudio URL: the link above${warning}`,
    });
    return;
  }

  if (msg.text) {
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text:
        '📸 Send a photo with a caption → goes to /images/ (Memories).\n' +
        '🎵 Send a track with a caption → goes to /audio/ (Media).\n\n' +
        'The caption becomes the filename (and the track title).\n' +
        'Audio: mp3, m4a, wav, flac, ogg/opus. Telegram caps uploads at 20 MB.',
    });
  }
}

/** Any audio-ish attachment: music file, voice message, or an audio document. */
function pickAudio(msg) {
  if (msg.audio) return msg.audio;
  if (msg.voice) return msg.voice;

  const doc = msg.document;
  if (doc) {
    const mime = (doc.mime_type || '').toLowerCase();
    const ext = fileExtension(doc.file_name);
    if (mime.startsWith('audio/') || (ext && BROWSER_AUDIO_EXTS.includes(ext))) {
      return doc;
    }
  }

  return null;
}

function audioExtension(audio) {
  return (
    fileExtension(audio.file_name) ||
    MIME_TO_EXT[(audio.mime_type || '').toLowerCase()] ||
    'mp3'
  );
}

function fileExtension(name) {
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(name || '');
  return match ? match[1].toLowerCase() : '';
}

function slugify(text) {
  return text.replace(/[^a-zA-Z0-9._-]/g, '-');
}

/** Download the file from Telegram and commit it to the repo. */
async function upload(env, chatId, { fileId, path, filename, commitMessage, publicUrl, notionHint }) {
  const token = env.TELEGRAM_TOKEN;
  await tg(token, 'sendMessage', { chat_id: chatId, text: `Uploading ${filename}...` });

  try {
    const fileInfo = await tg(token, 'getFile', { file_id: fileId });
    const tgFilePath = fileInfo?.result?.file_path;
    if (!tgFilePath) {
      const reason = fileInfo?.description || 'could not resolve Telegram file path';
      throw new Error(
        /too big/i.test(reason)
          ? 'file is larger than 20 MB — Telegram bots cannot download it'
          : reason
      );
    }

    const fileUrl = `https://api.telegram.org/file/bot${token}/${tgFilePath}`;
    const fileResp = await fetch(fileUrl);
    if (!fileResp.ok) throw new Error(`Telegram file download ${fileResp.status}`);

    const base64 = arrayBufferToBase64(await fileResp.arrayBuffer());

    // Look up the existing file's sha (needed to overwrite it).
    let sha;
    const getResp = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${BRANCH}`,
      { headers: ghHeaders(env) }
    );
    if (getResp.ok) {
      sha = (await getResp.json()).sha;
    }

    const putResp = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
      {
        method: 'PUT',
        headers: ghHeaders(env),
        body: JSON.stringify({
          message: commitMessage,
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
      text: `✅ Done!\n\n${publicUrl}\n\n${notionHint}`,
      disable_web_page_preview: true,
    });
  } catch (err) {
    await tg(token, 'sendMessage', { chat_id: chatId, text: `❌ Error: ${err.message}` });
  }
}

async function tg(token, method, body) {
  const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!data.ok) {
    console.error(`Telegram ${method} failed: ${resp.status} ${JSON.stringify(data)}`);
  }
  return data;
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
