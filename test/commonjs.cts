import SDK = require('usersearch-sdk');
const client = new SDK.UserSearch({ apiKey: 'synthetic', fetch: async () => { throw new Error('type check only'); } });
const error: SDK.UserSearchError = new SDK.AuthenticationError('example', { status: 401 });
void [client, error];
