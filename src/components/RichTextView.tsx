import { useEffect, useMemo, useState } from "react";
import { bodyToHtml, collectImagePaths, injectImageSrc } from "@/lib/rich-text";

export type ImageUrlResolver = (paths: string[]) => Promise<Record<string, string>>;

/** Sanitized body HTML with signed image URLs filled in; null while images load. */
export function useResolvedHtml(body: string, resolve: ImageUrlResolver): string | null {
  const html = useMemo(() => bodyToHtml(body), [body]);
  const paths = useMemo(() => collectImagePaths(html), [html]);
  const [resolved, setResolved] = useState<string | null>(paths.length ? null : html);

  useEffect(() => {
    if (!paths.length) { setResolved(html); return; }
    let cancelled = false;
    resolve(paths)
      .catch(() => ({}))
      .then((urls) => { if (!cancelled) setResolved(injectImageSrc(html, urls)); });
    return () => { cancelled = true; };
    // resolve is expected to be stable per org/location
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, paths]);

  return resolved;
}

export function RichTextView({
  body,
  resolveImages,
  onImageClick,
}: {
  body: string;
  resolveImages: ImageUrlResolver;
  onImageClick?: (url: string, alt: string) => void;
}) {
  const html = useResolvedHtml(body, resolveImages);
  if (html === null) return <div className="h-16 rounded-xl bg-muted/50 animate-pulse" />;
  return (
    <div
      className="rich-content"
      data-testid="rich-content"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target instanceof HTMLImageElement && onImageClick) onImageClick(target.src, target.alt);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
