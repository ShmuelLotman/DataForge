This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
DATABASE_URL=your_supabase_database_connection_string

# Better Auth Configuration
BETTER_AUTH_SECRET=your_random_secret_key_min_32_chars
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Getting Your Supabase Credentials

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to Settings > API to find:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your anon/public key
4. Go to Settings > Database to find:
   - `DATABASE_URL`: Your database connection string (use the "Connection string" under "Connection parameters", format: `postgresql://postgres:[YOUR-PASSWORD]@[HOST]:5432/postgres`)

### Generating BETTER_AUTH_SECRET

You can generate a secure random secret using:

```bash
openssl rand -base64 32
```

Or use any secure random string generator. The secret should be at least 32 characters long.

## Authentication Setup

This project uses [better-auth](https://www.better-auth.com) with Supabase for authentication.

### Database Setup

Better-auth will automatically create the necessary tables when you first run the application. Alternatively, you can run the migration manually:

```bash
# If using Supabase CLI
supabase migration up
```

The migration file is located at `supabase/migrations/004_better_auth_tables.sql`.

### Authentication Features

- Email/Password authentication
- User sessions
- Protected routes (use `requireAuth()` from `lib/auth-server.ts`)

### Usage Examples

**Client-side:**
```tsx
import { useAuth } from '@/hooks/use-auth'
import { signIn, signOut } from '@/lib/auth-client'

function MyComponent() {
  const { user, isAuthenticated } = useAuth()
  
  // Use user data
}
```

**Server-side:**
```tsx
import { getSession, requireAuth } from '@/lib/auth-server'

// Get session (may be null)
const session = await getSession()

// Require authentication (throws if not authenticated)
const session = await requireAuth()
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Better Auth Documentation](https://www.better-auth.com/docs) - authentication framework documentation.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
