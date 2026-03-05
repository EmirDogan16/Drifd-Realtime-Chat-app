<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Drifd

Drifd, Next.js 15 + Supabase temelli yüksek performanslı Discord klonu olarak evrimleştiriliyor.

## Çalıştırma

1. Bağımlılıkları kur:
   `npm install`
2. `.env.local` dosyası oluştur ve değerleri ekle:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
3. Geliştirme sunucusunu başlat:
   `npm run dev`

## Veritabanı

Supabase SQL Editor'a [supabase_schema.sql](supabase_schema.sql) dosyasını yapıştırıp çalıştır.

## Protokol

Adım adım mimari geliştirme planı için [DRIFD_DEVELOPMENT_PROTOCOL.md](DRIFD_DEVELOPMENT_PROTOCOL.md) dosyasını kullan.
