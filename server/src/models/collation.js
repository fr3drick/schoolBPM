/**
 * Case-insensitive, accent-insensitive comparison for the names and codes a
 * school types in itself.
 *
 * strength: 2 compares base letters and accents but ignores case, so
 * "Further Mathematics" and "further mathematics" are the same key while the
 * value keeps whatever casing was entered. Applied to a unique index, the
 * database does the enforcing, which a read-then-write check in a route
 * cannot promise under concurrency.
 *
 * A query only gets this behaviour if it asks for the same collation, so
 * lookups meant to be case-insensitive must call .collation(CI) explicitly.
 */
export const CI = { locale: 'en', strength: 2 };
