# مشروع مؤسسة الوليد للإنسانية

مشروع Node.js وExpress 5 مع قاعدة SQLite وواجهة عربية ولوحة إدارة في `/admin`.

## التشغيل المحلي

1. ثبّت Node.js 18 أو أحدث.
2. نفّذ `npm install` داخل مجلد المشروع.
3. انسخ `.env.example` إلى `.env` وعدّل القيم، أو استخدم ملف `.env` المحلي الذي أنشأته أداة الإصلاح.
4. شغّل `npm start`.
5. افتح `http://localhost:3000/`، ولوحة الإدارة على `http://localhost:3000/admin`.

لا ترفع `.env` أو `node_modules` أو أي ملف SQLite إلى GitHub. اقرأ [دليل النشر العربي](./DEPLOYMENT_GUIDE_AR.md) للرفع إلى GitHub والنشر على Railway وإضافة Volume وربط النطاق.

## المكونات

- خادم Express ومسارات API للتقديمات والتتبع ورسائل التواصل والمحتوى والإحصاءات.
- تسجيل دخول JWT مع تشفير كلمات المرور بواسطة bcrypt.
- قاعدة SQLite قابلة للضبط عبر `DATABASE_PATH`، وتعمل محليًا من `.data/alwaleed.sqlite`.
- تهيئة تلقائية لحساب المشرف من `ADMIN_EMAIL` و`ADMIN_PASSWORD`.
- إعداد Railway في `railway.json`.
- اختبارات تشغيل في `server.test.mjs`.
