# Seiri Bot (Node + grammY)

A minimal grammY bot scaffold for Node that is ready to expand with official plugins.

Plugins wired:
- `@grammyjs/chat-members` (chat member updates)
- `@grammyjs/session`
- `@grammyjs/keyboard`
- `@grammyjs/menu`

## Quick start

```bash
export BOT_TOKEN="123456:ABC..."

cd SeiriBot

npm install
npm run dev
```

## Notes

- This starter keeps a simple session counter and exposes a menu/keyboard to confirm plugin wiring.

## Commands

- `/start` shows the menu
- `/keyboard` enables a reply keyboard
