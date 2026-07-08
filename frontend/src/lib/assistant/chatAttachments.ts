export type ChatAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  kind: 'image' | 'document';
  previewUrl: string | null;
  file?: File;
};

function createAttachmentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|heif)$/i.test(file.name);
}

export function createAttachmentFromFile(file: File): ChatAttachment {
  const kind = isImageFile(file) ? 'image' : 'document';

  return {
    id: createAttachmentId(),
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    kind,
    previewUrl: kind === 'image' ? URL.createObjectURL(file) : null,
    file,
  };
}

export function createAttachmentsFromFileList(files: FileList | File[]): ChatAttachment[] {
  return Array.from(files).map(createAttachmentFromFile);
}

export function revokeAttachmentPreview(attachment: ChatAttachment): void {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
}

export function revokeAttachmentPreviews(attachments: ChatAttachment[]): void {
  attachments.forEach(revokeAttachmentPreview);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileExtension(name: string): string {
  const parts = name.split('.');
  if (parts.length < 2) return 'FILE';
  return parts[parts.length - 1].toUpperCase().slice(0, 5);
}
