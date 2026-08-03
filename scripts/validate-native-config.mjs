import { loadEnv } from 'vite';

const mode = process.argv[2] || 'production';
const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
const apiUrl = env.VITE_API_BASE_URL || '';
const accessToken = env.VITE_API_ACCESS_TOKEN || '';

if (!/^https:\/\//.test(apiUrl) || apiUrl.includes('example.com')) {
  console.error('VITE_API_BASE_URL must be a deployed HTTPS URL before creating production Android assets.');
  process.exit(1);
}

if (accessToken.length < 32) {
  console.error('VITE_API_ACCESS_TOKEN must contain at least 32 characters for a private production Android build.');
  process.exit(1);
}
