import { writeFile, exists } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ATTACHMENTS_DIR } from "./vault";

/** Copies a dropped/selected File into the vault's _attachments folder and returns an asset:// URL for it. */
export function createUploadFileHandler(vaultPath: string) {
  return async function uploadFile(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());

    const dotIndex = file.name.lastIndexOf(".");
    const base = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
    const ext = dotIndex > 0 ? file.name.slice(dotIndex) : "";

    let candidateName = file.name || `attachment-${Date.now()}${ext}`;
    let absPath = await join(vaultPath, ATTACHMENTS_DIR, candidateName);
    let counter = 2;
    while (await exists(absPath)) {
      candidateName = `${base} ${counter}${ext}`;
      absPath = await join(vaultPath, ATTACHMENTS_DIR, candidateName);
      counter++;
    }

    await writeFile(absPath, bytes);
    return convertFileSrc(absPath);
  };
}
