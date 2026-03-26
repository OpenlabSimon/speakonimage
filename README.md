SpeakOnImage is a Next.js app for AI-assisted English speaking practice, with invite-only beta support for early external testing.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open `http://localhost:3000` with your browser to see the result.

For beta deployment details, see [docs/deploy-beta.md](/Users/huiliu/Projects/speakonimage/docs/deploy-beta.md).

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Beta Launch

- Invite access page: `/beta/access`
- Direct invite links: `/invite/<token>`
- Recommended production host: `https://www.dopling.ai`
