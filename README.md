# WorkVault 🏴

Командный мессенджер с каналами. Telegram Избранное — но для всей команды.

## Стек
- **Фронт:** Vue 3 + Vite + Pinia + Vue Router
- **Бэк:** Node.js + Express + Socket.IO
- **БД:** SQLite (better-sqlite3) — файл `data/workvault.db`
- **Desktop:** Electron

## Быстрый старт

### 1. Установка зависимостей
```bash
npm install
```

### 2. Запуск (бэкенд + фронт вместе)
```bash
npm run start
```

Или раздельно:
```bash
# Терминал 1 — бэкенд
npm run server

# Терминал 2 — фронт
npm run dev
```

### 3. Electron Desktop
```bash
npm run electron:dev
```

### 4. Сборка десктоп-приложения
```bash
npm run build
npm run electron
```

## Порты
- Фронт (Vite): http://localhost:5173
- Бэкенд API: http://localhost:3000

## Что умеет
- 📁 Папки с каналами (создаются автоматически при первом запуске)
- 💬 Реалтайм сообщения через WebSocket
- 🖼 Загрузка картинок на сервер (без base64!)
- 🔗 Автопревью ссылок
- 😊 Реакции на сообщения (10 эмодзи)
- ✅ Отметка «Занести в CRM»
- ✏️ Редактирование своих сообщений (с пометкой «ред.»)
- 🗑 Удаление своих сообщений
- 👀 Индикатор «печатает...»
- 🟢 Список онлайн пользователей
- 🔔 Desktop уведомления (Electron + Browser)
- 🌙 Тёмная / светлая тема

## Структура проекта
```
workvault/
├── electron/
│   ├── main.js          # Electron main process
│   └── preload.js       # Context bridge
├── server/
│   ├── server.js        # Express + Socket.IO
│   └── db.js            # SQLite схема и queries
├── src/
│   ├── assets/base.css  # Дизайн токены
│   ├── stores/app.js    # Pinia store (весь стейт + API)
│   ├── views/
│   │   ├── LoginView.vue
│   │   └── ChatView.vue
│   └── components/
│       ├── Sidebar.vue
│       ├── ChannelHeader.vue
│       ├── MessageList.vue
│       ├── MessageItem.vue
│       └── MessageInput.vue
├── data/                # Создаётся автоматически
│   ├── workvault.db     # SQLite база
│   └── uploads/         # Загруженные файлы
└── index.html
```

## Деплой на сервер (только бэкенд)
```bash
# На сервере
npm install --omit=dev
node server/server.js

# Или через PM2
pm2 start server/server.js --name workvault
```

Фронт собери и раздавай как статику:
```bash
npm run build
# dist/ → nginx или express static
```
