ALTER TABLE public.servers ADD COLUMN IF NOT EXISTS category_order jsonb DEFAULT '["category-text", "category-audio"]'::jsonb;
