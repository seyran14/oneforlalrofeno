import { Client } from '@notionhq/client';

// Типы для постов
export interface NotionPost {
  id: string;
  title: string;
  date: string;
  content: string;
  published: boolean;
}

// Инициализация Notion клиента
const notion = new Client({
  auth: import.meta.env.NOTION_TOKEN,
});

const databaseId = import.meta.env.NOTION_DATABASE_ID;

/**
 * Получить все опубликованные посты из Notion
 */
export async function getPostsFromNotion(): Promise<NotionPost[]> {
  try {
    const response = await notion.databases.query({
      database_id: databaseId,
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

      // Извлекаем Title
      const title = properties.Title?.title?.[0]?.plain_text || 'Без названия';

      // Извлекаем Date
      const dateValue = properties.Date?.date?.start;
      const date = dateValue ? formatDate(dateValue) : 'Дата не указана';

      // Извлекаем Content
      const content = properties.Content?.rich_text?.[0]?.plain_text || '';

      // Извлекаем Published
      const published = properties.Published?.checkbox || false;

      return {
        id: page.id,
        title,
        date,
        content,
        published,
      };
    });

    return posts;
  } catch (error) {
    console.error('Ошибка при получении постов из Notion:', error);
    return [];
  }
}

/**
 * Форматировать дату в читаемый формат
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const months = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
  ];
  
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  
  return `${day} ${month} ${year}`;
}
