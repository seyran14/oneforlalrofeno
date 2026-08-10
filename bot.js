import { Telegraf } from 'telegraf';
import { Octokit } from '@octokit/rest';
import https from 'https';
import dotenv from 'dotenv';

// Загружаем переменные из .env
dotenv.config();

// Читаем токены из .env
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const NOTION_TOKEN   = process.env.NOTION_TOKEN;

const GITHUB_OWNER = 'seyran14';
const GITHUB_REPO  = 'oneforlalrofeno';
const IMAGES_PATH  = 'public/images';
const AUDIO_PATH   = 'public/audio';
const BRANCH       = 'main';
const SITE_URL     = 'https://seyran.cc';

const NOTION_VERSION = '2022-06-28';

// Идентификаторы баз — не секреты, поэтому лежат прямо здесь
const MEMORIES_DB = process.env.NOTION_MEMORIES_DB || process.env.NOTION_MEDIA_DB || '31e7fe3896928037bdf5d82c7de3db2a';
const MUSIC_DB    = process.env.NOTION_MUSIC_DB || '3b67fe38969280248e66c6a5a27cce64';

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

const bot    = new Telegraf(TELEGRAM_TOKEN);
const octokit = new Octokit({ auth: GITHUB_TOKEN });

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function fileExtension(name) {
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(name || '');
  return match ? match[1].toLowerCase() : '';
}

/**
 * Имя файла из подписи. Серии неподходящих символов схлопываются в один дефис,
 * края обрезаются. Подпись из одних эмодзи или кириллицы слугифицируется в
 * пустоту — такие раньше сходились в общий «-.jpg» и затирали друг друга,
 * поэтому для них берётся имя исходного файла.
 */
function slugify(text, fallback = '') {
  const clean = (s) => s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '');

  return (
    clean(text) ||
    clean(fallback.replace(/\.[^.]*$/, '')) ||
    `file-${Date.now()}`
  );
}

function audioExtension(audio) {
  return (
    fileExtension(audio.file_name) ||
    MIME_TO_EXT[(audio.mime_type || '').toLowerCase()] ||
    'mp3'
  );
}

async function notion(path, method, body) {
  const resp = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.message || `Notion ${resp.status}`);
  return data;
}

/** Обе страницы сортируются по Number по возрастанию — новое уходит в конец. */
async function nextNumber(databaseId) {
  const top = await notion(`databases/${databaseId}/query`, 'POST', {
    sorts: [{ property: 'Number', direction: 'descending' }],
    page_size: 1,
  });
  return (top.results[0]?.properties?.Number?.number || 0) + 1;
}

/** Создать строку в Notion или обновить ту, у которой такой же Title. */
async function upsertNotionRow({ databaseId, urlProperty, title, publicUrl }) {
  const properties = {
    Title: { title: [{ text: { content: title } }] },
    Published: { checkbox: true },
    Date: { date: { start: new Date().toISOString().slice(0, 10) } },
    [urlProperty.name]:
      urlProperty.type === 'url'
        ? { url: publicUrl }
        : { rich_text: [{ text: { content: publicUrl } }] },
  };

  const existing = await notion(`databases/${databaseId}/query`, 'POST', {
    filter: { property: 'Title', title: { equals: title } },
    page_size: 1,
  });

  if (existing.results.length > 0) {
    await notion(`pages/${existing.results[0].id}`, 'PATCH', { properties });
    return 'updated';
  }

  properties.Number = { number: await nextNumber(databaseId) };
  await notion('pages', 'POST', { parent: { database_id: databaseId }, properties });
  return 'created';
}

