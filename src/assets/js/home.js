const menuItems = document.querySelectorAll(".nav-option");

        // Menü elemanlarına tıklama olayını ekle
        menuItems.forEach((item, index) => {
            item.addEventListener("click", function() {
                // Tıklanan menüye göre sayfa yönlendirmesi
                switch(index) {
                    case 0:
                        window.location.href = "homePage.html";
                        break;
                    case 1:
                        window.location.href = "shipsPage.html";
                        break;
                    case 2:
                        window.location.href = "report.html";
                        break;
                    case 3:
                        window.location.href = "institution.html";
                        break;
                    case 4:
                        window.location.href = "profile.html";
                        break;
                    case 5:
                        window.location.href = "settings.html";
                        break;
                    case 6:
                        window.location.href = "logout.html";
                        break;
                    default:
                        console.log("Geçersiz seçim.");
                }
            });
        });