// Where the request layer gets the access token for "Authorization: Bearer".
// The session store (W3) registers its getter here; until then there is no token.

type AccessTokenGetter = () => string | null

let getter: AccessTokenGetter = () => null

export function setAccessTokenGetter(next: AccessTokenGetter): void {
  getter = next
}

export function getAccessToken(): string | null {
  return getter()
}
