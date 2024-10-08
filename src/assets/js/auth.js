document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("loginForm");
    if (form) {
        form.addEventListener("submit", function (event) {
            event.preventDefault();

            const username = document.getElementById("username").value;
            const password = document.getElementById("password").value;

            const correctUsername = "admin";
            const correctPassword = "1234";

            if (username === correctUsername && password === correctPassword) {
                alert("Giriş başarılı!");
                window.location.href = "homePage.html";
            } else {
                alert("Kullanıcı adı veya şifre yanlış.");
            }
        });
    } else {
        console.error("Form öğesi bulunamadı.");
    }
});