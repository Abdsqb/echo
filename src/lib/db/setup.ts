// `npm run db:setup`: creates the database, applies migrations, and seeds a
// starter voice profile plus the sample meeting so the app is usable at once.
import fs from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  const { env } = await import("../env");
  const url = env.databaseUrl();
  if (url.startsWith("file:")) fs.mkdirSync("data", { recursive: true });

  const { db } = await import("./index");
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied:", url);

  const { seedIfEmpty } = await import("./seed");
  const seeded = await seedIfEmpty();
  console.log(seeded ? "Seeded starter voice profile, example and eval case." : "Data already present; seed skipped.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
