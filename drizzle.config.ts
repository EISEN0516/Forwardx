import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: process.env.MYSQL_URL ?? "mysql://forwardx:forwardx@127.0.0.1:3306/forwardx",
  },
});
