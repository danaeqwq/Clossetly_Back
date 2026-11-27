const router = require("express").Router();

const db = require("../../config/db");
const { hashPass } = require("./funciones");

router.post("/", (req, res) => {
    const { nombre, correo, pass, telefono } = req.body;
    if (!nombre || !correo || !pass || !telefono) {
        return res.status(400).json({
            mensaje: "Todos los campos son obligatorios"
        });
    }
    const nombreLimpio = nombre.trim();
    const correoLimpio = correo.trim();
    const telefonoLimpio = telefono.trim();

    const consultaVerificar = `
        SELECT nombre, correo
        FROM usuarios
        WHERE LOWER(nombre) = LOWER(?)
        OR LOWER(correo) = LOWER(?)
    `;

    db.query(consultaVerificar, [nombreLimpio, correoLimpio])
        .then(([resultados]) => {
            const nombreExiste = resultados.some(
                (usuario) =>
                    usuario.nombre.toLowerCase() === nombreLimpio.toLowerCase()
            );
            if (nombreExiste) {
                return res.status(409).json({
                    mensaje: "Ese nombre de usuario ya está registrado"
                });
            }
            const correoExiste = resultados.some(
                (usuario) =>
                    usuario.correo.toLowerCase() === correoLimpio.toLowerCase()
            );
            if (correoExiste) {
                return res.status(409).json({
                    mensaje: "Ese correo electrónico ya está registrado"
                });
            }

            return hashPass(pass)
                .then((hash) => {
                    const consultaInsertar = `
                        INSERT INTO usuarios
                        (nombre, correo, contraseña, rol, foto_perfil, teléfono, estado_usuario)
                        VALUES (?, ?, ?, 'Usuario', '/uploads/perfiles/fotoUsuario1.png', ?, 1)
                    `;

                    return db.query(consultaInsertar, [
                        nombreLimpio,
                        correoLimpio,
                        hash,
                        telefonoLimpio
                    ]);
                });
        })
        .then((resultado) => {
            if (!resultado) return;

            const [datos] = resultado;

            res.status(201).json({
                mensaje: "Usuario registrado correctamente",
                id: datos.insertId
            });
        })
        .catch((error) => {
            console.error("Error al registrar usuario:", error);

            if (error.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    mensaje: "El nombre de usuario o correo ya está registrado"
                });
            }

            res.status(500).json({
                mensaje: "Error al registrar usuario"
            });
        });
});

module.exports = router;