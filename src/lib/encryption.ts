import CryptoJS from 'crypto-js';

export const encryptData = (data: unknown, key: string): string => {
  const jsonString = JSON.stringify(data);
  return CryptoJS.AES.encrypt(jsonString, key).toString();
};

export const decryptData = (encryptedData: string, key: string): unknown => {
  if (!key || !encryptedData) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, key);
    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
    if (!decryptedString) return null;
    return JSON.parse(decryptedString);
  } catch {
    return null;
  }
};
