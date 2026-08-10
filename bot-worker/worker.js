// Telegram bot on Cloudflare Workers (webhook mode).
//
// Send the bot a photo or an audio track with a caption. The caption becomes
// the filename and the title; photos are committed to the site repo under
// public/images/, audio goes to the R2 bucket, and a published row is created
// in the matching Notion database. Sending the same caption again overwrites
// the file and updates the existing row instead of adding a duplicate.
//
// No npm dependencies — everything runs on the Workers fetch runtime, so cold
// starts are instant and there is no Node-compat surface to break.

const GITHUB_OWNER = 'seyran14';
const GITHUB_REPO = 'oneforlalrofeno';
const IMAGES_PATH = 'public/images';
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
    const url = new URL(request.url);

    // Big mixes go straight to R2: too large for the Bot API (20 MB) and for
    // Cloudflare Pages (25 MiB per file), and they have no business sitting
    // in the git history either.
    if (url.pathname === '/upload') {
      return handleUpload(request, env, url);
    }
    if (url.pathname.startsWith('/f/')) {
      return serveFromR2(request, env, decodeURIComponent(url.pathname.slice(3)));
    }

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

    const filename = slugify(caption, `photo-${Date.now()}`) + '.jpg';
    await publish(env, chatId, {
      fileId: msg.photo[msg.photo.length - 1].file_id,
      path: `${IMAGES_PATH}/${filename}`,
      filename,
      commitMessage: `add image: ${filename}`,
      publicUrl: `${SITE_URL}/images/${encodeURIComponent(filename)}`,
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
    const filename = slugify(caption, audio.file_name) + '.' + ext;

    await publish(env, chatId, {
      fileId: audio.file_id,
      storage: 'r2',
      objectKey: filename,
      contentType: audio.mime_type,
      filename,
      publicUrl: `${mediaBaseUrl(env)}/${encodeURIComponent(filename)}`,
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
    const bigFiles =
      env.UPLOAD_SECRET && env.WORKER_URL
        ? `\n\n📦 Over 20 MB (long mixes) → upload page, the file goes to R2:\n${env.WORKER_URL}/upload?key=${env.UPLOAD_SECRET}`
        : '';

    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text:
        '📸 Send a photo with a caption → /images/ + a row in Memories.\n' +
        '🎵 Send a track with a caption → R2 + a row in Music.\n\n' +
        'The caption becomes the title and the filename, and the row is\n' +
        'published right away. Sending the same caption again replaces the\n' +
        'file and updates the row.\n\n' +
        'Audio: mp3, m4a, wav, flac, ogg/opus. Telegram caps uploads at 20 MB.' +
        bigFiles,
      disable_web_page_preview: true,
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

/**
 * Filename from a caption. Emoji, Cyrillic and the rest of Unicode survive —
 * a title of "⚡️" should stay "⚡️" in the URL too, percent-encoded on the
 * wire. Only what genuinely breaks paths and URLs is replaced: separators,
 * control characters and the reserved punctuation. A caption made entirely
 * of those falls back to the uploaded file's own name.
 */
function slugify(text, fallback = '') {
  const clean = (s) =>
    s
      .normalize('NFC')
      .replace(/[\u0000-\u001f\u007f]+/g, '')
      .replace(/[/\\?#%:*"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 80);

  return (
    clean(text) ||
    clean(fallback.replace(/\.[^.]*$/, '')) ||
    `file-${Date.now()}`
  );
}

/** GitHub wants the path percent-encoded, but the slashes left alone. */
function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Store the file, then publish it in Notion.
 *
 * Photos go to the repo, audio to R2 — a track has no business in git, and
 * Pages refuses to serve anything over 25 MiB anyway. The file is stored
 * first: a Notion row is only worth having once the URL it points at
 * actually exists.
 */
async function publish(env, chatId, opts) {
  const token = env.TELEGRAM_TOKEN;
  await tg(token, 'sendMessage', { chat_id: chatId, text: `Uploading ${opts.filename}...` });

  try {
    if (opts.storage === 'r2') {
      await storeTelegramFileInR2(env, opts);
    } else {
      await commitTelegramFile(env, opts);
    }
  } catch (err) {
    let text = `❌ Error: ${err.message}`;
    // A file that is too big is not a dead end — the upload page bypasses Telegram.
    if (/larger than 20 MB/.test(err.message) && env.UPLOAD_SECRET && env.WORKER_URL) {
      text += `\n\nUpload it here instead:\n${env.WORKER_URL}/upload?key=${env.UPLOAD_SECRET}`;
    }
    await tg(token, 'sendMessage', { chat_id: chatId, text, disable_web_page_preview: true });
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

  // Коммит запускает сборку сам; для R2 её надо позвать отдельно
  const rebuildLine = opts.storage === 'r2' ? await triggerRebuild(env) : '';

  await tg(token, 'sendMessage', {
    chat_id: chatId,
    text: `✅ ${opts.publicUrl}\n\n${notionLine}${rebuildLine}${opts.note}`,
    disable_web_page_preview: true,
  });
}

/** Ask Telegram where the file lives and start downloading it. */
async function fetchTelegramFile(env, fileId) {
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

  const resp = await fetch(`https://api.telegram.org/file/bot${token}/${tgFilePath}`);
  if (!resp.ok) throw new Error(`Telegram file download ${resp.status}`);
  return resp;
}

/** Tracks live in R2 next to the long mixes, never in the repo. */
async function storeTelegramFileInR2(env, { fileId, objectKey, contentType }) {
  const resp = await fetchTelegramFile(env, fileId);
  await env.MEDIA.put(objectKey, resp.body, {
    httpMetadata: { contentType: contentType || 'application/octet-stream' },
  });
}

/** Photos are committed to the repo, which is also what triggers a build. */
async function commitTelegramFile(env, { fileId, path, commitMessage }) {
  const fileResp = await fetchTelegramFile(env, fileId);
  const base64 = arrayBufferToBase64(await fileResp.arrayBuffer());

  // Look up the existing file's sha (needed to overwrite it).
  let sha;
  const getResp = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodePath(path)}?ref=${BRANCH}`,
    { headers: ghHeaders(env) }
  );
  if (getResp.ok) {
    sha = (await getResp.json()).sha;
  }

  const putResp = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodePath(path)}`,
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

/**
 * Upload endpoint for files the bot cannot handle: an hour-long mix is past
 * the Bot API's 20 MB download ceiling, so the browser sends it here instead.
 *
 * GET  /upload?key=… → the form
 * PUT  /upload?key=…&title=…&filename=… → raw file body, streamed into R2
 */
async function handleUpload(request, env, url) {
  if (!env.UPLOAD_SECRET) {
    return new Response('Uploads are not configured (UPLOAD_SECRET is missing)', { status: 503 });
  }
  if (url.searchParams.get('key') !== env.UPLOAD_SECRET) {
    return new Response('Forbidden', { status: 403 });
  }
  if (!env.MEDIA) {
    return new Response('Uploads are not configured (no R2 bucket bound)', { status: 503 });
  }

  if (request.method === 'GET') {
    return new Response(uploadPage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (request.method !== 'PUT') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const title = (url.searchParams.get('title') || '').trim();
  const filename = url.searchParams.get('filename') || '';
  if (!title) {
    return json({ error: 'Title is empty' }, 400);
  }
  if (!request.body) {
    return json({ error: 'Empty file' }, 400);
  }

  const ext = fileExtension(filename) || 'mp3';
  const objectKey = slugify(title, filename) + '.' + ext;

  try {
    // Streamed, never buffered: these files run to tens of megabytes. R2 only
    // commits the object once the whole stream arrives, so an upload that is
    // cancelled halfway leaves whatever was there before untouched.
    await env.MEDIA.put(objectKey, request.body, {
      httpMetadata: {
        contentType: request.headers.get('content-type') || 'application/octet-stream',
      },
    });
  } catch (err) {
    return json({ error: `R2: ${err.message}` }, 500);
  }

  const publicUrl = `${mediaBaseUrl(env, url)}/${encodeURIComponent(objectKey)}`;

  let notionLine = 'Add the Notion row by hand (NOTION_TOKEN is not set).';
  if (env.NOTION_TOKEN && env.NOTION_MUSIC_DB) {
    try {
      const action = await upsertNotionRow(env, {
        databaseId: env.NOTION_MUSIC_DB,
        urlProperty: { name: 'Audio URL', type: 'url' },
        title,
        publicUrl,
      });
      notionLine = action === 'updated'
        ? `Notion: row "${title}" updated`
        : `Notion: row "${title}" created, Published ✓`;
    } catch (err) {
      notionLine = `Uploaded, but Notion failed: ${err.message}`;
    }
  }

  return json({ url: publicUrl, notion: notionLine + (await triggerRebuild(env)) });
}

/**
 * Файлы из R2 не проходят через git, а сайт статический и читает Notion
 * только при сборке — значит, её надо запустить самим. Для файлов, которые
 * коммитятся в репозиторий, этого не нужно: сборку запускает сам коммит.
 */
async function triggerRebuild(env) {
  if (!env.PAGES_DEPLOY_HOOK) {
    return '\nPress "Retry deployment" in Cloudflare Pages to see it on the site.';
  }

  try {
    const resp = await fetch(env.PAGES_DEPLOY_HOOK, { method: 'POST' });
    return resp.ok ? '\nSite is rebuilding — live in a minute.' : `\nRebuild hook answered ${resp.status}.`;
  } catch (err) {
    return `\nRebuild hook failed: ${err.message}`;
  }
}

/** Serve from R2 with Range support — long audio cannot be seeked without it. */
async function serveFromR2(request, env, key) {
  if (!env.MEDIA) return new Response('R2 is not configured', { status: 503 });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const object = await env.MEDIA.get(key, { range: request.headers });
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=86400');
  headers.set('access-control-allow-origin', '*');

  let status = 200;
  if (object.range && 'offset' in object.range) {
    const start = object.range.offset;
    const end = start + object.range.length - 1;
    headers.set('content-range', `bytes ${start}-${end}/${object.size}`);
    status = 206;
  }

  return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
}

function mediaBaseUrl(env, url) {
  if (env.MEDIA_BASE_URL) return env.MEDIA_BASE_URL.replace(/\/$/, '');
  return url ? `${url.origin}/f` : `${env.WORKER_URL}/f`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function uploadPage() {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Upload a track</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#000; color:#fff; font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; padding:24px }
  .card { width:100%; max-width:420px }
  h1 { font-size:28px; margin:0 0 24px }
  label { display:block; font-size:13px; color:#a1a1aa; margin:0 0 6px }
  input[type=text], input[type=file] { width:100%; box-sizing:border-box; background:#09090b; color:#fff;
         border:1px solid #3f3f46; border-radius:8px; padding:12px; font-size:16px; margin-bottom:18px }
  button { width:100%; padding:14px; border:0; border-radius:8px; background:#fff; color:#000;
         font-size:16px; font-weight:600; cursor:pointer }
  button.ghost { background:transparent; color:#fff; border:1px solid #3f3f46; margin-top:10px }
  button:disabled { background:#3f3f46; color:#a1a1aa; cursor:default }
  .bar { height:4px; background:#27272a; border-radius:2px; overflow:hidden; margin-top:18px; display:none }
  .bar div { height:100%; width:0; background:#fff; transition:width .2s }
  .msg { margin-top:18px; font-size:14px; color:#a1a1aa; word-break:break-all }
  #done { margin-top:24px }
  .hidden { display:none }
  a { color:#fff }
</style></head><body>
<div class="card">
  <h1 id="head">New track</h1>

  <div id="form">
    <label for="title">Title</label>
    <input id="title" type="text" placeholder="e.g. Sunday Mix" autocomplete="off">
    <label for="file">File</label>
    <input id="file" type="file" accept="audio/*">
    <button id="go">Upload</button>
    <div class="bar"><div id="fill"></div></div>
  </div>

  <div class="msg" id="msg"></div>

  <div id="done" class="hidden">
    <button id="close">Close</button>
    <button id="again" class="ghost">Upload another</button>
  </div>
</div>
<script>
  const $ = (id) => document.getElementById(id);

  // The upload is long and the button is easy to hit twice, so the form is
  // removed on success and a second press cannot re-send anything.
  function finish(html) {
    $('form').classList.add('hidden');
    $('done').classList.remove('hidden');
    $('head').textContent = 'Uploaded';
    $('msg').innerHTML = html;
  }

  $('close').onclick = () => {
    window.close();
    // A tab the script did not open cannot be closed by it, so blank the page.
    document.body.innerHTML =
      '<div class="card"><h1>Done</h1><div class="msg">You can close this tab.</div></div>';
  };

  $('again').onclick = () => {
    $('form').classList.remove('hidden');
    $('done').classList.add('hidden');
    $('head').textContent = 'New track';
    $('msg').textContent = '';
    $('go').disabled = false;
    $('title').value = '';
    $('file').value = '';
    $('fill').style.width = '0';
    document.querySelector('.bar').style.display = 'none';
  };

  $('go').onclick = () => {
    const title = $('title').value.trim();
    const file = $('file').files[0];
    if (!title || !file) { $('msg').textContent = 'Fill in the title and pick a file.'; return; }

    const url = '/upload' + location.search
      + '&title=' + encodeURIComponent(title)
      + '&filename=' + encodeURIComponent(file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    $('go').disabled = true;
    document.querySelector('.bar').style.display = 'block';
    $('msg').textContent = 'Uploading…';

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) $('fill').style.width = Math.round(e.loaded / e.total * 100) + '%';
    };
    xhr.onload = () => {
      let r;
      try { r = JSON.parse(xhr.responseText); }
      catch { $('go').disabled = false; $('msg').textContent = 'Server answered ' + xhr.status; return; }

      if (r.error) { $('go').disabled = false; $('msg').textContent = '❌ ' + r.error; return; }
      finish('✅ ' + r.notion + '<br><a href="' + r.url + '">' + r.url + '</a>');
    };
    xhr.onerror = () => { $('go').disabled = false; $('msg').textContent = 'Connection dropped — try again.'; };
    xhr.send(file);
  };
</script>
</body></html>`;
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
