const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { connectToDatabase } = require('./dbConnection');
const sql = require('mssql');
const config = require('./dbconfig');


const app = express();

// Middleware'ler
app.use(bodyParser.urlencoded({ extended: true })); // Form verilerini işlemek için
app.use(bodyParser.json());

// EJS Ayarları
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Statik dosyaları src/assets klasöründen sun
app.use('/assets', express.static(path.join(__dirname, 'src/assets')));

// ** Giriş Sayfası **
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ** HomePage (EJS) **
app.get('/home', async (req, res) => {
  try {
    // Veritabanına bağlan ve gemi bilgilerini çek
    const pool = await connectToDatabase();
    const result = await pool.request().query('SELECT IMO_Number, Flag_State, Ship_Type, Photo, Status FROM Ships');

    // Gelen verileri düzenle
    const ships = result.recordset.map(ship => ({
      IMO_Number: ship.IMO_Number,
      Flag_State: ship.Flag_State || 'Belirtilmemiş',
      Owner_Info: ship.Owner_Info || 'Bilinmiyor',
      Ship_Type: ship.Ship_Type || 'Bilinmiyor',
      Photo: ship.Photo || 'Görsel Yok',
      Status: ship.Status || 'Durum Yok',
    }));

    // EJS dosyasını render et ve ships verisini gönder
    res.render('homePage', { ships });
  } catch (error) {
    console.error('homePage.ejs sırasında hata oluştu:', error.message);
    res.status(500).send('Sunucuda bir hata oluştu.');
  }
});

// ** Login İşlemi **
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const pool = await connectToDatabase();
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .input('password', sql.VarChar, password)
      .query('SELECT * FROM Users WHERE username = @username AND password = @password');

    if (result.recordset.length > 0) {
      console.log('Giriş başarılı:', username);
      res.redirect('/home'); // Başarılı giriş sonrası homePage'e yönlendirme
    } else {
      console.log('Geçersiz giriş denemesi:', username);
      res.status(401).send('<h2>Geçersiz kullanıcı adı veya şifre. Tekrar deneyin.</h2>');
    }
  } catch (error) {
    console.error('Login işlemi sırasında hata oluştu:', error.message);
    res.status(500).send('Sunucuda bir hata oluştu.');
  }
});

// ** Ships API **
app.get('/ships', async (req, res) => {
  try {
    // Veritabanına bağlan ve gemi bilgilerini çek
    const pool = await connectToDatabase();
    const ships = await pool.request().query('SELECT IMO_Number, Flag_State, Owner_Info, Ship_Type, Photo, Status FROM Ships');

    // JSON formatında yanıt gönder
    res.json({
      message: 'Ships verileri başarıyla alındı.',
      ships: ships.recordset.map(ship => ({
        IMO_Number: ship.IMO_Number || 'Bilinmiyor',
        Flag_State: ship.Flag_State || 'Belirtilmemiş',
        Owner_Info: ship.Owner_Info || 'Bilinmiyor',
        Ship_Type: ship.Ship_Type || 'Bilinmiyor',
        Photo: ship.Photo || 'Görsel Yok',
        Status: ship.Status || 'Durum Yok',
      })),
    });
  } catch (error) {
    console.error('Ships API sırasında hata oluştu:', error.message);
    res.status(500).send('Sunucuda bir hata oluştu.');
  }
});


app.post('/addShip', async (req, res) => {
  try {
    const { IMO_Number, Flag_State, Owner_Info, Ship_Type, Photo, Status } = req.body;

    const pool = await connectToDatabase();
    await pool.request()
      .input('IMO_Number', sql.VarChar, IMO_Number)
      .input('Flag_State', sql.VarChar, Flag_State)
      .input('Owner_Info', sql.VarChar, Owner_Info)
      .input('Ship_Type', sql.VarChar, Ship_Type)
      .input('Photo', sql.VarChar, Photo)
      .input('Status', sql.VarChar, Status)
      .query(`
              INSERT INTO Ships (IMO_Number, Flag_State, Owner_Info, Ship_Type, Photo, Status)
              VALUES (@IMO_Number, @Flag_State, @Owner_Info, @Ship_Type, @Photo, @Status)
          `);

    res.status(200).send('Gemi başarıyla eklendi.');
  } catch (error) {
    console.error('Gemi eklenirken hata:', error);
    res.status(500).send('Sunucuda bir hata oluştu.');
  }
});

app.delete('/deleteShip/:imoNumber', async (req, res) => {
  const { imoNumber } = req.params;

  try {
    const pool = await connectToDatabase();
    const result = await pool
      .request()
      .input('IMO_Number', sql.VarChar, imoNumber)
      .query('DELETE FROM Ships WHERE IMO_Number = @IMO_Number');

    if (result.rowsAffected[0] > 0) {
      res.status(200).send({ message: 'Gemi başarıyla silindi.' });
    } else {
      res.status(404).send({ message: 'Gemi bulunamadı.' });
    }
  } catch (error) {
    console.error('Silme sırasında hata oluştu:', error.message);
    res.status(500).send({ message: 'Sunucuda bir hata oluştu.' });
  }
});

app.get('/api/inspections', async (req, res) => {
  try {
    let pool = await sql.connect(config);
    let result = await pool.request().query('SELECT * FROM dbo.Inspections');
    console.log('Veriler:', result.recordset); // Verileri konsola yazdırın
    res.status(200).json(result.recordset); // JSON formatında yanıt döndürün
  } catch (error) {
    console.error('Hata:', error.message); // Hataları konsola yazdır
    res.status(500).send('Veriler alınamadı: ' + error.message);
  }
});



app.post('/addInspection', async (req, res) => {
  const { IMO_Number, Inspection_Date, Inspection_Type, Inspection_Result } = req.body;

  if (!IMO_Number || !Inspection_Date || !Inspection_Type || !Inspection_Result) {
    return res.status(400).send('Tüm alanlar doldurulmalıdır.');
  }

  try {
    // Veritabanı ekleme işlemi
    const pool = await connectToDatabase();
    await pool.request()
      .input('IMO_Number', IMO_Number)
      .input('Inspection_Date', Inspection_Date)
      .input('Inspection_Type', Inspection_Type)
      .input('Inspection_Result', Inspection_Result)
      .query(`INSERT INTO Inspections (IMO_Number, Inspection_Date, Inspection_Type, Inspection_Result) 
                  VALUES (@IMO_Number, @Inspection_Date, @Inspection_Type, @Inspection_Result)`);

    res.status(200).send('Denetim başarıyla eklendi!');
  } catch (error) {
    console.error('Hata:', error);
    res.status(500).send('Sunucu hatası.');
  }
});







// Sunucuyu başlat
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor...`);
});
