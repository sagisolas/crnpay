export function PageData({ value }: { value: unknown }) {
  return (
    <script
      type="application/json"
      id="page-data"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, "\\u003c") }}
    />
  );
}
