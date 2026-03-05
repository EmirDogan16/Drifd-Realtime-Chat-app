# Drifd

A high-performance Discord clone built with Next.js 15 and Supabase, featuring real-time messaging, voice/video channels, and a modern UI.

## Features

- 🔐 Authentication with Supabase Auth
- 💬 Real-time text messaging with polling and WebSocket fallback
- 🎙️ Voice and video channels powered by LiveKit
- 📁 File uploads and media sharing
- 🎨 Modern Discord-like UI with Tailwind CSS
- 🔒 Role-based permissions (Admin, Moderator, Guest)
- 📊 Poll creation and voting system
- 🔍 GIF search integration (Giphy/Klipy)
- 👥 Friend system and direct messages
- 📌 Server/channel management with categories

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file and add your environment variables:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   NEXT_PUBLIC_LIVEKIT_URL=your_livekit_url
   LIVEKIT_API_KEY=your_livekit_api_key
   LIVEKIT_API_SECRET=your_livekit_api_secret
   ```

3. Set up the database by running [supabase_schema.sql](supabase_schema.sql) in Supabase SQL Editor

4. Start the development server:
   ```bash
   npm run dev
   ```

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Real-time**: Supabase Realtime + Custom Polling
- **Voice/Video**: LiveKit
- **Styling**: Tailwind CSS
- **State Management**: React Query (TanStack Query)
- **Authentication**: Supabase Auth

## Project Structure

See [DRIFD_DEVELOPMENT_PROTOCOL.md](DRIFD_DEVELOPMENT_PROTOCOL.md) for detailed architecture and development plan.

## License

Copyright © 2026 Emir Dogan. All Rights Reserved.

This software is proprietary and confidential. Unauthorized copying, modification, 
distribution, or use of this software is strictly prohibited.
