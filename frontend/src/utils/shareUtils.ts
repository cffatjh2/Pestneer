/**
 * Universal document sharing and download utility for Pestneer.
 * Supports Web Share API (Mobile WhatsApp, AirDrop, Telegram, Email, etc.),
 * Direct File Sharing, Clipboard Copy fallback, and direct Blob downloads.
 */

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function downloadFromUrl(url: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export type ShareResult = {
  shared: boolean;
  method: 'native-file' | 'native-url' | 'clipboard' | 'download' | 'error';
  message?: string;
};

export async function shareOrDownloadFile(options: {
  title: string;
  text?: string;
  url?: string;
  blob?: Blob;
  fileName?: string;
}): Promise<ShareResult> {
  const { title, text, url, blob, fileName } = options;

  // 1. Try native file sharing if Blob & fileName are available
  if (blob && fileName && typeof navigator !== 'undefined' && 'canShare' in navigator && 'share' in navigator) {
    try {
      const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: title || fileName,
          text: text || `${title} - Pestneer Belgesi`,
        });
        return { shared: true, method: 'native-file', message: 'Belge paylaşıldı.' };
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return { shared: false, method: 'native-file', message: 'Paylaşım iptal edildi.' };
      }
      // Otherwise fall through to URL or download
    }
  }

  // 2. Try native URL/text sharing if supported
  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
      await navigator.share({
        title,
        text: text || `${title} - Pestneer`,
        url: shareUrl,
      });
      return { shared: true, method: 'native-url', message: 'Bağlantı paylaşıldı.' };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return { shared: false, method: 'native-url', message: 'Paylaşım iptal edildi.' };
      }
      // Fall through to clipboard or download
    }
  }

  // 3. Fallback: If blob exists, trigger direct download
  if (blob && fileName) {
    downloadBlob(blob, fileName);
    return { shared: true, method: 'download', message: 'Belge cihazınıza indirildi.' };
  }

  // 4. Fallback: If URL exists, copy to clipboard
  if (url && typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(url);
      return { shared: true, method: 'clipboard', message: 'Bağlantı panoya kopyalandı.' };
    } catch {
      // Ignore
    }
  }

  return { shared: false, method: 'error', message: 'Paylaşım desteklenmiyor.' };
}

export async function shareProtectedDocument(
  token: string,
  downloadUrl: string,
  fileName: string,
  title?: string
): Promise<ShareResult> {
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Belge indirilemedi.');
  const blob = await response.blob();
  const result = await shareOrDownloadFile({
    title: title || fileName,
    fileName,
    blob,
    text: `${title || fileName} - Pestneer Kalite & Operasyon Belgesi`,
  });
  if (!result.shared && result.method === 'error') {
    throw new Error(result.message || 'Belge paylaşılamadı.');
  }
  return result;
}
