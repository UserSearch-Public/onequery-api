import { UserSearch } from 'usersearch-sdk';

// Set USERSEARCH_API_KEY in the server environment before running.
// This example only reads the balance; it does not submit a search.
const client = new UserSearch({ apiKey: process.env.USERSEARCH_API_KEY });
try {
  const { data, meta } = await client.balance();
  console.log({ balanceCents: data.balance, requestId: meta.requestId });
} catch (error) {
  console.error({ code: error.code, status: error.status, requestId: error.requestId });
  process.exitCode = 1;
}
