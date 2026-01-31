# Seiri Bot

Seiri Bot is a Telegram bot that handles **chat join requests** by DMing users a captcha. The bot approves the join request only after the captcha is solved.

## Features
- Handles `chat_join_request` updates.
- DMs a 4-option multiple-choice captcha (A-D) with a text-mode fallback and a decoy "Nicht hier drücken" button.
- Auto-approves allowlisted users and recent verifications.
- Approves or declines join requests via the Telegram Bot API.
- Session-based state using grammY's session plugin.
- Configurable welcome + rules messages with a toggle button.
- Admin/moderation commands (ban, mute, warn, purge, pin, lock).
- Federation support (fban/fmute across linked groups).
- Optional deletion of Telegram service messages.
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
- `MAX_ATTEMPTS` (default 2)
- `SWEEP_INTERVAL_MS` (default 60000)
- `VERIFIED_TTL_MS` (default 604800000)

## Configure welcome & rules (per group)
Run these commands **in the group** as an admin:
- `/setwelcome <message>` set the welcome message
- `/setrules <message>` set the rules message
- `/showwelcome` view current welcome message
- `/showrules` view current rules message
- `/delserv on|off` toggle deletion of service messages

Config changes are handled directly in the group.

Allow/deny list commands (admin only):
- `/allow <user-id or @username>` add user to allowlist (auto-approve).
- `/deny <user-id or @username>` add user to denylist (auto-decline + ban).
- `/unallow <user-id or @username>` remove from allowlist.
- `/undeny <user-id or @username>` remove from denylist.
- `/listallow` show allowlist.
- `/listdeny` show denylist.
- `/clearverified` clear the verification cache (7-day auto-approve list).

You can use `{chat}` or `{chatTitle}` placeholders in messages.

## Moderation commands (admin only)
These commands work in groups/supergroups. Use reply, `@username`, or a numeric user id:
- `/ban`, `/unban`, `/kick`
- `/mute [10m|2h|1d]`, `/unmute`
- `/warn [reason]`, `/unwarn`, `/warnings`
- `/purge <n>` delete the last `n` messages (safe limit)
- `/pin`, `/unpin` (reply to target message)
- `/lock`, `/unlock` toggle member send permissions

## Federation setup
Federations are controlled from a **federal group** (a group/supergroup where the bot is present).

Federal group commands:
- `/fedadd <chat_id>` link a group to the federation (creates federation if needed)
- `/fedremove <chat_id>` unlink a group
- `/fedlist` list linked groups
- `/fban`, `/funban`, `/fmute`, `/funmute` apply actions across linked groups

Linked group command:
- `/fedset <federal_chat_id>` link this group to an existing federation

Info:
- `/fedinfo` show federation status for the current group

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
- Allowlisted users or recently verified users (within `VERIFIED_TTL_MS`) are auto-approved.
- Sessions are keyed by `ctx.from.id` via `getSessionKey` so join requests and private chat callbacks share state.
- A periodic sweep auto-declines expired requests.

## Notes
- The chat members plugin is enabled and `chat_member` updates are explicitly allowed for polling.
- Captcha state is stored in memory via grammY's session middleware. Group config is stored using `@grammyjs/storage-free`.
