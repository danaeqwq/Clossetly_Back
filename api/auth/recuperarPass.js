const router = require("express").Router();
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const db = require("../../config/db");
const crypto = require("crypto");
const {
    hashCodigo,
    verificarCodigo,
    crearTokenRecuperacion,
    hashPass
} = require("./funciones");
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

router.post("/", (req, res) => {
    const { correo } = req.body;

    // VALIDAR CAMPO
    if (!correo || !correo.trim()) {
        return res.status(400).json({
            mensaje: "El correo electrónico es obligatorio"
        });
    }

    const correoLimpio = correo.trim();

    // VERIFICAR SI EL CORREO ESTÁ REGISTRADO
    const consulta = `
        SELECT Id_usuario, correo
        FROM usuarios
        WHERE LOWER(correo) = LOWER(?)
    `;

    db.query(consulta, [correoLimpio])
        .then(([resultados]) => {
            // VERIFICAR SI EL CORREO EXISTE
            if (resultados.length === 0) {
                return res.status(404).json({
                    mensaje: "El correo electrónico no está registrado"
                });
            }

            const idUsuario = resultados[0].Id_usuario;

            // GENERAR CÓDIGO ALEATORIO DE 6 DÍGITOS
            const codigo = crypto.randomInt(100000, 1000000).toString();
            // GENERAR HASH DEL CÓDIGO
            return hashCodigo(codigo)
                .then((codigoHash) => {

                    // ESTABLECER VENCIMIENTO DE 10 MINUTOS
                    const fechaExpiracion = new Date(
                        Date.now() + 10 * 60 * 1000
                    );

                    // INVALIDAR CÓDIGOS ANTERIORES
                    const actualizar = `
                        UPDATE recuperacion_password
                        SET usado = 1
                        WHERE Id_usuario = ? AND usado = 0
                    `;

                    return db.query(actualizar, [idUsuario])
                        .then(() => {

                            // GUARDAR NUEVO CÓDIGO
                            const insertar = `
                                INSERT INTO recuperacion_password
                                (Id_usuario, codigo_hash, fecha_expiracion, usado)
                                VALUES (?, ?, ?, 0)
                            `;

                            return db.query(insertar, [
                                idUsuario,
                                codigoHash,
                                fechaExpiracion
                            ]);
                        });
                })
                .then(() => {
                return transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: correoLimpio,
                    subject: "Recuperación de contraseña - Clossetly",
                    text: `Tu código de recuperación es: ${codigo}. Tiene una validez de 10 minutos.`
                });
            })
            .then(() => {
                res.status(200).json({
                    mensaje: "Se envió el código de recuperación a tu correo"
                });
            });
        })
        .catch((error) => {
            console.error("Error al generar código de recuperación:", error);

            res.status(500).json({
                mensaje: "Error al generar el código de recuperación"
            });
        });
});

router.post("/verificar", (req, res) => {
    const { correo, codigo } = req.body;

    if (!correo || !correo.trim() || !/^\d{6}$/.test(String(codigo || ""))) {
        return res.status(400).json({
            mensaje: "Ingresá un correo y un código válido de 6 dígitos"
        });
    }

    const consulta = `
        SELECT r.Id_recuperacion, r.Id_usuario,
               r.codigo_hash, r.fecha_expiracion, r.usado
        FROM recuperacion_password r
        INNER JOIN usuarios u ON r.Id_usuario = u.Id_usuario
        WHERE LOWER(u.correo) = LOWER(?)
        AND r.usado = 0
        ORDER BY r.Id_recuperacion DESC
        LIMIT 1
    `;

    db.query(consulta, [correo.trim()])
        .then(([resultados]) => {

            if (resultados.length === 0) {
                return res.status(400).json({
                    mensaje: "Código inválido o inexistente"
                });
            }

            const recuperacion = resultados[0];

            if (new Date(recuperacion.fecha_expiracion) <= new Date()) {
                return res.status(400).json({
                    mensaje: "El código ha expirado"
                });
            }

            return verificarCodigo(
                String(codigo),
                recuperacion.codigo_hash
            )
                .then((coincide) => {

                    if (!coincide) {
                        return res.status(400).json({
                            mensaje: "El código ingresado es incorrecto"
                        });
                    }

                    const actualizar = `
                        UPDATE recuperacion_password
                        SET usado = 1
                        WHERE Id_recuperacion = ?
                    `;

                    return db.query(actualizar, [
                        recuperacion.Id_recuperacion
                    ])
                        .then(() => {

                            const token = crearTokenRecuperacion(
                                recuperacion.Id_usuario,
                                recuperacion.Id_recuperacion
                            );

                            res.status(200).json({
                                mensaje: "Código verificado correctamente",
                                token: token
                            });
                        });
                });
        })
        .catch((error) => {
            console.error("Error al verificar el código:", error);

            res.status(500).json({
                mensaje: "Error al verificar el código"
            });
        });
});

router.post("/cambiar", (req, res) => {
    const { nuevaPass, confirmarPass } = req.body;

    const autorizacion = req.headers.authorization;

    if (!autorizacion || !autorizacion.startsWith("Bearer ")) {
        return res.status(401).json({
            mensaje: "No se proporcionó un token de recuperación"
        });
    }

    const token = autorizacion.split(" ")[1];

    if (!nuevaPass || !confirmarPass) {
        return res.status(400).json({
            mensaje: "Todos los campos son obligatorios"
        });
    }

    if (nuevaPass !== confirmarPass) {
        return res.status(400).json({
            mensaje: "Las contraseñas no coinciden"
        });
    }

    let datosToken;

    try {
    datosToken = jwt.verify(token, process.env.TOKEN_SECRET);
} catch (error) {
    console.log("ERROR AL VERIFICAR TOKEN:");
    console.log("Nombre:", error.name);
    console.log("Mensaje:", error.message);

    return res.status(401).json({
        mensaje: "El token es inválido o ha expirado"
    });
}

    if (
        datosToken.tipo !== "recuperacion" ||
        !datosToken.id ||
        !datosToken.idRecuperacion
    ) {
        return res.status(401).json({
            mensaje: "El token no es válido para recuperar la contraseña"
        });
    }

    const consulta = `
        SELECT Id_recuperacion, Id_usuario
        FROM recuperacion_password
        WHERE Id_recuperacion = ?
        AND Id_usuario = ?
        AND usado = 1
    `;

    db.query(consulta, [
        datosToken.idRecuperacion,
        datosToken.id
    ])
        .then(([resultados]) => {

            if (resultados.length === 0) {
                return res.status(400).json({
                    mensaje: "La recuperación ya fue utilizada o no existe"
                });
            }

            return hashPass(nuevaPass)
                .then((passHash) => {

                    const actualizar = `
                        UPDATE usuarios
                        SET contraseña = ?
                        WHERE Id_usuario = ?
                    `;

                    return db.query(actualizar, [
                        passHash,
                        datosToken.id
                    ]);
                })
                .then(() => {

                    const eliminar = `
                        DELETE FROM recuperacion_password
                        WHERE Id_recuperacion = ?
                    `;

                    return db.query(eliminar, [
                        datosToken.idRecuperacion
                    ]);
                })
                .then(() => {
                    res.status(200).json({
                        mensaje: "La contraseña se cambió correctamente"
                    });
                });
        })
        .catch((error) => {
    console.error("Error al cambiar la contraseña:", error);

    res.status(500).json({
        mensaje: "Error al cambiar la contraseña"
    });
});
});

module.exports = router;