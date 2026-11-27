/** Credits with at most 2 decimals, e.g. 12.5 (server and browser). */
export const fmtCredits = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
