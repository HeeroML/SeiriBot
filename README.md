# Seiri Bot

Seiri Bot is a Telegram bot that handles **chat join requests** by DMing users a captcha. The bot approves the join request only after the captcha is solved.

## Features
- Handles `chat_join_request` updates.
- DMs a 4-option multiple-choice captcha (A-D) with a text-mode fallback and a decoy "Nicht hier drücken" button.
- Approves or declines join requests via the Telegram Bot API.
- Session-based state using grammY's session plugin.
- Configurable welcome + rules messages with a toggle button.
- Automatic expiry + periodic sweep to decline stale requests.

## Requirements
- Node.js 18+ recommended
- A Telegram bot token from BotFather

## Telegram setup (important)
1. Add the bot as **admin** to your group/supergroup.
2. Grant **can_invite_users** so it can receive join request updates and approve/decline them.
3. Grant **can_restrict_members** so the “Nicht hier drücken” decoy button can ban users.
4. Enable **Join Requests** for the group.

**Note:** The join request update includes `user_chat_id`, which can be used to DM the requester for only ~5 minutes. This bot sends the captcha immediately.

## Install
```bash
npm install
```

## Configure
Create a `.env` file based on `.env.example` and set your bot token:
```bash
cp .env.example .env
```

Optional environment variables:
- `CAPTCHA_TTL_MS` (default 600000)
- `MAX_ATTEMPTS` (default 3)
- `SWEEP_INTERVAL_MS` (default 60000)

## Configure welcome & rules (per group)
Run these commands **in the group** as an admin:
- `/setwelcome <message>` set the welcome message
- `/setrules <message>` set the rules message
- `/showwelcome` view current welcome message
- `/showrules` view current rules message

You can also configure from private chat:
- Run `/config` in the group (as admin) to set the active group for your DM session.
- Or use `/config <chat-id or @username>` in private chat.
- Then run `/setwelcome`, `/setrules`, `/showwelcome`, `/showrules` in private chat.

You can use `{chat}` or `{chatTitle}` placeholders in messages.

## Test captcha
Use `/test` (private or group) to receive a test captcha. It does not approve or decline any join request.

## Run
```bash
npm run dev
```

Build & start:
```bash
npm run build
npm start
```

## How it works
- The bot receives a `chat_join_request` update and immediately DMs the user using `user_chat_id`.
- The captcha is a 4-option multiple-choice question with **exactly one correct answer**.
- The user taps the correct answer (A-D) or uses text mode (reply with 1-4). Wrong answers are limited by `MAX_ATTEMPTS`.
- The decoy “Nicht hier drücken” button closes the request and bans the user (if the bot has restrict permission).
- Sessions are keyed by `ctx.from.id` via `getSessionKey` so join requests and private chat callbacks share state.
- A periodic sweep auto-declines expired requests.

## Notes
- The chat members plugin is enabled and `chat_member` updates are explicitly allowed for polling.
- Captcha state is stored in memory via grammY's session middleware. Group config is stored using `@grammyjs/storage-free`.
