// nodemailer wrapper (sama seperti sebelumnya) - fungsi kirimEmailMenuMingguan & kirimNotifikasiKadaluarsa
const nodemailer = require('nodemailer');
const buatTransporter = () => nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT) : 587,
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});
const kirimEmailMenuMingguan = async (penerima, rencana) => { /* ... */ };
const kirimNotifikasiKadaluarsa = async (penerima, daftar) => { /* ... */ };
module.exports = { kirimEmailMenuMingguan, kirimNotifikasiKadaluarsa };