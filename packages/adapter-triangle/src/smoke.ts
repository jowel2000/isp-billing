import { TriangleClient } from './triangle-client';

async function main() {
  const baseUrl = process.env.TRIANGLE_BASE_URL;
  const username = process.env.TRIANGLE_USERNAME;
  const password = process.env.TRIANGLE_PASSWORD;

  if (!baseUrl || !username || !password) {
    throw new Error('Set TRIANGLE_BASE_URL, TRIANGLE_USERNAME and TRIANGLE_PASSWORD');
  }

  const client = new TriangleClient({ baseUrl, requestsPerMinute: 10 });
  const result = await client.login(username, password);

  // Never print cookies or credentials.
  console.log(
    JSON.stringify(
      {
        otpRequired: result.otpRequired,
        cookieCount: Object.keys(result.cookies).length,
        responseKeys:
          result.data && typeof result.data === 'object'
            ? Object.keys(result.data as Record<string, unknown>)
            : typeof result.data,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
