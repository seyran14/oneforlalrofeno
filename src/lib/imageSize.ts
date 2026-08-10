import { readFileSync } from 'node:fs';

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Размеры картинки без внешних зависимостей — читаются при сборке, чтобы
 * отдать браузеру width/height и он заранее занял под фотографию место.
 * Поддержаны JPEG и PNG: в public/images/ лежат только они.
 */
export function imageSize(path: string): ImageSize | null {
  let buf: Buffer;
  try {
    buf = readFileSync(path);
  } catch {
    return null;
  }

  // PNG: ширина и высота лежат в IHDR по фиксированным смещениям
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG: идём по сегментам до заголовка кадра (SOF)
  if (buf.length > 4 && buf.readUInt16BE(0) === 0xffd8) {
    let offset = 2;

    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buf[offset + 1];

      // Маркеры без тела: padding, RSTn, SOI/EOI
      if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }

      // SOF0…SOF15, кроме таблиц Хаффмана и арифметики — в них размеры кадра
      const isFrameHeader =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

      if (isFrameHeader) {
        return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
      }

      offset += 2 + buf.readUInt16BE(offset + 2);
    }
  }

  return null;
}
