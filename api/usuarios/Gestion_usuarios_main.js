const router = require("express").Router();
const db = require("../../config/db");

// ==========================================
// OBTENER TODOS LOS USUARIOS Y SU RESUMEN
// ==========================================
router.get("/", async (req, res) => {
    try {
        const [usuarios] = await db.query(`
            SELECT
                u.Id_usuario AS id,
                u.nombre,
                u.correo,
                u.rol,
                u.fecha_registro AS fecha,
                u.foto_perfil,
                eu.Estado AS estado
            FROM usuarios u
            LEFT JOIN estado_usuario eu
                ON CAST(u.estado_usuario AS UNSIGNED) = eu.id_estado_usuario
            WHERE u.rol = 'Usuario'
            ORDER BY u.Id_usuario DESC
        `);

        const [resumen] = await db.query(`
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(eu.Estado = 'Activo'), 0) AS activos,
                COALESCE(SUM(eu.Estado = 'Bloqueado'), 0) AS bloqueados,
                COALESCE(SUM(eu.Estado = 'Expulsado'), 0) AS expulsados
            FROM usuarios u
            LEFT JOIN estado_usuario eu
                ON CAST(u.estado_usuario AS UNSIGNED) = eu.id_estado_usuario
            WHERE u.rol = 'Usuario'
        `);

        res.json({
            usuarios,
            resumen: resumen[0]
        });

    } catch (error) {
        console.error("Error al obtener los usuarios:", error);
        res.status(500).json({
            mensaje: "Error al obtener los usuarios"
        });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const [usuarios] = await db.query(`
            SELECT
                u.Id_usuario AS id,
                u.nombre,
                u.correo,
                u.\`teléfono\` AS telefono,
                u.\`descripción\` AS descripcion,
                u.fecha_registro AS fecha,
                u.foto_perfil,
                eu.Estado AS estado
            FROM usuarios u
            LEFT JOIN estado_usuario eu
                ON CAST(u.estado_usuario AS UNSIGNED) = eu.id_estado_usuario
            WHERE u.Id_usuario = ?
              AND u.rol = 'Usuario'
        `, [id]);

        if (usuarios.length === 0) {
            return res.status(404).json({
                mensaje: "Usuario no encontrado"
            });
        }

        const [sanciones] = await db.query(`
            SELECT
                tipo_sancion,
                motivo,
                fecha_inicio,
                fecha_fin,
                estado_sancion
            FROM sanciones
            WHERE id_usuario = ?
            ORDER BY fecha_inicio DESC
        `, [id]);

        res.json({
            usuario: usuarios[0],
            sanciones
        });

    } catch (error) {
        console.error("Error al obtener el detalle del usuario:", error);
        res.status(500).json({
            mensaje: "Error al obtener el detalle del usuario"
        });
    }
});
router.post("/:id/bloquear", async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo, duracion } = req.body;

        const idUsuario = Number(id);
        const dias = Number(duracion);
        const duracionesPermitidas = [3, 7, 14, 30];

        // Validar duración
        if (!duracionesPermitidas.includes(dias)) {
            return res.status(400).json({
                mensaje: "La duración del bloqueo no es válida."
            });
        }

        // Validar motivo
        if (!motivo || !motivo.trim()) {
            return res.status(400).json({
                mensaje: "Debés ingresar el motivo del bloqueo."
            });
        }

        // Comprobar que el usuario exista
        const [usuarios] = await db.query(`
            SELECT Id_usuario, estado_usuario
            FROM usuarios
            WHERE Id_usuario = ?
              AND rol = 'Usuario'
        `, [idUsuario]);

        if (usuarios.length === 0) {
            return res.status(404).json({
                mensaje: "Usuario no encontrado."
            });
        }

        // Evitar bloquear nuevamente a un usuario ya bloqueado
        if (Number(usuarios[0].estado_usuario) === 3) {
            return res.status(409).json({
                mensaje: "Este usuario ya se encuentra bloqueado."
            });
        }

        // Registrar sanción con fecha de finalización automática
        await db.query(`
            INSERT INTO sanciones (
                id_usuario,
                tipo_sancion,
                motivo,
                fecha_inicio,
                fecha_fin,
                estado_sancion
            )
            VALUES (
                ?,
                'Bloqueo',
                ?,
                NOW(),
                DATE_ADD(NOW(), INTERVAL ? DAY),
                'Activa'
            )
        `, [idUsuario, motivo.trim(), dias]);

        // Actualizar estado del usuario a Bloqueado (ID 3)
        await db.query(`
            UPDATE usuarios
            SET estado_usuario = 3
            WHERE Id_usuario = ?
        `, [idUsuario]);

        res.status(201).json({
            mensaje: "Usuario bloqueado correctamente.",
            duracion: dias
        });

    } catch (error) {
        console.error("Error al bloquear usuario:", error);

        res.status(500).json({
            mensaje: "Error al bloquear al usuario."
        });
    }
});
// ==========================================
// EXPULSAR USUARIO PERMANENTEMENTE
// ==========================================

