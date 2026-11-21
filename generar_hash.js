const bcrypt = require("bcrypt");

const contraseña = "676767";

bcrypt.hash(contraseña, 10)
    .then((hash) => {
        console.log("Hash generado:", hash);
    })
    .catch((error) => {
        console.log("Error:", error);
    });