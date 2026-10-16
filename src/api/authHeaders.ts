export function createBearerHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  } as const
}
