import { useEffect } from "react";

interface Options {
  noindex?: boolean;
}

/**
 * Sets a unique <title> and meta description for a route, restoring the
 * previous values on unmount. index.html ships one static title/description
 * for the whole SPA shell — this fills in per-page values on top of that.
 */
export function useDocumentMeta(title: string, description?: string, options?: Options) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    const descriptionTag = description
      ? document.querySelector('meta[name="description"]')
      : null;
    const prevDescription = descriptionTag?.getAttribute("content") ?? null;
    if (descriptionTag && description) {
      descriptionTag.setAttribute("content", description);
    }

    let robotsTag: HTMLMetaElement | null = null;
    if (options?.noindex) {
      robotsTag = document.createElement("meta");
      robotsTag.setAttribute("name", "robots");
      robotsTag.setAttribute("content", "noindex");
      document.head.appendChild(robotsTag);
    }

    return () => {
      document.title = prevTitle;
      if (descriptionTag && prevDescription !== null) {
        descriptionTag.setAttribute("content", prevDescription);
      }
      if (robotsTag) {
        robotsTag.remove();
      }
    };
  }, [title, description, options?.noindex]);
}
