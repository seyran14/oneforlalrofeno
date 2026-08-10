import { Client } from '@notionhq/client';
import { imageSize } from './imageSize';
import { qualifyEmoji } from './emoji';

// Типы для контента
export interface NotionPost {
  id: string;
  title: string;
  date: string;
  isoDate: string;   // как есть из Notion — для RSS
  content: string;
  published: boolean;
}

export interface NotionThought {
  id: string;
  title: string;
  date: string;
  content: string;
  published: boolean;
}

export interface NotionPhoto {
  url: string;
  width?: number;
  height?: number;
}

export interface NotionMemory {
  id: string;
  title: string;
  date: string;
  photos: NotionPhoto[];
  published: boolean;
}

export interface NotionTrack {
  id: string;
  title: string;
  audioUrl: string;
  order: number;
  published: boolean;
}

// Инициализация Notion клиента
const notion = new Client({
  auth: import.meta.env.NOTION_TOKEN,
});

const postsDbId = import.meta.env.NOTION_POSTS_DB;
const thoughtsDbId = import.meta.env.NOTION_THOUGHTS_DB;
// База Memories — раньше называлась Media, старое имя переменной всё ещё работает
const memoriesDbId = import.meta.env.NOTION_MEMORIES_DB || import.meta.env.NOTION_MEDIA_DB;
const musicDbId = import.meta.env.NOTION_MUSIC_DB;

/**
 * Якорь поста: отдельных страниц у постов нет, поэтому RSS ссылается на
 * /posts/#<слаг>, а сам пост несёт этот id.
 */
export function postSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'post';
}

/**
 * Получить все опубликованные посты из Notion
 */
export async function getPostsFromNotion(): Promise<NotionPost[]> {
  try {
    const response = await notion.databases.query({
      database_id: postsDbId,
      filter: {
        property: 'Published',
        checkbox: {
          equals: true,
        },
      },
      sorts: [
        {
          property: 'Date',
          direction: 'descending',
        },
      ],
    });

    const posts = response.results.map((page: any) => {
      const properties = page.properties;
      return {
        id: page.id,
        title: qualifyEmoji(properties.Title?.title?.[0]?.plain_text || 'Untitled'),
        date: properties.Date?.date?.start ? formatDate(properties.Date.date.start) : 'No date',
        isoDate: properties.Date?.date?.start || '',
        content: properties.Content?.rich_text?.[0]?.plain_text || '',
        published: properties.Published?.checkbox || false,
      };
    });

    return posts;
  } catch (error) {
    console.error('Error fetching posts from Notion:', error);
    return [];
  }
}

/**
 * Получить все опубликованные мысли из Notion
 */
export async function getThoughtsFromNotion(): Promise<NotionThought[]> {
  try {
    const response = await notion.databases.query({
      database_id: thoughtsDbId,
      filter: {
        property: 'Published',
        checkbox: {
          equals: true,
        },
      },
      sorts: [
        {
          property: 'Date',
          direction: 'descending',
        },
      ],
    });

    const thoughts = response.results.map((page: any) => {
      const properties = page.properties;
      return {
        id: page.id,
        title: qualifyEmoji(properties.Title?.title?.[0]?.plain_text || 'Untitled'),
        date: properties.Date?.date?.start ? formatDate(properties.Date.date.start) : 'No date',
        content: properties.Content?.rich_text?.[0]?.plain_text || '',
        published: properties.Published?.checkbox || false,
      };
    });

    return thoughts;
  } catch (error) {
    console.error('Error fetching thoughts from Notion:', error);
    return [];
  }
}

/**
 * Получить все опубликованные воспоминания (фото) из Notion
 */
export async function getMemoriesFromNotion(): Promise<NotionMemory[]> {
  try {
    const response = await notion.databases.query({
      database_id: memoriesDbId,
      filter: {
        property: 'Published',
        checkbox: {
          equals: true,
        },
      },
      sorts: [
        {
          property: 'Number',
          direction: 'ascending',
        },
      ],
    });

    const memories = response.results.map((page: any) => {
      const properties = page.properties;
      
      // Парсим Photo URL - может быть как одна ссылка (тип URL), так и несколько (тип Text)
      let photoUrls: string[] = [];
      
      // Если это поле типа URL (старый формат)
      if (properties['Photo URL']?.url) {
        photoUrls = [properties['Photo URL'].url];
      }
      // Если это поле типа Text с несколькими ссылками через запятую
      else if (properties['Photo URL']?.rich_text) {
        // Собираем весь текст из всех rich_text блоков (включая форматированный)
        const urlText = properties['Photo URL'].rich_text
          .map((block: any) => block.plain_text)
          .join('');
  
        photoUrls = urlText
          .split(',')
          .map((url: string) => url.trim())
          .filter((url: string) => url.length > 0);
      }
      
      return {
        id: page.id,
        title: qualifyEmoji(properties.Title?.title?.[0]?.plain_text || 'Untitled'),
        date: properties.Date?.date?.start ? formatDate(properties.Date.date.start) : 'No date',
        photos: photoUrls.map(withSize),
        published: properties.Published?.checkbox || false,
      };
    });

    return memories;
  } catch (error) {
    console.error('Error fetching memories from Notion:', error);
    return [];
  }
}

/**
 * Получить все опубликованные треки из Notion
 *
 * Свойства базы: Title (title), Audio URL (url или text), Published (checkbox),
 * Number (number, опционально — задаёт порядок).
 */
export async function getTracksFromNotion(): Promise<NotionTrack[]> {
  if (!musicDbId) {
    console.warn('NOTION_MUSIC_DB is not set — music page will be empty');
    return [];
  }

  try {
    const response = await notion.databases.query({
      database_id: musicDbId,
      filter: {
        property: 'Published',
        checkbox: {
          equals: true,
        },
      },
    });

    const tracks = response.results.map((page: any, index: number) => {
      const properties = page.properties;

      // Audio URL — поле типа URL или обычный текст
      const audioUrl = (
        properties['Audio URL']?.url ||
        properties['Audio URL']?.rich_text?.map((block: any) => block.plain_text).join('') ||
        ''
      ).trim();

      return {
        id: page.id,
        title: qualifyEmoji(properties.Title?.title?.[0]?.plain_text || 'Untitled'),
        audioUrl,
        order: typeof properties.Number?.number === 'number' ? properties.Number.number : index,
        published: properties.Published?.checkbox || false,
      };
    });

    // Сортируем на нашей стороне, чтобы не требовать наличия поля Number в базе
    return tracks
      .filter((track) => track.audioUrl.length > 0)
      .sort((a, b) => a.order - b.order);
  } catch (error) {
    console.error('Error fetching tracks from Notion:', error);
    return [];
  }
}

/**
 * Дополнить ссылку размерами файла из public/images — с ними браузер занимает
 * место под фотографию заранее и страница не прыгает по мере загрузки.
 * Для картинок с других доменов размеры остаются неизвестными.
 */
function withSize(url: string): NotionPhoto {
  const match = /\/images\/([^/?#]+)$/.exec(url);
  if (!match) return { url };

  const size = imageSize(`public/images/${decodeURIComponent(match[1])}`);
  return size ? { url, width: size.width, height: size.height } : { url };
}

/**
 * Форматировать дату в читаемый формат
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  
  return `${month} ${day}, ${year}`;
}
