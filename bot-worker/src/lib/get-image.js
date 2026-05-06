export async function getTelegramImageBase64(env, fileId) {
  const getFileUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
  const fileRes = await fetch(getFileUrl);
  const fileData = await fileRes.json();
  if (!fileData.ok) throw new Error("Failed to get file path");

  const dlUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`;
  const imgRes = await fetch(dlUrl);
  const arrayBuffer = await imgRes.arrayBuffer();

  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.byteLength; i++) {
      binary += String.fromCharCode(uint8Array[i]);
  }
  const base64 = btoa(binary);

  return `data:image/jpeg;base64,${base64}`;
}
