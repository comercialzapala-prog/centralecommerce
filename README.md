# Central E-commerce

Sistema web interno para gestão operacional e financeira de um novo e-commerce.

## Tecnologias

- Next.js 14 (App Router)
- React
- TypeScript
- Tailwind CSS
- Supabase (PostgreSQL, Auth, RLS)
- Recharts
- lucide-react

## Setup

1. Clone o repositório
2. Rode `npm install`
3. Crie um projeto no Supabase
4. Execute o SQL contido em `supabase/schema.sql` no SQL Editor do Supabase
5. Copie `.env.example` para `.env.local` e preencha as variáveis
6. Rode `npm run dev`

## Deploy na Vercel

1. Suba o código para o GitHub
2. Conecte o repositório na Vercel
3. Adicione as variáveis de ambiente `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` na Vercel
4. Clique em Deploy
