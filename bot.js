import { Telegraf } from 'telegraf';
import { Octokit } from '@octokit/rest';
import https from 'https';
import dotenv from 'dotenv';

// Загружаем переменные из .env
dotenv.config();

// Читаем токены из .env
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;

const GITHUB_OWNER = 'seyran14';
const GITHUB_REPO  = 'oneforlalrofeno';
const IMAGES_PATH  = 'public/images';
const AUDIO_PATH   = 'public/audio';
const BRANCH       = 'main';
const SITE_URL     = 'https://seyran.cc';

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

function slugify(text) {
  return text.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function audioExtension(audio) {
  return (
    fileExtension(audio.file_name) ||
    MIME_TO_EXT[(audio.mime_type || '').toLowerCase()] ||
    'mp3'
  );
}

/** Скачиваем файл из Telegram и коммитим его в репозиторий сайта. */
async function upload(ctx, { fileId, path, filename, commitMessage, publicUrl, notionHint }) {
  await ctx.reply(`Uploading ${filename}...`);

  try {
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

    ctx.reply(`✅ Done!\n\n${publicUrl}\n\n${notionHint}`, {
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error(err);
    const message = /too big/i.test(err.message)
      ? 'file is larger than 20 MB — Telegram bots cannot download it'
      : err.message;
    ctx.reply(`❌ Error: ${message}`);
  }
}

bot.on('photo', async (ctx) => {
  const caption = ctx.message.caption?.trim();

  if (!caption) {
    return ctx.reply('Send a caption with the photo — it will be used as the filename.\nExample: caption = "concert-2024"');
  }

  const filename = slugify(caption) + '.jpg';

  await upload(ctx, {
    fileId: ctx.message.photo.at(-1).file_id,
    path: `${IMAGES_PATH}/${filename}`,
    filename,
    commitMessage: `add image: ${filename}`,
    publicUrl: `${SITE_URL}/images/${filename}`,
    notionHint: 'Paste it into the Photo URL column of the Memories database.',
  });
});

async function handleAudio(ctx, audio) {
  const caption = ctx.message.caption?.trim();

  if (!caption) {
    return ctx.reply('Send the track with a caption — it becomes the track title and the filename.\nExample: caption = "Night Drive"');
  }

  const ext = audioExtension(audio);
  const filename = slugify(caption) + '.' + ext;
  const warning = BROWSER_AUDIO_EXTS.includes(ext)
    ? ''
    : `\n\n⚠️ .${ext} may not play in browsers — mp3 is the safest format.`;

  await upload(ctx, {
    fileId: audio.file_id,
    path: `${AUDIO_PATH}/${filename}`,
    filename,
    commitMessage: `add audio: ${filename}`,
    publicUrl: `${SITE_URL}/audio/${filename}`,
    notionHint: `Notion row → Title: ${caption}\nAudio URL: the link above${warning}`,
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
    '📸 Send a photo with a caption → goes to /images/ (Memories).\n' +
    '🎵 Send a track with a caption → goes to /audio/ (Media).\n\n' +
    'The caption becomes the filename (and the track title).\n' +
    'Audio: mp3, m4a, wav, flac, ogg/opus. Telegram caps uploads at 20 MB.'
  );
});

bot.launch();
console.log('🤖 Bot is running');

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