/** Скачиваем файл из Telegram и коммитим его в репозиторий сайта. */
async function commitTelegramFile(ctx, { fileId, path, commitMessage }) {
  const fileRef = await ctx.telegram.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileRef.file_path}`;

  const buffer = await fetchBuffer(fileUrl);
  const base64 = buffer.toString('base64');

  let sha;
  try {
    const { data } = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo:  GITHUB_REPO,
      path,
      ref:   BRANCH,
    });
    sha = data.sha;
  } catch {
    // file does not exist yet — sha stays undefined
  }

  await octokit.repos.createOrUpdateFileContents({
    owner:   GITHUB_OWNER,
    repo:    GITHUB_REPO,
    path,
    message: commitMessage,
    content: base64,
    branch:  BRANCH,
    ...(sha ? { sha } : {}),
  });
}

/**
 * Коммитим файл, затем публикуем его в Notion.
 *
 * Файл идёт первым: строка в Notion нужна только тогда, когда ссылка из неё
 * уже работает. Коммит запускает сборку сайта, которая читает Notion минутой
 * позже, так что строка всегда успевает появиться.
 */
async function publish(ctx, opts) {
  await ctx.reply(`Uploading ${opts.filename}...`);

  try {
    await commitTelegramFile(ctx, opts);
  } catch (err) {
    console.error(err);
    const message = /too big/i.test(err.message)
      ? 'file is larger than 20 MB — Telegram bots cannot download it'
      : err.message;
    return ctx.reply(`❌ Error: ${message}`);
  }

  let notionLine;
  if (!NOTION_TOKEN) {
    notionLine = 'Add the row in Notion by hand (NOTION_TOKEN is not set).';
  } else {
    try {
      const action = await upsertNotionRow(opts);
      notionLine =
        action === 'updated'
          ? `📝 Notion: row "${opts.title}" updated`
          : `📝 Notion: row "${opts.title}" created, Published ✓`;
    } catch (err) {
      console.error(err);
      notionLine = `⚠️ Uploaded, but Notion failed: ${err.message}\nAdd the row by hand.`;
    }
  }

  return ctx.reply(`✅ ${opts.publicUrl}\n\n${notionLine}${opts.note}`, {
    disable_web_page_preview: true,
  });
}

bot.on('photo', async (ctx) => {
  const caption = ctx.message.caption?.trim();

  if (!caption) {
    return ctx.reply('Send a caption with the photo — it becomes the title and the filename.\nExample: caption = "concert-2024"');
  }

  const filename = slugify(caption, `photo-${Date.now()}`) + '.jpg';

  await publish(ctx, {
    fileId: ctx.message.photo.at(-1).file_id,
    path: `${IMAGES_PATH}/${filename}`,
    filename,
    commitMessage: `add image: ${filename}`,
    publicUrl: `${SITE_URL}/images/${filename}`,
    title: caption,
    databaseId: MEMORIES_DB,
    urlProperty: { name: 'Photo URL', type: 'rich_text' },
    note: '',
  });
});

async function handleAudio(ctx, audio) {
  const caption = ctx.message.caption?.trim();

  if (!caption) {
    return ctx.reply('Send the track with a caption — it becomes the track title and the filename.\nExample: caption = "Night Drive"');
  }

  const ext = audioExtension(audio);
  const filename = slugify(caption, audio.file_name) + '.' + ext;

  await publish(ctx, {
    fileId: audio.file_id,
    path: `${AUDIO_PATH}/${filename}`,
    filename,
    commitMessage: `add audio: ${filename}`,
    publicUrl: `${SITE_URL}/audio/${filename}`,
    title: caption,
    databaseId: MUSIC_DB,
    urlProperty: { name: 'Audio URL', type: 'url' },
    note: BROWSER_AUDIO_EXTS.includes(ext)
      ? ''
      : `\n\n⚠️ .${ext} may not play in browsers — mp3 is the safest format.`,
  });
}

bot.on('audio', (ctx) => handleAudio(ctx, ctx.message.audio));
bot.on('voice', (ctx) => handleAudio(ctx, ctx.message.voice));

bot.on('document', (ctx) => {
  const doc = ctx.message.document;
  const mime = (doc.mime_type || '').toLowerCase();
  const ext  = fileExtension(doc.file_name);

  if (mime.startsWith('audio/') || (ext && BROWSER_AUDIO_EXTS.includes(ext))) {
    return handleAudio(ctx, doc);
  }

  ctx.reply('That file is neither a photo nor an audio track.');
});

bot.on('text', (ctx) => {
  ctx.reply(
    '📸 Send a photo with a caption → /images/ + a row in Memories.\n' +
    '🎵 Send a track with a caption → /audio/ + a row in Music.\n\n' +
    'The caption becomes the title and the filename, and the row is\n' +
    'published right away. Sending the same caption again replaces the\n' +
    'file and updates the row.\n\n' +
    'Audio: mp3, m4a, wav, flac, ogg/opus. Telegram caps uploads at 20 MB.'
  );
});

bot.launch();
console.log('🤖 Bot is running');

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
