DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    telegram_username TEXT,
    telegram_name TEXT,
    email TEXT,
    user_type TEXT CHECK(user_type IN ('client', 'supplier')) NOT NULL DEFAULT 'client',
    chat_mode TEXT CHECK(chat_mode IN ('ai', 'human')) DEFAULT 'ai',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_price REAL NOT NULL,
    description TEXT,
    is_renewable INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_products_name ON products(name);

CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    product_id INTEGER REFERENCES products(id),
    account_username TEXT NOT NULL,
    account_password TEXT NOT NULL,
    status TEXT CHECK(status IN ('active', 'inactive', 'suspended')) DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    product_id INTEGER REFERENCES products(id),
    account_id INTEGER REFERENCES accounts(id),
    account_username TEXT, -- Made nullable for legacy/fallback
    account_password TEXT, -- Made nullable
    profile_name TEXT,
    profile_pin TEXT,
    purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    expiry_date DATETIME,
    purchase_amount REAL NOT NULL,
    status TEXT CHECK(status IN ('active', 'inactive', 'paused')) NOT NULL DEFAULT 'active',
    extra_metadata TEXT -- To store JSON
);

-- Keep track of stateful conversations
CREATE TABLE chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_chat_history_chat_id ON chat_history (chat_id);

CREATE TABLE ai_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_name TEXT NOT NULL,
    model_id TEXT NOT NULL,
    api_url TEXT,
    api_key TEXT,
    is_cloudflare INTEGER DEFAULT 0,
    priority INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tracks which reminder notifications have already been sent.
-- Prevents duplicate reminders for the same subscription + type.
-- reminder_type examples: '7_days', '1_day'
CREATE TABLE reminder_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
    reminder_type TEXT NOT NULL,              -- e.g. '7_days' or '1_day'
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(subscription_id, reminder_type)    -- guarantee: one reminder per type per sub
);
CREATE INDEX idx_reminder_log_subscription ON reminder_log(subscription_id);
