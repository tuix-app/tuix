// Keep the browser SDK behind a dynamic import, including during Next.js SSR.
export async function loadWidget() {
  return (await import('@tuix/widget')).tuix;
}
