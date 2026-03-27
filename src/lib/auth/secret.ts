const LOCAL_DEV_AUTH_SECRET = 'local-dev-auth-secret-speakonimage';

export function getAuthSecret(): string | undefined {
  const configuredSecret =
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();

  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV !== 'production') {
    return LOCAL_DEV_AUTH_SECRET;
  }

  return undefined;
}

export function getLocalDevAuthSecret(): string {
  return LOCAL_DEV_AUTH_SECRET;
}
