import type { Config } from 'drizzle-kit';

export default {
  dialect: 'mysql',
  schema: './db/schema/*.ts',
  out: './db/migrations',
  dbCredentials: {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'via',
  },
} satisfies Config;
