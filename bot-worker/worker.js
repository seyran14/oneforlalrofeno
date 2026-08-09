// Telegram bot on Cloudflare Workers (webhook mode).
//
// Send the bot a photo or an audio track with a caption. The caption becomes
// the filename and the title; the file is committed to the site repo (photos
// to public/images/, tracks to public/audio/) and a published row is created
// in the matching Notion database. Sending the same caption again overwrites
// the file and updates the existing row instead of adding a duplicate.
//
// No npm dependencies — everything runs on the Workers fetch runtime, so cold
// starts are instant and there is no Node-compat surface to break.

const GITHUB_OWNER = 'seyran14';
const GITHUB_REPO = 'oneforlalrofeno';
const IMAGES_PATH = 'public/images';
const AUDIO_PATH = 'public/audio';
const BRANCH = 'main';
const SITE_URL = 'https://seyran.cc';

const NOTION_VERSION = '2022-06-28';

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
        text: 'Send a caption with the photo — it becomes the title and the filename.\nExample: caption = "concert-2024"',
      });
      return;
    }

    const filename = slugify(caption) + '.jpg';
    await publish(env, chatId, {
      fileId: msg.photo[msg.photo.length - 1].file_id,
      path: `${IMAGES_PATH}/${filename}`,
      filename,
      commitMessage: `add image: ${filename}`,
      publicUrl: `${SITE_URL}/images/${filename}`,
      title: caption,
      databaseId: env.NOTION_MEMORIES_DB,
      urlProperty: { name: 'Photo URL', type: 'rich_text' },
      note: '',
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

    await publish(env, chatId, {
      fileId: audio.file_id,
      path: `${AUDIO_PATH}/${filename}`,
      filename,
      commitMessage: `add audio: ${filename}`,
      publicUrl: `${SITE_URL}/audio/${filename}`,
      title: caption,
      databaseId: env.NOTION_MUSIC_DB,
      urlProperty: { name: 'Audio URL', type: 'url' },
      note: BROWSER_AUDIO_EXTS.includes(ext)
        ? ''
        : `\n\n⚠️ .${ext} may not play in browsers — mp3 is the safest format.`,
    });
    return;
  }

  if (msg.text) {
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text:
        '📸 Send a photo with a caption → /images/ + a row in Memories.\n' +
        '🎵 Send a track with a caption → /audio/ + a row in Music.\n\n' +
        'The caption becomes the title and the filename, and the row is\n' +
        'published right away. Sending the same caption again replaces the\n' +
        'file and updates the row.\n\n' +
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

/**
 * Commit the file to the repo, then publish it in Notion.
 *
 * The file goes first: a Notion row is only worth having once the URL it
 * points at actually exists. The commit starts the Pages build, which reads
 * Notion a minute later, so the row is always in place before it is queried.
 */
async function publish(env, chatId, opts) {
  const token = env.TELEGRAM_TOKEN;
  await tg(token, 'sendMessage', { chat_id: chatId, text: `Uploading ${opts.filename}...` });

  try {
    await commitTelegramFile(env, opts);
  } catch (err) {
    await tg(token, 'sendMessage', { chat_id: chatId, text: `❌ Error: ${err.message}` });
    return;
  }

  let notionLine;
  if (!env.NOTION_TOKEN || !opts.databaseId) {
    notionLine = 'Add the row in Notion by hand (NOTION_TOKEN is not set).';
  } else {
    try {
      const action = await upsertNotionRow(env, opts);
      notionLine =
        action === 'updated'
          ? `📝 Notion: row "${opts.title}" updated`
          : `📝 Notion: row "${opts.title}" created, Published ✓`;
    } catch (err) {
      notionLine = `⚠️ Uploaded, but Notion failed: ${err.message}\nAdd the row by hand.`;
    }
  }

  await tg(token, 'sendMessage', {
    chat_id: chatId,
    text: `✅ ${opts.publicUrl}\n\n${notionLine}${opts.note}`,
    disable_web_page_preview: true,
  });
}

/** Download the file from Telegram and commit it to the repo. */
async function commitTelegramFile(env, { fileId, path, commitMessage }) {
  const token = env.TELEGRAM_TOKEN;

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
}

/** Create the Notion row, or update the one that already has this title. */
async function upsertNotionRow(env, { databaseId, urlProperty, title, publicUrl }) {
  const properties = {
    Title: { title: [{ text: { content: title } }] },
    Published: { checkbox: true },
    Date: { date: { start: new Date().toISOString().slice(0, 10) } },
    [urlProperty.name]:
      urlProperty.type === 'url'
        ? { url: publicUrl }
        : { rich_text: [{ text: { content: publicUrl } }] },
  };

  const existing = await notion(env, `databases/${databaseId}/query`, 'POST', {
    filter: { property: 'Title', title: { equals: title } },
    page_size: 1,
  });

  if (existing.results.length > 0) {
    await notion(env, `pages/${existing.results[0].id}`, 'PATCH', { properties });
    return 'updated';
  }

  properties.Number = { number: await nextNumber(env, databaseId) };
  await notion(env, 'pages', 'POST', {
    parent: { database_id: databaseId },
    properties,
  });
  return 'created';
}

/** Both pages sort by Number ascending, so new entries go to the end. */
async function nextNumber(env, databaseId) {
  const top = await notion(env, `databases/${databaseId}/query`, 'POST', {
    sorts: [{ property: 'Number', direction: 'descending' }],
    page_size: 1,
  });
  return (top.results[0]?.properties?.Number?.number || 0) + 1;
}

async function notion(env, path, method, body) {
  const resp = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.message || `Notion ${resp.status}`);
  }
  return data;
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
