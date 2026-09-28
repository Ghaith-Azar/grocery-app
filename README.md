# The List — Household Grocery App

A shared grocery list for the household. Anyone can add an item at any time;
everyone sees the same list, grouped by store section. When you're at the
store, use **Start Grocery Shopping** to get a clean, tappable checklist.

## How it works

- **List view** — add items with a name; the category fills in on its own
  for common items, in either English or Arabic (eggs/بيض → Dairy & Eggs,
  apples/تفاح → Produce, دجاج → Meat & Seafood, etc.). If it doesn't
  recognize something, it won't guess — it clears the category field and
  asks you to pick one before the item can be added. Items are grouped and
  ordered by category, roughly matching how a grocery store is laid out
  (produce first, household/cleaning near the end).
- **It learns your household's items** — if it didn't recognize something
  (or guessed wrong) and you pick the category yourself, that choice is
  saved to the database. Next time anyone types that item, it's filled in
  automatically ("Remembered from before"). Changing an item's category
  while editing teaches it too.
- **Edit in place** — tap an item's text (or the pencil) to fix its name,
  category, or quantity. Enter saves, Escape cancels.
- **Voice input** — tap the mic next to the item field and say the item.
  The small EN / ع button switches between English and Arabic. This uses
  the browser's built-in speech recognition, so it appears only where the
  browser supports it (Chrome, Edge, Android, recent Safari) and needs
  microphone permission.
- **Share via WhatsApp** — sends what's still left to buy, grouped by
  store section, as a WhatsApp message (items already checked off are left
  out).
- **Color tags** — pick your name and a color once (under "You"); it's
  remembered on that device and stamped on everything you add, so everyone
  can see at a glance who wants what.
- **Recently bought** — once you've finished a shopping trip at least once,
  a row of tappable chips shows items you've bought before but haven't
  re-added yet, so restocking a staple is one tap instead of retyping it.
- **Start Grocery Shopping** — switches to a large, checkbox-style list.
  Tap an item to check it off as you put it in the cart. A progress bar
  shows how much of the trip is done, and a search box at the top filters
  a long list (English or Arabic) without affecting the progress count.
- **Finish Shopping** — archives everything you checked off (removes it
  from the active list). Anything you didn't check stays on the list for
  next time.
- All devices poll the shared list every few seconds, so if two people add
  or check off items around the same time, everyone stays in sync within a
  few seconds. (See "Going real-time" below if you want this instant
  instead of on a few-second delay.)

## Project structure

```
grocery-app/
  server.js        Express server + API routes
  db.js             Turso/libSQL client + schema + category order
  public/
    index.html      Page markup
    style.css        Styling
    app.js            Front-end logic (fetch calls, rendering, polling)
  package.json
  .env.example
```

## 1. Run it locally first (optional but recommended)

```bash
npm install
npm start
```

With no environment variables set, it automatically uses a local SQLite
file (`local.db`) so you can try it out before touching Turso. Open
http://localhost:3000.

## 2. Create your Turso database

Install the Turso CLI and log in (see https://docs.turso.tech for the
latest install command for your OS), then:

```bash
turso auth login
turso db create household-grocery
turso db show household-grocery --url
turso db tokens create household-grocery
```

The `--url` command gives you `TURSO_DATABASE_URL` (starts with `libsql://`).
The `tokens create` command gives you `TURSO_AUTH_TOKEN`. Keep the token
secret — treat it like a password.

You don't need to run any SQL by hand — the app creates its `items` table
automatically the first time it starts.

## 3. Deploy to Render

1. Push this project to a GitHub (or GitLab) repository.
2. In the Render dashboard: **New +** → **Web Service** → connect the repo.
3. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Under **Environment Variables**, add:
   - `TURSO_DATABASE_URL` — from step 2
   - `TURSO_AUTH_TOKEN` — from step 2
5. Deploy. Render will give you a URL like `https://your-app.onrender.com`
   — share that with the household (e.g. add it to everyone's home screen).

Since Render's free tier can spin down when idle, the first request after a
while may take a few seconds to wake up — that's normal.

## Notes on the shared/multi-device behavior

There are no user accounts — anyone with the link can view and edit the
list, which matches "any of us can add items." The "You" name + color are
just a label stored per item; they aren't a login, and colors are limited
to a fixed palette defined on the server (`db.js`) so a device can't inject
arbitrary values that would render on everyone else's screen.

## Going real-time (not implemented — see the chat for the full write-up)

Right now every open tab polls `GET /api/items` every 4 seconds. That's
simple and reliable, but it means a change can take up to 4 seconds to
show up elsewhere. Swapping this for WebSockets (or Server-Sent Events)
would make updates appear instantly instead.
