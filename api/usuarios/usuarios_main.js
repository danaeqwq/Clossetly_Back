
const router = require("express").Router();
const db = require("../../config/db");
const { hashPass, verificarPass } = require("../auth/funciones");
// GET - Obtener información de mi cuenta
router.get("/mi-cuenta", (req, res) => {
    const idUsuario = req.user.Id_usuario;

    const consulta = `
        SELECT
            u.Id_usuario,
            u.nombre,
            u.correo,
            u.foto_perfil,
            u.\`teléfono\` AS telefono,
            u.\`descripción\` AS descripcion,

            (
                SELECT COUNT(*)
                FROM publicaciones_compra pc
                INNER JOIN prendas p ON pc.id_prenda = p.id_prenda
                WHERE p.Id_usuario = u.Id_usuario
            ) +
            (
                SELECT COUNT(*)
                FROM publicaciones_intercambio pi
                INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
                WHERE p.Id_usuario = u.Id_usuario
            ) AS publicaciones,

            (
                SELECT COUNT(*)
                FROM pedidos pe
                WHERE pe.id_vendedor = u.Id_usuario
                AND pe.id_estado_pedido = 3
            ) AS ventas,

            (
                SELECT COUNT(*)
                FROM publicaciones_intercambio pi
                INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
                WHERE p.Id_usuario = u.Id_usuario
            ) AS intercambios

        FROM usuarios u
        WHERE u.Id_usuario = ?
    `;

    db.query(consulta, [idUsuario])
        .then(([resultados]) => {
            if (resultados.length === 0) {
                return res.status(404).json({
                    mensaje: "No se encontró el usuario"
                });
            }

            const usuario = resultados[0];

            res.status(200).json({
                usuario: {
                    id: usuario.Id_usuario,
                    nombre: usuario.nombre,
                    correo: usuario.correo,
                    foto_perfil: usuario.foto_perfil,
                    telefono: usuario.telefono,
                    descripcion: usuario.descripcion
                },
                estadisticas: {
                    publicaciones: usuario.publicaciones,
                    ventas: usuario.ventas,
                    intercambios: usuario.intercambios
                }
            });
        })
        .catch((error) => {
            console.error("Error al obtener mi cuenta:", error);

            res.status(500).json({
                mensaje: "Error al obtener los datos de la cuenta"
            });
        });
});
// PUT - Actualizar información de mi cuenta
router.put("/mi-cuenta", (req, res) => {
    const idUsuario = req.user.Id_usuario;
    const { nombre, telefono, descripcion } = req.body;

    if (!nombre || !nombre.trim()) {
        return res.status(400).json({
            mensaje: "El nombre de usuario es obligatorio"
        });
    }

    const consulta = `
        UPDATE usuarios
        SET
            nombre = ?,
            \`teléfono\` = ?,
            \`descripción\` = ?
        WHERE Id_usuario = ?
    `;

    db.query(consulta, [
        nombre.trim(),
        telefono || null,
        descripcion || null,
        idUsuario
    ])
        .then(() => {
            res.status(200).json({
                mensaje: "Perfil actualizado correctamente"
            });
        })
        .catch((error) => {
            console.error("Error al actualizar mi cuenta:", error);

            res.status(500).json({
                mensaje: "Error al actualizar los datos de la cuenta"
            });
        });
});

// PUT - Cambiar contraseña
router.put("/cambiar-contrasena", (req, res) => {
    const idUsuario = req.user.Id_usuario;
    const {
        contrasenaActual,
        nuevaContrasena,
        confirmarContrasena
    } = req.body;

    // 1. Validar campos obligatorios
    if (!contrasenaActual || !nuevaContrasena || !confirmarContrasena) {
        return res.status(400).json({
            mensaje: "Todos los campos son obligatorios"
        });
    }

    // 2. Verificar que las contraseñas nuevas coincidan
    if (nuevaContrasena !== confirmarContrasena) {
        return res.status(400).json({
            mensaje: "Las contraseñas nuevas no coinciden"
        });
    }

    // 3. Evitar reutilizar la contraseña actual
    if (nuevaContrasena === contrasenaActual) {
        return res.status(400).json({
            mensaje: "La nueva contraseña debe ser diferente a la actual"
        });
    }

    // 4. Obtener contraseña actual del usuario
    const consulta = `
        SELECT \`contraseña\`
        FROM usuarios
        WHERE Id_usuario = ?
    `;

    db.query(consulta, [idUsuario])
        .then(([resultados]) => {

            if (resultados.length === 0) {
                res.status(404).json({
                    mensaje: "No se encontró el usuario"
                });
                return null;
            }

            // 5. Verificar contraseña actual
            return verificarPass(
                contrasenaActual,
                resultados[0].contraseña
            );
        })
        .then((coincide) => {
            if (coincide === null) return;
            if (!coincide) {
                res.status(400).json({
                    mensaje: "La contraseña actual es incorrecta"
                });
                return null;
            }
            // 6. Encriptar nueva contraseña
            return hashPass(nuevaContrasena);
        })
        .then((nuevoHash) => {

            if (!nuevoHash) return;
            // 7. Actualizar contraseña
            const consultaActualizar = `
                UPDATE usuarios
                SET \`contraseña\` = ?
                WHERE Id_usuario = ?
            `;
            return db.query(consultaActualizar, [
                nuevoHash,
                idUsuario
            ]);
        })
        .then((resultado) => {

            if (!resultado) return;

            res.status(200).json({
                mensaje: "Contraseña actualizada correctamente"
            });
        })
        .catch((error) => {
            console.error("Error al cambiar la contraseña:", error);
            res.status(500).json({
                mensaje: "Error al cambiar la contraseña"
            });
        });
});

