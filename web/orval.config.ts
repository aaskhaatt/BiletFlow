import { defineConfig } from 'orval'

// npm run api:gen — needs the backend running (or OPENAPI_URL pointing to a schema).
// The output in src/api/generated is committed, so builds never need the backend.
export default defineConfig({
  biletflow: {
    input: {
      target: process.env.OPENAPI_URL ?? 'http://localhost:8000/openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: 'src/api/generated/endpoints',
      schemas: 'src/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      formatter: 'prettier',
      override: {
        // Our request layer adds the base address, the token and ApiError
        mutator: { path: 'src/api/http.ts', name: 'apiFetch' },
        // Hooks return the response body itself, not { data, status, headers }
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
})
