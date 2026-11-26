/** Only Ring's approved media destinations may receive a signed download request. */
export function mediaLocation(value: string | null): URL | undefined {
  if (!value || !URL.canParse(value)) return undefined;
  const target = new URL(value);
  if (
    target.protocol !== "https:" ||
    target.port ||
    target.username ||
    target.password ||
    (![
      ".amazonvision.com",
      ".amazonaws.com",
      ".cloudfront.net",
      ".ring.com",
    ].some((domain) => target.hostname.endsWith(domain)) &&
      !/^download-[a-z0-9-]+\.prod\.phoenix\.devices\.amazon\.dev$/.test(
        target.hostname,
      ))
  )
    return undefined;
  return target;
}