// DELETE - Eliminar cuenta
router.delete("/eliminar-cuenta", (req, res) => {
    const idUsuario = req.user.Id_usuario;
    const { contrasenaActual } = req.body;

    if (!contrasenaActual) {
        return res.status(400).json({
            mensaje: "Ingresá tu contraseña actual"
        });
    }

    // 1. Buscar contraseña del usuario
    const consultaUsuario = `
        SELECT \`contraseña\`
        FROM usuarios
        WHERE Id_usuario = ?
    `;

    db.query(consultaUsuario, [idUsuario])
        .then(([resultados]) => {

            if (resultados.length === 0) {
                res.status(404).json({
                    mensaje: "No se encontró el usuario"
                });
                return null;
            }

            // 2. Verificar contraseña
            return verificarPass(
                contrasenaActual,
                resultados[0].contraseña
            );
        })
        .then((coincide) => {

            if (coincide === null) return;

            if (!coincide) {
                res.status(400).json({
                    mensaje: "La contraseña es incorrecta"
                });
                return;
            }

            // 3. Eliminar propuestas propias y recibidas
            return db.query(
                `DELETE FROM propuestas
                 WHERE id_usuario = ?
                    OR publicacion_intercambio IN (
                        SELECT Id_publicacion_intercambio
                        FROM publicaciones_intercambio pi
                        INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
                        WHERE p.Id_usuario = ?
                    )`,
                [idUsuario, idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 4. Eliminar categorías aceptadas
            return db.query(
                `DELETE ca
                 FROM categorias_aceptadas ca
                 INNER JOIN publicaciones_intercambio pi
                    ON ca.id_publicacion_intercambio = pi.Id_publicacion_intercambio
                 INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
                 WHERE p.Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 5. Eliminar publicaciones de intercambio
            return db.query(
                `DELETE pi
                 FROM publicaciones_intercambio pi
                 INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
                 WHERE p.Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 6. Eliminar relaciones entre prendas y outfits
            return db.query(
                `DELETE po
                 FROM prendas_outfits po
                 LEFT JOIN prendas p ON po.id_prenda = p.id_prenda
                 LEFT JOIN outfits o ON po.id_outfit = o.id_outfit
                 WHERE p.Id_usuario = ?
                    OR o.Id_usuario = ?`,
                [idUsuario, idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 7. Eliminar estilos de outfits
            return db.query(
                `DELETE oe
                 FROM outfit_estilo oe
                 INNER JOIN outfits o ON oe.id_outfit = o.id_outfit
                 WHERE o.Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 8. Eliminar outfits
            return db.query(
                `DELETE FROM outfits
                 WHERE Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 9. Eliminar relaciones entre prendas y estilos
            return db.query(
                `DELETE ps
                 FROM prendas_estilos ps
                 INNER JOIN prendas p ON ps.id_prenda = p.id_prenda
                 WHERE p.Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 10. Eliminar elementos del carrito de sus publicaciones
            // y de todos sus pedidos
            return db.query(
                `DELETE ci
                 FROM carrito_items ci
                 LEFT JOIN publicaciones_compra pc
                    ON ci.id_publicacion_compra = pc.id_publicacion_compra
                 LEFT JOIN prendas p ON pc.id_prenda = p.id_prenda
                 LEFT JOIN pedidos pe ON ci.Id_pedido = pe.Id_pedido
                 WHERE p.Id_usuario = ?
                    OR pe.id_comprador = ?
                    OR pe.id_vendedor = ?`,
                [idUsuario, idUsuario, idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 11. Eliminar pedidos donde participó
            return db.query(
                `DELETE FROM pedidos
                 WHERE id_comprador = ?
                    OR id_vendedor = ?`,
                [idUsuario, idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 12. Eliminar publicaciones de compra
            return db.query(
                `DELETE pc
                 FROM publicaciones_compra pc
                 INNER JOIN prendas p ON pc.id_prenda = p.id_prenda
                 WHERE p.Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 13. Eliminar prendas
            return db.query(
                `DELETE FROM prendas
                 WHERE Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 14. Eliminar notificaciones
            return db.query(
                `DELETE FROM \`notificaciónes\`
                 WHERE Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 15. Eliminar respuestas del test
            return db.query(
                `DELETE FROM opciones_usuarios
                 WHERE Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            // 16. Eliminar usuario
            return db.query(
                `DELETE FROM usuarios
                 WHERE Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then((resultado) => {

            if (!resultado) return;

            res.status(200).json({
                mensaje: "La cuenta y todos sus datos fueron eliminados correctamente"
            });
        })
        .catch((error) => {
            console.error("Error al eliminar cuenta:", error);

            res.status(500).json({
                mensaje: "Error al eliminar la cuenta"
            });
        });
});

module.exports = router;
