# Smart AI Bot

A robust, multi-worker Cloudflare project structured to provide an intelligent Telegram Bot with fallback AI integrations, background OTP handling, and a full-fledged Admin Panel.

This project is divided into three distinct Cloudflare Workers:
1. **bot-worker:** An intelligent Telegram bot handling user interactions, OTP checks, AI integrations (with cascade fallbacks), and webhook processing to DB.
2. **db-worker:** A centralized API and D1 Database worker that manages state, user subscriptions, and application data.
3. **admin-worker:** A web-based Admin interface built with Astro, allowing easy management of users, subscriptions, and AI providers.

---

## 🏗 Project Architecture

```
smartbot/
│
├── bot-worker/          # Telegram Bot Worker (Webhook + Queue consumer)
├── db-worker/           # Centralized Database Worker (Cloudflare D1)
└── admin-worker/        # Admin Panel Worker (Astro + SSR)
```

## 🚀 Setup & Installation

To run this project or deploy to your own Cloudflare account, follow the instructions below.

### 1. Prerequisites
- **Node.js** (v18+)
- **Wrangler CLI** installed globally (`npm install -g wrangler`)
- A **Cloudflare** Account
- A **Telegram Bot Token** (from BotFather)

### 2. Configure DB Worker
The `db-worker` holds the core Cloudflare D1 Database.

1. Navigate to `db-worker/`:
   ```bash
   cd db-worker
   npm install
   ```
2. Create a D1 Database in Cloudflare:
   ```bash
   wrangler d1 create your-db-name
   ```
3. Update `db-worker/wrangler.toml` with the `database_name` and `database_id` returned from the command above. Update the `account_id` as well.
4. Execute the Schema:
   ```bash
   npm run d1:migrate:db
   ```
5. Deploy the `db-worker`:
   ```bash
   wrangler deploy
   ```

### 3. Configure Bot Worker
The bot processes AI commands and Telegram webhooks.

1. Navigate to `bot-worker/`:
   ```bash
   cd ../bot-worker
   npm install
   ```
2. Update `bot-worker/wrangler.toml`. Set your `account_id` and point the `LOCAL_DB_URL` string to your deployed `db-worker` URL.
3. Apply secrets (Required):
   ```bash
   wrangler secret put TELEGRAM_BOT_TOKEN
   wrangler secret put DB_SECRET_TOKEN
   ```
4. Deploy the bot:
   ```bash
   wrangler deploy
   ```

### 4. Configure Admin Worker
The Admin interface is constructed using Astro.

1. Navigate to `admin-worker/`:
   ```bash
   cd ../admin-worker
   npm install
   ```
2. Update `admin-worker/wrangler.toml` and `.env` with your Cloudflare `account_id` and the generic secrets/URLs for your deployed `db-worker`.
3. Set your production Admin password:
   ```bash
   wrangler secret put ADMIN_PASSWORD
   ```
4. Run locally:
   ```bash
   npm run dev
   ```
5. Deploy Admin dashboard:
   ```bash
   npm run deploy
   ```

---

## 🔒 Security Measures (Important)
- This boilerplate is sanitized. Please **do not commit** actual `.env` files or hardcode API keys. 
- Ensure `HOUSEHOLD_AUTH_SECRET` and `DB_SECRET_TOKEN` are uniquely generated random strings in your setup.
- Always use `wrangler secret put` for production variables.

## 📩 Custom Solutions & Contact

Looking to build or integrate a custom AI bot solution for your own business or specific use case? I can help you design, develop, and deploy intelligent automation systems tailored to your needs.

Feel free to reach out for collaborations or inquiries:
- **Email:** [hasansarker58@gmail.com](mailto:hasansarker58@gmail.com)

## 📄 License
This project is open-source and free to adapt.
