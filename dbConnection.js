const sql = require('mssql');
const config = require('./dbconfig');

let pool;

const connectToDatabase = async () => {
  if (!pool) {
    try {
      pool = await sql.connect(config);
      console.log('MSSQL bağlantısı başarılı.');
    } catch (error) {
      console.error('Veritabanına bağlanırken hata oluştu:', error.message);
      if (error.code === 'ESOCKET') {
        console.error('Bağlantı bilgilerinizi kontrol edin (server, port, kimlik doğrulama).');
      }
    }
  }
  return pool;
};

module.exports = { connectToDatabase };
