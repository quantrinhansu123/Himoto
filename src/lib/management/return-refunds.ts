// Account numbers copied from bank screens often contain grouping dots/spaces.
// Keep the same canonical value in the form and the return API.
export const normalizeRefundAccount = (value: string) => value.trim().replace(/[\s.]/g, '');
export const validRefundAccount = (value: string) => /^[A-Z0-9-]{3,34}$/i.test(normalizeRefundAccount(value));
