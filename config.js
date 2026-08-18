// Firebase Console > 專案設定 > 你的應用程式 > 網頁應用程式 > 設定
// 這些值本來就會出現在網頁原始碼裡，公開是正常的——
// 安全性靠 Firestore 規則（只允許登入者讀寫自己的 users/{uid}），不靠隱藏這些值。
export const firebaseConfig = {
  apiKey: "AIzaSyCdK_mXFMTtzbM-noE3tkdWZBr6bufrHGs",
  authDomain: "kenaycowgu.firebaseapp.com",
  projectId: "kenaycowgu",
  storageBucket: "kenaycowgu.firebasestorage.app",
  messagingSenderId: "761724202894",
  appId: "1:761724202894:web:d82c60cf22ab66fd0e3edf"
};

export const firebaseEnabled = !Object.values(firebaseConfig).some(value => value.startsWith("YOUR_"));
