# Seyran Website

Личный сайт построен на **Astro + React + Framer Motion + Tailwind CSS**.

## 🚀 Быстрый старт

### 1. Установи зависимости
```bash
npm install
```

### 2. Запусти локально
```bash
npm run dev
```

Сайт откроется на `http://localhost:4321`

---

## 📝 Как добавить новый пост

Открой файл `src/pages/index.astro` и добавь новый блок `<Post>`:

```astro
<Post 
  client:load
  title="Название твоего поста"
  date="19 февраля 2026"
>
  <p>Текст поста...</p>
  <p>Можно несколько параграфов.</p>
</Post>
```

Сохрани файл — изменения появятся автоматически в браузере.

---

## 🎨 Структура проекта

```
seyran-website/
├── src/
│   ├── components/       # React компоненты с анимациями
│   │   ├── Header.tsx    # Шапка сайта
│   │   └── Post.tsx      # Компонент поста
│   ├── layouts/          
│   │   └── BaseLayout.astro  # Базовый HTML шаблон
│   ├── pages/
│   │   └── index.astro   # Главная страница (тут добавляешь посты)
│   └── styles/
│       └── global.css    # Глобальные стили
├── package.json
└── README.md
```

---

## 🎬 Про анимации (Framer Motion)

Все анимации настроены в компонентах `Header.tsx` и `Post.tsx`.

### Текущие анимации:
- **Header** — появляется сверху при загрузке
- **Посты** — появляются при прокрутке (fade in + slide up)
- **Разделители** — анимация линии после каждого поста

### Как добавить свои анимации:

Открой `src/components/Post.tsx` и меняй параметры:

```tsx
<motion.article
  initial={{ opacity: 0, y: 20 }}      // Начальное состояние
  whileInView={{ opacity: 1, y: 0 }}   // Конечное состояние
  transition={{ duration: 0.6 }}        // Скорость анимации
>
```

**Полезные параметры:**
- `y: 50` — сдвиг вниз
- `x: -100` — сдвиг влево
- `scale: 0.8` — масштаб
- `rotate: 45` — поворот
- `delay: 0.5` — задержка

Документация Framer Motion: https://www.framer.com/motion/

---

## 🌐 Деплой на Cloudflare Pages

### Вариант 1: Через GitHub (рекомендую)

1. **Создай репозиторий на GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/ТВОЙ_USERNAME/seyran-website.git
   git push -u origin main
   ```

2. **Подключи Cloudflare Pages:**
   - Иди на https://dash.cloudflare.com
   - **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
   - Выбери репозиторий `seyran-website`
   
3. **Настройки билда:**
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`

4. **Добавь домен:**
   - В настройках проекта → **Custom domains** → **Set up a custom domain**
   - Введи `seyran.cc`
   - DNS настроится автоматически

Готово! Теперь при каждом `git push` сайт будет обновляться автоматически.

---

### Вариант 2: Прямой деплой через Wrangler

```bash
npm install -g wrangler
npx wrangler pages deploy dist
```

---

## 🛠 Команды

| Команда | Действие |
|---------|----------|
| `npm install` | Установить зависимости |
| `npm run dev` | Запустить локально на `localhost:4321` |
| `npm run build` | Собрать продакшен версию в `dist/` |
| `npm run preview` | Предпросмотр продакшен билда |

---

## 📚 Что дальше

### Следующие шаги:
1. ✅ Запусти сайт локально
2. ✅ Добавь несколько своих постов
3. ✅ Залей на GitHub
4. ✅ Подключи Cloudflare Pages
5. ⬜ Настрой свои анимации
6. ⬜ Добавь картинки в посты
7. ⬜ Поменяй шрифты и цвета под себя

### Идеи для развития:
- Добавить тёмную/светлую тему
- Создать галерею фото
- Добавить фильтры по тегам
- Сделать search по постам
- Добавить RSS ленту
- Интеграция с CMS (например Contentful)

---

## 💡 Полезные ссылки

- [Astro Docs](https://docs.astro.build)
- [Framer Motion Docs](https://www.framer.com/motion/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages)

---

**Удачи с сайтом! 🚀**
