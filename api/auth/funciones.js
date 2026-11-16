
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const { SALT_ROUNDS, TOKEN_SECRET } = process.env;

// ENCRIPTAR CONTRASEÑA
async function hashPass(passNueva) {
    const hash = await bcrypt.hash(
        passNueva,
        parseInt(SALT_ROUNDS)
    );

    return hash;
}

// VERIFICAR CONTRASEÑA
async function verificarPass(passNueva, passHash) {
    const coincide = await bcrypt.compare(
        passNueva,
        passHash
    );

    return coincide;
}

// CREAR TOKEN
function crearToken(user) {
    const payload = {
        id: user.Id_usuario,
        nombre: user.nombre,
        rol: user.rol
    };

    const token = jwt.sign(payload, TOKEN_SECRET, {
        expiresIn: "2h"
    });

    return token;
}

module.exports = {
    hashPass,
    verificarPass,
    crearToken
};