// ==========================================
// ELIMINAR USUARIO DEFINITIVAMENTE
// ==========================================


router.delete("/:id/expulsar", async (req, res) => {
    let conexion;

    try {
        const idUsuario = Number(req.params.id);
        const { motivo } = req.body;

        // Validar ID
        if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
            return res.status(400).json({
                mensaje: "ID de usuario inválido."
            });
        }

        // Validar motivo
        if (!motivo || !motivo.trim()) {
            return res.status(400).json({
                mensaje: "Debés ingresar el motivo de la expulsión."
            });
        }

        conexion = await db.getConnection();
        await conexion.beginTransaction();

        // 1. Verificar que el usuario exista
        const [usuarios] = await conexion.query(`
            SELECT Id_usuario
            FROM usuarios
            WHERE Id_usuario = ?
              AND rol = 'Usuario'
        `, [idUsuario]);

        if (usuarios.length === 0) {
            await conexion.rollback();

            return res.status(404).json({
                mensaje: "Usuario no encontrado."
            });
        }

        // 2. Registrar la expulsión
        await conexion.query(`
            INSERT INTO sanciones (
                Id_usuario,
                tipo_sancion,
                motivo,
                fecha_inicio,
                fecha_fin,
                estado_sancion
            )
            VALUES (?, 'Expulsión', ?, NOW(), NOW(), 'Permanente')
        `, [idUsuario, motivo.trim()]);

        // 3. Obtener todos los pedidos relacionados con el usuario
        const [pedidos] = await conexion.query(`
            SELECT DISTINCT pe.Id_pedido
            FROM pedidos pe
            LEFT JOIN carrito_items ci
                ON ci.Id_pedido = pe.Id_pedido
            LEFT JOIN publicaciones_compra pc
                ON pc.id_publicacion_compra = ci.id_publicacion_compra
            LEFT JOIN prendas pr
                ON pr.id_prenda = pc.id_prenda
            WHERE pe.id_comprador = ?
               OR pr.Id_usuario = ?
        `, [idUsuario, idUsuario]);

        // 4. Eliminar los artículos y pedidos encontrados
        if (pedidos.length > 0) {
            const idsPedidos = pedidos.map(p => p.Id_pedido);
            const placeholders = idsPedidos.map(() => "?").join(",");

            await conexion.query(`
                DELETE FROM carrito_items
                WHERE Id_pedido IN (${placeholders})
            `, idsPedidos);

            await conexion.query(`
                DELETE FROM pedidos
                WHERE Id_pedido IN (${placeholders})
            `, idsPedidos);
        }

        // 5. Eliminar propuestas del usuario
        // y propuestas realizadas sobre sus publicaciones
        await conexion.query(`
            DELETE FROM propuestas
            WHERE id_usuario = ?
               OR publicacion_intercambio IN (
                    SELECT pi.Id_publicacion_intercambio
                    FROM publicaciones_intercambio pi
                    INNER JOIN prendas pr
                        ON pr.id_prenda = pi.id_prenda
                    WHERE pr.Id_usuario = ?
               )
        `, [idUsuario, idUsuario]);

        // 6. Eliminar categorías aceptadas de sus publicaciones
        await conexion.query(`
            DELETE ca
            FROM categorias_aceptadas ca
            INNER JOIN publicaciones_intercambio pi
                ON pi.Id_publicacion_intercambio = ca.id_publicacion_intercambio
            INNER JOIN prendas pr
                ON pr.id_prenda = pi.id_prenda
            WHERE pr.Id_usuario = ?
        `, [idUsuario]);

        // 7. Eliminar publicaciones de intercambio
        await conexion.query(`
            DELETE pi
            FROM publicaciones_intercambio pi
            INNER JOIN prendas pr
                ON pr.id_prenda = pi.id_prenda
            WHERE pr.Id_usuario = ?
        `, [idUsuario]);

        // 8. Eliminar publicaciones de compra
        await conexion.query(`
            DELETE pc
            FROM publicaciones_compra pc
            INNER JOIN prendas pr
                ON pr.id_prenda = pc.id_prenda
            WHERE pr.Id_usuario = ?
        `, [idUsuario]);

        // 9. Eliminar relaciones entre prendas y outfits
        await conexion.query(`
            DELETE po
            FROM prendas_outfits po
            LEFT JOIN prendas pr
                ON pr.id_prenda = po.id_prenda
            LEFT JOIN outfits o
                ON o.id_outfit = po.id_outfit
            WHERE pr.Id_usuario = ?
               OR o.Id_usuario = ?
        `, [idUsuario, idUsuario]);

        // 10. Eliminar relaciones de estilos de outfits
        await conexion.query(`
            DELETE oe
            FROM outfit_estilo oe
            INNER JOIN outfits o
                ON o.id_outfit = oe.id_outfit
            WHERE o.Id_usuario = ?
        `, [idUsuario]);

        // 11. Eliminar relaciones de estilos de prendas
        await conexion.query(`
            DELETE pe
            FROM prendas_estilos pe
            INNER JOIN prendas pr
                ON pr.id_prenda = pe.id_prenda
            WHERE pr.Id_usuario = ?
        `, [idUsuario]);

        // 12. Eliminar outfits
        await conexion.query(`
            DELETE FROM outfits
            WHERE Id_usuario = ?
        `, [idUsuario]);

        // 13. Eliminar prendas
        await conexion.query(`
            DELETE FROM prendas
            WHERE Id_usuario = ?
        `, [idUsuario]);

        // 14. Eliminar notificaciones
        await conexion.query(`
            DELETE FROM \`notificaciónes\`
            WHERE Id_usuario = ?
        `, [idUsuario]);

        // 15. Eliminar opciones del test
        await conexion.query(`
            DELETE FROM opciones_usuarios
            WHERE Id_usuario = ?
        `, [idUsuario]);

        // 16. Desvincular todas las sanciones del usuario
        // Se conserva el historial, pero la cuenta ya no existe.
        await conexion.query(`
            UPDATE sanciones
            SET Id_usuario = NULL
            WHERE Id_usuario = ?
        `, [idUsuario]);

        // 17. Eliminar cuenta definitivamente
        await conexion.query(`
            DELETE FROM usuarios
            WHERE Id_usuario = ?
        `, [idUsuario]);

        // Confirmar todos los cambios
        await conexion.commit();

        res.status(200).json({
            mensaje: "Usuario expulsado y todos sus datos eliminados permanentemente. El historial de sanciones fue conservado."
        });

    } catch (error) {
        if (conexion) {
            await conexion.rollback();
        }

        console.error("Error al eliminar usuario:", error);

        res.status(500).json({
            mensaje: "Error al eliminar al usuario."
        });

    } finally {
        if (conexion) {
            conexion.release();
        }
    }
});

module.exports = router;