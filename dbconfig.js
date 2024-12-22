const config = {
    server: 'localhost',
    database: 'ShipMaster',
    options: {
      encrypt: true, // Yerel ortam için false da yapılabilir
      trustServerCertificate: true
    },
    authentication: {
      type: 'ntlm',
      options: {
        domain: '', // Eğer bir domain üzerinde çalışıyorsanız buraya domain adı ekleyin
        userName: 'Imperial', // Windows kullanıcı adı
        password: '1210' // Windows şifreniz
      }
    }
  };
  
  module.exports = config;
  