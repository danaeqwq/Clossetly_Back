const db = require("../config/db");
let revisando = false;

const revisarBloqueosVencidos = async () => {
    if (revisando) return;

    revisando = true;

    let conexion;

    try {
        conexion = await db.getConnection();
        await conexion.beginTransaction();

        // Buscar usuarios con bloqueos vencidos
        const [usuarios] = await conexion.query(`
            SELECT DISTINCT id_usuario
            FROM sanciones
            WHERE tipo_sancion = 'Bloqueo'
              AND estado_sancion = 'Activa'
              AND fecha_fin <= NOW()
        `);

        for (const usuario of usuarios) {
            const idUsuario = usuario.id_usuario;

            // Finalizar los bloqueos vencidos
            await conexion.query(`
                UPDATE sanciones
                SET estado_sancion = 'Finalizada'
                WHERE id_usuario = ?
                  AND tipo_sancion = 'Bloqueo'
                  AND estado_sancion = 'Activa'
                  AND fecha_fin <= NOW()
            `, [idUsuario]);

            // Comprobar si todavía tiene otro bloqueo vigente
            const [bloqueos] = await conexion.query(`
                SELECT COUNT(*) AS total
                FROM sanciones
                WHERE id_usuario = ?
                  AND tipo_sancion = 'Bloqueo'
                  AND estado_sancion = 'Activa'
                  AND fecha_fin > NOW()
            `, [idUsuario]);

            // Desbloquear solamente si no tiene otro bloqueo vigente
            if (Number(bloqueos[0].total) === 0) {
                await conexion.query(`
                    UPDATE usuarios
                    SET estado_usuario = 1
                    WHERE Id_usuario = ?
                      AND estado_usuario = 3
                      AND rol = 'Usuario'
                `, [idUsuario]);
            }
        }

        await conexion.commit();

        if (usuarios.length > 0) {
            console.log(
                `Se revisaron ${usuarios.length} usuario(s) con bloqueos vencidos.`
            );
        }

    } catch (error) {
        if (conexion) await conexion.rollback();

        console.error("Error al revisar bloqueos vencidos:", error);

    } finally {
        if (conexion) conexion.release();
        revisando = false;
    }
};

const iniciarDesbloqueoAutomatico = () => {
    console.log("Sistema de desbloqueo automático iniciado.");

    // Revisar inmediatamente al iniciar el backend
    revisarBloqueosVencidos();

    // Volver a revisar cada 60 segundos
    setInterval(revisarBloqueosVencidos, 60 * 1000);
};

module.exports = iniciarDesbloqueoAutomatico;
