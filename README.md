# Subject Examination Website

ระบบข้อสอบรายวิชาแบบ AI-Data Driven และ Lecture-only

## Repository policy

Repository นี้ใช้หลัก **Single Current** เท่านั้น:

- ทุกไฟล์และข้อมูลใน `main` ต้องแทนสถานะปัจจุบันเพียงชุดเดียว
- เมื่อมีการเปลี่ยนแปลง ให้แก้ไขหรือแทนที่ไฟล์เดิมโดยตรง
- ห้ามสร้างไฟล์หรือโครงสร้างคู่ขนานเพื่อเก็บของเก่า/ของใหม่ เช่น `old`, `new`, `legacy`, `backup`, `v2`, `v3`, `final-new` หรือสำเนาเวอร์ชันอื่นโดยไม่จำเป็น
- เมื่อโครงสร้างใหม่เข้ามาแทนโครงสร้างเดิม ให้ลบ artifact เดิมที่ไม่ถูกใช้งานจาก working tree แทนการเก็บไว้คู่กัน
- ใช้ shared/template architecture และ Single Source of Truth เพื่อลดไฟล์ซ้ำและ code duplication
- `site-state.json` คือสถานะปัจจุบันของเว็บไซต์ และต้องถูกอัปเดตเป็นขั้นตอนสุดท้ายของการเปลี่ยนแปลงที่เกี่ยวข้อง

> Git commit history ยังคงเป็นประวัติตามธรรมชาติของ Git แต่ working tree บน `main` ต้องมีเฉพาะสถานะปัจจุบันที่ใช้งานจริง
