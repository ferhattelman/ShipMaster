/***** server.js *****/
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { connectToDatabase } = require('./dbConnection');
const sql = require('mssql');
const config = require('./dbconfig');

// ** 1) Multer paketini projeye eklediğinizi varsayıyoruz **
// npm install multer
const multer = require('multer');

// ** 2) Multer için depolama ayarları (fotoğrafları 'uploads' klasörüne kaydedecek) **
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Dosyaların kaydedileceği klasör
  },
  filename: (req, file, cb) => {
    // Benzersiz bir dosya adı oluşturmak için tarih ve rastgele sayı
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    // Orijinal dosya uzantısını korumak için path.extname kullanıyoruz
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// ** 3) Multer middleware'ini oluştur **
const upload = multer({ storage });

const app = express();

// ** Middleware **
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ** EJS Ayarları **
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, '')));

// ** Statik dosyaları src/assets klasöründen sun **
app.use('/assets', express.static(path.join(__dirname, 'src/assets')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// ** Giriş Sayfası **
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ** HomePage (EJS) **
app.get('/home', async (req, res) => {
  try {
    const pool = await connectToDatabase();

    // Ships verilerini al
    const shipsResult = await pool.request().query(`
      SELECT S.ShipId, S.ShipName, O.Name AS OwnerName, S.PhotoURL, S.LaunchDate, S.CountryCode
      FROM Ships S
      JOIN ShipOwners O ON S.ShipOwnerId = O.ShipOwnerId
      
    `);

    // Countries verilerini al
    const countriesResult = await pool.request().query('SELECT CountryCode, CountryName FROM Countries');

    const ships = shipsResult.recordset;

    const countries = countriesResult.recordset;

    // homePage.ejs dosyasına veri gönder
    res.render('homePage', { ships, countries });
  } catch (error) {
    console.error('Home Page Hatası:', error.message);
    res.status(500).send('Sunucuda bir hata oluştu.');
  }
});

// ** ShipOwners verisi (JSON) **
app.get('/owners', async (req, res) => {
  try {
    const pool = await connectToDatabase();

    // ShipOwners verisini Countries tablosu ile birleştirerek alın
    const ownersResult = await pool.request().query(`
      SELECT
  O.ShipOwnerId,
  O.Name,
  O.IsPerson,
  O.Address,
  O.CountryCode,
  C.CountryName,
  O.Phone,
  O.PhotoURL
FROM ShipOwners O
JOIN Countries C ON O.CountryCode = C.CountryCode

    `);

    const owners = ownersResult.recordset.map(owner => ({
      ShipOwnerId: owner.ShipOwnerId, // <--- Bunu ekleyin
      Name: owner.Name || 'Unknown',
      IsPerson: owner.IsPerson,
      Address: owner.Address || 'No Address Provided',
      CountryCode: owner.CountryCode || 'N/A',
      CountryName: owner.CountryName || 'Unknown',
      Phone: owner.Phone || 'N/A',
      PhotoURL: owner.PhotoURL || 'https://via.placeholder.com/100',
    }));


    // JSON formatında owners verisini döndür
    res.json({ owners });
  } catch (error) {
    console.error('Owners API sırasında hata oluştu:', error.message);
    res.status(500).json({ message: 'Sunucuda bir hata oluştu.' });
  }
});

// ** Countries verisi (JSON) **
app.get('/countries', async (req, res) => {
  try {
    const pool = await connectToDatabase(); // Veritabanı bağlantısını kur
    const result = await pool.request().query('SELECT CountryCode, CountryName FROM Countries ORDER BY CountryName');
    res.json(result.recordset); // Ülkeleri JSON formatında döndür
  } catch (error) {
    console.error('Countries API Hatası:', error.message);
    res.status(500).send('Sunucuda bir hata oluştu.');
  }
});

// ** Multer ile fotoğrafı da alacak şekilde Owner Ekleme **
app.post('/add-owner', upload.single('photo'), async (req, res) => {
  try {
    console.log('Form verileri (req.body):', req.body);
    console.log('Dosya bilgisi (req.file):', req.file);

    const { name, phone, email, country, address, isPerson } = req.body;

    const pool = await connectToDatabase();
    await pool.request()
      .input('Name', name)
      .input('Phone', phone)
      .input('Email', email)
      .input('CountryCode', country)
      .input('Address', address)
      .input('IsPerson', isPerson === 'true')
      .input('PhotoURL', req.file ? `/uploads/${req.file.filename}` : null)
      .query(`
        INSERT INTO ShipOwners (Name, Phone, Email, CountryCode, Address, IsPerson, PhotoURL)
        VALUES (@Name, @Phone, @Email, @CountryCode, @Address, @IsPerson, @PhotoURL)
      `);

    // Kaydetme başarılı olduğunda /home sayfasına yönlendirelim:
    res.redirect('/home');
  } catch (error) {
    console.error('Add Owner Hatası:', error.message);
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

app.get('/owner/:id', async (req, res) => {
  try {
    const ownerId = req.params.id;
    const pool = await connectToDatabase();

    // Owner bilgilerini alın
    const ownerResult = await pool.request()
      .input('OwnerId', ownerId)
      .query(`
        SELECT 
          O.ShipOwnerId,
          O.Name,
          O.IsPerson,
          O.Email,
          O.Phone,
          O.Address,
          O.CountryCode,
          O.PhotoURL,
          C.CountryName
        FROM ShipOwners O
        JOIN Countries C ON O.CountryCode = C.CountryCode
        WHERE O.ShipOwnerId = @OwnerId
      `);

    if (ownerResult.recordset.length === 0) {
      return res.status(404).send('Owner not found');
    }

    const owner = ownerResult.recordset[0];

    // Sahip olunan gemileri alın
    const shipsResult = await pool.request()
      .input('OwnerId', ownerId)
      .query(`
        SELECT ShipId, IMONumber, ShipName, PhotoURL, LaunchDate
        FROM Ships
        WHERE ShipOwnerId = @OwnerId
      `);

    const ships = shipsResult.recordset;

    // Countries verisini alın
    const countriesResult = await pool.request()
      .query('SELECT CountryCode, CountryName FROM Countries ORDER BY CountryName');
    const countries = countriesResult.recordset;

    // ownerDetail.ejs dosyasına veri gönder
    res.render('ownerDetail', { owner, ships, countries });
  } catch (error) {
    console.error('Error fetching owner details:', error.message);
    res.status(500).send('Sunucuda bir hata oluştu.');
  }
});

app.get('/owner/:id', async (req, res) => {
  try {
    const ownerId = req.params.id; // Parametre olarak gönderilen ID
    const pool = await connectToDatabase();

    // Owner bilgilerini al
    const ownerResult = await pool.request()
      .input('OwnerId', sql.Int, ownerId)
      .query('SELECT * FROM ShipOwners WHERE ShipOwnerId = @OwnerId');
    const owner = ownerResult.recordset[0];

    if (!owner) {
      return res.status(404).send('Owner not found');
    }

    // Gemileri al (OwnerId'ye göre filtreleme)
    const shipsResult = await pool.request()
      .input('OwnerId', sql.Int, ownerId)
      .query(`
        SELECT * FROM Ships
        WHERE ShipOwnerId = @OwnerId
      `);
    const ships = shipsResult.recordset;

    // Owner profil sayfasına yönlendir
    res.render('ownerProfile', { owner, ships });
  } catch (error) {
    console.error('Owner gemileri getirilirken hata oluştu:', error);
    res.status(500).send('Sunucuda bir hata oluştu.');
  }
});

app.post('/add-ship', upload.single('photo'), async (req, res) => {
  try {
    const { shipName, imoNumber, launchDate, countryCode, ownerId, shipTypeId } = req.body;
    const photoURL = req.file ? `/uploads/${req.file.filename}` : null;

    const pool = await connectToDatabase();

    await pool.request()
      .input('ShipName', shipName)
      .input('IMONumber', imoNumber)
      .input('LaunchDate', launchDate)
      .input('CountryCode', countryCode)
      .input('ShipOwnerId', ownerId)
      .input('ShipTypeId', shipTypeId) // ShipTypeId burada ekleniyor
      .input('PhotoURL', photoURL)
      .query(`
              INSERT INTO Ships (ShipName, IMONumber, LaunchDate, CountryCode, ShipOwnerId, ShipTypeId, PhotoURL)
              VALUES (@ShipName, @IMONumber, @LaunchDate, @CountryCode, @ShipOwnerId, @ShipTypeId, @PhotoURL)
          `);

    res.redirect(`/owner/${ownerId}`);
  } catch (error) {
    console.error('Add Ship Hatası:', error.message);
    res.status(500).send('Sunucuda bir hata oluştu.');
  }
});


app.get('/ship-types', async (req, res) => {
  try {
    const pool = await connectToDatabase();

    // ShipTypes verilerini al
    const result = await pool.request().query(`
          SELECT ShipTypeId, ShipTypeName, Description FROM ShipTypes ORDER BY ShipTypeName
      `);

    res.json(result.recordset); // JSON formatında döndür
  } catch (error) {
    console.error('ShipTypes API Hatası:', error.message);
    res.status(500).send('Sunucuda bir hata oluştu.');
  }
});


app.get('/ship/:id', async (req, res) => {
  try {
    const shipId = parseInt(req.params.id); // Gelen ID'yi integer'a çevir
    if (isNaN(shipId)) {
      return res.status(400).send('Invalid ShipId parameter.');
    }

    const pool = await connectToDatabase();

    // Gemi detaylarını al
    const shipResult = await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query(`
        SELECT 
          S.ShipId, S.ShipName, S.IMONumber, S.LaunchDate, S.PhotoURL, 
          ST.ShipTypeName AS Type, C.CountryName, O.ShipOwnerId, O.Name AS OwnerName, 
          O.Phone AS OwnerPhone, O.Address AS OwnerAddress, O.PhotoURL AS OwnerPhoto
        FROM Ships S
        LEFT JOIN ShipTypes ST ON S.ShipTypeId = ST.ShipTypeId
        LEFT JOIN Countries C ON S.CountryCode = C.CountryCode
        LEFT JOIN ShipOwners O ON S.ShipOwnerId = O.ShipOwnerId
        WHERE S.ShipId = @ShipId
      `);

    if (shipResult.recordset.length === 0) {
      return res.status(404).send('Ship not found.');
    }

    const ship = shipResult.recordset[0];

    // Owner bilgilerini doğrudan alıyoruz
    const owner = {
      ShipOwnerId: ship.ShipOwnerId,
      Name: ship.OwnerName,
      Phone: ship.OwnerPhone,
      Address: ship.OwnerAddress,
      PhotoURL: ship.OwnerPhoto,
      CountryName: ship.CountryName,
    };

    // shipDetails.ejs'ye ship ve owner bilgilerini gönder
    res.render('shipDetails', { ship, owner });
  } catch (error) {
    console.error('Ship Details Error:', error.message);
    res.status(500).send('An error occurred on the server.');
  }
});

app.get('/ship/:id/equipments', async (req, res) => {
  try {
    const shipId = parseInt(req.params.id);

    if (isNaN(shipId)) {
      return res.status(400).send('Invalid ShipId parameter.');
    }

    const pool = await connectToDatabase();

    // ShipEquipments SQL sorgusu
    const equipmentResult = await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query(`
        SELECT 
          E.EquipmentName,
          C.CategoryName AS Category,
          E.AdditionDate,
          E.LastMaintenanceDate,
          E.NextMaintenanceDate,
          E.Status
        FROM ShipEquipments E
        JOIN ShipEquipmentCategories C ON E.EquipmentCategoryId = C.ShipEquipmentCategoryId
        WHERE E.ShipId = @ShipId
        ORDER BY E.EquipmentName
      `);

    const shipNameResult = await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query('SELECT ShipName FROM Ships WHERE ShipId = @ShipId');

    const shipName = shipNameResult.recordset[0]?.ShipName || 'Unknown Ship';

    res.render('equipmentList', {
      equipments: equipmentResult.recordset,
      shipName
    });
  } catch (error) {
    console.error('Error fetching equipments:', error.message);
    res.status(500).send('An error occurred while fetching equipments.');
  }
});



app.get('/ships', async (req, res) => {
  try {
    const pool = await connectToDatabase();

    // Ships verisini alın
    const shipsResult = await pool.request().query(`
      SELECT ShipId, ShipName, PhotoURL, CountryCode, LaunchDate
      FROM Ships
    `);
    const ships = shipsResult.recordset;

    // Countries verisini alın
    const countriesResult = await pool.request().query(`
      SELECT CountryCode, CountryName
      FROM Countries
    `);
    const countries = countriesResult.recordset;

    // `ships` ve `countries` verisini EJS dosyasına gönder
    res.render('homePage', { ships, countries });
  } catch (error) {
    console.error('Error fetching data:', error.message);
    res.status(500).send('An error occurred.');
  }
});

app.put('/ship/:id/edit', async (req, res) => {
  console.log('Request Body:', req.body); // Gelen veriyi kontrol edin

  const shipId = parseInt(req.params.id);
  const { imoNumber, shipName, flagState } = req.body;

  if (!shipName) {
    return res.status(400).json({ success: false, message: 'Ship name is required.' });
  }

  try {
    const pool = await connectToDatabase();

    await pool.request()
      .input('ShipId', sql.Int, shipId)
      .input('IMONumber', sql.VarChar, imoNumber)
      .input('ShipName', sql.VarChar, shipName) // Buradaki 'shipName' değerini kontrol edin
      .input('FlagState', sql.VarChar, flagState)
      .query(`
        UPDATE Ships
        SET IMONumber = @IMONumber,
            ShipName = @ShipName,
            CountryCode = @FlagState
        WHERE ShipId = @ShipId
      `);

    res.json({ success: true, message: 'Ship updated successfully.' });
  } catch (error) {
    console.error('Error updating ship:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update ship.' });
  }
});


app.delete('/ship/:id/delete', async (req, res) => {
  const shipId = parseInt(req.params.id);

  try {
    const pool = await connectToDatabase();
    await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query(`
        DELETE FROM MaintenanceRecords
        WHERE ShipEquipmentId IN (
            SELECT ShipEquipmentId 
            FROM ShipEquipments 
            WHERE ShipId = @ShipId
        )
    `);
    await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query(`
        DELETE FROM ShipEquipments
        WHERE ShipId = @ShipId
    `);
    await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query('DELETE FROM InspectionRecords WHERE ShipId = @ShipId');

    await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query('DELETE FROM Ships WHERE ShipId = @ShipId');

    res.json({ success: true, message: 'Ship deleted successfully.' });
  } catch (error) {
    console.error('Error deleting ship:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete ship.' });
  }
});

app.get('/countries', async (req, res) => {
  try {
    const pool = await connectToDatabase();
    const result = await pool.request().query(`
      SELECT CountryCode, CountryName FROM Countries
    `);
    res.json(result.recordset);
  } catch (error) {
    console.error('Error fetching countries:', error.message);
    res.status(500).send('Failed to fetch countries.');
  }
});

app.put('/owner/:id/edit', async (req, res) => {
  const ownerId = parseInt(req.params.id);
  const { name, phone, email, address, country } = req.body;

  try {
    const pool = await connectToDatabase();

    await pool.request()
      .input('ShipOwnerId', sql.Int, ownerId)
      .input('Name', sql.VarChar, name)
      .input('Phone', sql.VarChar, phone)
      .input('Email', sql.VarChar, email)
      .input('Address', sql.VarChar, address)
      .input('CountryCode', sql.VarChar, country)
      .query(`
              UPDATE ShipOwners
              SET Name = @Name,
                  Phone = @Phone,
                  Email = @Email,
                  Address = @Address,
                  CountryCode = @CountryCode
              WHERE ShipOwnerId = @ShipOwnerId
          `);

    res.json({ success: true, message: 'Owner updated successfully.' });
  } catch (error) {
    console.error('Error updating owner:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update owner.' });
  }
});


app.delete('/owner/:id', async (req, res) => {
  const ownerId = parseInt(req.params.id);

  try {
    const pool = await connectToDatabase();

    await pool.request()
      .input('ShipOwnerId', sql.Int, ownerId)
      .query(`
              DELETE FROM ShipOwners
              WHERE ShipOwnerId = @ShipOwnerId
          `);

    res.json({ success: true, message: 'Owner deleted successfully.' });
  } catch (error) {
    console.error('Error deleting owner:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete owner.' });
  }
});




// Equipment 

app.get('/equipments/:shipId', async (req, res) => {
  try {
    const shipId = parseInt(req.params.shipId);

    if (isNaN(shipId)) {
      return res.status(400).send('Invalid ShipId parameter.');
    }

    const pool = await connectToDatabase();

    // Ekipmanları al
    const equipmentResult = await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query(`
        SELECT 
          E.ShipEquipmentId AS EquipmentId,
          E.EquipmentName,
          C.CategoryName AS Category,
          E.Description,
          E.AdditionDate,
          E.Status
        FROM ShipEquipments E
        JOIN ShipEquipmentCategories C ON E.ShipEquipmentCategoryId = C.ShipEquipmentCategoryId
        WHERE E.ShipId = @ShipId
        ORDER BY E.AdditionDate DESC
      `);

    // Tüm kategorileri al
    const categoriesResult = await pool.request()
      .query('SELECT ShipEquipmentCategoryId, CategoryName FROM ShipEquipmentCategories ORDER BY CategoryName');

    const shipNameResult = await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query('SELECT ShipName FROM Ships WHERE ShipId = @ShipId');

    const shipName = shipNameResult.recordset[0]?.ShipName || 'Unknown Ship';

    // Verileri frontend'e gönder
    res.render('equipmentList', {
      equipments: equipmentResult.recordset,
      categories: categoriesResult.recordset, // Kategorileri ekledik
      shipId,
      shipName,
    });
  } catch (error) {
    console.error('Error fetching equipments:', error.message);
    res.status(500).send('An error occurred while fetching equipments.');
  }
});


app.post('/add-equipment', upload.none(), async (req, res) => {
  try {
    const { shipId, equipmentName, category, description, additionDate, status } = req.body;

    const pool = await connectToDatabase();
    await pool.request()
      .input('ShipId', sql.Int, shipId)
      .input('EquipmentName', sql.VarChar, equipmentName)
      .input('ShipEquipmentCategoryId', sql.Int, category) // Kategori ID'si kullanılıyor
      .input('Description', sql.Text, description)
      .input('AdditionDate', sql.Date, additionDate)
      .input('Status', sql.Bit, status === 'true')
      .query(`
        INSERT INTO ShipEquipments (ShipId, EquipmentName, ShipEquipmentCategoryId, Description, AdditionDate, Status)
        VALUES (@ShipId, @EquipmentName, @ShipEquipmentCategoryId, @Description, @AdditionDate, @Status)
      `);

    res.status(200).send('Equipment added successfully.');
  } catch (error) {
    console.error('Error adding equipment:', error);
    res.status(500).send('Failed to add equipment.');
  }
});

app.get('/equipment-details/:id', async (req, res) => {
  const equipmentId = req.params.id; // URL parameter for equipment ID

  try {
    const pool = await connectToDatabase();

    // Query to fetch equipment details
    const equipmentQuery = `
          SELECT 
              e.EquipmentName, 
              c.CategoryName AS Category, 
              c.ShipEquipmentCategoryId AS CategoryId, -- Bu alan gerekli
              e.Description, 
              e.AdditionDate, 
              e.Status,
              e.ShipEquipmentId
          FROM dbo.ShipEquipments e
          JOIN dbo.ShipEquipmentCategories c 
              ON e.ShipEquipmentCategoryId = c.ShipEquipmentCategoryId
          WHERE e.ShipEquipmentId = @equipmentId
      `;
    const equipmentResult = await pool.request()
      .input('equipmentId', sql.Int, equipmentId)
      .query(equipmentQuery);

    const equipment = equipmentResult.recordset[0];

    if (!equipment) {
      return res.status(404).render('error', { message: 'Ekipman bulunamadı.' });
    }

    // Query to fetch maintenance records for the equipment
    const maintenanceQuery = `
          SELECT 
              m.MaintenanceRecordId,
              m.ShipEquipmentId,
              e.EquipmentName,
              c.CategoryName AS Category,
              m.Description,
              CASE WHEN m.Status = 1 THEN 'Completed' ELSE 'Planned' END AS Status,
              m.Time
          FROM dbo.MaintenanceRecords m
          JOIN dbo.ShipEquipments e 
              ON m.ShipEquipmentId = e.ShipEquipmentId
          JOIN dbo.ShipEquipmentCategories c
              ON e.ShipEquipmentCategoryId = c.ShipEquipmentCategoryId
          WHERE m.ShipEquipmentId = @equipmentId
          ORDER BY m.Time DESC;
      `;
    const maintenanceResult = await pool.request()
      .input('equipmentId', sql.Int, equipmentId)
      .query(maintenanceQuery);

    const maintenanceRecords = maintenanceResult.recordset;

    // Fetch all categories
    const categoriesQuery = `
          SELECT ShipEquipmentCategoryId, CategoryName
          FROM dbo.ShipEquipmentCategories
          ORDER BY CategoryName
      `;
    const categoriesResult = await pool.request().query(categoriesQuery);
    const categories = categoriesResult.recordset;

    // Render the EJS template with the fetched data
    res.render('equipmentDetails', {
      equipment,
      maintenanceRecords,
      categories // Bunu ekleyin
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).render('error', { message: 'Bir hata oluştu.', error: error.message });
  }
});


app.post('/add-maintenance', async (req, res) => {
  console.log('Request Body:', req.body); // Gelen verileri kontrol edin
  const { time, description, shipEquipmentId } = req.body;

  if (!shipEquipmentId || !time || !description) {
    console.error('Missing fields:', { shipEquipmentId, time, description });
    return res.status(400).json({ message: 'All fields are required: shipEquipmentId, time, description.' });
  }

  try {
    const pool = await connectToDatabase();
    const query = `
          INSERT INTO dbo.MaintenanceRecords (ShipEquipmentId, Description, Status, Time)
          VALUES (@shipEquipmentId, @description, 0, @time)
      `;
    await pool.request()
      .input('shipEquipmentId', sql.Int, shipEquipmentId)
      .input('description', sql.NVarChar, description)
      .input('time', sql.DateTime, new Date(time))
      .query(query);

    console.log('Maintenance added successfully.');
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error adding maintenance:', error.message);
    res.status(500).json({ message: 'Failed to add maintenance.' });
  }
});

app.delete('/delete-maintenance/:id', async (req, res) => {
  try {
    const maintenanceId = req.params.id;
    const pool = await connectToDatabase();
    await pool.request()
      .input('MaintenanceRecordId', sql.Int, maintenanceId)
      .query('DELETE FROM MaintenanceRecords WHERE MaintenanceRecordId = @MaintenanceRecordId');
    res.status(200).json({ success: true, message: 'Maintenance record deleted successfully!' });
  } catch (error) {
    console.error('Error deleting maintenance:', error.message);
    res.status(500).json({ success: false, message: 'Failed to delete maintenance record.' });
  }
});

// Update Equipment API
app.put('/update-equipment', async (req, res) => {
  console.log('Request Body:', req.body); // Gelen veriyi kontrol et
  const { equipmentId, equipmentName, category, description, status } = req.body;

  if (!equipmentId || !equipmentName || !category || !description || status === undefined) {
    console.error('Missing fields:', { equipmentId, equipmentName, category, description, status });
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }

  try {
    const pool = await connectToDatabase();
    await pool.request()
      .input('equipmentId', sql.Int, equipmentId)
      .input('equipmentName', sql.VarChar, equipmentName)
      .input('category', sql.Int, category)
      .input('description', sql.Text, description)
      .input('status', sql.Bit, status)
      .query(`
              UPDATE ShipEquipments
              SET EquipmentName = @equipmentName,
                  ShipEquipmentCategoryId = @category,
                  Description = @description,
                  Status = @status
              WHERE ShipEquipmentId = @equipmentId
          `);

    console.log('Equipment updated successfully.');
    res.status(200).json({ success: true, message: 'Equipment updated successfully.' });
  } catch (error) {
    console.error('SQL Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update equipment.' });
  }
});






//Maintenances

app.get('/maintenancesList/:shipId', async (req, res) => {
  try {
    const shipId = parseInt(req.params.shipId);

    if (isNaN(shipId)) {
      return res.status(400).send('Invalid ShipId parameter.');
    }

    const pool = await connectToDatabase();

    // MaintenanceRecords and related data
    const maintenanceResult = await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query(`
        SELECT 
          M.MaintenanceRecordId,
          M.[Description],
          M.[Status],
          CONVERT(DATE, M.[Time]) AS [Date],        -- Date part
          CONVERT(TIME, M.[Time]) AS [Time],        -- Time part
          E.EquipmentName,
          C.CategoryName AS Category
        FROM MaintenanceRecords M
        JOIN ShipEquipments E ON M.ShipEquipmentId = E.ShipEquipmentId
        JOIN ShipEquipmentCategories C ON E.ShipEquipmentCategoryId = C.ShipEquipmentCategoryId
        WHERE E.ShipId = @ShipId
        ORDER BY M.[Time] DESC
      `);

    // Ship name
    const shipNameResult = await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query('SELECT ShipName FROM Ships WHERE ShipId = @ShipId');

    const shipName = shipNameResult.recordset[0]?.ShipName || 'Unknown Ship';

    // Equipment list
    const equipmentsQuery = `
      SELECT 
        ShipEquipmentId, 
        EquipmentName 
      FROM dbo.ShipEquipments
      WHERE ShipId = @ShipId
      ORDER BY EquipmentName
    `;
    const equipmentsResult = await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query(equipmentsQuery);

    const equipments = equipmentsResult.recordset;

    // Categories
    const categoriesQuery = `
      SELECT 
        ShipEquipmentCategoryId, 
        CategoryName 
      FROM dbo.ShipEquipmentCategories 
      ORDER BY CategoryName
    `;
    const categoriesResult = await pool.request().query(categoriesQuery);
    const categories = categoriesResult.recordset;

    // Render the EJS view with the fetched data
    res.render('maintenancesList', {
      maintenances: maintenanceResult.recordset, // Maintenance records
      shipId,
      shipName,
      categories, // Categories for dropdown
      equipments  // Equipments for dropdown
    });

  } catch (error) {
    console.error('Error fetching maintenance records:', error.message);
    res.status(500).send('An error occurred while fetching maintenance records.');
  }
});


app.delete('/maintenances/delete/:id', async (req, res) => {
  const maintenanceId = parseInt(req.params.id); // URL'den MaintenanceRecordId al

  if (isNaN(maintenanceId)) {
    return res.status(400).send('Invalid MaintenanceRecordId parameter.');
  }

  try {
    const pool = await connectToDatabase(); // MSSQL bağlantısını başlat
    await pool.request()
      .input('MaintenanceRecordId', sql.Int, maintenanceId)
      .query('DELETE FROM MaintenanceRecords WHERE MaintenanceRecordId = @MaintenanceRecordId');

    res.status(200).send('Maintenance record deleted successfully.');
  } catch (error) {
    console.error('Error deleting maintenance record:', error.message);
    res.status(500).send('An error occurred while deleting the maintenance record.');
  }
});


app.put('/update-maintenance/:id', async (req, res) => {
  const maintenanceId = req.params.id;
  const { description, status } = req.body;

  // Alanların doğruluğunu kontrol et
  if (!maintenanceId || !description || status === undefined) {
    return res.status(400).json({ message: 'Description and status are required.' });
  }

  try {
    const pool = await connectToDatabase();

    // MaintenanceRecords tablosunda description ve status güncelleniyor
    const updateQuery = `
      UPDATE dbo.MaintenanceRecords
      SET 
        Description = @description,
        Status = @status
      WHERE MaintenanceRecordId = @maintenanceId
    `;
    await pool.request()
      .input('maintenanceId', sql.Int, maintenanceId)
      .input('description', sql.NVarChar, description)
      .input('status', sql.Bit, status ? 1 : 0)
      .query(updateQuery);

    res.status(200).json({ success: true, message: 'Maintenance record updated successfully.' });
  } catch (error) {
    console.error('Error updating maintenance record:', error.message);
    res.status(500).json({ message: 'Failed to update maintenance record.' });
  }
});


//Inspections 

app.get('/inspections/:shipId', async (req, res) => {
  const { shipId } = req.params;

  try {
    const pool = await connectToDatabase();
    const result = await pool.request()
      .input('ShipId', sql.Int, shipId)
      .query(`
        SELECT 
            IR.Time,
            IT.TypeName AS InspectionType, -- InspectionTypes tablosundan TypeName
            IT.Description AS TypeDescription, -- InspectionTypes tablosundan Description
            IR.Serious, -- InspectionRecords tablosundan Serious
            IR.InspectionRecordId
        FROM dbo.InspectionRecords IR
        JOIN dbo.InspectionTypes IT ON IR.InspectionTypeId = IT.InspectionTypeId -- İlişkilendirme
        WHERE IR.ShipId = @ShipId
      `);

    console.log('Fetched Inspections:', result.recordset); // Debugging için veriyi yazdır

    res.render('inspectionsList', {
      shipId,
      inspections: result.recordset
    });
  } catch (err) {
    console.error('Error fetching inspections:', err.message); // Hata mesajını kontrol et
    res.status(500).send('An error occurred while fetching inspections.');
  }
});





app.post('/add-inspection', async (req, res) => {
  const { shipId, time, inspectionTypeId } = req.body;

  try {
    const pool = await connectToDatabase();
    await pool.request()
      .input('ShipId', sql.Int, shipId)
      .input('Time', sql.DateTime, new Date(time))
      .input('InspectionTypeId', sql.Int, inspectionTypeId)
      .query(`
        INSERT INTO dbo.InspectionRecords (ShipId, Time, InspectionTypeId)
        VALUES (@ShipId, @Time, @InspectionTypeId);
      `);

    res.redirect(`/inspections/${shipId}`);
  } catch (err) {
    console.error('Error adding inspection:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/api/inspections', async (req, res) => {
  console.log('Gelen Veriler:', req.body);

  const { shipId, time, inspectionTypeId, serious } = req.body;

  if (!shipId || !time || !inspectionTypeId || !serious) {
    console.error('Eksik Alanlar:', { shipId, time, inspectionTypeId, serious });
    return res.status(400).json({ message: 'All fields are required: shipId, time, inspectionTypeId, serious.' });
  }

  try {
    const pool = await connectToDatabase();
    await pool.request()
      .input('ShipId', sql.Int, shipId)
      .input('Time', sql.DateTime, new Date(time))
      .input('InspectionTypeId', sql.Int, inspectionTypeId)
      .input('Serious', sql.NVarChar, serious) // Yeni serious alanını ekledik
      .query(`
              INSERT INTO dbo.InspectionRecords (ShipId, Time, InspectionTypeId, Serious)
              VALUES (@ShipId, @Time, @InspectionTypeId, @Serious)
          `);

    console.log('Denetim Başarıyla Eklendi:', { shipId, time, inspectionTypeId, serious });
    res.status(201).json({ message: 'Inspection added successfully.' });
  } catch (error) {
    console.error('Veritabanı Hatası:', error.message);
    res.status(500).send('Failed to add inspection.');
  }
});




app.get('/api/inspection-types', async (req, res) => {
  try {
    const pool = await connectToDatabase();
    const result = await pool.request().query(`
      SELECT InspectionTypeId, TypeName 
      FROM dbo.InspectionTypes
    `);
    res.json(result.recordset); // InspectionTypes verilerini döndür
  } catch (error) {
    console.error('Error fetching inspection types:', error.message);
    res.status(500).send('An error occurred while fetching inspection types.');
  }
});




// Denetim kaydını sil
app.post('/delete-inspection/:id', async (req, res) => {
  const inspectionId = req.params.id;

  try {
    const pool = await connectToDatabase();
    await pool.request()
      .input('InspectionRecordId', sql.Int, inspectionId)
      .query(`
          DELETE FROM dbo.InspectionRecords
          WHERE InspectionRecordId = @InspectionRecordId;
      `);

    res.redirect('back');
  } catch (err) {
    console.error('Error deleting inspection record:', err);
    res.status(500).send('Internal Server Error');
  }
});















// ** Sunucuyu başlat **
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor...`);
});
