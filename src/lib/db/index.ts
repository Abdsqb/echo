import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { env } from "../env";
import * as schema from "./schema";

// Local SQLite file by default; point DATABASE_URL at a Turso/libSQL URL to deploy.
const url = env.databaseUrl();
if (url.startsWith("file:") && !url.includes(":memory:")) fs.mkdirSync(path.dirname(url.slice(5)), { recursive: true });
const client = createClient({ url, authToken: env.databaseAuthToken() });

export const db = drizzle(client, { schema });
export { schema };
