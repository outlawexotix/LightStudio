import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function saveOrShareImage(dataUrl: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('The generated image could not be exported.');
  }

  const extension = match[1] === 'jpeg' ? 'jpg' : match[1].replace('svg+xml', 'svg');
  const fileName = `lumina-${Date.now()}.${extension}`;
  const saved = await Filesystem.writeFile({
    path: fileName,
    data: match[2],
    directory: Directory.Cache,
  });

  await Share.share({
    title: 'Lumina edited photo',
    text: 'Save or share your edited photo',
    url: saved.uri,
    dialogTitle: 'Save or share image',
  });
  return true;
}
