export function extractDriveFileId(value: string) {
  const url = value.trim();
  return (
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1] ??
    url.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ??
    (/^[a-zA-Z0-9_-]{10,}$/.test(url) ? url : "")
  );
}

export function googleDriveAudioUrl(fileId: string) {
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download`;
}

export function audioStreamUrl(fileId: string) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";

  if (!supabaseUrl) return googleDriveAudioUrl(fileId);

  const functionUrl = new URL("/functions/v1/audio-stream", supabaseUrl);
  functionUrl.searchParams.set("fileId", fileId);
  return functionUrl.toString();
}

export function individualWorkUrl(workId: string) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("obra", workId);
  return url.toString();
}
