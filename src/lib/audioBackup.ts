import type { AudioWork } from "../types";

type BackupWork = Pick<
  AudioWork,
  | "id"
  | "drive_file_id"
  | "drive_url"
  | "title"
  | "mime_type"
  | "is_published"
  | "created_at"
  | "updated_at"
>;

type AudioCatalogBackupFile = {
  version: number;
  generated_at: string | null;
  works: BackupWork[];
};

export type AudioCatalogBackup = {
  generatedAt: string | null;
  works: AudioWork[];
};

function isBackupWork(value: unknown): value is BackupWork {
  if (!value || typeof value !== "object") return false;
  const work = value as Partial<BackupWork>;
  return (
    typeof work.id === "string" &&
    typeof work.drive_file_id === "string" &&
    typeof work.drive_url === "string" &&
    typeof work.title === "string" &&
    typeof work.mime_type === "string" &&
    work.is_published === true &&
    typeof work.created_at === "string" &&
    typeof work.updated_at === "string"
  );
}

export async function loadAudioCatalogBackup(): Promise<AudioCatalogBackup> {
  const backupUrl = new URL(
    `${import.meta.env.BASE_URL}audio-catalog-backup.json`,
    window.location.href,
  );
  backupUrl.hash = "";
  backupUrl.searchParams.set("cache", Date.now().toString());

  const response = await fetch(backupUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("O backup estático do catálogo não está disponível.");
  }

  const data = (await response.json()) as Partial<AudioCatalogBackupFile>;
  const works = Array.isArray(data.works)
    ? data.works.filter(isBackupWork).map((work) => ({
        ...work,
        created_by: null,
      }))
    : [];

  return {
    generatedAt: typeof data.generated_at === "string" ? data.generated_at : null,
    works,
  };
}
