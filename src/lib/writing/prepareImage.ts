import { MAX_UPLOAD_BYTES, PASSTHROUGH_TYPES } from "@/config/writingImages";

/**
 * 上傳前的格式安全處理（不是壓縮）
 *
 * 目的只有一個：讓伺服器一定讀得懂這個檔案。真正的正規化（轉正、縮圖、壓縮）
 * 在伺服器端做，因為那必須只有一套定義；每支手機、每個瀏覽器壓出來的結果都不一樣。
 *
 * 兩條路：
 *   JPEG / PNG / WebP → 原封不動上傳。伺服器的 sharp 讀得懂，EXIF 方向也由它處理。
 *   其他（主要是 iPhone 的 HEIC）→ 在瀏覽器解碼後重新編成 JPEG。
 *     Safari 解得開 HEIC（那是它自己的格式），伺服器的 libvips 通常沒有編進 HEIF 支援。
 *
 * ⚠️ createImageBitmap 的 imageOrientation: "from-image" 很重要。
 *    重新編碼會把 EXIF 丟掉，若不在這一步就把方向套用到像素上，
 *    照片會永遠躺著——伺服器再也沒有資訊可以把它轉正。
 */

export interface PreparedImage {
  blob: Blob;
  /** 上傳用的副檔名，與 blob 的型別一致 */
  extension: "jpg" | "png" | "webp";
  contentType: string;
  /** 是否在瀏覽器重新編碼過 */
  reencoded: boolean;
}

/** 重新編碼時的長邊上限。這不是為了省空間，是為了避免超大圖在手機上爆記憶體。 */
const REENCODE_MAX_EDGE = 4032;
const REENCODE_QUALITY = 0.92;

const EXTENSIONS: Record<string, PreparedImage["extension"]> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export class ImageTooLargeError extends Error {
  constructor() {
    super("這張照片超過 10 MB，請用手機的一般畫質重拍一次");
    this.name = "ImageTooLargeError";
  }
}

export class ImageUnreadableError extends Error {
  constructor() {
    super("這個檔案讀不出來，請改用手機拍照或選擇 JPG 圖片");
    this.name = "ImageUnreadableError";
  }
}

async function reencodeToJpeg(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageUnreadableError();
  }

  const scale = Math.min(1, REENCODE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new ImageUnreadableError();
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", REENCODE_QUALITY),
  );
  if (!blob) throw new ImageUnreadableError();
  return blob;
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (PASSTHROUGH_TYPES.includes(file.type)) {
    if (file.size > MAX_UPLOAD_BYTES) throw new ImageTooLargeError();
    return {
      blob: file,
      extension: EXTENSIONS[file.type] ?? "jpg",
      contentType: file.type,
      reencoded: false,
    };
  }

  const blob = await reencodeToJpeg(file);
  if (blob.size > MAX_UPLOAD_BYTES) throw new ImageTooLargeError();
  return { blob, extension: "jpg", contentType: "image/jpeg", reencoded: true };
}
