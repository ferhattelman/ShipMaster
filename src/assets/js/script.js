function showSelectedShipType() {
    const selectElement = document.getElementById("shipTypeSelect");
    const selectedShipType = selectElement.value;

    // Seçili bir gemi türü varsa yönlendir, yoksa uyarı ver
    if (selectedShipType) {
        // homePage.html sayfasına seçili gemi türünü gönder
        window.location.href = `homePage.html?shipType=${encodeURIComponent(selectedShipType)}`;
    } else {
        alert("Lütfen bir gemi türü seçin.");
    }
}
