import { Client } from '@notionhq/client';

// Типы для контента
export interface NotionPost {
  id: string;
  title: string;
  date: string;
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

export interface NotionMedia {
  id: string;
  title: string;
  date: string;
  photoUrl: string;
  audioName: string;
  published: boolean;
}

// Инициализация Notion клиента
const notion = new Client({
  auth: import.meta.env.NOTION_TOKEN,
});

const postsDbId = import.meta.env.NOTION_POSTS_DB;
const thoughtsDbId = import.meta.env.NOTION_THOUGHTS_DB;
const mediaDbId = import.meta.env.NOTION_MEDIA_DB;

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
          property: 'date',
          direction: 'descending',
        },
      ],
    });

    const posts = response.results.map((page: any) => {
      const properties = page.properties;
      return {
        id: page.id,
        title: properties.Title?.title?.[0]?.plain_text || 'Untitled',
        date: properties.Date?.date?.start ? formatDate(properties.Date.date.start) : 'No date',
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
        title: properties.Title?.title?.[0]?.plain_text || 'Untitled',
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
 * Получить все опубликованные медиа из Notion
 */
export async function getMediaFromNotion(): Promise<NotionMedia[]> {
  try {
    const response = await notion.databases.query({
      database_id: mediaDbId,
      filter: {
        property: 'Published',
        checkbox: {
          equals: true,
        },
      },
      sorts: [
        {
          timestamp: 'created_time',
          direction: 'descending',
        },
      ],
    });

    const media = response.results.map((page: any) => {
      const properties = page.properties;
      return {
        id: page.id,
        title: properties.Title?.title?.[0]?.plain_text || 'Untitled',
        date: properties.Date?.date?.start ? formatDate(properties.Date.date.start) : 'No date',
        photoUrl: properties['Photo URL']?.url || '',
        audioName: properties['Audio Name']?.rich_text?.[0]?.plain_text || '',
        published: properties.Published?.checkbox || false,
      };
    });

    return media;
  } catch (error) {
    console.error('Error fetching media from Notion:', error);
    return [];
  }
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
