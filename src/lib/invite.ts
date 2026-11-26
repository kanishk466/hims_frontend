/** Full invite link for a token (in production this is emailed; in the demo we show and copy it). */
export const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`
