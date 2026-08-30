const WEBMCP_ORIGIN_TRIAL_TOKEN_MIN_LENGTH = 80
const WEBMCP_ORIGIN_TRIAL_TOKEN_MAX_LENGTH = 4096
const ORIGIN_TRIAL_TOKEN_CHARACTERS = /^[A-Za-z0-9+/_=-]+$/

export const normalizeWebMcpOriginTrialToken = (
  value: string | undefined,
): string | null => {
  const token = value?.trim()
  if (!token) return null
  if (
    token.length < WEBMCP_ORIGIN_TRIAL_TOKEN_MIN_LENGTH
    || token.length > WEBMCP_ORIGIN_TRIAL_TOKEN_MAX_LENGTH
    || !ORIGIN_TRIAL_TOKEN_CHARACTERS.test(token)
  ) return null
  return token
}
