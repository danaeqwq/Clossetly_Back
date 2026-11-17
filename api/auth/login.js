const router = require("express").Router();

const { verificarPass, crearToken } = require("./funciones");
const db = require("../../config/db");

router.post("/", (req, res) => {
    const { correo, pass } = req.body;

    const consulta = `
        SELECT Id_usuario, nombre, correo, contraseña, rol
        FROM usuarios
        WHERE correo = ?
    `;

    db.query(consulta, [correo])
        .then(async ([resultados]) => {
            if (resultados.length === 0) {
                return res.status(401).json({
                    mensaje: "Correo o contraseña incorrectos"
                });
            }
            const usuario = resultados[0];
            const coincide = await verificarPass(
                pass,
                usuario.contraseña
            );
            if (!coincide) {
                return res.status(401).json({
                    mensaje: "Correo o contraseña incorrectos"
                });
            }
            const token = crearToken(usuario);
            res.status(200).json({
                mensaje: "Inicio de sesión exitoso",
                token,
                usuario: {
                    id: usuario.Id_usuario,
                    nombre: usuario.nombre,
                    correo: usuario.correo,
                    rol: usuario.rol
                }
            });
        })
        .catch((error) => {
            console.error("Error al iniciar sesión:", error);
            res.status(500).json({
                mensaje: "Error al iniciar sesión"
            });
        });
});
module.exports = router;
