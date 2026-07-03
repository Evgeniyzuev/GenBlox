export default function handler(request, response) {
  const publicConfig = {
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseKey:
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      "",
  };

  response.setHeader("Content-Type", "application/javascript; charset=utf-8");
  response.setHeader("Cache-Control", "public, max-age=300");
  response.status(200).send(
    `window.GENBLOX_CONFIG = ${JSON.stringify(publicConfig)};`,
  );
}
