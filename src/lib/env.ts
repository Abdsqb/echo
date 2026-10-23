// Central place for configuration. Every integration is optional so the app
// runs before keys are added; `integrations()` reports what is configured.

const read = (name: string) => {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
};

export const env = {
  appUrl: () => read("APP_URL") ?? "http://localhost:3000",
  appPassword: () => read("APP_PASSWORD"),
  sessionSecret: () => read("SESSION_SECRET"),
  myEmail: () => read("MY_EMAIL")?.toLowerCase(),
  myName: () => read("MY_NAME"),
  databaseUrl: () => read("DATABASE_URL") ?? "file:./data/echo.db",
  databaseAuthToken: () => read("DATABASE_AUTH_TOKEN"),
  cronSecret: () => read("CRON_SECRET"),

  anthropicKey: () => read("ANTHROPIC_API_KEY"),
  model: () => read("CLAUDE_MODEL") ?? "claude-sonnet-5-5",
  // Mock mode returns deterministic fake AI output so the app can be
  // exercised end to end without an API key.
  mockAi: () => read("ECHO_MOCK_AI") === "1" || !read("ANTHROPIC_API_KEY"),

  zoomAccountId: () => read("ZOOM_ACCOUNT_ID"),
  zoomClientId: () => read("ZOOM_CLIENT_ID"),
  zoomClientSecret: () => read("ZOOM_CLIENT_SECRET"),
  zoomWebhookSecret: () => read("ZOOM_WEBHOOK_SECRET_TOKEN"),

  googleClientId: () => read("GOOGLE_CLIENT_ID"),
  googleClientSecret: () => read("GOOGLE_CLIENT_SECRET"),
  googleRefreshToken: () => read("GOOGLE_REFRESH_TOKEN"),
  googleCalendarId: () => read("GOOGLE_CALENDAR_ID") ?? "primary",

  notionToken: () => read("NOTION_TOKEN"),
  notionDatabaseId: () => read("NOTION_DATABASE_ID"),
  notionParentPageId: () => read("NOTION_PARENT_PAGE_ID"),
};

export function integrations() {
  return {
    claude: !!env.anthropicKey(),
    mockAi: env.mockAi(),
    zoomApi: !!(env.zoomAccountId() && env.zoomClientId() && env.zoomClientSecret()),
    zoomWebhook: !!env.zoomWebhookSecret(),
    googleCalendar: !!(env.googleClientId() && env.googleClientSecret() && env.googleRefreshToken()),
    notion: !!(env.notionToken() && env.notionDatabaseId()),
    notionSetup: !!(env.notionToken() && env.notionParentPageId()),
    cron: !!env.cronSecret(),
  };
}
