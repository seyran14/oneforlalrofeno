import { Telegraf } from 'telegraf';
import { Octokit } from '@octokit/rest';
import https from 'https';
import dotenv from 'dotenv';

// Загружаем переменные из .env
dotenv.config();

// Читаем токены из .env
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;

const GITHUB_OWNER = 'seyran14';
const GITHUB_REPO  = 'oneforlalrofeno';
const GITHUB_PATH  = 'public/images';
const BRANCH       = 'main';

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

bot.on('photo', async (ctx) => {
  const caption = ctx.message.caption?.trim();

  if (!caption) {
    return ctx.reply('Send a caption with the photo — it will be used as the filename.\nExample: caption = "concert-2024"');
  }

  const filename = caption.replace(/[^a-zA-Z0-9._-]/g, '-') + '.jpg';
  const filePath = `${GITHUB_PATH}/${filename}`;

  await ctx.reply('Uploading...');

  try {
    const photo   = ctx.message.photo.at(-1);
    const fileRef = await ctx.telegram.getFile(photo.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileRef.file_path}`;

    const imageBuffer = await fetchBuffer(fileUrl);
    const base64      = imageBuffer.toString('base64');

    let sha;
    try {
      const { data } = await octokit.repos.getContent({
        owner: GITHUB_OWNER,
        repo:  GITHUB_REPO,
        path:  filePath,
        ref:   BRANCH,
      });
      sha = data.sha;
    } catch {
      // file does not exist yet — sha stays undefined
    }

    await octokit.repos.createOrUpdateFileContents({
      owner:   GITHUB_OWNER,
      repo:    GITHUB_REPO,
      path:    filePath,
      message: `add image: ${filename}`,
      content: base64,
      branch:  BRANCH,
      ...(sha ? { sha } : {}),
    });

    ctx.reply(`✅ Done!\n\nPath for Notion:\nhttps://seyran.cc/images/${filename}`);
  } catch (err) {
    console.error(err);
    ctx.reply(`❌ Error: ${err.message}`);
  }
});

bot.on('text', (ctx) => {
  ctx.reply('📸 Send a photo with a caption.\nThe caption becomes the filename — Latin letters, numbers, hyphens.');
});

bot.launch();
console.log('🤖 Bot is running');

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
