# Drifd Geliştirme Protokolü

## ⚠️ Ana Kural Seti (Cursor Chat'e ilk girilecek)

```text
Act as a Senior Principal Full Stack Architect. We are building "Drifd", a high-performance Discord clone for Web and Windows.

**THE HOLY TECH STACK:**
- **Framework:** Next.js 15 (App Router). *MANDATORY: Treat `params` and `searchParams` as Promises (await them).*
- **Language:** TypeScript.
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage).
- **State/Query:** @tanstack/react-query & Zustand.
- **UI:** Tailwind CSS + shadcn/ui.
- **Video/Audio:** LiveKit (Cloud).
- **Desktop Wrapper:** Electron.js (Will be added at the end).

**ARCHITECTURAL RULES (DO NOT BREAK):**
1. **No Socket.io / No Prisma:** We use Supabase native features only.
2. **Type Safety:** Generate strict TypeScript interfaces for all Supabase tables (`types/supabase.ts`).
3. **Modular Code:** Keep components small (e.g., `components/chat/chat-item.tsx`, `components/server/server-sidebar.tsx`).
4. **Async Params:** In Next.js 15 pages, always use `const { id } = await params;`.

I will provide you with specific modules to implement. Wait for my instruction for Module 1.
```

## 🛠️ Aşama 1: Temel & Veritabanı

### Kurulum komutları

```bash
npx create-next-app@latest drifd --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*"
cd drifd
npm i @supabase/supabase-js @supabase/ssr @tanstack/react-query lucide-react zustand clsx tailwind-merge
npx shadcn@latest init
```

### Bu repoda tamamlananlar
- Next.js 15 tabanı ve App Router yapısı eklendi.
- `utils/supabase/server.ts` ve `utils/supabase/client.ts` eklendi.
- `types/supabase.ts` strict DB tipleri eklendi.
- `supabase_schema.sql` Drifd çekirdek modeli + RLS ile güncellendi.

## 🎨 Aşama 2: Navigasyon ve Layout (Sıradaki)

```text
**MODULE 2: NAVIGATION & LAYOUT SHELL**

Now that the DB is ready, let's build the UI shell.

1.  **Sidebar Logic:** Create a `NavigationSidebar` component (Leftmost vertical bar).
    - It must fetch the list of servers the current user is a member of from Supabase.
    - Display server icons in circles.
    - Include a "Add Server" button and "User Profile" at the bottom.

2.  **Server Sidebar:** Create a `ServerSidebar` component (Second left bar).
    - Fetch server details, channels (grouped by type), and members.
    - Use proper sorting (Text channels, Audio channels).

3.  **Layouts:**
    - Create `app/(main)/layout.tsx`: Includes the NavigationSidebar.
    - Create `app/(main)/servers/[serverId]/layout.tsx`: Includes the ServerSidebar.

4.  **Modals:** Create a Zustand store (`hooks/use-modal-store.ts`) to manage modals. Create a basic "Create Server" modal dialog using shadcn/ui.

Provide the code for these layouts, the sidebar components, and the modal store.
```

## 💬 Aşama 3: Sohbet Sistemi

```text
**MODULE 3: REALTIME CHAT ENGINE (NO SOCKET.IO)**

We need to build the chat interface.

1.  **Chat UI Components:**
    - `ChatHeader`: Shows channel name and socket indicator.
    - `ChatInput`: Text area with file attachment button.
    - `ChatMessages`: Infinite scroll list of messages.

2.  **Supabase Realtime Logic (The Critical Part):**
    - Create a custom hook `useChatSocket` that connects to `supabase.channel('chat:[channelId]')`.
    - It must listen for `INSERT` (new message), `UPDATE` (edit), and `DELETE` events.
    - Update the React Query cache instantly when an event is received (Optimistic UI).

3.  **Data Fetching:**
    - Create a hook `useChatQuery` using `useInfiniteQuery` from tanstack-query.
    - It should fetch messages from Supabase in batches of 10.

Provide the code for `ChatInput`, `ChatMessages`, and the `useChatSocket` hook using Supabase Realtime.
```

## 📹 Aşama 4: Ses/Görüntü

```text
**MODULE 4: VOICE & VIDEO (LIVEKIT)**

Now, implement the Media Channels.

1.  **Backend Token:** Create a Next.js API route `app/api/livekit/route.ts` to generate an access token for the logged-in user.

2.  **Media Room Component:** Create a `MediaRoom` component using `@livekit/components-react`.
    - It should fetch the token from our API.
    - Render the `LiveKitRoom` and `VideoConference` components.

3.  **Integration:**
    - Update the Channel Page. If `channel.type === 'AUDIO'` or `'VIDEO'`, render the `MediaRoom` instead of the Chat interface.

Provide the API route and the MediaRoom component code.
```

## 🪟 Aşama 5: Electron Paketleme

```text
**MODULE 5: DESKTOP PACKAGING (ELECTRON)**

The web app is finished. Now, wrap it for Windows.

1.  **Setup:** Tell me how to install `electron` and `electron-builder`.
2.  **Main Process:** Write the `main.js` (or `main.ts`) file to create a BrowserWindow that loads `http://localhost:3000` in dev and the built files in prod.
3.  **Scripts:** Update `package.json` to add "electron:dev" and "electron:build" scripts.

Give me the necessary Electron configuration to build a `.exe` file for Windows.
```
