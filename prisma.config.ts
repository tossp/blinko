import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'bun run prisma/seed.ts',
  },
  datasource: {
    // Generation/validation must also work in builds without database credentials.
    // Database commands fail closed when the URL is absent.
    url: process.env.DATABASE_URL,
  },
});
