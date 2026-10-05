import { supabase } from "@/lib/supabase";
import type { ImageUrlResolver } from "@/components/RichTextView";

/** Staff app: sign embedded Infohub images with the logged-in user's access. */
export const resolveInfohubImages: ImageUrlResolver = async (paths) => {
  const { data } = await supabase.storage.from("infohub-files").createSignedUrls(paths, 3600);
  const urls: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) urls[row.path] = row.signedUrl;
  return urls;
};
