/** Format a price (0-1) as cents with appropriate precision */
export function formatPrice(price: number): string {
  return `${(price * 100).toFixed(1)}¢`;
}

/** Format a dollar amount */
export function formatDollars(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** Format a share size with commas */
export function formatSize(size: number): string {
  if (size >= 1000) {
    return `${(size / 1000).toFixed(1)}K`;
  }
  return Math.round(size).toLocaleString();
}

/** Format spread in basis points */
export function formatSpread(spread: number): string {
  return `${(spread * 100).toFixed(1)}¢`;
}
