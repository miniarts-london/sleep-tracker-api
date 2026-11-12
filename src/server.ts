import app from './app.ts';
import { getSecret } from './auth/tokens.ts';

// Fail fast: stop now with a clear message if JWT_SECRET isn't set, rather
// than starting up and then failing on the first login.
getSecret();

const port = Number(process.env.PORT) || 3001;

app.listen(port, () => {
  console.log(`Sleep tracker API listening on http://localhost:${port}`);
});
