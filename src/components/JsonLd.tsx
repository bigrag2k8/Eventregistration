/**
 * Emit a schema.org JSON-LD block. Safe against injection: JSON.stringify can't
 * emit a raw `</script>`, but we still escape `<` so a malicious event name /
 * description can't break out of the script element.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
