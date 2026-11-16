
const router = require("express").Router();

const { hashPass } = require("./funciones");
const db = require("../../config/db");

// REGISTRAR USUARIO
router.post("/", async (req, res) => {
    const { nombre, correo, pass } = req.body;

    if (!nombre || !correo || !pass) {
        return res.status(400).json({
            mensaje: "Todos los campos son obligatorios"
        });
    }

    try {
        const hash = await hashPass(pass);

const consulta = `
    INSERT INTO usuarios (nombre, correo, contraseña, rol, foto_perfil, teléfono, estado_usuario)
    VALUES (?, ?, ?, 'Usuario', NULL, NULL, '1')
`;
        db.query(consulta, [nombre, correo, hash])
            .then(([resultado]) => {
                res.status(201).json({
                    mensaje: "Usuario registrado correctamente",
                    id: resultado.insertId
                });
            })
            .catch((error) => {
                console.error("Error al registrar usuario:", error);

                if (error.code === "ER_DUP_ENTRY") {
                    return res.status(409).json({
                        mensaje: "El correo ya está registrado"
                    });
                }

                res.status(500).json({
                    mensaje: "Error al registrar usuario"
                });
            });

    } catch (error) {
        console.error("Error al encriptar contraseña:", error);

        res.status(500).json({
            mensaje: "Error al registrar usuario"
        });
    }
});

module.exports = router;
